"""Prever (ADR-0010, ADR-0027): cada sensor a 3 e a 6 horas, só onde ganha à referência «mesma hora, dia
anterior» e à persistência «o valor de há h horas».

Um LightGBM por tipo de sensor (passadeira, zona, segmento, estacionamento) e horizonte h prevê o valor daqui a h horas
a partir do histórico do sensor, da média dos vizinhos (`vizinhos.parquet`), da hora e do fim de semana, com e sem
meteorologia (ADR-0009). A regra foi fixada em pipeline/README.md antes de o modelo existir e decide por tipo: se o
erro relativo mediano no teste for menor do que o da referência e o da persistência (ADR-0027), o tipo sai com previsões; se não, fica só o grafo
«o que antecipa o quê» (correlação com atraso entre as 4 verticais), que se calcula sempre.
"""

import os
import sys
from pathlib import Path

import duckdb
import numpy as np
import pandas as pd

from riasense import ingerir, sensores

TIPOS = ("passadeira", "zona", "segmento", "estacionamento")
CONTAGENS = ("passadeira", "zona", "segmento")  # nas contagens, a hora sem eventos vale 0
ATRASO_REFERENCIA_H = {"mesma_hora_dia_anterior": 24}
COLUNAS_PREVISOES = ["horizonte_h", "id", "t", "tipo", "previsao", "referencia", "real", "p10", "p90"]
COLUNAS_AVALIACAO = [
    "horizonte_h", "tipo", "n_sensores", "n_horas_teste", "erro_referencia", "erro_persistencia", "erro_sem_meteo",
    "erro_com_meteo",
    "meteo_melhora", "ganha", "sensores_ganha", "cobertura_intervalo", "n_cobertura",
]
COLUNAS_ANTECIPACAO = ["origem", "destino", "atraso_h", "correlacao", "n_horas", "aresta"]

# Eventos por sensor e hora. As visitas contam pela hora de entrada na zona.
CONTAGENS_SQL = """
select 'passadeira' as tipo, id, time_bucket(interval 1 hour, t) as t, count(*) as valor from cw group by all
union all
select 'zona', zona, time_bucket(interval 1 hour, entrada), count(*) from vis group by all
union all
select 'segmento', id, time_bucket(interval 1 hour, t), count(*) from seg group by all
"""

# Ocupação de cada RSU a meio de cada hora: o último estado conhecido de cada lugar (asof), como em seriesA.py.
# Um lugar ainda sem eventos nesse instante não conta, porque o estado dele é desconhecido.
# Há lugares com dois estados no mesmo instante: sai um carro (`free`, com a duração da ocupação que acabou) e entra
# outro (`occupied`, sempre com duração 0). Fica o estado que começa, o de menor duração; sem isto, o asof
# escolheria um dos dois ao acaso e a corrida não seria reprodutível.
OCUPACAO_SQL = """
with horas as (
  select unnest(generate_series(cast($inicio as timestamp), cast($fim as timestamp) - interval 1 hour, interval 1 hour)) as t
), grelha as (
  select l.id, l.rsu, h.t, h.t + interval 30 minute as meio
  from (select distinct id, rsu from pk where rsu is not null) l cross join horas h
), estados as (select id, t, arg_min(estado, duracao_s) as estado from pk group by id, t)
select 'estacionamento' as tipo, g.rsu as id, g.t, avg((e.estado = 'occupied')::integer) as valor
from grelha g asof left join estados e on g.id = e.id and g.meio >= e.t
group by all
"""


def janela(cfg: dict) -> tuple[pd.Timestamp, pd.Timestamp, pd.Timestamp]:
    """Início dos dados, início do teste e fim dos dados (exclusivo), à hora certa."""
    inicio = pd.Timestamp(cfg["periodo_dados"]["inicio"]).floor("h")
    fim = pd.Timestamp(cfg["periodo_dados"]["fim"]).ceil("h")
    return inicio, pd.Timestamp(cfg["prever"]["teste_inicio"]), fim


