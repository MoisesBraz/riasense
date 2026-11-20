"""A avenida em 3D (ADR-0044): a via acerta-se pelas passadeiras medidas, com dados sintéticos pequenos.

Cenário, em metros (EPSG:3763) a partir de um ponto de Aveiro: uma rua de oeste para leste (segmentos 1 →, 2 ←) com o eixo
perto da berma sul, como os reais; a passadeira A (x = 50) tem os patamares com os bordos interiores a +9 e −1 m do eixo
(centro +4, largura 10), a B (x = 150) a +6 e −2 m (centro +2, largura 8). Uma 2.ª rua (segmentos 3 →, 4 ←), 300 m a norte,
com 2+2 faixas e 12 m (faixas de 3 m); uma 3.ª (segmentos 5 →, 6 ←), 600 m a norte, com 3+3 faixas e 13,7 m (2,3 m, como
a Av. de Oita). Dois lugares de estacionamento da RSU0099 junto à berma sul da 1.ª rua.
"""

import json

import duckdb
import pandas as pd
import pytest
from riasense import avenida, config, sensores

LON0, LAT0 = -8.65, 40.64
T0 = pd.Timestamp("2026-11-04 08:00")


@pytest.fixture
def cfg():
    c = config.carregar()
    c["avenida"] = {
        "faixa_estacionamento_m": 2.0, "passeio_m": 2.1, "largura_faixa_min_m": 2.5, "largura_faixa_max_m": 3.8,
        "raio_corredor_m": 30, "raio_juncao_m": 14, "folga_passadeira_m": 0.3, "folga_estacionamento_m": 3.0,
        "desvio_lugar_max_m": 2.0, "passo_m": 1.0, "rsu_estacionamento": ["RoadSideUnit:0099"], "passadeiras_fora": [],
        "cadeias": [
            {"nome": "Rua 1", "pares": [[1, 2, None]], "passadeiras": ["0001", "0002"], "estacionamento": True},
            {"nome": "Rua 2+2", "pares": [[3, 4, None]], "passadeiras": ["0003"]},
            {"nome": "Rua tipo Oita", "pares": [[5, 6, None]], "passadeiras": ["0005"]},
        ],
        "juncoes": [],
    }
    return c


@pytest.fixture(scope="module")
def origem():
    con = sensores.ligar()
    x, y = con.execute("select ST_X(g), ST_Y(g) from (select ST_Transform(ST_Point(?, ?), 'EPSG:4326', 'EPSG:3763') g)", [LON0, LAT0]).fetchall()[0]
    con.close()
    return x, y


def _geo(pts, origem, poligono=False) -> str:
    """Pontos em metros (relativos à origem, EPSG:3763) → GeoJSON em EPSG:4326."""
    con = sensores.ligar()
    x0, y0 = origem
    coords = [list(con.execute("select ST_X(g), ST_Y(g) from (select ST_Transform(ST_Point(?, ?), 'EPSG:3763', 'EPSG:4326') g)",
                               [x0 + x, y0 + y]).fetchall()[0]) for x, y in pts]
    con.close()
    if poligono:
        return json.dumps({"type": "Polygon", "coordinates": [coords + [coords[0]]]})
    return json.dumps({"type": "LineString", "coordinates": coords})


def _caixa(x0, x1, y0, y1):
    return [(x0, y0), (x1, y0), (x1, y1), (x0, y1)]


