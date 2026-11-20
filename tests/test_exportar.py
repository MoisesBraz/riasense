"""Exportar em NGSI-LD (ADR-0008): estrutura válida e conversão sem perda a partir dos Parquet."""

import json
import re

import duckdb
import pandas as pd
import pytest

from riasense import config, exportar
from riasense.__main__ import main

URN = re.compile(r"^urn:ngsi-ld:[A-Za-z]+:\S+$")
ISO_Z = re.compile(r"^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d{6})?Z$")
PROCESSED = config.RAIZ / "data" / "processed"


def _validar_atributo(nome: str, a: dict) -> None:
    """Regras do NGSI-LD que usamos: Property com `value`, Relationship com `object` (URN), `observedAt` em ISO Z."""
    assert a["type"] in ("Property", "Relationship"), nome
    if a["type"] == "Property":
        assert "value" in a, nome
    else:
        assert URN.match(a["object"]), (nome, a["object"])
    if "observedAt" in a:
        assert ISO_Z.match(a["observedAt"]), a["observedAt"]
    for sub, valor in a.items():
        if isinstance(valor, dict):
            _validar_atributo(f"{nome}.{sub}", valor)


def validar_entidade(e: dict) -> None:
    assert URN.match(e["id"]) and isinstance(e["type"], str) and e["@context"] == exportar.CONTEXTO
    for nome, atributo in e.items():
        if nome in ("id", "type", "@context"):
            continue
        for instancia in atributo if isinstance(atributo, list) else [atributo]:
            _validar_atributo(nome, instancia)


VIRTUAIS = pd.DataFrame({
    "id": ["urn:ngsi-ld:SmartCrosswalk:0019"] * 2 + ["urn:ngsi-ld:TouristZone:0001"],
    "tipo": ["passadeira", "passadeira", "zona"], "grandeza": ["travessias", "travessias", "visitas"],
    "t": pd.to_datetime(["2026-11-05 10:00", "2026-11-05 11:00", "2026-11-05 10:00"]),
    "estimativa": [12.5, 0.0, 3.0], "inf": [8.0, 0.0, 1.0], "sup": [17.0, 1.2, 5.0], "estimado": True,
    "fim_de_semana": False, "erro_esperado": [0.32, 0.32, 0.25],
    "vizinhos": [["urn:ngsi-ld:SmartCrosswalk:0024"]] * 2 + [["urn:ngsi-ld:TouristZone:0005"]],
})
FALHAS = pd.DataFrame({
    "sensor": ["urn:ngsi-ld:SmartCrosswalk:0019", "urn:ngsi-ld:RoadSegment:10566"],
    "tipo_sensor": ["passadeira", "segmento"], "rsu": ["urn:ngsi-ld:RoadSideUnit:0030", None],
    "inicio": pd.to_datetime(["2026-11-04 20:06:29", "2026-11-04 12:47:11"]),
    "fim": pd.to_datetime(["2026-11-10 11:00:00", "2026-11-04 14:59:32"]),
    "duracao_h": [134.89, 2.2], "em_curso": [True, False], "horas_inesperadas": [80.89, 2.21],
    "eventos_esperados": [7894.3, 40.0], "tipo": ["rede", "dispositivo"], "grupo": [3, 2],
})


def test_sensor_virtual_e_uma_entidade_temporal_com_estimado_e_intervalo():
    [e, _] = exportar.sensores_virtuais(VIRTUAIS)
    validar_entidade(e)
    assert (e["id"], e["type"]) == ("urn:ngsi-ld:SmartCrosswalk:0019", "SmartCrosswalk")
    primeira = e["estimatedCount"][0]
    assert primeira["observedAt"] == "2026-11-05T10:00:00Z" and primeira["estimated"]["value"] is True
    assert (primeira["lowerBound"]["value"], primeira["value"], primeira["upperBound"]["value"]) == (8.0, 12.5, 17.0)


def test_falha_e_um_alerta_com_a_fonte_e_o_periodo():
    alertas = exportar.falhas(FALHAS)
    for a in alertas:
        validar_entidade(a)
    rede = next(a for a in alertas if a["subCategory"]["value"] == "falhaDeRede")
    assert rede["type"] == "Alert" and rede["alertSource"]["object"] == "urn:ngsi-ld:SmartCrosswalk:0019"
    assert (rede["validFrom"]["value"], rede["validTo"]["value"]) == ("2026-11-04T20:06:29Z", "2026-11-10T11:00:00Z")
    assert rede["roadSideUnit"]["object"] == "urn:ngsi-ld:RoadSideUnit:0030"
    assert "roadSideUnit" not in next(a for a in alertas if a is not rede)  # sem RSU conhecida


COLUNAS_VIRTUAIS = ["id", "tipo", "grandeza", "t", "estimativa", "inf", "sup", "estimado", "fim_de_semana",
                    "erro_esperado", "vizinhos"]
