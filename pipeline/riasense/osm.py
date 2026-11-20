"""Atributos das passadeiras pelo OpenStreetMap (ADR-0019): semáforo, via, escola e paragem, numa cópia local.

Dados: © contribuidores do OpenStreetMap, ODbL 1.0. A extração precisa de rede e corre uma vez; a demo usa a cópia
versionada em data/processed/passadeiras_osm.parquet, por isso funciona offline. É uma fonte aberta: a lista das
passadeiras com semáforo confirma-se com a Câmara Municipal de Aveiro, porque uma etiqueta errada muda a ④ (ADR-0024).
"""

import json
import os
import sys
import urllib.parse
import urllib.request
from pathlib import Path

import duckdb
import pandas as pd

from riasense import sensores

LICENCA = "ODbL 1.0 · © contribuidores do OpenStreetMap"
AVISO = "fonte aberta, por validar com a Câmara Municipal de Aveiro"

# Classes de via com trânsito, da mais à menos importante: no empate de distância, fica a primeira.
CLASSES_VIA = ["motorway", "trunk", "primary", "secondary", "tertiary", "unclassified", "residential", "living_street", "service"]

COLUNAS = [
    "id", "osm_passadeira", "distancia_m", "tipo_passadeira", "semaforo", "crossing_signals", "button_operated", "osm_via", "via_nome", "via_classe",
    "maxspeed", "faixas", "lit", "dist_escola_m", "dist_paragem_m", "fonte", "licenca",
]

CONSULTA = """[out:json][timeout:{tempo}];
(
  node["highway"="crossing"]({caixa});
  node["crossing"]({caixa});
  way["highway"~"^({classes})(_link)?$"]({caixa});
  node["highway"="bus_stop"]({caixa});
);
out geom;
nwr["amenity"="school"]({caixa});
out center;"""


def caixa(passadeiras: pd.DataFrame, margem_graus: float) -> str:
    """Caixa (sul, oeste, norte, leste) das passadeiras com uma margem, no formato do Overpass."""
    return (f"{passadeiras.lat.min() - margem_graus:.5f},{passadeiras.lon.min() - margem_graus:.5f},"
            f"{passadeiras.lat.max() + margem_graus:.5f},{passadeiras.lon.max() + margem_graus:.5f}")


def consulta(passadeiras: pd.DataFrame, o: dict) -> str:
    """Consulta Overpass: travessias, vias com trânsito e paragens com geometria; escolas com o centro."""
    return CONSULTA.format(tempo=o["tempo_max_s"], caixa=caixa(passadeiras, o["margem_graus"]), classes="|".join(CLASSES_VIA))


def tem_semaforo(tags: dict) -> bool:
    """Semáforo: `crossing=traffic_signals` ou `crossing:signals=yes` (ADR-0019 e ADR-0024).

    Não se distinguem tipos de semáforo: das 5 com semáforo na zona, 4 têm `button_operated=yes` e a SC0011 tem `no`.
    As etiquetas ficam nas colunas `crossing_signals` e `button_operated`, a confirmar com a Câmara.
    """
    return tags.get("crossing") == "traffic_signals" or tags.get("crossing:signals") == "yes"


def _inteiro(valor: str | None) -> int | None:
    try:
        return int(valor) if valor is not None else None
    except ValueError:
        return None  # por exemplo «2;3»: fica nulo, e não um número inventado


def _classe(tags: dict) -> str:
    return tags.get("highway", "").removesuffix("_link")


def tabelas(elementos: list[dict]) -> dict[str, pd.DataFrame]:
    """Resposta do Overpass → travessias, vias (WKT), escolas e paragens, com lon e lat."""
    trav, vias, escolas, paragens = [], [], [], []
    for e in elementos:
        tags = e.get("tags", {})
        if e["type"] == "node" and "railway" not in tags and (tags.get("highway") == "crossing" or "crossing" in tags):
            trav.append({"osm_passadeira": e["id"], "lon": e["lon"], "lat": e["lat"], "tipo_passadeira": tags.get("crossing"),
                         "semaforo": tem_semaforo(tags), "crossing_signals": tags.get("crossing:signals"),
                         "button_operated": tags.get("button_operated")})
        if e["type"] == "node" and tags.get("highway") == "bus_stop":
            paragens.append({"lon": e["lon"], "lat": e["lat"]})
        if tags.get("amenity") == "school":
            c = e.get("center") or e
            escolas.append({"lon": c["lon"], "lat": c["lat"]})
        if e["type"] == "way" and _classe(tags) in CLASSES_VIA and len(e.get("geometry", [])) >= 2:
            pontos = ", ".join(f"{p['lon']} {p['lat']}" for p in e["geometry"])
            vias.append({"osm_via": e["id"], "wkt": f"LINESTRING ({pontos})", "via_nome": tags.get("name"),
                         "via_classe": _classe(tags), "ordem": CLASSES_VIA.index(_classe(tags)),
                         "maxspeed": tags.get("maxspeed"), "faixas": _inteiro(tags.get("lanes")), "lit": tags.get("lit")})
    colunas = {"trav": ["osm_passadeira", "lon", "lat", "tipo_passadeira", "semaforo", "crossing_signals",
                        "button_operated"], "pontos": ["lon", "lat"],
               "vias": ["osm_via", "wkt", "via_nome", "via_classe", "ordem", "maxspeed", "faixas", "lit"]}
    return {"trav": pd.DataFrame(trav, columns=colunas["trav"]), "vias": pd.DataFrame(vias, columns=colunas["vias"]),
            "escolas": pd.DataFrame(escolas, columns=colunas["pontos"]),
            "paragens": pd.DataFrame(paragens, columns=colunas["pontos"])}


