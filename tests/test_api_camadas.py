"""Endpoints das camadas, sobre Parquet de amostra numa pasta temporária."""

import json
import shutil

import duckdb
import pytest
from fastapi.testclient import TestClient

from app import app
from riasense import config

cliente = TestClient(app)
CW19, CW20 = "urn:ngsi-ld:SmartCrosswalk:0019", "urn:ngsi-ld:SmartCrosswalk:0020"

# Uma consulta SQL por tabela de amostra: duas passadeiras, horas diferentes, um NaN.
AMOSTRAS = {
    "sensores": f"select * from (values ('{CW19}', 'passadeira', 1.0, 2.0), ('urn:ngsi-ld:TouristZone:0001', 'zona', 3.0, 4.0)) t(id, tipo, x, y)",
    "falhas": f"""select * from (values ('{CW19}', timestamp '2026-11-04 20:06', timestamp '2026-11-10 11:00', 'rede'),
                                       ('{CW20}', timestamp '2026-11-05 08:00', timestamp '2026-11-05 11:00', 'dispositivo'))
                  t(sensor, inicio, fim, tipo)""",
    "sensores_virtuais": f"""select * from (values ('{CW19}', timestamp '2026-11-05 10:00', 12.5, 8.0, 17.0),
                                                  ('{CW19}', timestamp '2026-11-05 11:00', 'nan'::double, 0.0, 1.0),
                                                  ('{CW20}', timestamp '2026-11-05 10:00', 3.0, 1.0, 5.0))
                             t(id, t, estimativa, inf, sup)""",
    "proteger_passadeiras": f"select * from (values ('{CW19}', -0.22, true), ('{CW20}', -0.21, false)) t(id, efeito_kmh, abranda)",
    "luminosidade": """select * from (values (timestamp '2026-11-05 07:00', -0.9, 'crepusculo'),
                                             (timestamp '2026-11-05 12:00', 33.5, 'dia'),
                                             (timestamp '2026-11-05 20:00', -28.0, 'noite')) t(t, elevacao_graus, luminosidade)""",
    "segmentos_hora": """select * from (values ('urn:ngsi-ld:RoadSegment:10010', timestamp '2026-11-05 08:00', 'Camera', 120, 6.5, 50.0, 6, [18.0, 22.5, 24.0, 26.1, 30.2, 51.3]),
                                               ('urn:ngsi-ld:RoadSegment:10010', timestamp '2026-11-05 09:00', 'Camera', 90, 7.0, 50.0, 0, [20.0, 25.0, 27.0, 29.0]),
                                               ('urn:ngsi-ld:RoadSegment:20001', timestamp '2026-11-05 08:00', 'Radar', 40, 9.1, 30.0, 15, [24.0, 36.5]))
                          t(id, t, sensor, veiculos, vel_media_ms, limite_kmh, acima_limite, velocidades_kmh)""",
    "avenida_lugares_hora": """select * from (values ('urn:ngsi-ld:ParkingSpot:0326', timestamp '2026-11-04 10:00', 'ocupado'),
                                                     ('urn:ngsi-ld:ParkingSpot:0327', timestamp '2026-11-04 10:00', 'livre'),
                                                     ('urn:ngsi-ld:ParkingSpot:0326', timestamp '2026-11-05 10:00', 'desconhecido'))
                                t(lugar, t, estado)""",
    "avenida_deslocamentos": """select * from (values ('urn:ngsi-ld:RoadSegment:11168', 1.0, 2.5), ('urn:ngsi-ld:RoadSegment:11168', 0.0, 2.0),
                                                      ('urn:ngsi-ld:RoadSegment:10084', 0.0, -7.1))
                                 t(segmento, d, desloc_m)""",


    "zonas_hora": """select * from (values ('urn:ngsi-ld:TouristZone:0006', timestamp '2026-11-05 08:00', 40),
                                           ('urn:ngsi-ld:TouristZone:0007', timestamp '2026-11-05 08:00', 75),
                                           ('urn:ngsi-ld:TouristZone:0006', timestamp '2026-11-05 09:00', 12)) t(id, t, visitas)""",
    "proteger_intervalos": f"""select * from (values ('{CW19}', timestamp '2026-11-05 10:00', 4, 30),
                                                    ('{CW19}', timestamp '2026-11-05 10:15', 6, 28)) t(passadeira, t, travessias, veiculos)""",
}


