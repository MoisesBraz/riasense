"""Completar (ADR-0005, ADR-0046): sensores virtuais, avaliados contra a referência.

Um sensor virtual estima as contagens por hora de um sensor em falha: o perfil horário dele multiplicado pela
variação atual dos vizinhos do mesmo tipo face ao perfil habitual desses vizinhos, com a razão limitada a
`completar.razao_max`. Cada estimativa leva um intervalo e a marca de estimado, para sair em NGSI-LD (ADR-0008).
O estacionamento não se completa, porque a ocupação não se correlaciona com nenhum vizinho (ADR-0005).

A avaliação repete os dois testes do ADR-0005 (deixar um sensor de fora e a simulação com 29 h de treino) e
compara cada modelo com a referência «mesma hora, dia anterior».

O método escolhe-se por tipo (`completar.metodo`, ADR-0046): a razão nas passadeiras e nas zonas turísticas, e a ridge
nos segmentos, onde ganha à razão nos dois testes e passa a forma da noite. O intervalo e o erro esperado vêm do
método de cada tipo. Os outros modelos (e a LightGBM) ficam só como comparação.
"""

import os
import sys
from dataclasses import dataclass
from functools import partial
from pathlib import Path

import duckdb
import numpy as np
import pandas as pd
from sklearn.linear_model import RidgeCV

from riasense import ids, ingerir, sensores

# Nome do tipo no config (completar.completaveis) → tipo em sensores.parquet.
TIPOS = {"passadeiras": "passadeira", "zonas_turisticas": "zona", "segmentos": "segmento", "estacionamento": "estacionamento"}

# O que se conta por hora em cada tipo: a tabela de data/interim, o que a contagem mede e a consulta.
# Nas zonas conta a hora de entrada da visita, como na viabilidade (seriesA.py).
CONTAGENS = {
    "passadeira": ("passadeiras", "travessias", """
        select id, time_bucket(interval '1 hour', t) as t, count(*) as n from fonte
        where t >= cast($inicio as timestamp) and t < cast($fim as timestamp) group by all"""),
    "zona": ("visitas", "visitas", """
        select zona as id, time_bucket(interval '1 hour', entrada) as t, count(*) as n from fonte
        where zona is not null and entrada >= cast($inicio as timestamp) and entrada < cast($fim as timestamp) group by all"""),
    "segmento": ("segmentos", "veiculos", """
        select id, time_bucket(interval '1 hour', t) as t, count(*) as n from fonte
        where t >= cast($inicio as timestamp) and t < cast($fim as timestamp) group by all"""),
}

# Só esta referência está definida (GLOSSARY): o desfasamento, em horas, do valor que ela repete.
REFERENCIAS = {"mesma_hora_dia_anterior": 24}

MODELOS = ("razao", "razao_soma", "referencia", "ridge", "lightgbm")
# Os métodos que podem dar os sensores virtuais de um tipo (completar.metodo, ADR-0046).
METODOS = ("razao", "ridge")
CENARIOS = ("deixar_um_de_fora", "simulacao")


class NaoCompletavel(ValueError):
    """O sensor é de um tipo que não se completa (o estacionamento, ADR-0005)."""


@dataclass(frozen=True)
class Parametros:
    """Os parâmetros de `completar` (config/riasense.yaml) de que o modelo depende."""

    n_vizinhos: int
    razao_max: float
    intervalo: float
    piso: float  # eventos/h no denominador da razão e do intervalo: evita dividir por ~0 à noite
    ativo_min: float  # média mínima de eventos/h para um sensor ser completado ou servir de vizinho
    completaveis: frozenset[str]
    horas_noite: tuple[int, ...]
    # Tipo → método dos sensores virtuais (ADR-0046). Um tipo sem entrada usa a razão (só nos testes: o config exige-os).
    metodos: tuple[tuple[str, str], ...] = ()
    ridge_alphas_log10: tuple[float, ...] = (-2, 4, 15)

    def metodo(self, tipo: str) -> str:
        """O método dos sensores virtuais do tipo (`passadeira`, `zona`, `segmento`)."""
        return dict(self.metodos).get(tipo, "razao")

    @classmethod
    def do_config(cls, cfg: dict) -> "Parametros":
        c = cfg["completar"]
        desconhecidos = [t for t in c["completaveis"] if t not in TIPOS]
        if desconhecidos:
            raise ValueError(f"completar.completaveis: tipos desconhecidos {desconhecidos} (conhecidos: {list(TIPOS)})")
        completaveis = frozenset(TIPOS[t] for t in c["completaveis"])
        metodo = c.get("metodo") or {}
        sem_metodo = sorted(completaveis - set(metodo))
        if sem_metodo:
            raise ValueError(f"completar.metodo: sem método para {sem_metodo} (ADR-0046)")
        maus = {t: m for t, m in metodo.items() if t not in TIPOS.values() or m not in METODOS}
        if maus:
            raise ValueError(f"completar.metodo: {maus} (tipos: {sorted(set(TIPOS.values()))}; métodos: {list(METODOS)})")
        return cls(
            n_vizinhos=int(c["vizinhos_mesmo_tipo"]),
            razao_max=float(c["razao_max"]),
            intervalo=float(c["intervalo"]),
            piso=float(c["piso_eventos_h"]),
            ativo_min=float(c["ativo_min_eventos_h"]),
            completaveis=completaveis,
            horas_noite=tuple(int(h) for h in c["horas_noite"]),
            metodos=tuple(sorted(metodo.items())),
            ridge_alphas_log10=tuple(c["comparacao"]["ridge_alphas_log10"]),
        )


