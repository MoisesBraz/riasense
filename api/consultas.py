"""Leitura dos Parquet de data/processed/ para a API (ADR-0003): uma tabela por camada, filtrada por sensor e por tempo.

O SQL só junta nomes de colunas fixos deste módulo; o sensor, as datas e a paginação vão sempre como parâmetros.
"""

import json
import math
import os
from dataclasses import dataclass
from datetime import date, datetime, timezone
from pathlib import Path

import duckdb

from riasense import config, ids


@dataclass(frozen=True)
class Tabela:
    """Um Parquet de data/processed/: a coluna do sensor, as colunas de tempo e o passo do pipeline que o escreve."""

    ficheiro: str
    passo: str  # subcomando `riasense <passo>` que gera o ficheiro
    sensor: str | None  # coluna com o URN do sensor; None nas tabelas de avaliação, que são por tipo
    inicio: str | None = None  # coluna de tempo (ou início de um período, como uma falha)
    fim: str | None = None  # fim do período; None quando cada linha é um instante
    ordem: str | None = None  # ORDER BY fixo; por omissão, o sensor e o tempo


TABELAS = {
    "sensores": Tabela("sensores.parquet", "sensores", "id"),
    "falhas": Tabela("falhas.parquet", "vigiar", "sensor", "inicio", "fim"),
    "sensores_virtuais": Tabela("sensores_virtuais.parquet", "completar", "id", "t"),
    "previsoes": Tabela("previsoes.parquet", "prever", "id", "t", ordem="id, t, horizonte_h"),  # um por horizonte (ADR-0027)
    "proteger_passadeiras": Tabela("proteger_passadeiras.parquet", "proteger", "id"),
    "proteger_intervalos": Tabela("proteger_intervalos.parquet", "proteger", "passadeira", "t"),
    "risco_potencial": Tabela("risco_potencial.parquet", "risco", "id", "t"),  # por passadeira e hora (ADR-0013)
    # O ranking do próximo sensor (ADR-0015) e as avaliações da ② e da ③, por tipo de sensor.
    "proximo_sensor": Tabela("proximo_sensor.parquet", "proximo", "id", ordem="tipo, ordem nulls last, id"),
    "avaliacao_completar": Tabela("avaliacao_completar.parquet", "completar", None, ordem="cenario, tipo, dias, modelo"),
    "avaliacao_prever": Tabela("avaliacao_prever.parquet", "prever", None, ordem="horizonte_h, tipo"),
    # Contexto da ④ (ADR-0018): dia, crepúsculo ou noite em cada hora; não entra no risco potencial.
    # ADR-0034: as passagens medidas por segmento e hora (câmara; senão, radar), para a camada «Trânsito».
    "segmentos_hora": Tabela("segmentos_hora.parquet", "carros", "id", "t"),
    # ADR-0047: as visitas medidas por zona turística e hora, para o mapa de calor dos peões.
    "zonas_hora": Tabela("zonas_hora.parquet", "zonas", "id", "t"),
    "luminosidade": Tabela("luminosidade.parquet", "luminosidade", None, "t", ordem="t"),
    # ADR-0044: o estado de cada lugar da avenida em cada hora (ocupado, livre ou desconhecido).
    "avenida_lugares_hora": Tabela("avenida_lugares_hora.parquet", "avenida", "lugar", "t", ordem="t, lugar"),
}


class PorCalcular(LookupError):
    """O Parquet da camada ainda não existe: o passo do pipeline não correu."""


def pasta_resultados() -> Path:
    return Path(os.environ.get("RIASENSE_DATA_PROCESSED") or config.RAIZ / "data" / "processed")


def poligonos_passadeiras() -> list[dict]:
    """As passadeiras desenhadas com a forma real (ADR-0038): as características de `passadeiras.geojson`, tal como o pipeline as escreveu."""
    ficheiro = pasta_resultados() / "passadeiras.geojson"
    if not ficheiro.is_file():
        raise PorCalcular(f"{ficheiro.name} não existe: corre `riasense sensores` (precisa do Crosswalk.csv do Living Lab)")
    return json.loads(ficheiro.read_text(encoding="utf-8"))["features"]


