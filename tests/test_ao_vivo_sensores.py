"""O «Ao vivo» ligado aos sensores do dataset (ADR-0055, pontos 2, 5 e 6): a ligação pela posição, a janela móvel, o esperado
pelo perfil da semana e o risco potencial ao vivo.

Tudo sintético: as passadeiras, os segmentos, os perfis e as deteções são inventados (nenhum dado real do socket entra no git).
"""

import socket
from datetime import datetime

import pytest

import ao_vivo
from ao_vivo import Arrumo
from ao_vivo_mapa import Plano, Segmentos
from ao_vivo_sensores import LISBOA, Janela, Passadeiras, Perfis, Sensores

M = 1 / 111_320  # um metro em graus de latitude
LAT, LON = 40.64, -8.65
KX = 0.7604  # cos(40,64°): um metro em graus de longitude é M / KX
PLANO = Plano(LAT)

# Uma passadeira de 4 × 4 m centrada em (LON, LAT), e um segmento de oeste para leste 20 m a sul dela.
PASSADEIRA = {"type": "Feature", "properties": {"id": "pa"}, "geometry": {"type": "Polygon", "coordinates": [[
    [LON - 2 * M / KX, LAT - 2 * M], [LON + 2 * M / KX, LAT - 2 * M], [LON + 2 * M / KX, LAT + 2 * M],
    [LON - 2 * M / KX, LAT + 2 * M], [LON - 2 * M / KX, LAT - 2 * M]]]}}
SEGMENTO = {"type": "Feature", "properties": {"id": "sg"},
            "geometry": {"type": "LineString", "coordinates": [[LON - 100 * M / KX, LAT - 20 * M], [LON + 100 * M / KX, LAT - 20 * M]]}}


def _perfis(**kw):
    base = {("pa", True, 11): 40.0, ("pa", True, 13): 55.0, ("sg", True, 11): 999.0}  # o 999 do `agora_base` não conta nos segmentos
    segmentos = {("sg", True, 11): 300.0, ("sg", True, 13): 250.0}  # a mediana do `segmentos_hora`
    return Perfis(tipos={"pa": "passadeira", "sg": "segmento"}, base=base, limites={"sg": 50.0}, base_segmentos=segmentos,
                  exposicoes=sorted([0.0, 10.0, 10.0, 20.0, 40.0, 80.0]), comportamento={"pa": 0.4}, **kw)


def _d(ident, classe="passengerCar", dlat=0.0, dlon=0.0, v=0.0):
    return {"id": ident, "estacao": "e1", "lat": LAT + dlat * M, "lon": LON + dlon * M / KX, "classe": classe,
            "sensor": "monovideo", "velocidade": v, "direcao": 90.0, "ajustada": True, "parado": False}


# Segunda-feira, 10h de Lisboa: daqui a 1 h são 11h, daqui a 3 h são 13h (dia útil).
SEGUNDA_10H = datetime(2026, 11, 23, 10, 0, tzinfo=LISBOA)


def _sensores(**kw):
    return Sensores(_perfis(), segmentos=Segmentos([SEGMENTO], PLANO), passadeiras=Passadeiras([PASSADEIRA], PLANO),
                    passadeira_m=5, segmento_m=8, janela=Janela(janela_s=900, minima_s=60), relogio_real=lambda: SEGUNDA_10H, **kw)


def test_um_peao_conta_dentro_do_poligono_ou_a_poucos_metros():
    p = Passadeiras([PASSADEIRA], PLANO)
    assert p.de(LON, LAT, max_m=5) == "pa"  # dentro
    assert p.de(LON, LAT + 5 * M, max_m=5) == "pa"  # 3 m fora da borda
    assert p.de(LON, LAT + 10 * M, max_m=5) is None  # 8 m fora


def test_a_janela_conta_ids_distintos_e_passa_a_por_hora_so_com_janela_bastante():
    j = Janela(janela_s=900, minima_s=60)
    j.registar("pa", "a", 0.0)
    j.registar("pa", "a", 10.0)  # o mesmo peão outra vez: conta uma vez
    assert j.contagens(30.0)["pa"] == {"n": 1, "minutos": 0.5, "por_hora": None}  # 30 s de janela: ainda sem número
    j.registar("pa", "b", 100.0)
    assert j.contagens(120.0)["pa"]["por_hora"] == pytest.approx(2 * 3600 / 120)
    # Ao fim de 1000 s, a janela é de 15 min: o «a» (visto aos 10 s) saiu; fica o «b», 1 em 15 min = 4 por hora.
    assert j.contagens(1000.0)["pa"] == {"n": 1, "minutos": 15.0, "por_hora": pytest.approx(4.0)}


