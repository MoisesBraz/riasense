"""Falhas inesperadas e classificação rede/dispositivo, com séries sintéticas pequenas.

Cenário: 5 dias (02 a 06/11) em que todos os sensores têm 1 evento a cada 5 min das 7h00 às 21h55 (12 por hora)
e ficam sem eventos à noite (sossego normal). Em cima disso há falhas conhecidas:

- SC0001 e SC0002 (RSU0001) deixam de comunicar a 04/11 às 9h55 e às 10h00 até às 16h00: falha de rede;
- SC0003 (RSU0001) deixa de comunicar a 05/11 das 8h55 às 13h00, com SC0001 e SC0002 a funcionar: falha de dispositivo;
- o estacionamento da RSU0002 deixa de comunicar a 06/11 às 11h55 e não volta até ao fim dos dados: dispositivo, em curso;
- o segmento 1 (RSU0002) só tem 4 eventos por hora: um silêncio de 10 h a meio do dia não é falha.
"""

import copy
import os
from pathlib import Path

import duckdb
import pandas as pd
import pytest
import yaml

from riasense import config, ids, ingerir, sensores, vigiar
from riasense.__main__ import main

RSU_A, RSU_B = "urn:ngsi-ld:RoadSideUnit:0001", "urn:ngsi-ld:RoadSideUnit:0002"
SC = "urn:ngsi-ld:SmartCrosswalk:{:04d}"
ZONA, SEGMENTO = "urn:ngsi-ld:TouristZone:0001", "urn:ngsi-ld:RoadSegment:1"
DIAS = pd.date_range("2026-11-02", "2026-11-06", freq="D")
T = pd.Timestamp


def _serie(passo_min: int = 5, calado: list[tuple[str, str]] = ()) -> list[pd.Timestamp]:
    """Eventos de `passo_min` em `passo_min` minutos das 7h00 às 21h59 de cada dia, menos os intervalos `calado`."""
    eventos = []
    for dia in DIAS:
        eventos += list(pd.date_range(dia + pd.Timedelta(hours=7), dia + pd.Timedelta(hours=21, minutes=59), freq=f"{passo_min}min"))
    return [t for t in eventos if not any(T(a) <= t < T(b) for a, b in calado)]


def _parquet(caminho: Path, colunas: dict[str, str], valores: list[tuple]) -> None:
    con = duckdb.connect()
    con.execute(f"create table t ({', '.join(f'{c} {tipo}' for c, tipo in colunas.items())})")
    if valores:
        con.executemany(f"insert into t values ({', '.join(['?'] * len(colunas))})", valores)
    con.table("t").write_parquet(str(caminho))
    con.close()


@pytest.fixture
def cfg():
    cfg = copy.deepcopy(config.carregar())
    cfg["periodo_dados"] = {"inicio": "2026-11-02T00:00", "fim": "2026-11-07T00:00"}
    return cfg


@pytest.fixture
def pastas(tmp_path):
    """Escreve o cenário sintético em data/interim e data/processed/sensores.parquet."""
    interim, processed = tmp_path / "interim", tmp_path / "processed"
    interim.mkdir()
    processed.mkdir()
    passadeiras = {
        SC.format(1): _serie(calado=[("2026-11-04 10:00", "2026-11-04 16:00")]),
        SC.format(2): _serie(calado=[("2026-11-04 10:05", "2026-11-04 16:00")]),
        SC.format(3): _serie(calado=[("2026-11-05 09:00", "2026-11-05 13:00")]),
    }
    _parquet(interim / "passadeiras.parquet", {"id": "varchar", "t": "timestamp"},
             [(i, t) for i, serie in passadeiras.items() for t in serie])
    _parquet(interim / "visitas.parquet", {"zona": "varchar", "t": "timestamp"}, [(ZONA, t) for t in _serie()])
    _parquet(interim / "estacionamento.parquet", {"rsu": "varchar", "t": "timestamp"},
             [(RSU_B, t) for t in _serie(calado=[("2026-11-06 12:00", "2026-11-07 00:00")])] + [(None, T("2026-11-02 12:00"))])
    _parquet(interim / "segmentos.parquet", {"id": "varchar", "t": "timestamp"},
             [(SEGMENTO, t) for t in _serie(passo_min=15, calado=[("2026-11-03 08:00", "2026-11-03 18:00")])])
    tabela = [(SC.format(i), "passadeira", RSU_A, [RSU_A]) for i in (1, 2, 3)]
    tabela += [(RSU_B, "estacionamento", RSU_B, [RSU_B]), (ZONA, "zona", RSU_B, [RSU_B]), (SEGMENTO, "segmento", RSU_B, [RSU_B])]
    colunas = {"id": "varchar", "tipo": "varchar", "rsu": "varchar", "rsus": "varchar[]"}
    _parquet(processed / "sensores.parquet", colunas, tabela)
    return interim, processed