# ---------------------------------------------------------------- modelo de razão


def perfil_horario(serie: pd.Series, treino: np.ndarray) -> np.ndarray:
    """Média por hora do dia nas horas de treino, posta em cada hora da série."""
    horas = serie.index.hour
    perfil = serie[treino].groupby(horas[treino]).mean()
    em_falta = sorted(set(range(24)) - set(perfil.index))
    if em_falta:
        # Sem uma hora do dia no treino não há perfil para ela: mais vale parar do que inventar um zero.
        raise ValueError(f"{serie.name}: o treino não tem as horas do dia {em_falta}")
    return perfil.reindex(horas).to_numpy(dtype=float)


def razao_vizinhos(vizinhos: pd.DataFrame, treino: np.ndarray, p: Parametros, agregar: str = "mediana") -> np.ndarray:
    """Variação atual dos vizinhos face ao perfil habitual deles, hora a hora, limitada a [0, razao_max].

    Por omissão é a mediana das razões de cada vizinho, que pesa todos por igual: um vizinho que se degrada sem
    perder a comunicação (nestes dados, a SC0023 cai cerca de 90% a partir de 07/11) não arrasta a estimativa. A «soma»
    (razão entre as somas, como em viabilidade/task1.py) deixa o vizinho com mais eventos mandar, e fica só
    como comparação na avaliação.
    """
    habitual = np.column_stack([perfil_horario(vizinhos[c], treino) for c in vizinhos.columns])
    atual = vizinhos.to_numpy(dtype=float)
    if agregar == "soma":
        razao = atual.sum(axis=1) / np.maximum(habitual.sum(axis=1), p.piso)
    elif agregar == "mediana":
        razao = np.median(atual / np.maximum(habitual, p.piso), axis=1)
    else:
        raise ValueError(f"agregar: {agregar!r} (esperado «mediana» ou «soma»)")
    return np.clip(razao, 0, p.razao_max)


def estimar(alvo: pd.Series, vizinhos: pd.DataFrame, treino: np.ndarray, p: Parametros, agregar: str = "mediana") -> np.ndarray:
    """Sensor virtual (ADR-0005): perfil horário do alvo × razão dos vizinhos, em todas as horas da série.

    O alvo só entra pelo perfil das horas de treino; nas outras horas a estimativa depende apenas dos vizinhos.
    """
    return perfil_horario(alvo, treino) * razao_vizinhos(vizinhos, treino, p, agregar)


# ---------------------------------------------------------------- vizinhos


def ativos(series: pd.DataFrame, horas: np.ndarray, minimo: float) -> list[str]:
    """Sensores com média ≥ `minimo` eventos/h nessas horas. Um sensor sem comunicação (por exemplo, em falha) fica de fora."""
    media = series.loc[horas].mean()
    return sorted(media.index[media >= minimo])


def escolher_vizinhos(sensor: str, posicoes: pd.DataFrame, candidatos, n: int) -> list[str]:
    """Os `n` candidatos do mesmo tipo mais próximos, em metros (x/y em EPSG:3763), com desempate pelo id.

    É a regra de vizinhos.parquet, mas só entre os candidatos: um vizinho sem comunicação na falha tem de dar
    lugar ao seguinte. Na demo, as passadeiras da RSU0030 são vizinhas umas das outras e deixam de comunicar juntas.
    """
    tipo = posicoes.at[sensor, "tipo"]
    outros = posicoes[(posicoes["tipo"] == tipo) & posicoes.index.isin(list(candidatos)) & (posicoes.index != sensor)]
    distancia = np.hypot(outros["x"] - posicoes.at[sensor, "x"], outros["y"] - posicoes.at[sensor, "y"])
    ordem = pd.DataFrame({"id": outros.index, "d": distancia.to_numpy()}).sort_values(["d", "id"])
    return list(ordem["id"][:n])


# ---------------------------------------------------------------- intervalo, referência e erro


def residuos(y, estimativa, piso: float) -> np.ndarray:
    """Erro relativo à estimativa (mais o piso). O erro das contagens cresce com o nível e fica ≈ 0 à noite."""
    estimativa = np.asarray(estimativa, dtype=float)
    return (np.asarray(y, dtype=float) - estimativa) / (estimativa + piso)


