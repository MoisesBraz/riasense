"""Painel «agora» (ADR-0030 e ADR-0032): a ① ao vivo, com a regra «sem comunicação», sobre uma fonte em memória.

Três partes:

- **A base** (`riasense agora`): a taxa de eventos por hora de cada passadeira e de cada segmento junto a elas, em
  dias úteis e ao fim de semana. É a base da ① do ADR-0025: a mediana da mesma hora, sem os silêncios longos
  (≥ `vigiar.silencio_longo_h`) do sensor. Escreve `agora_base.parquet`; não muda nenhum número do produto.
- **A regra «sem comunicação»** (ADR-0030, ponto 3; a função `calado`): um silêncio fica «sem comunicação» quando a probabilidade de não haver nenhum evento,
  pelo modelo de Poisson com as taxas de cada hora que o silêncio atravessa, fica abaixo de `agora.prob_max`.
  Aplica-se a cada sensor e a cada RSU (as passadeiras da RSU juntas). Não substitui a falha inesperada da ①.
- **O simulador** (ADR-0032): sorteia os eventos de cada sensor por um processo de Poisson com essas taxas e uma
  semente fixa. Nunca copia linhas dos CSV, nunca lê a rede e não grava nada em disco.

O tempo simulado conta em minutos desde a meia-noite de uma segunda-feira sem data: o relógio só mostra a hora.
"""

import math
import os
import sys
import time
import warnings
from dataclasses import dataclass, field
from pathlib import Path

import duckdb
import numpy as np
import pandas as pd

from riasense import ids, ingerir, sensores, vigiar

DIA_MIN = 24 * 60
SEMANA_MIN = 7 * DIA_MIN
AQUECIMENTO_MIN = 3 * 60  # o simulador começa a sortear 3 h antes do início, para cada sensor ter um último dado
COLUNAS_BASE = ["id", "tipo", "rsus", "passadeiras", "dia_util", "hora", "taxa_h", "n_dias"]
ETIQUETA = "Simulação com dados fictícios, gerados a partir da semana de 3 a 10/11 — não são dados reais"


# ---------------------------------------------------------------- a base (pipeline)


def taxas_base(matriz: np.ndarray, longos: np.ndarray, dia_util: np.ndarray) -> tuple[np.ndarray, np.ndarray]:
    """Taxa por hora (eventos/h) em dias úteis e ao fim de semana: a mediana da mesma hora sem os silêncios longos.

    `matriz` e `longos` são dia × hora (como na `vigiar.Grelha`); `dia_util` diz, por dia, se é útil. Devolve as
    taxas (2 × 24: [fim de semana, dia útil]) e quantos dias entram em cada uma. Uma hora sem nenhum dia desse
    tipo usa o outro tipo; sem nenhum dia, fica 0.
    """
    m = np.where(longos, np.nan, matriz)
    taxas, n = np.full((2, 24), np.nan), np.zeros((2, 24), dtype=int)
    for k, linhas in enumerate((~dia_util, dia_util)):
        sub = m[linhas]
        n[k] = np.sum(~np.isnan(sub), axis=0)
        if len(sub):
            with warnings.catch_warnings():
                warnings.simplefilter("ignore", RuntimeWarning)  # hora sem nenhum dia deste tipo
                taxas[k] = np.nanmedian(sub, axis=0)
    taxas = np.where(np.isnan(taxas), taxas[::-1], taxas)  # sem dias deste tipo nesta hora: o outro tipo
    return np.nan_to_num(taxas, nan=0.0), n


def longos_do_sensor(silencios: pd.DataFrame, sensor: str, g: vigiar.Grelha) -> np.ndarray:
    """As horas (dia × hora) que os silêncios longos do sensor tocam, como na base da ① (ADR-0025)."""
    mascara = np.zeros((g.dias, 24), dtype=bool)
    for s in silencios[silencios["sensor"] == sensor].itertuples(index=False):
        mascara |= vigiar.cobertura(s.inicio, s.fim, g.origem, g.dias) > 0
    return mascara


