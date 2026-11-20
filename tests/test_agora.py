"""Painel «agora» (ADR-0030 e ADR-0032): a base, a regra «sem comunicação» e o simulador, com dados sintéticos."""

import math
import re
import shutil
import socket

import duckdb
import numpy as np
import pandas as pd
import pytest
import yaml
from fastapi.testclient import TestClient

import app as api
from riasense import agora, config

RSU = "urn:ngsi-ld:RoadSideUnit:0030"
QUARTA_20H = 2 * agora.DIA_MIN + 20 * 60


def _taxas(util: float, fds: float | None = None) -> np.ndarray:
    return np.array([[fds if fds is not None else util] * 24, [util] * 24], dtype=float)


class Relogio:
    """Relógio de mentira, em segundos reais."""

    def __init__(self):
        self.t = 0.0

    def __call__(self):
        return self.t


def _sensores() -> list[agora.SensorPainel]:
    """4 passadeiras na RSU0030 (20 travessias/h cada), 1 noutra RSU e 1 segmento da RSU0030."""
    cw = [agora.SensorPainel(f"urn:ngsi-ld:SmartCrosswalk:00{19 + i}", "passadeira", [RSU], [f"cw{i}"], _taxas(20))
          for i in range(4)]
    outra = agora.SensorPainel("urn:ngsi-ld:SmartCrosswalk:0001", "passadeira", ["urn:ngsi-ld:RoadSideUnit:0035"],
                               ["cw9"], _taxas(30))
    seg = agora.SensorPainel("urn:ngsi-ld:RoadSegment:1", "segmento", [RSU], ["cw0"], _taxas(120))
    return [*cw, outra, seg]


def _simulador(semente: int = 42, relogio=None) -> agora.Simulador:
    return agora.Simulador(_sensores(), semente, 60.0, float(QUARTA_20H - 10), RSU, relogio or Relogio())


# ---------------------------------------------------------------- base


def test_base_sem_os_silencios_longos_e_por_tipo_de_dia():
    """A base da ① (ADR-0025): os dias do silêncio longo não puxam a mediana para 0."""
    dias = 6
    dia_util = np.array([True, True, True, True, False, False])
    matriz = np.tile(np.arange(24, dtype=float), (dias, 1)) * np.where(dia_util, 2, 1)[:, None]
    matriz[2:4] = 0  # sem eventos 2 dias úteis (o silêncio longo)
    longos = np.zeros((dias, 24), bool)
    longos[2:4] = True
    taxas, n = agora.taxas_base(matriz, longos, dia_util)
    assert np.allclose(taxas[1], np.arange(24) * 2) and (n[1] == 2).all()
    assert np.allclose(taxas[0], np.arange(24)) and (n[0] == 2).all()
    sem_exclusao, _ = agora.taxas_base(matriz, np.zeros_like(longos), dia_util)
    assert sem_exclusao[1, 20] == 20  # com os dias sem eventos na mediana, a taxa cai para metade


def test_hora_sem_dias_de_um_tipo_usa_o_outro():
    dia_util = np.array([True, True, False])
    matriz = np.full((3, 24), 6.0)
    longos = np.zeros((3, 24), bool)
    longos[2] = True  # o fim de semana todo sem eventos
    taxas, n = agora.taxas_base(matriz, longos, dia_util)
    assert (n[0] == 0).all() and np.allclose(taxas[0], 6.0)


def test_base_do_pipeline_exclui_o_silencio_longo_do_sensor(cfg_periodo):
    horas = pd.date_range(cfg_periodo["inicio"], cfg_periodo["fim"], freq="h", inclusive="left")
    contagens = pd.DataFrame({"sensor": "cw", "hora": horas, "n": 10})
    calado = (horas >= "2026-11-05") & (horas < "2026-11-06 12:00")
    contagens = contagens[~calado]
    silencios = pd.DataFrame({"sensor": ["cw"], "inicio": [pd.Timestamp("2026-11-04 23:59")],
                              "fim": [pd.Timestamp("2026-11-06 12:00")]})
    alvo = pd.DataFrame({"id": ["cw"], "tipo": ["passadeira"], "rsus": [[RSU]], "passadeiras": [["cw"]]})
    tab = agora.base(contagens, silencios, alvo, cfg_periodo)
    assert len(tab) == 48 and np.allclose(tab["taxa_h"], 10)


