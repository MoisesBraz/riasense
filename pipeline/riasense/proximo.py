"""Onde pôr o próximo sensor (ADR-0015): os locais com sensor que os vizinhos explicam pior.

Por tipo (passadeiras e zonas turísticas), ordena os sensores pelo erro do seu sensor virtual em «deixar um
sensor de fora» (②, modelo de razão). A **redução potencial estimada** é o erro do local menos a mediana do
tipo: uma hipótese (um 2.º sensor perto deixaria o local como o sensor típico), que só se valida instalando-o.
Os sensores que se degradaram sem perder a comunicação saem do ranking para a lista «verificar o sensor».
"""

import os
import sys
from pathlib import Path

import duckdb
import numpy as np
import pandas as pd

from riasense import completar as c
from riasense import ingerir, sensores

TIPOS = ("passadeira", "zona")  # os segmentos ficam de fora (ADR-0015): 142 locais seriam ruído
NOMES = {"passadeira": "passadeiras", "zona": "zonas turísticas"}
RANKING, VERIFICAR = "ranking", "verificar o sensor"
COLUNAS = ["id", "tipo", "ordem", "motivo", "erro", "mediana_tipo", "reducao_potencial", "vizinho_m",
           "queda_diaria", "frase", "x", "y", "lon", "lat"]


def _num(x: float, casas: int = 2) -> str:
    return f"{x:.{casas}f}".replace(".", ",")


def erros_por_sensor(serie: pd.DataFrame, posicoes: pd.DataFrame, cfg: dict, p: c.Parametros) -> pd.Series:
    """Erro relativo do sensor virtual de cada sensor em «deixar um de fora» (a avaliação da ②, sensor a sensor)."""
    treino, teste = c.cenarios(cfg, serie.index)["deixar_um_de_fora"]
    desfasamento = c.REFERENCIAS[cfg["completar"]["referencia"]]
    prev = c.prever_cenario(serie, posicoes, treino, teste, p, desfasamento, int(cfg["completar"]["semente"]), {})
    return prev.groupby("id").apply(lambda g: c.erro_relativo(g["y"], g["razao"])).rename("erro")


def media_diaria(serie: pd.DataFrame, dias: list[str]) -> pd.Series:
    """Média diária de cada sensor nos dias completos (24 h com dados) entre `dias[0]` e `dias[1]`, inclusive."""
    por_dia = serie.groupby(serie.index.floor("D"))
    diario = por_dia.sum()[por_dia.size() == 24]
    return diario.loc[pd.Timestamp(dias[0]):pd.Timestamp(dias[1])].mean()


def queda_relativa(serie: pd.DataFrame, antes: list[str], depois: list[str]) -> pd.Series:
    """Queda da média diária de cada sensor face à mediana do tipo: 1 − (depois/antes) ÷ mediana(depois/antes).

    Relativa ao tipo porque o fim de semana e a chuva (34 mm a 09/11) baixam todos os sensores do tipo: assim
    descontam-se sozinhos e só sobra a degradação do próprio sensor (ADR-0015).
    """
    razao = media_diaria(serie, depois) / media_diaria(serie, antes).replace(0, np.nan)
    return (1 - razao / razao.median()).rename("queda_diaria")


def vizinho_mais_proximo(ids: pd.Index, posicoes: pd.DataFrame, tipo: str) -> pd.Series:
    """Distância (m, EPSG:3763) de cada sensor ao sensor mais próximo do mesmo tipo."""
    todos = posicoes[posicoes["tipo"] == tipo][["x", "y"]]
    a, b = posicoes.loc[ids, ["x", "y"]].to_numpy(), todos.to_numpy()
    d = np.sqrt(((a[:, None, :] - b[None, :, :]) ** 2).sum(-1))
    d[d == 0] = np.inf  # o próprio
    return pd.Series(d.min(axis=1), index=ids, name="vizinho_m")


