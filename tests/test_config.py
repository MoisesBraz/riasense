import pytest

from riasense import config


def test_config_do_repositorio_e_valida():
    cfg = config.carregar()
    assert cfg["demo"]["rsu"] == ["RoadSideUnit:0030"]


def test_campo_em_falta_da_erro_com_o_nome_do_campo(tmp_path):
    f = tmp_path / "riasense.yaml"
    f.write_text("cidade: Aveiro\nvigiar: {falha_min_horas: 2}\n", encoding="utf-8")
    with pytest.raises(config.ConfigInvalida, match=r"vigiar\.agrupar_inicio_min"):
        config.carregar(f)


def test_ficheiro_inexistente_da_erro_claro(tmp_path):
    with pytest.raises(config.ConfigInvalida, match="não encontrado"):
        config.carregar(tmp_path / "nao-existe.yaml")
