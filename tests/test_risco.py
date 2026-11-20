"""Mapa de risco potencial (ADR-0013): componentes em percentil, renormalização e sensibilidade."""

import os
from pathlib import Path

import numpy as np
import pandas as pd
import pytest

from riasense import config, risco

CW = "urn:ngsi-ld:SmartCrosswalk:00{:02d}"
PESOS = {"exposicao": 0.4, "comportamento": 0.4, "previsao": 0.2}
HORAS = pd.date_range("2026-11-05 08:00", periods=4, freq="h")


@pytest.fixture
def cfg():
    return config.carregar()


def _grelha(n: int = 3) -> pd.DataFrame:
    return pd.MultiIndex.from_product([[CW.format(i) for i in range(1, n + 1)], HORAS], names=["id", "t"]).to_frame(index=False)


def _proteger(efeitos: list[float], semaforo: list[bool] | None = None) -> pd.DataFrame:
    return pd.DataFrame({"id": [CW.format(i) for i in range(1, len(efeitos) + 1)], "efeito_kmh": efeitos,
                         "assinalada": False, "semaforo": semaforo or [False] * len(efeitos),
                         "pct_acima_limite_movimentados": 20.0})


VAZIO = {"falhas": pd.DataFrame(columns=["sensor", "inicio", "fim"]),
         "virtuais": pd.DataFrame(columns=["id", "t", "estimativa"]),
         "previsoes": pd.DataFrame(columns=["id", "t", "previsao"])}


def _contagens(valores: dict[int, list[int]]) -> pd.DataFrame:
    return pd.DataFrame([(CW.format(i), t, n) for i, ns in valores.items() for t, n in zip(HORAS, ns)], columns=["id", "t", "n"])


def test_percentil_da_exposicao_e_global_e_nao_por_hora():
    # Às 8h todas têm poucas travessias; se o percentil fosse por hora, a maior das 8h teria percentil 1.
    cont = _contagens({1: [2, 50, 60, 70], 2: [1, 40, 45, 50], 3: [0, 30, 35, 40]})
    g = risco.montar(_grelha(), cont, VAZIO["falhas"], VAZIO["virtuais"], VAZIO["previsoes"], _proteger([-1, -0.5, 0]), PESOS, horizonte_h=1)
    as_8h = g[g["t"] == HORAS[0]]
    assert as_8h["exposicao_pct"].max() < 0.3


def test_comportamento_quanto_menos_abranda_maior_e_fixo_na_semana():
    g = risco.montar(_grelha(), _contagens({1: [5] * 4, 2: [5] * 4, 3: [5] * 4}), VAZIO["falhas"], VAZIO["virtuais"],
                     VAZIO["previsoes"], _proteger([-1.0, -0.5, 0.2]), PESOS, horizonte_h=1)
    por = g.groupby("id")["comportamento_pct"]
    assert (por.nunique() == 1).all()
    assert por.first().idxmax() == CW.format(3)  # efeito +0,2: não abranda


def test_sem_previsao_os_pesos_renormalizam_e_com_previsao_somam_os_tres():
    prev = pd.DataFrame({"id": [CW.format(1)], "t": [HORAS[2]], "previsao": [80.0]})  # previsão para as 10h
    g = risco.montar(_grelha(), _contagens({1: [5, 6, 7, 8], 2: [1, 2, 3, 4], 3: [0, 0, 1, 1]}), VAZIO["falhas"],
                     VAZIO["virtuais"], prev, _proteger([-1, -0.5, 0]), PESOS, horizonte_h=1)
    linha = g[(g["id"] == CW.format(1)) & (g["t"] == HORAS[1])].iloc[0]  # às 9h usa a previsão das 10h
    assert linha["previsao_disponivel"] and linha["previsao"] == 80.0
    esperado = 0.4 * linha["exposicao_pct"] + 0.4 * linha["comportamento_pct"] + 0.2 * linha["previsao_pct"]
    assert linha["risco_potencial"] == pytest.approx(esperado)
    outra = g[(g["id"] == CW.format(2)) & (g["t"] == HORAS[1])].iloc[0]
    assert not outra["previsao_disponivel"]
    assert outra["risco_potencial"] == pytest.approx(0.5 * outra["exposicao_pct"] + 0.5 * outra["comportamento_pct"])


def test_com_o_horizonte_de_3_h_na_hora_t_entra_a_previsao_para_t_mais_3():
    # ADR-0027, ponto 4: o risco potencial usa a previsão a 3 h, feita em t para t + 3 h.
    prev = pd.DataFrame({"id": [CW.format(1)], "t": [HORAS[3]], "previsao": [80.0]})  # previsão para as 11h
    g = risco.montar(_grelha(), _contagens({1: [5] * 4, 2: [5] * 4, 3: [5] * 4}), VAZIO["falhas"], VAZIO["virtuais"],
                     prev, _proteger([-1, -0.5, 0]), PESOS, horizonte_h=3).set_index(["id", "t"])
    assert g.loc[(CW.format(1), HORAS[0]), "previsao"] == 80.0  # às 8h entra a previsão das 11h
    assert not g.loc[(CW.format(1), HORAS[1]), "previsao_disponivel"]  # às 9h não há previsão para as 12h


