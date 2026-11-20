"""Validação em várias janelas (ADR-0031), com dados sintéticos."""

import copy

import numpy as np
import pandas as pd
import pytest
from sklearn.dummy import DummyRegressor
from sklearn.ensemble import HistGradientBoostingRegressor

from riasense import completar, config, prever, validacao

CW = "urn:ngsi-ld:SmartCrosswalk:00{:02d}"
PERFIL = np.array([0, 0, 0, 0, 0, 0, 2, 8, 20, 15, 12, 12, 15, 12, 10, 10, 12, 15, 10, 6, 4, 2, 1, 0], dtype=float)


@pytest.fixture
def cfg():
    return config.carregar()


def _horas(cfg) -> pd.DatetimeIndex:
    return pd.date_range(cfg["periodo_dados"]["inicio"], cfg["periodo_dados"]["fim"], freq="h", inclusive="left", name="t")


def _series(cfg, n: int = 8, semente: int = 0) -> pd.DataFrame:
    """n passadeiras com o mesmo perfil diário, tamanhos diferentes e ruído; menos travessias ao fim de semana."""
    horas = _horas(cfg)
    rng = np.random.default_rng(semente)
    fds = np.where(horas.day_of_week >= 5, 0.6, 1.0)
    return pd.DataFrame({CW.format(i): rng.poisson(PERFIL[horas.hour] * i * fds).astype(float) for i in range(1, n + 1)},
                        index=horas)


def _posicoes(n: int = 8) -> pd.DataFrame:
    return pd.DataFrame([{"id": CW.format(i), "tipo": "passadeira", "rsu": "r", "x": 100.0 * i, "y": 0.0}
                         for i in range(1, n + 1)]).set_index("id")


def test_config_do_adr_e_valido(cfg):
    validacao.validar_config(cfg)
    assert validacao.horizontes(cfg) == [1, 3, 6]  # o de avaliação (ADR-0027) e os do produto
    for h in validacao.horizontes(cfg):
        todas = [c for g in validacao.grupos_do_horizonte(cfg, h).values() for c in g]
        assert len(todas) == len(set(todas))  # os grupos não se sobrepõem
        assert set(todas) == set(prever.colunas(prever.com_horizonte(cfg, h)["prever"], False))  # e cobrem as variáveis


def test_os_grupos_seguem_o_horizonte():
    cfg = {"validacao": {"prever": {"grupos": {"curtos": ["atraso_{h}h", "atraso_{h+1}h", "atraso_{h+2}h"],
                                               "dia": ["atraso_24h"], "viz": ["vizinhos_{h}h"]}}}}
    assert validacao.grupos_do_horizonte(cfg, 1) == {"curtos": ["atraso_1h", "atraso_2h", "atraso_3h"],
                                                     "dia": ["atraso_24h"], "viz": ["vizinhos_1h"]}
    assert validacao.grupos_do_horizonte(cfg, 3)["curtos"] == ["atraso_3h", "atraso_4h", "atraso_5h"]
    assert validacao.grupos_do_horizonte(cfg, 6)["viz"] == ["vizinhos_6h"]


@pytest.mark.parametrize("mexer", [
    lambda v: v["prever"]["grupos"].__setitem__("vizinhos_curtos", ["vizinhos_{h}h", "vizinhos_24h"]),  # sobreposto
    lambda v: v.__setitem__("janelas", ["2026-11-06", "2026-11-06"]),
    lambda v: v.__setitem__("janelas", ["2026-11-10"]),  # o dia não acaba dentro dos dados
    lambda v: v.__setitem__("janelas", ["2026-11-06T12:00"]),  # não é um dia inteiro
    lambda v: v["hora"]["numero"].remove("lightgbm"),
])
def test_config_que_foge_ao_adr_da_erro(cfg, mexer):
    cfg = copy.deepcopy(cfg)
    mexer(cfg["validacao"])
    with pytest.raises(ValueError):
        validacao.validar_config(cfg)


