"""Sensores: posição em metros, RSU, vizinhos do mesmo tipo (ADR-0005) e segmentos junto às passadeiras (ADR-0006).

Um sensor é um segmento viário com eventos, uma passadeira inteligente, uma zona turística ou o grupo de lugares
de estacionamento de uma RSU (GLOSSARY.md). Neste último caso, o `id` do sensor é o URN da RSU.
As distâncias calculam-se em EPSG:3763 (PT-TM06), na extensão spatial do DuckDB (convenções do README).
"""

import csv
import json
import os
import sys
from pathlib import Path

import duckdb

from riasense import config, ingerir

PROCESSED_PADRAO = config.RAIZ / "data" / "processed"
REFERENCIAS = {"cw": "SmartCrosswalk.csv", "tz": "TouristZone.csv", "rs": "RoadSegment.csv"}
# As passadeiras desenhadas no mapa (ADR-0038): os polígonos do `Crosswalk.csv`, ligados ao sensor pelo `refCrosswalk` do `SmartCrosswalk.csv`.
POLIGONOS_PASSADEIRAS = "Crosswalk.csv"
GEOJSON_PASSADEIRAS = "passadeiras.geojson"

# O `observedBy` dos segmentos (referência e eventos) é o texto de uma lista JSON, às vezes vazia («[]»);
# nos outros tipos é um URN. Esta macro dá sempre uma lista de URN, vazia quando não há RSU.
LISTA_RSU = """
create or replace temp macro lista_rsu(t) as
case when t is null or trim(t) = '' then []::varchar[]
     when trim(t) like '[%' then json_extract_string(t, '$[*]')
     else [trim(t)] end
"""

# Geometria original (WGS84) e RSU de cada sensor. O nome dos segmentos pode vir como lista JSON: fica texto com « / ».
# Nos segmentos, a RSU vem da referência ou, se a lista vier vazia, da lista mais frequente nos eventos que tenham RSU.
GEOMETRIAS = """
create or replace temp table geo as
select entityId as id, 'passadeira' as tipo, lista_rsu(observedBy) as rsus, roadName as nome,
       ST_GeomFromGeoJSON(location) as g from cw
union all
select entityId, 'zona', lista_rsu(observedBy), name, ST_GeomFromGeoJSON(location) from tz
union all
select rsu, 'estacionamento', [rsu], null, ST_Point(avg(lon), avg(lat)) from pk where rsu is not null group by rsu
union all
select r.entityId, 'segmento',
       case when len(lista_rsu(r.observedBy)) > 0 then lista_rsu(r.observedBy) else lista_rsu(e.rsu) end,
       case when r.name like '[%' then array_to_string(json_extract_string(r.name, '$[*]'), ' / ') else nullif(r.name, '') end,
       ST_GeomFromGeoJSON(r.location)
from rs r join (
  select id, mode(rsu) filter (where len(lista_rsu(rsu)) > 0) as rsu from seg group by id
) e on e.id = r.entityId
"""

# Geometria em metros e o ponto que representa o sensor: o meio da linha nos segmentos, o centroide nos restantes.
METRICAS = """
create or replace temp table sensores as
select id, tipo, rsus[1] as rsu, rsus, nome, gm,
       case when tipo = 'segmento' then ST_LineInterpolatePoint(gm, 0.5) else ST_Centroid(gm) end as pm
from (select *, ST_Transform(g, 'EPSG:4326', 'EPSG:3763') as gm from geo)
"""

TABELA_SENSORES = """
select id, tipo, rsu, rsus, nome, ST_X(pm) as x, ST_Y(pm) as y,
       ST_X(ST_Transform(pm, 'EPSG:3763', 'EPSG:4326')) as lon, ST_Y(ST_Transform(pm, 'EPSG:3763', 'EPSG:4326')) as lat
from sensores order by tipo, id
"""

TABELA_VIZINHOS = """
select a.id, a.tipo, b.id as vizinho, ST_Distance(a.pm, b.pm) as distancia_m,
       row_number() over (partition by a.id order by ST_Distance(a.pm, b.pm), b.id) as ordem
from sensores a join sensores b on a.tipo = b.tipo and a.id <> b.id
qualify ordem <= $n order by a.id, ordem
"""

# Distância entre as geometrias completas (polígono da passadeira e linha do segmento), não entre os pontos.
TABELA_PASSADEIRA_SEGMENTOS = """
select c.id as passadeira, s.id as segmento, ST_Distance(c.gm, s.gm) as distancia_m
from sensores c join sensores s
  on c.tipo = 'passadeira' and s.tipo = 'segmento' and ST_DWithin(c.gm, s.gm, $raio)
order by passadeira, distancia_m, segmento
"""


def ligar() -> duckdb.DuckDBPyConnection:
    """Ligação DuckDB com a extensão spatial (instalada na 1.ª vez) e eixos em [lon, lat], como no GeoJSON."""
    con = duckdb.connect()
    try:
        con.execute("load spatial")
    except duckdb.Error:
        con.execute("install spatial")
        con.execute("load spatial")
    con.execute("set geometry_always_xy = true")
    return con


def _registar_fontes(con: duckdb.DuckDBPyConnection, referencias: Path, interim: Path) -> None:
    for vista, ficheiro in REFERENCIAS.items():
        caminho = referencias / ficheiro
        if not caminho.is_file():
            raise FileNotFoundError(f"{caminho}: entidade de referência em falta")
        con.register(vista, con.read_csv(str(caminho), header=True, all_varchar=True))
    for vista, tabela in {"seg": "segmentos", "pk": "estacionamento"}.items():
        caminho = interim / f"{tabela}.parquet"
        if not caminho.is_file():
            raise FileNotFoundError(f"{caminho}: corre primeiro `riasense ingerir`")
        con.register(vista, con.read_parquet(str(caminho)))


