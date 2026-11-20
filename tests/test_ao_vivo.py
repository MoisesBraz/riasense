"""O modo «Ao vivo» (ADR-0049): o retrato reduzido, a ligação só enquanto alguém está no modo e a API.

Sem rede nos testes: o socket.io é um cliente falso, e o retrato é **sintético**, com a forma do evento `data` (ids, posições e
deteções inventados). Nenhum dado real do socket entra no git (ADR-0030, ponto 6; ADR-0049, ponto 6).
"""

import logging
import threading
import time

import pytest
from fastapi.testclient import TestClient

import ao_vivo
import app as api
from ao_vivo import A_LIGAR, DESLIGADO, LIGADO, PERDIDA, SEM_REDE, AoVivo, Arrumo, reduzir
from ao_vivo_mapa import Plano, Segmentos


def _detecao(n, classe, lat, lon, ajustada=None, velocidade=0.0, rumo=90.0, sensor="monovideo"):
    d = {"id": n, "stationReceiverID": "e1", "latitude": lat, "longitude": lon, "classification": classe,
         "speed": velocidade, "heading": rumo, "sensor": sensor, "timestamp": 1_000_000_000_000 + n,
         "locationMatchStatus": "matched" if ajustada else "not_applicable",
         "matchedLatitude": ajustada[0] if ajustada else None, "matchedLongitude": ajustada[1] if ajustada else None}
    return d


# Um retrato inventado: 3 estações (uma com deteções de vários tipos, uma ativa sem deteções, uma inativa) e um veículo com
# OBU, que não é uma estação. As posições são de uma grelha qualquer perto de Aveiro, não de deteções reais.
RETRATO = {
    "obu1": {"id": "obu1", "stationType": "unknown", "latitude": 40.6, "longitude": -8.6, "detections": [], "speed": 1.0},
    "e1": {"id": "e1", "stationType": "roadSideUnit", "type": "smartLampPost", "active": True, "latitude": 40.64,
           "longitude": -8.65, "detections": [
               _detecao(1, "passengerCar", 40.6401, -8.6501, ajustada=(40.64012, -8.65013), velocidade=10.0),
               _detecao(2, "pedestrian", 40.6402, -8.6502, velocidade=1.2, rumo=180.0),
               _detecao(3, "bus", 40.6403, -8.6503, ajustada=(40.64031, -8.65032), velocidade=8.0),
               _detecao(4, "lightTruck", 40.6404, -8.6504, ajustada=(40.64041, -8.65042), sensor="radar"),
               _detecao(5, "cyclist", 40.6405, -8.6505, velocidade=4.0),
               _detecao(6, "moliceiro", 40.6406, -8.6506, velocidade=2.0)]},
    "e10": {"id": "e10", "stationType": "roadSideUnit", "active": False, "latitude": 40.63, "longitude": -8.64,
            "detections": []},
    "e2": {"id": "e2", "stationType": "roadSideUnit", "active": True, "latitude": 40.62, "longitude": -8.63,
           "detections": []},
}


class ClienteFalso:
    """Faz de `socketio.Client`: guarda os handlers e o connect; `emitir` faz chegar um evento do servidor."""

    def __init__(self, falha: Exception | None = None):
        self.handlers, self.falha = {}, falha
        self.ligado, self.connect_args = False, None
        self.fechos = 0

    def on(self, evento, f):
        self.handlers[evento] = f

    def connect(self, url, **kw):
        self.connect_args = (url, kw)
        if self.falha:
            raise self.falha
        self.ligado = True

    def disconnect(self):
        self.fechos += 1
        self.ligado = False

    def emitir(self, evento, *args):
        self.handlers[evento](*args)


def esperar(condicao, s=2.0):
    fim = time.monotonic() + s
    while time.monotonic() < fim:
        if condicao():
            return True
        time.sleep(0.01)
    return condicao()


