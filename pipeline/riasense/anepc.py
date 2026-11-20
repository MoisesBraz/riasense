"""Coerência temporal do risco potencial com os atropelamentos da ANEPC (ADR-0036).

Dados: arquivo público centraldedados/protecao_civil (2016 a 05/07/2020, raspado do prociv.pt), sem licença declarada;
só serve de teste de coerência, com a autorização dos mentores (pergunta 7) e a declaração no relatório.
Os CSV ficam fora do git (RIASENSE_DATA_ANEPC); só o resultado agregado, `validacao_anepc.parquet`, se versiona.

Só validação temporal, por hora do dia: nunca por passadeira, nunca entrada do risco nem dos modelos.
"""

import hashlib
import os
import sys
import urllib.request
from pathlib import Path

import duckdb
import numpy as np
import pandas as pd

from riasense import sensores
from riasense.config import ConfigInvalida

AVISO = ("Dados recolhidos de fontes abertas, usados só para contexto e coerência. "
         "Carecem de validação junto das entidades responsáveis.")
PASTA_PADRAO = Path("data/external/anepc")
HORAS = 24
COLUNAS = ["quadro", "ambito", "n", "hora", "atropelamentos", "risco_potencial", "exposicao_pct",
           "medida", "contra", "valor", "ic_inf", "ic_sup", "leitura"]
LEITURA_ACRESCENTA = "o risco acrescenta à exposição"
LEITURA_NAO_ACRESCENTA = "o risco potencial não acompanha os atropelamentos melhor do que a exposição sozinha"
LEITURA_COERENTE = "coerente"
LEITURA_INCOERENTE = "sem coerência demonstrada"


class FonteInvalida(ValueError):
    """Um CSV em falta que não se consegue descarregar, ou com um SHA-256 diferente do do config."""


def validar(cfg: dict) -> None:
    """A regra do ADR-0036 vem do config; recusa o que a deixaria sem sentido."""
    v = cfg["validacao_anepc"]
    erros = []
    b = v["bootstrap"]
    if not (isinstance(b["n"], int) and b["n"] >= 100):
        erros.append("validacao_anepc.bootstrap.n tem de ser um inteiro ≥ 100")
    if not 0 < b["nivel"] < 1:
        erros.append("validacao_anepc.bootstrap.nivel tem de estar entre 0 e 1")
    if not 0 < v["coerente_spearman_min"] <= 1:
        erros.append("validacao_anepc.coerente_spearman_min tem de estar entre 0 e 1")
    if v["ambito_leitura"] not in v["ambitos"]:
        erros.append("validacao_anepc.ambito_leitura tem de ser um dos ambitos")
    for nome, filtro in v["ambitos"].items():
        if not isinstance(filtro, dict) or not set(filtro) <= {"distrito", "concelho"}:
            erros.append(f"validacao_anepc.ambitos.{nome}: só aceita distrito e concelho")
    ficheiros = cfg["fontes_externas"]["anepc"]["ficheiros"]
    if not ficheiros or any(len(str(h)) != 64 for h in ficheiros.values()):
        erros.append("fontes_externas.anepc.ficheiros: cada ficheiro precisa do seu SHA-256 (64 caracteres)")
    if erros:
        raise ConfigInvalida("; ".join(erros))


def soma(caminho: Path) -> str:
    h = hashlib.sha256()
    with caminho.open("rb") as f:
        for bloco in iter(lambda: f.read(1 << 20), b""):
            h.update(bloco)
    return h.hexdigest()