def _falhas(pastas, cfg) -> pd.DataFrame:
    interim, processed = pastas
    return vigiar.calcular(interim, processed / "sensores.parquet", processed, cfg).set_index("sensor")


def test_falha_simultanea_na_mesma_rsu_e_de_rede(pastas, cfg):
    f = _falhas(pastas, cfg)
    rede = f.loc[[SC.format(1), SC.format(2)]]
    assert list(rede["tipo"]) == ["rede", "rede"]
    assert list(rede["rsu"]) == [RSU_A, RSU_A]
    assert rede["grupo"].nunique() == 1
    assert list(rede["inicio"]) == [T("2026-11-04 09:55"), T("2026-11-04 10:00")]


def test_falha_isolada_com_a_rsu_a_funcionar_e_de_dispositivo(pastas, cfg):
    f = _falhas(pastas, cfg)
    assert f.loc[SC.format(3), "tipo"] == "dispositivo"
    assert (f.loc[SC.format(3), "inicio"], f.loc[SC.format(3), "fim"]) == (T("2026-11-05 08:55"), T("2026-11-05 13:00"))


def test_sossego_noturno_e_pouca_atividade_nao_sao_falhas(pastas, cfg):
    # As noites (21h55 → 7h00) e o segmento com 4 eventos por hora não podem aparecer: só ficam as 4 falhas do cenário.
    f = _falhas(pastas, cfg)
    assert sorted(f.index) == sorted([SC.format(1), SC.format(2), SC.format(3), RSU_B])
    assert (f["horas_inesperadas"] >= cfg["vigiar"]["falha_min_horas"]).all()


def test_falha_ate_ao_fim_dos_dados_fica_em_curso(pastas, cfg):
    pk = _falhas(pastas, cfg).loc[RSU_B]
    assert pk["em_curso"]
    assert pk["fim"] == T(cfg["periodo_dados"]["fim"])
    assert pk["tipo"] == "dispositivo"
    # Das 11h55 às 22h00 esperava-se atividade (10,08 h); as 2 horas da noite seguinte são sossego.
    assert pk["horas_inesperadas"] == pytest.approx(10.08, abs=0.01)
    assert pk["eventos_esperados"] == pytest.approx(121, abs=1)


def test_saida_em_parquet_tem_o_necessario_para_um_alerta_ngsi_ld(pastas, cfg):
    _falhas(pastas, cfg)
    caminho = pastas[1] / "falhas.parquet"
    rel = duckdb.sql("select * from read_parquet($p)", params={"p": str(caminho)})
    assert rel.columns == vigiar.COLUNAS
    tipos = dict(zip(rel.columns, map(str, rel.types)))
    assert (tipos["inicio"], tipos["fim"]) == ("TIMESTAMP", "TIMESTAMP")
    sensores_saida = duckdb.sql("select sensor from read_parquet($p)", params={"p": str(caminho)}).fetchall()
    assert all(s.startswith(ids.PREFIXO) for (s,) in sensores_saida)
    assert caminho.stat().st_size < 5 * 1024 * 1024


def test_sensor_que_falha_de_madrugada_so_conta_as_horas_com_atividade(cfg):
    # Sem dados das 2h às 9h: só 7h–9h são horas com atividade, ou seja, 2 h, e isso já chega para ser falha.
    contagens = pd.DataFrame(
        [(SC.format(1), dia + pd.Timedelta(hours=h), 12) for dia in DIAS for h in range(7, 22) if not (dia == DIAS[2] and h < 9)],
        columns=["sensor", "hora", "n"],
    )
    g = vigiar.grelha(contagens, T(cfg["periodo_dados"]["inicio"]), T(cfg["periodo_dados"]["fim"]))
    horas, eventos, _ = vigiar.avaliar(g.de(SC.format(1)), g, T("2026-11-04 02:00"), T("2026-11-04 09:00"), 10)
    assert (horas, eventos) == (pytest.approx(2.0), pytest.approx(24.0))