def base(contagens: pd.DataFrame, silencios: pd.DataFrame, alvo: pd.DataFrame, periodo: dict) -> pd.DataFrame:
    """Uma linha por sensor, tipo de dia e hora, com a taxa da base da ①. `silencios` são só os longos.

    `alvo` tem `id`, `tipo`, `rsus` e `passadeiras` (as passadeiras junto ao segmento, ou a própria).
    """
    g = vigiar.grelha(contagens, pd.Timestamp(periodo["inicio"]), pd.Timestamp(periodo["fim"]))
    dia_util = np.asarray((g.origem + pd.to_timedelta(np.arange(g.dias), unit="D")).day_of_week < 5)
    linhas = []
    for s in alvo.itertuples(index=False):
        taxas, n = taxas_base(g.de(s.id), longos_do_sensor(silencios, s.id, g), dia_util)
        for k, util in enumerate((False, True)):
            for h in range(24):
                linhas.append((s.id, s.tipo, list(s.rsus), list(s.passadeiras), util, h, float(taxas[k, h]), int(n[k, h])))
    return pd.DataFrame(linhas, columns=COLUNAS_BASE)


def sensores_do_painel(con: duckdb.DuckDBPyConnection) -> pd.DataFrame:
    """As passadeiras e os segmentos junto a elas (`passadeira_segmentos.parquet`), com as RSU de cada um."""
    return con.sql("""
        select s.id, s.tipo, coalesce(s.rsus, []) as rsus,
               case when s.tipo = 'passadeira' then [s.id] else list(ps.passadeira order by ps.passadeira) end as passadeiras
        from todos s left join passadeira_segmentos ps on ps.segmento = s.id
        where s.tipo = 'passadeira' or s.id in (select segmento from passadeira_segmentos)
        group by s.id, s.tipo, s.rsus order by s.tipo, s.id""").df()


def calcular(interim: Path, processed: Path, destino: Path, cfg: dict) -> pd.DataFrame:
    """Lê os eventos das passadeiras e dos segmentos e escreve `destino/agora_base.parquet`."""
    periodo = cfg["periodo_dados"]
    janela = {"inicio": periodo["inicio"], "fim": periodo["fim"]}
    con = duckdb.connect()
    try:
        vigiar._registar(con, interim, processed / "sensores.parquet", ["passadeira", "segmento"])
        caminho = processed / "passadeira_segmentos.parquet"
        if not caminho.is_file():
            raise FileNotFoundError(f"{caminho}: corre primeiro `riasense sensores`")
        con.register("passadeira_segmentos", con.read_parquet(str(caminho)))
        alvo = sensores_do_painel(con)
        con.execute(vigiar.EVENTOS, janela)
        silencios = con.sql(vigiar.SILENCIOS, params={**janela, "min_horas": cfg["vigiar"]["silencio_longo_h"]}).df()
        contagens = con.sql(vigiar.CONTAGENS).df()
        tab = base(contagens, silencios, alvo, periodo)
        destino.mkdir(parents=True, exist_ok=True)
        con.register("base", tab)
        con.sql("select * from base order by tipo, id, dia_util, hora").write_parquet(str(destino / "agora_base.parquet"))
        return tab
    finally:
        con.close()


def correr(cfg: dict) -> int:
    """Subcomando `riasense agora`: a base das taxas do painel «agora» (ADR-0032)."""
    interim = Path(os.environ.get("RIASENSE_DATA_INTERIM") or ingerir.INTERIM_PADRAO)
    processed = Path(os.environ.get("RIASENSE_DATA_PROCESSED") or sensores.PROCESSED_PADRAO)
    try:
        tab = calcular(interim, processed, processed, cfg)
    except (FileNotFoundError, ValueError) as e:
        print(f"erro: {e}", file=sys.stderr)
        return 1
    n = tab.drop_duplicates("id")["tipo"].value_counts()
    print(f"agora_base: {n.get('passadeira', 0)} passadeiras e {n.get('segmento', 0)} segmentos junto a elas, "
          f"{len(tab)} linhas → {processed / 'agora_base.parquet'}")
    return 0


# ---------------------------------------------------------------- a regra «sem comunicação»


