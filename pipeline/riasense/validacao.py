"""Validação (ADR-0031): a ② e a ③ em 4 janelas de um dia, com outros modelos e as variáveis retiradas.

Cada janela testa um dia inteiro (00h–24h) e treina com as horas da janela comum anteriores a esse dia. Em cada
janela, todos os modelos se medem nas mesmas horas e nos mesmos sensores. Os parâmetros, os candidatos e a regra
estão em `validacao` (config/riasense.yaml) e foram escritos antes do primeiro resultado.

Não muda nenhum número do produto: só escreve `avaliacao_modelos.parquet` e `avaliacao_variaveis.parquet`. Um
candidato que passe a regra (ADR-0031, ponto 5) é só proposto; a troca faz-se à parte.

- **②** usa as funções da `completar`: «deixar um de fora» em cada janela e a simulação da falha (29 h). Os
  candidatos usam as variáveis da ridge e do LightGBM: o valor atual dos vizinhos, a hora e o fim de semana.
- **③** usa as funções da `prever`, com as variáveis do LightGBM sem meteorologia. O teste fica só com as linhas
  completas (alvo, referência, persistência e variáveis), as únicas em que todos os modelos preveem. Os candidatos
  do scikit-learn treinam só com as linhas completas; o LightGBM treina como no produto.
"""

import os
import sys
from dataclasses import replace
from pathlib import Path

import duckdb
import numpy as np
import pandas as pd
from sklearn.compose import TransformedTargetRegressor
from sklearn.ensemble import RandomForestRegressor
from sklearn.linear_model import PoissonRegressor
from sklearn.neighbors import KNeighborsRegressor
from sklearn.pipeline import make_pipeline
from sklearn.preprocessing import StandardScaler
from sklearn.svm import SVR

from riasense import completar, ingerir, prever, sensores

CANDIDATOS = ("svr", "random_forest", "knn", "poisson")  # os do ADR-0031, ponto 3
MODOS_HORA = ("indicadoras", "seno_cosseno", "numero")
COLUNAS_MODELOS = [
    "camada", "cenario", "janela", "fim_de_semana", "horizonte_h", "tipo", "modelo", "papel", "dias",
    "n_sensores", "n_horas", "treino_h", "erro_mediano", "noite", "noite_real",
]
COLUNAS_VARIAVEIS = [
    "camada", "analise", "cenario", "janela", "horizonte_h", "tipo", "modelo", "variante",
    "n_sensores", "erro_mediano", "erro_base", "subida", "ganho",
]
ORDEM = {
    "avaliacao_modelos": "camada, tipo, horizonte_h, cenario, janela, dias, modelo",
    "avaliacao_variaveis": "camada, analise, tipo, horizonte_h, cenario, janela, variante",
}


# ---------------------------------------------------------------- config e janelas