def test_o_esperado_e_o_perfil_da_semana_por_dia_util_e_hora_de_lisboa():
    p = _perfis()
    # Nos segmentos, a mediana do `segmentos_hora` (ADR-0055), e não o `agora_base`.
    assert p.esperado("sg", datetime(2026, 11, 23, 11, 0, tzinfo=LISBOA)) == 300.0
    assert p.esperado("pa", datetime(2026, 11, 23, 11, 30, tzinfo=LISBOA)) == 40.0
    assert p.esperado("pa", datetime(2026, 11, 23, 12, 0, tzinfo=LISBOA)) is None  # sem perfil a essa hora
    assert p.esperado("pa", datetime(2026, 11, 22, 11, 0, tzinfo=LISBOA)) is None  # domingo: o perfil do fim de semana


def test_o_percentil_da_exposicao_e_o_da_semana_com_a_media_dos_empates():
    p = _perfis()  # 0, 10, 10, 20, 40, 80
    assert p.percentil_exposicao(10.0) == pytest.approx(2.5 / 6)  # como o `rank(pct=True, method="average")`
    assert p.percentil_exposicao(15.0) == pytest.approx(3.5 / 6)
    assert p.percentil_exposicao(1000.0) == 1.0


def test_o_risco_ao_vivo_e_a_regra_do_adr_0013_com_a_exposicao_de_agora_e_o_comportamento_da_semana():
    p = _perfis(peso_exposicao=0.4, peso_comportamento=0.4)  # sem previsão: 0,5 / 0,5
    r = p.risco("pa", 15.0)
    assert r["valor"] == pytest.approx(0.5 * 3.5 / 6 + 0.5 * 0.4) and r["semaforo"] is False
    p.comportamento["pa"] = None  # com semáforo, só a exposição (ADR-0024)
    assert p.risco("pa", 15.0)["valor"] == pytest.approx(3.5 / 6)
    assert p.risco("pa", None) is None  # sem janela bastante, sem risco


def test_liga_os_peoes_as_passadeiras_e_os_veiculos_aos_segmentos_e_o_anel_e_da_mediana_de_agora():
    s = _sensores()
    detecoes = [_d("p1", "pedestrian"), _d("c1", dlat=-19, v=60 / 3.6), _d("c2", dlat=-21, v=70 / 3.6),
                _d("c3", dlat=-20, v=0.0), _d("longe", dlat=-60, v=20.0)]
    ligadas, _ = s.aplicar(detecoes, 0.0)
    por_id = {d["id"]: d for d in ligadas}
    assert por_id["p1"]["liga"] == "pa" and por_id["c1"]["liga"] == "sg" and por_id["longe"]["liga"] is None
    # A mediana dos que circulam (60 e 70 km/h; o parado não conta) passa os 50 km/h: o anel vai nos veículos desse segmento.
    assert [por_id[i]["acima"] for i in ("c1", "c2", "c3", "p1", "longe")] == [True, True, True, False, False]


def test_o_resumo_por_sensor_diz_o_agora_por_hora_o_esperado_e_o_risco():
    s = _sensores()
    s.aplicar([_d("p1", "pedestrian", v=1.2), _d("c1", dlat=-20, v=10.0)], 0.0)
    _, resumo = s.aplicar([_d("p2", "pedestrian", dlon=1.5, v=1.2), _d("c1", dlat=-20, v=10.0)], 30.0)  # outro peão, que chegou
    pa = next(x for x in resumo if x["id"] == "pa")
    assert (pa["n"], pa["por_hora"], pa["risco"]) == (2, None, None)  # 30 s de janela: ainda sem número nem risco
    _, resumo = s.aplicar([], 120.0)
    pa = next(x for x in resumo if x["id"] == "pa")
    sg = next(x for x in resumo if x["id"] == "sg")
    assert pa["por_hora"] == pytest.approx(2 * 3600 / 120)  # 60 travessias por hora
    assert (pa["esperado_1h"], pa["esperado_3h"]) == (40.0, 55.0)
    assert pa["risco"]["valor"] == pytest.approx(0.5 * (5.5 / 6) + 0.5 * 0.4)  # 60/h fica entre 40 e 80: percentil 5,5/6
    assert (sg["n"], sg["esperado_1h"], sg["limite_kmh"], sg["radar"]) == (1, 300.0, 50.0, False)


def test_a_velocidade_de_agora_nao_entra_no_risco():
    """O risco ao vivo usa o comportamento da semana; a velocidade de agora fica no anel (ADR-0055)."""
    lentos, rapidos = _sensores(), _sensores()
    for s, v in ((lentos, 5.0), (rapidos, 40.0)):
        s.aplicar([_d("p1", "pedestrian", v=1.2), _d("c1", dlat=-20, v=v)], 0.0)
    risco = [next(x for x in s.aplicar([], 120.0)[1] if x["id"] == "pa")["risco"] for s in (lentos, rapidos)]
    assert risco[0] == risco[1]