def test_janelas_nao_se_sobrepoem_e_o_teste_nunca_entra_no_treino(cfg):
    horas = _horas(cfg)
    js = validacao.janelas(cfg, horas)
    assert list(js) == ["2026-11-06", "2026-11-07", "2026-11-08", "2026-11-09"]
    testes = []
    for dia, (treino, teste) in js.items():
        assert teste.sum() == 24 and set(horas[teste].hour) == set(range(24))
        assert not (treino & teste).any()
        assert horas[treino].max() < horas[teste].min()
        assert horas[treino].min() == horas[0]  # treina com todas as horas antes do dia
        testes.append(set(horas[teste]))
    assert [js[d][0].sum() for d in js] == [57, 81, 105, 129]
    assert all(not (a & b) for i, a in enumerate(testes) for b in testes[i + 1:])


def test_hora_indicadoras_seno_cosseno_e_numero():
    h = np.array([0, 6, 23])
    ind = validacao.codificar_hora(h, "indicadoras", range(3))
    assert ind.shape == (3, 24) and (ind.sum(axis=1) == 1).all() and ind.iloc[2]["h23"] == 1
    sc = validacao.codificar_hora(h, "seno_cosseno", range(3))
    assert np.allclose(sc["hora_sen"] ** 2 + sc["hora_cos"] ** 2, 1) and np.isclose(sc.iloc[1]["hora_sen"], 1)
    assert list(validacao.codificar_hora(h, "numero", range(3))["hora"]) == [0, 6, 23]


def test_completar_a_previsao_do_sensor_nao_ve_o_dia_de_teste(cfg):
    """Mudar o sensor no dia de teste não muda a previsão dele: só o treino e os vizinhos entram."""
    series, posicoes = _series(cfg), _posicoes()
    p = completar.Parametros.do_config(cfg)
    modelos = {n: validacao.candidato_completar(n, cfg) for n in validacao.CANDIDATOS}
    treino, teste = validacao.janelas(cfg, series.index)["2026-11-07"]
    alvo = CW.format(3)

    def prever_alvo(s):
        prev = completar.prever_cenario(s, posicoes, treino, teste, p, 24, 42, modelos)
        return prev[prev["id"] == alvo].reset_index(drop=True)

    antes = prever_alvo(series)
    mexido = series.copy()
    mexido.loc[teste, alvo] *= 10
    depois = prever_alvo(mexido)
    for m in ["razao", "referencia", *validacao.CANDIDATOS]:
        assert np.allclose(antes[m], depois[m]), m
    assert not np.allclose(antes["y"], depois["y"])


def test_completar_resume_todos_os_modelos_nas_mesmas_horas_e_sensores(cfg):
    series = {"passadeira": _series(cfg)}
    p = completar.Parametros.do_config(cfg)
    modelos = {n: validacao.candidato_completar(n, cfg) for n in ("poisson", "knn")}
    linhas_m, linhas_v = validacao.avaliar_completar(series, _posicoes(), cfg, p, modelos)
    m = pd.DataFrame(linhas_m)
    jan = m[m["cenario"] == "janela"]
    assert set(jan["janela"]) == set(cfg["validacao"]["janelas"]) and set(jan["dias"]) == {"todos"}
    assert jan.groupby("janela")[["n_sensores", "n_horas"]].nunique().eq(1).all().all()  # os mesmos para todos
    assert (jan["n_horas"] == 24).all()
    sim = m[m["cenario"] == "simulacao"]
    assert {"todos", "semana", "fim_de_semana"} <= set(sim["dias"]) and (sim["treino_h"] == 29).all()
    assert set(m.loc[m["modelo"] == "razao", "papel"]) == {"atual"}
    assert set(m.loc[m["modelo"] == "knn", "papel"]) == {"candidato"}
    v = pd.DataFrame(linhas_v)
    assert set(v["variante"]) == {"3 vizinhos", "5 vizinhos", "8 vizinhos"}
    assert np.allclose(v.loc[v["variante"] == "5 vizinhos", "subida"], 0)