def com_horizonte(cfg: dict, h: int) -> dict:
    """O config de um horizonte h (ADR-0027): os atrasos derivam dele, para o modelo só usar horas já medidas."""
    atrasos = {"atrasos_h": sorted({h, h + 1, h + 2, 24}), "atrasos_vizinhos_h": sorted({h, 24})}
    p = cfg["prever"] | {"horizonte_h": h, **atrasos}
    return cfg | {"prever": p}


def validar(cfg: dict) -> None:
    """Fronteira do config: referência conhecida, variáveis só de horas já medidas e um teste dentro da janela."""
    p = cfg["prever"]
    if p["referencia"] not in ATRASO_REFERENCIA_H:
        raise ValueError(f"prever.referencia desconhecida: {p['referencia']!r}")
    if not p["horizontes_h"]:
        raise ValueError("prever.horizontes_h está vazio")
    for chave in ("horizontes_h", "horizontes_avaliacao_h"):
        for h in p[chave]:
            q = com_horizonte(cfg, h)["prever"] if isinstance(h, int) and not isinstance(h, bool) else None
            if q is None or not 1 <= h <= 24 or min(q["atrasos_h"] + q["atrasos_vizinhos_h"]) < h:
                raise ValueError(f"prever.{chave}: {h!r} fora de 1 a 24 h (os atrasos têm de ser ≥ h)")
    if set(p["horizontes_h"]) & set(p["horizontes_avaliacao_h"]):
        raise ValueError("prever.horizontes_avaliacao_h repete um horizonte de prever.horizontes_h")
    inicio, teste_inicio, fim = janela(cfg)
    if not inicio < teste_inicio < fim:
        raise ValueError("prever.teste_inicio tem de ficar dentro de periodo_dados")
    nivel, cal_h = p["intervalo"]["nivel"], p["intervalo"]["calibracao_h"]
    if isinstance(nivel, bool) or not isinstance(nivel, (int, float)) or not 0 < nivel < 1:
        raise ValueError(f"prever.intervalo.nivel: {nivel!r} fora de 0 a 1 (ADR-0035)")
    if isinstance(cal_h, bool) or not isinstance(cal_h, int) or cal_h < 1 or not inicio < teste_inicio - pd.Timedelta(hours=cal_h):
        raise ValueError(f"prever.intervalo.calibracao_h: {cal_h!r} tem de ser um número inteiro de horas que deixe treino antes (ADR-0035)")


# --- Séries por hora ---


def largas(longo: pd.DataFrame, por_tipo: dict[str, list[str]], cfg: dict) -> dict[str, pd.DataFrame]:
    """Uma tabela por tipo: uma linha por hora (a janela e o maior horizonte por prever), uma coluna por sensor.

    Nas contagens, a hora sem eventos vale 0. As horas depois do fim dos dados ficam por conhecer (NaN).
    """
    inicio, _, fim = janela(cfg)
    horas = pd.date_range(inicio, fim, freq="h", inclusive="left", name="t")
    futuro = pd.date_range(fim, periods=max(cfg["prever"]["horizontes_h"]), freq="h", name="t")
    W = {}
    for tipo in TIPOS:
        df = longo[longo["tipo"] == tipo].set_index(["t", "id"])["valor"].unstack("id")
        df = df.reindex(index=horas, columns=por_tipo[tipo]).astype(float)
        if tipo in CONTAGENS:
            df = df.fillna(0.0)
        W[tipo] = df.reindex(horas.append(futuro)).rename_axis(index="t", columns="id")
    return W


def segmentos_ativos(W: pd.DataFrame, teste_inicio: pd.Timestamp, minimo: float) -> pd.DataFrame:
    """Só os segmentos com média no treino ≥ `minimo` veículos/h: os outros são quase só horas a 0."""
    media = W[W.index < teste_inicio].mean()
    return W.loc[:, media >= minimo]