def validar_config(cfg: dict) -> None:
    """A secção `validacao` bate com o ADR-0031: janelas dentro dos dados, modelos conhecidos, grupos sem sobreposição."""
    v = cfg.get("validacao")
    if not isinstance(v, dict):
        raise ValueError("falta a secção `validacao` no config (ADR-0031)")
    inicio, fim = (pd.Timestamp(cfg["periodo_dados"][k]) for k in ("inicio", "fim"))
    dias = [pd.Timestamp(d) for d in v["janelas"]]
    if len(set(dias)) != len(dias):
        raise ValueError("validacao.janelas: há dias repetidos")
    for d in dias:
        if d != d.normalize() or not inicio < d or d + pd.Timedelta(days=1) > fim:
            raise ValueError(f"validacao.janelas: {d.date()} tem de ser um dia inteiro dentro de periodo_dados, com treino antes")
    if set(v["candidatos"]) != set(CANDIDATOS):
        raise ValueError(f"validacao.candidatos: esperados {list(CANDIDATOS)}")
    modos = [m for modo in MODOS_HORA for m in v["hora"].get(modo, [])]
    if sorted(modos) != sorted(set(modos)) or set(modos) != {*CANDIDATOS, "ridge", "lightgbm"}:
        raise ValueError("validacao.hora: cada modelo (candidatos, ridge e lightgbm) tem de ter um só modo")
    conhecidos = {"razao", "ridge", "lightgbm", *CANDIDATOS}
    for camada in ("completar", "prever"):
        c = v[camada]
        if c["atual"] not in conhecidos or not set(c["candidatos"]) <= conhecidos or c["atual"] in c["candidatos"]:
            raise ValueError(f"validacao.{camada}: modelo atual ou candidatos desconhecidos")
        if not {c["atual"], *c["candidatos"]} <= set(v["regra"]["simplicidade"]):
            raise ValueError(f"validacao.regra.simplicidade: faltam modelos de validacao.{camada}")
    for h in horizontes(cfg):
        cols = prever.colunas(prever.com_horizonte(cfg, h)["prever"], False)
        vistas: set[str] = set()
        for nome, grupo in grupos_do_horizonte(cfg, h).items():
            if not set(grupo) <= set(cols):
                raise ValueError(f"validacao.prever.grupos.{nome} a {h} h: colunas que o LightGBM não usa ({cols})")
            if vistas & set(grupo):
                raise ValueError(f"validacao.prever.grupos.{nome} a {h} h: sobrepõe-se a outro grupo")
            vistas |= set(grupo)


def janelas(cfg: dict, horas) -> dict[str, tuple[np.ndarray, np.ndarray]]:
    """Máscaras de treino e de teste de cada janela: o teste é o dia inteiro, o treino são as horas antes dele."""
    horas = pd.DatetimeIndex(horas)
    res = {}
    for d in cfg["validacao"]["janelas"]:
        dia = pd.Timestamp(d)
        res[str(dia.date())] = (np.asarray(horas < dia), np.asarray((horas >= dia) & (horas < dia + pd.Timedelta(days=1))))
    return res


def horizontes(cfg: dict) -> list[int]:
    """Os horizontes da ③ no `main` (ADR-0027): os do produto (`prever.horizontes_h`) e os só de avaliação (1 h)."""
    p = cfg["prever"]
    return sorted({int(h) for h in p["horizontes_h"]} | {int(h) for h in p["horizontes_avaliacao_h"]})


def grupos_do_horizonte(cfg: dict, h: int) -> dict[str, list[str]]:
    """Os grupos de variáveis do LightGBM a um horizonte: `{h}`, `{h+1}` e `{h+2}` valem h, h + 1 e h + 2."""
    def coluna(c: str) -> str:
        return c.replace("{h+1}", str(h + 1)).replace("{h+2}", str(h + 2)).replace("{h}", str(h))
    return {nome: [coluna(c) for c in grupo] for nome, grupo in cfg["validacao"]["prever"]["grupos"].items()}


def papel(cfg: dict, camada: str, modelo: str) -> str:
    v = cfg["validacao"][camada]
    if modelo == v["atual"]:
        return "atual"
    if modelo in v["candidatos"]:
        return "candidato"
    return modelo if modelo in ("referencia", "persistencia") else "comparacao"


# ---------------------------------------------------------------- candidatos


def codificar_hora(horas, modo: str, indice) -> pd.DataFrame:
    """A hora do dia como 24 indicadoras, como seno e cosseno, ou como número (ADR-0031, ponto 3)."""
    h = np.asarray(horas, dtype=int)
    if modo == "indicadoras":
        return pd.DataFrame(np.eye(24)[h], index=indice, columns=[f"h{i}" for i in range(24)])
    if modo == "seno_cosseno":
        a = 2 * np.pi * h / 24
        return pd.DataFrame({"hora_sen": np.sin(a), "hora_cos": np.cos(a)}, index=indice)
    if modo == "numero":
        return pd.DataFrame({"hora": h.astype(float)}, index=indice)
    raise ValueError(f"modo da hora desconhecido: {modo!r}")


def modo_hora(cfg: dict, modelo: str) -> str:
    return next(m for m in MODOS_HORA if modelo in cfg["validacao"]["hora"].get(m, []))


