"""Exportar (ADR-0008): os sensores virtuais (②) e as falhas (①) em NGSI-LD, para o ATCLL Vision.

- Os **sensores virtuais** saem na representação temporal do NGSI-LD: uma entidade por sensor de origem (o mesmo
  URN e o mesmo tipo dos dados do Living Lab) com o atributo `estimatedCount`, uma instância por hora, cada uma com
  `observedAt`, `estimated: true` e o intervalo (`lowerBound`, `upperBound`). Carrega-se com `POST /temporal/entities`.
- As **falhas** saem como entidades `Alert` (Smart Data Models), para o painel de notificações: `alertSource`
  aponta para o sensor e `validFrom`/`validTo` delimitam a falha.

A conversão é sem perda: os testes reconstroem as tabelas a partir do JSON-LD e comparam-nas com as de origem.
"""

import json
import os
import sys
from pathlib import Path

import duckdb
import pandas as pd

from riasense import sensores

CONTEXTO = ["https://uri.etsi.org/ngsi-ld/v1/ngsi-ld-core-context.jsonld"]
SUBCATEGORIA = {"rede": "falhaDeRede", "dispositivo": "falhaDeDispositivo"}


def _iso(t) -> str:
    """Instante em ISO 8601 UTC com «Z», como pede o NGSI-LD (os Parquet guardam UTC sem fuso).

    Os microssegundos só aparecem quando existem (os eventos dos segmentos têm frações de segundo): sem perda.
    """
    ts = pd.Timestamp(t)
    texto = ts.strftime("%Y-%m-%dT%H:%M:%S")
    return texto + (f".{ts.microsecond:06d}" if ts.microsecond else "") + "Z"


def _prop(valor) -> dict:
    return {"type": "Property", "value": valor}


def _instante(r) -> dict:
    """Uma hora de um sensor virtual: o valor estimado, o intervalo e a marca de estimado (sub-propriedades)."""
    return {
        "type": "Property", "value": float(r.estimativa), "observedAt": _iso(r.t),
        "estimated": _prop(bool(r.estimado)), "lowerBound": _prop(float(r.inf)), "upperBound": _prop(float(r.sup)),
        "quantity": _prop(r.grandeza), "weekend": _prop(bool(r.fim_de_semana)),
        "expectedError": _prop(float(r.erro_esperado)), "neighbours": _prop([str(v) for v in r.vizinhos]),
    }


def sensores_virtuais(df: pd.DataFrame) -> list[dict]:
    """sensores_virtuais.parquet → entidades NGSI-LD na representação temporal, uma por sensor de origem."""
    entidades = []
    for sensor, g in df.sort_values(["id", "t"]).groupby("id", sort=True):
        entidades.append({
            "id": sensor, "type": sensor.split(":")[2], "@context": CONTEXTO,
            "riasenseType": _prop(g["tipo"].iloc[0]),
            "estimatedCount": [_instante(r) for r in g.itertuples(index=False)],
        })
    return entidades


def falha(r) -> dict:
    """Uma linha de falhas.parquet → entidade `Alert` (Smart Data Models) com a fonte e o período da falha."""
    chave = f"{r.sensor.split(':', 2)[2]}:{_iso(r.inicio)}"
    alerta = {
        "id": f"urn:ngsi-ld:Alert:riasense:{chave}", "type": "Alert", "@context": CONTEXTO,
        "category": _prop("riasense"), "subCategory": _prop(SUBCATEGORIA[r.tipo]),
        "description": _prop(f"Falha inesperada ({'de rede' if r.tipo == 'rede' else 'de dispositivo'}) no sensor"),
        "alertSource": {"type": "Relationship", "object": r.sensor},
        "dateIssued": _prop(_iso(r.inicio)), "validFrom": _prop(_iso(r.inicio)), "validTo": _prop(_iso(r.fim)),
        "sensorKind": _prop(r.tipo_sensor), "durationHours": _prop(float(r.duracao_h)),
        "ongoing": _prop(bool(r.em_curso)), "unexpectedHours": _prop(float(r.horas_inesperadas)),
        "expectedEvents": _prop(float(r.eventos_esperados)), "group": _prop(int(r.grupo)),
    }
    if isinstance(r.rsu, str):  # um sensor sem RSU conhecida não leva a relação
        alerta["roadSideUnit"] = {"type": "Relationship", "object": r.rsu}
    return alerta


def falhas(df: pd.DataFrame) -> list[dict]:
    return [falha(r) for r in df.sort_values(["inicio", "sensor"]).itertuples(index=False)]


def exportar(processed: Path, destino: Path) -> dict[str, int]:
    """Escreve `destino/sensores_virtuais.jsonld` e `destino/falhas.jsonld`; devolve as entidades de cada um."""
    conversoes = {"sensores_virtuais": sensores_virtuais, "falhas": falhas}
    destino.mkdir(parents=True, exist_ok=True)
    n = {}
    for nome, converter in conversoes.items():
        caminho = processed / f"{nome}.parquet"
        if not caminho.is_file():
            passo = "completar" if nome == "sensores_virtuais" else "vigiar"
            raise FileNotFoundError(f"{caminho}: corre primeiro `riasense {passo}`")
        entidades = converter(duckdb.read_parquet(str(caminho)).df())
        (destino / f"{nome}.jsonld").write_text(json.dumps(entidades, ensure_ascii=False, indent=1), encoding="utf-8")
        n[nome] = len(entidades)
    return n


def correr(cfg: dict) -> int:
    """Subcomando `riasense exportar`: lê RIASENSE_DATA_PROCESSED e escreve em RIASENSE_DATA_PROCESSED/ngsi-ld/."""
    processed = Path(os.environ.get("RIASENSE_DATA_PROCESSED") or sensores.PROCESSED_PADRAO)
    try:
        n = exportar(processed, processed / "ngsi-ld")
    except FileNotFoundError as e:
        print(f"erro: {e}", file=sys.stderr)
        return 1
    print(f"NGSI-LD: {n['sensores_virtuais']} sensores virtuais (temporal), {n['falhas']} alertas → {processed / 'ngsi-ld'}")
    return 0
