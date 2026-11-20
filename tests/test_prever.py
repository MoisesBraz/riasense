"""Previsão por horizonte, com a regra da referência e da persistência (ADR-0010, ADR-0027).

Séries sintéticas de semente fixa.
"""

import os
from datetime import timedelta
from pathlib import Path

import duckdb
import numpy as np
import pandas as pd
import pytest

from riasense import config, ids, prever
from riasense.__main__ import main

UMA_HORA = pd.Timedelta(hours=1)


@pytest.fixture
def cfg():
    return config.carregar()


def P1(cfg: dict) -> dict:
    """Os parâmetros da ③ com o horizonte de 1 h, o dos testes unitários."""
    return prever.com_horizonte(cfg, 1)["prever"]


def _horas(cfg: dict, futuro: int = 0) -> pd.DatetimeIndex:
    """As horas da janela de periodo_dados e, com `futuro`, as horas por prever a seguir."""
    inicio, _, fim = prever.janela(cfg)
    return pd.date_range(inicio, fim + futuro * UMA_HORA, freq="h", inclusive="left", name="t")


# --- Referência ---


def test_referencia_e_a_mesma_hora_do_dia_anterior(cfg):
    W = pd.DataFrame({"A": np.arange(len(_horas(cfg)), dtype=float) + 1}, index=_horas(cfg))
    tab = prever.variaveis(W, prever.escalas(W, prever.janela(cfg)[1]), {}, P1(cfg)).set_index("t")
    assert tab.loc[pd.Timestamp("2026-11-05 10:00"), "referencia"] == W.loc[pd.Timestamp("2026-11-04 10:00"), "A"]
    assert tab["referencia"].iloc[:24].isna().all()
    assert (tab["referencia"].iloc[24:].to_numpy() == W["A"].iloc[:-24].to_numpy()).all()


def test_variaveis_ficam_na_escala_do_sensor_e_a_referencia_nas_unidades(cfg):
    W = pd.DataFrame({"A": 10.0, "B": 40.0}, index=_horas(cfg))
    tab = prever.variaveis(W, prever.escalas(W, prever.janela(cfg)[1]), {"A": ["B"]}, P1(cfg))
    a = tab[(tab["id"] == "A") & tab["referencia"].notna()]
    assert (a["alvo"] == 1).all() and (a["atraso_1h"] == 1).all() and (a["vizinhos_1h"] == 1).all()
    assert (a["referencia"] == 10).all() and (a["escala"] == 10).all()


# --- A regra ---


@pytest.mark.parametrize(
    ("ref", "sem", "com", "meteo_melhora", "ganha"),
    [
        (0.50, 0.30, 0.30, False, True),   # ganha sem meteorologia
        (0.30, 0.40, 0.40, False, False),  # perde
        (0.30, 0.30, 0.20, True, True),    # empate sem meteorologia: o modelo tem de ser menor, não igual
        (0.50, 0.40, 0.39, False, True),   # a meteorologia baixa o erro 2,5% (< 5%): não fica
        (0.50, 0.40, 0.37, True, True),    # baixa 7,5%: fica
        (0.40, 0.41, 0.395, True, True),   # baixa só 3,7%, mas muda a decisão: perde sem e ganha com
        (0.40, 0.41, 0.405, False, False),  # baixa 1,2% e não muda a decisão
    ],
)
def test_regra_ganhar_a_referencia_e_meteorologia_que_melhora(ref, sem, com, meteo_melhora, ganha):
    # Persistência muito pior: a regra reduz-se à do ADR-0010.
    assert prever.decidir(ref, 9.0, sem, com, 0.05) == {"meteo_melhora": meteo_melhora, "ganha": ganha}


@pytest.mark.parametrize(
    ("ref", "pers", "sem", "com", "meteo_melhora", "ganha"),
    [
        (0.60, 0.40, 0.50, 0.50, False, False),  # ganha à referência mas não à persistência (ADR-0027)
        (0.40, 0.60, 0.50, 0.50, False, False),  # ganha à persistência mas não à referência
        (0.60, 0.40, 0.40, 0.40, False, False),  # empata com a persistência: tem de ser menor
        (0.60, 0.40, 0.30, 0.30, False, True),   # ganha às duas
        (0.60, 0.40, 0.41, 0.395, True, True),   # a meteorologia muda a decisão contra a persistência
    ],
)
def test_regra_tem_de_ganhar_a_referencia_e_a_persistencia(ref, pers, sem, com, meteo_melhora, ganha):
    assert prever.decidir(ref, pers, sem, com, 0.05) == {"meteo_melhora": meteo_melhora, "ganha": ganha}