def _rsu_da_passadeira(observado_por: str) -> str | None:
    """A RSU de uma passadeira: o URN do `observedBy`, ou o 1.º da lista JSON, ou nada."""
    texto = (observado_por or "").strip()
    if texto.startswith("["):
        lista = json.loads(texto)
        return lista[0] if lista else None
    return texto or None


def passadeiras_geojson(referencias: Path) -> list[dict]:
    """Os polígonos das passadeiras (ADR-0038): um por sensor `SmartCrosswalk`, com o `id`, o `roadName` e a RSU.

    O polígono vem do `Crosswalk.csv`, que o `SmartCrosswalk.csv` aponta pelo `refCrosswalk`. Nada se estima: uma passadeira
    sem polígono (sem `refCrosswalk`, ou que não está no `Crosswalk.csv`) fica de fora e só tem o marcador. Sem `Crosswalk.csv`
    (outra cidade, outra exportação), não há polígonos.
    """
    caminho = referencias / POLIGONOS_PASSADEIRAS
    if not caminho.is_file():
        return []
    with open(caminho, newline="", encoding="utf-8") as f:
        poligonos = {linha["entityId"]: linha["location"] for linha in csv.DictReader(f)}
    with open(referencias / REFERENCIAS["cw"], newline="", encoding="utf-8") as f:
        sensores = sorted(csv.DictReader(f), key=lambda linha: linha["entityId"])
    caracteristicas = []
    for linha in sensores:
        ref = (linha.get("refCrosswalk") or "").strip()
        texto = (poligonos.get(ref) or "").strip()
        if not texto:
            continue
        geometria = json.loads(texto)
        if geometria.get("type") not in ("Polygon", "MultiPolygon"):
            continue
        caracteristicas.append(
            {
                "type": "Feature",
                "id": linha["entityId"],
                "properties": {
                    "id": linha["entityId"],
                    "crosswalk": ref,
                    "nome": (linha.get("roadName") or "").strip() or None,
                    "rsu": _rsu_da_passadeira(linha.get("observedBy", "")),
                },
                "geometry": geometria,
            }
        )
    return caracteristicas


def escrever_passadeiras_geojson(referencias: Path, destino: Path) -> int:
    """Escreve `passadeiras.geojson` e devolve quantos polígonos tem; sem polígonos, não escreve nada (a API diz «por calcular»)."""
    caracteristicas = passadeiras_geojson(referencias)
    ficheiro = destino / GEOJSON_PASSADEIRAS
    if not caracteristicas:
        ficheiro.unlink(missing_ok=True)
        return 0
    ficheiro.write_text(json.dumps({"type": "FeatureCollection", "features": caracteristicas}, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")
    return len(caracteristicas)


def calcular(referencias: Path, interim: Path, destino: Path, cfg: dict) -> dict[str, int]:
    """Escreve `sensores`, `vizinhos` e `passadeira_segmentos` em Parquet e `passadeiras.geojson`; devolve as linhas de cada um."""
    destino.mkdir(parents=True, exist_ok=True)
    con = ligar()
    try:
        _registar_fontes(con, referencias, interim)
        con.execute(LISTA_RSU)
        con.execute(GEOMETRIAS)
        con.execute(METRICAS)
        tabelas = {
            "sensores": (TABELA_SENSORES, {}),
            "vizinhos": (TABELA_VIZINHOS, {"n": cfg["completar"]["vizinhos_mesmo_tipo"]}),
            "passadeira_segmentos": (TABELA_PASSADEIRA_SEGMENTOS, {"raio": cfg["proteger"]["raio_segmentos_m"]}),
        }
        linhas = {}
        for nome, (sql, params) in tabelas.items():
            rel = con.sql(sql, params=params)
            rel.write_parquet(str(destino / f"{nome}.parquet"))
            linhas[nome] = con.execute("select count(*) from read_parquet(?)", [str(destino / f"{nome}.parquet")]).fetchall()[0][0]
        linhas[GEOJSON_PASSADEIRAS] = escrever_passadeiras_geojson(referencias, destino)
        return linhas
    finally:
        con.close()


def correr(cfg: dict) -> int:
    """Subcomando `riasense sensores`: lê as referências de RIASENSE_DATA_RAW e as tabelas de RIASENSE_DATA_INTERIM."""
    bruto = os.environ.get("RIASENSE_DATA_RAW")
    if not bruto or not Path(bruto).is_dir():
        print("erro: RIASENSE_DATA_RAW tem de apontar para a pasta dos CSV do Living Lab", file=sys.stderr)
        return 1
    interim = Path(os.environ.get("RIASENSE_DATA_INTERIM") or ingerir.INTERIM_PADRAO)
    destino = Path(os.environ.get("RIASENSE_DATA_PROCESSED") or PROCESSED_PADRAO)
    try:
        linhas = calcular(Path(bruto) / "reference-entities", interim, destino, cfg)
    except FileNotFoundError as e:
        print(f"erro: {e}", file=sys.stderr)
        return 1
    for nome, n in linhas.items():
        ficheiro = nome if nome.endswith(".geojson") else nome + ".parquet"
        print(f"{nome}: {n} {'polígonos' if nome.endswith('.geojson') else 'linhas'} → {destino / ficheiro}")
    return 0
