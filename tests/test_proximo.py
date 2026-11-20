"""Onde pôr o próximo sensor (ADR-0015): ranking, redução potencial estimada e «verificar o sensor»."""

import os
from pathlib import Path

import duckdb
import numpy as np
import pandas as pd
import pytest

from riasense import config, proximo
from riasense.__main__ import main

CW = "urn:ngsi-ld:SmartCrosswalk:00{:02d}"
JANELAS = (["2026-11-04", "2026-11-06"], ["2026-11-07", "2026-11-09"])
SEM_NOTA = float("inf")  # sem a nota de subida


@pytest.fixture
def cfg():
    return config.carregar()


def _posicoes(n: int, tipo: str = "passadeira") -> pd.DataFrame:
    return pd.DataFrame({"tipo": tipo, "x": [100.0 * i for i in range(n)], "y": 0.0},
                        index=[CW.format(i + 1) for i in range(n)])


def test_queda_e_relativa_ao_tipo_e_desconta_a_chuva_e_o_fim_de_semana():
    horas = pd.date_range("2026-11-03 15:00", "2026-11-10 11:00", freq="h", inclusive="left")
    serie = pd.DataFrame({s: 10.0 for s in "abc"}, index=horas)
    depois = horas >= "2026-11-07"
    serie.loc[depois, ["a", "b"]] = 6.0  # chuva e fim de semana: todos descem 40%…
    serie.loc[depois, "c"] = 1.2  # …e o c desce muito mais: degradou-se
    q = proximo.queda_relativa(serie, ["2026-11-04", "2026-11-06"], ["2026-11-07", "2026-11-09"])
    assert q["a"] == pytest.approx(0.0) and q["b"] == pytest.approx(0.0)
    assert q["c"] == pytest.approx(0.8)  # 1 − (0,12 ÷ 0,6)


def test_media_diaria_so_usa_dias_completos():
    horas = pd.date_range("2026-11-03 15:00", "2026-11-05 00:00", freq="h", inclusive="left")
    serie = pd.DataFrame({"a": 1.0}, index=horas)  # 03/11 tem só 9 h: não conta
    assert proximo.media_diaria(serie, ["2026-11-03", "2026-11-04"])["a"] == pytest.approx(24.0)


def test_ranking_pelo_erro_com_reducao_potencial_e_degradados_a_parte():
    erro = pd.Series([0.30, 0.70, 0.50, 5.80], index=[CW.format(i) for i in (1, 2, 3, 4)], name="erro")
    queda = pd.Series([0.0, 0.1, 0.2, 0.9], index=erro.index, name="queda_diaria")
    t = proximo.ranking_tipo(erro, queda, 0.40, _posicoes(4), "passadeira", queda_max=0.5, subida_min=SEM_NOTA, janelas=JANELAS)
    ranking = t[t["motivo"] == proximo.RANKING].sort_values("ordem")
    assert list(ranking["id"]) == [CW.format(2), CW.format(3), CW.format(1)]
    assert list(ranking["reducao_potencial"].round(2)) == [0.30, 0.10, 0.0]
    [deg] = t[t["motivo"] == proximo.VERIFICAR].itertuples()
    assert deg.id == CW.format(4) and pd.isna(deg.ordem) and np.isnan(deg.reducao_potencial)


def test_frases_dizem_que_a_reducao_e_potencial_e_uma_hipotese():
    erro = pd.Series([0.7, 0.2, 0.6], index=[CW.format(i) for i in (1, 2, 3)], name="erro")
    queda = pd.Series([0.0, 0.0, 0.9], index=erro.index, name="queda_diaria")
    t = proximo.ranking_tipo(erro, queda, 0.36, _posicoes(3), "passadeira", 0.5, SEM_NOTA, JANELAS).set_index("id")
    alto, baixo, deg = t.loc[CW.format(1), "frase"], t.loc[CW.format(2), "frase"], t.loc[CW.format(3), "frase"]
    assert "erro 0,70 contra 0,36" in alto and "100 m" in alto and "Redução potencial estimada: 0,34" in alto
    assert "hipótese" in alto and "Sem redução potencial estimada" in baixo
    assert "Verificar o sensor" in deg and "90%" in deg and "avariado" not in deg
    assert not any("redução de erro" in f.lower() for f in t["frase"])


def test_frase_das_zonas_so_refere_a_distancia_se_o_vizinho_estiver_longe():
    # Zonas em x = 0, 100, 600: as 2 primeiras têm o vizinho a 100 m; a 3.ª está a 500 m, acima da mediana.
    posicoes = pd.DataFrame({"tipo": "zona", "x": [0.0, 100.0, 600.0], "y": 0.0}, index=[CW.format(i) for i in (1, 2, 3)])
    erro = pd.Series([0.50, 0.45, 0.44], index=posicoes.index, name="erro")
    t = proximo.ranking_tipo(erro, pd.Series(0.0, index=erro.index, name="queda_diaria"), 0.28, posicoes, "zona", 0.5, SEM_NOTA, JANELAS)
    frases = t.set_index("id")["frase"]
    assert "o erro sobe com a distância" in frases[CW.format(3)]
    assert "o erro sobe com a distância" not in frases[CW.format(1)]