def construir(nome: str, cfg: dict):
    """Um candidato do scikit-learn com os parâmetros fixos de `validacao.candidatos`, sem afinação."""
    c = cfg["validacao"]["candidatos"][nome]
    if nome == "svr":
        return TransformedTargetRegressor(regressor=make_pipeline(StandardScaler(), SVR(**c)), transformer=StandardScaler())
    if nome == "random_forest":
        return RandomForestRegressor(**c, n_jobs=1)  # um só fio: com vários, a soma das árvores muda no 16.º algarismo
    if nome == "knn":
        return make_pipeline(StandardScaler(), KNeighborsRegressor(**c))
    if nome == "poisson":
        return PoissonRegressor(**c)
    raise ValueError(f"candidato desconhecido: {nome!r}")


# ---------------------------------------------------------------- ②


def matriz_completar(vizinhos: pd.DataFrame, modo: str) -> pd.DataFrame:
    """As variáveis da ridge e do LightGBM da ②: o valor atual dos vizinhos, a hora e o fim de semana."""
    x = vizinhos.set_axis([f"v{i}" for i in range(vizinhos.shape[1])], axis=1)
    x = pd.concat([x, codificar_hora(vizinhos.index.hour, modo, vizinhos.index)], axis=1)
    return x.assign(fim_de_semana=completar.fim_de_semana(vizinhos.index).astype(float))


def candidato_completar(nome: str, cfg: dict):
    """Um candidato da ②, com a assinatura dos modelos de comparação de `completar.prever_cenario`."""
    modo = modo_hora(cfg, nome)

    def ajustar(alvo: pd.Series, vizinhos: pd.DataFrame, treino: np.ndarray, semente: int) -> np.ndarray:
        x = matriz_completar(vizinhos, modo)
        modelo = construir(nome, cfg).fit(x[treino], alvo[treino])
        return np.clip(modelo.predict(x), 0, None)

    return ajustar


def modelos_completar(cfg: dict) -> dict:
    """A ridge e o LightGBM da `completar` (os do produto) e os quatro candidatos."""
    return completar.modelos_comparacao(cfg["completar"]["comparacao"]) | {
        n: candidato_completar(n, cfg) for n in CANDIDATOS}


def _por_dias(t: pd.Series, cenario: str) -> dict[str, np.ndarray]:
    """Uma janela é um só dia: fica `todos`. A simulação junta dias úteis e fim de semana, e separa-os."""
    todos = np.ones(len(t), bool)
    if cenario == "janela":
        return {"todos": todos}
    fds = completar.fim_de_semana(t)
    return {k: m for k, m in {"todos": todos, "semana": ~fds, "fim_de_semana": fds}.items() if m.any()}


def resumir_completar(prev: pd.DataFrame, modelos: list[str], p: completar.Parametros, cenario: str) -> list[dict]:
    """Erro relativo mediano entre sensores e fração da noite (mediana entre sensores) de cada modelo."""
    linhas = []
    for dias, mascara in _por_dias(prev["t"], cenario).items():
        sub = prev[mascara]
        g = sub.groupby("id")
        noite_real = float(g.apply(lambda s: completar._fracao_noite(s, "y", p.horas_noite)).median())
        for m in modelos:
            erros = g.apply(lambda s, m=m: completar.erro_relativo(s["y"], s[m]))
            linhas.append({
                "modelo": m, "dias": dias, "n_sensores": int(sub["id"].nunique()), "n_horas": int(sub["t"].nunique()),
                "erro_mediano": float(erros.median()),
                "noite": float(g.apply(lambda s, m=m: completar._fracao_noite(s, m, p.horas_noite)).median()),
                "noite_real": noite_real,
            })
    return linhas