def test_horas_da_propria_falha_nao_baixam_o_esperado(cfg):
    # Uma falha de 3 dias: os dias sem dados não entram na mediana, senão a falha diluía-se em sossego.
    contagens = pd.DataFrame(
        [(SC.format(1), dia + pd.Timedelta(hours=h), 12) for dia in DIAS[:2] for h in range(7, 22)],
        columns=["sensor", "hora", "n"],
    )
    g = vigiar.grelha(contagens, T(cfg["periodo_dados"]["inicio"]), T(cfg["periodo_dados"]["fim"]))
    horas, _, _ = vigiar.avaliar(g.de(SC.format(1)), g, T("2026-11-04 00:00"), T("2026-11-07 00:00"), 10)
    assert horas == pytest.approx(3 * 15)


def test_rajada_numa_so_noite_nao_faz_das_outras_noites_falhas(cfg):
    # Como o estacionamento da RSU0022: 200 eventos por hora numa só madrugada. Com a média, as outras pareciam falhas.
    contagens = [(SC.format(1), dia + pd.Timedelta(hours=h), 12) for dia in DIAS for h in range(7, 22)]
    contagens += [(SC.format(1), DIAS[0] + pd.Timedelta(hours=h), 200) for h in range(1, 5)]
    g = vigiar.grelha(pd.DataFrame(contagens, columns=["sensor", "hora", "n"]), T(cfg["periodo_dados"]["inicio"]), T(cfg["periodo_dados"]["fim"]))
    horas, _, _ = vigiar.avaliar(g.de(SC.format(1)), g, T("2026-11-05 00:00"), T("2026-11-05 07:00"), 10)
    assert horas == 0


def _avaliar_silencios(cfg, contagens: list[tuple], silencios: list[tuple[str, str, str]], **regras) -> pd.DataFrame:
    """falhas_inesperadas sobre uma grelha sintética, com as regras do config e as alteradas em `regras`."""
    g = vigiar.grelha(pd.DataFrame(contagens, columns=["sensor", "hora", "n"]),
                      T(cfg["periodo_dados"]["inicio"]), T(cfg["periodo_dados"]["fim"]))
    sil = pd.DataFrame([(s, T(a), T(b)) for s, a, b in silencios], columns=["sensor", "inicio", "fim"])
    return vigiar.falhas_inesperadas(sil, g, cfg["vigiar"] | regras)


def test_base_circular_os_outros_silencios_longos_nao_baixam_o_esperado(cfg):
    # Como o segmento 10368 da RSU0030 (ADR-0025): sem dados em 2 de 5 dias e, a 06/11, mais 3 h a meio do dia.
    # Com os dias sem dados na mediana, as 10h–12h esperavam 6 eventos (< 10) e o silêncio curto parecia sossego.
    sensor = SC.format(1)
    calado = {DIAS[1], DIAS[3]}
    contagens = [(sensor, dia + pd.Timedelta(hours=h), 12) for dia in DIAS for h in range(7, 22)
                 if dia not in calado and not (dia == DIAS[4] and 10 <= h < 13)]
    silencios = [(sensor, "2026-11-02 22:00", "2026-11-04 07:00"), (sensor, "2026-11-04 22:00", "2026-11-06 07:00"),
                 (sensor, "2026-11-06 10:00", "2026-11-06 13:00")]
    curto = T("2026-11-06 10:00")
    falhas = _avaliar_silencios(cfg, contagens, silencios)
    assert curto in set(falhas["inicio"]) and len(falhas) == 3
    assert falhas.set_index("inicio").loc[curto, "horas_inesperadas"] == pytest.approx(3)
    # Sem a regra (nenhum silêncio conta como longo), o silêncio curto perde-se.
    assert curto not in set(_avaliar_silencios(cfg, contagens, silencios, silencio_longo_h=10_000)["inicio"])


