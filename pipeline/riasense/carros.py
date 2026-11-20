"""Os carros no mapa são os medidos (ADR-0034): passagens e velocidade por segmento e hora, e a geometria.

Só os segmentos com câmara ou radar (o V2X só vê os veículos ligados). Um tipo de sensor por segmento, para a semana
toda, e nunca somados (ADR-0034, ponto 1): a câmara, salvo se mediu em menos de metade das
horas em que o radar mediu; nesse caso, o radar. Assim, o mesmo carro nunca conta duas vezes, um segmento cuja câmara deixou
de comunicar cedo fica com os carros do radar, e nenhum segmento salta de um sensor para o outro de hora para hora.

Escreve em `data/processed/`:
- `segmentos_hora.parquet`: `id`, `t` (início da hora), `sensor`, `veiculos` e `vel_media_ms`, nas horas com passagens, mais
  (ADR-0039) o `limite_kmh` da via, `acima_limite` (quantas passagens medidas o passam) e `velocidades_kmh`: as passagens da hora
  ordenam-se pela velocidade e dividem-se em tantos grupos quantos os pontos do mapa (`carros.veiculos_por_ponto`, cerca de 20
  veículos cada), e cada grupo dá a mediana da sua velocidade;
  e (ADR-0041) os `grupos` da vista 3D, cada um com a `categoria` medida (A mota, B ligeiro, C camião, D autocarro) e a mediana
  `kmh`: em cada hora, o total de cada categoria em toda a zona ÷ `carros.veiculos_por_ponto` dá os grupos dessa categoria,
  repartidos pelos segmentos pelos maiores restos (as categorias raras não desaparecem por arredondar segmento a segmento);
  dentro do segmento e da categoria, as passagens ordenam-se pela velocidade e dividem-se pelos grupos;
- `segmentos_carros.geojson`: as linhas dos segmentos (`reference-entities/RoadSegment.csv`), com `id` e `sensor`;
- `ruas_com_sensor.geojson`: as «ruas com sensor» do mapa (ADR-0034, ponto 2), a geometria real dos troços medidos:
  os com câmara ou radar e os junto a uma passadeira (`passadeira_segmentos.parquet`), com o `motivo`. O mapa pinta
  só estes troços, e não ruas inteiras do mapa base (que dependiam do zoom).
Nada se estima.
"""

import json
import os
import sys
from pathlib import Path

import duckdb

from riasense import ingerir, sensores

SENSORES_CARROS = ("Camera", "Radar")  # por esta ordem de preferência
COLUNAS = ["id", "t", "sensor", "veiculos", "vel_media_ms", "limite_kmh", "acima_limite", "velocidades_kmh", "grupos"]