def quantis(res, nivel: float) -> tuple[float, float]:
    """Quantis do intervalo central de `nivel` (0,8 → 10% e 90%).

    Ficam de cada lado do 0 para o intervalo conter sempre a estimativa.
    """
    q_inf, q_sup = np.quantile(np.asarray(res, dtype=float), [(1 - nivel) / 2, (1 + nivel) / 2])
    return min(float(q_inf), 0.0), max(float(q_sup), 0.0)


def intervalo(estimativa, q: tuple[float, float], piso: float) -> tuple[np.ndarray, np.ndarray]:
    """Limites inferior (nunca abaixo de 0) e superior: a estimativa mais os quantis dos resíduos relativos."""
    estimativa = np.asarray(estimativa, dtype=float)
    escala = estimativa + piso
    return np.maximum(estimativa + q[0] * escala, 0.0), estimativa + q[1] * escala


def referencia(serie: pd.Series, horas: int) -> np.ndarray:
    """A referência (GLOSSARY): o valor observado `horas` antes (24 = mesma hora, dia anterior).

    A série tem todas as horas seguidas, por isso desfasar posições é desfasar horas.
    """
    return serie.shift(horas).to_numpy(dtype=float)


def erro_relativo(y, previsto) -> float:
    """Erro absoluto médio a dividir pela média observada, como na viabilidade. Ignora as horas sem previsão."""
    y, previsto = np.asarray(y, dtype=float), np.asarray(previsto, dtype=float)
    ok = ~np.isnan(previsto)
    total = y[ok].sum()
    return float(np.abs(previsto[ok] - y[ok]).sum() / total) if total > 0 else float("nan")


def fim_de_semana(horas: pd.DatetimeIndex | pd.Series) -> np.ndarray:
    dia = horas.dt.day_of_week if isinstance(horas, pd.Series) else horas.day_of_week
    return np.asarray(dia >= 5)


# ---------------------------------------------------------------- comparação (ridge e LightGBM)


def _matriz(vizinhos: pd.DataFrame, hora_em_colunas: bool) -> pd.DataFrame:
    """Contagens atuais dos vizinhos, hora do dia e fim de semana, como em viabilidade/task1.py."""
    x = vizinhos.set_axis([f"v{i}" for i in range(vizinhos.shape[1])], axis=1)
    horas = vizinhos.index.hour
    if hora_em_colunas:
        x = pd.concat([x, pd.get_dummies(horas, prefix="h", dtype=float).set_index(vizinhos.index)], axis=1)
    else:
        x = x.assign(hora=np.asarray(horas))
    return x.assign(fim_de_semana=fim_de_semana(vizinhos.index).astype(float))


def comparar_ridge(alvo: pd.Series, vizinhos: pd.DataFrame, treino: np.ndarray, semente: int, alphas_log10) -> np.ndarray:
    # A ridge não sorteia nada; a semente fica na assinatura para os modelos de comparação serem trocáveis.
    x = _matriz(vizinhos, hora_em_colunas=True)
    modelo = RidgeCV(alphas=np.logspace(*alphas_log10)).fit(x[treino], alvo[treino])
    return np.clip(modelo.predict(x), 0, None)


def estimar_com(metodo: str, alvo: pd.Series, vizinhos: pd.DataFrame, treino: np.ndarray, p: Parametros) -> np.ndarray:
    """O sensor virtual com o método do tipo (ADR-0046), em todas as horas da série: a razão (ADR-0005) ou a ridge da
    comparação, treinada só nas horas de `treino`."""
    if metodo == "razao":
        return estimar(alvo, vizinhos, treino, p)
    if metodo == "ridge":
        return comparar_ridge(alvo, vizinhos, treino, 0, p.ridge_alphas_log10)
    raise ValueError(f"método desconhecido: {metodo!r} (conhecidos: {list(METODOS)})")


def lightgbm_disponivel() -> bool:
    """A LightGBM só entra na comparação. No macOS precisa da libomp (`brew install libomp`); sem ela, a
    comparação fica de fora e o resto do pipeline corre na mesma."""
    try:
        import lightgbm  # noqa: F401
    except (ImportError, OSError):
        return False
    return True


def comparar_lightgbm(alvo: pd.Series, vizinhos: pd.DataFrame, treino: np.ndarray, semente: int, params: dict) -> np.ndarray:
    import lightgbm as lgb  # só aqui, para a falta da libomp não partir os outros subcomandos

    # Árvores pequenas (completar.comparacao.lightgbm): com 29 h de treino há uma ou duas linhas por hora do dia.
    x = _matriz(vizinhos, hora_em_colunas=False)
    modelo = lgb.LGBMRegressor(**params, random_state=semente, n_jobs=1, verbose=-1)
    return np.clip(modelo.fit(x[treino], alvo[treino]).predict(x), 0, None)


# ---------------------------------------------------------------- avaliação