def _teste(rng, erro_modelo: float, erro_persistencia: float = 5) -> pd.DataFrame:
    """2 sensores × 48 h de teste: a referência erra ±5, a persistência ±`erro_persistencia`, o modelo ±`erro_modelo`."""
    real = rng.poisson(20, 96).astype(float)
    t = np.tile(pd.date_range("2026-11-08 11:00", periods=48, freq="h"), 2)
    previsao = real + rng.normal(0, erro_modelo, 96)
    return pd.DataFrame({"id": np.repeat(["A", "B"], 48), "t": t, "real": real, "referencia": real + rng.normal(0, 5, 96),
                         "persistencia": real + rng.normal(0, erro_persistencia, 96),
                         "previsao_sem": previsao, "previsao_com": previsao})


def test_modelo_que_ganha_a_referencia_mas_nao_a_persistencia_fica_de_fora():
    aval = prever.avaliar(_teste(np.random.default_rng(1), 3, erro_persistencia=0.5), 0.05)
    assert aval["erro_sem_meteo"] < aval["erro_referencia"] and aval["erro_persistencia"] < aval["erro_sem_meteo"]
    assert not aval["ganha"] and aval["sensores_ganha"] == 0


def test_teste_so_tem_horas_com_as_3_comparacoes(cfg):
    """Uma hora em falha tira do teste a própria hora, a de h depois (sem persistência) e a de 24 h (sem referência)."""
    cfg3 = prever.com_horizonte(cfg, 3)
    _, teste_inicio, _ = prever.janela(cfg)
    W = pd.DataFrame({"A": 10.0}, index=_horas(cfg))
    buraco = teste_inicio + 5 * UMA_HORA
    W.loc[buraco, "A"] = np.nan
    tab = prever.variaveis(W, prever.escalas(W, teste_inicio), {}, cfg3["prever"])
    _, teste, _ = prever.dividir(tab, cfg3)
    fora = set(tab.loc[(tab["t"] >= teste_inicio) & ~teste, "t"])
    assert fora == {buraco, buraco + 3 * UMA_HORA, buraco + 24 * UMA_HORA}
    assert tab.loc[teste, ["real", "referencia", "persistencia"]].notna().all().all()


def test_modelo_que_ganha_passa_a_regra_e_o_que_perde_nao():
    rng = np.random.default_rng(1)
    bom, mau = prever.avaliar(_teste(rng, 1), 0.05), prever.avaliar(_teste(rng, 15), 0.05)
    assert bom["ganha"] and bom["sensores_ganha"] == 2
    assert not mau["ganha"] and mau["sensores_ganha"] == 0
    assert (bom["n_sensores"], bom["n_horas_teste"]) == (2, 48)


def test_erro_relativo_divide_pela_media_real_e_deixa_de_fora_o_sensor_sempre_a_0():
    real = pd.Series([10.0, 30.0, 0.0, 0.0])
    erro = prever.erro_relativo(real, real + pd.Series([2.0, -2.0, 1.0, 1.0]), pd.Series(["A", "A", "B", "B"]))
    assert erro.to_dict() == {"A": pytest.approx(2 / 20)}


# --- O grafo «o que antecipa o quê» ---


def test_grafo_encontra_o_atraso_de_uma_serie_deslocada():
    rng = np.random.default_rng(2)
    horas = pd.date_range("2026-11-03 15:00", periods=164, freq="h")
    a = pd.Series(rng.normal(size=164), index=horas)
    b = a.shift(3) + rng.normal(0, 0.3, 164)  # b repete a com 3 h de atraso
    ant = prever.antecipacao({"a": a, "b": b}, 6)
    assert len(ant) == 2 * 7 and list(ant.columns) == prever.COLUNAS_ANTECIPACAO
    aresta = ant[ant["aresta"]].set_index(["origem", "destino"])
    assert aresta.loc[("a", "b"), "atraso_h"] == 3
    assert aresta.loc[("a", "b"), "correlacao"] > 0.9
    assert abs(aresta.loc[("b", "a"), "correlacao"]) < 0.3