@pytest.fixture(autouse=True)
def resultados(tmp_path, monkeypatch):
    """Config e pasta de resultados de amostra; `previsoes` e `risco_potencial` ficam por calcular."""
    shutil.copy(config.CAMINHO_PADRAO, tmp_path / "riasense.yaml")
    pasta = tmp_path / "processed"
    pasta.mkdir()
    for nome, sql in AMOSTRAS.items():
        duckdb.sql(sql).write_parquet(str(pasta / f"{nome}.parquet"))
    monkeypatch.setenv("RIASENSE_CONFIG", str(tmp_path / "riasense.yaml"))
    monkeypatch.setenv("RIASENSE_DATA_PROCESSED", str(pasta))


def _dados(url: str, **params) -> list[dict]:
    r = cliente.get(url, params=params)
    assert r.status_code == 200, r.text
    return r.json()["dados"]


def test_sensores_filtra_por_tipo():
    assert [s["id"] for s in _dados("/sensores", tipo="zona")] == ["urn:ngsi-ld:TouristZone:0001"]


def test_filtro_de_sensor_aceita_a_forma_curta_e_o_urn():
    curta = _dados("/proteger/passadeiras", sensor="SmartCrosswalk:0020")
    assert curta == _dados("/proteger/passadeiras", sensor=CW20) == [{"id": CW20, "efeito_kmh": -0.21, "abranda": False}]


def test_falhas_entram_quando_o_periodo_se_sobrepoe_ao_pedido():
    falhas = _dados("/vigiar/falhas", desde="2026-11-05T09:00", ate="2026-11-05T09:30")
    assert sorted(f["sensor"] for f in falhas) == [CW19, CW20]
    assert _dados("/vigiar/falhas", desde="2026-11-05T12:00") == [_dados("/vigiar/falhas", sensor="SmartCrosswalk:0019")[0]]


def test_sensores_virtuais_por_sensor_e_hora_com_datas_iso_e_nan_como_null():
    linhas = _dados("/completar/sensores-virtuais", sensor="SmartCrosswalk:0019", desde="2026-11-05T10:30")
    assert linhas == [{"id": CW19, "t": "2026-11-05T11:00:00", "estimativa": None, "inf": 0.0, "sup": 1.0}]


def test_hora_com_fuso_e_convertida_para_utc():
    # 10:00+01:00 = 09:00 UTC: o intervalo das 10:00 UTC fica depois de `ate`.
    assert _dados("/proteger/intervalos", ate="2026-11-05T10:00:00+01:00") == []
    assert len(_dados("/proteger/intervalos", ate="2026-11-05T10:00:00Z")) == 1


def test_paginacao_com_limite_e_deslocamento():
    r = cliente.get("/proteger/intervalos", params={"limite": 1, "deslocamento": 1}).json()
    assert r["n"] == 1 and r["dados"][0]["t"] == "2026-11-05T10:15:00"


def test_carros_de_uma_hora_sao_as_passagens_medidas_de_cada_segmento():
    linhas = _dados("/mapa/carros", desde="2026-11-05T08:00", ate="2026-11-05T08:00")
    assert [(d["id"][-5:], d["sensor"], d["veiculos"]) for d in linhas] == [("10010", "Camera", 120), ("20001", "Radar", 40)]