def cenarios(cfg: dict, horas: pd.DatetimeIndex) -> dict[str, tuple[np.ndarray, np.ndarray]]:
    """Os dois testes do ADR-0005, como máscaras de treino e de teste sobre as horas da série.

    A simulação treina só com as `simulacao_treino_h` horas antes do incidente da demo e testa até ao fim dos
    dados: é a situação real da RSU0030. Deixar um de fora treina até ao corte e testa os últimos dias.
    """
    av = cfg["completar"]["avaliacao"]
    corte = pd.Timestamp(av["deixar_um_de_fora_corte"])
    incidente = pd.Timestamp(cfg["demo"]["incidente"]["inicio"]).floor("h")
    inicio = incidente - pd.Timedelta(hours=int(av["simulacao_treino_h"]))
    return {
        "deixar_um_de_fora": (np.asarray(horas < corte), np.asarray(horas >= corte)),
        "simulacao": (np.asarray((horas >= inicio) & (horas < incidente)), np.asarray(horas >= incidente)),
    }


def modelos_comparacao(params: dict) -> dict:
    """Os modelos que só entram na avaliação (ADR-0005), com os parâmetros de `completar.comparacao`, sem a
    LightGBM quando ela não carrega."""
    ridge = partial(comparar_ridge, alphas_log10=params["ridge_alphas_log10"])
    lgbm = partial(comparar_lightgbm, params=params["lightgbm"])
    return {"ridge": ridge} | ({"lightgbm": lgbm} if lightgbm_disponivel() else {})


def _prever_sensor(series, posicoes, sensor, candidatos, treino, teste, p, desfasamento, semente, comparacao) -> pd.DataFrame:
    vizinhos = series[escolher_vizinhos(sensor, posicoes, candidatos, p.n_vizinhos)]
    alvo = series[sensor]
    previsto = {
        "razao": estimar(alvo, vizinhos, treino, p),
        "razao_soma": estimar(alvo, vizinhos, treino, p, "soma"),
        "referencia": referencia(alvo, desfasamento),
    } | {nome: modelo(alvo, vizinhos, treino, semente) for nome, modelo in comparacao.items()}
    colunas = {"id": sensor, "t": series.index[teste], "y": alvo.to_numpy(dtype=float)[teste]}
    return pd.DataFrame(colunas | {m: v[teste] for m, v in previsto.items()})


def prever_cenario(series: pd.DataFrame, posicoes: pd.DataFrame, treino: np.ndarray, teste: np.ndarray,
                   p: Parametros, desfasamento: int, semente: int, comparacao: dict | None = None) -> pd.DataFrame:
    """Previsões de cada modelo nas horas de teste, para cada sensor ativo no treino e no teste.

    Os modelos não veem o sensor no teste (deixar um de fora): só o perfil do treino e os vizinhos.
    A referência, por definição, repete o valor observado do dia anterior.
    """
    comparacao = {} if comparacao is None else comparacao
    candidatos = sorted(set(ativos(series, treino, p.ativo_min)) & set(ativos(series, teste, p.ativo_min))
                        & set(posicoes.index))
    partes = [_prever_sensor(series, posicoes, s, candidatos, treino, teste, p, desfasamento, semente, comparacao)
              for s in candidatos]
    if not partes:
        return pd.DataFrame(columns=["id", "t", "y", "razao", "razao_soma", "referencia", *comparacao])
    return pd.concat(partes, ignore_index=True)


def cobertura(previsoes: pd.DataFrame, p: Parametros, metodo: str = "razao") -> np.ndarray:
    """Para cada hora, se o valor real cai no intervalo do método (a razão ou a ridge, ADR-0046).

    O intervalo de cada sensor é calibrado só nos outros sensores (deixar um de fora) e à parte para os dias úteis
    e o fim de semana, como no preenchimento. Fica NaN quando não há outros sensores para calibrar.
    """
    res = residuos(previsoes["y"], previsoes[metodo], p.piso)
    fds = fim_de_semana(previsoes["t"])
    dentro = np.full(len(previsoes), np.nan)
    for sensor in previsoes["id"].unique():
        for f in (False, True):
            alvo = np.asarray(previsoes["id"] == sensor) & (fds == f)
            outros = np.asarray(previsoes["id"] != sensor) & (fds == f)
            if alvo.any() and outros.any():
                inf, sup = intervalo(previsoes[metodo].to_numpy()[alvo], quantis(res[outros], p.intervalo), p.piso)
                y = previsoes["y"].to_numpy()[alvo]
                dentro[alvo] = (y >= inf) & (y <= sup)
    return dentro


def _fracao_noite(g: pd.DataFrame, coluna: str, horas_noite: tuple[int, ...]) -> float:
    """Média nas horas da noite a dividir pela média de todas as horas: ≈ 0 numa forma diária plausível."""
    media = g[coluna].mean()
    noite = g.loc[g["t"].dt.hour.isin(horas_noite), coluna].mean()
    return float(noite / media) if media > 0 else float("nan")


def _media_noite(g: pd.DataFrame, coluna: str, horas_noite: tuple[int, ...]) -> float:
    """Média por hora nas horas da noite, com os sensores todos juntos (ADR-0046): a regra da forma da noite."""
    noite = g.loc[g["t"].dt.hour.isin(horas_noite), coluna]
    return float(noite.mean()) if len(noite) else float("nan")