COLUNAS_FALHAS = ["sensor", "tipo_sensor", "rsu", "inicio", "fim", "duracao_h", "em_curso", "horas_inesperadas",
                  "eventos_esperados", "tipo", "grupo"]


def _t(texto: str) -> pd.Timestamp:
    return pd.Timestamp(texto.removesuffix("Z"))


def _importar_sensores_virtuais(entidades: list[dict]) -> pd.DataFrame:
    """O inverso de `sensores_virtuais`: a prova de que a conversão não perde nada."""
    linhas = [
        {"id": e["id"], "tipo": e["riasenseType"]["value"], "grandeza": i["quantity"]["value"], "t": _t(i["observedAt"]),
         "estimativa": i["value"], "inf": i["lowerBound"]["value"], "sup": i["upperBound"]["value"],
         "estimado": i["estimated"]["value"], "fim_de_semana": i["weekend"]["value"],
         "erro_esperado": i["expectedError"]["value"], "vizinhos": i["neighbours"]["value"]}
        for e in entidades for i in e["estimatedCount"]
    ]
    return pd.DataFrame(linhas, columns=COLUNAS_VIRTUAIS)


def _importar_falhas(alertas: list[dict]) -> pd.DataFrame:
    """O inverso de `falhas`."""
    tipo = {v: k for k, v in exportar.SUBCATEGORIA.items()}
    linhas = [
        {"sensor": a["alertSource"]["object"], "tipo_sensor": a["sensorKind"]["value"],
         "rsu": a.get("roadSideUnit", {}).get("object"), "inicio": _t(a["validFrom"]["value"]),
         "fim": _t(a["validTo"]["value"]), "duracao_h": a["durationHours"]["value"], "em_curso": a["ongoing"]["value"],
         "horas_inesperadas": a["unexpectedHours"]["value"], "eventos_esperados": a["expectedEvents"]["value"],
         "tipo": tipo[a["subCategory"]["value"]], "grupo": a["group"]["value"]}
        for a in alertas
    ]
    return pd.DataFrame(linhas, columns=COLUNAS_FALHAS)


def _iguais(a: pd.DataFrame, b: pd.DataFrame, chave: list[str]) -> None:
    a, b = (x.sort_values(chave).reset_index(drop=True) for x in (a, b))
    pd.testing.assert_frame_equal(a, b, check_dtype=False)


def test_conversao_sem_perda_ida_e_volta():
    _iguais(_importar_sensores_virtuais(exportar.sensores_virtuais(VIRTUAIS)), VIRTUAIS, ["id", "t"])
    _iguais(_importar_falhas(exportar.falhas(FALHAS)), FALHAS, ["sensor", "inicio"])


def test_comando_escreve_os_dois_jsonld(tmp_path, monkeypatch):
    duckdb.from_df(VIRTUAIS).write_parquet(str(tmp_path / "sensores_virtuais.parquet"))
    duckdb.from_df(FALHAS).write_parquet(str(tmp_path / "falhas.parquet"))
    monkeypatch.setenv("RIASENSE_DATA_PROCESSED", str(tmp_path))
    assert main(["exportar"]) == 0
    entidades = json.loads((tmp_path / "ngsi-ld" / "sensores_virtuais.jsonld").read_text(encoding="utf-8"))
    assert len(entidades) == 2 and len(json.loads((tmp_path / "ngsi-ld" / "falhas.jsonld").read_text())) == 2


def test_comando_sem_parquet_sai_com_1(tmp_path, monkeypatch, capsys):
    monkeypatch.setenv("RIASENSE_DATA_PROCESSED", str(tmp_path))
    assert main(["exportar"]) == 1
    assert "riasense completar" in capsys.readouterr().err


@pytest.mark.skipif(not PROCESSED.exists(), reason="sem data/processed/ nesta cópia: ver «Os dados desta cópia» no README")
@pytest.mark.parametrize("nome", ["sensores_virtuais", "falhas"])
def test_parquet_versionados_convertem_sem_perda_e_validos(nome):
    """Os Parquet reais de data/processed: cada entidade é válida e a volta dá a mesma tabela."""
    df = duckdb.read_parquet(str(PROCESSED / f"{nome}.parquet")).df()
    if nome == "sensores_virtuais":
        entidades, volta, chave = exportar.sensores_virtuais(df), _importar_sensores_virtuais, ["id", "t"]
    else:
        entidades, volta, chave = exportar.falhas(df), _importar_falhas, ["sensor", "inicio"]
    for e in entidades:
        validar_entidade(e)
    original = df[volta(entidades).columns]
    if nome == "sensores_virtuais":
        original = original.assign(vizinhos=original["vizinhos"].map(list))
    _iguais(volta(json.loads(json.dumps(entidades))), original, chave)
