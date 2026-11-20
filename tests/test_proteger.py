"""Abrandamento junto às passadeiras (ADR-0006), com séries sintéticas de semente fixa."""

import os
from datetime import datetime, timedelta
from pathlib import Path

import duckdb
import numpy as np
import pandas as pd
import pytest

from riasense import config, ids, proteger
from riasense.__main__ import main


@pytest.fixture
def cfg():
    return config.carregar()


@pytest.fixture
def p(cfg):
    return cfg["proteger"]


def _intervalos(rng, passadeira: str, efeito_ms: float, travessias_media: float, n: int = 672) -> pd.DataFrame:
    """Uma semana de intervalos de 15 min: a velocidade depende da hora, do volume e (com `efeito_ms`) das travessias."""
    i = np.arange(n)
    hora = (i // 4) % 24
    dia = (hora >= 8) & (hora < 20)
    veiculos = rng.poisson(np.where(dia, 120, 30))
    travessias = rng.poisson(np.where(dia, 1.6, 0.4) * travessias_media)
    vel = 9 + np.where(dia, -1.0, 0.5) - 0.004 * veiculos + efeito_ms * travessias + rng.normal(0, 0.4, n)
    return pd.DataFrame({
        "passadeira": passadeira, "travessias": travessias, "placebo": "urn:ngsi-ld:SmartCrosswalk:9999",
        "travessias_placebo": rng.poisson(np.where(dia, 8, 2)), "veiculos": veiculos, "vel_media_ms": vel,
        "pct_acima_limite": np.clip(rng.normal(np.where(dia, 10, 30), 5), 0, 100), "hora": hora,
        "fim_de_semana": (i // 96) % 7 >= 5,
    })


def test_conversao_de_ms_por_travessia_para_kmh_por_10_travessias():
    assert proteger.em_kmh(-0.01, 10) == pytest.approx(-0.36)
    assert proteger.em_kmh(1 / 36, 10) == pytest.approx(1.0)


def test_ols_recupera_os_coeficientes_sem_ruido():
    rng = np.random.default_rng(1)
    X = rng.normal(size=(200, 2))
    b, ep = proteger.ols_hac(2 * X[:, 0] - 3 * X[:, 1] + 5, X, lags=4)
    assert b == pytest.approx([2, -3])
    assert ep == pytest.approx([0, 0], abs=1e-9)


def test_newey_west_alarga_o_erro_padrao_quando_os_residuos_se_parecem_entre_intervalos():
    rng = np.random.default_rng(2)
    x = np.repeat(rng.normal(size=100), 5)  # o regressor muda devagar, como as travessias de intervalo para intervalo
    erro = np.repeat(rng.normal(size=100), 5)  # e o erro também: intervalos seguidos parecem-se
    _, ep0 = proteger.ols_hac(x + erro, x[:, None], lags=0)
    _, ep4 = proteger.ols_hac(x + erro, x[:, None], lags=4)
    assert ep4[0] > 1.5 * ep0[0]


def test_controlos_tem_volume_uma_dummy_por_hora_menos_a_primeira_e_fim_de_semana():
    ctrl = proteger.controlos(np.array([10, 20, 30, 40]), np.array([8, 9, 9, 10]), np.array([False, False, True, True]))
    assert ctrl.tolist() == [[10, 0, 0, 0], [20, 1, 0, 0], [30, 1, 0, 1], [40, 0, 1, 1]]


def test_velocidade_que_desce_com_as_travessias_da_efeito_negativo_com_ic_abaixo_de_0(p):
    iv = _intervalos(np.random.default_rng(3), "A", efeito_ms=-0.03, travessias_media=10)
    linha = proteger.resumir_passadeira(iv, p)
    # -0,03 m/s por travessia = -1,08 km/h por +10 travessias.
    assert linha["efeito_kmh"] == pytest.approx(-1.08, abs=0.25)
    assert linha["ic_inf"] < linha["efeito_kmh"] < linha["ic_sup"] < 0


def test_placebo_de_uma_serie_independente_da_ic_que_contem_0(p):
    linha = proteger.resumir_passadeira(_intervalos(np.random.default_rng(4), "A", -0.03, 10), p)
    assert linha["placebo_ic_inf"] < 0 < linha["placebo_ic_sup"]


def test_assinalada_e_a_que_nao_abranda_apesar_de_muitas_travessias(p):
    rng = np.random.default_rng(5)
    iv = pd.concat([
        _intervalos(rng, "abranda", efeito_ms=-0.03, travessias_media=10),
        _intervalos(rng, "nao-abranda", efeito_ms=0.0, travessias_media=10),
        _intervalos(rng, "nao-abranda-poucos-peoes", efeito_ms=0.0, travessias_media=1),
    ])
    res = proteger.resumir(iv, p).set_index("id")
    assert res.abranda.to_dict() == {"abranda": True, "nao-abranda": False, "nao-abranda-poucos-peoes": False}
    assert res.assinalada[res.assinalada].index.tolist() == ["nao-abranda"]
    assert list(res.reset_index().columns) == proteger.COLUNAS_RESUMO


def test_com_semaforo_o_efeito_calcula_se_mas_nao_e_assinalada():
    res = pd.DataFrame({"id": ["s", "n", "x"], "efeito_kmh": [0.1, 0.1, -1.0], "assinalada": [True, True, False]})
    osm = pd.DataFrame({"id": ["s", "n"], "semaforo": pd.array([True, False], dtype="boolean")})
    out = proteger.aplicar_semaforo(res.reindex(columns=proteger.COLUNAS_RESUMO).fillna(res), osm).set_index("id")
    assert out["semaforo"].to_dict() == {"s": True, "n": False, "x": False}  # «x» sem atributos do OSM
    assert out["assinalada"].to_dict() == {"s": False, "n": True, "x": False}
    assert out["efeito_kmh"].to_dict() == {"s": 0.1, "n": 0.1, "x": -1.0}


def test_sem_passadeiras_osm_o_proteger_pede_o_riasense_osm(pastas, cfg):
    interim, processed = pastas
    (processed / "passadeiras_osm.parquet").unlink()
    with pytest.raises(FileNotFoundError, match="riasense osm"):
        proteger.calcular(interim, processed, processed, cfg)


def test_pct_acima_limite_separa_intervalos_movimentados_e_calmos():
    travessias = np.array([0, 0, 1, 2, 5, 9, 10, 12])
    pct = np.array([40, 30, 20, 20, 20, 10, 10, 10])
    mov, calmo = proteger.pct_acima_limite(travessias, pct, 0.75, 0.25)
    # Quartis (interpolação linear) 0,75 e 9,25: movimentados = {10, 12} → 10%, calmos = {0, 0} → 35%.
    assert (mov, calmo) == (pytest.approx(10), pytest.approx(35))


# --- Ponta a ponta, com Parquet pequenos no formato de data/interim e data/processed ---

CW = "urn:ngsi-ld:SmartCrosswalk:{}"
SEG = "urn:ngsi-ld:RoadSegment:{}"
INICIO = datetime(2026, 11, 4, 12, 0)


def _parquet(caminho: Path, df: pd.DataFrame) -> None:
    con = duckdb.connect()
    con.register("df", df)
    con.table("df").write_parquet(str(caminho))
    con.close()


FIM_DOS_DADOS = datetime(2026, 11, 5, 12, 0)


def _falhas(processed: Path, falhas: list[tuple[str, datetime, datetime]]) -> None:
    """`falhas.parquet` da ① só com as colunas que a ④ lê (mais o tipo); sem falhas, a tabela fica vazia."""
    df = pd.DataFrame({
        "sensor": pd.Series([CW.format(c) for c, _, _ in falhas], dtype="object"),
        "inicio": pd.Series([i for _, i, _ in falhas], dtype="datetime64[ns]"),
        "fim": pd.Series([f for _, _, f in falhas], dtype="datetime64[ns]"),
        "tipo": pd.Series(["rede"] * len(falhas), dtype="object"),
    })
    _parquet(processed / "falhas.parquet", df)


@pytest.fixture
def pastas(tmp_path):
    """3 passadeiras: A, B e C (C a 1 km). 24 h de veículos e travessias. B falha a partir das 20h06 (falhas.parquet)."""
    interim, processed = tmp_path / "interim", tmp_path / "processed"
    interim.mkdir()
    processed.mkdir()
    _parquet(processed / "sensores.parquet", pd.DataFrame({
        "id": [CW.format("A"), CW.format("B"), CW.format("C"), SEG.format(1)],
        "tipo": ["passadeira"] * 3 + ["segmento"],
        "rsu": ["urn:ngsi-ld:RoadSideUnit:0001"] * 3 + [None],
        "x": [0.0, 100.0, 1000.0, 0.0], "y": [0.0] * 4,
    }))
    _falhas(processed, [("B", datetime(2026, 11, 4, 20, 6), FIM_DOS_DADOS)])
    _parquet(processed / "passadeira_segmentos.parquet", pd.DataFrame({
        "passadeira": [CW.format(c) for c in "ABC"], "segmento": [SEG.format(i) for i in (1, 2, 3)], "distancia_m": [5.0] * 3,
    }))
    # C tem semáforo (ADR-0019); A sem atributos do OSM conta como sem semáforo.
    _parquet(processed / "passadeiras_osm.parquet", pd.DataFrame({
        "id": [CW.format(c) for c in "ABC"], "semaforo": pd.array([None, False, True], dtype="boolean"),
    }))
    rng = np.random.default_rng(6)
    veiculos, travessias = [], []
    for k in range(96):
        t = INICIO + timedelta(minutes=15 * k)
        n = 3 if k == 10 else 8  # o intervalo das 14h30 tem menos veículos do que o mínimo
        for seg in (1, 2, 3):
            veiculos += [(SEG.format(seg), t + timedelta(seconds=60 * j), float(rng.normal(10, 1)), 13.889, 5.0) for j in range(n)]
        for c in "ABC":
            travessias += [(CW.format(c), t + timedelta(seconds=30 * j)) for j in range(int(rng.integers(0, 6)))]
    _parquet(interim / "segmentos.parquet",
             pd.DataFrame(veiculos, columns=["id", "t", "vel_media_ms", "vel_limite_ms", "duracao_s"]))
    _parquet(interim / "passadeiras.parquet", pd.DataFrame(travessias, columns=["id", "t"]))
    return interim, processed


def test_calcular_escreve_uma_linha_por_passadeira_e_a_tabela_por_intervalo(pastas, cfg):
    interim, processed = pastas
    res = proteger.calcular(interim, processed, processed, cfg)
    assert res.id.tolist() == [CW.format(c) for c in "ABC"]
    lido = duckdb.sql("select * from read_parquet($f)", params={"f": str(processed / "proteger_passadeiras.parquet")}).df()
    assert list(lido.columns) == proteger.COLUNAS_PASSADEIRAS
    assert lido.set_index("id")["semaforo"].to_dict() == {CW.format("A"): False, CW.format("B"): False, CW.format("C"): True}
    iv = duckdb.sql("select * from read_parquet($f)", params={"f": str(processed / "proteger_intervalos.parquet")}).df()
    assert list(iv.columns) == proteger.COLUNAS_INTERVALOS


def test_placebo_e_a_passadeira_mais_distante(pastas, cfg):
    res = proteger.calcular(*pastas, pastas[1], cfg).set_index("id")
    assert res.placebo.to_dict() == {CW.format("A"): CW.format("C"), CW.format("B"): CW.format("C"), CW.format("C"): CW.format("A")}


def test_saem_os_intervalos_com_poucos_veiculos_e_os_da_falha_da_passadeira(pastas, cfg):
    interim, processed = pastas
    res = proteger.calcular(interim, processed, processed, cfg).set_index("id")
    # 96 intervalos menos o das 14h30 (3 veículos). B fica só até às 20h00: a falha começa às 20h06, dentro desse intervalo.
    assert res.n_intervalos[CW.format("A")] == 95
    assert res.n_intervalos[CW.format("B")] == 31


def test_uma_falha_que_acaba_so_tira_os_intervalos_que_toca_e_tambem_os_de_quem_a_tem_como_placebo(pastas, cfg):
    interim, processed = pastas
    # A falha das 16h00 às 17h10: toca os intervalos das 16h00 a 17h00 (5), e os das 17h15 em diante voltam.
    _falhas(processed, [("A", datetime(2026, 11, 4, 16, 0), datetime(2026, 11, 4, 17, 10))])
    res = proteger.calcular(interim, processed, processed, cfg).set_index("id")
    assert res.n_intervalos[CW.format("A")] == 95 - 5
    assert res.n_intervalos[CW.format("C")] == 95 - 5  # o placebo da C é a A: as duas regressões usam os mesmos intervalos
    assert res.n_intervalos[CW.format("B")] == 95  # o placebo da B é a C, que não falha
    iv = duckdb.sql("select * from read_parquet($f)", params={"f": str(processed / "proteger_intervalos.parquet")}).df()
    a = iv[iv.passadeira == CW.format("A")].t
    assert not a.between(datetime(2026, 11, 4, 16, 0), datetime(2026, 11, 4, 17, 0)).any()
    assert (a == datetime(2026, 11, 4, 17, 15)).sum() == 1


def test_sem_falhas_so_saem_os_intervalos_com_poucos_veiculos(pastas, cfg):
    interim, processed = pastas
    _falhas(processed, [])
    res = proteger.calcular(interim, processed, processed, cfg)
    assert res.n_intervalos.tolist() == [95, 95, 95]


def test_sem_a_falhas_parquet_pede_o_vigiar(pastas, cfg):
    interim, processed = pastas
    (processed / "falhas.parquet").unlink()
    with pytest.raises(FileNotFoundError, match="riasense vigiar"):
        proteger.calcular(interim, processed, processed, cfg)


def test_comando_proteger_sem_ingestao_sai_com_1(tmp_path, monkeypatch, capsys):
    monkeypatch.setenv("RIASENSE_DATA_INTERIM", str(tmp_path / "interim"))
    monkeypatch.setenv("RIASENSE_DATA_PROCESSED", str(tmp_path / "processed"))
    assert main(["proteger"]) == 1
    assert "riasense ingerir" in capsys.readouterr().err


@pytest.mark.integration
def test_dados_reais_as_24_passadeiras_tem_efeito_ic_e_placebo(tmp_path, cfg):
    interim = os.environ.get("RIASENSE_DATA_INTERIM")
    processed = Path(os.environ.get("RIASENSE_DATA_PROCESSED") or config.RAIZ / "data" / "processed")
    if not interim or not (Path(interim) / "segmentos.parquet").is_file() or not (processed / "sensores.parquet").is_file():
        pytest.skip("RIASENSE_DATA_INTERIM não definido ou `riasense ingerir`/`riasense sensores` por correr")
    if not (processed / "falhas.parquet").is_file():
        pytest.skip("`riasense vigiar` por correr")
    res = proteger.calcular(Path(interim), processed, tmp_path, cfg)
    assert len(res) == 24
    # A exclusão pela `falhas.parquet` não muda nada face à da RSU da demo: 19 de 24, e as 4 da falha ficam com 116 intervalos.
    assert res.abranda.sum() == 19
    assert res.set_index("id").n_intervalos[[ids.urn(c) for c in cfg["demo"]["passadeiras"]]].eq(116).all()
    colunas = ["efeito_kmh", "ic_inf", "ic_sup", "placebo_efeito_kmh", "placebo_ic_inf", "placebo_ic_sup"]
    assert np.isfinite(res[colunas].to_numpy()).all()
    assert ((res.ic_inf < res.efeito_kmh) & (res.efeito_kmh < res.ic_sup)).all()
    assert (res.placebo != res.id).all()
    # O placebo não reproduz o abrandamento: o IC contém 0 na grande maioria e quase nunca fica abaixo de 0.
    contem_0 = (res.placebo_ic_inf <= 0) & (res.placebo_ic_sup >= 0)
    assert contem_0.sum() >= 0.75 * len(res)
    assert (res.placebo_ic_sup < 0).sum() < res.abranda.sum() / 4
    # As sem abrandamento claro estão entre as da viabilidade (ideia, ④); a SC0011 fica no limite do IC (ver pipeline/README.md).
    # Todas têm semáforo (OSM, ADR-0019), por isso não se assinalam (ADR-0024): assinaladas, nenhuma.
    sem_abrandar = proteger.assinalar(res["ic_sup"], res["travessias_media"], cfg["proteger"]["quantil_assinalar"])
    assert {"0013", "0020", "0021"} <= set(res.id[sem_abrandar].str[-4:]) <= {"0011", "0013", "0020", "0021"}
    assert res.semaforo[sem_abrandar].all()
    assert set(res.id[res.semaforo].str[-4:]) == {"0011", "0012", "0013", "0020", "0021"}
    assert not res.assinalada.any()
    # Av. 25 de Abril (demo): 23–34% dos veículos acima do limite.
    demo = res[res.id.isin([ids.urn(c) for c in cfg["demo"]["passadeiras"]])]
    assert demo[["pct_acima_limite_movimentados", "pct_acima_limite_calmos"]].stack().between(20, 40).all()