def test_carros_levam_o_limite_as_passagens_acima_dele_e_a_mediana_de_cada_grupo():
    [radar] = [d for d in _dados("/mapa/carros", desde="2026-11-05T08:00", ate="2026-11-05T08:00") if d["sensor"] == "Radar"]
    assert (radar["limite_kmh"], radar["acima_limite"], radar["velocidades_kmh"]) == (30.0, 15, [24.0, 36.5])


def test_luminosidade_por_hora_filtra_por_tempo():
    r = cliente.get("/contexto/luminosidade", params={"desde": "2026-11-05T12:00", "ate": "2026-11-05T20:00"})
    assert r.status_code == 200
    assert [(d["t"], d["luminosidade"]) for d in r.json()["dados"]] == [("2026-11-05T12:00:00", "dia"), ("2026-11-05T20:00:00", "noite")]


@pytest.mark.parametrize("url", ["/prever/previsoes", "/proteger/risco-potencial"])
def test_camada_ainda_por_calcular_responde_503_com_o_passo(url):
    r = cliente.get(url)
    assert r.status_code == 503 and r.json()["estado"] == "por calcular" and "riasense" in r.json()["motivo"]


POLIGONO = {"type": "Polygon", "coordinates": [[[-8.6465, 40.6359], [-8.6464, 40.6359], [-8.6464, 40.6360], [-8.6465, 40.6360], [-8.6465, 40.6359]]]}
PASSADEIRA = {"type": "Feature", "id": CW19, "properties": {"id": CW19, "crosswalk": "urn:ngsi-ld:Crosswalk:0019", "nome": "Avenida 25 de Abril", "rsu": "urn:ngsi-ld:RoadSideUnit:0030"}, "geometry": POLIGONO}


def test_mapa_passadeiras_serve_os_poligonos_do_ficheiro_sem_mexer_neles(tmp_path):
    (tmp_path / "processed" / "passadeiras.geojson").write_text(json.dumps({"type": "FeatureCollection", "features": [PASSADEIRA]}), encoding="utf-8")
    r = cliente.get("/mapa/passadeiras")
    assert r.status_code == 200
    assert r.json() == {"dados": [PASSADEIRA], "n": 1, "limite": 1, "deslocamento": 0}


def test_mapa_passadeiras_sem_o_ficheiro_responde_503_com_o_passo():
    r = cliente.get("/mapa/passadeiras")
    assert r.status_code == 503 and r.json()["estado"] == "por calcular"
    assert "passadeiras.geojson" in r.json()["motivo"] and "riasense sensores" in r.json()["motivo"]


@pytest.mark.parametrize("params", [
    {"sensor": "SC0019"},
    {"sensor": "SmartCrosswalk:0019' or 1=1 --"},
    {"desde": "ontem"},
    {"limite": 0},
    {"limite": 10_001},
    {"desde": "2026-11-06T00:00", "ate": "2026-11-05T00:00"},
])
def test_entradas_invalidas_dao_422(params):
    assert cliente.get("/completar/sensores-virtuais", params=params).status_code == 422


def test_tipo_de_sensor_desconhecido_da_422():
    assert cliente.get("/sensores", params={"tipo": "camara"}).status_code == 422


def test_docs_estao_disponiveis():
    assert cliente.get("/docs").status_code == 200


def test_avenida_serve_cada_camada_tal_qual_e_sem_ficheiro_responde_503_com_o_passo(tmp_path):
    estrada = {"type": "FeatureCollection", "features": [{"type": "Feature", "properties": {"origem": "medida"}, "geometry": POLIGONO}]}
    (tmp_path / "processed" / "avenida_estrada.geojson").write_text(json.dumps(estrada), encoding="utf-8")
    assert cliente.get("/mapa/avenida/estrada").json() == estrada
    r = cliente.get("/mapa/avenida/faixas")
    assert r.status_code == 503 and r.json()["estado"] == "por calcular" and "riasense avenida" in r.json()["motivo"]
    assert cliente.get("/mapa/avenida/predios").status_code == 422