def alertas_da_falha(sensor: str, inicio: datetime) -> list[dict]:
    """A entidade `Alert` de uma falha (ADR-0053, ponto 2), tal como `riasense exportar` a escreveu em
    `ngsi-ld/falhas.jsonld` (ADR-0008), sem formato novo: a do sensor (`alertSource`) que começa em `inicio` (`validFrom`)."""
    ficheiro = pasta_resultados() / "ngsi-ld" / "falhas.jsonld"
    if not ficheiro.is_file():
        raise PorCalcular(f"ngsi-ld/{ficheiro.name} não existe: corre `riasense exportar`")
    urn = sensor if sensor.startswith("urn:ngsi-ld:") else f"urn:ngsi-ld:{sensor}"
    alvo = _utc(inicio)
    return [a for a in json.loads(ficheiro.read_text(encoding="utf-8"))
            if a["alertSource"]["object"] == urn and datetime.fromisoformat(a["validFrom"]["value"].removesuffix("Z")) == alvo]


def _utc(t: datetime | None) -> datetime | None:
    """Os Parquet guardam a hora UTC sem fuso (= hora local em novembro); um pedido com fuso converte-se para UTC."""
    return t.astimezone(timezone.utc).replace(tzinfo=None) if t and t.tzinfo else t


def _filtros(tab: Tabela, sensor: str | None, desde: datetime | None, ate: datetime | None, extra: dict) -> tuple[str, dict]:
    """Condições WHERE e parâmetros. Um período (início–fim) entra se se sobrepuser a [desde, ate]."""
    condicoes, params = [], {}
    if sensor and tab.sensor:
        condicoes.append(f"{tab.sensor} = $sensor")
        params["sensor"] = ids.urn(sensor)
    if desde and tab.inicio:
        condicoes.append(f"{tab.fim or tab.inicio} >= $desde")
        params["desde"] = _utc(desde)
    if ate and tab.inicio:
        condicoes.append(f"{tab.inicio} <= $ate")
        params["ate"] = _utc(ate)
    for coluna, valor in extra.items():  # colunas fixas escolhidas pelos endpoints, nunca pelo pedido
        if valor is not None:
            condicoes.append(f"{coluna} = ${coluna}")
            params[coluna] = valor
    return " and ".join(condicoes) or "true", params


def _json(valor):
    """Valores do DuckDB → JSON: datas em ISO 8601 e NaN/infinito como null."""
    if isinstance(valor, (datetime, date)):
        return valor.isoformat()
    if isinstance(valor, float) and not math.isfinite(valor):
        return None
    return valor


def consultar(nome: str, sensor=None, desde=None, ate=None, limite=1000, deslocamento=0, **extra) -> list[dict]:
    """Linhas da tabela `nome`, filtradas e paginadas, prontas para JSON."""
    tab = TABELAS[nome]
    caminho = pasta_resultados() / tab.ficheiro
    if not caminho.is_file():
        raise PorCalcular(f"{tab.ficheiro} ainda não existe: corre `riasense {tab.passo}`")
    onde, params = _filtros(tab, sensor, desde, ate, extra)
    ordem = tab.ordem or ", ".join(c for c in (tab.sensor, tab.inicio) if c)
    sql = f"select * from read_parquet($ficheiro) where {onde} order by {ordem} limit $limite offset $deslocamento"
    params |= {"ficheiro": str(caminho), "limite": limite, "deslocamento": deslocamento}
    con = duckdb.connect()
    try:
        rel = con.sql(sql, params=params)
        colunas = rel.columns
        return [{c: _json(v) for c, v in zip(colunas, linha)} for linha in rel.fetchall()]
    finally:
        con.close()


# ADR-0047, ponto 4: a escala do mapa de calor é fixa na semana e cada tipo normaliza-se pelo seu máximo por hora.
# O medido de cada tipo e o estimado da ② nas horas de falha (`sensores_virtuais.parquet`, `grandeza`); nos segmentos,
# só os estimados dos que têm câmara ou radar (os do `segmentos_hora`, ADR-0034).
CALOR = {
    "passadeiras": ("proteger_intervalos", "travessias",
                    "select sum(travessias) from read_parquet($medido) group by passadeira, date_trunc('hour', t)"),
    "zonas": ("zonas_hora", "visitas", "select visitas from read_parquet($medido)"),
    "segmentos": ("segmentos_hora", "veiculos", "select veiculos from read_parquet($medido)"),
}