def periodo(dias: list[str]) -> str:
    """["2026-11-07", "2026-11-09"] → «07 a 09/11»; com meses diferentes, «30/10 a 02/11» (texto das frases)."""
    d0, d1 = (pd.Timestamp(d) for d in dias)
    return f"{d0:%d} a {d1:%d/%m}" if (d0.month, d0.year) == (d1.month, d1.year) else f"{d0:%d/%m} a {d1:%d/%m}"


def frase(r: pd.Series) -> str:
    """Frase do local para o mapa, a partir dos dados (pt-PT, vocabulário do GLOSSARY)."""
    if r["motivo"] == VERIFICAR:
        return (f"Verificar o sensor: a média diária de {r['_depois']} caiu {_num(100 * r['queda_diaria'], 0)}% mais do que "
                f"a dos outros sensores do mesmo tipo (face a {r['_antes']}), sem o sensor se calar. Pode ser uma avaria "
                "ou uma mudança real, como obras.")
    nome = NOMES[r["tipo"]]
    if r["reducao_potencial"] > 0:
        texto = (f"Os 5 vizinhos explicam mal este local: erro {_num(r['erro'])} contra {_num(r['mediana_tipo'])} "
                 f"da mediana das {nome}; vizinho mais próximo a {r['vizinho_m']:.0f} m.")
        # A distância só explica o erro nas zonas e só se o vizinho estiver longe face aos do tipo.
        if r["tipo"] == "zona" and r["vizinho_m"] > r["_vizinho_mediana"]:
            texto += " Nas zonas, o erro sobe com a distância aos vizinhos."
        texto += (f" Redução potencial estimada: {_num(r['reducao_potencial'])} (hipótese: com um 2.º "
                  "sensor perto, ficaria como o sensor típico; só se valida instalando-o).")
    else:
        texto = (f"Os vizinhos explicam bem este local: erro {_num(r['erro'])}, abaixo da mediana das {nome} "
                 f"({_num(r['mediana_tipo'])}). Sem redução potencial estimada.")
    return texto + _nota_subida(r, nome)


def _nota_subida(r: pd.Series, nome: str) -> str:
    """Nota quando a atividade sobe muito face ao tipo: o erro pode vir da mudança do próprio sensor.

    A regra do ADR-0015 só tira do ranking as quedas; uma subida fica no ranking, mas diz-se o que se sabe.
    """
    subida = 1 - r["queda_diaria"]  # razão (depois/antes) do sensor face à mediana do tipo
    if pd.isna(subida) or subida < r["_subida_min"]:
        return ""
    return (f" Atenção: a atividade subiu {_num(subida, 1)} vezes face às outras {nome} entre {r['_depois'].replace(' a ', ' e ')};"
            " o erro pode vir dessa mudança do próprio sensor.")


def ranking_tipo(erro: pd.Series, queda: pd.Series, mediana: float, posicoes: pd.DataFrame, tipo: str, queda_max: float,
                 subida_min: float, janelas: tuple[list[str], list[str]]):
    """Ranking de um tipo: os degradados vão para «verificar o sensor»; os outros ordenam-se pelo erro."""
    t = pd.DataFrame({"erro": erro}).join(queda).join(vizinho_mais_proximo(erro.index, posicoes, tipo))
    t["tipo"], t["mediana_tipo"] = tipo, mediana
    t["motivo"] = np.where(t["queda_diaria"] > queda_max, VERIFICAR, RANKING)
    t["reducao_potencial"] = np.where(t["motivo"] == RANKING, (t["erro"] - mediana).clip(lower=0), np.nan)
    t = t.sort_values(["motivo", "erro", "vizinho_m"], ascending=[True, False, False], kind="stable")
    no_ranking = t["motivo"] == RANKING
    t["ordem"] = pd.array([None] * len(t), dtype="Int64")
    t.loc[no_ranking, "ordem"] = np.arange(1, no_ranking.sum() + 1)
    t["_vizinho_mediana"], t["_subida_min"] = t["vizinho_m"].median(), subida_min
    t["_antes"], t["_depois"] = periodo(janelas[0]), periodo(janelas[1])
    t["frase"] = t.apply(frase, axis=1)
    return t.drop(columns=["_vizinho_mediana", "_subida_min", "_antes", "_depois"]).rename_axis("id").reset_index()