def test_avenida_lugares_de_uma_hora_dao_o_estado_de_cada_lugar():
    linhas = _dados("/mapa/avenida/lugares-hora", desde="2026-11-04T10:00", ate="2026-11-04T10:00")
    assert [(d["lugar"][-4:], d["estado"]) for d in linhas] == [("0326", "ocupado"), ("0327", "livre")]


def test_avenida_deslocamentos_vem_por_segmento_de_passo_em_passo_desde_o_inicio(tmp_path):
    r = cliente.get("/mapa/avenida/deslocamentos")
    assert r.status_code == 200
    assert r.json() == {"urn:ngsi-ld:RoadSegment:10084": {"passo": None, "desloc_m": [-7.1]},
                        "urn:ngsi-ld:RoadSegment:11168": {"passo": 1.0, "desloc_m": [2.0, 2.5]}}
    (tmp_path / "processed" / "avenida_deslocamentos.parquet").unlink()
    assert cliente.get("/mapa/avenida/deslocamentos").status_code == 503


def test_edificios_medidos_devolve_o_geojson_e_sem_ficheiro_fica_por_calcular(tmp_path, monkeypatch):
    """ADR-0050: os edifícios da zona com a altura do LiDAR; sem o ficheiro, «por calcular» (503), como as outras camadas."""
    pasta = tmp_path / "processed"
    assert cliente.get("/mapa/edificios-medidos").status_code == 503
    fc = {"type": "FeatureCollection", "features": [{"type": "Feature", "properties": {"id": 1, "altura_m": 11.6, "origem": "medida (LiDAR DGT 2024)"},
                                                     "geometry": {"type": "Polygon", "coordinates": [[[0, 0], [0, 1], [1, 1], [0, 0]]]}}]}
    (pasta / "edificios_alturas.geojson").write_text(json.dumps(fc), encoding="utf-8")
    r = cliente.get("/mapa/edificios-medidos")
    assert r.status_code == 200 and r.json()["features"][0]["properties"]["altura_m"] == 11.6


def test_zonas_de_uma_hora_sao_as_visitas_medidas_de_cada_zona():
    linhas = _dados("/mapa/zonas-hora", desde="2026-11-05T08:00", ate="2026-11-05T08:00")
    assert [(d["id"][-4:], d["visitas"]) for d in linhas] == [("0006", 40), ("0007", 75)]


def test_maximos_do_calor_por_tipo_incluem_os_estimados_da_2(tmp_path):
    # proteger_intervalos: 4 + 6 = 10 travessias às 10h; os estimados da ② só nos segmentos com câmara ou radar
    duckdb.sql(f"""select * from (values ('{CW19}', 'travessias', timestamp '2026-11-05 12:00', 25.0, true),
                                         ('urn:ngsi-ld:TouristZone:0006', 'visitas', timestamp '2026-11-05 12:00', 30.0, true),
                                         ('urn:ngsi-ld:RoadSegment:10010', 'veiculos', timestamp '2026-11-05 12:00', 100.0, true),
                                         ('urn:ngsi-ld:RoadSegment:99999', 'veiculos', timestamp '2026-11-05 12:00', 900.0, true))
                   t(id, grandeza, t, estimativa, estimado)""").write_parquet(str(tmp_path / "processed" / "sensores_virtuais.parquet"))
    r = cliente.get("/mapa/calor/maximos")
    assert r.status_code == 200, r.text
    m = r.json()
    assert (m["passadeiras"]["medido"], m["passadeiras"]["estimado"], m["passadeiras"]["maximo"]) == (10, 25, 25)
    assert (m["zonas"]["medido"], m["zonas"]["maximo"]) == (75, 75)
    assert (m["segmentos"]["medido"], m["segmentos"]["estimado"], m["segmentos"]["maximo"]) == (120, 100, 120)
    (tmp_path / "processed" / "zonas_hora.parquet").unlink()
    r = cliente.get("/mapa/calor/maximos")
    assert r.status_code == 503 and "riasense zonas" in r.json()["motivo"]
