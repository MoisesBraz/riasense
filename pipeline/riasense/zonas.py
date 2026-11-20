"""As visitas medidas por zona turística e por hora, para o mapa de calor dos peões (ADR-0047, ponto 2).

Lê `data/interim/visitas.parquet` (do `riasense ingerir`) e escreve `data/processed/zonas_hora.parquet`, com `id` (a
zona), `t` (o início da hora) e `visitas`: as visitas que entraram nessa hora (ADR-0047, ponto 4), só na janela
`periodo_dados`. Como no `segmentos_hora.parquet`, só há linha nas horas com visitas. Nada se estima: nas horas de falha, o
mapa usa a ② (`sensores_virtuais.parquet`).
"""

import os
import sys
from pathlib import Path

import duckdb

from riasense import ingerir, sensores

COLUNAS = ["id", "t", "visitas"]


def calcular(interim: Path, destino: Path, cfg: dict) -> int:
    """Escreve o `zonas_hora.parquet` e devolve quantas linhas tem."""
    visitas = interim / "visitas.parquet"
    if not visitas.is_file():
        raise FileNotFoundError(f"{visitas}: corre primeiro `riasense ingerir` (e confirma RIASENSE_DATA_RAW)")
    inicio, fim = cfg["periodo_dados"]["inicio"], cfg["periodo_dados"]["fim"]
    destino.mkdir(parents=True, exist_ok=True)
    saida = destino / "zonas_hora.parquet"
    con = duckdb.connect()
    try:
        con.execute(
            f"""
            copy (
                select zona as id, date_trunc('hour', entrada) as t, count(*)::integer as visitas
                from read_parquet(?)
                where zona is not null and entrada >= ?::timestamp and entrada < ?::timestamp
                group by all
                order by id, t
            ) to '{saida.as_posix()}' (format parquet)
            """,
            [str(visitas), inicio, fim],
        )
        return con.execute("select count(*) from read_parquet(?)", [str(saida)]).fetchall()[0][0]
    finally:
        con.close()


def correr(cfg: dict) -> int:
    """Subcomando `riasense zonas`: lê RIASENSE_DATA_INTERIM e escreve em RIASENSE_DATA_PROCESSED."""
    interim = Path(os.environ.get("RIASENSE_DATA_INTERIM") or ingerir.INTERIM_PADRAO)
    destino = Path(os.environ.get("RIASENSE_DATA_PROCESSED") or sensores.PROCESSED_PADRAO)
    try:
        n = calcular(interim, destino, cfg)
    except FileNotFoundError as e:
        print(f"erro: {e}", file=sys.stderr)
        return 1
    print(f"zonas: {n} horas com visitas, por zona turística → {destino / 'zonas_hora.parquet'}")
    return 0
