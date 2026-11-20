"""A coerência temporal com a ANEPC (ADR-0036): leitura dos CSV, perfil horário, correlações, IC e a regra de leitura."""

import hashlib
from pathlib import Path

import duckdb
import numpy as np
import pandas as pd
import pytest

from riasense import anepc, config

CABECALHO = "Numero,DataOcorrencia,DataFechoOperacional,Natureza,EstadoOcorrencia,Distrito,Concelho,Freguesia,Localidade,Latitude,Longitude"
ATROP = "Riscos Tecnológicos / Acidentes / Atropelamento rodoviário"
FERRO = "Riscos Tecnológicos / Acidentes / Atropelamento ferroviário"


def linha(num, data, nat=ATROP, dist="AVEIRO", conc="AVEIRO"):
    return f'{num},{data},,"{nat}",Encerrada,{dist},{conc},F,L,40.6,-8.6'


@pytest.fixture
def cfg():
    c = config.carregar()
    c["validacao_anepc"]["bootstrap"] = {"n": 200, "semente": 7, "nivel": 0.95}
    return c


def escrever(pasta: Path, nome: str, linhas: list[str]) -> str:
    f = pasta / nome
    f.write_text("\n".join([CABECALHO, *linhas]) + "\n", encoding="utf-8")
    return hashlib.sha256(f.read_bytes()).hexdigest()


def pasta_com_dados(tmp_path, cfg, ficheiros: dict[str, list[str]]):
    cfg["fontes_externas"]["anepc"]["ficheiros"] = {n: escrever(tmp_path, n, ls) for n, ls in ficheiros.items()}
    return tmp_path


def test_ler_junta_os_2_formatos_de_data_e_so_o_atropelamento_rodoviario(tmp_path, cfg):
    pasta = pasta_com_dados(tmp_path, cfg, {
        "anpc-2017.csv": [linha(1, "09/01/2017 14:02:00"), linha(2, "10/01/2017 00:30:00", nat=FERRO)],
        "anpc-2019.csv": [linha(3, "2019-05-04T18:10:00"), linha(4, "2019-05-04T18:10:00", nat="Outra natureza")],
        "anpc-2020.csv": [linha(5, "2020-02-03T07:30:00"), linha(6, "04/03/2020 19:45:00")],   # 6 dos 904 de 2020 vêm em dd/mm/aaaa
    })
    ev, c = anepc.ler(cfg, pasta)
    assert sorted(ev["numero"]) == ["1", "3", "5", "6"]
    assert dict(zip(ev["numero"], ev["t"].dt.hour)) == {"1": 14, "3": 18, "5": 7, "6": 19}
    assert dict(zip(ev["numero"], ev["t"].dt.month)) == {"1": 1, "3": 5, "5": 2, "6": 3}   # dd/mm, e não mm/dd
    assert c == {"n_lidas": 4, "n_data_ilegivel": 0, "n_duplicados": 0}


def test_ler_descarta_e_conta_a_data_ilegivel_e_retira_os_duplicados(tmp_path, cfg):
    pasta = pasta_com_dados(tmp_path, cfg, {"anpc-2018.csv": [
        linha(1, "09/01/2018 14:02:00"), linha(2, "isto-nao-e-data"), linha(1, "09/01/2018 14:02:00"), linha(3, "2018-02-30T10:00:00")]})
    ev, c = anepc.ler(cfg, pasta)
    assert list(ev["numero"]) == ["1"]
    assert c == {"n_lidas": 4, "n_data_ilegivel": 2, "n_duplicados": 1}


def test_selecionar_pelo_distrito_e_pelo_concelho(tmp_path, cfg):
    pasta = pasta_com_dados(tmp_path, cfg, {"anpc-2018.csv": [
        linha(1, "09/01/2018 14:02:00"), linha(2, "09/01/2018 15:00:00", conc="ÍLHAVO"),
        linha(3, "09/01/2018 16:00:00", dist="PORTO", conc="PORTO")]})
    ev, _ = anepc.ler(cfg, pasta)
    ambitos = cfg["validacao_anepc"]["ambitos"]
    assert len(anepc.selecionar(ev, ambitos["concelho"])) == 1
    assert len(anepc.selecionar(ev, ambitos["distrito"])) == 2
    assert len(anepc.selecionar(ev, ambitos["pais"])) == 3


