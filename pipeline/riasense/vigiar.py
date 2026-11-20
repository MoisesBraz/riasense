"""Vigiar (①): falhas inesperadas e a sua classificação em falha de rede ou de dispositivo.

Definições do GLOSSARY.md, com os limiares da secção `vigiar` de config/riasense.yaml:

- **Falha inesperada**: um silêncio (intervalo sem eventos) com pelo menos `falha_min_horas` em horas em que o
  sensor costuma ter atividade. Uma hora tem atividade quando a mediana da mesma hora noutros dias chega a
  `esperado_min_eventos_hora`. O resto é **sossego normal**.
- **Falha de rede**: falhas inesperadas de 2 ou mais sensores da mesma RSU que começam até `agrupar_inicio_min`
  minutos depois da primeira do grupo.
- **Falha de dispositivo**: as restantes. O sensor deixou de comunicar e os outros da RSU não deixaram de comunicar com ele.

Adapta pipeline/viabilidade/gapsC.py e gapsC2.py, com três mudanças: a mediana em vez da média, o limiar
aplicado hora a hora em vez de à soma do silêncio, e o agrupamento por RSU em vez de global.
Cada linha da saída tem o URN do sensor e o instante de início, para virar um alerta NGSI-LD (ADR-0008).
"""

import os
import sys
import warnings
from dataclasses import dataclass
from pathlib import Path

import duckdb
import numpy as np
import pandas as pd

from riasense import ids, ingerir, sensores

HORA = pd.Timedelta(hours=1)
COLUNAS = [
    "sensor", "tipo_sensor", "rsu", "inicio", "fim", "duracao_h", "em_curso",
    "horas_inesperadas", "eventos_esperados", "tipo", "grupo",
]

# Um evento é uma linha de qualquer tabela de data/interim. O sensor tem o mesmo `id` que em sensores.parquet:
# no estacionamento é a RSU, nas visitas é a zona turística.
EVENTOS = """
create or replace temp table eventos as
select e.sensor, e.t from (
    select id as sensor, t from pas
    union all select zona, t from vis
    union all select rsu, t from pk where rsu is not null
    union all select id, t from seg
) e semi join vigiados v on v.id = e.sensor
where e.t >= cast($inicio as timestamp) and e.t < cast($fim as timestamp)
"""

# O início e o fim da janela entram como marcas: um sensor sem comunicação desde o início, ou até ao fim, também tem silêncio.
SILENCIOS = """
select sensor, anterior as inicio, t as fim from (
    select sensor, t, lag(t) over (partition by sensor order by t) as anterior from (
        select sensor, t from eventos
        union all select id, cast($inicio as timestamp) from vigiados
        union all select id, cast($fim as timestamp) from vigiados))
where epoch(t) - epoch(anterior) >= $min_horas * 3600
order by sensor, inicio
"""

CONTAGENS = "select sensor, date_trunc('hour', t) as hora, count(*) as n from eventos group by all"

SAIDA = """
select sensor, tipo_sensor, rsu, cast(inicio as timestamp) as inicio, cast(fim as timestamp) as fim,
       duracao_h, em_curso, horas_inesperadas, eventos_esperados, tipo, cast(grupo as integer) as grupo
from falhas order by inicio, sensor
"""


@dataclass(frozen=True)
class Grelha:
    """Eventos por hora de cada sensor, numa matriz dia × hora do dia que começa à meia-noite de `origem`."""

    origem: pd.Timestamp
    dias: int
    fora: np.ndarray  # horas fora da janela de dados: ficam NaN, porque não são zeros (não há dados)
    por_sensor: dict[str, np.ndarray]

    def de(self, sensor: str) -> np.ndarray:
        """Matriz do sensor; um sensor sem eventos tem zeros em todas as horas da janela."""
        if sensor in self.por_sensor:
            return self.por_sensor[sensor]
        return np.where(self.fora, np.nan, 0.0)


