"""Atributos das passadeiras pelo OpenStreetMap (ADR-0019), sem rede: uma resposta do Overpass inventada."""

import pandas as pd
import pytest

from riasense import config, osm

CW = "urn:ngsi-ld:SmartCrosswalk:{}"
# Perto de Aveiro: 0,0001° de latitude ≈ 11 m; 0,0001° de longitude ≈ 8,4 m.
LAT, LON = 40.6360, -8.6466


def _no(id_, dlat, dlon, **tags):
    return {"type": "node", "id": id_, "lat": LAT + dlat, "lon": LON + dlon, "tags": tags}


def _via(id_, pontos, **tags):
    return {"type": "way", "id": id_, "geometry": [{"lat": LAT + a, "lon": LON + b} for a, b in pontos], "tags": tags}


ELEMENTOS = [
    _no(1, 0, 0, highway="crossing", crossing="traffic_signals"),
    _no(2, 0.001, 0, highway="crossing", crossing="uncontrolled"),
    _no(3, 0.002, 0, highway="crossing", button_operated="yes", **{"crossing:signals": "yes"}),
    _no(4, 0.0005, 0, railway="crossing", crossing="yes"),  # passagem de nível: não é passadeira
    # A A está num cruzamento: a residencial e a secundária passam no mesmo nó, e fica a secundária.
    _via(10, [(0, -0.001), (0, 0.001)], highway="residential", name="Rua A", lanes="1"),
    _via(11, [(-0.001, 0), (0.003, 0)], highway="secondary", name="Avenida B", maxspeed="50", lanes="2;3", lit="yes"),
    _via(12, [(0, 0), (0.0001, 0.0001)], highway="footway"),  # caminho pedonal: não é via com trânsito
    _no(20, 0, 0.002, highway="bus_stop"),
    {"type": "way", "id": 30, "center": {"lat": LAT - 0.001, "lon": LON}, "tags": {"amenity": "school"}},
]


@pytest.fixture
def passadeiras():
    return pd.DataFrame({"id": [CW.format(c) for c in "ABCD"],
                         "lon": [LON + 0.00002, LON, LON, LON + 0.01],
                         "lat": [LAT, LAT + 0.001, LAT + 0.002, LAT]})


@pytest.fixture
def res(passadeiras):
    return osm.atributos(ELEMENTOS, passadeiras, raio_max_m=25, fonte="teste").set_index("id")


def test_emparelha_com_a_travessia_mais_proxima_e_mede_em_metros(res):
    assert res.loc[CW.format("A"), "osm_passadeira"] == 1
    assert res.loc[CW.format("A"), "distancia_m"] == pytest.approx(1.7, abs=0.2)
    assert res.loc[CW.format("B"), "osm_passadeira"] == 2


def test_semaforo_com_crossing_traffic_signals_ou_crossing_signals(res):
    assert res["semaforo"].iloc[:3].tolist() == [True, False, True] and pd.isna(res["semaforo"].iloc[3])
    assert res.loc[CW.format("A"), "tipo_passadeira"] == "traffic_signals"
    c = res.loc[CW.format("C")]  # só `crossing:signals=yes`, como a SC0021: também conta
    assert (c["crossing_signals"], c["button_operated"]) == ("yes", "yes")


def test_tem_semaforo():
    assert osm.tem_semaforo({"crossing": "traffic_signals"}) and osm.tem_semaforo({"crossing:signals": "yes"})
    assert not osm.tem_semaforo({"crossing": "uncontrolled", "crossing:signals": "no"})


def test_a_mais_de_25_m_a_passadeira_fica_sem_atributos(res):
    d = res.loc[CW.format("D")]
    assert d["distancia_m"] > 25
    assert pd.isna(d["osm_passadeira"]) and pd.isna(d["via_classe"]) and pd.isna(d["dist_escola_m"])


def test_via_mais_proxima_e_no_empate_a_de_classe_mais_importante(res):
    a = res.loc[CW.format("A")]
    assert (a["osm_via"], a["via_classe"], a["via_nome"], a["maxspeed"], a["lit"]) == (11, "secondary", "Avenida B", "50", "yes")
    assert pd.isna(a["faixas"])  # «2;3» não é um número: fica nulo


def test_distancia_a_escola_e_a_paragem(res):
    a = res.loc[CW.format("A")]
    assert a["dist_escola_m"] == pytest.approx(111, abs=2)
    assert a["dist_paragem_m"] == pytest.approx(169, abs=3)


def test_fonte_e_licenca_em_cada_linha(res):
    assert (res["licenca"] == osm.LICENCA).all() and "OpenStreetMap" in osm.LICENCA
    assert list(res.reset_index().columns) == osm.COLUNAS


def test_consulta_cobre_as_passadeiras_com_margem(passadeiras):
    o = config.carregar()["fontes_externas"]["osm"]
    q = osm.consulta(passadeiras, o)
    sul, oeste, norte, leste = map(float, osm.caixa(passadeiras, o["margem_graus"]).split(","))
    assert sul < passadeiras.lat.min() and norte > passadeiras.lat.max()
    assert oeste < passadeiras.lon.min() and leste > passadeiras.lon.max()
    assert '"crossing"' in q and "school" in q and "bus_stop" in q


def test_parquet_versionado_tem_as_24_passadeiras_e_a_licenca():
    caminho = config.RAIZ / "data" / "processed" / "passadeiras_osm.parquet"
    if not caminho.is_file():
        pytest.skip("`riasense osm` por correr")
    import duckdb

    df = duckdb.sql(f"select * from read_parquet('{caminho}')").df()
    assert len(df) == 24 and list(df.columns) == osm.COLUNAS
    assert df["licenca"].str.contains("OpenStreetMap").all() and df["fonte"].str.contains("Câmara").all()
