"""① com e sem meteorologia (ADR-0009): fator de chuva, esperado ajustado e o critério do README."""

import os
from pathlib import Path

import duckdb
import numpy as np
import pandas as pd
import pytest

from riasense import config, ids, vigiar

ORIGEM = pd.Timestamp("2026-11-03")
DIAS = 7


@pytest.fixture
def cfg():
    return config.carregar()


def _grelha(por_sensor: dict[str, np.ndarray]) -> vigiar.Grelha:
    return vigiar.Grelha(ORIGEM, DIAS, np.zeros((DIAS, 24), dtype=bool), por_sensor)


def _meteo(chuvosas: list[str]) -> pd.DataFrame:
    horas = pd.date_range(ORIGEM, periods=DIAS * 24, freq="h")
    return pd.DataFrame({"t": horas, "chuva_mm": [2.0 if str(h) in chuvosas else 0.0 for h in horas], "temperatura_c": 15.0})


def test_matriz_de_chuva_marca_as_horas_acima_do_limiar():
    m = vigiar.matriz_chuva(_meteo(["2026-11-05 10:00:00"]), _grelha({}), chuva_min_mm=0.5)
    assert m.sum() == 1 and m[2, 10]


def test_fator_de_chuva_e_a_razao_entre_eventos_com_chuva_e_o_esperado_seco():
    matriz = np.full((DIAS, 24), 20.0)
    matriz[2, 10:14] = 10.0  # com chuva, metade da atividade
    chuva = np.zeros((DIAS, 24), dtype=bool)
    chuva[2, 10:14] = True
    sem_silencios = pd.DataFrame(columns=["sensor", "inicio", "fim"])
    fatores = vigiar.fatores_chuva(_grelha({"a": matriz}), chuva, sem_silencios, {"a": "passadeira"}, limiar=10)
    assert fatores == {"passadeira": pytest.approx(0.5)}


def test_esperado_mais_baixo_com_chuva_tira_horas_inesperadas():
    matriz = np.full((DIAS, 24), 12.0)
    g = _grelha({"a": matriz})
    inicio, fim = pd.Timestamp("2026-11-05 10:00"), pd.Timestamp("2026-11-05 13:00")
    mult = np.ones((DIAS, 24))
    mult[2, 10:13] = 0.5  # 12 × 0,5 = 6 < 10: a hora passa a sossego normal
    assert vigiar.avaliar(matriz, g, inicio, fim, 10)[0] == pytest.approx(3)
    assert vigiar.avaliar(matriz, g, inicio, fim, 10, mult)[0] == pytest.approx(0)


def _comp(linhas: list[tuple], cfg) -> pd.DataFrame:
    demo = [ids.urn(p) for p in cfg["demo"]["passadeiras"]]
    base = [(s, "rede", "rede", 0.2) for s in demo]
    df = pd.DataFrame(base + linhas, columns=["sensor", "tipo_sem", "tipo_com", "frac_chuva"])
    df["em_sem"], df["em_com"] = df["tipo_sem"].notna(), df["tipo_com"].notna()
    return df


def test_sem_mudancas_a_meteorologia_nao_entra(cfg):
    assert vigiar.meteo_melhora(_comp([("x", "dispositivo", "dispositivo", 0.9)], cfg), cfg) == {
        "rsu0030_rede": True, "muda": False, "saem_por_chuva": True, "nenhuma_nova_fora_da_chuva": True, "entra": False}


def test_entra_se_so_saem_falhas_de_horas_de_chuva(cfg):
    assert vigiar.meteo_melhora(_comp([("x", "dispositivo", None, 0.8)], cfg), cfg)["entra"]


def test_nao_entra_se_sai_uma_falha_sem_chuva_ou_aparece_outra_fora_da_chuva(cfg):
    assert not vigiar.meteo_melhora(_comp([("x", "dispositivo", None, 0.3)], cfg), cfg)["entra"]
    assert not vigiar.meteo_melhora(_comp([("y", None, "dispositivo", 0.0)], cfg), cfg)["entra"]


def test_nao_entra_se_a_falha_da_demo_deixa_de_ser_de_rede(cfg):
    comp = _comp([("x", "dispositivo", None, 0.9)], cfg)
    comp.loc[0, "tipo_com"] = "dispositivo"
    assert not vigiar.meteo_melhora(comp, cfg)["entra"]


def test_usar_meteo_sem_a_serie_da_erro_com_o_comando(tmp_path):
    with pytest.raises(FileNotFoundError, match="riasense meteo"):
        vigiar._meteo(duckdb.connect(), tmp_path, usar=True)
    assert vigiar._meteo(duckdb.connect(), tmp_path, usar=False) is None


@pytest.mark.integration
def test_dados_reais_meteorologia_nao_muda_as_falhas_e_fica_de_fora(tmp_path, cfg):
    interim = Path(os.environ.get("RIASENSE_DATA_INTERIM") or config.RAIZ / "data" / "interim")
    processed = config.RAIZ / "data" / "processed"
    if not (interim / "passadeiras.parquet").is_file():
        pytest.skip("`riasense ingerir` por correr")
    for f in ("sensores.parquet", "meteo.parquet"):
        (tmp_path / f).write_bytes((processed / f).read_bytes())
    vigiar.calcular(interim, tmp_path / "sensores.parquet", tmp_path, cfg)
    comp = duckdb.read_parquet(str(tmp_path / "meteo_vigiar.parquet")).df()
    decisao = vigiar.meteo_melhora(comp, cfg)
    assert decisao["rsu0030_rede"] and not decisao["muda"]
    assert decisao["entra"] is cfg["vigiar"]["usar_meteo"]