def cobertura(inicio: pd.Timestamp, fim: pd.Timestamp, origem: pd.Timestamp, dias: int) -> np.ndarray:
    """Fração (0 a 1) de cada hora da matriz dia × hora coberta pelo intervalo [inicio, fim)."""
    a, b = (inicio - origem) / HORA, (fim - origem) / HORA
    celula = np.arange(dias * 24, dtype=float).reshape(dias, 24)
    return np.clip(np.minimum(b, celula + 1) - np.maximum(a, celula), 0, 1)


def grelha(contagens: pd.DataFrame, inicio: pd.Timestamp, fim: pd.Timestamp) -> Grelha:
    """Monta a matriz dia × hora de cada sensor a partir das contagens (`sensor`, `hora`, `n`)."""
    origem = inicio.floor("D")
    dias = int(np.ceil((fim - origem) / pd.Timedelta(days=1)))
    fora = cobertura(inicio, fim, origem, dias) == 0
    posicao = ((contagens["hora"] - origem) / HORA).astype(int).to_numpy()
    por_sensor = {}
    for sensor, idx in contagens.groupby("sensor").indices.items():
        m = np.zeros(dias * 24)
        m[posicao[idx]] = contagens["n"].to_numpy()[idx]
        por_sensor[sensor] = np.where(fora, np.nan, m.reshape(dias, 24))
    return Grelha(origem, dias, fora, por_sensor)


def esperado(matriz: np.ndarray, excluir: np.ndarray) -> np.ndarray:
    """Eventos esperados em cada hora do dia: a mediana da mesma hora noutros dias, fora das horas `excluir`.

    A mediana e não a média: há sensores com rajadas numa só noite (estacionamento da RSU0022, zona 0001 na
    noite de sábado) que puxariam a média e fariam das outras noites, calmas, falhas. Sem outros dias, espera-se 0.
    """
    outros = np.where(excluir, np.nan, matriz)
    with warnings.catch_warnings():
        warnings.simplefilter("ignore", RuntimeWarning)  # hora sem nenhum outro dia com dados
        mediana = np.nanmedian(outros, axis=0)
    return np.nan_to_num(mediana, nan=0.0)


def avaliar(matriz: np.ndarray, g: Grelha, inicio: pd.Timestamp, fim: pd.Timestamp, limiar: float,
            mult: np.ndarray | None = None, longos: np.ndarray | None = None) -> tuple[float, float, float]:
    """Horas do silêncio [inicio, fim) em que se esperava atividade, os eventos esperados nessas horas e o total
    esperado em todas as horas do silêncio, sem o `limiar` (ADR-0025).

    As horas do próprio silêncio e as `longos` (dia × hora, os silêncios longos do sensor, ADR-0025) ficam fora do
    «habitual»: numa falha de 6 dias, ou num sensor que fica sem comunicação várias vezes, os dias sem comunicação não podem baixar o que
    se esperava. Só contam as horas cuja mediana chega ao `limiar`; as outras são sossego normal.
    `mult` (dia × hora) ajusta o esperado de cada hora; é o fator de chuva da variante com meteorologia.
    """
    frac = cobertura(inicio, fim, g.origem, g.dias)
    excluir = frac > 0 if longos is None else (frac > 0) | longos
    esp = esperado(matriz, excluir)[None, :] * (1.0 if mult is None else mult)
    ativa = esp >= limiar
    return float((frac * ativa).sum()), float((frac * np.where(ativa, esp, 0)).sum()), float((frac * esp).sum())


def matriz_chuva(meteo: pd.DataFrame, g: Grelha, chuva_min_mm: float) -> np.ndarray:
    """Células dia × hora da grelha com chuva ≥ `chuva_min_mm` (meteo.parquet)."""
    m = np.zeros(g.dias * 24, dtype=bool)
    pos = ((pd.to_datetime(meteo["t"]) - g.origem) / HORA).astype(int).to_numpy()
    dentro = (pos >= 0) & (pos < g.dias * 24)
    m[pos[dentro]] = meteo["chuva_mm"].to_numpy()[dentro] >= chuva_min_mm
    return m.reshape(g.dias, 24)