def _W(cfg, semente: int = 1) -> pd.DataFrame:
    """Séries da ③ (uma hora a mais no fim, como em `prever.largas`), com uma falha (NaN) num sensor."""
    W = _series(cfg, n=6, semente=semente)
    W = W.reindex(W.index.append(pd.DatetimeIndex([W.index[-1] + pd.Timedelta(hours=1)], name="t")))
    W.loc["2026-11-07 10:00":"2026-11-07 14:00", CW.format(2)] = np.nan
    return W


def _ajustar_hgb(registo: list):
    """Um LightGBM de mentira (aceita valores em falta) que regista as linhas com que treina."""
    def ajustar(treino, cols, params):
        registo.append(treino)
        return HistGradientBoostingRegressor(max_iter=20, random_state=0).fit(treino[cols], treino["alvo"])
    return ajustar


@pytest.mark.parametrize("h", [1, 3, 6])
def test_prever_treina_so_antes_do_dia_e_testa_nas_mesmas_linhas(cfg, monkeypatch, h):
    W = _W(cfg)
    p = prever.com_horizonte(cfg, h)["prever"]
    viz = {s: [c for c in W.columns if c != s][:3] for s in W.columns}
    registo, vistos = [], []

    class Espia(DummyRegressor):
        def fit(self, X, y, sample_weight=None):
            vistos.append(X.index)
            return super().fit(X, y)

    monkeypatch.setattr(validacao, "construir", lambda nome, cfg: Espia())
    dia = pd.Timestamp("2026-11-07")
    r = validacao.avaliar_prever_janela(W, viz, cfg, dia, h, _ajustar_hgb(registo))

    tab = validacao.tabela_prever(W, prever.escalas(W, dia), viz, p)
    treino, teste = validacao.dividir_janela(tab, dia, prever.colunas(p, False))
    assert (tab.loc[teste, "t"] >= dia).all() and (tab.loc[teste, "t"] < dia + pd.Timedelta(days=1)).all()
    assert not (treino & teste).any()
    assert len(registo) == 1 + len(cfg["validacao"]["prever"]["grupos"])
    assert all((t["t"] < dia).all() for t in registo)
    assert len(vistos) == len(cfg["validacao"]["prever"]["candidatos"])
    assert all((tab.loc[idx, "t"] < dia).all() and tab.loc[idx, prever.colunas(p, False)].notna().all().all()
               for idx in vistos)  # os candidatos só treinam com linhas completas, antes do dia
    assert set(r["erro"]) == {"referencia", "persistencia", "lightgbm", *cfg["validacao"]["prever"]["candidatos"]}
    assert set(r["retirados"]) == set(cfg["validacao"]["prever"]["grupos"])
    # A falha do sensor 2 (10h–14h) e as horas seguintes, cujas variáveis a tocam, saem do teste.
    assert not ((tab["id"] == CW.format(2)) & teste & (tab["t"].dt.hour.between(10, 14))).any()


@pytest.mark.parametrize("h", [1, 3, 6])
def test_persistencia_e_o_valor_de_ha_h_horas(cfg, h):
    W = _W(cfg)
    p = prever.com_horizonte(cfg, h)["prever"]
    tab = validacao.tabela_prever(W, prever.escalas(W, pd.Timestamp("2026-11-07")), {}, p)
    t = pd.Timestamp("2026-11-07 09:00")
    linha = tab[(tab["id"] == CW.format(4)) & (tab["t"] == t)].iloc[0]
    assert linha["persistencia"] == W.at[t - pd.Timedelta(hours=h), CW.format(4)]


def _linhas(camada, tipo, erros: dict, noite=None, noite_real=0.1, h=None, cenario="janela"):
    """Linhas de avaliacao_modelos: `erros` dá, por modelo, a lista de erros nas 4 janelas."""
    dias = ["2026-11-06", "2026-11-07", "2026-11-08", "2026-11-09"] if cenario == "janela" else [None]
    return [{"camada": camada, "cenario": cenario, "janela": d, "horizonte_h": h, "tipo": tipo, "modelo": m,
             "dias": "todos", "erro_mediano": e[i], "noite": (noite or {}).get(m, [0.1] * 4)[i] if cenario == "janela" else None,
             "noite_real": noite_real} for m, e in erros.items() for i, d in enumerate(dias)]


