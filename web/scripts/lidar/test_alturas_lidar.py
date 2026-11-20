"""alturas_lidar.py com um MDS e um MDT sintéticos em EPSG:3763 (50 cm)."""

import json

import numpy as np
import rasterio
from rasterio.transform import from_origin
from rasterio.warp import transform_geom
from shapely.geometry import box, mapping

import alturas_lidar as al

X0, Y1, RES, N = -43500.0, 107600.0, 0.5, 200  # 100 m × 100 m


def _tif(caminho, arr):
    with rasterio.open(caminho, "w", driver="GTiff", width=N, height=N, count=1, dtype="float32",
                       crs="EPSG:3763", transform=from_origin(X0, Y1, RES, RES), nodata=np.nan) as f:
        f.write(arr.astype("float32"), 1)


def _edificio(i, xmin, ymin, xmax, ymax):
    return {"id": i, "geometry": transform_geom("EPSG:3763", "EPSG:4326", mapping(box(xmin, ymin, xmax, ymax)))}


def test_um_bloco_de_12_m_sobre_terreno_plano_mede_12_m_e_sem_dados_fica_sem_altura(tmp_path):
    rng = np.random.default_rng(0)
    mdt = np.full((N, N), 5.0) + rng.normal(0, 0.05, (N, N))
    mds = mdt.copy()
    # bloco de 20 m × 20 m, com 12 m, a começar a 30 m da esquerda e a 30 m do topo
    linhas, colunas = slice(60, 100), slice(60, 100)
    mds[linhas, colunas] = mdt[linhas, colunas] + 12.0
    mds[70:72, 70:72] += 3.0                       # uma chaminé de 1 m²: não puxa o percentil 90
    mds[58:60, 60:100] = mdt[58:60, 60:100] + 8.0  # árvore encostada por fora: fica fora com o recuo
    mds[150:, 150:] = np.nan                       # sem MDS neste canto
    _tif(tmp_path / "mds.tif", mds)
    _tif(tmp_path / "mdt.tif", mdt)
    caixa = (X0, Y1 - N * RES, X0 + N * RES, Y1)
    alturas, transf = al.ndsm([tmp_path / "mds.tif"], [tmp_path / "mdt.tif"], caixa)

    bloco = _edificio("bloco", X0 + 30, Y1 - 50, X0 + 50, Y1 - 30)
    vazio = _edificio("vazio", X0 + 80, Y1 - 95, X0 + 95, Y1 - 80)   # no canto sem MDS
    estreito = _edificio("estreito", X0 + 5, Y1 - 20, X0 + 6.5, Y1 - 5)  # 1,5 m de largura: o recuo come-o
    fc = {f["properties"]["id"]: f["properties"] for f in al.medir(alturas, transf, [bloco, vazio, estreito], 2024)}

    assert abs(fc["bloco"]["altura_m"] - 12.0) <= 0.2
    assert fc["bloco"]["origem"] == "medida (LiDAR DGT 2024)" and fc["bloco"]["celulas"] > 900
    assert fc["vazio"]["altura_m"] is None and fc["vazio"]["celulas"] == 0
    assert fc["estreito"]["altura_m"] is None


def test_mds_e_mdt_com_grelhas_diferentes_da_erro_claro(tmp_path):
    _tif(tmp_path / "mds.tif", np.zeros((N, N)))
    with rasterio.open(tmp_path / "mdt.tif", "w", driver="GTiff", width=N // 4, height=N // 4, count=1, dtype="float32",
                       crs="EPSG:3763", transform=from_origin(X0, Y1, 2.0, 2.0)) as f:
        f.write(np.zeros((N // 4, N // 4), "float32"), 1)
    try:
        al.ndsm([tmp_path / "mds.tif"], [tmp_path / "mdt.tif"], (X0, Y1 - 100, X0 + 100, Y1))
    except ValueError as e:
        assert "mesma grelha" in str(e)
    else:
        raise AssertionError("devia falhar")


def test_main_escreve_o_geojson(tmp_path):
    mdt = np.zeros((N, N)); mds = mdt.copy(); mds[60:100, 60:100] = 7.0
    _tif(tmp_path / "mds.tif", mds); _tif(tmp_path / "mdt.tif", mdt)
    ed = _edificio("a", X0 + 30, Y1 - 50, X0 + 50, Y1 - 30)
    (tmp_path / "ed.geojson").write_text(json.dumps({"type": "FeatureCollection", "features": [
        {"type": "Feature", "id": "a", "properties": {}, "geometry": ed["geometry"]}]}), encoding="utf-8")
    al.main(["--mds", str(tmp_path / "mds.tif"), "--mdt", str(tmp_path / "mdt.tif"), "--edificios", str(tmp_path / "ed.geojson"),
             "--caixa", str(X0), str(Y1 - 100), str(X0 + 100), str(Y1), "--ano", "2024", "--saida", str(tmp_path / "s.geojson")])
    [f] = json.loads((tmp_path / "s.geojson").read_text(encoding="utf-8"))["features"]
    assert f["properties"] == {"id": "a", "altura_m": 7.0, "origem": "medida (LiDAR DGT 2024)"}


def test_publicar_tira_os_sem_altura_e_os_de_menos_de_2_m_e_fica_so_com_id_altura_e_origem():
    g = {"type": "Point", "coordinates": [0, 0]}
    medidos = [{"type": "Feature", "geometry": g, "properties": {"id": i, "altura_m": h, "celulas": 50, "origem": "medida (LiDAR DGT 2024)"}}
               for i, h in [(35185841286243, 12.3), (2, None), (3, 1.9), (4, 2.0)]]
    fc = al.publicar(medidos)
    assert [f["properties"] for f in fc["features"]] == [
        {"id": 35185841286243, "altura_m": 12.3, "origem": "medida (LiDAR DGT 2024)"},
        {"id": 4, "altura_m": 2.0, "origem": "medida (LiDAR DGT 2024)"}]
