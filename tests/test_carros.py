"""Os carros no mapa (ADR-0034): só câmara ou radar, um tipo por segmento para a semana toda, nunca somados; a geometria."""

import json

import duckdb
import pandas as pd
import pytest

from riasense import carros, config

T0 = pd.Timestamp("2026-11-04 08:00")


@pytest.fixture
def cfg():
    return config.carregar()


def _linha(i: int, t: pd.Timestamp, sensor: str, vel: float = 10.0) -> dict:
    return {"id": f"urn:ngsi-ld:RoadSegment:{i}", "t": t, "sensor": sensor, "categoria": "B", "vel_media_ms": vel,
            "vel_max_ms": vel, "vel_limite_ms": 13.9, "duracao_s": 1.0, "faixa": 0.0, "rsu": None}


@pytest.fixture
def pastas(tmp_path):
    """Segmento 1: câmara e V2X; 2: só radar; 3: só V2X; 4: câmara em 1 hora e radar em 2 (metade: fica a câmara);
    5: câmara em 1 hora e radar em 3 (menos de metade: fica o radar). Mais um evento fora da janela."""
    linhas = (
        [_linha(1, T0 + pd.Timedelta(minutes=m), "Camera") for m in range(3)]
        + [_linha(1, T0, "V2X")]
        + [_linha(2, T0 + pd.Timedelta(hours=1), "Radar", vel) for vel in (8.0, 12.0)]
        + [_linha(3, T0, "V2X")]
        + [_linha(4, T0, "Camera"), _linha(4, T0, "Radar"), _linha(4, T0, "Radar")]
        + [_linha(4, T0 + pd.Timedelta(hours=1), "Radar", 7.0)]
        + [_linha(5, T0, "Camera")] + [_linha(5, T0 + pd.Timedelta(hours=h), "Radar", 9.0) for h in (0, 1, 2)]
        + [_linha(1, pd.Timestamp("2026-11-12 08:00"), "Camera")]  # depois do fim dos dados
    )
    interim = tmp_path / "interim"
    interim.mkdir()
    duckdb.from_df(pd.DataFrame(linhas)).write_parquet(str(interim / "segmentos.parquet"))
    refs = tmp_path / "reference-entities"
    refs.mkdir()
    linha = '{"type":"LineString","coordinates":[[-8.65,40.64],[-8.651,40.641]]}'
    pd.DataFrame(
        {"entityId": [f"urn:ngsi-ld:RoadSegment:{i}" for i in (1, 2, 3, 4, 5)], "entityType": "RoadSegment", "location": linha}
    ).to_csv(refs / "RoadSegment.csv", index=False)
    return interim, refs, tmp_path / "processed"


def _horas(destino, i: int) -> list[tuple]:
    h = duckdb.read_parquet(str(destino / "segmentos_hora.parquet")).df()
    assert list(h.columns) == carros.COLUNAS
    d = h[h.id == f"urn:ngsi-ld:RoadSegment:{i}"]
    return [(r.t, r.sensor, r.veiculos) for r in d.itertuples()]


def test_so_camara_ou_radar_um_tipo_por_segmento_e_nunca_somados(pastas, cfg):
    interim, refs, destino = pastas
    n = carros.calcular(interim, refs, destino, cfg)
    assert _horas(destino, 1) == [(T0, "Camera", 3)]  # o V2X do mesmo segmento não se soma
    assert _horas(destino, 2) == [(T0 + pd.Timedelta(hours=1), "Radar", 2)]
    assert _horas(destino, 3) == []  # só V2X: fica sem carros
    assert n == {"segmentos": 4, "linhas": 6, "ruas": 4}  # o evento de 12/11 fica fora da janela


def test_camara_em_menos_de_metade_das_horas_do_radar_fica_o_radar_a_semana_toda(pastas, cfg):
    """O 5 tem a câmara em 1 hora e o radar em 3 (1 < 3/2), por isso fica o radar em todas."""
    interim, refs, destino = pastas
    carros.calcular(interim, refs, destino, cfg)
    assert _horas(destino, 5) == [(T0 + pd.Timedelta(hours=h), "Radar", 1) for h in (0, 1, 2)]


