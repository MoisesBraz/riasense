"""Sensores virtuais (ADR-0005, ADR-0046: o método por tipo), com séries sintéticas e testes nos dados reais."""

import copy
import os
from pathlib import Path

import duckdb
import numpy as np
import pandas as pd
import pytest

from riasense import completar, config, ids
from riasense.__main__ import main

CW = "urn:ngsi-ld:SmartCrosswalk:00{:02d}"
RSU = "urn:ngsi-ld:RoadSideUnit:0030"
# Perfil diário típico de uma passadeira: ≈ 0 à noite, picos de manhã e à tarde.
PERFIL = np.array([0, 0, 0, 0, 0, 0, 2, 8, 20, 15, 12, 12, 15, 12, 10, 10, 12, 15, 10, 6, 4, 2, 1, 0], dtype=float)


@pytest.fixture
def cfg():
    return config.carregar()


@pytest.fixture
def p():
    return completar.Parametros(n_vizinhos=5, razao_max=3.0, intervalo=0.8, piso=1.0, ativo_min=1.0,
                                completaveis=frozenset({"passadeira", "zona", "segmento"}), horas_noite=(1, 2, 3, 4, 5))


def _horas(dias: int = 3) -> pd.DatetimeIndex:
    return pd.date_range("2026-11-02", periods=24 * dias, freq="h", name="t")  # 02/11 é segunda-feira


def _serie(horas: pd.DatetimeIndex, escala: float = 1.0) -> np.ndarray:
    return PERFIL[horas.hour] * escala


def _series_com_vizinhos(fator_janela: float, n_vizinhos: int = 5) -> tuple[pd.DataFrame, np.ndarray]:
    """Alvo e vizinhos com o mesmo perfil; no último dia os vizinhos multiplicam por `fator_janela`."""
    horas = _horas()
    janela = np.asarray(horas >= horas[-24])
    dados = {"alvo": _serie(horas)}
    for i in range(n_vizinhos):
        dados[f"v{i}"] = _serie(horas, 1 + i) * np.where(janela, fator_janela, 1.0)
    return pd.DataFrame(dados, index=horas), ~janela


def test_vizinhos_que_duplicam_duplicam_a_estimativa(p):
    series, treino = _series_com_vizinhos(fator_janela=2.0)
    est = completar.estimar(series["alvo"], series.drop(columns="alvo"), treino, p)
    assert est[~treino] == pytest.approx(2 * _serie(series.index[~treino]))
    assert est[treino] == pytest.approx(series["alvo"][treino])


def test_razao_fica_limitada_a_razao_max(p):
    series, treino = _series_com_vizinhos(fator_janela=10.0)
    est = completar.estimar(series["alvo"], series.drop(columns="alvo"), treino, p)
    assert est[~treino] == pytest.approx(3 * _serie(series.index[~treino]))


def test_mediana_ignora_um_vizinho_que_se_degrada_e_a_soma_nao(p):
    series, treino = _series_com_vizinhos(fator_janela=1.0)
    series.loc[~treino, "v4"] = 0.0  # o vizinho com mais eventos cai sem perder de todo a comunicação noutros dias
    vizinhos = series.drop(columns="alvo")
    mediana = completar.estimar(series["alvo"], vizinhos, treino, p)
    soma = completar.estimar(series["alvo"], vizinhos, treino, p, "soma")
    assert mediana[~treino] == pytest.approx(series["alvo"][~treino])
    assert soma[~treino].sum() < 0.8 * series["alvo"][~treino].sum()


def test_treino_sem_todas_as_horas_do_dia_da_erro(p):
    series, _ = _series_com_vizinhos(fator_janela=1.0)
    treino = np.zeros(len(series), bool)
    treino[:12] = True
    with pytest.raises(ValueError, match="horas do dia"):
        completar.perfil_horario(series["alvo"], treino)


def test_intervalo_contem_a_estimativa_e_nao_desce_de_zero():
    est = np.array([0.0, 0.5, 10.0, 100.0])
    inf, sup = completar.intervalo(est, (-0.6, 1.2), piso=1.0)
    assert np.all(inf <= est) and np.all(est <= sup)
    assert np.all(inf >= 0)
    assert sup[0] == pytest.approx(1.2)  # à noite (estimativa 0) o intervalo fica [0; 1,2]