def retirar_falhas(W: pd.DataFrame, falhas: pd.DataFrame) -> pd.DataFrame:
    """As horas em falha (`falhas.parquet`, da ①) passam a NaN: saem do treino e do teste, e o sensor não conta
    como vizinho nelas. Saem as horas inteiras que a falha toca: a do último evento e a do regresso só têm parte
    dos eventos. A falha da demo (RSU0030, desde 04/11 às 20h06) é uma destas falhas, de rede.
    """
    W = W.copy()
    for f in falhas[falhas["sensor"].isin(W.columns)].itertuples():
        W.loc[(W.index >= f.inicio.floor("h")) & (W.index < f.fim.ceil("h")), f.sensor] = np.nan
    return W


def series_sem_filtro(con: duckdb.DuckDBPyConnection, cfg: dict) -> dict[str, pd.DataFrame]:
    """Séries por hora de cada tipo, já sem as horas em falha, com todos os segmentos (a validação filtra-os
    em cada janela)."""
    inicio, _, fim = janela(cfg)
    ocupacao = con.sql(OCUPACAO_SQL, params={"inicio": str(inicio), "fim": str(fim)}).df()
    longo = pd.concat([con.sql(CONTAGENS_SQL).df(), ocupacao], ignore_index=True)
    sens = con.table("sensores").df()
    falhas = con.table("falhas").df()
    W = largas(longo, {t: sorted(sens["id"][sens["tipo"] == t]) for t in TIPOS}, cfg)
    return {tipo: retirar_falhas(w, falhas) for tipo, w in W.items()}


def series(con: duckdb.DuckDBPyConnection, cfg: dict) -> dict[str, pd.DataFrame]:
    """Séries por hora de cada tipo, já sem as horas em falha e, nos segmentos, só com os ativos."""
    # Primeiro saem as falhas: a média de um segmento conta só as horas em que ele funcionava.
    W = series_sem_filtro(con, cfg)
    W["segmento"] = segmentos_ativos(W["segmento"], janela(cfg)[1], cfg["prever"]["segmento_min_veiculos_hora"])
    return W


# --- Variáveis e modelo ---


def escalas(W: pd.DataFrame, teste_inicio: pd.Timestamp) -> pd.Series:
    """Média de cada sensor no treino. Um sensor sem atividade no treino fica de fora: não há escala para o modelo."""
    media = W[W.index < teste_inicio].mean()
    return media[media > 0]


def colunas(p: dict, com_meteo: bool) -> list[str]:
    """Variáveis do modelo; a variante com meteorologia junta `prever.meteo_variaveis`."""
    proprias = [f"atraso_{k}h" for k in p["atrasos_h"]] + [f"vizinhos_{k}h" for k in p["atrasos_vizinhos_h"]]
    return proprias + ["hora", "fim_de_semana"] + (list(p["meteo_variaveis"]) if com_meteo else [])


def variaveis(W: pd.DataFrame, escala: pd.Series, vizinhos: dict[str, list[str]], p: dict) -> pd.DataFrame:
    """Tabela longa (uma linha por sensor e hora): o alvo, as 2 comparações e as variáveis conhecidas ao prever.

    O alvo e as variáveis estão nas unidades do sensor a dividir pela sua média no treino (`escala`), para um só
    modelo servir sensores de tamanhos diferentes. `real`, `referencia` e `persistencia` (o valor de há
    `horizonte_h` horas, ADR-0027) ficam nas unidades do sensor.
    """
    W = W[escala.index].rename_axis(index="t", columns="id")
    Z = W / escala
    media_viz = pd.DataFrame({s: Z.reindex(columns=vizinhos.get(s, [])).mean(axis=1) for s in Z.columns})
    partes = {"alvo": Z, "real": W, "referencia": W.shift(ATRASO_REFERENCIA_H[p["referencia"]]),
              "persistencia": W.shift(p["horizonte_h"])}
    partes |= {f"atraso_{k}h": Z.shift(k) for k in p["atrasos_h"]}
    partes |= {f"vizinhos_{k}h": media_viz.rename_axis(columns="id").shift(k) for k in p["atrasos_vizinhos_h"]}
    tab = pd.concat({nome: df.stack() for nome, df in partes.items()}, axis=1).reset_index()
    tab["escala"] = tab["id"].map(escala)
    tab["hora"] = tab["t"].dt.hour
    tab["fim_de_semana"] = (tab["t"].dt.day_of_week >= 5).astype(int)
    return tab


