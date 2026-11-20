"""Ingestão (ADR-0003): CSV do Living Lab → tabelas limpas em Parquet, em data/interim/.

Os CSV são exportações MongoDB de entidades NGSI: os campos úteis estão em `documentJson`, em Extended JSON.
O DuckDB lê-os em streaming. As regras de limpeza seguem o `perfil-dos-dados.md`, exceto as unidades:
as velocidades estão todas em m/s e não se convertem (convenções do README).
"""

import os
import sys
from dataclasses import dataclass, field
from pathlib import Path

import duckdb

from riasense import config

INTERIM_PADRAO = config.RAIZ / "data" / "interim"


def _num(campo: str) -> str:
    """Número em Extended JSON ({"$numberDouble": "1.5"}, $numberInt, $numberLong) ou JSON simples."""
    tipos = ["numberDouble", "numberInt", "numberLong"]
    partes = [f"try_cast(json_extract_string(documentJson, '$.{campo}.\"${t}\"') as double)" for t in tipos]
    partes.append(f"try_cast(json_extract_string(documentJson, '$.{campo}') as double)")
    return f"coalesce({', '.join(partes)})"


def _min_lista(campo: str) -> str:
    """Menor número de uma lista em Extended JSON. Há segmentos com 2 limites diferentes (50 e 30 km/h): vale o menor."""
    tipos = ["numberDouble", "numberInt", "numberLong"]
    partes = [f"try_cast(x->>'$.\"${t}\"' as double)" for t in tipos] + ["try_cast(x->>'$' as double)"]
    return f"list_min(list_transform(json_extract(documentJson, '$.{campo}[*]'), lambda x: coalesce({', '.join(partes)})))"


def _instante(campo: str) -> str:
    """Data em Extended JSON ({"$date": {"$numberLong": epoch-ms}}) → TIMESTAMP em UTC (= hora local em novembro)."""
    return f"make_timestamp(cast(json_extract_string(documentJson, '$.{campo}.\"$date\".\"$numberLong\"') as bigint) * 1000)"


def _texto(campo: str) -> str:
    return f"json_extract_string(documentJson, '$.{campo}')"


@dataclass(frozen=True)
class Fonte:
    """Uma fonte do Living Lab: que colunas extrair, que linhas descartar e o que conta como duplicado."""

    ficheiro: str
    colunas: dict[str, str]  # nome da coluna → expressão SQL sobre `documentJson`
    limpeza: dict[str, str] = field(default_factory=dict)  # valores inválidos → nulo, mantendo a linha
    filtro: str = "true"  # linhas inválidas, descartadas
    unico_por: str | None = None  # None: duplicado = linha igual em todas as colunas


FONTES = {
    "segmentos": Fonte(
        ficheiro="roadsegments_stats.csv",
        colunas={
            "id": "entityId",
            "t": _instante("eventTimestamp"),
            "sensor": _texto("sensorType"),
            "categoria": _texto("vehicleCategory"),
            "vel_media_ms": _num("averageVelocity"),
            "vel_max_ms": _num("maxVelocity"),
            "vel_limite_ms": _min_lista("maxAllowedVelocity"),
            "duracao_s": _num("duration"),
            "faixa": _num("directionLane"),
            "rsu": _texto("observedBy"),
        },
        # A linha conta como passagem de um veículo, mesmo quando a velocidade ou a duração são inválidas.
        limpeza={
            "vel_media_ms": "nullif(vel_media_ms, $velocidade_invalida)",
            "vel_max_ms": "nullif(vel_max_ms, $velocidade_invalida)",
            "duracao_s": "case when duracao_s > 0 and duracao_s <= $duracao_max_s then duracao_s end",
        },
    ),
    "passadeiras": Fonte(
        ficheiro="smartcrosswalk.csv",
        colunas={
            "id": "entityId",
            "t": _instante("eventTimestamp"),
            "travessia_s": _num("traverse_time"),
            "espera_s": _num("wait_time"),  # nulo em ~42% das linhas: as médias usam só os presentes
            "de": _texto("from"),
            "para": _texto("to"),
            "rsu": _texto("observedBy"),
        },
        filtro=(
            "coalesce(travessia_s, 0) <= $travessia_max_s"
            " and coalesce(de, 'urn:ngsi-ld:Sidewalk:') like 'urn:ngsi-ld:Sidewalk:%'"
            " and coalesce(para, 'urn:ngsi-ld:Sidewalk:') like 'urn:ngsi-ld:Sidewalk:%'"
        ),
    ),
    "estacionamento": Fonte(
        ficheiro="smartparking.csv",
        colunas={
            "id": "entityId",
            "t": _instante("eventTimestamp"),
            "estado": _texto("status"),
            "duracao_s": _num("duration"),  # tempo no estado anterior; 0 é válido aqui
            "rsu": _texto("refDevice"),
            "lon": _num("location.coordinates[0]"),
            "lat": _num("location.coordinates[1]"),
        },
    ),
    "visitas": Fonte(
        ficheiro="touriststats_visits.csv",
        colunas={
            "id": "entityId",
            "t": _instante("eventTimestamp"),
            "zona": _texto("refZone"),
            "entrada": _instante("entryTime"),
            "saida": _instante("exitTime"),
            "permanencia_s": _num("dwellTime"),
            "camara": _texto("observedBy"),
        },
        # A visita conta, mas a permanência 0 não é uma duração.
        limpeza={"permanencia_s": "nullif(permanencia_s, 0)"},
        # A mesma visita chega 2 vezes (a 1.ª com permanência 0): fica a mais recente.
        unico_por="id",
    ),
    "transicoes": Fonte(
        ficheiro="touriststats_transitions.csv",
        colunas={
            "id": "entityId",
            "t": _instante("eventTimestamp"),
            "zona_origem": _texto("refOriginZone"),
            "zona_destino": _texto("refDestinationZone"),
            "visita_origem": _texto("refOriginVisit"),
            "visita_destino": _texto("refDestinationVisit"),
        },
        unico_por="id",
    ),
}