# Distâncias em metros, em EPSG:3763 (convenções do README). A via é a mais próxima da travessia OSM (0 m quando a travessia
# é um nó da via); no empate, a de classe mais importante. Acima de $raio_max_m a passadeira fica sem atributos.
ATRIBUTOS = """
with p as (select id, ST_Transform(ST_Point(lon, lat), 'EPSG:4326', 'EPSG:3763') as g from pas),
t as (select * exclude (lon, lat), ST_Transform(ST_Point(lon, lat), 'EPSG:4326', 'EPSG:3763') as g from trav),
v as (select * exclude (wkt), ST_Transform(ST_GeomFromText(wkt), 'EPSG:4326', 'EPSG:3763') as g from vias),
e as (select ST_Transform(ST_Point(lon, lat), 'EPSG:4326', 'EPSG:3763') as g from escolas),
b as (select ST_Transform(ST_Point(lon, lat), 'EPSG:4326', 'EPSG:3763') as g from paragens),
par as (
  select p.id, arg_min(t.osm_passadeira, ST_Distance(p.g, t.g)) as osm_passadeira, min(ST_Distance(p.g, t.g)) as distancia_m
  from p, t group by p.id
),
ok as (select par.*, t.* exclude (osm_passadeira) from par join t using (osm_passadeira) where distancia_m <= $raio_max_m),
via as (
  select ok.id, arg_min(struct_pack(v.osm_via, v.via_nome, v.via_classe, v.maxspeed, v.faixas, v.lit),
                        (round(ST_Distance(ok.g, v.g), 1), v.ordem)) as s
  from ok, v group by ok.id
)
select par.id, ok.osm_passadeira, par.distancia_m, ok.tipo_passadeira, ok.semaforo, ok.crossing_signals,
       ok.button_operated, via.s.osm_via, via.s.via_nome,
       via.s.via_classe, via.s.maxspeed, via.s.faixas, via.s.lit,
       (select min(ST_Distance(ok.g, e.g)) from e) as dist_escola_m,
       (select min(ST_Distance(ok.g, b.g)) from b) as dist_paragem_m
from par left join ok using (id) left join via using (id)
order by par.id
"""


def atributos(elementos: list[dict], passadeiras: pd.DataFrame, raio_max_m: float, fonte: str) -> pd.DataFrame:
    """Uma linha por passadeira com sensor (`id`, `lon`, `lat`) com os atributos da travessia OSM mais próxima."""
    con = sensores.ligar()
    try:
        con.register("pas", passadeiras[["id", "lon", "lat"]])
        for nome, df in tabelas(elementos).items():
            con.register(nome, df)
        res = con.sql(ATRIBUTOS, params={"raio_max_m": raio_max_m}).df()
    finally:
        con.close()
    res["semaforo"] = res["semaforo"].astype("boolean")
    res["faixas"] = res["faixas"].astype("Int64")
    res["osm_passadeira"], res["osm_via"] = res["osm_passadeira"].astype("Int64"), res["osm_via"].astype("Int64")
    return res.assign(fonte=fonte, licenca=LICENCA)[COLUNAS]


def _passadeiras(processed: Path) -> pd.DataFrame:
    caminho = processed / "sensores.parquet"
    if not caminho.is_file():
        raise FileNotFoundError(f"{caminho}: corre primeiro `riasense sensores`")
    return duckdb.sql(f"select id, lon, lat from read_parquet('{caminho}') where tipo = 'passadeira' order by id").df()


def descarregar(cfg: dict, processed: Path) -> pd.DataFrame:
    """Pede ao Overpass os elementos à volta das passadeiras e escreve `passadeiras_osm.parquet`."""
    o = cfg["fontes_externas"]["osm"]
    pas = _passadeiras(processed)
    dados = urllib.parse.urlencode({"data": consulta(pas, o)}).encode()
    pedido = urllib.request.Request(o["url"], data=dados, headers={"User-Agent": "riasense-pipeline"})
    with urllib.request.urlopen(pedido, timeout=o["tempo_max_s"] + 30) as r:  # só POST ao URL do config
        resposta = json.load(r)
    base = resposta.get("osm3s", {}).get("timestamp_osm_base", "data desconhecida")
    res = atributos(resposta.get("elements", []), pas, o["raio_max_m"], f"OpenStreetMap (Overpass, base de {base}); {AVISO}")
    con = duckdb.connect()
    try:
        con.register("res", res)
        con.sql("select * from res order by id").write_parquet(str(processed / "passadeiras_osm.parquet"))
    finally:
        con.close()
    return res


def correr(cfg: dict) -> int:
    """Subcomando `riasense osm`: precisa de rede; lê e escreve em RIASENSE_DATA_PROCESSED."""
    processed = Path(os.environ.get("RIASENSE_DATA_PROCESSED") or sensores.PROCESSED_PADRAO)
    try:
        res = descarregar(cfg, processed)
    except (OSError, ValueError) as e:
        print(f"erro: não foi possível consultar o OpenStreetMap ({e}); a cópia versionada continua válida", file=sys.stderr)
        return 1
    com = res[res["osm_passadeira"].notna()]
    print(f"osm: {len(com)} de {len(res)} passadeiras emparelhadas a ≤ {cfg['fontes_externas']['osm']['raio_max_m']} m "
          f"(mediana {com['distancia_m'].median():.1f} m); com semáforo: "
          f"{', '.join(com.loc[com['semaforo'].fillna(False), 'id'].str.rsplit(':', n=1).str[-1]) or 'nenhuma'}")
    print(f"→ {processed / 'passadeiras_osm.parquet'} ({LICENCA}; {AVISO})")
    return 0