def test_o_arrumo_junta_o_resumo_dos_sensores_a_leitura():
    arrumo = Arrumo(sensores=_sensores())
    r = arrumo.aplicar({"estacoes": [], "detecoes": [_d("e1:p1", "pedestrian")]}, 0.0)
    assert {x["id"] for x in r["sensores"]} == {"pa", "sg"}
    assert r["detecoes"][0]["liga"] == "pa"
    assert "sensores" not in Arrumo().aplicar({"estacoes": [], "detecoes": []}, 0.0)  # sem perfis, o resto continua


def test_o_sem_rede_so_depois_de_3_tentativas(monkeypatch):
    chamadas = []

    class Ligacao:
        def __enter__(self):
            return self

        def __exit__(self, *a):
            return False

    def ligar(alvo, timeout):
        chamadas.append(timeout)
        if len(chamadas) < 3:
            raise TimeoutError("timed out")
        return Ligacao()

    monkeypatch.setattr(socket, "create_connection", ligar)
    assert ao_vivo.ha_rede("https://exemplo.invalid", limite_s=2.0) is True  # à 3.ª, liga
    assert chamadas == [2.0, 2.0, 2.0]
    chamadas.clear()
    monkeypatch.setattr(socket, "create_connection", lambda *a, **k: (_ for _ in ()).throw(OSError("sem rede")))
    assert ao_vivo.ha_rede("https://exemplo.invalid", tentativas=3) is False


def test_so_contam_os_que_andam():
    s = _sensores()
    s.aplicar([_d("p1", "pedestrian", v=0.0), _d("c1", dlat=-20, v=0.0), _d("c2", dlat=-20, dlon=10, v=8.0)], 0.0)
    _, resumo = s.aplicar([], 120.0)
    por_id = {x["id"]: x for x in resumo}
    assert (por_id["pa"]["n"], por_id["sg"]["n"]) == (0, 1)  # o peão parado e o carro estacionado não passam


def test_a_costura_junta_o_id_novo_que_continua_um_que_sumiu():
    """O Living Lab troca o id do mesmo objeto a meio: um id novo onde um acabou de sumir é o mesmo, e não conta outra vez."""
    s = _sensores(costura_s=20, costura_m=8)
    s.aplicar([_d("c1", dlat=-20, v=14.0)], 0.0)  # a 50 km/h
    s.aplicar([_d("c9", classe="lightTruck", dlat=-20, dlon=25, v=14.0)], 2.0)  # 2 s depois, 25 m à frente, outra classe
    s.aplicar([_d("c5", dlat=-20, dlon=-60, v=14.0)], 3.0)  # um carro novo, longe: conta
    _, resumo = s.aplicar([], 130.0)
    assert next(x for x in resumo if x["id"] == "sg")["n"] == 2
    sem_costura = _sensores(costura_s=0)
    for t, d in ((0.0, _d("c1", dlat=-20, v=14.0)), (2.0, _d("c9", dlat=-20, dlon=25, v=14.0))):
        sem_costura.aplicar([d], t)
    assert next(x for x in sem_costura.aplicar([], 130.0)[1] if x["id"] == "sg")["n"] == 2


def test_sem_dados_nao_e_zero_um_sensor_que_nenhuma_fonte_viva_ve_fica_sem_numero_nem_risco():
    """Sem dados não é zero (ADR-0007): só tem «por hora» e degrau o sensor que uma fonte viva vê."""
    s = _sensores(calada_s=60)
    s.aplicar([_d("c1", dlat=-20, v=10.0)], 0.0)  # a câmara vê o segmento, e nunca viu a passadeira
    _, resumo = s.aplicar([_d("c1", dlat=-20, dlon=5, v=10.0)], 60.0)
    por_id = {x["id"]: x for x in resumo}
    assert (por_id["pa"]["coberto"], por_id["pa"]["por_hora"], por_id["pa"]["risco"]) == (False, None, None)
    assert (por_id["sg"]["coberto"], por_id["sg"]["minima_min"]) == (True, 1.0)
    # Um carro em cima da passadeira mostra que a câmara a vê: daí em diante, 0 travessias é 0 por hora.
    _, resumo = s.aplicar([_d("c2", v=5.0)], 70.0)
    pa = next(x for x in resumo if x["id"] == "pa")
    assert (pa["coberto"], pa["n"], pa["por_hora"]) == (True, 0, 0.0)
    assert pa["risco"] is not None
    # A fonte deixa de comunicar: passados `calada_s`, os sensores que só ela via voltam a ficar sem dados.
    _, resumo = s.aplicar([_d("x1", dlat=500, v=5.0) | {"estacao": "e2"}], 131.0)
    por_id = {x["id"]: x for x in resumo}
    assert [por_id[i]["coberto"] for i in ("pa", "sg")] == [False, False]
    assert (por_id["sg"]["por_hora"], por_id["sg"]["velocidade_kmh"], por_id["pa"]["risco"]) == (None, None, None)
