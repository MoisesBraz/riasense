"""Sensores, vizinhos e segmentos junto às passadeiras, com geometrias pequenas à volta de Aveiro."""

import csv
import json
import os
from pathlib import Path

import duckdb
import pytest

from riasense import config, ids, sensores

LON0, LAT0 = -8.65, 40.64
M_LAT = 1 / 111_040  # graus de latitude por metro, aproximado em Aveiro
M_LON = 1 / 84_390  # graus de longitude por metro


def _p(dx: float, dy: float) -> list[float]:
    return [LON0 + dx * M_LON, LAT0 + dy * M_LAT]


def _quadrado(dx: float, dy: float, lado: float = 4) -> str:
    cantos = [_p(dx, dy), _p(dx + lado, dy), _p(dx + lado, dy + lado), _p(dx, dy + lado), _p(dx, dy)]
    return json.dumps({"type": "Polygon", "coordinates": [cantos]})


def _linha(dx: float, dy0: float, dy1: float) -> str:
    return json.dumps({"type": "LineString", "coordinates": [_p(dx, dy0), _p(dx, dy1)]})


def _csv(caminho: Path, cabecalho: list[str], linhas: list[list]) -> None:
    with open(caminho, "w", newline="", encoding="utf-8") as f:
        w = csv.writer(f)
        w.writerow(cabecalho)
        w.writerows(linhas)


def _parquet(caminho: Path, colunas: dict[str, str], valores: list[tuple]) -> None:
    con = duckdb.connect()
    con.execute(f"create table t ({', '.join(f'{c} {tipo}' for c, tipo in colunas.items())})")
    con.executemany(f"insert into t values ({', '.join(['?'] * len(colunas))})", valores)
    con.table("t").write_parquet(str(caminho))
    con.close()


RSU = "urn:ngsi-ld:RoadSideUnit:0030"
RSU2 = "urn:ngsi-ld:RoadSideUnit:0028"
CW = "urn:ngsi-ld:SmartCrosswalk:00{:02d}"
SEG = "urn:ngsi-ld:RoadSegment:{}"


@pytest.fixture
def cfg():
    return config.carregar()


@pytest.fixture
def pastas(tmp_path):
    """7 passadeiras alinhadas de 100 em 100 m, 1 zona, 3 segmentos (a 10 m, a 50 m e sem eventos) e 2 lugares."""
    ref, interim = tmp_path / "ref", tmp_path / "interim"
    ref.mkdir()
    interim.mkdir()
    _csv(ref / "SmartCrosswalk.csv", ["entityId", "location", "observedBy", "roadName"],
         [[CW.format(i), _quadrado(i * 100, 0), RSU, f"Rua {i}"] for i in range(1, 8)])
    _csv(ref / "TouristZone.csv", ["entityId", "location", "name", "observedBy"],
         [["urn:ngsi-ld:TouristZone:0001", _quadrado(0, 500, 50), "Rossio", "urn:ngsi-ld:RoadSideUnit:0003"]])
    _csv(ref / "RoadSegment.csv", ["entityId", "location", "name", "observedBy"], [
        [SEG.format(1), _linha(110, -20, 20), '["Rua A","Rua B"]', "[]"],
        [SEG.format(2), _linha(150, -20, 20), "Rua C", f'["{RSU}","{RSU2}"]'],
        [SEG.format(3), _linha(102, -20, 20), "Rua D", RSU],
    ])
    # Como nos dados reais, o `rsu` dos eventos dos segmentos é o texto de uma lista JSON.
    eventos = [(SEG.format(1), f'["{RSU}"]'), (SEG.format(1), f'["{RSU}"]'), (SEG.format(1), "[]"), (SEG.format(2), None)]
    _parquet(interim / "segmentos.parquet", {"id": "varchar", "rsu": "varchar"}, eventos)
    lugares = [("urn:ngsi-ld:RoadSideUnit:0004", LON0, LAT0), ("urn:ngsi-ld:RoadSideUnit:0004", LON0 + 0.001, LAT0 + 0.001)]
    _parquet(interim / "estacionamento.parquet", {"rsu": "varchar", "lon": "double", "lat": "double"}, lugares)
    return ref, interim, tmp_path / "processed"


def _ler(pasta: Path, nome: str) -> list[dict]:
    rel = duckdb.sql(f"select * from read_parquet('{pasta / (nome + '.parquet')}')")
    return [dict(zip(rel.columns, linha)) for linha in rel.fetchall()]


def _calcular(pastas, cfg) -> Path:
    ref, interim, destino = pastas
    sensores.calcular(ref, interim, destino, cfg)
    return destino


def test_ha_um_sensor_por_passadeira_zona_segmento_com_eventos_e_rsu_de_estacionamento(pastas, cfg):
    tipos = {}
    for s in _ler(_calcular(pastas, cfg), "sensores"):
        tipos[s["tipo"]] = tipos.get(s["tipo"], 0) + 1
    assert tipos == {"passadeira": 7, "zona": 1, "segmento": 2, "estacionamento": 1}