@pytest.fixture
def pastas(tmp_path, origem):
    refs = tmp_path / "brutos" / "reference-entities"
    refs.mkdir(parents=True)
    ruas = [(1, (0, 0), (200, 0), 1), (2, (200, 0), (0, 0), 1), (3, (0, 300), (200, 300), 2), (4, (200, 300), (0, 300), 2),
            (5, (0, 600), (200, 600), 3), (6, (200, 600), (0, 600), 3)]
    pd.DataFrame([{"entityId": f"urn:ngsi-ld:RoadSegment:{i}", "entityType": "RoadSegment", "totalLaneNumber": float(f),
                   "location": _geo([a, b], origem)} for i, a, b, f in ruas]).to_csv(refs / "RoadSegment.csv", index=False)
    # passadeiras: (id, x, bordo interior do patamar norte, bordo interior do patamar sul), patamares de 2 × 3 m
    passadeiras = [("0001", 50, 9, -1), ("0002", 150, 6, -2), ("0003", 100, 300 + 6, 300 - 6), ("0005", 100, 600 + 6.85, 600 - 6.85)]
    sc, cw, sw = [], [], []
    for i, x, n, s in passadeiras:
        cw.append({"entityId": f"urn:ngsi-ld:Crosswalk:{i}", "location": _geo(_caixa(x - 2, x + 2, s, n), origem, True)})
        sw += [{"entityId": f"urn:ngsi-ld:Sidewalk:{i}N", "location": _geo(_caixa(x - 1.5, x + 1.5, n, n + 2), origem, True)},
               {"entityId": f"urn:ngsi-ld:Sidewalk:{i}S", "location": _geo(_caixa(x - 1.5, x + 1.5, s - 2, s), origem, True)}]
        sc.append({"entityId": f"urn:ngsi-ld:SmartCrosswalk:{i}", "refCrosswalk": f"urn:ngsi-ld:Crosswalk:{i}",
                   "refSidewalks": json.dumps([f"urn:ngsi-ld:Sidewalk:{i}N", f"urn:ngsi-ld:Sidewalk:{i}S"])})
    pd.DataFrame(sc).to_csv(refs / "SmartCrosswalk.csv", index=False)
    pd.DataFrame(cw).to_csv(refs / "Crosswalk.csv", index=False)
    pd.DataFrame(sw).to_csv(refs / "Sidewalk.csv", index=False)
    # 2 lugares junto à berma sul (y ≈ 0 m, perto do eixo), no formato do smartparking.csv
    con = sensores.ligar()
    docs = []
    for lugar, x in (("0901", 100), ("0902", 110)):
        lon, lat = con.execute("select ST_X(g), ST_Y(g) from (select ST_Transform(ST_Point(?, ?), 'EPSG:3763', 'EPSG:4326') g)",
                               [origem[0] + x, origem[1] + 0.0]).fetchall()[0]
        doc = {"entityId": f"urn:ngsi-ld:ParkingSpot:{lugar}", "refDevice": "urn:ngsi-ld:RoadSideUnit:0099", "status": "free",
               "location": {"type": "Point", "coordinates": [{"$numberDouble": str(lon)}, {"$numberDouble": str(lat)}]}}
        docs.append({"_id": lugar, "entityId": doc["entityId"], "entityType": "ParkingSpot", "documentJson": json.dumps(doc)})
    con.close()
    pd.DataFrame(docs).to_csv(refs.parent / "smartparking.csv", index=False)
    # interim: o 0901 tem um evento às 08h10 (ocupado); o 0902 não tem nenhum
    interim = tmp_path / "interim"
    interim.mkdir()
    ev = pd.DataFrame([{"id": "urn:ngsi-ld:ParkingSpot:0901", "t": T0 + pd.Timedelta(minutes=10), "rsu": "urn:ngsi-ld:RoadSideUnit:0099",
                        "estado": "occupied", "duracao_s": 0.0}])
    duckdb.from_df(ev).write_parquet(str(interim / "estacionamento.parquet"))
    # ①: a RSU0099 em falha das 12h às 14h
    processed = tmp_path / "processed"
    processed.mkdir()
    falhas = pd.DataFrame([{"sensor": "urn:ngsi-ld:RoadSideUnit:0099", "tipo_sensor": "estacionamento",
                            "inicio": T0 + pd.Timedelta(hours=4), "fim": T0 + pd.Timedelta(hours=6), "tipo": "rede"}])
    duckdb.from_df(falhas).write_parquet(str(processed / "falhas.parquet"))
    return refs, interim, processed


def _desloc(destino, seg: int, d: float) -> float:
    x = duckdb.read_parquet(str(destino / "avenida_deslocamentos.parquet")).df()
    x = x[x.segmento == f"urn:ngsi-ld:RoadSegment:{seg}"]
    return float(x.loc[(x.d - d).abs().idxmin(), "desloc_m"])


def test_centro_e_largura_numa_passadeira_sao_o_meio_e_a_distancia_dos_patamares():
    eixo = avenida.Linha([(0, 0), (200, 0)])
    norte, sul = [(48.5, 9), (51.5, 9), (51.5, 11), (48.5, 11)], [(48.5, -3), (51.5, -3), (51.5, -1), (48.5, -1)]
    assert avenida.medir_passadeira(eixo, [norte, sul]) == pytest.approx((4.0, 10.0))
    assert avenida.medir_passadeira(eixo, [sul, norte]) == pytest.approx((4.0, 10.0))  # a ordem dos patamares não conta
    assert avenida.medir_passadeira(eixo, [norte, sul], centro_no_eixo=True) == pytest.approx((0.0, 10.0))