def test_garantir_recusa_um_ficheiro_com_outra_soma(tmp_path, cfg):
    pasta = pasta_com_dados(tmp_path, cfg, {"anpc-2018.csv": [linha(1, "09/01/2018 14:02:00")]})
    anepc.garantir(cfg, pasta)   # soma certa e ficheiro presente: não descarrega nada (não há rede nos testes)
    (pasta / "anpc-2018.csv").write_text("alterado\n", encoding="utf-8")
    with pytest.raises(anepc.FonteInvalida, match="SHA-256"):
        anepc.garantir(cfg, pasta)


def test_garantir_sem_rede_diz_que_nao_descarregou(tmp_path, cfg, monkeypatch):
    cfg["fontes_externas"]["anepc"]["ficheiros"] = {"anpc-2018.csv": "0" * 64}

    def sem_rede(*a, **k):
        raise OSError("sem rede")
    monkeypatch.setattr(anepc.urllib.request, "urlopen", sem_rede)
    with pytest.raises(anepc.FonteInvalida, match="não foi possível descarregar"):
        anepc.garantir(cfg, tmp_path)
    assert not list(tmp_path.glob("*.parte"))


def test_garantir_descarrega_com_a_soma_certa_e_recusa_a_errada(tmp_path, cfg, monkeypatch):
    conteudo = (CABECALHO + "\n" + linha(1, "09/01/2018 14:02:00") + "\n").encode()

    class Resposta:
        def __init__(self): self.dados = conteudo
        def __enter__(self): return self
        def __exit__(self, *a): return False
        def read(self, n):
            d, self.dados = self.dados[:n], self.dados[n:]
            return d
    pedidos = []
    monkeypatch.setattr(anepc.urllib.request, "urlopen", lambda url, timeout: pedidos.append(url) or Resposta())
    cfg["fontes_externas"]["anepc"]["ficheiros"] = {"anpc-2018.csv": hashlib.sha256(conteudo).hexdigest()}
    anepc.garantir(cfg, tmp_path)
    assert (tmp_path / "anpc-2018.csv").read_bytes() == conteudo
    assert pedidos == [f"https://raw.githubusercontent.com/centraldedados/protecao_civil/{cfg['fontes_externas']['anepc']['commit']}/data/anpc-2018.csv"]
    destino2 = tmp_path / "outra"
    cfg["fontes_externas"]["anepc"]["ficheiros"] = {"anpc-2018.csv": "1" * 64}
    with pytest.raises(anepc.FonteInvalida, match="SHA-256"):
        anepc.garantir(cfg, destino2)
    assert not list(destino2.iterdir())   # nem o ficheiro nem o .parte ficam


def test_perfil_risco_e_a_media_por_hora_do_dia_e_recusa_horas_em_falta():
    t = pd.date_range("2026-11-03 15:00", periods=164, freq="h")
    risco = pd.DataFrame({"t": np.tile(t, 2), "risco_potencial": np.tile(t.hour.to_numpy() / 24, 2),
                          "exposicao_pct": np.tile(t.hour.to_numpy() / 48, 2)})
    p = anepc.perfil_risco(risco)
    assert list(p.index) == list(range(24))
    assert p["risco_potencial"].tolist() == pytest.approx([h / 24 for h in range(24)])
    assert p["exposicao_pct"].tolist() == pytest.approx([h / 48 for h in range(24)])
    with pytest.raises(ValueError, match="24 horas"):
        anepc.perfil_risco(risco[risco["t"].dt.hour != 3])


def test_pearson_e_spearman_batem_com_o_calculo_direto_e_dao_nan_numa_serie_constante():
    rng = np.random.default_rng(1)
    a, b = rng.random(24), rng.random(24)
    assert anepc._pearson(a, b)[0] == pytest.approx(np.corrcoef(a, b)[0, 1])
    assert anepc._spearman(a, b)[0] == pytest.approx(pd.Series(a).corr(pd.Series(b), method="spearman"))
    com_empates = np.array([1, 1, 2, 3] * 6)
    assert anepc._spearman(com_empates, b)[0] == pytest.approx(pd.Series(com_empates).corr(pd.Series(b), method="spearman"))
    assert np.isnan(anepc._pearson(np.ones(24), b)[0])