def test_sensor_morto_de_pouco_movimento_e_falha_pelo_total_esperado(cfg):
    # Como os segmentos 10576, 11163, 11164 e 10364 da RSU0030 (ADR-0025): 4 eventos/h (nunca 10 numa hora) e
    # sem dados de 04/11 até ao fim dos dados. Esperavam-se 3 dias × 15 h × 4 = 180 eventos: P(0) ≈ 0.
    morto, raro = SC.format(1), SC.format(2)
    contagens = [(morto, dia + pd.Timedelta(hours=h), 4) for dia in DIAS[:2] for h in range(7, 22)]
    # Um sensor raro (1 evento/h só das 7h às 9h) sem dados 2 dias: esperavam-se 6 eventos (< 20), não é falha.
    contagens += [(raro, dia + pd.Timedelta(hours=h), 1) for dia in DIAS[:3] for h in range(7, 10)]
    silencios = [(morto, "2026-11-03 22:00", "2026-11-07 00:00"), (raro, "2026-11-04 10:00", "2026-11-07 00:00"),
                 (morto, "2026-11-02 10:00", "2026-11-02 20:00")]  # silêncio curto de 10 h: continua sossego
    falhas = _avaliar_silencios(cfg, contagens, silencios)
    assert falhas[["sensor", "inicio"]].values.tolist() == [[morto, T("2026-11-03 22:00")]]
    assert falhas["horas_inesperadas"].iloc[0] == 0  # nenhuma hora chega aos 10: só a 2.ª regra a apanha
    assert falhas["eventos_esperados"].iloc[0] == pytest.approx(180)
    assert _avaliar_silencios(cfg, contagens, silencios, total_esperado_min=181).empty


def _classificar(linhas: list[tuple[str, str]], rsus: dict[str, list[str]]) -> pd.DataFrame:
    falhas = pd.DataFrame([(s, T(t)) for s, t in linhas], columns=["sensor", "inicio"])
    return vigiar.classificar(falhas, rsus, agrupar_min=15)


def test_mesma_hora_em_rsus_diferentes_nao_e_rede():
    f = _classificar([("a", "2026-11-04 10:00"), ("b", "2026-11-04 10:00")], {"a": [RSU_A], "b": [RSU_B]})
    assert list(f["tipo"]) == ["dispositivo", "dispositivo"]
    assert f["grupo"].nunique() == 2


def test_grupo_de_rede_conta_a_partir_da_primeira_falha_e_nao_em_cadeia():
    linhas = [("a", "2026-11-04 10:00"), ("b", "2026-11-04 10:10"), ("c", "2026-11-04 10:20")]
    f = _classificar(linhas, {s: [RSU_A] for s in "abc"})
    assert list(f["tipo"]) == ["rede", "rede", "dispositivo"]


def test_segmento_com_duas_rsu_agrupa_com_qualquer_delas():
    f = _classificar([("seg", "2026-11-04 10:00"), ("pk", "2026-11-04 10:05")], {"seg": [RSU_A, RSU_B], "pk": [RSU_B]})
    assert list(f["tipo"]) == ["rede", "rede"]
    assert list(f["rsu"]) == [RSU_B, RSU_B]


def test_sensor_sem_rsu_so_pode_dar_dispositivo():
    f = _classificar([("a", "2026-11-04 10:00"), ("b", "2026-11-04 10:00")], {"a": [], "b": []})
    assert list(f["tipo"]) == ["dispositivo", "dispositivo"]
    assert f["rsu"].isna().all()


def test_sem_falhas_escreve_parquet_vazio_com_as_colunas(pastas, cfg):
    cfg["vigiar"]["esperado_min_eventos_hora"] = 1000  # nenhuma hora chega a ter atividade
    assert _falhas(pastas, cfg).empty
    rel = duckdb.sql("select * from read_parquet($p)", params={"p": str(pastas[1] / "falhas.parquet")})
    assert rel.columns == vigiar.COLUNAS


def test_sensores_parquet_em_falta_da_erro_claro(pastas, cfg):
    interim, processed = pastas
    with pytest.raises(FileNotFoundError, match="riasense sensores"):
        vigiar.calcular(interim, processed / "nao-existe.parquet", processed, cfg)