def garantir(cfg: dict, pasta: Path, tempo_max_s: int = 300) -> None:
    """Os CSV estão em `pasta` e com o SHA-256 do config; os que faltam descarregam-se do commit fixado (precisa de rede)."""
    a = cfg["fontes_externas"]["anepc"]
    pasta.mkdir(parents=True, exist_ok=True)
    for nome, esperado in a["ficheiros"].items():
        destino = pasta / nome
        if not destino.is_file():
            url = a["url"].format(commit=a["commit"], ficheiro=nome)
            parcial = destino.with_suffix(".parte")
            try:
                with urllib.request.urlopen(url, timeout=tempo_max_s) as r, parcial.open("wb") as f:  # GET a um URL do config
                    for bloco in iter(lambda: r.read(1 << 20), b""):
                        f.write(bloco)
            except OSError as e:
                parcial.unlink(missing_ok=True)
                raise FonteInvalida(f"{nome}: não foi possível descarregar ({e})") from e
            if soma(parcial) != esperado:
                parcial.unlink(missing_ok=True)
                raise FonteInvalida(f"{nome}: o SHA-256 descarregado não é o do config")
            parcial.replace(destino)
        elif soma(destino) != esperado:
            raise FonteInvalida(f"{destino}: o SHA-256 não é o do config; apaga o ficheiro para o descarregar outra vez")


def datas(texto: pd.Series) -> pd.Series:
    """Os ficheiros têm 2 formatos: dd/mm/aaaa hh:mm:ss (2016 a 2018) e ISO (2019 e 2020). O que não se lê fica NaT."""
    iso = pd.to_datetime(texto, format="ISO8601", errors="coerce")
    dmy = pd.to_datetime(texto, format="%d/%m/%Y %H:%M:%S", errors="coerce")
    return iso.fillna(dmy)


def ler(cfg: dict, pasta: Path) -> tuple[pd.DataFrame, dict]:
    """Os atropelamentos rodoviários dos CSV: `numero`, `t`, `distrito`, `concelho`, sem duplicados de `numero`.

    As linhas de data ilegível descartam-se e contam-se (`n_data_ilegivel`).
    """
    ficheiros = [str(pasta / nome) for nome in cfg["fontes_externas"]["anepc"]["ficheiros"]]
    con = duckdb.connect()
    try:
        bruto = con.execute(
            "select Numero as numero, DataOcorrencia as data, Distrito as distrito, Concelho as concelho "
            "from read_csv(?, header=true, union_by_name=true, all_varchar=true) where Natureza = ?",
            [ficheiros, cfg["validacao_anepc"]["natureza"]],
        ).df()
    finally:
        con.close()
    bruto["t"] = datas(bruto["data"])
    ilegivel = int(bruto["t"].isna().sum())
    ev = bruto.dropna(subset=["t"]).copy()
    repetido = ev["numero"].notna() & ev["numero"].duplicated()
    n_duplicados = int(repetido.sum())
    ev = ev[~repetido]
    for c in ("distrito", "concelho"):
        ev[c] = ev[c].str.strip().str.upper()
    return ev[["numero", "t", "distrito", "concelho"]].reset_index(drop=True), {
        "n_lidas": len(bruto), "n_data_ilegivel": ilegivel, "n_duplicados": n_duplicados}


def selecionar(ev: pd.DataFrame, filtro: dict) -> pd.DataFrame:
    """Os atropelamentos de um âmbito (filtros sobre Distrito e Concelho; `{}` é o país todo)."""
    m = pd.Series(True, index=ev.index)
    for campo, valor in filtro.items():
        m &= ev[campo] == str(valor).upper()
    return ev[m]


def contagem(horas: np.ndarray) -> np.ndarray:
    return np.bincount(horas, minlength=HORAS)


def perfil_risco(risco: pd.DataFrame) -> pd.DataFrame:
    """A média, por hora do dia, de `risco_potencial` e de `exposicao_pct` (a componente dos peões) nas passadeiras e horas da semana."""
    r = risco.dropna(subset=["risco_potencial"]).assign(hora=lambda d: pd.to_datetime(d["t"]).dt.hour)
    p = r.groupby("hora")[["risco_potencial", "exposicao_pct"]].mean().reindex(range(HORAS))
    if p.isna().any().any():
        raise ValueError("o risco potencial não cobre as 24 horas do dia")
    return p


