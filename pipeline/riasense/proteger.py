"""Proteger (ADR-0006): abrandamento dos veículos junto às passadeiras.

Para cada passadeira, regride a velocidade média dos veículos nos segmentos próximos (`passadeira_segmentos`, a ≤ 30 m)
por intervalo de 15 min sobre o número de travessias, controlando o volume de veículos, a hora e o fim de semana.
O teste placebo repete a regressão com as travessias da passadeira mais distante: se também houvesse «abrandamento»,
o efeito viria da atividade geral da cidade e não dos peões. Os resultados são associações, não causalidade.

Os intervalos em que a passadeira, ou a do seu placebo, está em falha segundo a ① (`falhas.parquet`) não entram: os zeros
de travessias seriam falsos e enviesariam o efeito. A regressão do placebo usa assim os mesmos intervalos.

Nas passadeiras com semáforo (`passadeiras_osm.parquet`, ADR-0019), quem para o carro é a luz e não o número de peões:
o efeito calcula-se na mesma, mas a passadeira não é assinalada (ADR-0024).

O método é o de `pipeline/viabilidade/task2.py`. As velocidades ficam em m/s até à apresentação (convenções do README):
como a regressão é linear, o coeficiente em m/s × 3,6 é o efeito em km/h.
"""

import os
import sys
from pathlib import Path
from statistics import NormalDist

import duckdb
import numpy as np
import pandas as pd

from riasense import ingerir, sensores

KMH_POR_MS = 3.6

# Velocidade média, veículos e % acima do limite por passadeira e intervalo, nos segmentos de `passadeira_segmentos`.
# Um veículo num segmento partilhado conta para todas as passadeiras desse segmento, como no task2.py.
# Só entram velocidades e durações válidas (task2.py: velocidade ≠ 16383 e duração > 0), que a ingestão deixou não nulas.
# Uma passadeira em falha (falhas.parquet, ①) não conta travessias: os zeros dentro da falha seriam falsos. Saem os
# intervalos que tocam uma falha da passadeira ou do seu placebo (a falha começa dentro do intervalo, ou ainda não acabou).
INTERVALOS = """
with veiculos as (
  select ps.passadeira, time_bucket(to_minutes($intervalo_min), s.t) as t, s.vel_media_ms,
         100.0 * (s.vel_media_ms > s.vel_limite_ms)::integer as acima
  from seg s join ps on ps.segmento = s.id
  where s.vel_media_ms is not null and s.duracao_s is not null
), por_intervalo as (
  select passadeira, t, avg(vel_media_ms) as vel_media_ms, count(*) as veiculos, avg(acima) as pct_acima_limite
  from veiculos group by passadeira, t
), travessias as (
  select id as passadeira, time_bucket(to_minutes($intervalo_min), t) as t, count(*) as travessias
  from cw group by all
), placebo as (
  -- A passadeira mais distante: as travessias de lá não podem fazer abrandar os carros daqui.
  select a.id as passadeira, arg_max(b.id, (a.x - b.x) ^ 2 + (a.y - b.y) ^ 2) as placebo
  from cs a join cs b on a.id <> b.id group by a.id
)
select p.passadeira, p.t, coalesce(tr.travessias, 0) as travessias, pl.placebo,
       coalesce(tp.travessias, 0) as travessias_placebo, p.veiculos, p.vel_media_ms, p.pct_acima_limite,
       hour(p.t) as hora, isodow(p.t) >= 6 as fim_de_semana
from por_intervalo p
join cs c on c.id = p.passadeira
left join placebo pl on pl.passadeira = p.passadeira
left join travessias tr on tr.passadeira = p.passadeira and tr.t = p.t
left join travessias tp on tp.passadeira = pl.placebo and tp.t = p.t
where p.veiculos >= $min_veiculos
  and not exists (
    select 1 from fa
    where fa.sensor in (p.passadeira, pl.placebo)
      and fa.inicio < p.t + to_minutes($intervalo_min) and fa.fim >= p.t)
order by p.passadeira, p.t
"""

