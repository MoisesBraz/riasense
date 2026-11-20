"""A vista aérea da zona da demo (ADR-0045): recorta a ortofoto da DGT à caixa e escreve tiles raster WebP num PMTiles.

A ortofoto (EPSG:3763, 25 cm, RGBI) é reprojetada tile a tile para Web Mercator. Fora da caixa, o tile fica transparente,
e o fundo vetorial continua por baixo. Ver o README desta pasta para o ficheiro exato e o comando.
"""
from __future__ import annotations

import argparse
import io
import math
from pathlib import Path

import numpy as np
import rasterio
from PIL import Image
from pmtiles.tile import Compression, TileType, zxy_to_tileid
from pmtiles.writer import Writer
from rasterio.enums import Resampling
from pyproj import Transformer
from rasterio.warp import reproject, transform_bounds

PT = "EPSG:3763"
WGS = "EPSG:4326"
MERC = "EPSG:3857"
TAM = 256
R = 6378137.0
ORIGEM = math.pi * R  # metade do mundo em Web Mercator (m)


def tiles_da_caixa(o: float, s: float, e: float, n: float, z: int) -> list[tuple[int, int]]:
    """Os tiles (x, y) do esquema XYZ que tocam a caixa (graus)."""
    def xy(lon: float, lat: float) -> tuple[int, int]:
        k = 2**z
        x = int((lon + 180) / 360 * k)
        y = int((1 - math.asinh(math.tan(math.radians(lat))) / math.pi) / 2 * k)
        return min(max(x, 0), k - 1), min(max(y, 0), k - 1)

    x0, y0 = xy(o, n)
    x1, y1 = xy(e, s)
    return [(x, y) for x in range(x0, x1 + 1) for y in range(y0, y1 + 1)]


def limites_mercator(x: int, y: int, z: int) -> tuple[float, float, float, float]:
    """Os limites do tile em Web Mercator (oeste, sul, leste, norte), em metros."""
    lado = 2 * ORIGEM / 2**z
    oeste = -ORIGEM + x * lado
    norte = ORIGEM - y * lado
    return oeste, norte - lado, oeste + lado, norte


def tile(fonte: rasterio.io.DatasetReader, caixa: tuple[float, float, float, float], x: int, y: int, z: int,
         qualidade: int) -> bytes | None:
    """Um tile WebP 256×256, com as bandas RGB; transparente fora da caixa. None se ficar todo transparente."""
    o, s, e, n = limites_mercator(x, y, z)
    destino = rasterio.transform.from_bounds(o, s, e, n, TAM, TAM)
    rgb = np.zeros((3, TAM, TAM), dtype=np.uint8)
    reproject(rasterio.band(fonte, (1, 2, 3)), rgb, dst_transform=destino, dst_crs=MERC, resampling=Resampling.bilinear)
    # A máscara da caixa: os pixeis cujo centro, em EPSG:3763, cai dentro dela.
    lado = (e - o) / TAM
    xs, ys = np.meshgrid(o + (np.arange(TAM) + 0.5) * lado, n - (np.arange(TAM) + 0.5) * lado)
    px, py = Transformer.from_crs(MERC, PT, always_xy=True).transform(xs, ys)
    cx0, cy0, cx1, cy1 = caixa
    dentro = ((px >= cx0) & (px <= cx1) & (py >= cy0) & (py <= cy1)).astype(np.uint8)[None]
    if not dentro.any():
        return None
    rgba = np.concatenate([rgb, dentro * 255]).transpose(1, 2, 0)
    buf = io.BytesIO()
    Image.fromarray(rgba, "RGBA").save(buf, "WEBP", quality=qualidade, method=6)
    return buf.getvalue()


def escrever(ortofoto: Path, caixa: tuple[float, float, float, float], zooms: range, saida: Path, qualidade: int,
             atribuicao: str) -> dict:
    o, s, e, n = transform_bounds(PT, WGS, *caixa)
    contagem: dict[int, int] = {}
    with rasterio.open(ortofoto) as fonte:
        # A janela da caixa, com uma margem, num array em memória: lê-se o ficheiro de 436 MB uma vez só.
        margem = 50
        janela = rasterio.windows.from_bounds(caixa[0] - margem, caixa[1] - margem, caixa[2] + margem, caixa[3] + margem,
                                              fonte.transform).round_offsets().round_lengths()
        dados = fonte.read((1, 2, 3), window=janela)
        perfil = {"driver": "MEM", "width": dados.shape[2], "height": dados.shape[1], "count": 3, "dtype": "uint8",
                  "crs": fonte.crs, "transform": fonte.window_transform(janela)}
    with rasterio.open("mem", "w", **perfil) as recorte, open(saida, "wb") as f:
        recorte.write(dados)
        w = Writer(f)
        for z in zooms:
            contagem[z] = 0
            for x, y in tiles_da_caixa(o, s, e, n, z):
                dado = tile(recorte, caixa, x, y, z, qualidade)
                if dado:
                    w.write_tile(zxy_to_tileid(z, x, y), dado)
                    contagem[z] += 1
        e7 = lambda v: int(round(v * 1e7))  # noqa: E731
        w.finalize(
            {"tile_type": TileType.WEBP, "tile_compression": Compression.NONE, "min_zoom": zooms.start,
             "max_zoom": zooms.stop - 1, "min_lon_e7": e7(o), "min_lat_e7": e7(s), "max_lon_e7": e7(e), "max_lat_e7": e7(n),
             "center_zoom": zooms.start + 3, "center_lon_e7": e7((o + e) / 2), "center_lat_e7": e7((s + n) / 2)},
            {"name": "vista_aerea", "attribution": atribuicao, "fonte": ortofoto.name,
             "caixa_epsg3763": list(caixa)},
        )
    return contagem


def main() -> None:
    p = argparse.ArgumentParser(description=__doc__)
    p.add_argument("--ortofoto", type=Path, required=True)
    p.add_argument("--caixa", nargs=4, type=float, required=True, metavar=("XMIN", "YMIN", "XMAX", "YMAX"), help="EPSG:3763")
    p.add_argument("--zoom", nargs=2, type=int, default=(14, 19), metavar=("MIN", "MAX"))
    p.add_argument("--qualidade", type=int, default=72)
    p.add_argument("--saida", type=Path, required=True)
    a = p.parse_args()
    contagem = escrever(a.ortofoto, tuple(a.caixa), range(a.zoom[0], a.zoom[1] + 1), a.saida, a.qualidade,
                        "Ortofotos © Direção-Geral do Território (CC BY 4.0)")
    print("tiles por zoom:", contagem, "|", f"{a.saida.stat().st_size / 1e6:.1f} MB")


if __name__ == "__main__":
    main()