def test_reduzir_fica_so_com_as_rsu_e_as_detecoes_de_agora():
    r = reduzir(RETRATO)
    assert [e["id"] for e in r["estacoes"]] == ["e1", "e2", "e10"]  # a OBU (sem `active`) não é uma estação
    e1, e2, e10 = r["estacoes"]
    assert (e1["ativa"], e2["ativa"], e10["ativa"]) == (True, True, False)
    assert e1["detecoes"] == 6 and e2["detecoes"] == 0
    assert e1["ultimo_dado"] == max(d["timestamp"] for d in RETRATO["e1"]["detections"])
    assert e2["ultimo_dado"] is None  # ativa, mas sem deteções agora
    classes = {d["classe"] for d in r["detecoes"]}
    assert {"pedestrian", "passengerCar", "bus", "lightTruck", "cyclist", "moliceiro"} <= classes
    assert set(r["detecoes"][0]) == {"id", "estacao", "lat", "lon", "classe", "sensor", "velocidade", "direcao", "ajustada"}


def test_a_posicao_e_a_ajustada_a_via_quando_existe_senao_a_medida():
    brutas = {f"e1:{d['id']}": d for d in RETRATO["e1"]["detections"]}
    for d in reduzir(RETRATO)["detecoes"]:
        b = brutas[d["id"]]
        if b["locationMatchStatus"] == "matched":
            assert (d["lat"], d["lon"]) == (b["matchedLatitude"], b["matchedLongitude"])
        else:
            assert (d["lat"], d["lon"]) == (b["latitude"], b["longitude"])


def test_reduzir_aguenta_um_retrato_estranho():
    assert reduzir({}) == {"estacoes": [], "detecoes": []}
    estranho = {"p1": {"active": True, "latitude": None, "longitude": 1}, "p2": "x",
                "p3": {"active": True, "latitude": 40.6, "longitude": -8.6, "detections": [{"latitude": None}, "x"]}}
    assert reduzir(estranho) == {
        "estacoes": [{"id": "p3", "lat": 40.6, "lon": -8.6, "ativa": True, "detecoes": 0, "ultimo_dado": None}],
        "detecoes": []}


def test_liga_por_polling_com_upgrade_e_serve_o_ultimo_retrato_reduzido():
    falso = ClienteFalso()
    lig = AoVivo(url="https://exemplo.invalid", fabrica=lambda: falso)
    assert lig.leitura()["estado"] == DESLIGADO  # nada liga antes de alguém entrar no modo
    assert falso.connect_args is None
    assert lig.ligar() == A_LIGAR
    assert esperar(lambda: lig.estado == LIGADO)
    url, kw = falso.connect_args
    assert url == "https://exemplo.invalid" and kw["transports"] == ["polling", "websocket"]  # o só-websocket falha
    assert "estacoes" not in lig.leitura()  # ligado, mas ainda sem retrato
    falso.emitir("data", RETRATO)
    corpo = lig.leitura()
    assert corpo["estado"] == LIGADO and corpo["etiqueta"] == ao_vivo.ETIQUETA
    assert [e["id"] for e in corpo["estacoes"]] == [e["id"] for e in reduzir(RETRATO)["estacoes"]] and corpo["recebido"] > 0
    assert (corpo["estacoes"][0]["veiculos"], corpo["estacoes"][0]["peoes"]) == (5, 1)  # o arrumo conta por estação (ADR-0055)
    assert all("parado" in d for d in corpo["detecoes"])
    assert lig.ligar() == LIGADO  # entrar outra vez não abre outra ligação


def test_sair_fecha_a_ligacao_e_esquece_o_retrato():
    falso = ClienteFalso()
    lig = AoVivo(fabrica=lambda: falso)
    lig.ligar()
    assert esperar(lambda: lig.estado == LIGADO)
    falso.emitir("data", RETRATO)
    assert lig.desligar() == DESLIGADO
    assert falso.fechos == 1 and not falso.ligado
    assert lig.leitura() == {"estado": DESLIGADO, "etiqueta": ao_vivo.ETIQUETA, "fonte": ao_vivo.URL}
    falso.emitir("data", RETRATO)  # um evento atrasado do cliente velho não volta a pôr dados
    assert "estacoes" not in lig.leitura()