def test_subcomando_vigiar_escreve_falhas_em_processed(pastas, cfg, tmp_path, monkeypatch, capsys):
    interim, processed = pastas
    ficheiro = tmp_path / "riasense.yaml"
    ficheiro.write_text(yaml.safe_dump(cfg, allow_unicode=True), encoding="utf-8")
    monkeypatch.setenv("RIASENSE_CONFIG", str(ficheiro))
    monkeypatch.setenv("RIASENSE_DATA_INTERIM", str(interim))
    monkeypatch.setenv("RIASENSE_DATA_PROCESSED", str(processed))
    assert main(["vigiar"]) == 0
    assert "falhas inesperadas: 4 (rede: 2, dispositivo: 2; grupos de rede: 1)" in capsys.readouterr().out
    assert (processed / "falhas.parquet").is_file()


# Um instante a meio de silêncios noturnos das passadeiras que o estudo de viabilidade deu como sossego (out_C_gaps.csv).
NOITES_CALMAS = [
    ("SmartCrosswalk:0020", "2026-11-04 03:00"),  # sem dados das 23h09 às 5h49
    ("SmartCrosswalk:0019", "2026-11-04 04:30"),  # das 3h22 às 6h36
    ("SmartCrosswalk:0021", "2026-11-04 02:30"),  # das 0h35 às 4h54
    ("SmartCrosswalk:0022", "2026-11-04 04:00"),  # das 2h55 às 5h32
    ("SmartCrosswalk:0003", "2026-11-06 03:00"),  # das 22h17 de 05/11 às 7h08
]


@pytest.mark.integration
def test_dados_reais_rsu0030_e_falha_de_rede_e_noites_calmas_nao_sao_falhas(tmp_path):
    cfg = config.carregar()
    interim = Path(os.environ.get("RIASENSE_DATA_INTERIM") or ingerir.INTERIM_PADRAO)
    tabela = Path(os.environ.get("RIASENSE_DATA_PROCESSED") or sensores.PROCESSED_PADRAO) / "sensores.parquet"
    tabelas = ["passadeiras", "visitas", "estacionamento", "segmentos"]
    if not tabela.is_file() or not all((interim / f"{t}.parquet").is_file() for t in tabelas):
        pytest.skip("RIASENSE_DATA_INTERIM sem as tabelas de `riasense ingerir`, ou sensores.parquet em falta")
    falhas = vigiar.calcular(interim, tabela, tmp_path, cfg)

    inc, regras = cfg["demo"]["incidente"], cfg["vigiar"]
    perto = (falhas["inicio"] - T(inc["inicio"])).abs() <= pd.Timedelta(minutes=regras["agrupar_inicio_min"])
    incidente = falhas[perto & falhas["sensor"].isin({ids.urn(p) for p in cfg["demo"]["passadeiras"]})]
    assert sorted(incidente["sensor"]) == sorted(ids.urn(p) for p in cfg["demo"]["passadeiras"])
    assert set(incidente["tipo"]) == {"rede"}
    assert set(incidente["rsu"]) == {ids.urn(inc["rsu"])}
    assert incidente["grupo"].nunique() == 1
    # ≈138 h no estudo de viabilidade, medidas até 10/11 às 14h07; a janela comum acaba antes, às 11h00.
    fim_dados = T(cfg["periodo_dados"]["fim"])
    assert incidente["em_curso"].all() and (incidente["fim"] == fim_dados).all()
    assert incidente["duracao_h"].to_numpy() == pytest.approx((fim_dados - T(inc["inicio"])) / vigiar.HORA, abs=0.1)

    # ADR-0025: regra 1 (horas com atividade) ou regra 2 (silêncio longo com total esperado suficiente)
    regra1 = falhas["horas_inesperadas"] >= regras["falha_min_horas"]
    regra2 = (falhas["duracao_h"] >= regras["silencio_longo_h"]) & (falhas["eventos_esperados"] >= regras["total_esperado_min"])
    assert (regra1 | regra2).all()
    assert regra2.any()  # a regra 2 apanha os sensores mortos de pouco movimento
    noite = falhas[falhas["inicio"].dt.hour < 6]
    assert "passadeira" not in set(noite["tipo_sensor"])
    for sensor, instante in NOITES_CALMAS:
        do_sensor = falhas[falhas["sensor"] == ids.urn(sensor)]
        assert not ((do_sensor["inicio"] <= T(instante)) & (do_sensor["fim"] > T(instante))).any(), sensor
    assert (tmp_path / "falhas.parquet").stat().st_size < 5 * 1024 * 1024