COLUNAS_INTERVALOS = ["passadeira", "t", "travessias", "veiculos", "vel_media_ms", "pct_acima_limite"]
COLUNAS_METEO = ("chuva_mm", "temperatura_c")  # de data/processed/meteo.parquet (`riasense meteo`)
COLUNAS_RESUMO = [
    "id", "n_intervalos", "travessias_media", "efeito_kmh", "ic_inf", "ic_sup", "abranda",
    "placebo", "placebo_efeito_kmh", "placebo_ic_inf", "placebo_ic_sup", "assinalada",
    "pct_acima_limite_movimentados", "pct_acima_limite_calmos",
]
COLUNAS_PASSADEIRAS = [*COLUNAS_RESUMO, "semaforo"]  # proteger_passadeiras.parquet


def ols_hac(y: np.ndarray, X: np.ndarray, lags: int) -> tuple[np.ndarray, np.ndarray]:
    """OLS com constante e erros-padrão robustos de Newey-West (pesos de Bartlett, correção n/(n−k)), como no task2.py.

    Os intervalos seguidos parecem-se (o trânsito de agora é parecido com o de há 15 min), por isso os erros-padrão
    clássicos sairiam pequenos de mais. Os desfasamentos contam-se em linhas, pela ordem do tempo.
    Devolve os coeficientes e os erros-padrão das colunas de X, sem a constante.
    """
    X1 = np.column_stack([X, np.ones(len(y))])
    b, *_ = np.linalg.lstsq(X1, y, rcond=None)
    Xe = X1 * (y - X1 @ b)[:, None]
    n, k = X1.shape
    S = Xe.T @ Xe
    for lag in range(1, lags + 1):
        G = Xe[lag:].T @ Xe[:-lag]
        S += (1 - lag / (lags + 1)) * (G + G.T)
    # pinv: uma hora ou o fim de semana sem variação tornariam X'X singular.
    XtX_inv = np.linalg.pinv(X1.T @ X1)
    V = XtX_inv @ S @ XtX_inv * n / (n - k)
    return b[:-1], np.sqrt(np.diag(V))[:-1]


def controlos(veiculos: np.ndarray, hora: np.ndarray, fim_de_semana: np.ndarray) -> np.ndarray:
    """Volume de veículos, uma dummy por hora presente (menos a primeira, que fica na constante) e o fim de semana."""
    horas = np.unique(hora)[1:]
    dummies = (np.asarray(hora)[:, None] == horas[None, :]).astype(float)
    return np.column_stack([np.asarray(veiculos, float), dummies, np.asarray(fim_de_semana, float)])


def efeito(y: np.ndarray, x: np.ndarray, ctrl: np.ndarray, lags: int) -> tuple[float, float]:
    """Coeficiente de `x` na regressão de `y` sobre `x` e os controlos, com o seu erro-padrão."""
    b, ep = ols_hac(np.asarray(y, float), np.column_stack([np.asarray(x, float), ctrl]), lags)
    return float(b[0]), float(ep[0])


def intervalo_confianca(coef: float, ep: float, nivel: float) -> tuple[float, float]:
    """IC normal: com 0,95, coef ± 1,96 × erro-padrão."""
    z = NormalDist().inv_cdf(0.5 + nivel / 2)
    return coef - z * ep, coef + z * ep


def em_kmh(coef_ms: float, por: float) -> float:
    """Efeito em m/s por travessia → km/h por `por` travessias."""
    return coef_ms * por * KMH_POR_MS