def test_ciclo_diario_comum_nao_parece_antecipacao():
    rng = np.random.default_rng(3)
    horas = pd.date_range("2026-11-03 15:00", periods=164, freq="h")
    ciclo = 10 * np.sin(2 * np.pi * horas.hour / 24)
    a, b = (pd.Series(ciclo + rng.normal(size=164), index=horas) for _ in range(2))
    assert a.corr(b) > 0.9  # o ciclo diário, sozinho, dá uma correlação alta
    ant = prever.antecipacao({"a": prever.sem_ciclo(a), "b": prever.sem_ciclo(b)}, 6)
    assert ant["correlacao"].abs().max() < 0.35


def test_vertical_nao_desce_quando_um_sensor_esta_em_falha():
    W = pd.DataFrame({"A": [10.0, 10.0, np.nan], "B": [2.0, 2.0, 2.0]})
    assert prever.vertical(W).tolist() == [1.0, 1.0, 1.0]


# --- Falhas (falhas.parquet, da ①) ---


def _falhas(*falhas: tuple[str, str, str]) -> pd.DataFrame:
    """Linhas no formato de falhas.parquet: sensor, início (último evento) e fim (regresso ou fim dos dados)."""
    return pd.DataFrame([(s, pd.Timestamp(i), pd.Timestamp(f)) for s, i, f in falhas], columns=["sensor", "inicio", "fim"])


def test_falha_da_demo_fica_fora_do_treino_e_do_teste(cfg):
    _, teste_inicio, fim = prever.janela(cfg)
    W = pd.DataFrame({"A": 10.0, "B": 20.0}, index=_horas(cfg, futuro=1))
    W.loc[W.index >= fim] = np.nan
    # A falha de rede da RSU0030 (demo.incidente) em falhas.parquet: do último evento ao fim dos dados.
    W = prever.retirar_falhas(W, _falhas(("A", "2026-11-04 20:06:25", str(fim))))
    tab = prever.variaveis(W, prever.escalas(W, teste_inicio), {"B": ["A"]}, prever.com_horizonte(cfg, 1)["prever"])
    treino, teste, futuro = prever.dividir(tab, prever.com_horizonte(cfg, 1))
    desde = pd.Timestamp(cfg["demo"]["incidente"]["inicio"]).floor("h")  # 04/11 20h06 → sai a hora das 20h inteira
    a = tab["id"] == "A"
    assert tab.loc[treino & a, "t"].max() == desde - UMA_HORA
    assert not (teste & a).any() and not (futuro & a).any()
    assert tab.loc[treino & ~a, "t"].max() == teste_inicio - UMA_HORA
    assert (teste & ~a).sum() == 48 and tab.loc[futuro, "t"].tolist() == [fim]
    # Nas horas em falha, A não conta como vizinho de B.
    b = tab[~a].set_index("t")["vizinhos_1h"]
    assert b[desde] == 1.0 and b[b.index > desde].isna().all()


def test_falha_que_acaba_tira_as_horas_que_toca_e_o_sensor_volta_depois(cfg):
    W = pd.DataFrame({"A": 10.0, "B": 20.0}, index=_horas(cfg))
    falhas = _falhas(("A", "2026-11-05 10:20", "2026-11-05 14:40"), ("C", "2026-11-05 10:00", "2026-11-06 00:00"))
    W = prever.retirar_falhas(W, falhas)
    em_falha = W.index[W["A"].isna()]
    assert em_falha.tolist() == list(pd.date_range("2026-11-05 10:00", "2026-11-05 14:00", freq="h"))
    assert W["B"].notna().all()  # C não é deste tipo e B não está em falha


# --- Ponta a ponta, com Parquet pequenos no formato de data/interim e data/processed ---

CW, TZ, SEG = "urn:ngsi-ld:SmartCrosswalk:{}", "urn:ngsi-ld:TouristZone:{}", "urn:ngsi-ld:RoadSegment:{}"
RSU, LUGAR = "urn:ngsi-ld:RoadSideUnit:{}", "urn:ngsi-ld:ParkingSpot:{}"


def _parquet(caminho: Path, df: pd.DataFrame) -> None:
    con = duckdb.connect()
    con.register("df", df)
    con.table("df").write_parquet(str(caminho))
    con.close()


def _eventos(sensor: str, horas: pd.DatetimeIndex, n: np.ndarray) -> list[tuple]:
    """`n[i]` eventos espalhados pela hora `horas[i]`."""
    return [(sensor, h + timedelta(seconds=int(3600 * (j + 0.5) / k))) for h, k in zip(horas, n) for j in range(int(k))]