def test_analisar_e_reprodutivel_com_a_semente_e_a_diferenca_e_risco_menos_exposicao():
    rng = np.random.default_rng(3)
    risco = np.linspace(0.2, 0.8, 24) + rng.normal(0, 0.03, 24)
    expo = np.linspace(0.1, 0.9, 24)
    horas = np.repeat(np.arange(24), rng.integers(1, 15, 24))
    a = anepc.analisar(horas, risco, expo, 300, 42, 0.95)
    assert a == anepc.analisar(horas, risco, expo, 300, 42, 0.95)
    assert a != anepc.analisar(horas, risco, expo, 300, 43, 0.95)
    for (valor, inf, sup) in a.values():
        assert inf <= sup
    r, e, d = a[("spearman", "risco")], a[("spearman", "exposicao")], a[("spearman", "diferenca")]
    assert d[0] == pytest.approx(r[0] - e[0])


def test_analisar_recusa_um_ambito_sem_atropelamentos():
    with pytest.raises(ValueError, match="não tem atropelamentos"):
        anepc.analisar(np.array([], dtype=int), np.ones(24), np.ones(24), 100, 1, 0.95)


def test_regra_de_leitura_coerente_precisa_do_limiar_e_de_um_ic_acima_de_zero():
    minimo = 0.5
    assert anepc.ler_resultado((0.60, 0.20, 0.8), (0.01, -0.02, 0.05), minimo)[0] == anepc.LEITURA_COERENTE
    assert anepc.ler_resultado((0.49, 0.20, 0.8), (0.01, -0.02, 0.05), minimo)[0] == anepc.LEITURA_INCOERENTE
    assert anepc.ler_resultado((0.60, -0.01, 0.8), (0.01, -0.02, 0.05), minimo)[0] == anepc.LEITURA_INCOERENTE
    assert anepc.ler_resultado((0.50, 0.01, 0.8), (0.01, -0.02, 0.05), minimo)[0] == anepc.LEITURA_COERENTE   # o limiar inclui-se
    assert anepc.ler_resultado((np.nan, np.nan, np.nan), (0.0, 0.0, 0.0), minimo)[0] == anepc.LEITURA_INCOERENTE


def test_regra_de_leitura_o_risco_so_acrescenta_se_o_ic_da_diferenca_ficar_todo_acima_de_zero():
    s = (0.7, 0.5, 0.8)
    assert anepc.ler_resultado(s, (0.05, 0.01, 0.09), 0.5)[1] == anepc.LEITURA_ACRESCENTA
    assert anepc.ler_resultado(s, (0.05, 0.0, 0.09), 0.5)[1] == anepc.LEITURA_NAO_ACRESCENTA
    assert anepc.ler_resultado(s, (-0.03, -0.05, -0.01), 0.5)[1] == anepc.LEITURA_NAO_ACRESCENTA
    assert anepc.ler_resultado(s, (np.nan, np.nan, np.nan), 0.5)[1] == anepc.LEITURA_NAO_ACRESCENTA


def test_calcular_tem_o_perfil_e_as_correlacoes_por_ambito_e_a_leitura_so_no_ambito_da_leitura(tmp_path, cfg):
    t = pd.date_range("2026-11-03 15:00", periods=164, freq="h")
    risco = pd.DataFrame({"t": t, "risco_potencial": t.hour.to_numpy() / 24, "exposicao_pct": t.hour.to_numpy() / 30})
    rng = np.random.default_rng(5)
    horas = rng.integers(0, 24, 120)
    ev = pd.DataFrame({"numero": [str(i) for i in range(120)],
                       "t": pd.to_datetime("2017-06-01") + pd.to_timedelta(horas, unit="h"),
                       "distrito": ["AVEIRO"] * 120, "concelho": ["AVEIRO"] * 40 + ["ÍLHAVO"] * 80})
    tab = anepc.calcular(cfg, ev, risco)
    assert list(tab.columns) == anepc.COLUNAS
    perfil, corr = tab[tab["quadro"] == "perfil"], tab[tab["quadro"] == "correlacao"]
    assert len(perfil) == 3 * 24 and len(corr) == 3 * 6
    assert perfil[perfil["ambito"] == "pais"]["atropelamentos"].sum() == 120
    assert perfil[perfil["ambito"] == "concelho"]["atropelamentos"].sum() == 40
    assert dict(corr.groupby("ambito")["n"].first()) == {"concelho": 40, "distrito": 120, "pais": 120}
    com_leitura = corr[corr["leitura"].notna()]
    assert set(zip(com_leitura["ambito"], com_leitura["medida"], com_leitura["contra"])) == {
        ("distrito", "spearman", "risco"), ("distrito", "spearman", "diferenca")}
    assert str(tab["hora"].dtype) == "Int64" and tab["n"].dtype == "int64"