def _metricas(sub: pd.DataFrame, modelo: str, erros: pd.DataFrame, p: Parametros, metodo: str = "razao") -> dict:
    """Uma linha da avaliação: um modelo num tipo, num cenário e num conjunto de dias. A cobertura é a do método do tipo."""
    por_sensor = sub.groupby("id")
    return {
        "modelo": modelo,
        "n_sensores": len(erros),
        "erro_mediano": float(erros[modelo].median()),
        "erro_ponderado": erro_relativo(sub["y"], sub[modelo]),
        "ganha_referencia": None if modelo == "referencia" else int((erros[modelo] < erros["referencia"]).sum()),
        "cobertura": float(np.nanmean(sub["dentro"])) if modelo == metodo and sub["dentro"].notna().any() else None,
        "noite": float(por_sensor.apply(lambda g: _fracao_noite(g, modelo, p.horas_noite)).median()),
        "noite_real": float(por_sensor.apply(lambda g: _fracao_noite(g, "y", p.horas_noite)).median()),
        "noite_media": _media_noite(sub, modelo, p.horas_noite),
        "noite_media_real": _media_noite(sub, "y", p.horas_noite),
    }


def resumir(previsoes: pd.DataFrame, p: Parametros, metodo: str = "razao") -> pd.DataFrame:
    """Erro relativo por sensor e a mediana entre sensores, para todos os dias, dias úteis e fim de semana."""
    fds = fim_de_semana(previsoes["t"])
    modelos = [m for m in MODELOS if m in previsoes.columns]
    linhas = []
    for dias, mascara in {"todos": np.ones(len(previsoes), bool), "semana": ~fds, "fim_de_semana": fds}.items():
        sub = previsoes[mascara]
        if sub.empty:
            continue
        por_sensor = sub.groupby("id")
        erros = pd.DataFrame({m: por_sensor.apply(lambda g, m=m: erro_relativo(g["y"], g[m])) for m in modelos})
        linhas += [{"dias": dias} | _metricas(sub, m, erros, p, metodo) for m in modelos]
    return pd.DataFrame(linhas)


def avaliar(series: dict[str, pd.DataFrame], posicoes: pd.DataFrame, cfg: dict, p: Parametros):
    """Os dois cenários em cada tipo completável. Devolve as métricas e as previsões da simulação, que calibram o intervalo."""
    c = cfg["completar"]
    desfasamento, comparacao = REFERENCIAS[c["referencia"]], modelos_comparacao(c["comparacao"])
    metricas, simulacao = [], {}
    for tipo, serie in series.items():
        for cenario, (treino, teste) in cenarios(cfg, serie.index).items():
            previsoes = prever_cenario(serie, posicoes, treino, teste, p, desfasamento, int(c["semente"]), comparacao)
            previsoes["dentro"] = cobertura(previsoes, p, p.metodo(tipo))
            resumo = resumir(previsoes, p, p.metodo(tipo))
            metricas.append(resumo.assign(cenario=cenario, tipo=tipo, treino_h=int(treino.sum()), teste_h=int(teste.sum())))
            if cenario == "simulacao":
                simulacao[tipo] = previsoes
    return pd.concat(metricas, ignore_index=True), simulacao


# ---------------------------------------------------------------- preencher


@dataclass(frozen=True)
class Contexto:
    """O que `preencher` precisa: as séries por hora, as posições e o intervalo calibrado na simulação."""

    series: dict[str, pd.DataFrame]  # tipo → horas × sensores (contagens por hora)
    posicoes: pd.DataFrame  # sensores.parquet, indexado pelo id
    quantis: dict[tuple[str, bool], tuple[float, float]]  # (tipo, fim de semana) → quantis dos resíduos do método do tipo
    erro_esperado: dict[tuple[str, bool], float]  # (tipo, fim de semana) → erro mediano do método do tipo na simulação
    p: Parametros


def calibrar(simulacao: dict[str, pd.DataFrame], metricas: pd.DataFrame, p: Parametros):
    """Quantis do intervalo e erro esperado por tipo, à parte para os dias úteis e o fim de semana.

    Vêm da simulação com 29 h, que é a situação de uma falha real: o fim de semana não estava no treino e por
    isso tem um intervalo mais largo e um erro esperado maior (ADR-0005). São os do método de cada tipo: os
    resíduos da razão, ou os da própria ridge nos segmentos (ADR-0046).
    """
    q, erro = {}, {}
    simul = metricas[metricas["cenario"] == "simulacao"]
    for tipo, prev in simulacao.items():
        metodo = p.metodo(tipo)
        do_metodo = simul[(simul["tipo"] == tipo) & (simul["modelo"] == metodo)]
        res, fds = residuos(prev["y"], prev[metodo], p.piso), fim_de_semana(prev["t"])
        for f, dias in ((False, "semana"), (True, "fim_de_semana")):
            if (fds == f).any():
                q[(tipo, f)] = quantis(res[fds == f], p.intervalo)
                erro[(tipo, f)] = float(do_metodo.loc[do_metodo["dias"] == dias, "erro_mediano"].iloc[0])
    return q, erro