def _interim(interim: Path, horas: pd.DatetimeIndex, rng) -> None:
    """Passadeiras com um nível que deriva (a hora anterior prevê bem), zonas que repetem o dia (a referência acerta),
    um segmento ativo e outro quase parado, e 2 RSU de estacionamento com 2 lugares cada."""
    nivel = 20 * np.exp(np.cumsum(rng.normal(0, 0.15, len(horas))))
    cw = _eventos(CW.format("A"), horas, rng.poisson(nivel)) + _eventos(CW.format("B"), horas, rng.poisson(nivel))
    tz = _eventos(TZ.format("1"), horas, 10 + horas.hour) + _eventos(TZ.format("2"), horas, 5 + horas.hour)
    seg = _eventos(SEG.format("1"), horas, rng.poisson(30, len(horas))) + _eventos(SEG.format("2"), horas, horas.hour % 2)
    estados = [str(e) for e in rng.choice(["free", "occupied"], 4 * len(horas[::3]))]
    pk = [(LUGAR.format(f"{r}{l}"), h + timedelta(minutes=10), RSU.format(r))
          for r in ("0001", "0002") for l in (1, 2) for h in horas[::3]]
    pk = [(*e, estado, 0.0 if estado == "occupied" else 600.0) for e, estado in zip(pk, estados)]
    _parquet(interim / "passadeiras.parquet", pd.DataFrame(cw, columns=["id", "t"]))
    _parquet(interim / "visitas.parquet", pd.DataFrame(tz, columns=["zona", "entrada"]))
    _parquet(interim / "segmentos.parquet", pd.DataFrame(seg, columns=["id", "t"]))
    _parquet(interim / "estacionamento.parquet", pd.DataFrame(pk, columns=["id", "t", "rsu", "estado", "duracao_s"]))


def _processed(processed: Path, cfg: dict) -> None:
    pares = {"passadeira": (CW.format("A"), CW.format("B")), "zona": (TZ.format("1"), TZ.format("2")),
             "segmento": (SEG.format("1"), SEG.format("2")), "estacionamento": (RSU.format("0001"), RSU.format("0002"))}
    sens = [(s, tipo) for tipo, par in pares.items() for s in par]
    _parquet(processed / "sensores.parquet", pd.DataFrame(sens, columns=["id", "tipo"]))
    viz = [(a, b, 1) for a, b in pares.values()] + [(b, a, 1) for a, b in pares.values()]
    _parquet(processed / "vizinhos.parquet", pd.DataFrame(viz, columns=["id", "vizinho", "ordem"]))
    t = pd.date_range("2026-11-03", "2026-11-11", freq="h", inclusive="left")
    _parquet(processed / "meteo.parquet", pd.DataFrame({"t": t, "chuva_mm": 0.0, "temperatura_c": 12.0}))
    # B fica em falha como as passadeiras da demo, embora os dados sintéticos continuem: conta falhas.parquet.
    demo = (CW.format("B"), cfg["demo"]["incidente"]["inicio"], cfg["periodo_dados"]["fim"])
    _parquet(processed / "falhas.parquet", _falhas(demo))


@pytest.fixture
def pastas(tmp_path, cfg):
    interim, processed = tmp_path / "interim", tmp_path / "processed"
    interim.mkdir()
    processed.mkdir()
    _interim(interim, _horas(cfg), np.random.default_rng(4))
    _processed(processed, cfg)
    return interim, processed


class MediaRecente:
    """Modelo de teste, sem LightGBM: a média dos 3 valores mais recentes do sensor (há h, h+1 e h+2 horas).

    Alisa o ruído de Poisson, por isso ganha à persistência no nível que deriva das passadeiras sintéticas.
    """

    def __init__(self, treino: pd.DataFrame, cols: list[str], params: dict):
        assert treino["alvo"].notna().all()
        self.recentes = [c for c in cols if c.startswith("atraso_")][:3]

    def predict(self, X: pd.DataFrame) -> np.ndarray:
        return X[self.recentes].mean(axis=1).fillna(0).to_numpy()


def _ler(caminho: Path) -> pd.DataFrame:
    return duckdb.sql("select * from read_parquet($f)", params={"f": str(caminho)}).df()