def test_validar_recusa_a_regra_fora_do_adr(cfg):
    anepc.validar(cfg)
    for mexe, texto in [
        (lambda c: c["validacao_anepc"]["bootstrap"].update(nivel=1.2), "nivel"),
        (lambda c: c["validacao_anepc"]["bootstrap"].update(n=10), "bootstrap.n"),
        (lambda c: c["validacao_anepc"].update(ambito_leitura="freguesia"), "ambito_leitura"),
        (lambda c: c["validacao_anepc"].update(coerente_spearman_min=0), "coerente_spearman_min"),
        (lambda c: c["validacao_anepc"]["ambitos"].update(concelho={"freguesia": "X"}), "só aceita"),
        (lambda c: c["fontes_externas"]["anepc"]["ficheiros"].update({"x.csv": "abc"}), "SHA-256"),
    ]:
        c = config.carregar()
        mexe(c)
        with pytest.raises(config.ConfigInvalida, match=texto):
            anepc.validar(c)


def risco_de_uma_semana(pasta: Path) -> None:
    t = pd.date_range("2026-11-03 15:00", periods=164, freq="h")
    risco = pd.DataFrame({"t": t, "risco_potencial": 0.2 + 0.03 * t.hour.to_numpy(), "exposicao_pct": t.hour.to_numpy() / 24})
    pasta.mkdir(parents=True, exist_ok=True)
    con = duckdb.connect()
    con.register("risco", risco)
    con.table("risco").write_parquet(str(pasta / "risco_potencial.parquet"))
    con.close()


def test_calcular_diz_qual_e_o_ambito_sem_atropelamentos(cfg):
    ev = pd.DataFrame({"numero": ["1"], "t": [pd.Timestamp("2017-06-01 18:00")], "distrito": ["PORTO"], "concelho": ["PORTO"]})
    t = pd.date_range("2026-11-03 15:00", periods=164, freq="h")
    risco = pd.DataFrame({"t": t, "risco_potencial": t.hour.to_numpy() / 24, "exposicao_pct": t.hour.to_numpy() / 30})
    with pytest.raises(ValueError, match="o âmbito concelho não tem atropelamentos"):
        anepc.calcular(cfg, ev, risco)


def test_correr_escreve_o_parquet_e_com_um_ambito_vazio_diz_o_erro_sem_traceback(tmp_path, cfg, monkeypatch, capsys):
    linhas = [linha(i, f"09/01/2017 {10 + i % 10:02d}:00:00") for i in range(30)]
    (tmp_path / "csv").mkdir()
    pasta = pasta_com_dados(tmp_path / "csv", cfg, {"anpc-2017.csv": linhas})
    processed = tmp_path / "processed"
    risco_de_uma_semana(processed)
    monkeypatch.setenv("RIASENSE_DATA_ANEPC", str(pasta))
    monkeypatch.setenv("RIASENSE_DATA_PROCESSED", str(processed))
    assert anepc.correr(cfg) == 0
    tab = duckdb.read_parquet(str(processed / "validacao_anepc.parquet")).df()
    assert set(tab["quadro"]) == {"perfil", "correlacao"} and set(tab["ambito"]) == {"concelho", "distrito", "pais"}
    assert anepc.AVISO in capsys.readouterr().out
    (processed / "validacao_anepc.parquet").unlink()
    cfg["validacao_anepc"]["ambitos"]["concelho"] = {"distrito": "PORTO", "concelho": "PORTO"}
    assert anepc.correr(cfg) == 1
    assert "erro: o âmbito concelho não tem atropelamentos" in capsys.readouterr().err
    assert not (processed / "validacao_anepc.parquet").exists()