def test_quantis_ficam_dos_dois_lados_de_zero():
    assert completar.quantis(np.linspace(0.1, 2.0, 50), 0.8) == (0.0, pytest.approx(1.81))
    q_inf, q_sup = completar.quantis(np.linspace(-1, 1, 101), 0.8)
    assert (q_inf, q_sup) == (pytest.approx(-0.8), pytest.approx(0.8))


def test_referencia_e_a_mesma_hora_do_dia_anterior():
    horas = _horas(2)
    serie = pd.Series(np.arange(48, dtype=float), index=horas)
    ref = completar.referencia(serie, 24)
    assert np.isnan(ref[:24]).all()
    assert ref[24:] == pytest.approx(np.arange(24))


def test_erro_relativo_e_o_erro_medio_a_dividir_pela_media():
    assert completar.erro_relativo([10, 20, 30], [12, 18, 30]) == pytest.approx(4 / 60)
    assert completar.erro_relativo([10, 20], [np.nan, 25]) == pytest.approx(5 / 20)


# ---------------------------------------------------------------- vizinhos e preenchimento


def _posicoes(n: int = 8) -> pd.DataFrame:
    """n passadeiras alinhadas de 100 em 100 m (as 4 primeiras na RSU0030) e o estacionamento da RSU0030."""
    linhas = [{"id": CW.format(i), "tipo": "passadeira", "rsu": RSU if i <= 4 else "urn:ngsi-ld:RoadSideUnit:0001",
               "x": 100.0 * i, "y": 0.0} for i in range(1, n + 1)]
    linhas.append({"id": RSU, "tipo": "estacionamento", "rsu": RSU, "x": 0.0, "y": 0.0})
    return pd.DataFrame(linhas).set_index("id")


def _contexto(p, series: pd.DataFrame) -> completar.Contexto:
    q = {("passadeira", False): (-0.5, 1.0), ("passadeira", True): (-0.6, 2.5)}
    erro = {("passadeira", False): 0.3, ("passadeira", True): 0.5}
    return completar.Contexto({"passadeira": series}, _posicoes(series.shape[1]), q, erro, p)


def _series_demo(dias: int = 7) -> pd.DataFrame:
    """8 passadeiras durante uma semana (segunda a domingo); as da RSU0030 deixam de comunicar a partir do 3.º dia."""
    horas = _horas(dias)
    fds = np.where(horas.day_of_week >= 5, 0.5, 1.0)
    series = pd.DataFrame({CW.format(i): _serie(horas, i) * fds for i in range(1, 9)}, index=horas)
    series.loc[horas >= horas[48], [CW.format(i) for i in range(1, 5)]] = 0.0
    return series


def test_escolher_vizinhos_pelos_mais_proximos_do_mesmo_tipo():
    posicoes = _posicoes()
    candidatos = set(posicoes.index) - {CW.format(2)}
    viz = completar.escolher_vizinhos(CW.format(1), posicoes, candidatos, 3)
    assert viz == [CW.format(3), CW.format(4), CW.format(5)]  # salta a SC0002 e nunca escolhe o estacionamento


def test_preencher_salta_os_vizinhos_calados_na_falha(p):
    ctx = _contexto(p, _series_demo())
    linhas = completar.preencher(ctx, "SmartCrosswalk:0001", "2026-11-04T00:00", "2026-11-09T00:00")
    assert linhas["vizinhos"].iloc[0] == [CW.format(i) for i in range(5, 9)]


def test_preencher_marca_estimado_e_alarga_o_intervalo_ao_fim_de_semana(p):
    ctx = _contexto(p, _series_demo())
    linhas = completar.preencher(ctx, CW.format(1), "2026-11-04T00:06", "2026-11-09T00:00")
    assert linhas["t"].min() == pd.Timestamp("2026-11-04 00:00") and len(linhas) == 5 * 24
    assert linhas["estimado"].all() and (linhas["id"] == CW.format(1)).all()
    assert ((linhas["inf"] <= linhas["estimativa"]) & (linhas["estimativa"] <= linhas["sup"])).all()
    largura = (linhas["sup"] - linhas["inf"]) / (linhas["estimativa"] + 1)
    fds = linhas["fim_de_semana"]
    assert fds.any() and largura[fds].mean() > largura[~fds].mean()
    assert set(linhas.loc[fds, "erro_esperado"]) == {0.5}