@pytest.fixture
def cfg_periodo():
    return config.carregar()["periodo_dados"]


# ---------------------------------------------------------------- regra «sem comunicação»


def test_limite_com_taxa_constante_e_o_de_poisson():
    taxas = _taxas(60)  # 1 evento por minuto
    lim = agora.limite(taxas, QUARTA_20H, 1e-6)
    assert lim == pytest.approx(math.log(1e6))  # 13,8 min
    assert not agora.calado(taxas, QUARTA_20H, QUARTA_20H + lim - 0.01, 1e-6)
    assert agora.calado(taxas, QUARTA_20H, QUARTA_20H + lim + 0.01, 1e-6)


def test_limite_soma_as_taxas_das_horas_que_o_silencio_atravessa():
    taxas = np.zeros((2, 24))
    taxas[1, 20], taxas[1, 21] = 6.0, 60.0
    desde = QUARTA_20H + 50  # 10 min às 20h (1 evento esperado) e o resto às 21h
    lim = agora.limite(taxas, desde, 1e-6)
    assert lim == pytest.approx(10 + (math.log(1e6) - 1))
    assert agora.esperados(taxas, desde, desde + lim) == pytest.approx(math.log(1e6))


def test_sensor_sem_atividade_nunca_fica_calado():
    assert agora.limite(np.zeros((2, 24)), QUARTA_20H, 1e-6) is None
    assert not agora.calado(np.zeros((2, 24)), QUARTA_20H, QUARTA_20H + 10_000, 1e-6)


# ---------------------------------------------------------------- simulador


def test_a_mesma_semente_da_a_mesma_sequencia_seja_qual_for_a_altura_dos_pedidos():
    a, b, c = _simulador(42), _simulador(42), _simulador(7)
    for t in range(QUARTA_20H, QUARTA_20H + 60, 3):  # `a` pede de 3 em 3 min; `b` só no fim
        a.ultimos(float(t))
    fim = float(QUARTA_20H + 60)
    assert a.ultimos(fim) == b.ultimos(fim)
    assert a.ultimos(fim) != c.ultimos(fim)


def test_os_eventos_seguem_a_taxa():
    """Em 10 h a 120 eventos/h, o segmento recebe cerca de 1200 eventos (Poisson: desvio de cerca de 35)."""
    rng = np.random.default_rng(1)
    t, n = float(QUARTA_20H - 600), 0
    while (t := agora.proximo_evento(rng, _taxas(120), t)) < QUARTA_20H:
        n += 1
    assert 1100 < n < 1300


def test_a_falha_simulada_dispara_o_alerta_da_rsu_no_limite_certo():
    relogio = Relogio()
    sim = _simulador(relogio=relogio)
    relogio.t = 10.0  # 10 s reais = 10 min simulados: quarta, 20h00
    sim.simular_falha()
    assert sim.falha_desde == pytest.approx(QUARTA_20H)
    cw = [i for i, s in enumerate(sim.sensores) if s.tipo == "passadeira" and RSU in s.rsus]
    ultimo = max(sim.ultimos(QUARTA_20H)[i] for i in cw)
    taxas = sum(sim.sensores[i].taxas for i in cw)
    lim = agora.limite(taxas, ultimo, 1e-6)
    assert lim == pytest.approx(math.log(1e6) / 80 * 60)  # 4 × 20/h juntas: cerca de 10 min

    def rsu_aos(minutos_depois_do_ultimo: float) -> dict:
        relogio.t = (ultimo + minutos_depois_do_ultimo - sim.inicio) * 60 / sim.velocidade
        e = agora.estado(sim, 1e-6, 1.0)  # leitura a cada segundo simulado, para ver o limite ao segundo
        return next(r for r in e["rsus"] if r["id"] == RSU)

    antes, depois = rsu_aos(lim - 0.05), rsu_aos(lim + 0.05)
    assert not antes["calado"] and depois["calado"]
    assert depois["limite_min"] == pytest.approx(lim, abs=0.05)
    # A outra RSU continua a receber eventos; o segmento da RSU0030 também deixou de comunicar.
    e = agora.estado(sim, 1e-6, 1.0)
    outra = next(r for r in e["rsus"] if r["id"] != RSU)
    assert not outra["calado"] and outra["ultimo_dado_min"] < 5
    seg = next(s for s in e["sensores"] if s["tipo"] == "segmento")
    assert seg["ultimo_dado_min"] >= lim - 0.1