def _sql(fonte: Fonte) -> str:
    """Consulta de uma fonte sobre a vista `bruto`. Só junta texto fixo deste módulo; os valores vão como parâmetros."""
    colunas = ", ".join(f"{expr} as {nome}" for nome, expr in fonte.colunas.items())
    substitui = f" replace ({', '.join(f'{e} as {n}' for n, e in fonte.limpeza.items())})" if fonte.limpeza else ""
    distinto = "" if fonte.unico_por else "distinct "
    qualifica = f" qualify row_number() over (partition by {fonte.unico_por} order by t desc) = 1" if fonte.unico_por else ""
    return (
        f"select {distinto}*{substitui} from (select {colunas} from bruto)"
        f" where t >= cast($inicio as timestamp) and t < cast($fim as timestamp)"
        f" and ({fonte.filtro}){qualifica} order by id, t"
    )


def _parametros(cfg: dict) -> dict:
    regras = cfg["ingerir"]
    return {
        "inicio": cfg["periodo_dados"]["inicio"],
        "fim": cfg["periodo_dados"]["fim"],
        "velocidade_invalida": regras["velocidade_invalida"],
        "duracao_max_s": regras["duracao_max_s"],
        "travessia_max_s": regras["travessia_max_s"],
    }


def ingerir_fonte(con: duckdb.DuckDBPyConnection, nome: str, bruto: Path, destino: Path, cfg: dict) -> int:
    """Lê um CSV, limpa-o na janela comum e escreve `destino/<nome>.parquet`. Devolve o número de linhas."""
    fonte = FONTES[nome]
    caminho = bruto / fonte.ficheiro
    if not caminho.is_file():
        raise FileNotFoundError(f"{caminho}: CSV em falta em RIASENSE_DATA_RAW")
    con.register("bruto", con.read_csv(str(caminho), all_varchar=True, header=True, max_line_size=10_000_000))
    sql = _sql(fonte)
    # O DuckDB recusa parâmetros a mais: passam só os que a consulta usa.
    params = {k: v for k, v in _parametros(cfg).items() if f"${k}" in sql}
    saida = destino / f"{nome}.parquet"
    con.sql(sql, params=params).write_parquet(str(saida))
    con.unregister("bruto")
    # fetchall e não fetchone: no DuckDB 2 um resultado por esgotar bloqueia a ligação para a fonte seguinte.
    return con.execute("select count(*) from read_parquet(?)", [str(saida)]).fetchall()[0][0]


def ingerir(bruto: Path, destino: Path, cfg: dict, nomes: list[str] | None = None) -> dict[str, int]:
    """Ingere as fontes pedidas (por omissão, as 5) e devolve as linhas escritas por fonte."""
    destino.mkdir(parents=True, exist_ok=True)
    con = duckdb.connect()
    try:
        return {nome: ingerir_fonte(con, nome, bruto, destino, cfg) for nome in (nomes or list(FONTES))}
    finally:
        con.close()


def correr(cfg: dict) -> int:
    """Subcomando `riasense ingerir`: lê RIASENSE_DATA_RAW e escreve em RIASENSE_DATA_INTERIM."""
    bruto = os.environ.get("RIASENSE_DATA_RAW")
    if not bruto or not Path(bruto).is_dir():
        print("erro: RIASENSE_DATA_RAW tem de apontar para a pasta dos CSV do Living Lab", file=sys.stderr)
        return 1
    destino = Path(os.environ.get("RIASENSE_DATA_INTERIM") or INTERIM_PADRAO)
    try:
        linhas = ingerir(Path(bruto), destino, cfg)
    except FileNotFoundError as e:
        print(f"erro: {e}", file=sys.stderr)
        return 1
    for nome, n in linhas.items():
        print(f"{nome}: {n} linhas → {destino / (nome + '.parquet')}")
    return 0