def medianas(avaliacao: pd.DataFrame) -> dict[str, float]:
    """Mediana do erro por tipo em «deixar um de fora» (modelo de razão, todos os dias), de avaliacao_completar."""
    m = avaliacao[(avaliacao["cenario"] == "deixar_um_de_fora") & (avaliacao["modelo"] == "razao")
                  & (avaliacao["dias"] == "todos")]
    return dict(zip(m["tipo"], m["erro_mediano"]))


def calcular(interim: Path, processed: Path, cfg: dict) -> pd.DataFrame:
    """Escreve `processed/proximo_sensor.parquet` e devolve a tabela (ranking e «verificar o sensor»)."""
    p = c.Parametros.do_config(cfg)
    caminho = processed / "avaliacao_completar.parquet"
    if not caminho.is_file():
        raise FileNotFoundError(f"{caminho}: corre primeiro `riasense completar`")
    mediana = medianas(duckdb.read_parquet(str(caminho)).df())
    posicoes = c.carregar_posicoes(processed)
    series = c.carregar_series(interim, cfg, TIPOS)
    janelas = (cfg["completar"]["degradacao_antes"], cfg["completar"]["degradacao_depois"])
    partes = [
        ranking_tipo(erros_por_sensor(series[t], posicoes, cfg, p), queda_relativa(series[t], *janelas), mediana[t],
                     posicoes, t, cfg["completar"]["degradacao_max"], cfg["completar"]["subida_min"], janelas)
        for t in TIPOS
    ]
    tabela = pd.concat(partes, ignore_index=True)
    pos = posicoes[["x", "y"]].join(_lonlat(processed))
    tabela = tabela.join(pos, on="id")[COLUNAS]
    _escrever(tabela, processed / "proximo_sensor.parquet")
    return tabela


def _escrever(tabela: pd.DataFrame, caminho: Path) -> None:
    """Parquet ordenado por tipo e ordem do ranking (a lista «verificar o sensor» no fim de cada tipo)."""
    con = duckdb.connect()
    try:
        con.register("saida", tabela)
        con.sql("select * from saida order by tipo, ordem nulls last, id").write_parquet(str(caminho))
    finally:
        con.close()


def _lonlat(processed: Path) -> pd.DataFrame:
    return duckdb.read_parquet(str(processed / "sensores.parquet")).df().set_index("id")[["lon", "lat"]]


def correr(cfg: dict) -> int:
    """Subcomando `riasense proximo`: lê RIASENSE_DATA_INTERIM e os Parquet da ②; escreve em RIASENSE_DATA_PROCESSED."""
    interim = Path(os.environ.get("RIASENSE_DATA_INTERIM") or ingerir.INTERIM_PADRAO)
    processed = Path(os.environ.get("RIASENSE_DATA_PROCESSED") or sensores.PROCESSED_PADRAO)
    try:
        tabela = calcular(interim, processed, cfg)
    except FileNotFoundError as e:
        print(f"erro: {e}", file=sys.stderr)
        return 1
    for r in tabela[tabela["ordem"].fillna(99) <= 5].itertuples():
        print(f"{r.tipo:10} {r.ordem}. {r.id.rsplit(':', 1)[-1]}  erro {r.erro:.2f}  redução potencial {r.reducao_potencial:.2f}")
    for r in tabela[tabela["motivo"] == VERIFICAR].itertuples():
        print(f"verificar o sensor: {r.id.rsplit(':', 1)[-1]} (queda relativa ao tipo {100 * r.queda_diaria:.0f}%)")
    print(f"→ {processed / 'proximo_sensor.parquet'}")
    return 0
