"""Mapa de risco potencial (ADR-0007 e ADR-0013): por passadeira e por hora, decomposto nas componentes.

risco potencial = w_exp · exposição + w_comp · comportamento + w_prev · previsão, com cada componente em percentil:

- **exposição**: as travessias na hora (medidas ou, na falha, estimadas pela ②), em percentil sobre todos os pares
  (passadeira, hora) da semana;
- **comportamento**: o `efeito_kmh` da ④, em percentil entre as passadeiras sem semáforo (quanto menos abranda, maior),
  fixo; nas passadeiras com semáforo «não se aplica» (ADR-0024), porque quem para o carro é a luz;
- **previsão**: as travessias previstas pela ③ para daqui a h horas, com h o 1.º de `prever.horizontes_h` (3 h,
  ADR-0027), em percentil global como a exposição.

Os pesos das componentes que existem renormalizam-se: sem previsão nessa hora, 0,5 / 0,5 e `previsao_disponivel` falso;
com semáforo, 0,67 exposição e 0,33 previsão, ou só a exposição sem previsão (ADR-0024).
A fiabilidade (①) não entra na soma: sai em `confianca` (medido, estimado, sem dados). Não mede acidentes.
"""

import os
import sys
from pathlib import Path

import duckdb
import numpy as np
import pandas as pd

from riasense import ingerir, sensores

COLUNAS = [
    "id", "t", "risco_potencial", "exposicao", "exposicao_pct", "comportamento_kmh", "comportamento_pct",
    "previsao", "previsao_pct", "previsao_disponivel", "confianca", "estimado", "assinalada", "semaforo",
    "pct_acima_limite_movimentados", "lon", "lat",
]

TRAVESSIAS = """
select id, time_bucket(interval '1 hour', t) as t, count(*) as n from pas
where t >= cast($inicio as timestamp) and t < cast($fim as timestamp) group by all
"""


def percentil(x: pd.Series) -> pd.Series:
    """Percentil de 0 a 1 (média dos empates); os nulos ficam nulos e não entram no cálculo."""
    return x.rank(pct=True, method="average")


def em_falha(grelha: pd.DataFrame, falhas: pd.DataFrame) -> pd.Series:
    """Hora (passadeira, t) que toca uma falha da ① (falhas.parquet): sem dado medido nessa hora."""
    marca = pd.Series(False, index=grelha.index)
    for f in falhas.itertuples(index=False):
        marca |= (grelha["id"] == f.sensor) & (grelha["t"] + pd.Timedelta(hours=1) > f.inicio) & (grelha["t"] < f.fim)
    return marca


def exposicao(grelha: pd.DataFrame, contagens: pd.DataFrame, falhas: pd.DataFrame, virtuais: pd.DataFrame) -> pd.DataFrame:
    """Travessias na hora: medidas fora das falhas; na falha, o sensor virtual da ② (`estimado`) ou nada."""
    g = grelha.merge(contagens, on=["id", "t"], how="left").fillna({"n": 0})
    g = g.merge(virtuais.rename(columns={"estimativa": "virtual"}), on=["id", "t"], how="left")
    falha = em_falha(g, falhas)
    g["estimado"] = falha & g["virtual"].notna()
    g["exposicao"] = np.where(falha, g["virtual"], g["n"]).astype(float)
    g["confianca"] = np.select([g["estimado"], falha], ["estimado", "sem dados"], "medido")
    return g.drop(columns=["n", "virtual"])


def combinar(g: pd.DataFrame, pesos: dict) -> pd.Series:
    """A soma pesada das componentes que se aplicam, com os pesos renormalizados: sem previsão nessa hora (ADR-0013) e,
    nas passadeiras com semáforo, sem comportamento (ADR-0024). Uma componente em falta que se aplica dá nulo."""
    w_exp, w_comp, w_prev = pesos["exposicao"], pesos["comportamento"], pesos["previsao"]
    comp, prev = ~g["semaforo"].to_numpy(bool), g["previsao_disponivel"].to_numpy(bool)
    soma = (w_exp * g["exposicao_pct"] + np.where(comp, w_comp * g["comportamento_pct"], 0)
            + np.where(prev, w_prev * g["previsao_pct"], 0))
    return soma / (w_exp + np.where(comp, w_comp, 0) + np.where(prev, w_prev, 0))


def montar(grelha, contagens, falhas, virtuais, previsoes, proteger, pesos, *, horizonte_h: int) -> pd.DataFrame:
    """Toda a lógica, sem ficheiros: a tabela por passadeira e hora com as componentes e o risco potencial."""
    g = exposicao(grelha, contagens, falhas, virtuais)
    # Na hora t entra a previsão que a ③ faz em t para t + horizonte_h (ADR-0013, ADR-0027).
    prox = previsoes.assign(t=previsoes["t"] - pd.Timedelta(hours=horizonte_h))[["id", "t", "previsao"]]
    g = g.merge(prox, on=["id", "t"], how="left")
    semaforo = proteger["semaforo"].fillna(False).astype(bool)
    # ADR-0024: o percentil do comportamento só entre as passadeiras sem semáforo; nas outras fica nulo («não se aplica»).
    comp = proteger.assign(semaforo=semaforo, comportamento_pct=percentil(proteger["efeito_kmh"].where(~semaforo)))
    g = g.merge(comp.rename(columns={"efeito_kmh": "comportamento_kmh"}), on="id", how="left")
    g["semaforo"] = g["semaforo"].fillna(False).astype(bool)
    g["exposicao_pct"], g["previsao_pct"] = percentil(g["exposicao"]), percentil(g["previsao"])
    g["previsao_disponivel"] = g["previsao"].notna()
    g["risco_potencial"] = combinar(g, pesos)
    return g


