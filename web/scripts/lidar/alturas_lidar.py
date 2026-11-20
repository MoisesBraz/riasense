"""Alturas dos edifícios da zona da demo medidas pelo LiDAR da DGT (ADR-0050, proposto).

A altura de cada edifício é o percentil 90 do modelo normalizado (MDS − MDT) dentro da planta do edifício,
recuada 1 m para dentro, para as bordas (paredes, beirados, árvores encostadas) não contarem. Um edifício
com menos de `celulas_min` células válidas fica sem altura, e a web usa os 9 m de hoje (`mapa.edificio_altura_m`).

Entradas:
- o MDS e o MDT da DGT (GeoTIFF em EPSG:3763, as mesmas folhas e a mesma resolução nos dois);
- os edifícios: o `aveiro.pmtiles` da web (camada `buildings`, z15, com o id do OSM) ou um GeoJSON em EPSG:4326.

Saída: GeoJSON em EPSG:4326, um elemento por edifício, com `id`, `altura_m` (ou null), `celulas` e `origem`.

Uso:
    python alturas_lidar.py --mds MDS-50cm-*.tif --mdt MDT-50cm-*.tif --edificios aveiro.pmtiles \\
        --caixa -44256 106805 -43242 107918 --ano 2024 --saida edificios_alturas.geojson
"""

import argparse
import gzip
import json
import math
from pathlib import Path

import numpy as np
import rasterio
from rasterio.features import geometry_mask
from rasterio.merge import merge
from rasterio.warp import transform_bounds, transform_geom
from shapely.geometry import box, mapping, shape
from shapely.ops import unary_union

PT, WGS = "EPSG:3763", "EPSG:4326"
RECUO_M = 1.0          # as bordas do edifício não contam
PERCENTIL = 90
CELULAS_MIN = 8        # com 50 cm, 8 células = 2 m² de telhado medido
ALTURA_MIN = 2.0       # abaixo disto (demolidos, por construir, anexos rasos) a web usa a altura de hoje


def ndsm(mds: list[Path], mdt: list[Path], caixa: tuple[float, float, float, float]):
    """MDS − MDT recortados à caixa (EPSG:3763), na mesma grelha; NaN onde falta um dos dois."""
    def mosaico(caminhos):
        fontes = [rasterio.open(c) for c in caminhos]
        try:
            for f in fontes:
                if f.crs and f.crs.to_epsg() != 3763:
                    raise ValueError(f"{f.name}: o modelo tem de estar em EPSG:3763, e está em {f.crs}")
            arr, transf = merge(fontes, bounds=caixa, nodata=np.nan, dtype="float32")
            return arr[0], transf
        finally:
            for f in fontes:
                f.close()
    s, ts = mosaico(mds)
    t, tt = mosaico(mdt)
    if s.shape != t.shape or not ts.almost_equals(tt):
        raise ValueError("o MDS e o MDT não têm a mesma grelha: usa a mesma resolução (50 cm ou 2 m) nos dois")
    return s - t, ts


def medir(alturas: np.ndarray, transf, edificios: list[dict], ano: int,
          recuo_m: float = RECUO_M, percentil: float = PERCENTIL, celulas_min: int = CELULAS_MIN) -> list[dict]:
    """Um elemento GeoJSON (EPSG:4326) por edifício, com a altura medida ou null."""
    origem = f"medida (LiDAR DGT {ano})"
    saida = []
    for e in edificios:
        planta = shape(transform_geom(WGS, PT, e["geometry"]))
        dentro = planta.buffer(-recuo_m)
        valores = np.array([])
        if not dentro.is_empty:
            fora = geometry_mask([mapping(dentro)], out_shape=alturas.shape, transform=transf)
            valores = alturas[~fora]
            valores = valores[np.isfinite(valores)]
        n = int(valores.size)
        medida = n >= celulas_min
        saida.append({"type": "Feature", "geometry": e["geometry"], "properties": {
            "id": e["id"],
            "altura_m": round(float(np.percentile(valores, percentil)), 1) if medida else None,
            "celulas": n,
            "origem": origem if medida else "sem dados (a web usa a altura por omissão)",
        }})
    return saida