def _tipo_completavel(ctx: Contexto, sensor: str) -> str:
    if sensor not in ctx.posicoes.index:
        raise ValueError(f"{sensor}: não está em sensores.parquet")
    tipo = ctx.posicoes.at[sensor, "tipo"]
    if tipo not in ctx.p.completaveis or tipo not in ctx.series:
        raise NaoCompletavel(f"{sensor}: o tipo «{tipo}» não se completa (completar.completaveis, ADR-0005)")
    return tipo


def _linhas(ctx: Contexto, sensor: str, tipo: str, horas: pd.DatetimeIndex, est: np.ndarray, vizinhos: list[str]) -> pd.DataFrame:
    """Uma linha por hora preenchida, com o que o NGSI-LD precisa: entidade, instante e marca de estimado (ADR-0008)."""
    fds = fim_de_semana(horas)
    inf, sup = np.empty(len(est)), np.empty(len(est))
    for f in (False, True):
        if (fds == f).any():
            inf[fds == f], sup[fds == f] = intervalo(est[fds == f], ctx.quantis[(tipo, f)], ctx.p.piso)
    return pd.DataFrame({
        "id": sensor, "tipo": tipo, "grandeza": CONTAGENS[tipo][1], "t": horas,
        "estimativa": est, "inf": inf, "sup": sup, "estimado": True, "fim_de_semana": fds,
        "erro_esperado": [ctx.erro_esperado[(tipo, bool(f))] for f in fds],
        "vizinhos": [list(vizinhos)] * len(horas),
    })


def preencher(ctx: Contexto, sensor: str, inicio, fim, excluir=(), outras_falhas=()) -> pd.DataFrame:
    """Sensor virtual de `sensor` nas horas de `inicio` (arredondado à hora) até `fim` (exclusivo).

    É a função que a camada ① chama para cada falha. O treino são as horas fora da falha. Os vizinhos são os do
    mesmo tipo com dados no treino e na falha, sem os de `excluir` (por exemplo, os outros sensores da mesma
    falha de rede, que podem ainda ter eventos no início da janela). As `outras_falhas` (início, fim) do mesmo
    sensor também saem do treino: os zeros delas puxariam o perfil para baixo. Pela mesma razão saem as horas
    sem dados (abaixo de `ativo_min_eventos_h`) a partir da 1.ª falha do sensor: um sensor que deixa de comunicar e não volta tem o
    silêncio partido pela ① em várias falhas, e as horas entre elas e depois da última ficavam no treino, a zero
   . As horas sem dados antes da 1.ª falha (as noites normais) ficam.
    """
    sensor = ids.urn(sensor)
    tipo = _tipo_completavel(ctx, sensor)
    series = ctx.series[tipo]
    janela = np.asarray((series.index >= pd.Timestamp(inicio).floor("h")) & (series.index < pd.Timestamp(fim)))
    treino = ~janela
    for i, f in outras_falhas:
        treino &= ~np.asarray((series.index >= pd.Timestamp(i).floor("h")) & (series.index < pd.Timestamp(f)))
    primeira = min([pd.Timestamp(inicio), *(pd.Timestamp(i) for i, _ in outras_falhas)]).floor("h")
    treino &= ~np.asarray((series.index >= primeira) & (series[sensor].to_numpy() < ctx.p.ativo_min))
    if not janela.any():
        raise ValueError(f"{sensor}: a janela {inicio}–{fim} está fora dos dados")
    if sensor not in ativos(series, treino, ctx.p.ativo_min):
        raise ValueError(f"{sensor}: menos de {ctx.p.ativo_min} eventos/h fora da falha, sem perfil para estimar")
    fora = {ids.urn(e) for e in excluir} | {sensor}
    candidatos = (set(ativos(series, janela, ctx.p.ativo_min)) & set(ativos(series, treino, ctx.p.ativo_min))) - fora
    vizinhos = escolher_vizinhos(sensor, ctx.posicoes, candidatos, ctx.p.n_vizinhos)
    if not vizinhos:
        raise ValueError(f"{sensor}: nenhum vizinho do mesmo tipo com dados entre {inicio} e {fim}")
    est = estimar_com(ctx.p.metodo(tipo), series[sensor], series[vizinhos], treino, ctx.p)[janela]
    return _linhas(ctx, sensor, tipo, series.index[janela], est, vizinhos)


def juntar_seguidas(falhas: list[tuple[str, str, str]]) -> list[tuple[str, str, str]]:
    """Junta as falhas do mesmo sensor que partilham horas (por exemplo, uma acaba e a seguinte começa a meio da
    mesma hora). Sem isto, a hora comum sai duas vezes, com estimativas diferentes."""
    juntas: list[tuple[str, str, str]] = []
    for s, i, f in sorted(falhas, key=lambda x: (ids.urn(x[0]), pd.Timestamp(x[1]))):
        if juntas and ids.urn(juntas[-1][0]) == ids.urn(s) and pd.Timestamp(i).floor("h") < pd.Timestamp(juntas[-1][2]):
            juntas[-1] = (juntas[-1][0], juntas[-1][1], max(juntas[-1][2], f, key=pd.Timestamp))
        else:
            juntas.append((s, i, f))
    return juntas


