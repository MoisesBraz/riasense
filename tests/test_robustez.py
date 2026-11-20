"""Robustez para outra cidade: sem OpenMP, e campos do config que não podem enganar."""

import sys

import pytest

from riasense import config, prever
from riasense.__main__ import main


def _config_com(tmp_path, monkeypatch, linha_velha: str, linha_nova: str):
    f = tmp_path / "riasense.yaml"
    texto = config.CAMINHO_PADRAO.read_text(encoding="utf-8")
    assert linha_velha in texto
    f.write_text(texto.replace(linha_velha, linha_nova), encoding="utf-8")
    monkeypatch.setenv("RIASENSE_CONFIG", str(f))
    return f


def test_prever_sem_openmp_diz_o_que_instalar_e_sai_com_1(monkeypatch, capsys):
    monkeypatch.setitem(sys.modules, "lightgbm", None)  # o import falha, como sem a libomp/libgomp1
    # O 1.º ajuste da LightGBM é o que falha; sem depender de haver dados reais nesta máquina.
    monkeypatch.setattr(prever, "calcular", lambda *a, **k: prever.ajustar_lightgbm(None, [], {}))
    assert main(["prever"]) == 1
    erro = capsys.readouterr().err
    assert "OpenMP" in erro and "libgomp1" in erro and "libomp" in erro and "Traceback" not in erro


def test_exigir_lightgbm_levanta_o_erro_proprio(monkeypatch):
    monkeypatch.setitem(sys.modules, "lightgbm", None)
    with pytest.raises(prever.OpenMPEmFalta):
        prever.exigir_lightgbm()


def test_unidade_de_velocidade_diferente_de_m_s_e_recusada(tmp_path, monkeypatch):
    f = _config_com(tmp_path, monkeypatch, "unidades_velocidade: m/s", "unidades_velocidade: km/h")
    with pytest.raises(config.ConfigInvalida, match="unidades_velocidade.*m/s"):
        config.carregar(f)


def test_fuso_horario_invalido_e_recusado(tmp_path, monkeypatch):
    f = _config_com(tmp_path, monkeypatch, "fuso_horario: Europe/Lisbon", "fuso_horario: Lisboa")
    with pytest.raises(config.ConfigInvalida, match="fuso_horario.*Europe/Lisbon"):
        config.carregar(f)


def test_outro_fuso_valido_e_aceite(tmp_path, monkeypatch):
    f = _config_com(tmp_path, monkeypatch, "fuso_horario: Europe/Lisbon", "fuso_horario: Europe/Madrid")
    assert config.carregar(f)["fuso_horario"] == "Europe/Madrid"