def test_camara_em_metade_ou_mais_das_horas_fica_a_camara_mesmo_nas_horas_em_que_nao_mediu(pastas, cfg):
    """O 4 tem a câmara em 1 hora e o radar em 2 (1 = 2/2): fica a câmara, e às 09h, sem câmara, não há carros."""
    interim, refs, destino = pastas
    carros.calcular(interim, refs, destino, cfg)
    assert _horas(destino, 4) == [(T0, "Camera", 1)]


def test_a_geometria_e_a_do_proprio_segmento(pastas, cfg):
    interim, refs, destino = pastas
    carros.calcular(interim, refs, destino, cfg)
    geo = json.loads((destino / "segmentos_carros.geojson").read_text(encoding="utf-8"))
    assert geo["type"] == "FeatureCollection"
    assert {f["properties"]["id"].rsplit(":", 1)[1]: f["properties"]["sensor"] for f in geo["features"]} == {
        "1": "Camera", "2": "Radar", "4": "Camera", "5": "Radar"}
    assert all(f["geometry"]["type"] == "LineString" for f in geo["features"])


def test_sem_a_ingestao_diz_o_que_correr(tmp_path, cfg):
    with pytest.raises(FileNotFoundError, match="riasense ingerir"):
        carros.calcular(tmp_path / "nada", tmp_path, tmp_path / "out", cfg)



def test_as_ruas_com_sensor_sao_os_trocos_medidos_e_os_junto_as_passadeiras(pastas, cfg):
    """O 3 (só V2X) entra por estar junto a uma passadeira; o 2 e o 5 entram pelo radar; o 1 e o 4 pela câmara."""
    interim, refs, destino = pastas
    destino.mkdir(parents=True, exist_ok=True)
    ps = pd.DataFrame({"passadeira": ["urn:ngsi-ld:SmartCrosswalk:0001"], "segmento": ["urn:ngsi-ld:RoadSegment:3"], "distancia_m": [5.0]})
    duckdb.from_df(ps).write_parquet(str(destino / "passadeira_segmentos.parquet"))
    n = carros.calcular(interim, refs, destino, cfg)
    ruas = json.loads((destino / "ruas_com_sensor.geojson").read_text(encoding="utf-8"))
    motivos = {f["properties"]["id"].rsplit(":", 1)[1]: f["properties"]["motivo"] for f in ruas["features"]}
    assert motivos == {"1": "camera", "2": "radar", "3": "passadeira", "4": "camera", "5": "radar"}
    assert n["ruas"] == 5


def _hora_com(tmp_path, cfg, velocidades, limite=13.9):
    """Um segmento com câmara, numa hora, com as passagens à velocidade dada (m/s) e o limite da via."""
    linhas = [{**_linha(1, T0 + pd.Timedelta(seconds=i), "Camera", v), "vel_limite_ms": limite} for i, v in enumerate(velocidades)]
    interim = tmp_path / "interim"
    interim.mkdir(parents=True)
    duckdb.from_df(pd.DataFrame(linhas)).write_parquet(str(interim / "segmentos.parquet"))
    refs = tmp_path / "reference-entities"
    refs.mkdir()
    pd.DataFrame({"entityId": ["urn:ngsi-ld:RoadSegment:1"], "entityType": "RoadSegment",
                  "location": '{"type":"LineString","coordinates":[[-8.65,40.64],[-8.651,40.641]]}'}).to_csv(refs / "RoadSegment.csv", index=False)
    destino = tmp_path / "processed"
    carros.calcular(interim, refs, destino, cfg)
    [linha] = duckdb.read_parquet(str(destino / "segmentos_hora.parquet")).df().itertuples()
    return linha


def test_cada_ponto_e_um_grupo_de_cerca_de_20_veiculos_com_a_mediana_da_sua_velocidade(tmp_path, cfg):
    # 45 passagens a 1…45 m/s: 45 / 20 dá 2 pontos; as 22 mais lentas (1…22, mediana 11,5) e as 23 mais rápidas (23…45, mediana 34).
    hora = _hora_com(tmp_path, cfg, range(1, 46))
    assert hora.veiculos == 45
    assert list(hora.velocidades_kmh) == [pytest.approx(11.5 * 3.6), pytest.approx(34 * 3.6)]


