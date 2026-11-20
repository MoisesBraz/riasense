"""Luminosidade pela posição do sol (ADR-0018): sem rede, só a data, a hora e as coordenadas."""

import numpy as np
import pandas as pd
import pytest

from riasense import config, luminosidade
from riasense.__main__ import main

LAT, LON = 40.64, -8.65  # Aveiro


def _elev(iso: str) -> float:
    return float(luminosidade.elevacao_sol(pd.DatetimeIndex([iso]), LAT, LON)[0])


def test_a_07_11_o_sol_nasce_por_volta_das_7h15_e_poe_se_por_volta_das_17h20():
    # ADR-0018: verificação com a realidade, em hora local (= UTC em novembro).
    assert _elev("2026-11-07 07:05") < 0 < _elev("2026-11-07 07:30")
    assert _elev("2026-11-07 17:10") > 0 > _elev("2026-11-07 17:35")


def test_ao_meio_dia_solar_a_elevacao_e_90_menos_a_latitude_mais_a_declinacao():
    # A 07/11, a declinação é cerca de −16,1°: 90 − 40,64 − 16,1 ≈ 33,3°. O meio-dia solar é às 12h35 (longitude)
    # menos cerca de 16 min (a equação do tempo no início de novembro): por volta das 12h18 UTC.
    t = pd.date_range("2026-11-07 11:00", "2026-11-07 14:00", freq="min")
    elev = luminosidade.elevacao_sol(t, LAT, LON)
    assert elev.max() == pytest.approx(33.3, abs=0.3)
    assert abs(t[int(np.argmax(elev))] - pd.Timestamp("2026-11-07 12:18")) <= pd.Timedelta(minutes=3)


def test_classes_pelo_limiar_do_crepusculo():
    assert luminosidade.classificar(np.array([10.0, 0.0, -3.0, -6.0, -20.0]), -6).tolist() == [
        "dia", "crepusculo", "crepusculo", "noite", "noite"]


def test_semana_dos_dados_tem_91_horas_de_noite_em_164():
    df = luminosidade.horas(config.carregar())
    assert len(df) == 164 and list(df.columns) == ["t", "elevacao_graus", "luminosidade"]
    assert (df["luminosidade"] == "noite").sum() == 91
    as_20h = df.set_index("t").loc[pd.Timestamp("2026-11-04 20:00")]
    assert as_20h["luminosidade"] == "noite"  # a falha da demo começa às escuras


def test_a_hora_local_converte_se_para_utc_pelo_fuso_do_config():
    cfg = config.carregar()
    verao = cfg | {"fuso_horario": "Europe/Lisbon", "periodo_dados": {"inicio": "2026-07-01T00:00", "fim": "2026-07-02T00:00"}}
    df = luminosidade.horas(verao).set_index("t")
    # Em julho, Lisboa está em UTC+1: a hora das 21h locais classifica-se às 20h30 UTC, com o sol a cerca de −4°.
    # Sem a conversão, seria às 21h30 UTC, com o sol a cerca de −13° (noite).
    assert df.loc[pd.Timestamp("2026-07-01 21:00"), "luminosidade"] == "crepusculo"
    assert df.loc[pd.Timestamp("2026-07-01 13:00"), "elevacao_graus"] > 70


def test_comando_escreve_o_parquet(tmp_path, monkeypatch, capsys):
    monkeypatch.setenv("RIASENSE_DATA_PROCESSED", str(tmp_path))
    assert main(["luminosidade"]) == 0
    assert (tmp_path / "luminosidade.parquet").is_file()
    assert "noite 91" in capsys.readouterr().out