def juntar_meteo(tab: pd.DataFrame, meteo: pd.DataFrame, p: dict) -> pd.DataFrame:
    """Junta a meteorologia da última hora conhecida (`horizonte_h` antes da prevista): a da própria hora seria futuro."""
    t = meteo["t"].astype(tab["t"].dtype) + pd.Timedelta(hours=p["horizonte_h"])
    m = meteo[["t", *p["meteo_variaveis"]]].assign(t=t)
    junto = tab.merge(m, on="t", how="left")
    if junto.loc[junto["alvo"].notna(), p["meteo_variaveis"]].isna().any().any():
        raise ValueError("a série de meteorologia não cobre todas as horas")
    return junto


def dividir(tab: pd.DataFrame, cfg: dict) -> tuple[pd.Series, pd.Series, pd.Series]:
    """Máscaras de treino (antes do teste), teste e futuro (as horas depois dos dados).

    O teste são as horas com real, referência e persistência: as 3 comparações usam sempre as mesmas horas.
    """
    _, teste_inicio, fim = janela(cfg)
    p = cfg["prever"]
    treino = (tab["t"] < teste_inicio) & tab["alvo"].notna()
    teste = ((tab["t"] >= teste_inicio) & (tab["t"] < fim) & tab["alvo"].notna() & tab["referencia"].notna()
             & tab["persistencia"].notna())
    # Depois dos dados, só se prevê um sensor que estava a medir na última hora conhecida.
    futuro = (tab["t"] >= fim) & tab[f"atraso_{min(p['atrasos_h'])}h"].notna()
    return treino, teste, futuro


class OpenMPEmFalta(RuntimeError):
    """A LightGBM não carrega: falta a biblioteca OpenMP do sistema."""


def exigir_lightgbm() -> None:
    """Diz o que instalar, em vez de um traceback do dlopen. Corre ao 1.º ajuste, depois de os dados carregarem."""
    try:
        import lightgbm  # noqa: F401
    except (ImportError, OSError) as e:
        raise OpenMPEmFalta(
            "a LightGBM não carrega porque falta a OpenMP. Instale-a: `apt-get install libgomp1` (Debian/Ubuntu) "
            "ou `brew install libomp` (macOS)"
        ) from e


def ajustar_lightgbm(treino: pd.DataFrame, cols: list[str], params: dict):
    """LightGBM com `prever.lightgbm`; determinista (semente do config, 1 fio) para a corrida ser reprodutível."""
    exigir_lightgbm()  # aqui e não no topo: precisa da OpenMP, e os outros subcomandos não
    import lightgbm

    p = dict(params)
    modelo = lightgbm.LGBMRegressor(
        random_state=p.pop("seed"), deterministic=True, force_col_wise=True, n_jobs=1, verbose=-1, **p
    )
    return modelo.fit(treino[cols], treino["alvo"])


def prever_variante(tab: pd.DataFrame, cfg: dict, com_meteo: bool, ajustar) -> pd.Series:
    """Treina nas horas de treino e prevê as de teste e as futuras, nas unidades do sensor e nunca abaixo de 0."""
    cols = colunas(cfg["prever"], com_meteo)
    treino, teste, futuro = dividir(tab, cfg)
    alvo = tab[teste | futuro]
    modelo = ajustar(tab[treino], cols, cfg["prever"]["lightgbm"])
    return pd.Series(np.clip(modelo.predict(alvo[cols]), 0, None) * alvo["escala"].to_numpy(), index=alvo.index)


