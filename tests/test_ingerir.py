"""Ingestão: amostras pequenas no formato da exportação MongoDB do Living Lab."""

import csv
import json
import os
from datetime import datetime, timezone
from pathlib import Path

import duckdb
import pytest

from riasense import config, ingerir
from riasense.__main__ import main

CABECALHO = ["_id", "entityId", "entityType", "eventTimestamp", "recvTime", "documentJson"]


def _ms(iso: str) -> int:
    return int(datetime.fromisoformat(iso).replace(tzinfo=timezone.utc).timestamp() * 1000)


def _data(iso: str) -> dict:
    return {"$date": {"$numberLong": str(_ms(iso))}}


def _d(x: float) -> dict:
    return {"$numberDouble": str(x)}


def _escrever(pasta: Path, ficheiro: str, eventos: list[tuple[str, str, dict]]) -> None:
    """eventos: (entityId, instante ISO, campos do documento). O _id e o recvTime mudam sempre, como na exportação."""
    with open(pasta / ficheiro, "w", newline="", encoding="utf-8") as f:
        w = csv.writer(f)
        w.writerow(CABECALHO)
        for i, (entidade, iso, campos) in enumerate(eventos):
            oid = {"$oid": f"{i:024x}"}
            recv = {"$date": {"$numberLong": str(_ms(iso) + 1000 + i)}}
            doc = {"_id": oid, "entityId": entidade, "eventTimestamp": _data(iso), "recvTime": recv, **campos}
            w.writerow([json.dumps(oid), entidade, "T", json.dumps(_data(iso)), json.dumps(recv), json.dumps(doc)])


def _ler(pasta: Path, nome: str) -> list[dict]:
    rel = duckdb.sql("select * from read_parquet($p) order by all", params={"p": str(pasta / f"{nome}.parquet")})
    return [dict(zip(rel.columns, linha)) for linha in rel.fetchall()]


@pytest.fixture
def cfg():
    return config.carregar()


@pytest.fixture
def bruto(tmp_path):
    pasta = tmp_path / "brutos"
    pasta.mkdir()
    return pasta


SEG = "urn:ngsi-ld:RoadSegment:1"
CW = "urn:ngsi-ld:SmartCrosswalk:0019"
SW = "urn:ngsi-ld:Sidewalk:0037"


def _segmento(v: float, dur: float, vmax: float = 10.0) -> dict:
    return {
        "sensorType": "Camera", "vehicleCategory": "B", "averageVelocity": _d(v), "maxVelocity": _d(vmax),
        "maxAllowedVelocity": [_d(13.889)], "duration": _d(dur), "directionLane": {"$numberInt": "0"},
        "observedBy": "urn:ngsi-ld:RoadSideUnit:0030",
    }


def _travessia(trav: float, de: str = SW, para: str = SW) -> dict:
    return {"traverse_time": _d(trav), "wait_time": _d(2.0), "from": de, "to": para, "observedBy": "urn:ngsi-ld:RoadSideUnit:0030"}


def test_velocidade_invalida_passa_a_nula_e_o_veiculo_conta(bruto, tmp_path, cfg):
    _escrever(bruto, "roadsegments_stats.csv", [(SEG, "2026-11-05T12:00:00", _segmento(16383, 5.0, vmax=16383))])
    ingerir.ingerir(bruto, tmp_path / "interim", cfg, ["segmentos"])
    [linha] = _ler(tmp_path / "interim", "segmentos")
    assert linha["vel_media_ms"] is None and linha["vel_max_ms"] is None
    assert linha["vel_limite_ms"] == pytest.approx(13.889)


def test_limite_com_dois_valores_fica_o_menor(bruto, tmp_path, cfg):
    # Nos dados há 4 segmentos com 2 limites; o RoadSegment:10555 tem [13,889; 8,333] e a 1.ª posição dava 50 km/h.
    seg = _segmento(10.0, 5.0) | {"maxAllowedVelocity": [_d(13.889), _d(8.333)]}
    _escrever(bruto, "roadsegments_stats.csv", [(SEG, "2026-11-05T12:00:00", seg)])
    ingerir.ingerir(bruto, tmp_path / "interim", cfg, ["segmentos"])
    assert _ler(tmp_path / "interim", "segmentos")[0]["vel_limite_ms"] == pytest.approx(8.333)


def test_velocidades_ficam_em_m_s_sem_conversao(bruto, tmp_path, cfg):
    _escrever(bruto, "roadsegments_stats.csv", [(SEG, "2026-11-05T12:00:00", _segmento(2.73, 5.0))])
    ingerir.ingerir(bruto, tmp_path / "interim", cfg, ["segmentos"])
    assert _ler(tmp_path / "interim", "segmentos")[0]["vel_media_ms"] == pytest.approx(2.73)


def test_duracao_zero_ou_acima_de_uma_hora_passa_a_nula(bruto, tmp_path, cfg):
    eventos = [(SEG, f"2026-11-05T12:00:0{i}", _segmento(5.0, d)) for i, d in enumerate([0, 4000, 6.5])]
    _escrever(bruto, "roadsegments_stats.csv", eventos)
    ingerir.ingerir(bruto, tmp_path / "interim", cfg, ["segmentos"])
    assert [linha["duracao_s"] for linha in _ler(tmp_path / "interim", "segmentos")] == [None, None, 6.5]


def test_eventos_fora_da_janela_comum_sao_descartados(bruto, tmp_path, cfg):
    instantes = ["2026-11-03T14:59:59", "2026-11-03T15:00:00", "2026-11-10T10:59:59", "2026-11-10T11:00:00"]
    _escrever(bruto, "smartcrosswalk.csv", [(CW, iso, _travessia(4.0)) for iso in instantes])
    ingerir.ingerir(bruto, tmp_path / "interim", cfg, ["passadeiras"])
    assert [str(linha["t"]) for linha in _ler(tmp_path / "interim", "passadeiras")] == [
        "2026-11-03 15:00:00", "2026-11-10 10:59:59"]