def edificios_pmtiles(caminho: Path, caixa: tuple[float, float, float, float], z: int = 15) -> list[dict]:
    """Os edifícios da camada `buildings` do PMTiles que tocam a caixa (EPSG:3763), juntando os pedaços de cada id."""
    import mapbox_vector_tile as mvt
    from pmtiles.reader import MmapSource, Reader

    o, s, e, n = transform_bounds(PT, WGS, *caixa)
    def tile(lon, lat):
        k = 2 ** z
        return int((lon + 180) / 360 * k), int((1 - math.asinh(math.tan(math.radians(lat))) / math.pi) / 2 * k)
    (x0, y0), (x1, y1) = tile(o, n), tile(e, s)
    def lonlat(x, y, px, py, ext):
        k = 2 ** z
        lon = (x + px / ext) / k * 360 - 180
        lat = math.degrees(math.atan(math.sinh(math.pi * (1 - 2 * (y + py / ext) / k))))
        return lon, lat
    pedacos: dict = {}
    altura_osm: dict = {}  # o `height` do OSM, só para comparar
    with open(caminho, "rb") as f:
        r = Reader(MmapSource(f))
        for x in range(x0, x1 + 1):
            for y in range(y0, y1 + 1):
                dados = r.get(z, x, y)
                if not dados:
                    continue
                camadas = mvt.decode(gzip.decompress(dados) if dados[:2] == b"\x1f\x8b" else dados,
                                     default_options={"y_coord_down": True})
                camada = camadas.get("buildings")
                if not camada:
                    continue
                ext = camada.get("extent", 4096)
                for ft in camada["features"]:
                    g = ft["geometry"]
                    def conv(c, x=x, y=y, ext=ext):
                        return [conv(i) for i in c] if isinstance(c[0], list) else list(lonlat(x, y, c[0], c[1], ext))
                    geo = shape({"type": g["type"], "coordinates": conv(g["coordinates"])})
                    pedacos.setdefault(ft.get("id"), []).append(geo.buffer(0))
                    if ft["properties"].get("height") is not None:
                        altura_osm[ft.get("id")] = ft["properties"]["height"]
    zona = box(o, s, e, n)
    saida = []
    for i, gs in pedacos.items():
        g = unary_union(gs)
        if g.intersects(zona) and not g.is_empty:
            # o id é o da feature dos tiles, que a web usa para tirar o edifício da camada dos tiles
            saida.append({"id": i, "geometry": mapping(g), "height_osm": altura_osm.get(i)})
    return saida


def publicar(medidos: list[dict], altura_min: float = ALTURA_MIN) -> dict:
    """O `edificios_alturas.geojson`: só os edifícios medidos com `altura_min` ou mais, com `id`, `altura_m` e `origem`."""
    return {"type": "FeatureCollection", "features": [
        {"type": "Feature", "geometry": f["geometry"],
         "properties": {k: f["properties"][k] for k in ("id", "altura_m", "origem")}}
        for f in medidos if f["properties"]["altura_m"] is not None and f["properties"]["altura_m"] >= altura_min]}


def edificios_geojson(caminho: Path) -> list[dict]:
    fc = json.loads(Path(caminho).read_text(encoding="utf-8"))
    return [{"id": f.get("id") or f["properties"].get("id") or k, "geometry": f["geometry"]} for k, f in enumerate(fc["features"])]


def main(argv=None) -> int:
    p = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    p.add_argument("--mds", nargs="+", type=Path, required=True)
    p.add_argument("--mdt", nargs="+", type=Path, required=True)
    p.add_argument("--edificios", type=Path, required=True, help="aveiro.pmtiles ou um GeoJSON em EPSG:4326")
    p.add_argument("--caixa", nargs=4, type=float, required=True, metavar=("XMIN", "YMIN", "XMAX", "YMAX"), help="EPSG:3763")
    p.add_argument("--ano", type=int, required=True, help="ano do voo LiDAR (para a `origem`)")
    p.add_argument("--saida", type=Path, required=True)
    a = p.parse_args(argv)
    caixa = tuple(a.caixa)
    eds = edificios_pmtiles(a.edificios, caixa) if a.edificios.suffix == ".pmtiles" else edificios_geojson(a.edificios)
    alturas, transf = ndsm(a.mds, a.mdt, caixa)
    fc = publicar(medir(alturas, transf, eds, a.ano))
    a.saida.write_text(json.dumps(fc, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")
    med = [f["properties"]["altura_m"] for f in fc["features"]]
    print(f"alturas_lidar: {len(eds)} edifícios, {len(med)} com {ALTURA_MIN:g} m ou mais medidos"
          + (f" (mediana {np.median(med):.1f} m)" if med else "") + f" → {a.saida}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