def avaliar_completar(series: dict[str, pd.DataFrame], posicoes: pd.DataFrame, cfg: dict, p: completar.Parametros,
                      modelos: dict) -> tuple[list[dict], list[dict]]:
    """A ② em cada janela e na simulação: todos os modelos e o modelo de razão com 3, 5 e 8 vizinhos."""
    c = cfg["completar"]
    desfasamento, semente = completar.REFERENCIAS[c["referencia"]], int(c["semente"])
    nomes = ["razao", "razao_soma", "referencia", *modelos]
    linhas_m, linhas_v = [], []
    for tipo, serie in series.items():
        testes = [("janela", d, *m) for d, m in janelas(cfg, serie.index).items()]
        testes.append(("simulacao", None, *completar.cenarios(cfg, serie.index)["simulacao"]))
        for cenario, dia, treino, teste in testes:
            prev = completar.prever_cenario(serie, posicoes, treino, teste, p, desfasamento, semente, modelos)
            fds = None if dia is None else bool(pd.Timestamp(dia).day_of_week >= 5)
            comum = {"camada": "completar", "cenario": cenario, "janela": dia, "fim_de_semana": fds,
                     "horizonte_h": None, "tipo": tipo, "treino_h": int(treino.sum())}
            linhas_m += [comum | r | {"papel": papel(cfg, "completar", r["modelo"])}
                         for r in resumir_completar(prev, nomes, p, cenario)]
            base = float(prev.groupby("id").apply(lambda s: completar.erro_relativo(s["y"], s["razao"])).median())
            for k in cfg["validacao"]["completar"]["vizinhos"]:
                pk = prev if k == p.n_vizinhos else completar.prever_cenario(
                    serie, posicoes, treino, teste, replace(p, n_vizinhos=int(k)), desfasamento, semente, {})
                erro = float(pk.groupby("id").apply(lambda s: completar.erro_relativo(s["y"], s["razao"])).median())
                linhas_v.append({"camada": "completar", "analise": "vizinhos", "cenario": cenario, "janela": dia,
                                 "horizonte_h": None, "tipo": tipo, "modelo": "razao", "variante": f"{int(k)} vizinhos",
                                 "n_sensores": int(pk["id"].nunique()), "erro_mediano": erro, "erro_base": base,
                                 "subida": erro / base - 1, "ganho": None})
    return linhas_m, linhas_v


# ---------------------------------------------------------------- ③


def tabela_prever(W: pd.DataFrame, escala: pd.Series, vizinhos: dict, p: dict) -> pd.DataFrame:
    """As variáveis do `prever.py` ao horizonte `p["horizonte_h"]`, com a persistência (o valor de há h horas, nas
    unidades do sensor, ADR-0027)."""
    return prever.variaveis(W, escala, vizinhos, p)


def dividir_janela(tab: pd.DataFrame, dia: pd.Timestamp, cols: list[str]) -> tuple[pd.Series, pd.Series]:
    """Treino: as linhas com alvo antes do dia. Teste: as linhas completas do dia, as mesmas para todos os modelos."""
    treino = (tab["t"] < dia) & tab["alvo"].notna()
    completas = tab[["alvo", "referencia", "persistencia", *cols]].notna().all(axis=1)
    teste = (tab["t"] >= dia) & (tab["t"] < dia + pd.Timedelta(days=1)) & completas
    return treino, teste


def matriz_prever(tab: pd.DataFrame, cols: list[str], modo: str) -> pd.DataFrame:
    base = [c for c in cols if c != "hora"]
    return pd.concat([tab[base], codificar_hora(tab["hora"], modo, tab.index)], axis=1)


def candidato_prever(nome: str, cfg: dict, treino: pd.DataFrame, teste: pd.DataFrame, cols: list[str]) -> np.ndarray:
    """Treina só com as linhas completas e prevê nas unidades do sensor, nunca abaixo de 0."""
    modo = modo_hora(cfg, nome)
    treino = treino[treino[cols].notna().all(axis=1)]
    modelo = construir(nome, cfg).fit(matriz_prever(treino, cols, modo), treino["alvo"])
    return np.clip(modelo.predict(matriz_prever(teste, cols, modo)), 0, None) * teste["escala"].to_numpy()


def _lightgbm(ajustar, treino: pd.DataFrame, teste: pd.DataFrame, cols: list[str], params: dict):
    modelo = ajustar(treino, cols, params)
    return modelo, np.clip(modelo.predict(teste[cols]), 0, None) * teste["escala"].to_numpy()