def preencher_falhas(ctx: Contexto, falhas: list[tuple[str, str, str]]) -> tuple[pd.DataFrame, list[str]]:
    """Preenche uma lista de falhas (sensor, início, fim). Devolve as linhas e os sensores que não se completam.

    As falhas seguidas do mesmo sensor juntam-se primeiro (`juntar_seguidas`). Cada sensor exclui como vizinhos os outros sensores em falha na mesma altura (falha de rede), e as outras
    falhas do mesmo sensor saem do treino. Um sensor que não se completa (estacionamento, sem perfil ou sem
    vizinhos) fica nos ignorados, com o motivo, e os outros continuam.
    """
    falhas = juntar_seguidas(falhas)
    partes, ignorados = [], []
    for sensor, inicio, fim in falhas:
        sobrepostas = [s for s, i, f in falhas
                       if s != sensor and pd.Timestamp(i) < pd.Timestamp(fim) and pd.Timestamp(inicio) < pd.Timestamp(f)]
        proprias = [(i, f) for s, i, f in falhas if ids.urn(s) == ids.urn(sensor) and (i, f) != (inicio, fim)]
        try:
            partes.append(preencher(ctx, sensor, inicio, fim, excluir=sobrepostas, outras_falhas=proprias))
        except ValueError as e:  # inclui NaoCompletavel
            ignorados.append(str(e))
    linhas = pd.concat(partes, ignore_index=True) if partes else pd.DataFrame()
    return linhas, ignorados


def falhas_demo(cfg: dict, posicoes: pd.DataFrame) -> list[tuple[str, str, str]]:
    """A falha da demo (demo.incidente): as passadeiras da demo (`demo.passadeiras`), do início ao fim dos dados.

    Não são todos os sensores da RSU: a ① mostrou que, na falha da RSU0030, a maior parte dos segmentos
    continuou a enviar eventos, e preenchê-los seria inventar dados que existem. As outras falhas vêm de
    `falhas_detetadas`.
    """
    incidente = cfg["demo"]["incidente"]
    fim = incidente.get("fim") or cfg["periodo_dados"]["fim"]
    afetados = sorted(ids.urn(p) for p in cfg["demo"]["passadeiras"])
    return [(s, incidente["inicio"], fim) for s in afetados if s in posicoes.index]


def falhas_detetadas(falhas: pd.DataFrame, cfg: dict) -> list[tuple[str, str, str]]:
    """As falhas da ① (`falhas.parquet`) dos tipos completáveis, sem as passadeiras da demo.

    As da demo ficam com `falhas_demo`, para o preenchimento delas não mudar. O estacionamento sai aqui (ADR-0005).
    """
    demo = {ids.urn(p) for p in cfg["demo"]["passadeiras"]}
    tipos = {TIPOS[t] for t in cfg["completar"]["completaveis"]}
    f = falhas[falhas["tipo_sensor"].isin(tipos) & ~falhas["sensor"].map(ids.urn).isin(demo)]
    return [(s, str(i), str(fim)) for s, i, fim in zip(f["sensor"], f["inicio"], f["fim"])]


def carregar_falhas(processed: Path) -> pd.DataFrame:
    caminho = processed / "falhas.parquet"
    if not caminho.is_file():
        raise FileNotFoundError(f"{caminho}: corre primeiro `riasense vigiar`")
    con = duckdb.connect()
    try:
        return con.read_parquet(str(caminho)).df()
    finally:
        con.close()


# ---------------------------------------------------------------- leitura, escrita e subcomando


def carregar_series(interim: Path, cfg: dict, tipos) -> dict[str, pd.DataFrame]:
    """Contagens por hora de cada sensor (horas × sensores), com todas as horas da janela comum e 0 sem eventos."""
    inicio, fim = cfg["periodo_dados"]["inicio"], cfg["periodo_dados"]["fim"]
    horas = pd.date_range(inicio, fim, freq="h", inclusive="left", name="t")
    con = duckdb.connect()
    try:
        return {tipo: _contagens(con, interim, tipo, {"inicio": inicio, "fim": fim}, horas) for tipo in sorted(tipos)}
    finally:
        con.close()


def _contagens(con: duckdb.DuckDBPyConnection, interim: Path, tipo: str, params: dict, horas: pd.DatetimeIndex) -> pd.DataFrame:
    tabela, _, sql = CONTAGENS[tipo]
    caminho = interim / f"{tabela}.parquet"
    if not caminho.is_file():
        raise FileNotFoundError(f"{caminho}: corre primeiro `riasense ingerir`")
    con.register("fonte", con.read_parquet(str(caminho)))
    longo = con.sql(sql, params=params).df()
    con.unregister("fonte")
    largo = longo.pivot_table(index="t", columns="id", values="n", aggfunc="sum")
    return largo.reindex(horas).fillna(0.0).astype(float).rename_axis(index="t", columns="id")


