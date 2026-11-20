"""Luminosidade de cada hora pela posição do sol (ADR-0018): dia, crepúsculo ou noite, sem fonte externa.

A elevação do sol calcula-se a partir do instante e das coordenadas, com as fórmulas da NOAA («General Solar Position
Calculations», NOAA Global Monitoring Division). Erro de cerca de 1 minuto no nascer e no pôr do sol, que chega para
classificar horas. É só **contexto**: o escuro não entra no risco potencial nem na ④ (ADR-0018, pontos 3 e 4).
"""

import os
import sys
from pathlib import Path

import duckdb
import numpy as np
import pandas as pd

from riasense import sensores

CLASSES = ("dia", "crepusculo", "noite")


def elevacao_sol(t_utc: pd.DatetimeIndex, latitude: float, longitude: float) -> np.ndarray:
    """Elevação do sol em graus (negativa abaixo do horizonte), para instantes UTC sem fuso."""
    t = pd.DatetimeIndex(t_utc)
    horas = t.hour + t.minute / 60 + t.second / 3600
    dias_ano = np.where(t.is_leap_year, 366, 365)
    g = 2 * np.pi / dias_ano * (t.day_of_year - 1 + (horas - 12) / 24)  # ano fracionário, em radianos
    eqtime = 229.18 * (0.000075 + 0.001868 * np.cos(g) - 0.032077 * np.sin(g)
                       - 0.014615 * np.cos(2 * g) - 0.040849 * np.sin(2 * g))  # equação do tempo, em minutos
    decl = (0.006918 - 0.399912 * np.cos(g) + 0.070257 * np.sin(g) - 0.006758 * np.cos(2 * g)
            + 0.000907 * np.sin(2 * g) - 0.002697 * np.cos(3 * g) + 0.00148 * np.sin(3 * g))  # declinação, em radianos
    tempo_solar = horas * 60 + eqtime + 4 * longitude  # minutos; o instante já está em UTC
    angulo_horario = np.radians(tempo_solar / 4 - 180)
    lat = np.radians(latitude)
    cos_zenite = np.sin(lat) * np.sin(decl) + np.cos(lat) * np.cos(decl) * np.cos(angulo_horario)
    return 90 - np.degrees(np.arccos(np.clip(cos_zenite, -1, 1)))


def classificar(elevacao: np.ndarray, crepusculo_graus: float) -> np.ndarray:
    """Dia (sol acima do horizonte), crepúsculo (entre 0° e `crepusculo_graus`) ou noite (abaixo)."""
    return np.select([elevacao > 0, elevacao > crepusculo_graus], ["dia", "crepusculo"], "noite")


def horas(cfg: dict) -> pd.DataFrame:
    """Uma linha por hora da janela dos dados: `t` (início da hora, hora local sem fuso, como o resto do pipeline),
    `elevacao_graus` no minuto `minuto_da_hora` dessa hora e a classe `luminosidade`."""
    lum, periodo = cfg["luminosidade"], cfg["periodo_dados"]
    t = pd.date_range(periodo["inicio"], periodo["fim"], freq="h", inclusive="left")
    instante = (t + pd.Timedelta(minutes=lum["minuto_da_hora"])).tz_localize(cfg["fuso_horario"]).tz_convert("UTC")
    elev = elevacao_sol(instante.tz_localize(None), lum["latitude"], lum["longitude"])
    return pd.DataFrame({"t": t, "elevacao_graus": elev, "luminosidade": classificar(elev, lum["crepusculo_graus"])})


def correr(cfg: dict) -> int:
    """Subcomando `riasense luminosidade`: sem rede; escreve em RIASENSE_DATA_PROCESSED."""
    destino = Path(os.environ.get("RIASENSE_DATA_PROCESSED") or sensores.PROCESSED_PADRAO)
    try:
        df = horas(cfg)
    except (KeyError, ValueError) as e:
        print(f"erro: {e}", file=sys.stderr)
        return 1
    destino.mkdir(parents=True, exist_ok=True)
    con = duckdb.connect()
    try:
        con.register("lum", df)
        con.sql("select * from lum order by t").write_parquet(str(destino / "luminosidade.parquet"))
    finally:
        con.close()
    contagem = df["luminosidade"].value_counts()
    print(f"luminosidade: {len(df)} horas, " + ", ".join(f"{c} {int(contagem.get(c, 0))}" for c in CLASSES)
          + f" → {destino / 'luminosidade.parquet'} (contexto; não entra no risco potencial)")
    return 0