def _ganho(modelo, cols: list[str]) -> dict[str, float]:
    """A importância das variáveis do LightGBM (o ganho), em fração do total. Vazio se o modelo não a tiver."""
    booster = getattr(modelo, "booster_", None)
    if booster is None:
        return {}
    g = booster.feature_importance(importance_type="gain")
    total = float(np.sum(g))
    return {c: float(x) / total if total > 0 else float("nan") for c, x in zip(booster.feature_name(), g)}


def avaliar_prever_janela(W: pd.DataFrame, vizinhos: dict, cfg: dict, dia: pd.Timestamp, h: int, ajustar):
    """Uma janela de um tipo e horizonte: os erros de todos os modelos, os grupos retirados e o ganho."""
    p, v = prever.com_horizonte(cfg, h)["prever"], cfg["validacao"]["prever"]
    cols = prever.colunas(p, False)
    escala = prever.escalas(W, dia)
    tab = tabela_prever(W, escala, vizinhos, p)
    treino, teste = dividir_janela(tab, dia, cols)
    tr, te = tab[treino], tab[teste]
    prev = {"referencia": te["referencia"].to_numpy(), "persistencia": te["persistencia"].to_numpy()}
    modelo, prev["lightgbm"] = _lightgbm(ajustar, tr, te, cols, p["lightgbm"])
    prev |= {n: candidato_prever(n, cfg, tr, te, cols) for n in v["candidatos"]}
    erro = {m: float(prever.erro_relativo(te["real"], pd.Series(x, index=te.index), te["id"]).median())
            for m, x in prev.items()}
    n_sens = len(prever.erro_relativo(te["real"], te["referencia"], te["id"]))
    retirados = {}
    for g, fora in grupos_do_horizonte(cfg, h).items():
        _, x = _lightgbm(ajustar, tr, te, [c for c in cols if c not in fora], p["lightgbm"])
        retirados[g] = float(prever.erro_relativo(te["real"], pd.Series(x, index=te.index), te["id"]).median())
    return {"erro": erro, "retirados": retirados, "ganho": _ganho(modelo, cols), "n_sensores": n_sens,
            "n_horas": int(te["t"].nunique()), "treino_h": int(tr["t"].nunique())}


def avaliar_prever(W_todas: dict[str, pd.DataFrame], vizinhos: dict, cfg: dict, ajustar) -> tuple[list[dict], list[dict]]:
    """A ③ em cada horizonte, janela e tipo. Os segmentos ativos escolhem-se só com as horas de treino da janela."""
    p = cfg["prever"]
    linhas_m, linhas_v = [], []
    for h in horizontes(cfg):
        for d in cfg["validacao"]["janelas"]:
            dia = pd.Timestamp(d)
            for tipo in prever.TIPOS:
                W = W_todas[tipo]
                if tipo == "segmento":
                    W = prever.segmentos_ativos(W, dia, p["segmento_min_veiculos_hora"])
                r = avaliar_prever_janela(W, vizinhos, cfg, dia, h, ajustar)
                comum = {"camada": "prever", "cenario": "janela", "janela": str(dia.date()), "horizonte_h": h, "tipo": tipo}
                linhas_m += [comum | {"fim_de_semana": bool(dia.day_of_week >= 5), "modelo": m,
                                      "papel": papel(cfg, "prever", m), "dias": "todos", "n_sensores": r["n_sensores"],
                                      "n_horas": r["n_horas"], "treino_h": r["treino_h"], "erro_mediano": e,
                                      "noite": None, "noite_real": None} for m, e in r["erro"].items()]
                base = r["erro"]["lightgbm"]
                linhas_v += [comum | {"analise": "retirar_grupo", "modelo": "lightgbm", "variante": g,
                                      "n_sensores": r["n_sensores"], "erro_mediano": e, "erro_base": base,
                                      "subida": e / base - 1, "ganho": None} for g, e in r["retirados"].items()]
                linhas_v += [comum | {"analise": "ganho", "modelo": "lightgbm", "variante": c, "n_sensores": r["n_sensores"],
                                      "erro_mediano": None, "erro_base": None, "subida": None, "ganho": g}
                             for c, g in r["ganho"].items()]
    return linhas_m, linhas_v