def test_entre_duas_passadeiras_o_valor_e_interpolado_e_fora_delas_mantem_se():
    f = avenida.perfil([50, 150], [4, 2], [10, 8])
    assert f(100) == pytest.approx((3.0, 9.0))
    assert f(0) == pytest.approx((4.0, 10.0)) and f(200) == pytest.approx((2.0, 8.0))


def test_calcular_mede_a_via_nas_passadeiras_e_interpola_os_deslocamentos(pastas, cfg):
    refs, interim, destino = pastas
    n = avenida.calcular(refs, interim, destino, cfg)
    assert n["avenida_lugares.geojson"] == 2
    est = {f["properties"]["nome"]: f["properties"] for f in
           json.loads((destino / "avenida_estrada.geojson").read_text(encoding="utf-8"))["features"]}
    assert est["Rua 1"]["largura_m"] == pytest.approx([10.0, 8.0], abs=0.05)
    assert est["Rua 1"]["origem"] == "interpolada"
    # A x = 50 (sem estacionamento ainda): bordos +9 e −1 → meio +4, sentido → a +1,5 m; sentido ← a +6,5 m (−6,5 no seu).
    assert _desloc(destino, 1, 50) == pytest.approx(1.5, abs=0.05)
    assert _desloc(destino, 2, 150) == pytest.approx(-6.5, abs=0.05)  # o mesmo ponto, medido no segmento 2 (←)
    # A x = 105, com a faixa de estacionamento de 2 m: centro +2,9 e largura 8,9 (interpolados) → bordos +7,35 e −1,55;
    # o tráfego começa em +0,45, o meio fica em +3,9 e o sentido → em (3,9 + 0,45) / 2.
    assert _desloc(destino, 1, 105) == pytest.approx((3.9 + 0.45) / 2, abs=0.05)


def test_lugar_sem_eventos_ou_com_a_rsu_em_falha_fica_desconhecido(pastas, cfg):
    refs, interim, destino = pastas
    avenida.calcular(refs, interim, destino, cfg)
    h = duckdb.read_parquet(str(destino / "avenida_lugares_hora.parquet")).df().set_index(["lugar", "t"])["estado"]
    l1, l2 = "urn:ngsi-ld:ParkingSpot:0901", "urn:ngsi-ld:ParkingSpot:0902"
    assert h[(l1, T0 - pd.Timedelta(hours=1))] == "desconhecido"  # ainda sem eventos
    assert h[(l1, T0)] == "ocupado"  # o evento das 08h10 é antes do meio da hora
    assert h[(l1, T0 + pd.Timedelta(hours=4))] == "desconhecido"  # a RSU em falha (①)
    assert h[(l1, T0 + pd.Timedelta(hours=7))] == "ocupado"  # a falha acabou e o último estado volta
    assert (h.loc[l2] == "desconhecido").all()  # nunca teve eventos
    assert set(h.unique()) <= {"ocupado", "livre", "desconhecido"}


def test_faixas_de_menos_de_2_5_m_ficam_sem_linhas_entre_faixas(pastas, cfg):
    refs, interim, destino = pastas
    avenida.calcular(refs, interim, destino, cfg)
    linhas = json.loads((destino / "avenida_faixas.geojson").read_text(encoding="utf-8"))["features"]
    entre = lambda nome: [f for f in linhas if f["properties"]["nome"] == nome and f["properties"]["tipo"] == "entre faixas"]
    assert len(entre("Rua 2+2")) == 2  # 12 m ÷ 4 = 3 m: uma linha entre as 2 faixas de cada sentido
    assert entre("Rua tipo Oita") == []  # 13,7 m ÷ 6 ≈ 2,3 m < 2,5 m
    assert any(f["properties"]["nome"] == "Rua tipo Oita" and f["properties"]["tipo"] == "meio" for f in linhas)


def test_lugar_longe_da_faixa_fica_onde_foi_medido(pastas, cfg):
    refs, interim, destino = pastas
    cfg["avenida"]["desvio_lugar_max_m"] = 0.1  # obriga os 2 lugares a ficar «por confirmar»
    avenida.calcular(refs, interim, destino, cfg)
    lug = json.loads((destino / "avenida_lugares.geojson").read_text(encoding="utf-8"))["features"]
    assert all(f["properties"]["posicao"].startswith("por confirmar") for f in lug)


def test_sem_falhas_parquet_da_erro_claro(pastas, cfg):
    refs, interim, destino = pastas
    (destino / "falhas.parquet").unlink()
    with pytest.raises(FileNotFoundError, match="riasense vigiar"):
        avenida.calcular(refs, interim, destino, cfg)