def test_calcular_aplica_a_regra_por_tipo_e_so_escreve_previsoes_dos_que_ganham(pastas, cfg):
    interim, processed = pastas
    prever.calcular(interim, processed, processed, cfg, ajustar=MediaRecente)
    aval = _ler(processed / "avaliacao_prever.parquet").set_index(["horizonte_h", "tipo"])
    assert list(aval.reset_index().columns) == prever.COLUNAS_AVALIACAO
    p = cfg["prever"]
    assert aval.index.tolist() == [(h, t) for h in sorted(p["horizontes_h"] + p["horizontes_avaliacao_h"]) for t in prever.TIPOS]
    assert not aval.xs("zona", level="tipo")["ganha"].any()  # o dia repete-se: a referência acerta sempre
    assert aval.loc[(6, "passadeira"), "ganha"]  # o nível deriva: a média recente ganha às duas comparações
    assert (aval.xs("segmento", level="tipo")["n_sensores"] == 1).all()  # o segmento quase parado não é ativo
    prev = _ler(processed / "previsoes.parquet")
    assert list(prev.columns) == prever.COLUNAS_PREVISOES
    so_produto = aval[aval.index.get_level_values("horizonte_h").isin(p["horizontes_h"])]
    assert set(zip(prev["horizonte_h"], prev["tipo"])) == set(so_produto.index[so_produto["ganha"]])
    assert not set(prev["horizonte_h"]) & set(p["horizontes_avaliacao_h"])  # a 1 h só se avalia (ADR-0027, ponto 3)
    assert prev[["id", "t", "previsao"]].notna().all().all()


def test_previsoes_cobrem_o_teste_e_as_h_horas_a_seguir_aos_dados_sem_o_sensor_em_falha(pastas, cfg):
    _, teste_inicio, fim = prever.janela(cfg)
    prever.calcular(*pastas, pastas[1], cfg, ajustar=MediaRecente)
    prev = _ler(pastas[1] / "previsoes.parquet")
    assert CW.format("B") not in set(prev["id"])  # B está em falha desde demo.incidente
    for (h, _), p in prev.groupby(["horizonte_h", "tipo"]):
        assert p["t"].min() == teste_inicio and p["t"].max() == fim + (h - 1) * UMA_HORA
        assert p.loc[p["t"] >= fim, "real"].isna().all() and p.loc[p["t"] < fim, "real"].notna().all()


# --- O intervalo de previsão (ADR-0035) ---


class Zero:
    """Modelo de teste que prevê sempre 0: o resíduo é o próprio alvo."""

    def predict(self, X: pd.DataFrame) -> np.ndarray:
        return np.zeros(len(X))


def _series_de_calibracao(cfg: dict, valores: dict[str, float]) -> pd.DataFrame:
    """Uma coluna por sensor, constante em todas as horas da janela; `meteo` e `vizinhos` à parte (sem vizinhos)."""
    horas = _horas(cfg)
    return pd.DataFrame({s: np.full(len(horas), v) for s, v in valores.items()}, index=horas)


def _meteo(cfg: dict) -> pd.DataFrame:
    t = pd.date_range("2026-11-03", "2026-11-11", freq="h", inclusive="left")  # como o meteo.parquet: cobre as horas desfasadas
    return pd.DataFrame({"t": t, "chuva_mm": 0.0, "temperatura_c": 12.0})


def test_calibrar_usa_o_dia_antes_do_teste_e_o_modelo_so_treina_antes_dele(cfg):
    _, teste_inicio, _ = prever.janela(cfg)
    inicio_dia = teste_inicio - pd.Timedelta(hours=cfg["prever"]["intervalo"]["calibracao_h"])
    c1 = prever.com_horizonte(cfg, 1)  # o config de um horizonte, como o `calcular` o passa
    W = _series_de_calibracao(cfg, {"a": 10.0, "b": 20.0})
    W.loc[W.index >= inicio_dia, "a"] = 15.0  # o dia de calibração e o teste são diferentes do treino
    treinos = []

    def ajustar(treino, cols, params):
        treinos.append(treino["t"])
        return Zero()

    q10, q90 = prever.calibrar(W, {}, _meteo(cfg), c1, False, ["a", "b"], ajustar)
    assert len(treinos) == 1 and treinos[0].max() < inicio_dia  # o dia de calibração não entra no treino do modelo
    # O modelo prevê 0, por isso o resíduo é o alvo: o valor do dia a dividir pela média **antes do dia** (a escala do
    # modelo de calibração). O sensor «a» vale 15 / 10 = 1,5 e o «b» 20 / 20 = 1; o teste (a partir de 11h) fica de fora.
    assert q10 == pytest.approx(np.quantile([1.5] * 24 + [1.0] * 24, 0.1)) and q90 == pytest.approx(1.5)
    assert q10 < q90