# ---------------------------------------------------------------- a regra (ADR-0031, ponto 5)


def regra(modelos: pd.DataFrame, cfg: dict) -> pd.DataFrame:
    """Por camada, tipo e horizonte (dias = todos): o erro médio nas janelas, as janelas ganhas ao atual e a regra.

    Um candidato passa se baixar o erro médio em ≥ `melhoria_min`, ganhar ao atual em ≥ `janelas_min` janelas e
    cumprir a regra da camada. Na ②: não errar mais do que a razão na simulação e, em cada janela, `noite` ≤
    max(`noite_real`, `noite` da razão). Na ③: erro médio abaixo do da referência e do da persistência.
    Dos que passam, é proposto o de menor erro médio, ou o mais simples dos que ficam a menos de 5% dele.
    """
    r = cfg["validacao"]["regra"]
    jan = modelos[(modelos["cenario"] == "janela") & (modelos["dias"] == "todos")]
    linhas = []
    for (camada, tipo, h), g in jan.groupby(["camada", "tipo", "horizonte_h"], dropna=False):
        v = cfg["validacao"][camada]
        atual = v["atual"]
        erro = g.pivot(index="janela", columns="modelo", values="erro_mediano")
        medio = erro.mean()
        if camada == "completar":
            sim = modelos[(modelos["camada"] == camada) & (modelos["tipo"] == tipo) & (modelos["cenario"] == "simulacao")
                          & (modelos["dias"] == "todos")].set_index("modelo")["erro_mediano"]
            noite = g.pivot(index="janela", columns="modelo", values="noite")
            noite_max = np.maximum(g.groupby("janela")["noite_real"].first(), noite[atual])
        for m in erro.columns:
            linha = {"camada": camada, "tipo": tipo, "horizonte_h": h, "modelo": m, "papel": papel(cfg, camada, m),
                     "erro_medio": float(medio[m]), "melhoria": float(1 - medio[m] / medio[atual]),
                     "janelas_ganhas": int((erro[m] < erro[atual]).sum()) if m != atual else None}
            if m in v["candidatos"]:
                if camada == "completar":
                    regra_camada = bool(sim.get(m, np.inf) <= sim[atual] and (noite[m] <= noite_max).all())
                else:
                    regra_camada = bool(all(medio[m] < medio[x] for x in v["ganhar_a"]))
                linha |= {"melhoria_ok": bool(linha["melhoria"] >= r["melhoria_min"]),
                          "janelas_ok": bool(linha["janelas_ganhas"] >= r["janelas_min"]), "regra_camada_ok": regra_camada}
                linha["passa"] = linha["melhoria_ok"] and linha["janelas_ok"] and regra_camada
            linhas.append(linha)
    res = pd.DataFrame(linhas)
    res["passa"] = res.get("passa", pd.Series(dtype=object)).fillna(False).astype(bool)
    res["proposto"] = False
    ordem = {m: i for i, m in enumerate(r["simplicidade"])}
    for _, g in res[res["passa"]].groupby(["camada", "tipo", "horizonte_h"], dropna=False):
        melhor = g["erro_medio"].min()
        perto = g[(1 - r["melhoria_min"]) * g["erro_medio"] < melhor]  # a menos de 5% do melhor
        res.loc[perto["modelo"].map(ordem).idxmin(), "proposto"] = True
    return res


# ---------------------------------------------------------------- escrita e subcomando


def escrever(tabela: pd.DataFrame, destino: Path, nome: str) -> int:
    caminho = destino / f"{nome}.parquet"
    con = duckdb.connect()
    try:
        con.register("saida", tabela)
        con.sql(f"select * from saida order by {ORDEM[nome]}").write_parquet(str(caminho))
        return con.execute("select count(*) from read_parquet(?)", [str(caminho)]).fetchall()[0][0]
    finally:
        con.close()