# --- A regra ---


def erro_relativo(real: pd.Series, previsto: pd.Series, sensor: pd.Series) -> pd.Series:
    """Erro relativo por sensor: erro absoluto médio a dividir pela média real. Sai quem tem média real 0."""
    df = pd.DataFrame({"id": sensor, "erro": (real - previsto).abs(), "real": real})
    g = df.groupby("id").agg(mae=("erro", "mean"), media=("real", "mean"))
    g = g[g["media"] > 0]
    return g["mae"] / g["media"]


def decidir(erro_ref: float, erro_pers: float, erro_sem: float, erro_com: float, melhoria_min: float) -> dict:
    """A regra (pipeline/README.md, ADR-0009, ADR-0010 e ADR-0027), sobre os erros relativos medianos de um tipo.

    A meteorologia melhora se baixar o erro em ≥ `melhoria_min` ou se mudar a decisão (ganha com ela e perde sem ela).
    O tipo ganha se a variante escolhida tiver erro menor do que a referência E do que a persistência.
    """
    limite = min(erro_ref, erro_pers)
    muda_decisao = erro_com < limite <= erro_sem
    meteo_melhora = bool(erro_com <= (1 - melhoria_min) * erro_sem or muda_decisao)
    erro = erro_com if meteo_melhora else erro_sem
    return {"meteo_melhora": meteo_melhora, "ganha": bool(erro < limite)}


def avaliar(teste: pd.DataFrame, melhoria_min: float) -> dict:
    """Avaliação de um tipo, a partir das horas de teste com `real`, `referencia`, `persistencia`, `previsao_sem` e
    `previsao_com`. Um sensor ganha se a variante escolhida errar menos do que as duas comparações."""
    erros = {v: erro_relativo(teste["real"], teste[c], teste["id"]) for v, c in (
        ("ref", "referencia"), ("pers", "persistencia"), ("sem", "previsao_sem"), ("com", "previsao_com"))}
    med = {v: float(e.median()) for v, e in erros.items()}
    regra = decidir(med["ref"], med["pers"], med["sem"], med["com"], melhoria_min)
    escolhido = erros["com" if regra["meteo_melhora"] else "sem"]
    return {
        "n_sensores": len(erros["ref"]), "n_horas_teste": int(teste["t"].nunique()), "erro_referencia": med["ref"],
        "erro_persistencia": med["pers"], "erro_sem_meteo": med["sem"], "erro_com_meteo": med["com"], **regra,
        "sensores_ganha": int(((escolhido < erros["ref"]) & (escolhido < erros["pers"])).sum()),
    }


# --- O intervalo de previsão (ADR-0035) ---


def calibrar(W: pd.DataFrame, vizinhos: dict, meteo: pd.DataFrame, cfg: dict, com_meteo: bool, sensores, ajustar) -> tuple[float, float]:
    """Os quantis dos resíduos de um dia de calibração, na escala do modelo de calibração (ADR-0035, ponto 1).

    O dia são as `prever.intervalo.calibracao_h` horas antes de `teste_inicio`. Um modelo igual ao publicado, treinado só
    com as horas anteriores a esse dia, prevê-o. Os sensores são os do modelo publicado (`sensores`: os do
    `avaliacao_prever` do tipo) e a escala de cada um é a sua média **antes do dia de calibração**, por isso o dia não
    entra nem no treino nem na escala. O resíduo `(real − previsão) / escala` de todos os sensores dá q10 e q90 (o nível
    está em `prever.intervalo.nivel`). O modelo publicado não muda. Sem horas de treino ou de calibração, os quantis são
    nulos e não há intervalo.
    """
    p = cfg["prever"]
    inicio_dia = janela(cfg)[1] - pd.Timedelta(hours=p["intervalo"]["calibracao_h"])
    escala = escalas(W[list(sensores)], inicio_dia)
    if escala.empty:
        return float("nan"), float("nan")
    tab = juntar_meteo(variaveis(W, escala, vizinhos, p), meteo, p)
    treino = (tab["t"] < inicio_dia) & tab["alvo"].notna()
    dia = (tab["t"] >= inicio_dia) & (tab["t"] < janela(cfg)[1]) & tab["alvo"].notna()
    if not treino.any() or not dia.any():
        return float("nan"), float("nan")
    cols = colunas(p, com_meteo)
    modelo = ajustar(tab[treino], cols, p["lightgbm"])
    residuos = tab.loc[dia, "alvo"].to_numpy() - np.clip(modelo.predict(tab.loc[dia, cols]), 0, None)
    cauda = (1 - p["intervalo"]["nivel"]) / 2
    return float(np.quantile(residuos, cauda)), float(np.quantile(residuos, 1 - cauda))