def test_calibrar_so_usa_os_sensores_dados_e_a_escala_ignora_o_dia_de_calibracao(cfg):
    c1 = prever.com_horizonte(cfg, 1)
    _, teste_inicio, _ = prever.janela(cfg)
    inicio_dia = teste_inicio - pd.Timedelta(hours=24)
    W = _series_de_calibracao(cfg, {"a": 10.0, "b": 1000.0})
    W.loc[W.index >= inicio_dia, "a"] = 1000.0  # se a escala incluísse o dia, o resíduo de «a» ficava bem abaixo de 100
    ajustar = lambda *a: Zero()
    assert prever.calibrar(W, {}, _meteo(cfg), c1, False, ["a"], ajustar) == (pytest.approx(100.0), pytest.approx(100.0))
    q10, q90 = prever.calibrar(W, {}, _meteo(cfg), c1, False, ["a", "b"], ajustar)  # «b» (1000 / 1000 = 1) também conta
    assert q10 == pytest.approx(1.0) and q90 == pytest.approx(100.0)


def test_calibrar_sem_horas_de_treino_ou_de_calibracao_ou_de_escala_nao_da_intervalo(cfg):
    _, teste_inicio, _ = prever.janela(cfg)
    c1 = prever.com_horizonte(cfg, 1)
    W = _series_de_calibracao(cfg, {"a": 10.0})
    ajustar = lambda *a: Zero()
    assert all(np.isnan(q) for q in prever.calibrar(W[W.index >= teste_inicio], {}, _meteo(cfg), c1, False, ["a"], ajustar))
    assert all(np.isnan(q) for q in prever.calibrar(W[W.index >= teste_inicio - pd.Timedelta(hours=24)], {}, _meteo(cfg), c1, False, ["a"], ajustar))
    parado = W.assign(a=0.0)  # sem atividade antes do dia: não há escala
    assert all(np.isnan(q) for q in prever.calibrar(parado, {}, _meteo(cfg), c1, False, ["a"], ajustar))
    p10, p90 = prever.intervalo(pd.Series([1.0]), pd.Series([2.0]), np.nan, np.nan)
    assert p10.isna().all() and p90.isna().all()  # sem quantis, sem intervalo


def test_intervalo_nunca_fica_abaixo_de_0_e_p90_nunca_abaixo_de_p10():
    previsao, escala = pd.Series([0.0, 10.0, 0.5]), pd.Series([2.0, 2.0, 2.0])
    p10, p90 = prever.intervalo(previsao, escala, -3.0, 1.5)
    assert p10.tolist() == [0.0, 4.0, 0.0] and p90.tolist() == [3.0, 13.0, 3.5]
    p10, p90 = prever.intervalo(previsao, escala, -5.0, -4.0)  # quantis negativos: p90 sobe até p10
    assert (p10 >= 0).all() and (p90 >= p10).all()


def test_cobertura_e_a_fracao_dos_pares_com_o_real_entre_p10_e_p90():
    real = pd.Series([1.0, 5.0, 9.0, 10.0, 3.0])
    p10, p90 = pd.Series([2.0, 2.0, 2.0, 2.0, np.nan]), pd.Series([8.0, 8.0, 8.0, 10.0, np.nan])
    assert prever.cobertura(real, p10, p90) == (0.5, 4)  # o limite conta; o par sem intervalo não entra
    cob, n = prever.cobertura(real, pd.Series([np.nan] * 5), pd.Series([np.nan] * 5))
    assert np.isnan(cob) and n == 0


@pytest.mark.parametrize("mexer", [
    lambda i: i.__setitem__("nivel", 1.0), lambda i: i.__setitem__("nivel", 0), lambda i: i.__setitem__("nivel", True),
    lambda i: i.__setitem__("calibracao_h", 0), lambda i: i.__setitem__("calibracao_h", 24.5),
    lambda i: i.__setitem__("calibracao_h", 1000),  # não deixa horas de treino antes do dia
])
def test_config_de_intervalo_fora_do_adr_e_recusada(cfg, mexer):
    cfg = {**cfg, "prever": {**cfg["prever"], "intervalo": dict(cfg["prever"]["intervalo"])}}
    mexer(cfg["prever"]["intervalo"])
    with pytest.raises(ValueError, match="intervalo"):
        prever.validar(cfg)