def carregar_posicoes(processed: Path) -> pd.DataFrame:
    caminho = processed / "sensores.parquet"
    if not caminho.is_file():
        raise FileNotFoundError(f"{caminho}: corre primeiro `riasense sensores`")
    con = duckdb.connect()
    try:
        return con.read_parquet(str(caminho)).select("id, tipo, rsu, x, y").df().set_index("id")
    finally:
        con.close()


# Ordem das linhas em cada Parquet (texto fixo deste módulo, não vem de entradas).
ORDEM = {"sensores_virtuais": "id, t", "avaliacao_completar": "cenario, tipo, dias, modelo"}
COLUNAS_AVALIACAO = ["cenario", "tipo", "modelo", "dias", "n_sensores", "erro_mediano", "erro_ponderado",
                     "ganha_referencia", "cobertura", "noite", "noite_real", "noite_media", "noite_media_real",
                     "treino_h", "teste_h"]


def escrever(tabela: pd.DataFrame, destino: Path, nome: str) -> int:
    """Escreve `destino/<nome>.parquet` pelo DuckDB, que lê os NaN do pandas como NULL (valor em falta)."""
    caminho = destino / f"{nome}.parquet"
    con = duckdb.connect()
    try:
        con.register("saida", tabela)
        con.sql(f"select * from saida order by {ORDEM[nome]}").write_parquet(str(caminho))
        return con.execute("select count(*) from read_parquet(?)", [str(caminho)]).fetchall()[0][0]
    finally:
        con.close()


def calcular(interim: Path, processed: Path, destino: Path, cfg: dict) -> dict:
    """Avalia, calibra o intervalo, preenche a falha da demo e as da ① e escreve os dois Parquet. Devolve um resumo."""
    p = Parametros.do_config(cfg)
    if cfg["completar"]["referencia"] not in REFERENCIAS:
        raise ValueError(f"completar.referencia: {cfg['completar']['referencia']!r} (conhecidas: {list(REFERENCIAS)})")
    posicoes = carregar_posicoes(processed)
    series = carregar_series(interim, cfg, p.completaveis)
    metricas, simulacao = avaliar(series, posicoes, cfg, p)
    metricas["ganha_referencia"] = metricas["ganha_referencia"].astype("Int64")  # NULL na própria referência
    ctx = Contexto(series, posicoes, *calibrar(simulacao, metricas, p), p)
    falhas = falhas_demo(cfg, posicoes) + falhas_detetadas(carregar_falhas(processed), cfg)
    virtuais, ignorados = preencher_falhas(ctx, falhas)
    destino.mkdir(parents=True, exist_ok=True)
    return {
        "sensores_virtuais": escrever(virtuais, destino, "sensores_virtuais"),
        "avaliacao_completar": escrever(metricas[COLUNAS_AVALIACAO], destino, "avaliacao_completar"),
        "metricas": metricas,
        "ignorados": ignorados,
    }


def _imprimir(metricas: pd.DataFrame, p: Parametros) -> None:
    """Resumo no terminal: o erro mediano do método de cada tipo contra a referência, por cenário, tipo e dias."""
    do_metodo = metricas["modelo"] == metricas["tipo"].map(p.metodo)
    tabela = metricas[do_metodo | (metricas["modelo"] == "referencia")].assign(
        modelo=lambda t: np.where(t["modelo"] == "referencia", "referencia", "metodo"),
        tipo=lambda t: t["tipo"] + " (" + t["tipo"].map(p.metodo) + ")",
    ).pivot_table(index=["cenario", "tipo", "n_sensores"], columns=["dias", "modelo"], values="erro_mediano")
    print("erro relativo mediano (o método de cada tipo, ADR-0046, contra a referência «mesma hora, dia anterior»):")
    print(tabela.round(2).to_string())


def correr(cfg: dict) -> int:
    """Subcomando `riasense completar`: lê RIASENSE_DATA_INTERIM e sensores.parquet; escreve em RIASENSE_DATA_PROCESSED."""
    interim = Path(os.environ.get("RIASENSE_DATA_INTERIM") or ingerir.INTERIM_PADRAO)
    processed = Path(os.environ.get("RIASENSE_DATA_PROCESSED") or sensores.PROCESSED_PADRAO)
    try:
        resultado = calcular(interim, processed, processed, cfg)
    except (FileNotFoundError, ValueError) as e:
        print(f"erro: {e}", file=sys.stderr)
        return 1
    if not lightgbm_disponivel():
        print("aviso: a LightGBM não carrega (no macOS falta a libomp); a comparação fica só com a ridge", file=sys.stderr)
    _imprimir(resultado["metricas"], Parametros.do_config(cfg))
    for nome in ORDEM:
        print(f"{nome}: {resultado[nome]} linhas → {processed / (nome + '.parquet')}")
    if resultado["ignorados"]:
        print("não completados:", *resultado["ignorados"], sep="\n  ")
    return 0