def _pearson(m: np.ndarray, v: np.ndarray) -> np.ndarray:
    """Pearson de cada linha de `m` com `v`; NaN onde uma das séries é constante."""
    m = np.atleast_2d(np.asarray(m, dtype=float))
    mc = m - m.mean(axis=1, keepdims=True)
    vc = np.asarray(v, dtype=float) - np.mean(v)
    den = np.sqrt((mc ** 2).sum(axis=1) * (vc ** 2).sum())
    with np.errstate(invalid="ignore", divide="ignore"):
        r = (mc @ vc) / den
    return np.where(den > 0, r, np.nan)


def _spearman(m: np.ndarray, v: np.ndarray) -> np.ndarray:
    ranks = pd.DataFrame(np.atleast_2d(m)).rank(axis=1).to_numpy()
    return _pearson(ranks, pd.Series(v).rank().to_numpy())


def correlacoes(m: np.ndarray, risco: np.ndarray, exposicao: np.ndarray) -> dict[tuple[str, str], np.ndarray]:
    """Pearson e Spearman de cada linha de contagens com o risco e com a exposição, e a diferença (risco − exposição)."""
    out = {}
    for medida, f in (("pearson", _pearson), ("spearman", _spearman)):
        r, e = f(m, risco), f(m, exposicao)
        out[(medida, "risco")], out[(medida, "exposicao")], out[(medida, "diferenca")] = r, e, r - e
    return out


def analisar(horas: np.ndarray, risco: np.ndarray, exposicao: np.ndarray, n: int, semente: int, nivel: float) -> dict:
    """Cada correlação, com o IC por bootstrap dos atropelamentos (`n` reamostragens com reposição, percentis simétricos)."""
    if len(horas) == 0:
        raise ValueError("o âmbito não tem atropelamentos")
    ponto = correlacoes(contagem(horas), risco, exposicao)
    rng = np.random.default_rng(semente)
    amostras = np.stack([contagem(horas[rng.integers(0, len(horas), len(horas))]) for _ in range(n)])
    boot = correlacoes(amostras, risco, exposicao)
    q = [100 * (1 - nivel) / 2, 100 * (1 + nivel) / 2]
    out = {}
    for chave, v in ponto.items():
        b = boot[chave][~np.isnan(boot[chave])]
        inf, sup = np.percentile(b, q) if len(b) else (np.nan, np.nan)
        out[chave] = (float(v[0]), float(inf), float(sup))
    return out


def ler_resultado(spearman_risco: tuple, dif_spearman: tuple, minimo: float) -> tuple[str, str]:
    """A regra do ADR-0036 (ponto 5): «coerente» e «o risco acrescenta», só se o IC deixar."""
    valor, inf, _ = spearman_risco
    coerente = LEITURA_COERENTE if (valor >= minimo and inf > 0) else LEITURA_INCOERENTE
    acrescenta = LEITURA_ACRESCENTA if dif_spearman[1] > 0 else LEITURA_NAO_ACRESCENTA
    return coerente, acrescenta