def test_estacionamento_nao_se_completa(p, cfg):
    ctx = _contexto(p, _series_demo())
    with pytest.raises(completar.NaoCompletavel):
        completar.preencher(ctx, RSU, "2026-11-04T00:00", "2026-11-05T00:00")
    linhas, ignorados = completar.preencher_falhas(ctx, [(RSU, "2026-11-04T00:00", "2026-11-05T00:00")])
    assert linhas.empty and len(ignorados) == 1 and RSU in ignorados[0]
    assert "estacionamento" not in completar.Parametros.do_config(cfg).completaveis


def test_preencher_falhas_exclui_os_outros_sensores_da_mesma_falha(p):
    series = _series_demo()
    # A SC0002 ainda tem eventos na falha (por exemplo, só deixa de comunicar mais tarde), mas está na mesma falha de rede.
    series[CW.format(2)] = _serie(series.index, 2)
    ctx = _contexto(p, series)
    falhas = [(CW.format(1), "2026-11-04T00:00", "2026-11-09T00:00"), (CW.format(2), "2026-11-04T00:00", "2026-11-09T00:00")]
    linhas, _ = completar.preencher_falhas(ctx, falhas)
    assert CW.format(2) not in linhas.loc[linhas["id"] == CW.format(1), "vizinhos"].iloc[0]


def test_falhas_detetadas_sao_as_completaveis_sem_a_demo(cfg):
    demo = ids.urn(cfg["demo"]["passadeiras"][0])
    seg = "urn:ngsi-ld:RoadSegment:10368"
    falhas = pd.DataFrame({"sensor": [demo, RSU, seg], "tipo_sensor": ["passadeira", "estacionamento", "segmento"],
                           "inicio": pd.to_datetime(["2026-11-04 20:06"] * 3), "fim": pd.to_datetime(["2026-11-05 10:00"] * 3)})
    assert completar.falhas_detetadas(falhas, cfg) == [(seg, "2026-11-04 20:06:00", "2026-11-05 10:00:00")]


def test_outras_falhas_do_mesmo_sensor_saem_do_treino(p):
    series = _series_demo()
    series.loc["2026-11-06":"2026-11-06 23:00", CW.format(6)] = 0  # uma falha anterior da SC0006
    ctx = _contexto(p, series)
    falha = (CW.format(6), "2026-11-08T00:00", "2026-11-09T00:00")
    com, _ = completar.preencher_falhas(ctx, [falha, (CW.format(6), "2026-11-06T00:00", "2026-11-07T00:00")])
    sem = completar.preencher(ctx, *falha)
    dia8 = com[com["t"] >= "2026-11-08"]
    assert dia8["estimativa"].sum() > sem["estimativa"].sum()  # os zeros da outra falha já não baixam o perfil


def test_as_horas_caladas_a_partir_da_1a_falha_saem_do_treino(p):
    """Um sensor que deixa de comunicar e não volta. A ① parte o silêncio em várias falhas, e as horas sem dados
    entre elas e depois da última (a noite, o fim de semana) entravam no treino: a estimativa aprendia os zeros."""
    verdadeira = _series_demo()
    s = CW.format(6)
    series = verdadeira.copy()
    series.loc["2026-11-05":, s] = 0.0  # deixa de comunicar a 05/11 e não volta até ao fim dos dados
    falhas = [(s, "2026-11-05T08:00", "2026-11-05T20:00"), (s, "2026-11-06T08:00", "2026-11-06T20:00")]
    linhas, ignorados = completar.preencher_falhas(_contexto(p, series), falhas)
    assert not ignorados and len(linhas) == 24
    real = verdadeira.loc[pd.DatetimeIndex(linhas["t"]), s].to_numpy()
    assert linhas["estimativa"].mean() == pytest.approx(real.mean(), rel=0.1)


def test_falhas_seguidas_do_mesmo_sensor_nao_repetem_horas(p):
    ctx = _contexto(p, _series_demo())
    falhas = [(CW.format(6), "2026-11-08T10:30", "2026-11-08T14:30"), (CW.format(6), "2026-11-08T14:30", "2026-11-08T18:00"),
              (CW.format(6), "2026-11-08T17:40", "2026-11-08T19:20")]  # seguidas, a meio da hora
    linhas, _ = completar.preencher_falhas(ctx, falhas)
    assert not linhas.duplicated(["id", "t"]).any()
    assert list(linhas["t"]) == list(pd.date_range("2026-11-08 10:00", "2026-11-08 19:00", freq="h"))