def fatores_chuva(g: Grelha, chuva: np.ndarray, silencios: pd.DataFrame, tipos: dict, limiar: float) -> dict[str, float]:
    """Fator de chuva por tipo de sensor: a mediana, entre os sensores, de eventos ÷ esperado nas horas de chuva.

    O esperado vem só das horas secas e fora dos silêncios, para a própria chuva e as falhas não o baixarem.
    Só contam as horas de chuva em que o sensor costuma ter atividade (esperado ≥ `limiar`).
    """
    razoes: dict[str, list[float]] = {}
    for sensor, matriz in g.por_sensor.items():
        silencio = np.zeros_like(chuva)
        for sil in silencios[silencios["sensor"] == sensor].itertuples(index=False):
            silencio |= cobertura(sil.inicio, sil.fim, g.origem, g.dias) > 0
        esp = np.broadcast_to(esperado(matriz, chuva | silencio), matriz.shape)
        celulas = chuva & ~silencio & ~g.fora & (esp >= limiar)
        if sensor in tipos and celulas.any() and esp[celulas].sum() > 0:
            razoes.setdefault(tipos[sensor], []).append(float(np.nansum(matriz[celulas]) / esp[celulas].sum()))
    return {t: float(np.median(r)) for t, r in razoes.items()}


def falhas_inesperadas(silencios: pd.DataFrame, g: Grelha, regras: dict, mult: dict | None = None) -> pd.DataFrame:
    """Dos silêncios (`sensor`, `inicio`, `fim`), ficam as falhas inesperadas (GLOSSARY, ADR-0025):

    - os que têm pelo menos `falha_min_horas` em horas com atividade;
    - os longos (≥ `silencio_longo_h`) com um total esperado ≥ `total_esperado_min`, sem limiar por hora: o sensor
      de pouco movimento que fica sem comunicação de vez. Nestes, `eventos_esperados` é esse total.
    """
    longo = pd.Timedelta(hours=regras["silencio_longo_h"])
    longos: dict[str, np.ndarray] = {}
    for s in silencios[(silencios["fim"] - silencios["inicio"]) >= longo].itertuples(index=False):
        cob = cobertura(s.inicio, s.fim, g.origem, g.dias) > 0
        longos[s.sensor] = longos[s.sensor] | cob if s.sensor in longos else cob
    linhas = []
    for s in silencios.itertuples(index=False):
        m = (mult or {}).get(s.sensor)
        horas, eventos, total = avaliar(g.de(s.sensor), g, s.inicio, s.fim, regras["esperado_min_eventos_hora"], m,
                                        longos.get(s.sensor))
        e_longo = s.fim - s.inicio >= longo
        if horas >= regras["falha_min_horas"] or (e_longo and total >= regras["total_esperado_min"]):
            linhas.append((s.sensor, s.inicio, s.fim, round(horas, 2), round(total if e_longo else eventos, 1)))
    return pd.DataFrame(linhas, columns=["sensor", "inicio", "fim", "horas_inesperadas", "eventos_esperados"])


def grupos_por_rsu(falhas: pd.DataFrame, rsus: dict[str, list[str]], agrupar_min: float) -> pd.DataFrame:
    """Uma linha por (falha, RSU) com o grupo a que pertence e quantos sensores tem esse grupo.

    O grupo conta a partir da primeira falha da RSU, e não em cadeia: 3 falhas com 10 minutos entre cada uma
    não fazem um grupo de 20 minutos. Um segmento com 2 RSU entra no agrupamento das duas.
    """
    pares = [(i, r, f.sensor, f.inicio) for i, f in zip(falhas.index, falhas.itertuples()) for r in rsus.get(f.sensor, [])]
    pares = pd.DataFrame(pares, columns=["falha", "rsu", "sensor", "inicio"]).sort_values(["rsu", "inicio", "sensor"])
    janela, ancoras, ancora, rsu_atual = pd.Timedelta(minutes=agrupar_min), [], None, None
    for rsu, inicio in zip(pares["rsu"], pares["inicio"]):
        if rsu != rsu_atual or inicio - ancora > janela:
            rsu_atual, ancora = rsu, inicio
        ancoras.append(ancora)
    pares["ancora"] = pd.Series(ancoras, index=pares.index, dtype="datetime64[us]")
    pares["sensores"] = pares.groupby(["rsu", "ancora"])["sensor"].transform("nunique")
    return pares