def calcular(cfg: dict, ev: pd.DataFrame, risco: pd.DataFrame) -> pd.DataFrame:
    """A tabela `validacao_anepc`: o perfil horário (quadro `perfil`) e as correlações com o IC (quadro `correlacao`), por âmbito."""
    v = cfg["validacao_anepc"]
    b = v["bootstrap"]
    perfil = perfil_risco(risco)
    linhas_perfil, linhas_corr = [], []
    for ambito, filtro in v["ambitos"].items():
        horas = selecionar(ev, filtro)["t"].dt.hour.to_numpy()
        n = len(horas)
        if n == 0:
            raise ValueError(f"o âmbito {ambito} não tem atropelamentos")
        c = contagem(horas)
        linhas_perfil.append(pd.DataFrame({
            "quadro": "perfil", "ambito": ambito, "n": n, "hora": perfil.index, "atropelamentos": c,
            "risco_potencial": perfil["risco_potencial"].to_numpy(), "exposicao_pct": perfil["exposicao_pct"].to_numpy()}))
        res = analisar(horas, perfil["risco_potencial"].to_numpy(), perfil["exposicao_pct"].to_numpy(), b["n"], b["semente"], b["nivel"])
        coerente, acrescenta = ler_resultado(res[("spearman", "risco")], res[("spearman", "diferenca")], v["coerente_spearman_min"])
        for (medida, contra), (valor, inf, sup) in res.items():
            leitura = None
            if ambito == v["ambito_leitura"] and medida == "spearman" and contra == "risco":
                leitura = coerente
            elif ambito == v["ambito_leitura"] and medida == "spearman" and contra == "diferenca":
                leitura = acrescenta
            linhas_corr.append({"quadro": "correlacao", "ambito": ambito, "n": n, "medida": medida, "contra": contra,
                                "valor": valor, "ic_inf": inf, "ic_sup": sup, "leitura": leitura})
    df = pd.concat([*linhas_perfil, pd.DataFrame(linhas_corr)], ignore_index=True)
    for c in COLUNAS:
        if c not in df:
            df[c] = None
    df = df[COLUNAS]
    df["n"] = df["n"].astype("int64")
    df["hora"] = df["hora"].astype("Int64")
    df["atropelamentos"] = df["atropelamentos"].astype("Int64")
    for c in ("risco_potencial", "exposicao_pct", "valor", "ic_inf", "ic_sup"):
        df[c] = df[c].astype("float64")
    for c in ("quadro", "ambito", "medida", "contra", "leitura"):
        df[c] = df[c].astype("object")
    return df


def _imprimir(cfg: dict, tab: pd.DataFrame, contagens: dict) -> None:
    v = cfg["validacao_anepc"]
    nivel = int(round(100 * v["bootstrap"]["nivel"]))
    print(f"anepc: {contagens['n_lidas']} atropelamentos lidos, {contagens['n_data_ilegivel']} de data ilegível (descartados), "
          f"{contagens['n_duplicados']} duplicados (retirados)")
    for ambito in v["ambitos"]:
        c = tab[(tab["quadro"] == "correlacao") & (tab["ambito"] == ambito)]
        print(f"  {ambito} (n={int(c['n'].iloc[0])}), IC de {nivel} %:")
        for _, r in c.iterrows():
            print(f"    {r['medida']:<8} {r['contra']:<10} {r['valor']:+.3f} [{r['ic_inf']:+.3f}; {r['ic_sup']:+.3f}]"
                  + (f"  → {r['leitura']}" if pd.notna(r["leitura"]) else ""))
    print(f"  {AVISO}")


def correr(cfg: dict) -> int:
    """Subcomando `riasense anepc`: lê RIASENSE_DATA_ANEPC (descarrega o que falta, com rede) e data/processed/risco_potencial.parquet."""
    try:
        validar(cfg)
    except ConfigInvalida as e:
        print(f"erro: {e}", file=sys.stderr)
        return 1
    pasta = Path(os.environ.get("RIASENSE_DATA_ANEPC") or PASTA_PADRAO)
    processed = Path(os.environ.get("RIASENSE_DATA_PROCESSED") or sensores.PROCESSED_PADRAO)
    try:
        garantir(cfg, pasta)
    except FonteInvalida as e:
        print(f"erro: {e}", file=sys.stderr)
        return 1
    caminho = processed / "risco_potencial.parquet"
    if not caminho.is_file():
        print(f"erro: falta {caminho}; corre `riasense risco` antes", file=sys.stderr)
        return 1
    ev, contagens = ler(cfg, pasta)
    con = duckdb.connect()
    try:
        risco = con.execute("select t, risco_potencial, exposicao_pct from read_parquet(?)", [str(caminho)]).df()
        try:
            tab = calcular(cfg, ev, risco)
        except ValueError as e:   # um âmbito sem atropelamentos (noutra cidade) ou um risco que não cobre as 24 horas
            print(f"erro: {e}", file=sys.stderr)
            return 1
        con.register("validacao_anepc", tab)
        con.table("validacao_anepc").write_parquet(str(processed / "validacao_anepc.parquet"))
    finally:
        con.close()
    _imprimir(cfg, tab, contagens)
    print(f"anepc: → {processed / 'validacao_anepc.parquet'}")
    return 0
