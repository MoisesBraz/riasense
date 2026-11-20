import shutil

import pytest
from fastapi.testclient import TestClient

from app import app
from riasense import config

cliente = TestClient(app)


def test_health_responde_ok():
    r = cliente.get("/health")
    assert r.status_code == 200 and r.json() == {"estado": "ok"}


@pytest.fixture(autouse=True)
def ambiente_isolado(tmp_path, monkeypatch):
    """Config e pasta de resultados próprias, para não depender das variáveis do shell."""
    shutil.copy(config.CAMINHO_PADRAO, tmp_path / "riasense.yaml")
    (tmp_path / "processed").mkdir()
    monkeypatch.setenv("RIASENSE_CONFIG", str(tmp_path / "riasense.yaml"))
    monkeypatch.setenv("RIASENSE_DATA_PROCESSED", str(tmp_path / "processed"))


def test_ready_com_config_e_pasta_validas():
    assert cliente.get("/ready").status_code == 200


def test_ready_indisponivel_com_config_invalida(tmp_path, monkeypatch):
    f = tmp_path / "riasense.yaml"
    f.write_text("cidade: Aveiro\n", encoding="utf-8")
    monkeypatch.setenv("RIASENSE_CONFIG", str(f))
    r = cliente.get("/ready")
    assert r.status_code == 503 and "fuso_horario" in r.json()["motivo"]


def test_ready_indisponivel_sem_pasta_de_resultados(tmp_path, monkeypatch):
    monkeypatch.setenv("RIASENSE_DATA_PROCESSED", str(tmp_path / "nao-existe"))
    assert cliente.get("/ready").status_code == 503


@pytest.mark.parametrize(("url", "ficheiro"), [("/mapa/ruas-com-sensor", "ruas_com_sensor.geojson"),
                                               ("/mapa/segmentos-carros", "segmentos_carros.geojson")])
def test_geojson_do_mapa_le_o_ficheiro_ou_diz_por_calcular(tmp_path, url, ficheiro):
    assert cliente.get(url).status_code == 503  # sem `riasense carros`
    geo = '{"type": "FeatureCollection", "features": []}'
    (tmp_path / "processed" / ficheiro).write_text(geo, encoding="utf-8")
    r = cliente.get(url)
    assert r.status_code == 200 and r.json()["type"] == "FeatureCollection"


def test_cors_so_para_a_web_de_desenvolvimento_local():
    """Na VM a web e a API têm a mesma origem: um site qualquer não recebe autorização CORS (achado da auditoria)."""
    local = cliente.get("/health", headers={"Origin": "http://localhost:5173"})
    assert local.headers.get("access-control-allow-origin") == "http://localhost:5173"
    alheio = cliente.get("/health", headers={"Origin": "https://exemplo.invalid"})
    assert "access-control-allow-origin" not in alheio.headers


def test_alerta_da_falha_devolve_o_alert_do_jsonld_tal_como_esta(tmp_path):
    """ADR-0053, ponto 2: o botão «Copiar alerta NGSI-LD» copia o `Alert` que `riasense exportar` já escreveu, sem formato novo."""
    import json

    import pandas as pd

    from riasense import exportar

    url = "/vigiar/falhas/alerta"
    params = {"sensor": "SmartCrosswalk:0001", "inicio": "2026-11-04T20:06:12.250000"}
    assert cliente.get(url, params=params).status_code == 503  # sem `riasense exportar`
    df = pd.DataFrame([
        ["urn:ngsi-ld:SmartCrosswalk:0001", "passadeira", "urn:ngsi-ld:RoadSideUnit:0001", pd.Timestamp("2026-11-04T20:06:12.25"),
         pd.Timestamp("2026-11-05T01:00:00"), 4.9, False, 2.0, 30.0, "rede", 1],
        ["urn:ngsi-ld:SmartCrosswalk:0001", "passadeira", "urn:ngsi-ld:RoadSideUnit:0001", pd.Timestamp("2026-11-06T08:00:00"),
         pd.Timestamp("2026-11-06T10:00:00"), 2.0, True, 2.0, 12.0, "dispositivo", 2],
        ["urn:ngsi-ld:RoadSideUnit:0001", "estacionamento", "urn:ngsi-ld:RoadSideUnit:0001", pd.Timestamp("2026-11-04T20:06:12.25"),
         pd.Timestamp("2026-11-05T01:00:00"), 4.9, False, 2.0, 30.0, "rede", 1],
    ], columns=["sensor", "tipo_sensor", "rsu", "inicio", "fim", "duracao_h", "em_curso", "horas_inesperadas",
                       "eventos_esperados", "tipo", "grupo"])
    (tmp_path / "processed" / "ngsi-ld").mkdir()
    alertas = exportar.falhas(df)
    (tmp_path / "processed" / "ngsi-ld" / "falhas.jsonld").write_text(json.dumps(alertas), encoding="utf-8")

    r = cliente.get(url, params=params)
    assert r.status_code == 200
    assert r.json()["dados"] == [a for a in alertas if a["id"] == "urn:ngsi-ld:Alert:riasense:SmartCrosswalk:0001:2026-11-04T20:06:12.250000Z"]
    # O URN completo também serve, e uma hora sem falha não devolve nenhum.
    assert r.json() == cliente.get(url, params={**params, "sensor": "urn:ngsi-ld:SmartCrosswalk:0001"}).json()
    assert cliente.get(url, params={**params, "inicio": "2026-11-04T20:06:13"}).json()["dados"] == []
    assert cliente.get(url, params={"sensor": "SmartCrosswalk:0001"}).status_code == 422