def test_sem_rede_diz_sem_rede_e_se_a_ligacao_cai_diz_ligacao_perdida():
    lig = AoVivo(fabrica=lambda: ClienteFalso(falha=ConnectionError("sem rede")))
    lig.ligar()
    assert esperar(lambda: lig.estado == SEM_REDE)
    falso = ClienteFalso()
    lig = AoVivo(fabrica=lambda: falso)
    lig.ligar()
    assert esperar(lambda: lig.estado == LIGADO)
    falso.emitir("data", RETRATO)
    falso.emitir("disconnect")  # o servidor fechou: não se religa sozinho
    corpo = lig.leitura()
    assert corpo["estado"] == PERDIDA and "estacoes" not in corpo
    assert lig.ligar() == A_LIGAR  # voltar a entrar abre uma ligação nova


def test_sem_pedidos_da_web_durante_inativo_s_a_ligacao_fecha_se_sozinha():
    relogio = {"t": 100.0}
    falso = ClienteFalso()
    lig = AoVivo(fabrica=lambda: falso, inativo_s=30, relogio=lambda: relogio["t"])
    lig.ligar()
    assert esperar(lambda: lig.estado == LIGADO)
    relogio["t"] += 29
    falso.emitir("data", RETRATO)
    assert lig.estado == LIGADO
    relogio["t"] += 2  # 31 s sem a web pedir: o separador fechou-se
    falso.emitir("data", RETRATO)
    assert esperar(lambda: lig.estado == DESLIGADO) and falso.fechos == 1


def test_nada_vai_para_o_disco(tmp_path, monkeypatch):
    monkeypatch.chdir(tmp_path)
    falso = ClienteFalso()
    lig = AoVivo(fabrica=lambda: falso)
    lig.ligar()
    assert esperar(lambda: lig.estado == LIGADO)
    for _ in range(5):
        falso.emitir("data", RETRATO)
        lig.leitura()
    lig.desligar()
    assert list(tmp_path.iterdir()) == []


def test_o_config_tem_o_botao_e_o_ritmo_e_nada_liga_antes_do_clique(monkeypatch):
    from riasense import config

    a = config.carregar()["ao_vivo"]
    assert a["ativo"] is True and a["intervalo_s"] == 1 and a["url"] == ao_vivo.URL
    criados = []
    monkeypatch.setattr(api, "_ao_vivo", {"ligacao": AoVivo(fabrica=lambda: criados.append(1))})
    monkeypatch.setattr(ao_vivo, "ha_rede", lambda *a, **k: True)
    c = TestClient(api.app)
    assert c.get("/ao-vivo/disponivel").json()["disponivel"] is True  # perguntar se há rede não abre o socket
    assert c.get("/ao-vivo").json()["estado"] == DESLIGADO  # ler antes do clique também não
    assert criados == []


def test_com_ativo_false_o_botao_esconde_se_e_a_api_nao_liga(monkeypatch):
    from riasense import config

    original = config.carregar()
    escondido = {**original, "ao_vivo": {**original["ao_vivo"], "ativo": False}}
    monkeypatch.setattr(api.config, "carregar", lambda *a, **k: escondido)
    redes = []
    monkeypatch.setattr(api, "_ao_vivo", {})
    monkeypatch.setattr(ao_vivo, "ha_rede", lambda *a, **k: redes.append(1) or True)
    c = TestClient(api.app)
    for metodo, caminho in [("get", "/ao-vivo/disponivel"), ("post", "/ao-vivo/ligar"), ("get", "/ao-vivo")]:
        r = getattr(c, metodo)(caminho)
        assert r.status_code == 503 and r.json()["estado"] == DESLIGADO
    assert redes == [] and api._ao_vivo == {}  # nem a rede se testou, nem a ligação se criou
    assert c.post("/ao-vivo/desligar").json() == {"estado": DESLIGADO}