def sensibilidade(g: pd.DataFrame, pesos: dict, passo: float, intervalo: list[float]) -> pd.DataFrame:
    """Spearman entre a ordenação base das passadeiras (risco potencial médio na semana) e a de outros pesos."""
    base = g.groupby("id")["risco_potencial"].mean()
    valores = np.round(np.arange(intervalo[0], intervalo[1] + 1e-9, passo), 2)
    linhas = []
    for w_exp in valores:
        for w_comp in valores:
            w_prev = round(1 - w_exp - w_comp, 2)
            if w_prev < 0:
                continue
            outro = combinar(g, {"exposicao": w_exp, "comportamento": w_comp, "previsao": w_prev})
            ordem = outro.groupby(g["id"]).mean()
            linhas.append({"exposicao": w_exp, "comportamento": w_comp, "previsao": w_prev,
                           "spearman": float(base.rank().corr(ordem.rank()))})
    return pd.DataFrame(linhas)


# ---------------------------------------------------------------- leitura, escrita e subcomando

FONTES = {  # Parquet de data/processed → passo do pipeline que o escreve
    "sensores": "sensores", "falhas": "vigiar", "sensores_virtuais": "completar", "previsoes": "prever",
    "proteger_passadeiras": "proteger",
}


def _ler(processed: Path, nome: str) -> pd.DataFrame:
    caminho = processed / f"{nome}.parquet"
    if not caminho.is_file():
        raise FileNotFoundError(f"{caminho}: corre primeiro `riasense {FONTES[nome]}`")
    return duckdb.read_parquet(str(caminho)).df()


def _contagens(interim: Path, periodo: dict) -> pd.DataFrame:
    caminho = interim / "passadeiras.parquet"
    if not caminho.is_file():
        raise FileNotFoundError(f"{caminho}: corre primeiro `riasense ingerir`")
    con = duckdb.connect()
    try:
        con.register("pas", con.read_parquet(str(caminho)))
        return con.sql(TRAVESSIAS, params={"inicio": periodo["inicio"], "fim": periodo["fim"]}).df()
    finally:
        con.close()


def _escrever(tabela: pd.DataFrame, caminho: Path, ordem: str) -> None:
    con = duckdb.connect()
    try:
        con.register("saida", tabela)
        con.sql(f"select * from saida order by {ordem}").write_parquet(str(caminho))
    finally:
        con.close()


def calcular(interim: Path, processed: Path, cfg: dict) -> tuple[pd.DataFrame, pd.DataFrame]:
    """Escreve `risco_potencial.parquet` e `risco_sensibilidade.parquet`; devolve as duas tabelas."""
    r, periodo = cfg["risco_potencial"], cfg["periodo_dados"]
    sens = _ler(processed, "sensores")
    passadeiras = sens[sens["tipo"] == "passadeira"][["id", "lon", "lat"]]
    horas = pd.date_range(periodo["inicio"], periodo["fim"], freq="h", inclusive="left").floor("h").unique()
    grelha = pd.MultiIndex.from_product([passadeiras["id"], horas], names=["id", "t"]).to_frame(index=False)
    previsoes = _ler(processed, "previsoes")
    h = cfg["prever"]["horizontes_h"][0]  # o horizonte principal da demo (ADR-0027)
    principal = previsoes[(previsoes["tipo"] == "passadeira") & (previsoes["horizonte_h"] == h)]
    proteger = _ler(processed, "proteger_passadeiras")[["id", "efeito_kmh", "assinalada", "semaforo",
                                                         "pct_acima_limite_movimentados"]]
    g = montar(grelha, _contagens(interim, periodo), _ler(processed, "falhas"),
               _ler(processed, "sensores_virtuais")[["id", "t", "estimativa"]],
               principal, proteger, r["pesos"], horizonte_h=h)
    g = g.merge(passadeiras, on="id", how="left")[COLUNAS]
    s = sensibilidade(g, r["pesos"], r["sensibilidade"]["passo"], r["sensibilidade"]["intervalo"])
    _escrever(g, processed / "risco_potencial.parquet", "id, t")
    _escrever(s, processed / "risco_sensibilidade.parquet", "exposicao, comportamento")
    return g, s


def correr(cfg: dict) -> int:
    """Subcomando `riasense risco`: lê data/interim e os Parquet das camadas; escreve em RIASENSE_DATA_PROCESSED."""
    interim = Path(os.environ.get("RIASENSE_DATA_INTERIM") or ingerir.INTERIM_PADRAO)
    processed = Path(os.environ.get("RIASENSE_DATA_PROCESSED") or sensores.PROCESSED_PADRAO)
    try:
        g, s = calcular(interim, processed, cfg)
    except FileNotFoundError as e:
        print(f"erro: {e}", file=sys.stderr)
        return 1
    media = g.groupby("id")["risco_potencial"].mean().sort_values(ascending=False)
    print("risco potencial médio na semana (não mede acidentes):")
    for sensor, valor in media.head(5).items():
        print(f"  {sensor.rsplit(':', 1)[-1]}  {valor:.2f}")
    print(f"sensibilidade (pesos {cfg['risco_potencial']['sensibilidade']['intervalo']}): Spearman mínimo "
          f"{s['spearman'].min():.2f} em {len(s)} combinações → {processed / 'risco_potencial.parquet'}")
    return 0