def test_duplicados_sao_removidos_mesmo_com_id_mongo_diferente(bruto, tmp_path, cfg):
    _escrever(bruto, "smartcrosswalk.csv", [(CW, "2026-11-05T12:00:00", _travessia(4.0))] * 2)
    ingerir.ingerir(bruto, tmp_path / "interim", cfg, ["passadeiras"])
    assert len(_ler(tmp_path / "interim", "passadeiras")) == 1


def test_dois_peoes_no_mesmo_segundo_nao_sao_duplicados(bruto, tmp_path, cfg):
    _escrever(bruto, "smartcrosswalk.csv", [(CW, "2026-11-05T12:00:00", _travessia(t)) for t in (4.0, 6.0)])
    ingerir.ingerir(bruto, tmp_path / "interim", cfg, ["passadeiras"])
    assert len(_ler(tmp_path / "interim", "passadeiras")) == 2


def test_travessia_longa_ou_sem_passeio_e_descartada(bruto, tmp_path, cfg):
    eventos = [
        (CW, "2026-11-05T12:00:00", _travessia(61.0)),
        (CW, "2026-11-05T12:00:01", _travessia(4.0, de="urn:ngsi-ld:Crosswalk:0019")),
        (CW, "2026-11-05T12:00:02", _travessia(4.0)),
    ]
    _escrever(bruto, "smartcrosswalk.csv", eventos)
    ingerir.ingerir(bruto, tmp_path / "interim", cfg, ["passadeiras"])
    assert [str(linha["t"]) for linha in _ler(tmp_path / "interim", "passadeiras")] == ["2026-11-05 12:00:02"]


def test_visita_repetida_fica_a_mais_recente_e_permanencia_zero_e_nula(bruto, tmp_path, cfg):
    visita = "urn:ngsi-ld:TouristZoneVisit:abc"
    campos = {"refZone": "urn:ngsi-ld:TouristZone:0011", "entryTime": _data("2026-11-05T12:00:00"),
              "exitTime": _data("2026-11-05T12:00:03"), "observedBy": "urn:ngsi-ld:SlpCamera:038-2"}
    eventos = [
        (visita, "2026-11-05T12:00:01", {**campos, "dwellTime": {"$numberInt": "0"}}),
        (visita, "2026-11-05T12:00:03", {**campos, "dwellTime": _d(2.75)}),
        ("urn:ngsi-ld:TouristZoneVisit:def", "2026-11-05T12:00:05", {**campos, "dwellTime": {"$numberInt": "0"}}),
    ]
    _escrever(bruto, "touriststats_visits.csv", eventos)
    ingerir.ingerir(bruto, tmp_path / "interim", cfg, ["visitas"])
    linhas = _ler(tmp_path / "interim", "visitas")
    assert [(linha["id"][-3:], linha["permanencia_s"]) for linha in linhas] == [("abc", 2.75), ("def", None)]


def test_csv_em_falta_da_erro_com_o_nome_do_ficheiro(bruto, tmp_path, cfg):
    with pytest.raises(FileNotFoundError, match="smartparking.csv"):
        ingerir.ingerir(bruto, tmp_path / "interim", cfg, ["estacionamento"])


def test_comando_ingerir_sem_raw_sai_com_1(monkeypatch, capsys):
    monkeypatch.delenv("RIASENSE_DATA_RAW", raising=False)
    assert main(["ingerir"]) == 1
    assert "RIASENSE_DATA_RAW" in capsys.readouterr().err


def test_comando_ingerir_escreve_as_5_tabelas_em_interim(bruto, tmp_path, monkeypatch):
    for fonte in ingerir.FONTES.values():
        _escrever(bruto, fonte.ficheiro, [("urn:ngsi-ld:X:1", "2026-11-05T12:00:00", {})])
    monkeypatch.setenv("RIASENSE_DATA_RAW", str(bruto))
    monkeypatch.setenv("RIASENSE_DATA_INTERIM", str(tmp_path / "interim"))
    assert main(["ingerir"]) == 0
    assert sorted(p.name for p in (tmp_path / "interim").iterdir()) == sorted(f"{n}.parquet" for n in ingerir.FONTES)


@pytest.mark.integration
def test_dados_reais_limpos_e_na_janela(tmp_path, cfg):
    bruto = os.environ.get("RIASENSE_DATA_RAW")
    if not bruto:
        pytest.skip("RIASENSE_DATA_RAW não definido")
    linhas = ingerir.ingerir(Path(bruto), tmp_path, cfg)
    assert all(n > 0 for n in linhas.values()), linhas
    con = duckdb.connect()
    seg = str(tmp_path / "segmentos.parquet")
    invalidas = con.execute(
        "select count(*) from read_parquet(?) where vel_media_ms = ? or vel_max_ms = ? or duracao_s = 0",
        [seg, cfg["ingerir"]["velocidade_invalida"], cfg["ingerir"]["velocidade_invalida"]]).fetchall()[0][0]
    assert invalidas == 0
    for nome in ingerir.FONTES:
        t_min, t_max = con.execute("select min(t), max(t) from read_parquet(?)", [str(tmp_path / f"{nome}.parquet")]).fetchall()[0]
        assert str(t_min) >= cfg["periodo_dados"]["inicio"].replace("T", " ")
        assert str(t_max) < cfg["periodo_dados"]["fim"].replace("T", " ")
    visitas = str(tmp_path / "visitas.parquet")
    assert con.execute("select count(*) - count(distinct id) from read_parquet(?)", [visitas]).fetchall()[0][0] == 0