def intervalo(previsao: pd.Series, escala: pd.Series, q10: float, q90: float) -> tuple[pd.Series, pd.Series]:
    """`p10` e `p90` nas unidades do sensor, nunca abaixo de 0 (ADR-0035, ponto 1.4); `p90` nunca fica abaixo de `p10`."""
    p10 = np.maximum(previsao + q10 * escala, 0)
    return p10, np.maximum(previsao + q90 * escala, p10)


def cobertura(real: pd.Series, p10: pd.Series, p90: pd.Series) -> tuple[float, int]:
    """A fração dos pares (sensor, hora) com o valor real entre `p10` e `p90`, e quantos são (ADR-0035, ponto 3)."""
    medidos = p10.notna() & p90.notna()
    if not medidos.any():
        return float("nan"), 0
    dentro = (real[medidos] >= p10[medidos]) & (real[medidos] <= p90[medidos])
    return float(dentro.mean()), int(medidos.sum())


def prever_tipo(W: pd.DataFrame, vizinhos: dict, meteo: pd.DataFrame, cfg: dict, ajustar) -> tuple[dict, pd.DataFrame]:
    """Previsões com e sem meteorologia de um tipo, a avaliação no teste (com a cobertura do intervalo nos horizontes de
    `prever.horizontes_h`, ADR-0035) e a previsão da variante escolhida, com o intervalo `p10`–`p90`."""
    p = cfg["prever"]
    escala = escalas(W, janela(cfg)[1])
    if escala.empty:
        raise ValueError("nenhum sensor do tipo com atividade no treino")
    tab = juntar_meteo(variaveis(W, escala, vizinhos, p), meteo, p)
    _, teste, futuro = dividir(tab, cfg)
    res = tab.loc[teste | futuro, ["id", "t", "real", "referencia", "persistencia"]]
    res["previsao_sem"] = prever_variante(tab, cfg, False, ajustar)
    res["previsao_com"] = prever_variante(tab, cfg, True, ajustar)
    emteste = teste[teste | futuro]
    aval = avaliar(res[emteste], p["meteo_melhoria_min"])
    res["previsao"] = res["previsao_com" if aval["meteo_melhora"] else "previsao_sem"]
    if p["horizonte_h"] in p["horizontes_h"]:  # a 1 h, só avaliação, não há previsões nem intervalo (ADR-0035)
        q10, q90 = calibrar(W, vizinhos, meteo, cfg, aval["meteo_melhora"], escala.index, ajustar)  # só a variante escolhida (ADR-0009)
        res["p10"], res["p90"] = intervalo(res["previsao"], tab.loc[res.index, "escala"], q10, q90)
    else:
        res["p10"] = res["p90"] = np.nan
    aval["cobertura_intervalo"], aval["n_cobertura"] = cobertura(res.loc[emteste, "real"], res.loc[emteste, "p10"], res.loc[emteste, "p90"])
    return aval, res


# --- O grafo «o que antecipa o quê» ---