def test_segmento_sem_eventos_nao_e_sensor(pastas, cfg):
    assert SEG.format(3) not in {s["id"] for s in _ler(_calcular(pastas, cfg), "sensores")}


def test_vizinhos_sao_os_5_mais_proximos_do_mesmo_tipo_em_metros(pastas, cfg):
    viz = [v for v in _ler(_calcular(pastas, cfg), "vizinhos") if v["id"] == CW.format(1)]
    viz.sort(key=lambda v: v["ordem"])
    assert [v["vizinho"] for v in viz] == [CW.format(i) for i in range(2, 7)]
    assert viz[0]["distancia_m"] == pytest.approx(100, abs=1)


def test_segmentos_a_menos_do_raio_de_cada_passadeira(pastas, cfg):
    pares = _ler(_calcular(pastas, cfg), "passadeira_segmentos")
    # SC0001 ocupa x = 100–104 m: o segmento 1 (x = 110) está a 6 m, o 2 (x = 150) a 46 m, acima dos 30 m.
    assert [(p["passadeira"], p["segmento"]) for p in pares] == [(CW.format(1), SEG.format(1))]
    assert pares[0]["distancia_m"] == pytest.approx(6, abs=0.5)


def test_estacionamento_fica_na_media_dos_lugares_da_rsu(pastas, cfg):
    [pk] = [s for s in _ler(_calcular(pastas, cfg), "sensores") if s["tipo"] == "estacionamento"]
    assert (pk["lon"], pk["lat"]) == (pytest.approx(LON0 + 0.0005), pytest.approx(LAT0 + 0.0005))


def test_rsu_e_nome_do_segmento_vem_dos_eventos_e_da_lista(pastas, cfg):
    [seg1] = [s for s in _ler(_calcular(pastas, cfg), "sensores") if s["id"] == SEG.format(1)]
    assert seg1["rsu"] == RSU
    assert seg1["nome"] == "Rua A / Rua B"


def test_rsu_nunca_e_texto_de_lista_e_a_lista_completa_fica_em_rsus(pastas, cfg):
    sens = {s["id"]: s for s in _ler(_calcular(pastas, cfg), "sensores")}
    assert not any((s["rsu"] or "").startswith("[") for s in sens.values())
    # Lista vazia na referência → a lista com 1 elemento dos eventos; lista com 2 → a 1.ª fica em `rsu`.
    assert (sens[SEG.format(1)]["rsu"], sens[SEG.format(1)]["rsus"]) == (RSU, [RSU])
    assert (sens[SEG.format(2)]["rsu"], sens[SEG.format(2)]["rsus"]) == (RSU, [RSU, RSU2])
    assert sens[CW.format(1)]["rsus"] == [RSU]


def test_referencia_em_falta_da_erro_claro(pastas, cfg):
    ref, interim, destino = pastas
    (ref / "TouristZone.csv").unlink()
    with pytest.raises(FileNotFoundError, match="TouristZone.csv"):
        sensores.calcular(ref, interim, destino, cfg)


CROSSWALK = "urn:ngsi-ld:Crosswalk:00{:02d}"


@pytest.fixture
def pastas_com_poligonos(pastas):
    """As `pastas` com o `Crosswalk.csv` (polígonos de 1 a 6) e o `refCrosswalk` em cada passadeira; a 7 não tem polígono."""
    ref, interim, destino = pastas
    _csv(ref / "Crosswalk.csv", ["entityId", "entityType", "location", "peopleCount"],
         [[CROSSWALK.format(i), "Crosswalk", _quadrado(i * 100, 0), 0.0] for i in range(1, 7)])
    # A passadeira 6 tem a RSU numa lista JSON, como nos segmentos; a 7 aponta para um polígono que não existe.
    _csv(ref / "SmartCrosswalk.csv", ["entityId", "location", "observedBy", "roadName", "refCrosswalk"],
         [[CW.format(i), _quadrado(i * 100, 0), f'["{RSU}"]' if i == 6 else RSU, f"Rua {i}",
           CROSSWALK.format(i) if i < 7 else CROSSWALK.format(99)] for i in range(1, 8)])
    return ref, interim, destino


def _geojson(destino: Path) -> dict:
    return json.loads((destino / "passadeiras.geojson").read_text(encoding="utf-8"))


def test_escreve_o_poligono_de_cada_passadeira_com_o_id_o_nome_da_rua_e_a_rsu(pastas_com_poligonos, cfg):
    colecao = _geojson(_calcular(pastas_com_poligonos, cfg))
    assert colecao["type"] == "FeatureCollection"
    [um] = [f for f in colecao["features"] if f["id"] == CW.format(1)]
    assert um["properties"] == {"id": CW.format(1), "crosswalk": CROSSWALK.format(1), "nome": "Rua 1", "rsu": RSU}
    assert um["geometry"] == json.loads(_quadrado(100, 0))  # o polígono do Living Lab, tal e qual