def test_calcular_acrescenta_o_intervalo_sem_mudar_a_previsao_nem_o_modelo_publicado(pastas, cfg):
    interim, processed = pastas
    _, teste_inicio, _ = prever.janela(cfg)
    inicio_dia = teste_inicio - pd.Timedelta(hours=cfg["prever"]["intervalo"]["calibracao_h"])
    ultimas = []

    class Registo(MediaRecente):
        def __init__(self, treino, cols, params):
            super().__init__(treino, cols, params)
            ultimas.append(treino["t"].max())

    aval, prev, _ = prever.calcular(interim, processed, processed, cfg, ajustar=Registo)
    p = cfg["prever"]
    todos, produto = p["horizontes_h"] + p["horizontes_avaliacao_h"], p["horizontes_h"]
    # Por tipo e horizonte: 2 modelos publicados (sem e com meteorologia, treinados até ao teste) e, só nos horizontes do
    # produto, 1 de calibração (treinado antes do dia de calibração).
    assert sum(t < inicio_dia for t in ultimas) == len(prever.TIPOS) * len(produto)
    assert sum(inicio_dia <= t < teste_inicio for t in ultimas) == 2 * len(prever.TIPOS) * len(todos) and max(ultimas) < teste_inicio
    assert prev[["p10", "p90"]].notna().all().all() and (prev["p10"] >= 0).all() and (prev["p90"] >= prev["p10"]).all()
    com = aval[aval["horizonte_h"].isin(produto)]
    assert com["cobertura_intervalo"].between(0, 1).all() and (com["n_cobertura"] > 0).all()
    a_1h = aval[aval["horizonte_h"].isin(p["horizontes_avaliacao_h"])]  # a 1 h só se avalia: sem previsões nem intervalo
    assert a_1h["cobertura_intervalo"].isna().all() and (a_1h["n_cobertura"] == 0).all()
    # O intervalo não entra na regra: as colunas que já existiam são as de antes.
    assert list(aval.drop(columns=["cobertura_intervalo", "n_cobertura"]).columns) == prever.COLUNAS_AVALIACAO[:-2]


def test_grafo_tem_os_pares_das_4_verticais_e_uma_aresta_por_par(pastas, cfg):
    prever.calcular(*pastas, pastas[1], cfg, ajustar=MediaRecente)
    ant = _ler(pastas[1] / "antecipacao.parquet")
    n = cfg["prever"]["antecipacao_atraso_max_h"] + 1
    assert len(ant) == 4 * 3 * n
    assert ant["aresta"].sum() == 4 * 3
    assert (ant.loc[ant["aresta"], "atraso_h"] >= 1).all()


def test_ocupacao_do_estacionamento_e_a_fracao_de_lugares_ocupados_a_meio_da_hora(pastas, cfg):
    con = duckdb.connect()
    prever._registar_fontes(con, *pastas)
    W = prever.series(con, cfg)["estacionamento"]
    con.close()
    valores = set(np.unique(W.dropna().to_numpy()))
    assert valores <= {0.0, 0.5, 1.0} and len(valores) > 1  # 2 lugares por RSU
    assert W.iloc[0].notna().all()  # o 1.º evento de cada lugar é às 15h10, antes do meio da 1.ª hora
    assert W.iloc[-1].isna().all()  # a hora a seguir aos dados fica por conhecer, não a 0


def test_dois_estados_do_mesmo_lugar_no_mesmo_instante_fica_o_que_comeca(cfg):
    """Sai um carro (`free`, com a duração da ocupação) e entra outro (`occupied`, duração 0) no mesmo segundo."""
    t = pd.Timestamp("2026-11-03 15:10")
    pk = pd.DataFrame({"id": ["L1", "L1", "L2"], "t": [t, t, t], "estado": ["free", "occupied", "free"],
                       "duracao_s": [166.8, 0.0, 30.0], "rsu": ["R"] * 3})
    con = duckdb.connect()
    con.register("pk", pk)
    inicio, _, fim = prever.janela(cfg)
    ocupacao = con.sql(prever.OCUPACAO_SQL, params={"inicio": str(inicio), "fim": str(fim)}).df()
    con.close()
    assert ocupacao.loc[ocupacao["t"] == inicio, "valor"].tolist() == [0.5]  # L1 ocupado, L2 livre


def test_comando_prever_sem_ingestao_sai_com_1(tmp_path, monkeypatch, capsys):
    monkeypatch.setenv("RIASENSE_DATA_INTERIM", str(tmp_path / "interim"))
    monkeypatch.setenv("RIASENSE_DATA_PROCESSED", str(tmp_path / "processed"))
    assert main(["prever"]) == 1
    assert "riasense ingerir" in capsys.readouterr().err