def vertical(W: pd.DataFrame) -> pd.Series:
    """Índice por hora de uma vertical: a média, entre sensores, do valor a dividir pela média do sensor.

    Um sensor em falha (NaN) sai da média dessa hora, em vez de a fazer descer.
    """
    media = W.mean()
    ativos = media[media > 0].index
    return (W[ativos] / media[ativos]).mean(axis=1)


def sem_ciclo(s: pd.Series) -> pd.Series:
    """Retira o perfil típico de cada hora, em separado para dias úteis e fim de semana: o ciclo diário não é antecipação."""
    return s - s.groupby([s.index.hour, s.index.day_of_week >= 5]).transform("mean")


def antecipacao(verticais: dict[str, pd.Series], atraso_max: int) -> pd.DataFrame:
    """Correlação entre a origem na hora h e o destino na hora h + atraso, por par ordenado e atraso de 0 a `atraso_max`.

    A aresta de cada par é o atraso de 1 a `atraso_max` com maior correlação em valor absoluto.
    As séries têm de estar numa grelha horária completa: o atraso conta-se em linhas.
    """
    linhas = []
    for origem, so in verticais.items():
        for destino, sd in verticais.items():
            if origem == destino:
                continue
            for k in range(atraso_max + 1):
                par = pd.concat([so, sd.shift(-k)], axis=1).dropna()
                corr = float(par.iloc[:, 0].corr(par.iloc[:, 1])) if len(par) > 2 else float("nan")
                linhas.append({"origem": origem, "destino": destino, "atraso_h": k, "correlacao": corr, "n_horas": len(par)})
    df = pd.DataFrame(linhas)
    candidatos = df[df["atraso_h"] >= 1].assign(forca=lambda d: d["correlacao"].abs()).dropna(subset=["forca"])
    df["aresta"] = df.index.isin(candidatos.groupby(["origem", "destino"])["forca"].idxmax())
    return df[COLUNAS_ANTECIPACAO]


# --- Corrida ---


def _registar_fontes(con: duckdb.DuckDBPyConnection, interim: Path, processed: Path) -> None:
    fontes = {
        "cw": interim / "passadeiras.parquet", "vis": interim / "visitas.parquet",
        "seg": interim / "segmentos.parquet", "pk": interim / "estacionamento.parquet",
        "sensores": processed / "sensores.parquet", "vizinhos": processed / "vizinhos.parquet",
        "meteo": processed / "meteo.parquet", "falhas": processed / "falhas.parquet",
    }
    for vista, caminho in fontes.items():
        if not caminho.is_file():
            passo = "ingerir" if caminho.parent == interim else {"meteo": "meteo", "falhas": "vigiar"}.get(vista, "sensores")
            raise FileNotFoundError(f"{caminho}: corre primeiro `riasense {passo}`")
        con.register(vista, con.read_parquet(str(caminho)))


def _escrever(con: duckdb.DuckDBPyConnection, tabelas: dict[str, pd.DataFrame], destino: Path) -> None:
    for nome, df in tabelas.items():
        con.register(nome, df)
        con.table(nome).write_parquet(str(destino / f"{nome}.parquet"))


def _previsoes(partes: list[pd.DataFrame]) -> pd.DataFrame:
    """Junta as previsões dos tipos que ganham; sem nenhum, fica uma tabela vazia com as mesmas colunas e tipos."""
    if partes:
        return pd.concat(partes, ignore_index=True)[COLUNAS_PREVISOES]
    tipos = {"horizonte_h": "int64", "id": "str", "t": "datetime64[us]", "tipo": "str", "previsao": float,
             "referencia": float, "real": float, "p10": float, "p90": float}
    return pd.DataFrame({c: pd.Series(dtype=d) for c, d in tipos.items()})