def classificar(falhas: pd.DataFrame, rsus: dict[str, list[str]], agrupar_min: float) -> pd.DataFrame:
    """Acrescenta `tipo` (rede ou dispositivo), `rsu` e `grupo`, o número comum às falhas de uma mesma falha de rede."""
    falhas = falhas.reset_index(drop=True)
    pares = grupos_por_rsu(falhas, rsus, agrupar_min)
    # Uma falha em 2 grupos de rede (segmento com 2 RSU) fica no maior.
    rede = pares[pares["sensores"] >= 2].sort_values(["sensores", "ancora", "rsu"], ascending=[False, True, True])
    rede = rede.drop_duplicates("falha").set_index("falha")
    e_rede = falhas.index.isin(rede.index)
    falhas["tipo"] = np.where(e_rede, "rede", "dispositivo")
    # Numa falha de dispositivo, a RSU é a do sensor (a 1.ª, num segmento com 2; nenhuma, se não a tiver).
    falhas["rsu"] = [
        rede.at[i, "rsu"] if e else (rsus.get(s) or [None])[0]
        for i, e, s in zip(falhas.index, e_rede, falhas["sensor"])
    ]
    chave = [
        f"{rede.at[i, 'rsu']}|{rede.at[i, 'ancora']}" if e else f"{s}|{t}"
        for i, e, s, t in zip(falhas.index, e_rede, falhas["sensor"], falhas["inicio"])
    ]
    falhas["grupo"] = _numerar(pd.Series(chave, index=falhas.index), falhas["inicio"])
    return falhas


def _numerar(chave: pd.Series, inicio: pd.Series) -> pd.Series:
    """Numera os grupos 1, 2, … pela ordem do início do grupo (empate: pela chave), para a saída ser estável."""
    primeiro = inicio.groupby(chave).transform("min")
    ordem = pd.DataFrame({"primeiro": primeiro, "chave": chave}).drop_duplicates().sort_values(["primeiro", "chave"])
    numero = {c: n for n, c in enumerate(ordem["chave"], start=1)}
    return chave.map(numero).astype("int64")


def multiplicadores(g: Grelha, meteo: pd.DataFrame, silencios: pd.DataFrame, vigiados: pd.DataFrame, regras: dict) -> dict:
    """Variante com meteorologia: por sensor, o fator de chuva do seu tipo nas horas de chuva e 1 nas outras."""
    chuva = matriz_chuva(meteo, g, regras["chuva_min_mm"])
    tipos = dict(zip(vigiados["id"], vigiados["tipo"]))
    fatores = fatores_chuva(g, chuva, silencios, tipos, regras["esperado_min_eventos_hora"])
    return {s: np.where(chuva, fatores.get(t, 1.0), 1.0) for s, t in tipos.items()}