def boletim_camara(zona: list[str]) -> dict:
    """O boletim de segurança pedonal para a Câmara (ADR-0052, ponto 2), só com os Parquet já calculados:
    - o top 3 do risco potencial: a média do `risco_potencial` de todas as horas da semana, por passadeira, e o empate pelo id,
      com as horas medidas (as de `estimado` falso, ressalva do ADR-0024) e o semáforo;
    - na zona da demo, o menor e o maior das passadeiras dos veículos acima do limite da via (`proteger_passadeiras`), e os
      segmentos medidos pelo radar que entram nelas, com o número de passadeiras de cada um;
    - as passadeiras com semáforo."""
    nomes = {"risco": "risco_potencial.parquet", "proteger": "proteger_passadeiras.parquet",
             "ligacoes": "passadeira_segmentos.parquet", "segmentos": "segmentos_hora.parquet"}
    caminhos = {k: pasta_resultados() / f for k, f in nomes.items()}
    for f in caminhos.values():
        if not f.is_file():
            raise PorCalcular(f"{f.name} ainda não existe: corre o pipeline (`riasense proteger`, `riasense risco`, `riasense carros`)")
    p = {k: str(v) for k, v in caminhos.items()}
    con = duckdb.connect()
    try:
        top = con.sql("""select id, avg(risco_potencial), count(*) filter (where not estimado), count(*), bool_or(semaforo)
                         from read_parquet($risco) group by id order by 2 desc, id limit 3""",
                      params={"risco": p["risco"]}).fetchall()
        mov_min, mov_max, calm_min, calm_max, n = con.sql(
            """select min(pct_acima_limite_movimentados), max(pct_acima_limite_movimentados),
                      min(pct_acima_limite_calmos), max(pct_acima_limite_calmos), count(*)
               from read_parquet($proteger) where list_contains($zona, id)""",
            params={"proteger": p["proteger"], "zona": zona}).fetchall()[0]
        radar = con.sql("""select segmento, count(distinct passadeira) from read_parquet($ligacoes)
                           where list_contains($zona, passadeira)
                             and segmento in (select id from read_parquet($segmentos) where sensor = 'Radar')
                           group by segmento order by segmento""",
                        params={"ligacoes": p["ligacoes"], "segmentos": p["segmentos"], "zona": zona}).fetchall()
        semaforos = [i for (i,) in con.sql("select id from read_parquet($proteger) where semaforo order by id",
                                           params={"proteger": p["proteger"]}).fetchall()]
    finally:
        con.close()
    return {
        "top": [{"id": i, "risco_medio": _json(float(m)), "horas_medidas": int(hm), "horas": int(h), "semaforo": bool(s)}
                for i, m, hm, h, s in top],
        "zona": {"passadeiras": sorted(zona), "com_dados": int(n),
                 "acima_limite_movimentados": [_json(mov_min), _json(mov_max)],
                 "acima_limite_calmos": [_json(calm_min), _json(calm_max)],
                 "radar": [{"segmento": sg, "passadeiras": int(k)} for sg, k in radar]},
        "semaforos": semaforos,
    }


def maximos_calor() -> dict:
    """{tipo: {maximo, medido, estimado, unidade}}: o máximo por hora na semana, de cada tipo de sensor."""
    virtuais = pasta_resultados() / "sensores_virtuais.parquet"
    if not virtuais.is_file():
        raise PorCalcular("sensores_virtuais.parquet ainda não existe: corre `riasense completar`")
    saida = {}
    con = duckdb.connect()
    try:
        for tipo, (nome, grandeza, sql_medido) in CALOR.items():
            tab = TABELAS[nome]
            medido = pasta_resultados() / tab.ficheiro
            if not medido.is_file():
                raise PorCalcular(f"{tab.ficheiro} ainda não existe: corre `riasense {tab.passo}`")
            filtro = "and id in (select id from read_parquet($medido))" if tipo == "segmentos" else ""
            m, e = con.sql(
                f"""select (select max(v) from ({sql_medido}) x(v)),
                           (select max(estimativa) from read_parquet($virtuais)
                            where grandeza = $grandeza and estimado {filtro})""",
                params={"medido": str(medido), "virtuais": str(virtuais), "grandeza": grandeza}).fetchall()[0]
            valores = [v for v in (m, e) if v is not None]
            saida[tipo] = {"maximo": _json(float(max(valores))) if valores else None, "medido": _json(m and float(m)),
                           "estimado": _json(e and float(e)), "unidade": f"{grandeza} por hora"}
    finally:
        con.close()
    return saida