def test_o_relogio_mostra_so_a_hora_simulada():
    assert agora.hora_simulada(QUARTA_20H - 10) == "19h50"
    e = agora.estado(_simulador(), 1e-6, 60.0)
    assert e["hora_simulada"] == "19h50" and e["fonte"] == "simulador" and "não são dados reais" in e["etiqueta"]
    sem_etiqueta = {k: v for k, v in e.items() if k != "etiqueta"}  # a etiqueta cita a semana de origem (ADR-0032)
    assert not re.search(r"\d{4}-\d{2}-\d{2}|\d{1,2}/11", str(sem_etiqueta))  # nenhuma data no estado


# ---------------------------------------------------------------- API


@pytest.fixture
def pasta(tmp_path, monkeypatch):
    """Config com o painel ligado, uma base sintética e o simulador por criar."""
    cfg = yaml.safe_load(config.CAMINHO_PADRAO.read_text(encoding="utf-8"))
    cfg["agora"]["ativo"] = True
    (tmp_path / "riasense.yaml").write_text(yaml.safe_dump(cfg, allow_unicode=True), encoding="utf-8")
    processed = tmp_path / "processed"
    processed.mkdir()
    linhas = [(s.id, s.tipo, s.rsus, s.passadeiras, bool(k), h, float(s.taxas[k, h]), 2)
              for s in _sensores() for k in (0, 1) for h in range(24)]
    base = pd.DataFrame(linhas, columns=agora.COLUNAS_BASE)
    duckdb.from_df(base).write_parquet(str(processed / "agora_base.parquet"))
    monkeypatch.setenv("RIASENSE_CONFIG", str(tmp_path / "riasense.yaml"))
    monkeypatch.setenv("RIASENSE_DATA_PROCESSED", str(processed))
    api._simulador.clear()
    yield tmp_path
    api._simulador.clear()


def test_api_desligada_por_omissao(tmp_path, monkeypatch):
    shutil.copy(config.CAMINHO_PADRAO, tmp_path / "riasense.yaml")
    monkeypatch.setenv("RIASENSE_CONFIG", str(tmp_path / "riasense.yaml"))
    api._simulador.clear()
    r = TestClient(api.app).get("/agora")
    assert r.status_code == 503 and r.json()["estado"] == "desligado"


def test_api_cada_resposta_leva_a_fonte_e_nada_se_grava(pasta):
    antes = sorted(p.name for p in pasta.rglob("*"))
    cliente = TestClient(api.app)
    for r in (cliente.get("/agora"), cliente.post("/agora/simulador/falha"), cliente.get("/agora"),
              cliente.post("/agora/simulador/repor")):
        assert r.status_code == 200
        assert r.json()["fonte"] == "simulador" and "não são dados reais" in r.json()["etiqueta"]
    assert cliente.post("/agora/simulador/falha").json()["falha"] == {"rsu": RSU, "ativa": True}
    assert len(cliente.get("/agora").json()["rsus"]) == 2
    assert sorted(p.name for p in pasta.rglob("*")) == antes


def test_api_sem_a_base_esta_por_calcular(pasta):
    (pasta / "processed" / "agora_base.parquet").unlink()
    r = TestClient(api.app).get("/agora")
    assert r.status_code == 503 and r.json()["estado"] == "por calcular"


def test_api_com_o_context_broker_sem_autorizacao_nao_liga(pasta):
    cfg = yaml.safe_load((pasta / "riasense.yaml").read_text(encoding="utf-8"))
    cfg["agora"]["fonte"] = "context_broker"
    (pasta / "riasense.yaml").write_text(yaml.safe_dump(cfg, allow_unicode=True), encoding="utf-8")
    r = TestClient(api.app).get("/agora")
    assert r.status_code == 503 and r.json()["estado"] == "sem ligação"