def _indice(t: float) -> tuple[int, int, float]:
    """Tipo de dia (0 = fim de semana, 1 = dia útil), hora do dia e fim dessa hora, para `t` em minutos simulados."""
    dia = int(t // DIA_MIN) % 7
    return int(dia < 5), int(t % DIA_MIN // 60), (math.floor(t / 60) + 1) * 60.0


def esperados(taxas: np.ndarray, a: float, b: float) -> float:
    """Eventos esperados entre `a` e `b` (minutos), com a taxa de cada hora que o intervalo atravessa."""
    total, t = 0.0, a
    while t < b:
        util, h, fim_hora = _indice(t)
        fim = min(fim_hora, b)
        total += taxas[util, h] / 60.0 * (fim - t)
        t = fim
    return total


def limite(taxas: np.ndarray, desde: float, prob_max: float) -> float | None:
    """Minutos de silêncio, a contar de `desde`, ao fim dos quais o silêncio fica «sem comunicação». None se nunca fica
    (taxa 0 durante uma semana inteira)."""
    t, falta = desde, math.log(1 / prob_max)
    while t < desde + SEMANA_MIN:
        util, h, fim_hora = _indice(t)
        por_min = taxas[util, h] / 60.0
        if por_min > 0 and falta <= por_min * (fim_hora - t):
            return t + falta / por_min - desde
        falta -= por_min * (fim_hora - t)
        t = fim_hora
    return None


def calado(taxas: np.ndarray, ultimo: float, agora: float, prob_max: float) -> bool:
    """O silêncio de `ultimo` a `agora` tem probabilidade P(0 eventos) = e^(−esperados) < `prob_max`."""
    return math.exp(-esperados(taxas, ultimo, agora)) < prob_max


# ---------------------------------------------------------------- o simulador


@dataclass
class SensorPainel:
    id: str
    tipo: str
    rsus: list[str]
    passadeiras: list[str]
    taxas: np.ndarray  # 2 × 24, eventos/h: [fim de semana, dia útil]


def sensores_da_base(tab: pd.DataFrame) -> list[SensorPainel]:
    """Os sensores do painel a partir de `agora_base.parquet`, pela ordem do ficheiro (tipo e id)."""
    lista = []
    for sid, g in tab.groupby("id", sort=False):
        taxas = np.zeros((2, 24))
        taxas[g["dia_util"].astype(int).to_numpy(), g["hora"].to_numpy()] = g["taxa_h"].to_numpy()
        r = g.iloc[0]
        lista.append(SensorPainel(sid, r["tipo"], [str(x) for x in r["rsus"]], [str(x) for x in r["passadeiras"]], taxas))
    return lista


def proximo_evento(rng: np.random.Generator, taxas: np.ndarray, t: float) -> float:
    """O próximo evento depois de `t` num processo de Poisson com a taxa de cada hora (risco acumulado)."""
    falta, fim_semana = rng.exponential(), t + SEMANA_MIN
    while t < fim_semana:
        util, h, fim_hora = _indice(t)
        por_min = taxas[util, h] / 60.0
        if por_min > 0 and falta <= por_min * (fim_hora - t):
            return t + falta / por_min
        falta -= por_min * (fim_hora - t)
        t = fim_hora
    return math.inf


@dataclass
class Simulador:
    """Fonte simulada (ADR-0032): o último evento de cada sensor, à hora simulada, só em memória.

    Cada sensor tem o seu gerador (semente e posição), por isso a sequência de eventos é a mesma seja qual for a
    altura dos pedidos. «Simular a falha» deita fora os eventos dos sensores da RSU a partir desse instante, e
    «repor» volta a aceitá-los.
    """

    sensores: list[SensorPainel]
    semente: int
    velocidade: float  # minutos simulados por minuto real
    inicio: float  # minutos simulados desde a meia-noite de segunda-feira
    rsu_falha: str
    relogio: callable = time.monotonic
    falha_desde: float | None = None
    _t0: float = field(init=False)
    _rng: list = field(init=False)
    _ultimo: list = field(init=False)
    _proximo: list = field(init=False)
    _ate: float = field(init=False)

    def __post_init__(self):
        self._t0 = self.relogio()
        self._rng = [np.random.default_rng([self.semente, i]) for i in range(len(self.sensores))]
        comeco = self.inicio - AQUECIMENTO_MIN
        self._ultimo = [comeco] * len(self.sensores)  # sem nenhum evento, o silêncio conta desde o começo
        self._proximo = [proximo_evento(r, s.taxas, comeco) for r, s in zip(self._rng, self.sensores)]
        self._ate = comeco

    def hora(self) -> float:
        """Minutos simulados agora: o início mais o tempo real decorrido × velocidade."""
        return self.inicio + (self.relogio() - self._t0) / 60.0 * self.velocidade

    def na_falha(self, s: SensorPainel) -> bool:
        return self.rsu_falha in s.rsus

    def avancar(self, t: float) -> None:
        """Sorteia os eventos até `t`; os da RSU em falha, desde o início da falha, não chegam."""
        if t <= self._ate:
            return
        for i, s in enumerate(self.sensores):
            while self._proximo[i] <= t:
                e = self._proximo[i]
                if not (self.falha_desde is not None and e >= self.falha_desde and self.na_falha(s)):
                    self._ultimo[i] = e
                self._proximo[i] = proximo_evento(self._rng[i], s.taxas, e)
        self._ate = t

    def ultimos(self, t: float) -> list[float]:
        self.avancar(t)
        return list(self._ultimo)

    def simular_falha(self) -> None:
        t = self.hora()
        self.avancar(t)  # os eventos antes do botão contam
        if self.falha_desde is None:
            self.falha_desde = t


def hora_simulada(t: float) -> str:
    """«19h50»: só a hora, nunca uma data (ADR-0032)."""
    m = int(t % DIA_MIN)
    return f"{m // 60:02d}h{m % 60:02d}"


def estado(sim: Simulador, prob_max: float, intervalo_s: float, falha_min: float = 120.0) -> dict:
    """O que o painel mostra, à última leitura (`intervalo_s` em tempo simulado): cada sensor e cada RSU.

    `calado` é o alerta rápido «sem comunicação» (âmbar); `falha` junta-se quando o silêncio já dura `falha_min` minutos
    (`vigiar.falha_min_horas`, a regra da falha inesperada): passa a vermelho (ADR-0033, ponto 1).
    """
    passo = intervalo_s / 60.0
    t = math.floor(sim.hora() / passo) * passo
    ultimos = sim.ultimos(t)
    linhas = []
    for s, u in zip(sim.sensores, ultimos):
        lim = limite(s.taxas, u, prob_max)
        linhas.append({"id": s.id, "tipo": s.tipo, "rsus": s.rsus, "passadeiras": s.passadeiras,
                       "ultimo_dado_min": round(float(t - u), 1), "limite_min": None if lim is None else round(float(lim), 1),
                       "calado": (c := bool(calado(s.taxas, u, t, prob_max))), "falha": c and bool((t - u) >= falha_min)})
    rsus = []
    por_rsu: dict[str, list[int]] = {}
    for i, s in enumerate(sim.sensores):
        if s.tipo == "passadeira":
            for r in s.rsus:
                por_rsu.setdefault(r, []).append(i)
    for r, idx in sorted(por_rsu.items()):
        taxas = sum(sim.sensores[i].taxas for i in idx)
        u = max(ultimos[i] for i in idx)
        lim = limite(taxas, u, prob_max)
        rsus.append({"id": r, "passadeiras": [sim.sensores[i].id for i in idx], "ultimo_dado_min": round(float(t - u), 1),
                     "limite_min": None if lim is None else round(float(lim), 1),
                     "calado": (c := bool(calado(taxas, u, t, prob_max))), "falha": c and bool((t - u) >= falha_min)})
    return {
        "fonte": "simulador", "etiqueta": ETIQUETA, "hora_simulada": hora_simulada(t), "velocidade": float(sim.velocidade),
        "leitura_ms": round(intervalo_s / sim.velocidade * 1000), "prob_max": prob_max,
        "falha": {"rsu": sim.rsu_falha, "ativa": sim.falha_desde is not None},
        "sensores": linhas, "rsus": rsus,
    }


def simulador_do_config(tab: pd.DataFrame, cfg: dict, relogio=time.monotonic) -> Simulador:
    s = cfg["agora"]["simulador"]
    hh, mm = (int(x) for x in str(s["inicio"]["hora"]).split(":"))
    inicio = int(s["inicio"]["dia_da_semana"]) * DIA_MIN + hh * 60 + mm
    return Simulador(sensores_da_base(tab), int(s["semente"]), float(s["velocidade"]), float(inicio),
                     ids.urn(cfg["demo"]["incidente"]["rsu"]), relogio)