def calcular(interim: Path, referencias: Path, destino: Path, cfg: dict) -> dict[str, int]:
    """Escreve os dois ficheiros e devolve quantos segmentos e linhas têm."""
    eventos = interim / "segmentos.parquet"
    rs = referencias / sensores.REFERENCIAS["rs"]
    for f in (eventos, rs):
        if not f.is_file():
            raise FileNotFoundError(f"{f}: corre primeiro `riasense ingerir` (e confirma RIASENSE_DATA_RAW)")
    inicio, fim = cfg["periodo_dados"]["inicio"], cfg["periodo_dados"]["fim"]
    destino.mkdir(parents=True, exist_ok=True)
    con = duckdb.connect()
    try:
        con.execute("create temp table seg as select * from read_parquet(?)", [str(eventos)])
        # O sensor de cada segmento, para a semana toda: a câmara, salvo se mediu em menos de metade das horas do radar.
        con.execute(
            f"""
            create temp table escolhido as
            with horas as (
                select id,
                       count(distinct date_trunc('hour', t)) filter (where sensor = 'Camera') as camara,
                       count(distinct date_trunc('hour', t)) filter (where sensor = 'Radar') as radar
                from seg
                where sensor in {SENSORES_CARROS} and t >= ?::timestamp and t < ?::timestamp
                group by id)
            select id, case when camara > 0 and camara >= radar / 2.0 then 'Camera' else 'Radar' end as sensor
            from horas""",
            [inicio, fim],
        )
        # As passagens de cada hora, só do sensor escolhido do segmento: o outro não se soma.
        # Cada ponto do mapa é um grupo de veículos medidos (ADR-0039): ordenam-se as passagens pela velocidade, dividem-se em
        # tantos grupos quantos os pontos e dá-se a mediana de cada um, em km/h. O limite é o da via (um só por segmento).
        con.execute(
            """
            create temp table hora as
            with p as (
                select s.id, date_trunc('hour', s.t) as t, s.sensor, s.vel_media_ms, s.vel_limite_ms
                from seg s join escolhido e on e.id = s.id and e.sensor = s.sensor
                where s.t >= ?::timestamp and s.t < ?::timestamp),
            h as (
                select id, t, sensor, count(*)::int as veiculos, avg(vel_media_ms) as vel_media_ms,
                       mode(vel_limite_ms) * 3.6 as limite_kmh,
                       (count(*) filter (where vel_media_ms > vel_limite_ms))::int as acima_limite,
                       list(vel_media_ms order by vel_media_ms) filter (where vel_media_ms is not null) as vs
                from p group by all),
            g as (select *, len(vs) as n, greatest(1, round(len(vs) / ?::double)::int) as k from h)
            select id, t, sensor, veiculos, vel_media_ms, limite_kmh, acima_limite,
                   case when n = 0 then []::double[]
                        else list_transform(range(k), lambda x: list_aggr(list_slice(vs, 1 + (x * n) // k, ((x + 1) * n) // k), 'median') * 3.6)
                   end as velocidades_kmh
            from g
            order by id, t""",
            [inicio, fim, cfg["carros"]["veiculos_por_ponto"]],
        )
        # ADR-0041: os grupos por categoria. A quota de cada segmento é n / veiculos_por_ponto; cada um fica com a parte inteira, e os
        # grupos que faltam para o total da zona (arredondado) vão para os maiores restos, por hora e categoria.
        con.execute(
            """
            create temp table grupos as
            with p as (
                select s.id, date_trunc('hour', s.t) as t, s.categoria, s.vel_media_ms
                from seg s join escolhido e on e.id = s.id and e.sensor = s.sensor
                where s.t >= ?::timestamp and s.t < ?::timestamp and s.categoria is not null and s.vel_media_ms is not null),
            c as (
                select id, t, categoria, list(vel_media_ms order by vel_media_ms) as vs, count(*) as n, count(*) / ?::double as q
                from p group by all),
            r as (
                select *, floor(q)::int as base,
                       -- O total arredonda-se sobre a contagem inteira: somar as quotas (doubles) punha alguns x,5 em x,4999….
                       round(sum(n) over (partition by t, categoria) / ?::double)::int
                           - sum(floor(q)::int) over (partition by t, categoria) as falta,
                       row_number() over (partition by t, categoria order by q - floor(q) desc, id) as ordem
                from c),
            k as (select id, t, categoria, vs, n, base + (ordem <= falta)::int as k from r)
            select id, t,
                   flatten(list(list_transform(range(k), lambda x: {'categoria': categoria,
                       'kmh': list_aggr(list_slice(vs, 1 + (x * n) // k, ((x + 1) * n) // k), 'median') * 3.6})
                       order by categoria)) as grupos
            from k where k > 0 group by id, t""",
            [inicio, fim, cfg["carros"]["veiculos_por_ponto"], cfg["carros"]["veiculos_por_ponto"]],
        )
        # Um segmento sem grupos nesta hora (poucas passagens na zona) fica com a lista vazia: na vista 3D, sem veículos.
        con.execute(
            "create temp table final as select h.*, coalesce(g.grupos, []::struct(categoria varchar, kmh double)[]) as grupos "
            "from hora h left join grupos g using (id, t) order by id, t"
        )
        con.sql(f"select {', '.join(COLUNAS)} from final").write_parquet(str(destino / "segmentos_hora.parquet"))
        linhas = con.execute("select count(*) from hora").fetchall()[0][0]
        geo = con.execute(
            "select r.entityId, e.sensor, r.location from read_csv(?, all_varchar=true, header=true) r "
            "join escolhido e on e.id = r.entityId order by r.entityId",
            [str(rs)],
        ).fetchall()
        # Os troços junto a uma passadeira (passo `sensores`), se já existirem.
        ps = destino / "passadeira_segmentos.parquet"
        junto = {r[0] for r in con.execute("select distinct segmento from read_parquet(?)", [str(ps)]).fetchall()} if ps.is_file() else set()
        todos = con.execute(
            "select entityId, location from read_csv(?, all_varchar=true, header=true) where location is not null",
            [str(rs)],
        ).fetchall()
    finally:
        con.close()
    colecao = {
        "type": "FeatureCollection",
        "features": [
            {"type": "Feature", "properties": {"id": i, "sensor": s}, "geometry": json.loads(loc)}
            for i, s, loc in geo
            if loc
        ],
    }
    (destino / "segmentos_carros.geojson").write_text(json.dumps(colecao, ensure_ascii=False), encoding="utf-8")
    medidos = {i: s for i, s, _ in geo}
    ruas = {
        "type": "FeatureCollection",
        "features": [
            {"type": "Feature", "properties": {"id": i, "motivo": medidos.get(i, "passadeira").lower()}, "geometry": json.loads(loc)}
            for i, loc in todos
            if i in medidos or i in junto
        ],
    }
    (destino / "ruas_com_sensor.geojson").write_text(json.dumps(ruas, ensure_ascii=False), encoding="utf-8")
    return {"segmentos": len(colecao["features"]), "linhas": int(linhas), "ruas": len(ruas["features"])}


def correr(cfg: dict) -> int:
    """Subcomando `riasense carros`: lê RIASENSE_DATA_INTERIM e as referências de RIASENSE_DATA_RAW."""
    bruto = os.environ.get("RIASENSE_DATA_RAW")
    if not bruto or not Path(bruto).is_dir():
        print("erro: RIASENSE_DATA_RAW tem de apontar para a pasta dos CSV do Living Lab", file=sys.stderr)
        return 1
    interim = Path(os.environ.get("RIASENSE_DATA_INTERIM") or ingerir.INTERIM_PADRAO)
    destino = Path(os.environ.get("RIASENSE_DATA_PROCESSED") or sensores.PROCESSED_PADRAO)
    try:
        n = calcular(interim, Path(bruto) / "reference-entities", destino, cfg)
    except FileNotFoundError as e:
        print(f"erro: {e}", file=sys.stderr)
        return 1
    print(f"carros: {n['segmentos']} segmentos com câmara ou radar, {n['linhas']} horas com passagens; "
          f"{n['ruas']} ruas com sensor → {destino}")
    return 0