@pytest.fixture
def cliente(monkeypatch):
    from riasense import config

    original = config.carregar()
    ligado = {**original, "ao_vivo": {**original["ao_vivo"], "ativo": True}}
    monkeypatch.setattr(api.config, "carregar", lambda *a, **k: ligado)
    criados = []

    def fabrica():
        criados.append(ClienteFalso())
        return criados[-1]

    monkeypatch.setitem(api._ao_vivo, "ligacao", AoVivo(fabrica=fabrica))
    monkeypatch.setattr(ao_vivo, "ha_rede", lambda *a, **k: True)
    return TestClient(api.app), criados


def test_api_sem_rede_o_botao_fica_desligado_e_nao_se_liga(cliente, monkeypatch):
    c, criados = cliente
    monkeypatch.setattr(ao_vivo, "ha_rede", lambda *a, **k: False)
    assert c.get("/ao-vivo/disponivel").json() == {"disponivel": False, "estado": SEM_REDE, "intervalo_s": 1.0,
                                                    "etiqueta": ao_vivo.ETIQUETA}
    # O «sem rede» decide-se antes de ligar: o cliente do socket.io nem se cria.
    assert c.post("/ao-vivo/ligar").json()["estado"] == SEM_REDE and criados == []
    monkeypatch.setattr(ao_vivo, "ha_rede", lambda *a, **k: True)
    assert c.get("/ao-vivo/disponivel").json()["disponivel"] is True


def test_api_entra_le_e_sai(cliente):
    c, criados = cliente
    assert c.post("/ao-vivo/ligar").json()["estado"] == A_LIGAR
    falso = criados[0]
    assert esperar(lambda: c.get("/ao-vivo").json()["estado"] == LIGADO)
    falso.emitir("data", RETRATO)
    corpo = c.get("/ao-vivo").json()
    assert len(corpo["estacoes"]) == 3 and len(corpo["detecoes"]) == 6 and corpo["intervalo_s"] == 1.0
    assert c.post("/ao-vivo/desligar").json() == {"estado": DESLIGADO}
    assert not falso.ligado


def test_ha_rede_sem_servidor_diz_que_nao():
    assert ao_vivo.ha_rede("https://127.0.0.1:9", limite_s=0.5) is False


def test_o_cliente_real_nao_religa_sozinho_nem_escreve_nos_registos():
    cliente = ao_vivo._cliente_socketio()
    assert cliente.reconnection is False
    # Sem logger, o socket.io e o Engine.IO só escrevem erros (nunca os eventos nem as deteções).
    assert cliente.logger.level > logging.INFO and cliente.eio.logger.level > logging.INFO


def test_receber_e_ler_nao_escreve_nos_registos(caplog):
    caplog.set_level(logging.DEBUG)
    falso = ClienteFalso()
    lig = AoVivo(fabrica=lambda: falso)
    lig.ligar()
    assert esperar(lambda: lig.estado == LIGADO)
    falso.emitir("data", RETRATO)
    lig.leitura()
    lig.desligar()
    assert caplog.records == []


def test_uma_so_ligacao_mesmo_com_pedidos_ao_mesmo_tempo():
    criados = []

    def fabrica():
        criados.append(ClienteFalso())
        return criados[-1]

    lig = AoVivo(fabrica=fabrica)
    threads = [threading.Thread(target=lig.ligar) for _ in range(8)]
    for t in threads:
        t.start()
    for t in threads:
        t.join()
    assert esperar(lambda: lig.estado == LIGADO) and len(criados) == 1


# ── O arrumo dos retratos (ADR-0055, ponto 1) ─────────────────────────────────────────────────────────

M = 1 / 111_320  # um metro em graus de latitude (chega para estes testes, perto de Aveiro)