def test_passadeira_sem_poligono_fica_so_com_o_marcador(pastas_com_poligonos, cfg):
    ids_com_poligono = [f["id"] for f in _geojson(_calcular(pastas_com_poligonos, cfg))["features"]]
    assert ids_com_poligono == [CW.format(i) for i in range(1, 7)]  # a 7 aponta para um polígono que não existe


def test_a_rsu_numa_lista_json_fica_a_primeira(pastas_com_poligonos, cfg):
    [seis] = [f for f in _geojson(_calcular(pastas_com_poligonos, cfg))["features"] if f["id"] == CW.format(6)]
    assert seis["properties"]["rsu"] == RSU


def test_sem_crosswalk_csv_nao_ha_geojson_e_o_resto_calcula(pastas, cfg):
    destino = _calcular(pastas, cfg)
    assert not (destino / "passadeiras.geojson").exists()
    assert len(_ler(destino, "sensores")) == 11


def test_sem_poligonos_apaga_o_geojson_antigo(pastas_com_poligonos, cfg):
    ref, _, destino = pastas_com_poligonos
    _calcular(pastas_com_poligonos, cfg)
    assert (destino / "passadeiras.geojson").exists()
    (ref / "Crosswalk.csv").unlink()
    sensores.calcular(*pastas_com_poligonos[:2], destino, cfg)
    assert not (destino / "passadeiras.geojson").exists()  # um ficheiro velho não fica a mentir


@pytest.mark.integration
def test_dados_reais_as_24_passadeiras_tem_poligono(tmp_path, cfg):
    bruto = os.environ.get("RIASENSE_DATA_RAW")
    interim = Path(os.environ.get("RIASENSE_DATA_INTERIM") or config.RAIZ / "data" / "interim")
    if not bruto or not (interim / "segmentos.parquet").is_file():
        pytest.skip("RIASENSE_DATA_RAW não definido ou `riasense ingerir` por correr")
    sensores.calcular(Path(bruto) / "reference-entities", interim, tmp_path, cfg)
    caracteristicas = _geojson(tmp_path)["features"]
    assert len(caracteristicas) == 24
    assert {f["geometry"]["type"] for f in caracteristicas} == {"Polygon"}
    assert {f["id"] for f in caracteristicas} == {s["id"] for s in _ler(tmp_path, "sensores") if s["tipo"] == "passadeira"}
    assert all(f["properties"]["rsu"] for f in caracteristicas)
    # O Living Lab não diz a rua de duas passadeiras (SC0023 e SC0024): `nome` fica nulo, nada se inventa.
    assert {f["id"] for f in caracteristicas if f["properties"]["nome"] is None} == {CW.format(23), CW.format(24)}


@pytest.mark.parametrize("entrada", ["SmartCrosswalk:0019", "urn:ngsi-ld:SmartCrosswalk:0019", " SmartCrosswalk:0019 "])
def test_urn_aceita_a_forma_curta_e_a_completa(entrada):
    assert ids.urn(entrada) == "urn:ngsi-ld:SmartCrosswalk:0019"


@pytest.mark.parametrize("entrada", ["", "SC0019"])
def test_urn_recusa_identificadores_sem_tipo(entrada):
    with pytest.raises(ValueError):
        ids.urn(entrada)


@pytest.mark.integration
def test_dados_reais_as_24_passadeiras_tem_segmentos(tmp_path, cfg):
    bruto = os.environ.get("RIASENSE_DATA_RAW")
    interim = Path(os.environ.get("RIASENSE_DATA_INTERIM") or config.RAIZ / "data" / "interim")
    if not bruto or not (interim / "segmentos.parquet").is_file():
        pytest.skip("RIASENSE_DATA_RAW não definido ou `riasense ingerir` por correr")
    sensores.calcular(Path(bruto) / "reference-entities", interim, tmp_path, cfg)
    passadeiras = {s["id"] for s in _ler(tmp_path, "sensores") if s["tipo"] == "passadeira"}
    com_segmento = {p["passadeira"] for p in _ler(tmp_path, "passadeira_segmentos")}
    assert len(passadeiras) == 24
    assert passadeiras <= com_segmento
    demo = {ids.urn(p) for p in cfg["demo"]["passadeiras"]}
    assert demo <= passadeiras
    n = cfg["completar"]["vizinhos_mesmo_tipo"]
    por_sensor = {}
    for v in _ler(tmp_path, "vizinhos"):
        por_sensor[v["id"]] = por_sensor.get(v["id"], 0) + 1
    assert set(por_sensor.values()) == {n}