def calcular(interim: Path, processed: Path, destino: Path, cfg: dict, ajustar=None) -> tuple[pd.DataFrame, ...]:
    """Escreve `avaliacao_prever`, `previsoes` (só os tipos e horizontes que ganham) e `antecipacao`, e devolve-as.

    Os horizontes de `prever.horizontes_avaliacao_h` (1 h, ADR-0027 ponto 3) só entram na avaliação: nunca dão
    previsões nem entram no risco potencial, mesmo que ganhem.
    """
    validar(cfg)
    destino.mkdir(parents=True, exist_ok=True)
    con = duckdb.connect()
    try:
        _registar_fontes(con, interim, processed)
        W = series(con, cfg)
        vizinhos = dict(con.sql("select id, list(vizinho order by ordem) from vizinhos group by id").fetchall())
        meteo = con.table("meteo").df()
        avaliacao, partes = [], []
        produto = cfg["prever"]["horizontes_h"]
        for h in sorted(set(produto) | set(cfg["prever"]["horizontes_avaliacao_h"])):
            for tipo in TIPOS:
                aval, res = prever_tipo(W[tipo], vizinhos, meteo, com_horizonte(cfg, h), ajustar or ajustar_lightgbm)
                avaliacao.append({"horizonte_h": h, "tipo": tipo, **aval})
                if aval["ganha"] and h in produto:
                    partes.append(res.assign(tipo=tipo, horizonte_h=h))
        _, _, fim = janela(cfg)
        verticais = {tipo: sem_ciclo(vertical(w[w.index < fim])) for tipo, w in W.items()}
        tabelas = {
            "avaliacao_prever": pd.DataFrame(avaliacao)[COLUNAS_AVALIACAO],
            "previsoes": _previsoes(partes),
            "antecipacao": antecipacao(verticais, cfg["prever"]["antecipacao_atraso_max_h"]),
        }
        _escrever(con, tabelas, destino)
        return tuple(tabelas.values())
    finally:
        con.close()


def _imprimir(avaliacao: pd.DataFrame, ant: pd.DataFrame) -> None:
    print("h  tipo            sensores  erro ref.  persist.  sem meteo  com meteo  meteo melhora  ganha  sensores ganham"
          "  cobertura p10–p90")
    for r in avaliacao.itertuples():
        print(f"{r.horizonte_h:<2d} {r.tipo:15} {r.n_sensores:8d}  {r.erro_referencia:9.3f}  {r.erro_persistencia:8.3f}"
              f"  {r.erro_sem_meteo:9.3f}  {r.erro_com_meteo:9.3f}"
              f"  {'sim' if r.meteo_melhora else 'não':>13}  {'sim' if r.ganha else 'não':>5}  {r.sensores_ganha:>8d}"
              f"  {'—' if not r.n_cobertura else f'{r.cobertura_intervalo:.1%} de {r.n_cobertura}':>14}")
    print("o que antecipa o quê (aresta de cada par: atraso com maior |correlação|):")
    for r in ant[ant["aresta"]].itertuples():
        print(f"  {r.origem:>14} → {r.destino:14} {r.atraso_h} h  r = {r.correlacao:+.2f}")


def correr(cfg: dict) -> int:
    """Subcomando `riasense prever`: lê RIASENSE_DATA_INTERIM e RIASENSE_DATA_PROCESSED e escreve em RIASENSE_DATA_PROCESSED."""
    interim = Path(os.environ.get("RIASENSE_DATA_INTERIM") or ingerir.INTERIM_PADRAO)
    processed = Path(os.environ.get("RIASENSE_DATA_PROCESSED") or sensores.PROCESSED_PADRAO)
    try:
        avaliacao, previsoes, ant = calcular(interim, processed, processed, cfg)
    except (FileNotFoundError, ValueError, OpenMPEmFalta) as e:
        print(f"erro: {e}", file=sys.stderr)
        return 1
    _imprimir(avaliacao, ant)
    nomes = ", ".join(str(processed / f"{n}.parquet") for n in ("avaliacao_prever", "previsoes", "antecipacao"))
    print(f"→ {nomes} ({len(previsoes)} previsões)")
    return 0
