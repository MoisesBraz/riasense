"""Meteorologia (ADR-0009): chuva e temperatura horárias do arquivo Open-Meteo, numa cópia local.

Dados: «Weather data by Open-Meteo.com», CC BY 4.0. A descarga precisa de rede; a demo usa a cópia versionada
em data/processed/meteo.parquet, por isso funciona offline (art. 22.º, n.º 6).
"""

import json
import os
import sys
import urllib.parse
import urllib.request
from datetime import datetime
from pathlib import Path

import duckdb
import pandas as pd

from riasense import sensores

# Variável do Open-Meteo → coluna na RiaSense (as unidades são as do arquivo: mm na hora e °C).
COLUNAS = {"precipitation": "chuva_mm", "temperature_2m": "temperatura_c"}


def pedido(cfg: dict) -> str:
    """URL do arquivo para a janela comum dos dados, em GMT (= hora local em novembro, como o resto do pipeline)."""
    m = cfg["fontes_externas"]["meteo"]
    inicio = datetime.fromisoformat(cfg["periodo_dados"]["inicio"]).date()
    fim = datetime.fromisoformat(cfg["periodo_dados"]["fim"]).date()
    params = {
        "latitude": m["latitude"], "longitude": m["longitude"], "start_date": inicio.isoformat(),
        "end_date": fim.isoformat(), "hourly": ",".join(m["variaveis"]), "timezone": "GMT",
    }
    return f"{m['url']}?{urllib.parse.urlencode(params)}"


def serie(resposta: dict, variaveis: list[str]) -> pd.DataFrame:
    """Resposta JSON do Open-Meteo → tabela horária `t`, `chuva_mm`, `temperatura_c`. Recusa respostas incompletas."""
    horas = resposta.get("hourly") or {}
    em_falta = [v for v in ["time", *variaveis] if v not in horas]
    if em_falta:
        raise ValueError(f"resposta do Open-Meteo sem {', '.join(em_falta)}")
    df = pd.DataFrame({"t": pd.to_datetime(horas["time"])})
    for v in variaveis:
        df[COLUNAS.get(v, v)] = pd.to_numeric(pd.Series(horas[v]), errors="coerce")
    return df


def descarregar(cfg: dict, destino: Path, tempo_max_s: int = 30) -> int:
    """Descarrega a série e escreve `destino/meteo.parquet`. Devolve o número de horas."""
    with urllib.request.urlopen(pedido(cfg), timeout=tempo_max_s) as r:  # só GET a um URL do config
        df = serie(json.load(r), cfg["fontes_externas"]["meteo"]["variaveis"])
    destino.mkdir(parents=True, exist_ok=True)
    con = duckdb.connect()
    try:
        con.register("meteo", df)
        con.table("meteo").write_parquet(str(destino / "meteo.parquet"))
    finally:
        con.close()
    return len(df)


def correr(cfg: dict) -> int:
    """Subcomando `riasense meteo`: precisa de rede; escreve em RIASENSE_DATA_PROCESSED."""
    destino = Path(os.environ.get("RIASENSE_DATA_PROCESSED") or sensores.PROCESSED_PADRAO)
    try:
        n = descarregar(cfg, destino)
    except (OSError, ValueError) as e:
        print(f"erro: não foi possível descarregar a meteorologia ({e}); a cópia versionada continua válida", file=sys.stderr)
        return 1
    print(f"meteo: {n} horas → {destino / 'meteo.parquet'} (Open-Meteo, CC BY 4.0)")
    return 0