def detetar(silencios: pd.DataFrame, contagens: pd.DataFrame, vigiados: pd.DataFrame, periodo: dict, regras: dict,
            meteo: pd.DataFrame | None = None) -> pd.DataFrame:
    """Toda a lógica do ①, sem ficheiros: dos silêncios e das contagens por hora às falhas classificadas (COLUNAS).

    Com `meteo`, o esperado baixa (ou sobe) nas horas de chuva pelo fator de chuva do tipo de sensor.
    """
    inicio, fim = pd.Timestamp(periodo["inicio"]), pd.Timestamp(periodo["fim"])
    g = grelha(contagens, inicio, fim)
    mult = None if meteo is None else multiplicadores(g, meteo, silencios, vigiados, regras)
    falhas = falhas_inesperadas(silencios, g, regras, mult)
    # `rsus` de sensores.parquet: a lista de URN de RSU do sensor (vazia se não tiver; 2 em alguns segmentos).
    rsus = {i: [str(x) for x in r] if r is not None else [] for i, r in zip(vigiados["id"], vigiados["rsus"])}
    falhas = classificar(falhas, rsus, regras["agrupar_inicio_min"])
    falhas["tipo_sensor"] = falhas["sensor"].map(dict(zip(vigiados["id"], vigiados["tipo"])))
    falhas["duracao_h"] = ((falhas["fim"] - falhas["inicio"]) / HORA).round(2)
    # A falha ainda durava quando os dados acabaram: o `fim` é o fim da janela, não o regresso do sensor.
    falhas["em_curso"] = falhas["fim"] >= fim
    return falhas[COLUNAS]


def _registar(con: duckdb.DuckDBPyConnection, interim: Path, tabela_sensores: Path, tipos: list[str]) -> None:
    for vista, tabela in {"pas": "passadeiras", "vis": "visitas", "pk": "estacionamento", "seg": "segmentos"}.items():
        caminho = interim / f"{tabela}.parquet"
        if not caminho.is_file():
            raise FileNotFoundError(f"{caminho}: corre primeiro `riasense ingerir`")
        con.register(vista, con.read_parquet(str(caminho)))
    if not tabela_sensores.is_file():
        raise FileNotFoundError(f"{tabela_sensores}: corre primeiro `riasense sensores`")
    con.register("todos", con.read_parquet(str(tabela_sensores)))
    con.execute(
        "create or replace temp table vigiados as select id, tipo, rsus from todos where list_contains($tipos, tipo)",
        {"tipos": tipos},
    )


def fracao_chuva(falhas: pd.DataFrame, g: Grelha, chuva: np.ndarray, limiar: float) -> list[float]:
    """Para cada falha, a fração das suas horas inesperadas (sem meteorologia) que tiveram chuva."""
    fracoes = []
    for f in falhas.itertuples(index=False):
        frac = cobertura(f.inicio, f.fim, g.origem, g.dias)
        inesperadas = frac * (esperado(g.de(f.sensor), frac > 0)[None, :] >= limiar)
        total = inesperadas.sum()
        fracoes.append(float((inesperadas * chuva).sum() / total) if total > 0 else 0.0)
    return fracoes


def comparar_meteo(silencios, contagens, vigiados, periodo: dict, regras: dict, meteo: pd.DataFrame) -> pd.DataFrame:
    """As falhas com e sem meteorologia, lado a lado: `em_sem`/`em_com`, o tipo em cada uma e `frac_chuva`."""
    sem = detetar(silencios, contagens, vigiados, periodo, regras)
    com = detetar(silencios, contagens, vigiados, periodo, regras, meteo)
    colunas = ["sensor", "tipo_sensor", "inicio", "fim", "tipo", "horas_inesperadas"]
    comp = sem[colunas].merge(com[colunas], on=["sensor", "tipo_sensor", "inicio", "fim"], how="outer", suffixes=("_sem", "_com"))
    g = grelha(contagens, pd.Timestamp(periodo["inicio"]), pd.Timestamp(periodo["fim"]))
    chuva = matriz_chuva(meteo, g, regras["chuva_min_mm"])
    comp["frac_chuva"] = fracao_chuva(comp, g, chuva, regras["esperado_min_eventos_hora"])
    comp["em_sem"], comp["em_com"] = comp["tipo_sem"].notna(), comp["tipo_com"].notna()
    return comp.sort_values(["inicio", "sensor"]).reset_index(drop=True)


