"""As visitas por zona turística e hora (ADR-0047, ponto 2): contadas pela hora de entrada, só na janela, sem estimar."""

import duckdb
import pandas as pd
import pytest

from riasense import config, zonas

TZ1, TZ2 = "urn:ngsi-ld:TouristZone:0001", "urn:ngsi-ld:TouristZone:0002"


@pytest.fixture
def cfg():
    return config.carregar()


def _visita(zona: str, entrada: str, saida: str) -> dict:
    e, s = pd.Timestamp(entrada), pd.Timestamp(saida)
    return {"id": f"v{e.value}{zona[-1]}", "t": s, "zona": zona, "entrada": e, "saida": s,
            "permanencia_s": (s - e).total_seconds(), "camara": None}


def test_conta_pela_hora_de_entrada_e_uma_zona_sem_visitas_nessa_hora_fica_sem_linha(tmp_path, cfg):
    interim, destino = tmp_path / "interim", tmp_path / "processed"
    interim.mkdir()
    visitas = pd.DataFrame([
        _visita(TZ1, "2026-11-04 08:10", "2026-11-04 08:20"),
        _visita(TZ1, "2026-11-04 08:59", "2026-11-04 09:05"),   # entra às 8h, sai às 9h: conta às 8h
        _visita(TZ1, "2026-11-04 09:30", "2026-11-04 09:31"),
        _visita(TZ2, "2026-11-04 09:00", "2026-11-04 09:10"),   # a TZ2 não tem visitas às 8h
        _visita(TZ2, "2026-11-01 09:00", "2026-11-01 09:10"),   # fora da janela periodo_dados
    ])
    duckdb.from_df(visitas).write_parquet(str(interim / "visitas.parquet"))

    assert zonas.calcular(interim, destino, cfg) == 3
    h = duckdb.read_parquet(str(destino / "zonas_hora.parquet")).df()
    assert list(h.columns) == zonas.COLUNAS
    assert [(r.id, str(r.t), r.visitas) for r in h.itertuples()] == [
        (TZ1, "2026-11-04 08:00:00", 2), (TZ1, "2026-11-04 09:00:00", 1), (TZ2, "2026-11-04 09:00:00", 1)]


def test_sem_visitas_parquet_da_erro_com_o_passo(tmp_path, cfg):
    with pytest.raises(FileNotFoundError, match="riasense ingerir"):
        zonas.calcular(tmp_path, tmp_path / "processed", cfg)