def pct_acima_limite(travessias: np.ndarray, pct: np.ndarray, q_movimentado: float, q_calmo: float) -> tuple[float, float]:
    """% de veículos acima do limite nos intervalos movimentados (travessias ≥ quantil alto) e calmos (≤ quantil baixo).

    É a média das percentagens de cada intervalo, como no task2.py: cada intervalo pesa o mesmo.
    """
    travessias, pct = np.asarray(travessias, float), np.asarray(pct, float)
    alto, baixo = np.quantile(travessias, [q_movimentado, q_calmo])
    return float(np.nanmean(pct[travessias >= alto])), float(np.nanmean(pct[travessias <= baixo]))


def controlos_passadeira(iv: pd.DataFrame, meteo: tuple[str, ...] = ()) -> np.ndarray:
    """Controlos de uma passadeira; com `meteo`, junta as colunas de meteorologia (ADR-0009)."""
    ctrl = controlos(iv["veiculos"].to_numpy(), iv["hora"].to_numpy(), iv["fim_de_semana"].to_numpy())
    return np.column_stack([ctrl, iv[list(meteo)].to_numpy(float)]) if meteo else ctrl


def r2_ajustado(y: np.ndarray, X: np.ndarray) -> float:
    """R² ajustado da regressão OLS com constante: mede se um controlo novo explica a velocidade e não só a complica."""
    X1 = np.column_stack([X, np.ones(len(y))])
    b, *_ = np.linalg.lstsq(X1, y, rcond=None)
    n, k = X1.shape
    ss_res, ss_tot = float(((y - X1 @ b) ** 2).sum()), float(((y - y.mean()) ** 2).sum())
    return 1 - (ss_res / (n - k)) / (ss_tot / (n - 1))


def resumir_passadeira(iv: pd.DataFrame, p: dict, meteo: tuple[str, ...] = ()) -> dict:
    """Efeito das travessias e do placebo (km/h por +N travessias, com IC) e % acima do limite de uma passadeira."""
    ctrl = controlos_passadeira(iv, meteo)
    y = iv["vel_media_ms"].to_numpy(float)
    linha = {"n_intervalos": len(iv), "travessias_media": float(iv["travessias"].mean()), "placebo": iv["placebo"].iloc[0]}
    for prefixo, coluna in (("", "travessias"), ("placebo_", "travessias_placebo")):
        coef, ep = efeito(y, iv[coluna].to_numpy(float), ctrl, p["lags_newey_west"])
        inf, sup = intervalo_confianca(coef, ep, p["nivel_ic"])
        linha[f"{prefixo}efeito_kmh"] = em_kmh(coef, p["por_travessias"])
        linha[f"{prefixo}ic_inf"] = em_kmh(inf, p["por_travessias"])
        linha[f"{prefixo}ic_sup"] = em_kmh(sup, p["por_travessias"])
    mov, calmo = pct_acima_limite(iv["travessias"], iv["pct_acima_limite"], p["quantil_movimentado"], p["quantil_calmo"])
    return linha | {"pct_acima_limite_movimentados": mov, "pct_acima_limite_calmos": calmo}


def assinalar(ic_sup: pd.Series, travessias_media: pd.Series, quantil: float) -> pd.Series:
    """Passadeira assinalada (GLOSSARY.md): sem abrandamento claro (o IC não fica todo abaixo de 0)
    apesar de muitas travessias (média por intervalo ≥ o quantil entre as passadeiras; a mediana no task2.py)."""
    return (ic_sup >= 0) & (travessias_media >= travessias_media.quantile(quantil))


def resumir(iv: pd.DataFrame, p: dict, meteo: tuple[str, ...] = ()) -> pd.DataFrame:
    """Uma linha por passadeira, a partir da tabela de intervalos (colunas de INTERVALOS)."""
    grupos = iv.groupby("passadeira", sort=True)
    res = pd.DataFrame([{"id": pid, **resumir_passadeira(g, p, meteo)} for pid, g in grupos])
    res["abranda"] = res["ic_sup"] < 0
    res["assinalada"] = assinalar(res["ic_sup"], res["travessias_media"], p["quantil_assinalar"])
    return res[COLUNAS_RESUMO]