def test_poucas_passagens_dao_um_so_ponto_e_20_passagens_tambem(tmp_path, cfg):
    assert list(_hora_com(tmp_path, cfg, [5.0, 9.0, 7.0]).velocidades_kmh) == [pytest.approx(7.0 * 3.6)]  # a mediana, por ordem de velocidade
    assert len(_hora_com(tmp_path / "b", cfg, [8.0] * 20).velocidades_kmh) == 1
    assert len(_hora_com(tmp_path / "c", cfg, [8.0] * 40).velocidades_kmh) == 2  # tantos grupos quantos os pontos do mapa


def test_o_limite_da_via_e_o_numero_de_passagens_acima_dele(tmp_path, cfg):
    hora = _hora_com(tmp_path, cfg, range(1, 46), limite=13.9)  # 50 km/h: acima dele, de 14 a 45 m/s
    assert hora.limite_kmh == pytest.approx(13.9 * 3.6)
    assert hora.acima_limite == 32
    assert _hora_com(tmp_path / "b", cfg, [8.0, 9.0], limite=8.33).acima_limite == 1  # 30 km/h: só a de 9 m/s


def test_uma_passagem_sem_velocidade_conta_nos_veiculos_mas_nao_entra_nos_grupos(tmp_path, cfg):
    hora = _hora_com(tmp_path, cfg, [10.0, None, 12.0])
    assert hora.veiculos == 3
    assert list(hora.velocidades_kmh) == [pytest.approx(11.0 * 3.6)]


def test_o_numero_de_grupos_e_o_de_pontos_do_config(tmp_path, cfg):
    cfg["carros"] = {**cfg["carros"], "veiculos_por_ponto": 10}
    assert len(_hora_com(tmp_path, cfg, [8.0] * 45).velocidades_kmh) == 5  # round(45 / 10)


def test_grupos_por_categoria_repartidos_pelos_maiores_restos_na_zona(tmp_path, cfg):
    """ADR-0041: em cada hora, os grupos de cada categoria são o total da zona ÷ veiculos_por_ponto (20), repartidos pelos maiores
    restos. Três segmentos com 7 autocarros cada (0,35 + 0,35 + 0,35 = 1,05) dão 1 autocarro, e não 0 como segmento a segmento;
    dois com 15 ligeiros (0,75 + 0,75) dão 2. Dentro do segmento, cada grupo leva a mediana da velocidade, em km/h."""
    linhas = []
    for i in (1, 2, 3):
        linhas += [{**_linha(i, T0 + pd.Timedelta(minutes=m), "Camera", 10.0), "categoria": "D"} for m in range(7)]
    for i in (1, 2):
        linhas += [_linha(i, T0 + pd.Timedelta(minutes=m), "Camera", 5.0) for m in range(15)]
    interim = tmp_path / "interim"
    interim.mkdir()
    duckdb.from_df(pd.DataFrame(linhas)).write_parquet(str(interim / "segmentos.parquet"))
    refs = tmp_path / "reference-entities"
    refs.mkdir()
    linha = '{"type":"LineString","coordinates":[[-8.65,40.64],[-8.651,40.641]]}'
    pd.DataFrame({"entityId": [f"urn:ngsi-ld:RoadSegment:{i}" for i in (1, 2, 3)], "entityType": "RoadSegment",
                  "location": linha}).to_csv(refs / "RoadSegment.csv", index=False)
    destino = tmp_path / "processed"
    carros.calcular(interim, refs, destino, cfg)
    h = duckdb.read_parquet(str(destino / "segmentos_hora.parquet")).df().set_index("id")
    grupos = {i.rsplit(":", 1)[1]: [(g["categoria"], round(g["kmh"], 1)) for g in h.loc[i, "grupos"]] for i in h.index}
    assert sum(c == "D" for gs in grupos.values() for c, _ in gs) == 1
    assert sum(c == "B" for gs in grupos.values() for c, _ in gs) == 2
    assert grupos["1"] == [("B", 18.0), ("D", 36.0)]  # o empate dos restos desfaz-se pelo id: o autocarro fica no 1
    assert grupos["3"] == []
