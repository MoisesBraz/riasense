"""Testes do vista_aerea.py com uma ortofoto sintética (não precisa do ficheiro da DGT)."""
import io

import numpy as np
import rasterio
from PIL import Image
from pmtiles.reader import MmapSource, Reader

from vista_aerea import escrever, limites_mercator, tiles_da_caixa


def _ortofoto(caminho):
    # 400 × 400 m a 1 m, em EPSG:3763, perto de Aveiro; vermelho puro nas 3 primeiras bandas, mais 2 bandas como a da DGT.
    t = rasterio.transform.from_origin(-44400, 107400, 1, 1)
    with rasterio.open(caminho, "w", driver="GTiff", width=400, height=400, count=5, dtype="uint8", crs="EPSG:3763", transform=t) as f:
        dados = np.zeros((5, 400, 400), dtype=np.uint8)
        dados[0] = 200
        f.write(dados)


def test_os_tiles_cobrem_a_caixa_e_os_limites_batem_com_o_esquema_xyz():
    # Aveiro, no zoom 14: x = (−8,66 + 180) / 360 × 2^14 = 7797,9, e y da projeção de Mercator.
    assert tiles_da_caixa(-8.66, 40.63, -8.64, 40.645, 14) == [(7797, 6164), (7797, 6165), (7798, 6164), (7798, 6165)]
    o, s, e, n = limites_mercator(0, 0, 0)
    assert round(o) == -20037508 and round(n) == 20037508


def test_escreve_webp_transparente_fora_da_caixa_e_so_os_tiles_com_fotografia(tmp_path):
    _ortofoto(tmp_path / "orto.tif")
    caixa = (-44300, 107100, -44100, 107300)  # 200 × 200 m, dentro da ortofoto
    contagem = escrever(tmp_path / "orto.tif", caixa, range(15, 18), tmp_path / "a.pmtiles", 80, "teste")
    assert all(n > 0 for n in contagem.values())
    with open(tmp_path / "a.pmtiles", "rb") as f:
        r = Reader(MmapSource(f))
        h = r.header()
        assert (h["min_zoom"], h["max_zoom"]) == (15, 17)
        assert r.metadata()["attribution"] == "teste"
        # Um tile do zoom 17: tem pixeis vermelhos (a fotografia) e, na borda da caixa, transparentes.
        alfas, vermelhos = [], []
        for z in [17]:
            from vista_aerea import tiles_da_caixa as t
            from rasterio.warp import transform_bounds
            for x, y in t(*transform_bounds("EPSG:3763", "EPSG:4326", *caixa), z):
                dado = r.get(z, x, y)
                if dado:
                    img = np.asarray(Image.open(io.BytesIO(dado)).convert("RGBA"))
                    alfas.append(img[..., 3])
                    vermelhos.append(img[..., 0][img[..., 3] > 0])
        assert any((a == 0).any() for a in alfas)  # fora da caixa
        assert all(v.size == 0 or abs(int(np.median(v)) - 200) < 10 for v in vermelhos)