def test_preencher_falhas_segue_quando_um_sensor_nao_tem_vizinhos(p):
    ctx = _contexto(p, _series_demo())
    falhas = [(CW.format(i), "2026-11-04T00:00", "2026-11-05T00:00") for i in range(1, 9)]  # todos em falha
    linhas, ignorados = completar.preencher_falhas(ctx, falhas)
    assert linhas.empty and len(ignorados) == 8 and "nenhum vizinho" in ignorados[0]


def test_falhas_demo_sao_as_passadeiras_da_demo_ate_ao_fim_dos_dados(cfg):
    demo = sorted(ids.urn(p) for p in cfg["demo"]["passadeiras"])
    posicoes = pd.DataFrame({"tipo": "passadeira", "rsu": RSU, "x": 0.0, "y": 0.0},
                            index=demo + ["urn:ngsi-ld:RoadSegment:1"])  # um segmento da mesma RSU não entra
    falhas = completar.falhas_demo(cfg, posicoes)
    assert [s for s, _, _ in falhas] == demo
    assert {(i, f) for _, i, f in falhas} == {(cfg["demo"]["incidente"]["inicio"], cfg["periodo_dados"]["fim"])}


def test_simulacao_treina_29_h_antes_do_incidente(cfg):
    horas = pd.date_range(cfg["periodo_dados"]["inicio"], cfg["periodo_dados"]["fim"], freq="h", inclusive="left")
    treino, teste = completar.cenarios(cfg, horas)["simulacao"]
    assert treino.sum() == cfg["completar"]["avaliacao"]["simulacao_treino_h"]
    assert horas[teste][0] == pd.Timestamp(cfg["demo"]["incidente"]["inicio"]).floor("h")


def test_avaliacao_compara_com_a_referencia_e_a_razao_ganha_quando_os_vizinhos_explicam(p):
    series = _series_demo().drop(columns=[CW.format(i) for i in range(1, 5)])
    treino = np.asarray(series.index < series.index[48])
    previsoes = completar.prever_cenario(series, _posicoes(), treino, ~treino, p, 24, 42)
    previsoes["dentro"] = completar.cobertura(previsoes, p)
    resumo = completar.resumir(previsoes, p).set_index(["dias", "modelo"])
    assert resumo.loc[("todos", "razao"), "erro_mediano"] == pytest.approx(0, abs=1e-9)
    assert resumo.loc[("todos", "referencia"), "erro_mediano"] > 0.1  # o fim de semana engana a referência
    assert resumo.loc[("todos", "razao"), "ganha_referencia"] == 4



# ---------------------------------------------------------------- o método por tipo (ADR-0046)


def test_metodo_por_tipo_vem_do_config_e_um_tipo_sem_metodo_e_erro(cfg):
    p = completar.Parametros.do_config(cfg)
    assert (p.metodo("passadeira"), p.metodo("zona"), p.metodo("segmento")) == ("razao", "razao", "ridge")
    assert p.ridge_alphas_log10 == tuple(cfg["completar"]["comparacao"]["ridge_alphas_log10"])
    sem_segmento = copy.deepcopy(cfg)
    del sem_segmento["completar"]["metodo"]["segmento"]
    with pytest.raises(ValueError, match=r"sem método para \['segmento'\]"):
        completar.Parametros.do_config(sem_segmento)
    desconhecido = copy.deepcopy(cfg)
    desconhecido["completar"]["metodo"]["segmento"] = "lightgbm"
    with pytest.raises(ValueError, match="completar.metodo"):
        completar.Parametros.do_config(desconhecido)


def test_preencher_usa_o_metodo_do_tipo(p):
    """Com a ridge, a estimativa é a da ridge da comparação, treinada fora da falha; com a razão, a do ADR-0005."""
    series = _series_demo()
    janela = np.asarray(series.index >= pd.Timestamp("2026-11-04"))
    vizinhos = [CW.format(i) for i in range(5, 9)]
    for metodo, esperado in (("razao", completar.estimar(series[CW.format(1)], series[vizinhos], ~janela, p)),
                             ("ridge", completar.comparar_ridge(series[CW.format(1)], series[vizinhos], ~janela, 0, (-2, 4, 15)))):
        pm = completar.Parametros(**{**p.__dict__, "metodos": (("passadeira", metodo),)})
        linhas = completar.preencher(_contexto(pm, series), CW.format(1), "2026-11-04T00:00", "2026-11-09T00:00")
        assert linhas["estimativa"].to_numpy() == pytest.approx(esperado[janela], abs=1e-9), metodo