def test_regra_da_3_ganha_por_5_por_cento_em_3_de_4_janelas_e_a_referencia_e_persistencia(cfg):
    erros = {
        "lightgbm": [0.40, 0.40, 0.40, 0.40],
        "referencia": [0.60] * 4, "persistencia": [0.41] * 4,
        "svr": [0.30, 0.30, 0.30, 0.50],          # −10% e 3 de 4: passa
        "knn": [0.20, 0.20, 0.50, 0.50],          # −12,5%, mas só 2 de 4
        "poisson": [0.39, 0.39, 0.39, 0.39],      # 4 de 4, mas só −2,5%
        "random_forest": [0.35, 0.35, 0.35, 0.35],  # −12,5%, 4 de 4: passa e é o de menor erro
    }
    res = validacao.regra(pd.DataFrame(_linhas("prever", "zona", erros, h=1)), cfg).set_index("modelo")
    assert res.loc["svr", "passa"] and res.loc["random_forest", "passa"]
    assert not res.loc["knn", "passa"] and not res.loc["knn", "janelas_ok"]
    assert not res.loc["poisson", "passa"] and not res.loc["poisson", "melhoria_ok"]
    # 0,35 contra 0,35 do svr: a menos de 5%, fica o mais simples (o SVR vem antes da random forest).
    assert res.loc["svr", "proposto"] and not res.loc["random_forest", "proposto"]
    assert res["proposto"].sum() == 1


def test_regra_da_3_pede_ganhar_a_persistencia(cfg):
    erros = {"lightgbm": [0.40] * 4, "referencia": [0.60] * 4, "persistencia": [0.30] * 4, "svr": [0.33] * 4,
             "knn": [0.5] * 4, "poisson": [0.5] * 4, "random_forest": [0.5] * 4}
    res = validacao.regra(pd.DataFrame(_linhas("prever", "zona", erros, h=1)), cfg).set_index("modelo")
    assert res.loc["svr", "melhoria_ok"] and res.loc["svr", "janelas_ok"] and not res.loc["svr", "regra_camada_ok"]
    assert not res["proposto"].any()


def test_regra_da_2_pede_a_simulacao_e_a_forma_diaria(cfg):
    erros = {"razao": [0.40] * 4, "referencia": [0.6] * 4, "ridge": [0.30] * 4, "svr": [0.30] * 4,
             "knn": [0.30] * 4, "poisson": [0.5] * 4, "random_forest": [0.5] * 4, "lightgbm": [0.5] * 4}
    noite = {"razao": [0.10] * 4, "ridge": [0.30, 0.1, 0.1, 0.1], "svr": [0.12] * 4, "knn": [0.1] * 4}
    sim = {"razao": [0.40], "ridge": [0.30], "svr": [0.30], "knn": [0.45], "referencia": [0.6],
           "poisson": [0.5], "random_forest": [0.5], "lightgbm": [0.5]}
    linhas = _linhas("completar", "segmento", erros, noite=noite, noite_real=0.12) + _linhas(
        "completar", "segmento", sim, cenario="simulacao")
    res = validacao.regra(pd.DataFrame(linhas), cfg).set_index("modelo")
    assert not res.loc["ridge", "regra_camada_ok"]  # numa janela, a noite passa a real e a da razão
    assert not res.loc["knn", "regra_camada_ok"]  # erra mais do que a razão na simulação
    assert res.loc["svr", "passa"] and res.loc["svr", "proposto"]  # 0,12 ≤ max(0,12; 0,10)
    assert res.loc["razao", "papel"] == "atual" and pd.isna(res.loc["razao", "janelas_ganhas"])