def _d(ident, classe="passengerCar", lat=40.64, lon=-8.65, v=0.0, rumo=0.0, estacao="e1", ajustada=False, sensor="monovideo"):
    return {"id": f"{estacao}:{ident}", "estacao": estacao, "lat": lat, "lon": lon, "classe": classe, "sensor": sensor,
            "velocidade": v, "direcao": rumo, "ajustada": ajustada}


def _retrato(*detecoes, estacoes=("e1", "e2")):
    return {"estacoes": [{"id": e, "lat": 40.64, "lon": -8.65, "ativa": True, "detecoes": 0, "ultimo_dado": None}
                         for e in estacoes], "detecoes": list(detecoes)}


def test_a_identidade_e_a_do_tracking_id_quando_existe():
    bruto = {"e1": {"id": "e1", "active": True, "latitude": 40.64, "longitude": -8.65, "detections": [
        {**_detecao(7, "passengerCar", 40.6401, -8.6501), "trackingId": "t-42"}, _detecao(8, "pedestrian", 40.6402, -8.6502)]}}
    assert [d["id"] for d in reduzir(bruto)["detecoes"]] == ["e1:t-42", "e1:8"]


def test_funde_a_mesma_classe_a_menos_de_3_m_na_mesma_estacao_e_entre_vizinhas():
    camara = _d("a", ajustada=True)
    radar = _d("b", lat=40.64 + 1 * M, sensor="radar")  # o mesmo carro, a 1 m, visto pelo radar
    vizinha = _d("c", lat=40.64 + 2 * M, estacao="e2")  # e pela estação vizinha, a 2 m
    peao = _d("p", classe="pedestrian")  # no mesmo sítio, mas outra classe: fica
    longe = _d("d", lat=40.64 + 10 * M)  # outro carro, a 10 m: fica
    r = Arrumo().aplicar(_retrato(camara, radar, vizinha, peao, longe), agora=0.0)
    assert sorted(d["id"] for d in r["detecoes"]) == ["e1:a", "e1:d", "e1:p"]  # fica a da posição ajustada à via
    assert [(e["id"], e["veiculos"], e["peoes"]) for e in r["estacoes"]] == [("e1", 2, 1), ("e2", 0, 0)]


def test_o_mesmo_sensor_da_mesma_estacao_nao_se_funde_consigo_mesmo():
    """Dois peões a 1 m vistos pela mesma câmara são dois; dois carros em vias paralelas no mesmo radar
    também. Só se funde o que é visto por sensores diferentes ou por estações diferentes (ADR-0055)."""
    peoes = [_d("p1", classe="pedestrian"), _d("p2", classe="pedestrian", lat=40.64 + 1 * M)]
    carros = [_d("c1", sensor="radar", lat=40.6402), _d("c2", sensor="radar", lat=40.6402 + 2.5 * M)]
    r = Arrumo().aplicar(_retrato(*peoes, *carros), 0.0)
    assert sorted(d["id"] for d in r["detecoes"]) == ["e1:c1", "e1:c2", "e1:p1", "e1:p2"]
    assert [(e["id"], e["veiculos"], e["peoes"]) for e in r["estacoes"]] == [("e1", 2, 2), ("e2", 0, 0)]
    # O mesmo peão, visto também pela estação vizinha, conta uma vez.
    r = Arrumo().aplicar(_retrato(*peoes, _d("p9", classe="pedestrian", estacao="e2", lat=40.64 + 0.5 * M)), 0.0)
    assert sorted(d["id"] for d in r["detecoes"]) == ["e1:p1", "e1:p2"]


def test_entre_retratos_fica_a_mesma_detecao_para_a_identidade_nao_saltar():
    arrumo = Arrumo()
    so_radar = _d("b", sensor="radar")
    assert [d["id"] for d in arrumo.aplicar(_retrato(so_radar), 0.0)["detecoes"]] == ["e1:b"]
    # A câmara apanha-o depois, com a posição ajustada: continua a ser o «b», que já estava no mapa.
    r = arrumo.aplicar(_retrato(_d("a", ajustada=True, lat=40.64 + 0.5 * M), so_radar), 1.0)
    assert [d["id"] for d in r["detecoes"]] == ["e1:b"]