def aplicar_semaforo(res: pd.DataFrame, osm: pd.DataFrame) -> pd.DataFrame:
    """ADR-0024: junta `semaforo` e tira a marca de assinalada às passadeiras com semáforo; o efeito fica igual.

    Uma passadeira sem atributos do OSM (a mais de 25 m de uma travessia, ADR-0019) conta como sem semáforo.
    """
    semaforo = res["id"].map(osm.set_index("id")["semaforo"]).fillna(False).astype(bool)
    return res.assign(semaforo=semaforo, assinalada=res["assinalada"] & ~semaforo)[COLUNAS_PASSADEIRAS]


def _semaforos(processed: Path) -> pd.DataFrame:
    caminho = processed / "passadeiras_osm.parquet"
    if not caminho.is_file():
        raise FileNotFoundError(f"{caminho}: corre primeiro `riasense osm` (precisa de rede; a cópia é versionada)")
    return duckdb.sql(f"select id, semaforo from read_parquet('{caminho}')").df()


def juntar_meteo(iv: pd.DataFrame, meteo: pd.DataFrame) -> pd.DataFrame:
    """Junta a cada intervalo de 15 min a chuva e a temperatura da hora a que pertence."""
    iv = iv.assign(_hora=iv["t"].dt.floor("h"))
    junto = iv.merge(meteo.rename(columns={"t": "_hora"}), on="_hora", how="left").drop(columns="_hora")
    if junto[list(COLUNAS_METEO)].isna().any().any():
        raise ValueError("a série de meteorologia não cobre todos os intervalos")
    return junto


def comparar_meteo(iv: pd.DataFrame, p: dict) -> pd.DataFrame:
    """④ com e sem meteorologia, por passadeira: efeito, abrandamento, assinalada e R² ajustado (ADR-0009)."""
    sem, com = resumir(iv, p), resumir(iv, p, COLUNAS_METEO)
    r2 = []
    for pid, g in iv.groupby("passadeira", sort=True):
        y, x = g["vel_media_ms"].to_numpy(float), g[["travessias"]].to_numpy(float)
        r2.append({"id": pid, "r2aj_sem": r2_ajustado(y, np.column_stack([x, controlos_passadeira(g)])),
                   "r2aj_com": r2_ajustado(y, np.column_stack([x, controlos_passadeira(g, COLUNAS_METEO)]))})
    colunas = ["id", "efeito_kmh", "ic_inf", "ic_sup", "abranda", "assinalada"]
    return sem[colunas].merge(com[colunas], on="id", suffixes=("_sem", "_com")).merge(pd.DataFrame(r2), on="id")


def _registar_fontes(con: duckdb.DuckDBPyConnection, interim: Path, processed: Path) -> None:
    fontes = {  # vista: (ficheiro, subcomando que o escreve)
        "seg": (interim / "segmentos.parquet", "ingerir"),
        "cw": (interim / "passadeiras.parquet", "ingerir"),
        "ps": (processed / "passadeira_segmentos.parquet", "sensores"),
        "sensores": (processed / "sensores.parquet", "sensores"),
        "fa": (processed / "falhas.parquet", "vigiar"),
    }
    for vista, (caminho, passo) in fontes.items():
        if not caminho.is_file():
            raise FileNotFoundError(f"{caminho}: corre primeiro `riasense {passo}`")
        con.register(vista, con.read_parquet(str(caminho)))
    con.register("cs", con.table("sensores").filter("tipo = 'passadeira'"))


def intervalos(con: duckdb.DuckDBPyConnection, cfg: dict) -> pd.DataFrame:
    """Tabela por passadeira e intervalo, já sem os intervalos com poucos veículos nem os de falha (da passadeira ou do placebo)."""
    p = cfg["proteger"]
    params = {
        "intervalo_min": p["intervalo_min"],
        "min_veiculos": p["min_veiculos_intervalo"],
    }
    return con.sql(INTERVALOS, params=params).df()