def test_nunca_se_le_a_rede(pasta, monkeypatch):
    ligar = socket.socket.connect

    def proibido(*a, **k):
        raise AssertionError("o painel «agora» tentou ligar-se à rede")

    def so_loopback(sock, endereco, *a, **k):
        # No Windows, o event loop (Proactor) cria um socketpair por loopback: isso não é rede.
        if isinstance(endereco, tuple) and endereco[0] in ("127.0.0.1", "::1"):
            return ligar(sock, endereco, *a, **k)
        proibido()

    monkeypatch.setattr(socket.socket, "connect", so_loopback)
    monkeypatch.setattr(socket, "create_connection", proibido)
    cliente = TestClient(api.app)
    assert cliente.get("/agora").status_code == 200
    assert cliente.post("/agora/simulador/falha").status_code == 200
    agora.estado(_simulador(), 1e-6, 60.0)


def test_o_calado_passa_a_falha_quando_o_silencio_cumpre_a_falha_inesperada():
    """Âmbar no alerta rápido; vermelho quando o silêncio já dura `falha_min` (ADR-0033, ponto 1)."""
    relogio = Relogio()
    sim = _simulador(relogio=relogio)
    relogio.t = 10.0  # quarta, 20h00
    sim.simular_falha()
    relogio.t = 40.0  # 30 min depois: sem comunicação, ainda não é falha
    rsu = next(r for r in agora.estado(sim, 1e-6, 60.0, falha_min=120.0)["rsus"] if r["id"] == RSU)
    assert rsu["calado"] and not rsu["falha"]
    relogio.t = 10.0 + 125.0  # 2 h 05 min depois
    rsu = next(r for r in agora.estado(sim, 1e-6, 60.0, falha_min=120.0)["rsus"] if r["id"] == RSU)
    assert rsu["calado"] and rsu["falha"]


def _relogio_falso(monkeypatch) -> Relogio:
    """O simulador da API com um relógio de mentira, para fazer passar o tempo real."""
    relogio = Relogio()
    original = agora.simulador_do_config
    monkeypatch.setattr(api.agora, "simulador_do_config", lambda tab, cfg: original(tab, cfg, relogio=relogio))
    return relogio


def test_api_disponivel_nao_cria_o_simulador(pasta):
    r = TestClient(api.app).get("/agora/disponivel")
    assert r.status_code == 200 and r.json()["disponivel"] and "não são dados reais" in r.json()["etiqueta"]
    assert "sim" not in api._simulador  # o relógio simulado ainda não anda


def test_api_o_relogio_so_arranca_quando_o_painel_abre(pasta, monkeypatch):
    """A app aberta há 10 min (10 h simuladas a ×60) não atrasa o alerta: abrir o painel começa às 19h50."""
    relogio = _relogio_falso(monkeypatch)
    cliente = TestClient(api.app)
    cliente.get("/agora")
    relogio.t += 600
    assert cliente.get("/agora").json()["hora_simulada"] != "19h50"
    assert cliente.post("/agora/simulador/iniciar").json()["hora_simulada"] == "19h50"
    relogio.t += 10  # 10 min simulados: quarta, 20h00
    cliente.post("/agora/simulador/falha")
    relogio.t += 13  # cerca de 13 s reais depois, a RSU0030 está sem comunicação (4 × 20/h: limite de cerca de 10 min)
    rsu = next(r for r in cliente.get("/agora").json()["rsus"] if r["id"] == RSU)
    assert rsu["calado"] and not rsu["falha"]


def test_api_repor_volta_as_19h50_com_a_mesma_semente(pasta, monkeypatch):
    relogio = _relogio_falso(monkeypatch)
    cliente = TestClient(api.app)
    a = cliente.post("/agora/simulador/iniciar").json()
    relogio.t += 30
    cliente.post("/agora/simulador/falha")
    relogio.t += 120
    b = cliente.post("/agora/simulador/repor").json()
    assert b["hora_simulada"] == "19h50" and not b["falha"]["ativa"]
    assert b["sensores"] == a["sensores"]  # a mesma semente: a mesma sequência de eventos