@pytest.mark.parametrize("horizontes", [[25], [0], [], ["3"]])
def test_config_com_horizonte_sem_atrasos_validos_e_recusado(cfg, horizontes):
    cfg["prever"] = cfg["prever"] | {"horizontes_h": horizontes}
    with pytest.raises(ValueError, match="horizontes_h"):
        prever.validar(cfg)


@pytest.mark.parametrize("so_avaliacao", [[25], [0], ["1"], [3]])
def test_config_com_horizonte_de_avaliacao_invalido_ou_repetido_e_recusado(cfg, so_avaliacao):
    cfg["prever"] = cfg["prever"] | {"horizontes_h": [3, 6], "horizontes_avaliacao_h": so_avaliacao}
    with pytest.raises(ValueError, match="horizontes_avaliacao_h"):
        prever.validar(cfg)


def test_atrasos_derivam_do_horizonte_e_nenhum_usa_horas_por_medir(cfg):
    p = prever.com_horizonte(cfg, 3)["prever"]
    assert (p["atrasos_h"], p["atrasos_vizinhos_h"]) == ([3, 4, 5, 24], [3, 24])
    prever.validar(cfg)


# --- LightGBM (precisa da OpenMP: no macOS, ver pipeline/README.md) ---


@pytest.fixture
def lightgbm_disponivel():
    try:
        import lightgbm  # noqa: F401
    except OSError:
        pytest.skip("LightGBM sem OpenMP (libomp/libgomp) neste sistema; ver pipeline/README.md")


def test_lightgbm_e_reprodutivel_com_a_semente_do_config_e_aprende_a_hora_anterior(cfg, lightgbm_disponivel):
    rng = np.random.default_rng(5)
    x = rng.uniform(0, 2, 2000)
    cols = prever.colunas(prever.com_horizonte(cfg, 1)["prever"], com_meteo=False)
    treino = pd.DataFrame({c: rng.normal(size=2000) for c in cols}).assign(atraso_1h=x, alvo=x + rng.normal(0, 0.05, 2000))
    p1 = prever.ajustar_lightgbm(treino, cols, cfg["prever"]["lightgbm"]).predict(treino[cols])
    p2 = prever.ajustar_lightgbm(treino, cols, cfg["prever"]["lightgbm"]).predict(treino[cols])
    assert (p1 == p2).all()
    assert np.mean(np.abs(p1 - x)) < 0.1


@pytest.mark.integration
def test_dados_reais_ha_avaliacao_para_os_4_tipos_e_as_saidas_existem(tmp_path, cfg, lightgbm_disponivel):
    interim = os.environ.get("RIASENSE_DATA_INTERIM")
    processed = Path(os.environ.get("RIASENSE_DATA_PROCESSED") or config.RAIZ / "data" / "processed")
    if not interim or not (Path(interim) / "segmentos.parquet").is_file() or not (processed / "vizinhos.parquet").is_file():
        pytest.skip("RIASENSE_DATA_INTERIM não definido ou `riasense ingerir`/`riasense sensores` por correr")
    aval, prev, ant = prever.calcular(Path(interim), processed, tmp_path, cfg)
    # Uma linha por horizonte e por tipo (ADR-0027): os 4 tipos em cada horizonte de `prever.horizontes_h`.
    assert sorted(set(aval["horizonte_h"])) == sorted(cfg["prever"]["horizontes_h"] + cfg["prever"]["horizontes_avaliacao_h"])
    for _, por_h in aval.groupby("horizonte_h"):
        assert por_h["tipo"].tolist() == list(prever.TIPOS)
    assert aval[["erro_referencia", "erro_sem_meteo", "erro_com_meteo"]].notna().all().all()
    assert (aval["n_sensores"] > 0).all()
    for nome in ("avaliacao_prever", "previsoes", "antecipacao"):
        assert (tmp_path / f"{nome}.parquet").stat().st_size < 5 * 1024 * 1024
    assert set(prev["tipo"]) == set(aval["tipo"][aval["ganha"]])
    # As passadeiras e o estacionamento da demo estão em falha desde 04/11 (falhas.parquet): não têm previsões.
    demo = {ids.urn(c) for c in cfg["demo"]["passadeiras"] + cfg["demo"]["rsu"]}
    assert not set(prev["id"]) & demo
    # Nem nenhum sensor ainda em falha no fim dos dados.
    falhas = _ler(processed / "falhas.parquet")
    assert not set(prev["id"]) & set(falhas["sensor"][falhas["em_curso"]])
    assert ant["aresta"].sum() == 12