def _com_meteo(con: duckdb.DuckDBPyConnection, iv: pd.DataFrame, processed: Path, destino: Path, p: dict) -> pd.DataFrame:
    """Se houver meteo.parquet, junta-o aos intervalos e escreve a comparação com e sem (`meteo_proteger.parquet`).

    Sem a série, a ④ corre como antes; só falha se o config pedir a meteorologia (`proteger.usar_meteo`).
    """
    caminho = processed / "meteo.parquet"
    if not caminho.is_file():
        if p["usar_meteo"]:
            raise FileNotFoundError(f"{caminho}: corre primeiro `riasense meteo` (precisa de rede)")
        return iv
    iv = juntar_meteo(iv, con.read_parquet(str(caminho)).df())
    con.register("comparacao", comparar_meteo(iv, p))
    con.table("comparacao").write_parquet(str(destino / "meteo_proteger.parquet"))
    return iv


def calcular(interim: Path, processed: Path, destino: Path, cfg: dict) -> pd.DataFrame:
    """Escreve `proteger_passadeiras` e `proteger_intervalos` em Parquet e devolve o resumo por passadeira."""
    destino.mkdir(parents=True, exist_ok=True)
    con = duckdb.connect()
    try:
        _registar_fontes(con, interim, processed)
        iv = intervalos(con, cfg)
        if iv.empty:
            raise ValueError("nenhum intervalo com veículos junto às passadeiras")
        iv = _com_meteo(con, iv, processed, destino, cfg["proteger"])
        meteo = COLUNAS_METEO if cfg["proteger"]["usar_meteo"] else ()
        res = aplicar_semaforo(resumir(iv, cfg["proteger"], meteo), _semaforos(processed))
        con.register("resumo", res)
        con.table("resumo").write_parquet(str(destino / "proteger_passadeiras.parquet"))
        con.register("iv", iv[COLUNAS_INTERVALOS])
        con.table("iv").write_parquet(str(destino / "proteger_intervalos.parquet"))
        return res
    finally:
        con.close()


def _imprimir(res: pd.DataFrame) -> None:
    print("passadeira  n    efeito km/h/+10 trav. [IC]      placebo [IC]               >limite mov./calmo  assinalada/semáforo")
    for r in res.itertuples():
        print(
            f"{r.id.rsplit(':', 1)[-1]:>10} {r.n_intervalos:4d}  {r.efeito_kmh:+.2f} [{r.ic_inf:+.2f}, {r.ic_sup:+.2f}]"
            f"   {r.placebo_efeito_kmh:+.2f} [{r.placebo_ic_inf:+.2f}, {r.placebo_ic_sup:+.2f}]"
            f"   {r.pct_acima_limite_movimentados:5.1f}% / {r.pct_acima_limite_calmos:5.1f}%   {'sim' if r.assinalada else 'semáforo' if r.semaforo else ''}"
        )
    print(f"abrandamento em {int(res.abranda.sum())} de {len(res)}; assinaladas: {', '.join(res.id[res.assinalada]) or 'nenhuma'}")


def correr(cfg: dict) -> int:
    """Subcomando `riasense proteger`: lê RIASENSE_DATA_INTERIM e RIASENSE_DATA_PROCESSED e escreve em RIASENSE_DATA_PROCESSED."""
    interim = Path(os.environ.get("RIASENSE_DATA_INTERIM") or ingerir.INTERIM_PADRAO)
    processed = Path(os.environ.get("RIASENSE_DATA_PROCESSED") or sensores.PROCESSED_PADRAO)
    try:
        res = calcular(interim, processed, processed, cfg)
    except (FileNotFoundError, ValueError) as e:
        print(f"erro: {e}", file=sys.stderr)
        return 1
    _imprimir(res)
    print(f"→ {processed / 'proteger_passadeiras.parquet'}, {processed / 'proteger_intervalos.parquet'}")
    return 0