def test_com_semaforo_o_comportamento_nao_se_aplica_e_o_percentil_e_so_entre_as_outras():
    # A 1 tem semáforo e é a que menos abranda: sem o ADR-0024 ficava com o percentil mais alto.
    g = risco.montar(_grelha(), _contagens({1: [5] * 4, 2: [5] * 4, 3: [5] * 4}), VAZIO["falhas"], VAZIO["virtuais"],
                     VAZIO["previsoes"], _proteger([0.5, -1.0, -0.5], [True, False, False]), PESOS, horizonte_h=1)
    comp = g.groupby("id")["comportamento_pct"].first()
    assert np.isnan(comp[CW.format(1)])
    assert comp[CW.format(3)] == 1.0 and comp[CW.format(2)] == 0.5
    um = g[g["id"] == CW.format(1)]
    assert um["semaforo"].all() and um["comportamento_kmh"].eq(0.5).all()  # o efeito continua a mostrar-se


def test_com_semaforo_os_pesos_renormalizam_para_exposicao_e_previsao():
    prev = pd.DataFrame({"id": [CW.format(1)], "t": [HORAS[2]], "previsao": [80.0]})
    g = risco.montar(_grelha(), _contagens({1: [5, 6, 7, 8], 2: [1, 2, 3, 4], 3: [0, 0, 1, 1]}), VAZIO["falhas"],
                     VAZIO["virtuais"], prev, _proteger([-1, -0.5, 0], [True, False, False]), PESOS, horizonte_h=1)
    um = g[g["id"] == CW.format(1)].set_index("t")
    com = um.loc[HORAS[1]]  # às 9h tem a previsão das 10h: 0,4 / 0,2 → 2/3 e 1/3
    assert com["risco_potencial"] == pytest.approx((0.4 * com["exposicao_pct"] + 0.2 * com["previsao_pct"]) / 0.6)
    sem = um.loc[HORAS[0]]  # sem previsão: só a exposição
    assert sem["risco_potencial"] == pytest.approx(sem["exposicao_pct"])


def test_na_falha_a_exposicao_e_o_sensor_virtual_marcado_estimado_ou_sem_dados():
    falhas = pd.DataFrame({"sensor": [CW.format(1), CW.format(2)], "inicio": [HORAS[1]] * 2, "fim": [HORAS[3]] * 2})
    virt = pd.DataFrame({"id": [CW.format(1)] * 2, "t": HORAS[1:3], "estimativa": [12.0, 14.0]})
    g = risco.montar(_grelha(), _contagens({1: [5, 0, 0, 5], 2: [5, 0, 0, 5], 3: [1] * 4}), falhas, virt,
                     VAZIO["previsoes"], _proteger([-1, -0.5, 0]), PESOS, horizonte_h=1).set_index(["id", "t"])
    assert g.loc[(CW.format(1), HORAS[1]), "exposicao"] == 12.0 and g.loc[(CW.format(1), HORAS[1]), "estimado"]
    assert g.loc[(CW.format(1), HORAS[0]), "confianca"] == "medido"
    assert g.loc[(CW.format(2), HORAS[1]), "confianca"] == "sem dados"
    assert np.isnan(g.loc[(CW.format(2), HORAS[1]), "risco_potencial"])  # sem dado não se inventa risco


def test_sensibilidade_com_a_ordem_base_da_spearman_1():
    g = risco.montar(_grelha(), _contagens({1: [50] * 4, 2: [20] * 4, 3: [1] * 4}), VAZIO["falhas"], VAZIO["virtuais"],
                     VAZIO["previsoes"], _proteger([0.0, -0.5, -1.0]), PESOS, horizonte_h=1)
    s = risco.sensibilidade(g, PESOS, 0.1, [0.3, 0.5])
    assert len(s) == 9 and (s["previsao"] >= 0).all()
    assert s.loc[(s["exposicao"] == 0.4) & (s["comportamento"] == 0.4), "spearman"].iloc[0] == pytest.approx(1.0)


@pytest.mark.integration
def test_dados_reais_24_passadeiras_por_hora_e_sensibilidade_alta(tmp_path, cfg):
    interim = Path(os.environ.get("RIASENSE_DATA_INTERIM") or config.RAIZ / "data" / "interim")
    if not (interim / "passadeiras.parquet").is_file():
        pytest.skip("`riasense ingerir` por correr")
    processed = config.RAIZ / "data" / "processed"
    for nome in risco.FONTES:
        (tmp_path / f"{nome}.parquet").write_bytes((processed / f"{nome}.parquet").read_bytes())
    g, s = risco.calcular(interim, tmp_path, cfg)
    assert g["id"].nunique() == 24 and g["risco_potencial"].between(0, 1).all()
    demo = {f"urn:ngsi-ld:{p}" for p in cfg["demo"]["passadeiras"]}
    assert g.loc[g["id"].isin(demo) & (g["t"] >= "2026-11-05"), "estimado"].all()
    assert s["spearman"].min() > 0.9