def test_intervalo_e_erro_esperado_vem_do_metodo_do_tipo(p):
    """O intervalo dos segmentos vem dos resíduos da própria ridge, e o erro esperado do erro dela (ADR-0046)."""
    t = pd.date_range("2026-11-04", periods=96, freq="h")  # quarta a sábado: dias úteis e fim de semana
    rng = np.random.default_rng(1)
    y = rng.uniform(5, 50, len(t))
    prev = pd.DataFrame({"t": t, "y": y, "razao": y * 1.3, "ridge": y * rng.uniform(0.9, 1.1, len(t))})
    metricas = pd.DataFrame([{"cenario": "simulacao", "tipo": "segmento", "modelo": m, "dias": d, "erro_mediano": e}
                             for m, e in (("razao", 0.33), ("ridge", 0.27)) for d in ("semana", "fim_de_semana")])
    pr = completar.Parametros(**{**p.__dict__, "metodos": (("segmento", "ridge"),)})
    q, erro = completar.calibrar({"segmento": prev}, metricas, pr)
    fds = completar.fim_de_semana(prev["t"])
    res = completar.residuos(prev["y"], prev["ridge"], pr.piso)
    assert q[("segmento", False)] == pytest.approx(completar.quantis(res[~fds], pr.intervalo))
    assert q[("segmento", True)] == pytest.approx(completar.quantis(res[fds], pr.intervalo))
    assert erro == {("segmento", False): 0.27, ("segmento", True): 0.27}
    # Com a razão, os mesmos dados dão o intervalo da razão (sempre acima do real: o quantil de cima fica em 0).
    q_razao, _ = completar.calibrar({"segmento": prev}, metricas, p)
    assert q_razao[("segmento", False)][1] == 0.0 and q[("segmento", False)][1] > 0


def test_avaliacao_mede_a_cobertura_do_metodo_e_a_media_da_noite(p):
    series = _series_demo().drop(columns=[CW.format(i) for i in range(1, 5)])
    treino = np.asarray(series.index < series.index[48])
    previsoes = completar.prever_cenario(series, _posicoes(), treino, ~treino, p, 24, 42,
                                         {"ridge": completar.modelos_comparacao({"ridge_alphas_log10": [-2, 4, 15], "lightgbm": {}})["ridge"]})
    previsoes["dentro"] = completar.cobertura(previsoes, p, "ridge")
    resumo = completar.resumir(previsoes, p, "ridge").set_index(["dias", "modelo"])
    assert resumo.loc[("todos", "ridge"), "cobertura"] is not None and np.isfinite(resumo.loc[("todos", "ridge"), "cobertura"])
    assert pd.isna(resumo.loc[("todos", "razao"), "cobertura"])  # a cobertura é só a do método do tipo
    noite = previsoes[previsoes["t"].dt.hour.isin(p.horas_noite)]
    assert resumo.loc[("todos", "ridge"), "noite_media"] == pytest.approx(noite["ridge"].mean())
    assert resumo.loc[("todos", "ridge"), "noite_media_real"] == pytest.approx(noite["y"].mean())


# ---------------------------------------------------------------- de ponta a ponta


def _escrever_parquet(caminho: Path, tabela: pd.DataFrame) -> None:
    con = duckdb.connect()
    con.register("t", tabela)
    con.sql("select * from t").write_parquet(str(caminho))
    con.close()


def _eventos(series: pd.DataFrame) -> pd.DataFrame:
    """Um evento por travessia, espalhados dentro de cada hora."""
    linhas = [(sensor, t + pd.Timedelta(seconds=int(3600 * (k + 0.5) / n)))
              for sensor in series.columns for t, n in series[sensor].items() if n > 0 for k in range(int(n))]
    return pd.DataFrame(linhas, columns=["id", "t"])


FALHA_SC6 = ("2026-11-06 10:00", "2026-11-06 15:00")