def test_parado_so_depois_de_30_s_lento_e_com_o_ultimo_rumo_a_andar():
    arrumo = Arrumo(parado_ms=0.3, parado_s=30)
    r0 = arrumo.aplicar(_retrato(_d("a", v=8.0, rumo=90.0)), 0.0)["detecoes"][0]
    assert (r0["parado"], r0["direcao"]) == (False, 90.0)
    r1 = arrumo.aplicar(_retrato(_d("a", v=0.1, rumo=0.0)), 5.0)["detecoes"][0]  # pára: o socket manda o heading a 0
    assert (r1["parado"], r1["direcao"]) == (False, 90.0)  # lento há 0 s: ainda não está parado; o rumo é o de andar
    r2 = arrumo.aplicar(_retrato(_d("a", v=0.0, rumo=0.0)), 36.0)["detecoes"][0]
    assert (r2["parado"], r2["direcao"]) == (True, 90.0)
    r3 = arrumo.aplicar(_retrato(_d("a", v=5.0, rumo=180.0)), 37.0)["detecoes"][0]  # volta a andar
    assert (r3["parado"], r3["direcao"]) == (False, 180.0)
    peao = arrumo.aplicar(_retrato(_d("p", classe="pedestrian", v=0.0)), 100.0)["detecoes"][0]
    assert peao["parado"] is False  # os peões não «estacionam»


def test_um_parado_sem_rumo_conhecido_toma_o_do_segmento_mais_proximo():
    plano = Plano(40.64)
    # Um segmento de oeste para leste (rumo 90°), a passar em 40.64.
    segmentos = Segmentos([{"type": "Feature", "properties": {"id": "s1"},
                            "geometry": {"type": "LineString", "coordinates": [[-8.651, 40.64], [-8.649, 40.64]]}}], plano)
    arrumo = Arrumo(segmentos=segmentos, rumo_m=15)
    perto = arrumo.aplicar(_retrato(_d("a", lat=40.64 + 4 * M)), 0.0)["detecoes"][0]
    assert perto["direcao"] == pytest.approx(90.0)
    longe = Arrumo(segmentos=segmentos, rumo_m=15).aplicar(_retrato(_d("b", lat=40.64 + 40 * M)), 0.0)["detecoes"][0]
    assert longe["direcao"] == 0.0  # sem segmento a menos de 15 m, fica o do socket


def test_o_segmento_mais_proximo_mede_a_distancia_a_linha_e_da_o_rumo():
    plano = Plano(40.64)
    norte_sul = {"type": "Feature", "properties": {"id": "ns"},
                 "geometry": {"type": "LineString", "coordinates": [[-8.65, 40.639], [-8.65, 40.641]]}}
    segmentos = Segmentos([norte_sul], plano, celula_m=50)
    ident, dist, rumo = segmentos.mais_proximo(-8.65 + 5 * M / 0.7604, 40.64, max_m=10)
    assert ident == "ns" and dist == pytest.approx(5, abs=0.1) and rumo == pytest.approx(0.0)
    assert segmentos.mais_proximo(-8.65 + 30 * M / 0.7604, 40.64, max_m=10) is None


def test_a_memoria_do_arrumo_esquece_quem_saiu_e_cada_ligacao_comeca_vazia():
    arrumo = Arrumo(esquecer_s=60)
    arrumo.aplicar(_retrato(_d("a", v=8.0, rumo=45.0)), 0.0)
    arrumo.aplicar(_retrato(), 100.0)  # o «a» saiu há 100 s
    assert arrumo.aplicar(_retrato(_d("a", v=0.0, rumo=0.0)), 101.0)["detecoes"][0]["direcao"] == 0.0
    falso = ClienteFalso()
    lig = AoVivo(fabrica=lambda: falso)
    primeiro = lig._arrumo
    lig.ligar()
    assert lig._arrumo is not primeiro