def _tabela(linhas: list[dict], colunas: list[str]) -> pd.DataFrame:
    df = pd.DataFrame(linhas).reindex(columns=colunas)
    df["horizonte_h"] = df["horizonte_h"].astype("Int64")
    df["janela"] = df["janela"].astype("string")
    if "fim_de_semana" in df:
        df["fim_de_semana"] = df["fim_de_semana"].astype("boolean")
    if "n_sensores" in df:
        df["n_sensores"] = df["n_sensores"].astype("Int64")
    for c in ("erro_mediano", "erro_base", "subida", "ganho", "noite", "noite_real"):
        if c in df:
            df[c] = df[c].astype(float)
    return df


def calcular(interim: Path, processed: Path, destino: Path, cfg: dict, ajustar=None) -> dict:
    """Corre a ② e a ③ nas janelas e escreve os dois Parquet. Devolve as tabelas e a regra."""
    validar_config(cfg)
    prever.validar(cfg)
    if ajustar is None:
        prever.exigir_lightgbm()  # o LightGBM é o modelo atual da ③ e um candidato da ②: sem ele a tabela fica incompleta
    p = completar.Parametros.do_config(cfg)
    posicoes = completar.carregar_posicoes(processed)
    series = completar.carregar_series(interim, cfg, p.completaveis)
    m_c, v_c = avaliar_completar(series, posicoes, cfg, p, modelos_completar(cfg))
    con = duckdb.connect()
    try:
        prever._registar_fontes(con, interim, processed)
        W = prever.series_sem_filtro(con, cfg)
        vizinhos = dict(con.sql("select id, list(vizinho order by ordem) from vizinhos group by id").fetchall())
    finally:
        con.close()
    m_p, v_p = avaliar_prever(W, vizinhos, cfg, ajustar or prever.ajustar_lightgbm)
    modelos, variaveis = _tabela(m_c + m_p, COLUNAS_MODELOS), _tabela(v_c + v_p, COLUNAS_VARIAVEIS)
    destino.mkdir(parents=True, exist_ok=True)
    return {
        "avaliacao_modelos": escrever(modelos, destino, "avaliacao_modelos"),
        "avaliacao_variaveis": escrever(variaveis, destino, "avaliacao_variaveis"),
        "modelos": modelos, "variaveis": variaveis, "regra": regra(modelos, cfg),
    }


def _imprimir(res: pd.DataFrame) -> None:
    print("erro médio nas janelas (dias = todos), janelas ganhas ao modelo atual e a regra do ADR-0031:")
    for (camada, tipo, h), g in res.groupby(["camada", "tipo", "horizonte_h"], dropna=False):
        print(f"  {camada} · {tipo}" + ("" if pd.isna(h) else f" · {int(h)} h"))
        for r in g.sort_values("erro_medio").itertuples():
            ganhas = "" if pd.isna(r.janelas_ganhas) else f"{int(r.janelas_ganhas)}/4"
            marca = "PROPOSTO" if r.proposto else ("passa" if r.passa else "")
            print(f"    {r.modelo:14} {r.papel:12} {r.erro_medio:6.3f}  {r.melhoria:+7.1%}  {ganhas:>4}  {marca}")


def correr(cfg: dict) -> int:
    """Subcomando `riasense validar`: lê RIASENSE_DATA_INTERIM e RIASENSE_DATA_PROCESSED e escreve só os dois Parquet novos."""
    interim = Path(os.environ.get("RIASENSE_DATA_INTERIM") or ingerir.INTERIM_PADRAO)
    processed = Path(os.environ.get("RIASENSE_DATA_PROCESSED") or sensores.PROCESSED_PADRAO)
    try:
        res = calcular(interim, processed, processed, cfg)
    except (FileNotFoundError, ValueError, prever.OpenMPEmFalta) as e:
        print(f"erro: {e}", file=sys.stderr)
        return 1
    _imprimir(res["regra"])
    for nome in ORDEM:
        print(f"{nome}: {res[nome]} linhas → {processed / (nome + '.parquet')}")
    return 0