def _parquet(destino, linhas: list[dict]):
    """Escreve linhas inventadas num Parquet, pelo DuckDB (o projeto não tem pyarrow)."""
    import duckdb
    import pandas as pd

    df = pd.DataFrame(linhas)  # noqa: F841 (o DuckDB lê-o pelo nome)
    duckdb.sql(f"copy (select * from df) to '{destino}' (format parquet)")


def test_boletim_da_camara_com_dados_inventados(tmp_path):
    """ADR-0052, ponto 2: a média de todas as horas por passadeira, o empate pelo id, as horas medidas e o semáforo."""
    assert cliente.get("/proteger/boletim").status_code == 503  # sem os Parquet
    pasta = tmp_path / "processed"
    u = "urn:ngsi-ld:SmartCrosswalk:"
    risco = [
        # A 0001 e a 0003 empatam na média (0,6): fica primeiro a do id menor. A 0004 tem a maior média, com 1 hora estimada.
        *({"id": u + "0001", "risco_potencial": r, "estimado": False, "semaforo": False} for r in (0.4, 0.8)),
        *({"id": u + "0003", "risco_potencial": 0.6, "estimado": False, "semaforo": True} for _ in range(2)),
        {"id": u + "0004", "risco_potencial": 0.9, "estimado": True, "semaforo": False},
        {"id": u + "0004", "risco_potencial": 0.7, "estimado": False, "semaforo": False},
        *({"id": u + "0002", "risco_potencial": 0.5, "estimado": False, "semaforo": False} for _ in range(2)),
    ]
    _parquet(pasta / "risco_potencial.parquet", risco)
    zona = ["0019", "0020", "0021", "0022"]
    _parquet(pasta / "proteger_passadeiras.parquet", [
        {"id": u + p, "pct_acima_limite_movimentados": mov, "pct_acima_limite_calmos": calm, "semaforo": sem}
        for p, mov, calm, sem in [("0019", 22.6, 36.9, False), ("0020", 23.0, 33.0, True), ("0021", 23.5, 35.3, True),
                                  ("0022", 23.8, 34.0, False), ("0011", 50.0, 1.0, True)]])
    s = "urn:ngsi-ld:RoadSegment:"
    _parquet(pasta / "passadeira_segmentos.parquet", [{"passadeira": u + p, "segmento": s + sg} for p in zona for sg in ("1", "2", "3")]
             + [{"passadeira": u + "0011", "segmento": s + "4"}])
    _parquet(pasta / "segmentos_hora.parquet", [{"id": s + sg, "sensor": sensor} for sg, sensor in
                                                [("1", "Radar"), ("2", "Camera"), ("3", "Radar"), ("4", "Radar")]])
    r = cliente.get("/proteger/boletim")
    assert r.status_code == 200
    b = r.json()["dados"][0]
    assert [(t["id"][-4:], round(t["risco_medio"], 2), t["horas_medidas"], t["horas"], t["semaforo"]) for t in b["top"]] == [
        ("0004", 0.8, 1, 2, False), ("0001", 0.6, 2, 2, False), ("0003", 0.6, 2, 2, True)]
    assert b["zona"]["com_dados"] == 4
    assert b["zona"]["acima_limite_movimentados"] == [22.6, 23.8] and b["zona"]["acima_limite_calmos"] == [33.0, 36.9]
    assert b["zona"]["radar"] == [{"segmento": s + "1", "passadeiras": 4}, {"segmento": s + "3", "passadeiras": 4}]
    assert [i[-4:] for i in b["semaforos"]] == ["0011", "0020", "0021"]


@pytest.mark.skipif(not (config.RAIZ / "data" / "processed" / "risco_potencial.parquet").exists(), reason="sem data/processed/ nesta cópia: ver «Os dados desta cópia» no README")
def test_boletim_da_camara_bate_com_os_parquet_versionados(tmp_path):
    """O top 3 e a zona com os dados da semana (data/processed, versionados), como no ADR-0052: SC0002, SC0019 e SC0007."""
    for f in ("risco_potencial", "proteger_passadeiras", "passadeira_segmentos", "segmentos_hora"):
        shutil.copy(config.RAIZ / "data" / "processed" / f"{f}.parquet", tmp_path / "processed")
    b = cliente.get("/proteger/boletim").json()["dados"][0]
    assert [(t["id"].split(":")[-1], round(t["risco_medio"], 2), t["horas_medidas"], t["horas"], t["semaforo"]) for t in b["top"]] == [
        ("0002", 0.79, 164, 164, False), ("0019", 0.78, 29, 164, False), ("0007", 0.75, 164, 164, False)]
    z = b["zona"]
    assert [round(v) for v in z["acima_limite_movimentados"]] == [23, 24]
    assert [round(v) for v in z["acima_limite_calmos"]] == [33, 37]
    assert [(g["segmento"].split(":")[-1], g["passadeiras"]) for g in z["radar"]] == [("10084", 4), ("11168", 4)]
    assert [i.split(":")[-1] for i in b["semaforos"]] == ["0011", "0012", "0013", "0020", "0021"]