@pytest.fixture
def pastas(tmp_path, cfg):
    """data/interim e data/processed sintéticos na janela do config: 8 passadeiras e o estacionamento da RSU0030."""
    horas = pd.date_range(cfg["periodo_dados"]["inicio"], cfg["periodo_dados"]["fim"], freq="h", inclusive="left")
    rng = np.random.default_rng(0)
    series = pd.DataFrame({CW.format(i): np.round(_serie(horas, i) * rng.uniform(0.7, 1.3, len(horas)))
                           for i in range(1, 9)}, index=horas)
    series.loc[horas >= pd.Timestamp(cfg["demo"]["incidente"]["inicio"]), [CW.format(i) for i in range(1, 5)]] = 0
    series.loc[FALHA_SC6[0]:FALHA_SC6[1], CW.format(6)] = 0  # falha sintética de dispositivo, fora da demo
    interim, processed = tmp_path / "interim", tmp_path / "processed"
    interim.mkdir()
    processed.mkdir()
    _escrever_parquet(interim / "passadeiras.parquet", _eventos(series))
    _escrever_parquet(processed / "sensores.parquet", _posicoes().reset_index())
    fim = pd.Timestamp(cfg["periodo_dados"]["fim"])
    falhas = [(CW.format(i), "passadeira", pd.Timestamp(cfg["demo"]["incidente"]["inicio"]), fim, "rede") for i in range(1, 5)]
    falhas += [(RSU, "estacionamento", pd.Timestamp("2026-11-05 00:00"), fim, "rede"),
               (CW.format(6), "passadeira", pd.Timestamp(FALHA_SC6[0]), pd.Timestamp(FALHA_SC6[1]), "dispositivo")]
    _escrever_parquet(processed / "falhas.parquet",
                      pd.DataFrame(falhas, columns=["sensor", "tipo_sensor", "inicio", "fim", "tipo"]))
    so_passadeiras = copy.deepcopy(cfg)
    so_passadeiras["completar"]["completaveis"] = ["passadeiras"]
    return interim, processed, so_passadeiras


def test_calcular_escreve_os_sensores_virtuais_e_a_avaliacao(pastas):
    interim, processed, cfg = pastas
    cfg = copy.deepcopy(cfg)
    cfg["demo"]["passadeiras"] = [CW.format(i) for i in range(1, 5)]  # as passadeiras sintéticas da RSU em falha
    resultado = completar.calcular(interim, processed, processed, cfg)
    con = duckdb.connect()
    virtuais = con.read_parquet(str(processed / "sensores_virtuais.parquet")).df()
    avaliacao = con.read_parquet(str(processed / "avaliacao_completar.parquet")).df()
    con.close()
    assert set(virtuais["id"]) == {CW.format(i) for i in range(1, 6 + 1)} - {CW.format(5)}
    demo = virtuais[virtuais["id"] != CW.format(6)]
    assert virtuais["estimado"].all() and demo["t"].min() == pd.Timestamp("2026-11-04 20:00")
    # A falha de dispositivo da ①: as horas dela, com intervalo; o estacionamento fica de fora (ADR-0005).
    sc6 = virtuais[virtuais["id"] == CW.format(6)]
    assert list(sc6["t"]) == list(pd.date_range(FALHA_SC6[0], FALHA_SC6[1], freq="h", inclusive="left"))
    assert ((sc6["inf"] <= sc6["estimativa"]) & (sc6["estimativa"] <= sc6["sup"])).all() and sc6["estimativa"].gt(0).all()
    assert resultado["ignorados"] == [] and RSU not in set(virtuais["id"])
    assert set(avaliacao["cenario"]) == set(completar.CENARIOS)
    assert {"razao", "referencia", "ridge"} <= set(avaliacao["modelo"])


def test_completar_sem_dados_sai_com_1(tmp_path, monkeypatch, capsys):
    monkeypatch.setenv("RIASENSE_DATA_INTERIM", str(tmp_path))
    monkeypatch.setenv("RIASENSE_DATA_PROCESSED", str(tmp_path))
    assert main(["completar"]) == 1
    assert "riasense sensores" in capsys.readouterr().err


# ---------------------------------------------------------------- dados reais


