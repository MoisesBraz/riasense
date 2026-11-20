"""Meteorologia (ADR-0009): série do Open-Meteo e comparação da ④ com e sem chuva e temperatura."""

from urllib.parse import parse_qs, urlparse

import duckdb
import numpy as np
import pandas as pd
import pytest

from riasense import config, meteo, proteger


@pytest.fixture
def cfg():
    return config.carregar()


RESPOSTA = {"hourly": {"time": ["2026-11-09T10:00", "2026-11-09T11:00"], "precipitation": [4.2, None],
                       "temperature_2m": [14.1, 14.5]}}


def test_pedido_usa_as_coordenadas_e_a_janela_do_config_em_gmt(cfg):
    q = parse_qs(urlparse(meteo.pedido(cfg)).query)
    m = cfg["fontes_externas"]["meteo"]
    assert (q["latitude"], q["longitude"]) == ([str(m["latitude"])], [str(m["longitude"])])
    assert (q["start_date"], q["end_date"], q["timezone"]) == (["2026-11-03"], ["2026-11-10"], ["GMT"])
    assert q["hourly"] == ["precipitation,temperature_2m"]


def test_serie_horaria_com_nomes_da_riasense_e_valor_em_falta_como_nan():
    df = meteo.serie(RESPOSTA, ["precipitation", "temperature_2m"])
    assert list(df.columns) == ["t", "chuva_mm", "temperatura_c"]
    assert df["chuva_mm"].iloc[0] == 4.2 and np.isnan(df["chuva_mm"].iloc[1])
    assert str(df["t"].iloc[1]) == "2026-11-09 11:00:00"


def test_resposta_sem_a_variavel_pedida_e_recusada():
    with pytest.raises(ValueError, match="temperature_2m"):
        meteo.serie({"hourly": {"time": [], "precipitation": []}}, ["precipitation", "temperature_2m"])


def test_cada_intervalo_de_15_min_recebe_a_meteorologia_da_sua_hora():
    iv = pd.DataFrame({"t": pd.to_datetime(["2026-11-09 10:00", "2026-11-09 10:45", "2026-11-09 11:15"])})
    m = pd.DataFrame({"t": pd.to_datetime(["2026-11-09 10:00", "2026-11-09 11:00"]), "chuva_mm": [4.2, 0.0],
                      "temperatura_c": [14.1, 14.5]})
    assert proteger.juntar_meteo(iv, m)["chuva_mm"].tolist() == [4.2, 4.2, 0.0]


def test_meteorologia_que_nao_cobre_os_intervalos_e_um_erro():
    iv = pd.DataFrame({"t": pd.to_datetime(["2026-11-11 10:00"])})
    m = pd.DataFrame({"t": pd.to_datetime(["2026-11-09 10:00"]), "chuva_mm": [1.0], "temperatura_c": [14.0]})
    with pytest.raises(ValueError, match="não cobre"):
        proteger.juntar_meteo(iv, m)


def test_r2_ajustado_sobe_com_um_controlo_que_explica_e_nao_com_ruido():
    rng = np.random.default_rng(12)
    chuva, ruido = rng.exponential(1, 500), rng.normal(0, 1, 500)
    x = rng.poisson(5, 500).astype(float)
    y = 9 - 0.05 * x - 0.6 * chuva + rng.normal(0, 0.3, 500)
    base = proteger.r2_ajustado(y, x[:, None])
    assert proteger.r2_ajustado(y, np.column_stack([x, chuva])) > base + 0.3
    assert proteger.r2_ajustado(y, np.column_stack([x, ruido])) < base + 0.01


def test_comparacao_tem_uma_linha_por_passadeira_com_e_sem(cfg):
    rng = np.random.default_rng(7)
    n = 672
    i = np.arange(n)
    hora = (i // 4) % 24
    iv = pd.DataFrame({
        "passadeira": "urn:ngsi-ld:SmartCrosswalk:0001", "travessias": rng.poisson(4, n), "veiculos": rng.poisson(60, n),
        "placebo": "urn:ngsi-ld:SmartCrosswalk:0002", "travessias_placebo": rng.poisson(4, n),
        "pct_acima_limite": rng.uniform(0, 40, n), "hora": hora, "fim_de_semana": (i // 96) % 7 >= 5,
        "chuva_mm": rng.exponential(1, n), "temperatura_c": rng.normal(15, 2, n),
    })
    iv["vel_media_ms"] = 9 - 0.03 * iv["travessias"] - 0.5 * iv["chuva_mm"] + rng.normal(0, 0.3, n)
    comp = proteger.comparar_meteo(iv, cfg["proteger"])
    assert list(comp["id"]) == ["urn:ngsi-ld:SmartCrosswalk:0001"]
    assert comp["r2aj_com"].iloc[0] > comp["r2aj_sem"].iloc[0]
    assert {"efeito_kmh_sem", "efeito_kmh_com", "abranda_sem", "abranda_com", "assinalada_sem", "assinalada_com"} <= set(comp)


def test_usar_meteo_sem_a_serie_da_erro_com_o_comando_a_correr(cfg, tmp_path):
    p = cfg["proteger"] | {"usar_meteo": True}
    with pytest.raises(FileNotFoundError, match="riasense meteo"):
        proteger._com_meteo(None, pd.DataFrame(), tmp_path, tmp_path, p)


@pytest.mark.skipif(not (config.RAIZ / "data" / "processed" / "meteo.parquet").exists(), reason="sem data/processed/ nesta cópia: ver «Os dados desta cópia» no README")
def test_serie_versionada_cobre_a_janela_comum_sem_falhas(cfg):
    """A demo corre offline sobre a cópia em data/processed/meteo.parquet (sem rede)."""
    df = duckdb.read_parquet(str(config.RAIZ / "data" / "processed" / "meteo.parquet")).df()  # sem pyarrow
    inicio, fim = (pd.Timestamp(cfg["periodo_dados"][k]) for k in ("inicio", "fim"))
    horas = pd.date_range(inicio.floor("h"), fim.floor("h") - pd.Timedelta(hours=1), freq="h")
    assert set(horas) <= set(df["t"])
    assert not df[["chuva_mm", "temperatura_c"]].isna().any().any()