def meteo_melhora(comp: pd.DataFrame, cfg: dict) -> dict[str, bool]:
    """O critério do README da ①, fixado antes de correr: as 3 condições e a decisão."""
    demo = {ids.urn(p) for p in cfg["demo"]["passadeiras"]}
    rede_com = comp[(comp["tipo_com"] == "rede") & comp["sensor"].isin(demo)]
    saem, entram = comp[comp["em_sem"] & ~comp["em_com"]], comp[~comp["em_sem"] & comp["em_com"]]
    criterios = {
        "rsu0030_rede": set(rede_com["sensor"]) == demo,
        "muda": len(saem) + len(entram) > 0,
        "saem_por_chuva": bool((saem["frac_chuva"] >= 0.5).all()),
        "nenhuma_nova_fora_da_chuva": bool((entram["frac_chuva"] > 0).all()),
    }
    return criterios | {"entra": all(criterios.values())}


def _meteo(con: duckdb.DuckDBPyConnection, destino: Path, usar: bool) -> pd.DataFrame | None:
    """A série de meteo.parquet, se existir; sem ela só se falha quando o config pede a meteorologia."""
    caminho = destino / "meteo.parquet"
    if not caminho.is_file():
        if usar:
            raise FileNotFoundError(f"{caminho}: corre primeiro `riasense meteo` (precisa de rede)")
        return None
    return con.read_parquet(str(caminho)).df()


def calcular(interim: Path, tabela_sensores: Path, destino: Path, cfg: dict) -> pd.DataFrame:
    """Lê os eventos de `interim` e os sensores, deteta as falhas, escreve `destino/falhas.parquet` e devolve-as."""
    regras, periodo = cfg["vigiar"], cfg["periodo_dados"]
    janela = {"inicio": periodo["inicio"], "fim": periodo["fim"]}
    con = duckdb.connect()
    try:
        _registar(con, interim, tabela_sensores, regras["tipos_sensor"])
        con.execute(EVENTOS, janela)
        silencios = con.sql(SILENCIOS, params={**janela, "min_horas": regras["falha_min_horas"]}).df()
        contagens = con.sql(CONTAGENS).df()
        vigiados = con.sql("select id, tipo, rsus from vigiados").df()
        meteo = _meteo(con, destino, regras["usar_meteo"])
        falhas = detetar(silencios, contagens, vigiados, periodo, regras, meteo if regras["usar_meteo"] else None)
        destino.mkdir(parents=True, exist_ok=True)
        con.register("falhas", falhas)
        con.sql(SAIDA).write_parquet(str(destino / "falhas.parquet"))
        if meteo is not None:  # a comparação com e sem fica sempre escrita quando há série
            con.register("comparacao", comparar_meteo(silencios, contagens, vigiados, periodo, regras, meteo))
            con.table("comparacao").write_parquet(str(destino / "meteo_vigiar.parquet"))
        return falhas
    finally:
        con.close()


def correr(cfg: dict) -> int:
    """Subcomando `riasense vigiar`: lê RIASENSE_DATA_INTERIM e sensores.parquet; escreve em RIASENSE_DATA_PROCESSED."""
    interim = Path(os.environ.get("RIASENSE_DATA_INTERIM") or ingerir.INTERIM_PADRAO)
    destino = Path(os.environ.get("RIASENSE_DATA_PROCESSED") or sensores.PROCESSED_PADRAO)
    try:
        falhas = calcular(interim, destino / "sensores.parquet", destino, cfg)
    except FileNotFoundError as e:
        print(f"erro: {e}", file=sys.stderr)
        return 1
    rede = falhas[falhas["tipo"] == "rede"]
    print(
        f"falhas inesperadas: {len(falhas)} (rede: {len(rede)}, dispositivo: {len(falhas) - len(rede)};"
        f" grupos de rede: {rede['grupo'].nunique()}) → {destino / 'falhas.parquet'}"
    )
    return 0
