import io
import sys

import pytest

from riasense.__main__ import SUBCOMANDOS, main


def test_help_sai_com_0_e_lista_os_subcomandos(capsys):
    with pytest.raises(SystemExit) as e:
        main(["--help"])
    assert e.value.code == 0
    saida = capsys.readouterr().out
    assert all(s in saida for s in ["ingerir", "vigiar", "completar", "prever", "proteger", "exportar"])


def test_saida_redirigida_em_cp1252_passa_a_utf8(monkeypatch):
    # Simula `riasense ... > out.txt` no Windows: o stdout é um ficheiro em cp1252, que não tem o «→».
    saida = io.TextIOWrapper(io.BytesIO(), encoding="cp1252")
    monkeypatch.setattr(sys, "stdout", saida)
    monkeypatch.setitem(SUBCOMANDOS, "novo", "dados → parquet")
    with pytest.raises(SystemExit) as e:
        main(["--help"])
    assert e.value.code == 0
    saida.flush()
    assert "dados → parquet" in saida.buffer.getvalue().decode("utf-8")


def test_subcomando_por_implementar_sai_com_2(capsys, monkeypatch):
    # Todos os passos da lista já estão feitos: um passo novo, ainda sem código, cai aqui.
    monkeypatch.setitem(SUBCOMANDOS, "novo", "passo ainda sem código")
    assert main(["novo"]) == 2
    assert "por implementar" in capsys.readouterr().err


def test_config_invalida_sai_com_1_e_nomeia_o_campo(tmp_path, monkeypatch, capsys):
    f = tmp_path / "riasense.yaml"
    f.write_text("cidade: Aveiro\n", encoding="utf-8")
    monkeypatch.setenv("RIASENSE_CONFIG", str(f))
    assert main(["vigiar"]) == 1
    assert "fuso_horario" in capsys.readouterr().err
