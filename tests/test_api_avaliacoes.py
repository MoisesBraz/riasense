"""Endpoints do próximo sensor e das avaliações da ② e da ③, sobre Parquet de amostra."""

import shutil

import duckdb
import pytest
from fastapi.testclient import TestClient

from app import app
from riasense import config

cliente = TestClient(app)
SC = "urn:ngsi-ld:SmartCrosswalk:00{}"

AMOSTRAS = {
    "proximo_sensor": f"""select * from (values
        ('{SC.format(16)}', 'passadeira', 1, 'ranking', 0.70, 0.36, 0.34, 'Os 5 vizinhos explicam mal este local…'),
        ('{SC.format(24)}', 'passadeira', 2, 'ranking', 0.64, 0.36, 0.28, '…'),
        ('{SC.format(23)}', 'passadeira', null, 'verificar o sensor', 5.81, 0.36, null, 'Verificar o sensor: …'),
        ('urn:ngsi-ld:TouristZone:0011', 'zona', 1, 'ranking', 0.44, 0.28, 0.16, '…'))
        t(id, tipo, ordem, motivo, erro, mediana_tipo, reducao_potencial, frase)""",
    "avaliacao_completar": """select * from (values
        ('deixar_um_de_fora', 'passadeira', 'razao', 'todos', 0.36),
        ('deixar_um_de_fora', 'passadeira', 'referencia', 'todos', 0.62),
        ('simulacao', 'passadeira', 'razao', 'fim_de_semana', 0.52),
        ('simulacao', 'zona', 'razao', 'todos', 0.28)) t(cenario, tipo, modelo, dias, erro_mediano)""",
    "avaliacao_prever": """select * from (values
        (3, 'passadeira', 0.617, 0.720, 0.557, true), (3, 'zona', 0.677, 0.715, 0.475, true),
        (6, 'zona', 0.677, 1.287, 0.505, true))
        t(horizonte_h, tipo, erro_referencia, erro_persistencia, erro_sem_meteo, ganha)""",
    # ADR-0027: o mesmo sensor e hora com uma previsão por horizonte.
    "previsoes": f"""select * from (values
        (3, '{SC.format(16)}', timestamp '2026-11-10 12:00', 'passadeira', 40.0, 22.0, 61.0),
        (6, '{SC.format(16)}', timestamp '2026-11-10 12:00', 'passadeira', 35.0, 15.0, 58.0),
        (3, '{SC.format(24)}', timestamp '2026-11-10 12:00', 'passadeira', 20.0, 6.0, 33.0))
        t(horizonte_h, id, t, tipo, previsao, p10, p90)""",
}


@pytest.fixture(autouse=True)
def resultados(tmp_path, monkeypatch):
    shutil.copy(config.CAMINHO_PADRAO, tmp_path / "riasense.yaml")
    pasta = tmp_path / "processed"
    pasta.mkdir()
    for nome, sql in AMOSTRAS.items():
        duckdb.sql(sql).write_parquet(str(pasta / f"{nome}.parquet"))
    monkeypatch.setenv("RIASENSE_CONFIG", str(tmp_path / "riasense.yaml"))
    monkeypatch.setenv("RIASENSE_DATA_PROCESSED", str(pasta))
    return pasta


def _dados(url: str, **params) -> list[dict]:
    r = cliente.get(url, params=params)
    assert r.status_code == 200, r.text
    return r.json()["dados"]


def test_proximo_sensor_por_tipo_e_ordem_com_os_verificar_no_fim():
    ids = [d["id"] for d in _dados("/completar/proximo-sensor", tipo="passadeira")]
    assert ids == [SC.format(16), SC.format(24), SC.format(23)]


def test_proximo_sensor_filtra_o_motivo_e_limita():
    [d] = _dados("/completar/proximo-sensor", motivo="verificar o sensor")
    assert d["id"] == SC.format(23) and d["reducao_potencial"] is None and d["ordem"] is None
    assert len(_dados("/completar/proximo-sensor", motivo="ranking", limite=2)) == 2


def test_avaliacao_da_completar_filtra_cenario_tipo_e_dias():
    linhas = _dados("/completar/avaliacao", cenario="deixar_um_de_fora", tipo="passadeira", dias="todos")
    assert {d["modelo"]: d["erro_mediano"] for d in linhas} == {"razao": 0.36, "referencia": 0.62}


def test_avaliacao_da_prever_por_tipo_e_horizonte():
    assert [d["horizonte_h"] for d in _dados("/prever/avaliacao", tipo="zona")] == [3, 6]
    assert _dados("/prever/avaliacao", tipo="zona", horizonte_h=6) == [{
        "horizonte_h": 6, "tipo": "zona", "erro_referencia": 0.677, "erro_persistencia": 1.287,
        "erro_sem_meteo": 0.505, "ganha": True}]
    assert len(_dados("/prever/avaliacao")) == 3  # sem o parâmetro, todos os horizontes


def test_previsoes_filtram_o_horizonte_e_sem_ele_vem_um_por_horizonte():
    assert [d["horizonte_h"] for d in _dados("/prever/previsoes", sensor=SC.format(16))] == [3, 6]
    linhas = _dados("/prever/previsoes", horizonte_h=3)
    assert [(d["id"], d["previsao"]) for d in linhas] == [(SC.format(16), 40.0), (SC.format(24), 20.0)]
    assert [(d["p10"], d["p90"]) for d in linhas] == [(22.0, 61.0), (6.0, 33.0)]  # o intervalo da ③ (ADR-0035)
    assert _dados("/prever/previsoes", horizonte_h=12) == []


@pytest.mark.parametrize(("url", "params"), [
    ("/completar/proximo-sensor", {"tipo": "segmento"}),  # os segmentos ficam fora do ranking (ADR-0015)
    ("/completar/proximo-sensor", {"motivo": "avariado"}),
    ("/completar/avaliacao", {"cenario": "outro"}),
    ("/completar/avaliacao", {"dias": "sabado"}),
    ("/prever/avaliacao", {"tipo": "camara"}),
    ("/prever/avaliacao", {"limite": 0}),
    ("/prever/avaliacao", {"horizonte_h": 0}),
    ("/prever/previsoes", {"horizonte_h": "tres"}),
    ("/prever/previsoes", {"horizonte_h": 25}),
])
def test_valores_fora_da_lista_dao_422(url, params):
    assert cliente.get(url, params=params).status_code == 422


@pytest.mark.parametrize(("url", "ficheiro"), [
    ("/completar/proximo-sensor", "proximo_sensor"),
    ("/completar/avaliacao", "avaliacao_completar"),
    ("/prever/avaliacao", "avaliacao_prever"),
])
def test_sem_o_parquet_responde_503_com_o_passo(url, ficheiro, resultados):
    (resultados / f"{ficheiro}.parquet").unlink()
    r = cliente.get(url)
    assert r.status_code == 503 and r.json()["estado"] == "por calcular" and "riasense" in r.json()["motivo"]