def test_atividade_a_subir_leva_nota_e_nao_muda_a_ordem():
    erro = pd.Series([0.70, 0.60, 0.30], index=[CW.format(i) for i in (1, 2, 3)], name="erro")
    queda = pd.Series([-1.7, 0.0, -0.5], index=erro.index, name="queda_diaria")  # razão 2,7, 1,0 e 1,5
    com = proximo.ranking_tipo(erro, queda, 0.36, _posicoes(3), "passadeira", 0.5, 2.0, JANELAS).set_index("id")
    sem = proximo.ranking_tipo(erro, queda, 0.36, _posicoes(3), "passadeira", 0.5, SEM_NOTA, JANELAS).set_index("id")
    assert "subiu 2,7 vezes" in com.loc[CW.format(1), "frase"] and "mudança do próprio sensor" in com.loc[CW.format(1), "frase"]
    assert "subiu" not in com.loc[CW.format(3), "frase"]  # 1,5 < 2
    pd.testing.assert_series_equal(com["ordem"], sem["ordem"])
    assert list(com["motivo"]) == list(sem["motivo"])


def test_mediana_por_tipo_vem_da_avaliacao_da_completar():
    av = pd.DataFrame({"cenario": ["deixar_um_de_fora", "deixar_um_de_fora", "simulacao"],
                       "modelo": ["razao", "referencia", "razao"], "dias": "todos",
                       "tipo": "passadeira", "erro_mediano": [0.36, 0.62, 0.40]})
    assert proximo.medianas(av) == {"passadeira": 0.36}


def test_comando_sem_a_avaliacao_da_completar_sai_com_1(tmp_path, monkeypatch, capsys):
    monkeypatch.setenv("RIASENSE_DATA_PROCESSED", str(tmp_path))
    assert main(["proximo"]) == 1
    assert "riasense completar" in capsys.readouterr().err


@pytest.mark.integration
def test_dados_reais_ranking_reprodutivel_e_sc0023_a_verificar(tmp_path, cfg):
    interim = Path(os.environ.get("RIASENSE_DATA_INTERIM") or config.RAIZ / "data" / "interim")
    if not (interim / "passadeiras.parquet").is_file():
        pytest.skip("`riasense ingerir` por correr")
    processed = config.RAIZ / "data" / "processed"
    for f in ("sensores.parquet", "avaliacao_completar.parquet"):
        (tmp_path / f).write_bytes((processed / f).read_bytes())
    a = proximo.calcular(interim, tmp_path, cfg)
    b = proximo.calcular(interim, tmp_path, cfg)
    pd.testing.assert_frame_equal(a, b)  # determinístico
    verificar = set(a.loc[a["motivo"] == proximo.VERIFICAR, "id"])
    assert "urn:ngsi-ld:SmartCrosswalk:0023" in verificar
    demo = {f"urn:ngsi-ld:{p}" for p in cfg["demo"]["passadeiras"]}
    assert not demo & set(a["id"])  # em falha: não entram
    assert set(a["tipo"]) == {"passadeira", "zona"}
    assert (a.loc[a["motivo"] == proximo.RANKING, "reducao_potencial"] >= 0).all()
    assert duckdb.read_parquet(str(tmp_path / "proximo_sensor.parquet")).df().shape[0] == len(a)


def test_periodo_das_frases_vem_das_datas_do_config():
    assert proximo.periodo(["2026-11-07", "2026-11-09"]) == "07 a 09/11"
    assert proximo.periodo(["2026-10-30", "2026-11-02"]) == "30/10 a 02/11"


def test_frases_usam_as_janelas_dadas_e_nao_datas_fixas():
    erro = pd.Series([0.7, 0.6], index=[CW.format(i) for i in (1, 2)], name="erro")
    queda = pd.Series([-1.7, 0.9], index=erro.index, name="queda_diaria")
    outras = (["2027-03-01", "2027-03-03"], ["2027-03-04", "2027-03-06"])
    t = proximo.ranking_tipo(erro, queda, 0.36, _posicoes(2), "passadeira", 0.5, 2.0, outras).set_index("id")
    assert "entre 04 e 06/03" in t.loc[CW.format(1), "frase"]
    assert "de 04 a 06/03" in t.loc[CW.format(2), "frase"] and "face a 01 a 03/03" in t.loc[CW.format(2), "frase"]
    assert not any("/11" in f for f in t["frase"])