@pytest.mark.integration
def test_dados_reais_simulacao_29h_e_preenchimento_da_rsu0030(tmp_path, cfg):
    interim = Path(os.environ.get("RIASENSE_DATA_INTERIM") or config.RAIZ / "data" / "interim")
    processed = Path(os.environ.get("RIASENSE_DATA_PROCESSED") or config.RAIZ / "data" / "processed")
    tabelas = [interim / f"{t}.parquet" for t in ("passadeiras", "visitas", "segmentos")] + [processed / "sensores.parquet"]
    if not all(f.is_file() for f in tabelas):
        pytest.skip("faltam data/interim (riasense ingerir) ou sensores.parquet (riasense sensores)")
    resultado = completar.calcular(interim, processed, tmp_path, cfg)
    m = resultado["metricas"].set_index(["cenario", "tipo", "modelo", "dias"])["erro_mediano"]
    # Critérios: erro mediano ≤ 0,40 nas passadeiras com 29 h de treino, sempre abaixo da referência.
    assert m[("simulacao", "passadeira", "razao", "todos")] <= 0.40
    for cenario in completar.CENARIOS:
        assert m[(cenario, "passadeira", "razao", "todos")] < m[(cenario, "passadeira", "referencia", "todos")]
    assert m[("simulacao", "passadeira", "razao", "fim_de_semana")] > m[("simulacao", "passadeira", "razao", "semana")]
    _cumpre_o_adr_0046(resultado["metricas"], cfg)

    virtuais = duckdb.read_parquet(str(tmp_path / "sensores_virtuais.parquet")).df()
    demo = {ids.urn(s) for s in cfg["demo"]["passadeiras"]}
    assert demo <= set(virtuais["id"]) and "estacionamento" not in set(virtuais["tipo"])
    for sensor in demo:
        v = virtuais[virtuais["id"] == sensor]
        assert len(v) == 135  # 04/11 20h00 até 10/11 10h00
        noite = v.loc[v["t"].dt.hour.isin(cfg["completar"]["horas_noite"]), "estimativa"].mean()
        assert noite <= 0.10 * v["estimativa"].mean()  # noites ≈ 0 (a ridge chegou a inventar 91 travessias/h)
        assert ((v["inf"] <= v["estimativa"]) & (v["estimativa"] <= v["sup"])).all()


def test_hiperparametros_da_comparacao_vem_do_config(cfg):
    # Os modelos de comparação usam completar.comparacao, e não valores escritos no código.
    params = copy.deepcopy(cfg["completar"]["comparacao"])
    params["ridge_alphas_log10"] = [0, 1, 2]
    modelos = completar.modelos_comparacao(params)
    assert modelos["ridge"].keywords == {"alphas_log10": [0, 1, 2]}
    if "lightgbm" in modelos:
        assert modelos["lightgbm"].keywords == {"params": cfg["completar"]["comparacao"]["lightgbm"]}


def _cumpre_o_adr_0046(avaliacao: pd.DataFrame, cfg: dict) -> None:
    """Um tipo com um método que não é a razão ganha-lhe nos dois testes e passa a forma da noite (ADR-0005, ADR-0046)."""
    p = completar.Parametros.do_config(cfg)
    limite = cfg["completar"]["avaliacao"]["noite_max_vezes_real"]
    a = avaliacao[avaliacao["dias"] == "todos"].set_index(["cenario", "tipo", "modelo"])
    novos = [t for t in sorted(set(avaliacao["tipo"])) if p.metodo(t) != "razao"]
    assert novos == ["segmento"]
    for tipo in novos:
        m = p.metodo(tipo)
        for cenario in completar.CENARIOS:
            assert a.loc[(cenario, tipo, m), "erro_mediano"] <= a.loc[(cenario, tipo, "razao"), "erro_mediano"], cenario
            assert a.loc[(cenario, tipo, m), "noite_media"] <= limite * a.loc[(cenario, tipo, m), "noite_media_real"], cenario
            assert 0.7 <= a.loc[(cenario, tipo, m), "cobertura"] <= 0.9, cenario  # o intervalo de 80 % da própria ridge


def test_a_avaliacao_versionada_cumpre_o_adr_0046(cfg):
    """O `avaliacao_completar.parquet` do repositório: a ridge ganha à razão nos segmentos, nos dois testes, e passa a
    forma da noite; e foi gerado com a LightGBM (as linhas dela não se perdem quando a libomp falta)."""
    caminho = config.RAIZ / "data" / "processed" / "avaliacao_completar.parquet"
    if not caminho.is_file():
        pytest.skip("falta data/processed/avaliacao_completar.parquet (riasense completar)")
    avaliacao = duckdb.read_parquet(str(caminho)).df()
    assert {"noite_media", "noite_media_real"} <= set(avaliacao.columns)
    assert "lightgbm" in set(avaliacao["modelo"])
    _cumpre_o_adr_0046(avaliacao, cfg)
