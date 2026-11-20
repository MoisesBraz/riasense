"""A avenida em 3D (ADR-0044): a via, as faixas, os passeios e os carros estacionados do corredor da demo.

A posição e a largura da via medem-se nas passadeiras, porque o eixo dos segmentos (`RoadSegment.csv`) corre perto de uma
berma e não no meio da rua: em cada passadeira do corredor, o centro da via é o meio dos 2 patamares (`Sidewalk.csv`, os
bordos interiores) e a largura é a distância entre eles. Entre passadeiras da mesma cadeia interpola-se ao longo do eixo;
depois da última mantém-se o último valor; as cadeias partem-se nos cruzamentos. Do lado dos lugares de estacionamento com
sensor reserva-se uma faixa (`avenida.faixa_estacionamento_m`). A largura de cada faixa de rodagem é a que sobra ÷ o número
de faixas (`totalLaneNumber` dos 2 sentidos); as linhas entre faixas só se desenham se essa largura for plausível.
Os passeios contínuos (`avenida.passeio_m`) ficam por fora do asfalto e cortam-se nas passadeiras e nas junções.

Escreve em `data/processed/` (as geometrias em EPSG:4326; os cálculos em EPSG:3763, convenções do README):
- `avenida_estrada.geojson`, `avenida_faixas.geojson`, `avenida_passeios.geojson`, `avenida_lugares.geojson`, cada elemento
  com `origem`: `medida` (patamares, lugares), `interpolada` (a via e a linha do meio entre passadeiras) ou `estimada`
  (passeios contínuos, estacionamento, junções);
- `avenida_deslocamentos.parquet`: `segmento`, `d` (m desde o início do segmento, de `passo_m` em `passo_m`) e `desloc_m`
  (+ à esquerda do sentido do segmento): onde fica o centro do seu sentido, para os carros andarem na faixa e não na berma;
- `avenida_lugares_hora.parquet`: `lugar`, `t` (início da hora) e `estado` (`ocupado`, `livre` ou `desconhecido`): o último
  estado do lugar a meio da hora; sem eventos até lá, ou com a RSU em falha (`falhas.parquet`, ①), é `desconhecido`.
"""

import json
import os
import sys
from pathlib import Path

import numpy as np
import pandas as pd

from riasense import ingerir, sensores

PT = "EPSG:3763"
GEO = "EPSG:4326"
URN_SEG, URN_SC, URN_RSU = "urn:ngsi-ld:RoadSegment:", "urn:ngsi-ld:SmartCrosswalk:", "urn:ngsi-ld:RoadSideUnit:"


# --- Polilinhas em metros (EPSG:3763), em numpy ---


class Linha:
    """Polilinha: comprimento, ponto a uma distância, projeção de um ponto e normal à esquerda."""

    def __init__(self, pts):
        self.p = np.asarray(pts, dtype=float)
        seg = np.diff(self.p, axis=0)
        self.cum = np.concatenate([[0.0], np.cumsum(np.hypot(seg[:, 0], seg[:, 1]))])
        self.comprimento = float(self.cum[-1])

    def ponto(self, d: float) -> np.ndarray:
        d = min(max(d, 0.0), self.comprimento)
        return np.array([np.interp(d, self.cum, self.p[:, 0]), np.interp(d, self.cum, self.p[:, 1])])

    def projetar(self, q) -> float:
        """Distância ao longo da linha do ponto mais próximo de `q`."""
        q = np.asarray(q, dtype=float); a, b = self.p[:-1], self.p[1:]; ab = b - a
        t = np.clip(((q - a) * ab).sum(1) / np.maximum((ab * ab).sum(1), 1e-12), 0, 1)
        prox = a + ab * t[:, None]; i = int(np.argmin(np.hypot(*(prox - q).T)))
        return float(self.cum[i] + t[i] * (self.cum[i + 1] - self.cum[i]))

    def normal(self, d: float) -> tuple[np.ndarray, float]:
        """Normal unitária à esquerda do sentido da linha em `d`, e o rumo (graus, 0 = norte)."""
        a, b = self.ponto(d - 1), self.ponto(d + 1); v = b - a; v = v / np.hypot(*v)
        return np.array([-v[1], v[0]]), float((np.degrees(np.arctan2(v[0], v[1])) + 360) % 360)

    def lateral(self, q) -> tuple[float, float]:
        """Distância com sinal (+ à esquerda) e posição ao longo da linha."""
        d = self.projetar(q); n, _ = self.normal(d)
        return float(np.dot(np.asarray(q) - self.ponto(d), n)), d

    def troco(self, ini: float, fim: float) -> "Linha":
        ds = [ini] + [c for c in self.cum if ini < c < fim] + [fim]
        return Linha([self.ponto(d) for d in ds])


def recortar(linha: Linha, corte: str | None) -> tuple[Linha, float]:
    """`ini:N` fica com os primeiros N m, `fim:N` com os últimos N m. Devolve o troço e onde começa no segmento."""
    if not corte:
        return linha, 0.0
    lado, n = corte.split(":"); n = float(n)
    return (linha.troco(0, n), 0.0) if lado == "ini" else (linha.troco(linha.comprimento - n, linha.comprimento), linha.comprimento - n)


def medir_passadeira(eixo: Linha, patamares: list[np.ndarray], centro_no_eixo: bool = False) -> tuple[float, float]:
    """Centro da via (m, + à esquerda do eixo) e largura numa passadeira: o meio e a distância dos bordos interiores dos 2
    patamares (o vértice de cada patamar mais virado para o outro)."""
    lats = [[eixo.lateral(v)[0] for v in p] for p in patamares]
    esq, dir_ = (0, 1) if np.mean(lats[0]) > np.mean(lats[1]) else (1, 0)
    bordo_esq, bordo_dir = min(lats[esq]), max(lats[dir_])
    return (0.0 if centro_no_eixo else (bordo_esq + bordo_dir) / 2), bordo_esq - bordo_dir


def perfil(posicoes, centros, larguras):
    """Centro e largura ao longo da cadeia: linear entre passadeiras, constante antes da 1.ª e depois da última."""
    o = np.argsort(posicoes); S, C, W = (np.asarray(x, dtype=float)[o] for x in (posicoes, centros, larguras))
    return lambda d: (float(np.interp(d, S, C)), float(np.interp(d, S, W)))


def sentidos(centro: float, largura: float, estac: float) -> tuple[float, float, float, float, float]:
    """Bordos, linha do meio e centro de cada sentido (+ à esquerda do eixo). O estacionamento fica do lado direito."""
    b_esq, b_dir = centro + largura / 2, centro - largura / 2
    trafego_dir = b_dir + estac
    meio = (b_esq + trafego_dir) / 2
    return b_esq, b_dir, meio, (meio + trafego_dir) / 2, (b_esq + meio) / 2  # ..., sentido do eixo, sentido contrário


# --- Leitura (DuckDB spatial) ---


def _geometrias(con, csv: Path) -> dict[str, list]:
    """entityId → coordenadas em EPSG:3763 (lista de pontos; nos polígonos, o anel exterior)."""
    linhas = con.execute(
        f"select entityId, ST_AsGeoJSON(ST_Transform(ST_GeomFromGeoJSON(location), '{GEO}', '{PT}')) "
        "from read_csv(?, all_varchar=true, header=true) where location is not null", [str(csv)]).fetchall()
    out = {}
    for i, g in linhas:
        g = json.loads(g)
        out[i] = g["coordinates"][0] if g["type"] == "Polygon" else g["coordinates"]
    return out


def _wkt(pts, fechar=False) -> str:
    pts = [tuple(p) for p in pts] + ([tuple(pts[0])] if fechar else [])
    coords = ", ".join(f"{x:.3f} {y:.3f}" for x, y in pts)
    return f"POLYGON(({coords}))" if fechar else f"LINESTRING({coords})"


def _escrever_geojson(con, itens: list[tuple[str, dict]], destino: Path) -> int:
    """`itens`: (WKT em EPSG:3763, propriedades). Converte para EPSG:4326 no DuckDB."""
    feats = []
    for wkt, props in itens:
        g = con.execute(f"select ST_AsGeoJSON(ST_Transform(ST_GeomFromText(?), '{PT}', '{GEO}'))", [wkt]).fetchall()[0][0]
        feats.append({"type": "Feature", "properties": props, "geometry": json.loads(g)})
    destino.write_text(json.dumps({"type": "FeatureCollection", "features": feats}, ensure_ascii=False), encoding="utf-8")
    return len(feats)


# --- O passo ---


def calcular(referencias: Path, interim: Path, destino: Path, cfg: dict) -> dict[str, int]:
    """Escreve os 4 GeoJSON e os 2 Parquet do corredor e devolve as contagens."""
    a = cfg["avenida"]
    estac_m, passeio_m, passo = a["faixa_estacionamento_m"], a["passeio_m"], a["passo_m"]
    fontes = {n: referencias / f for n, f in (("rs", "RoadSegment.csv"), ("sc", "SmartCrosswalk.csv"),
                                              ("cw", "Crosswalk.csv"), ("sw", "Sidewalk.csv"))}
    fontes |= {"pk": referencias.parent / "smartparking.csv", "estac": interim / "estacionamento.parquet",
               "falhas": destino / "falhas.parquet"}
    for n, f in fontes.items():
        if not f.is_file():
            passo_em_falta = {"falhas": "vigiar", "estac": "ingerir"}.get(n, "(confirma RIASENSE_DATA_RAW)")
            raise FileNotFoundError(f"{f}: corre primeiro `riasense {passo_em_falta}`")
    destino.mkdir(parents=True, exist_ok=True)
    con = sensores.ligar()
    try:
        rs, cw, sw = (_geometrias(con, fontes[n]) for n in ("rs", "cw", "sw"))
        sc = con.execute("select entityId, refCrosswalk, refSidewalks from read_csv(?, all_varchar=true, header=true)",
                         [str(fontes["sc"])]).fetchall()
        sc = {i: (c, json.loads(s)) for i, c, s in sc}
        faixas_seg = dict(con.execute("select entityId, try_cast(totalLaneNumber as double) from read_csv(?, all_varchar=true, header=true)",
                                      [str(fontes["rs"])]).fetchall())

        # 1. As cadeias: o eixo (o 1.º segmento de cada par, seguidos) e o perfil medido nas passadeiras
        cadeias = []
        for c in a["cadeias"]:
            partes, mapa, inicio = [], [], 0.0
            for s1, s2, corte in c["pares"]:
                linha, corte0 = recortar(Linha(rs[URN_SEG + str(s1)]), corte)
                partes.append(linha.p if not partes else linha.p[1:])
                mapa.append({"s1": URN_SEG + str(s1), "s2": URN_SEG + str(s2), "inicio": inicio, "corte0": corte0, "comp": linha.comprimento,
                             "faixas": (faixas_seg[URN_SEG + str(s1)], faixas_seg[URN_SEG + str(s2)])})
                inicio += linha.comprimento
            eixo = Linha(np.concatenate(partes))
            medidas = []
            for p in c["passadeiras"]:
                cw_id, pats = sc[URN_SC + p]
                centro, larg = medir_passadeira(eixo, [np.asarray(sw[x]) for x in pats], c.get("eixo_e_centro", False))
                medidas.append({"sc": p, "s": eixo.projetar(np.mean(cw[cw_id], axis=0)), "centro": centro, "largura": larg})
            f = perfil([m["s"] for m in medidas], [m["centro"] for m in medidas], [m["largura"] for m in medidas])
            cadeias.append({"cfg": c, "eixo": eixo, "mapa": mapa, "medidas": medidas, "perfil": f, "estac": None})

        # 2. Os lugares com sensor do corredor e a faixa de estacionamento do lado deles (à direita do eixo)
        rsus = [URN_RSU + r.split(":")[-1] for r in a["rsu_estacionamento"]]
        lug = con.execute(
            f"""select entityId, any_value(json_extract_string(documentJson, '$.refDevice')) as rsu,
                 any_value(ST_AsGeoJSON(ST_Transform(ST_Point(
                   cast(json_extract_string(documentJson, '$.location.coordinates[0]."$numberDouble"') as double),
                   cast(json_extract_string(documentJson, '$.location.coordinates[1]."$numberDouble"') as double)), '{GEO}', '{PT}'))) as g
               from read_csv(?, all_varchar=true, header=true) group by 1 having rsu in (select unnest(?::varchar[])) order by 1""",
            [str(fontes["pk"]), rsus]).fetchall()
        lugares_pt = {i: (r, np.asarray(json.loads(g)["coordinates"])) for i, r, g in lug}
        com_estac = [c for c in cadeias if c["cfg"].get("estacionamento")]
        if not com_estac:
            lugares_pt = {}  # sem cadeia com estacionamento, não há onde pôr os carros
        for c in com_estac if lugares_pt else []:
            ds = [c["eixo"].projetar(p) for _, p in lugares_pt.values()]
            folga = a["folga_estacionamento_m"]
            c["estac"] = (max(0.0, min(ds) - folga), min(c["eixo"].comprimento, max(ds) + folga))
        estac_em = lambda c, d: estac_m if c["estac"] and c["estac"][0] <= d <= c["estac"][1] else 0.0

        # 3. Asfalto, linhas e passeios, por amostragem ao longo de cada cadeia
        estrada, faixas, passeios = [], [], []
        for c in cadeias:
            e, nome = c["eixo"], c["cfg"]["nome"]
            ds = list(np.arange(0, e.comprimento, passo)) + [e.comprimento]
            esq, dir_, meio, borda_estac = [], [], [], []
            for d in ds:
                n, _ = e.normal(d); p = e.ponto(d); b_esq, b_dir, m, _, _ = sentidos(*c["perfil"](d), estac_em(c, d))
                esq.append(p + n * b_esq); dir_.append(p + n * b_dir); meio.append(p + n * m)
                if estac_em(c, d): borda_estac.append(p + n * (b_dir + estac_m))
            n_dir, n_esq = c["mapa"][-1]["faixas"]
            w_med = float(np.mean([c["perfil"](d)[1] for d in ds]))
            larg_faixa = (w_med - (estac_m if c["estac"] else 0.0)) / (n_dir + n_esq)
            duvidosas = bool(c["cfg"].get("faixas_por_confirmar"))
            estrada.append((_wkt(esq + dir_[::-1], fechar=True), {
                "nome": nome, "origem": "interpolada", "segmentos": [m["s1"] for m in c["mapa"]] + [m["s2"] for m in c["mapa"]],
                "faixas_por_sentido": f"{n_dir:.0f}+{n_esq:.0f}", "largura_m": [round(m["largura"], 1) for m in c["medidas"]],
                "largura_faixa_m": round(larg_faixa, 2), "faixas_por_confirmar": duvidosas,
                "nota": "posição e largura medidas nas passadeiras; interpoladas entre elas"}))
            faixas.append((_wkt(meio), {"nome": nome, "tipo": "meio", "tracejado": False, "origem": "interpolada"}))
            if not duvidosas and a["largura_faixa_min_m"] <= larg_faixa <= a["largura_faixa_max_m"]:
                for lado, nf, sinal in (("direito", n_dir, -1), ("esquerdo", n_esq, 1)):
                    for k in range(1, int(nf)):
                        pts = [e.ponto(d) + e.normal(d)[0] * (sentidos(*c["perfil"](d), estac_em(c, d))[2] + sinal * k * larg_faixa) for d in ds]
                        faixas.append((_wkt(pts), {"nome": nome, "tipo": "entre faixas", "lado": lado, "tracejado": True, "origem": "interpolada"}))
            if borda_estac:
                faixas.append((_wkt(borda_estac), {"nome": nome, "tipo": "limite do estacionamento", "tracejado": False, "origem": "estimada"}))
            for lado, borda, sinal in (("esquerdo", esq, 1), ("direito", dir_, -1)):
                fora = [b + e.normal(d)[0] * sinal * passeio_m for b, d in zip(borda, ds)]
                passeios.append((_wkt(list(borda) + fora[::-1], fechar=True), {"nome": nome, "lado": lado, "largura_m": passeio_m, "origem": "estimada"}))

        # junções: fecho convexo do asfalto perto de cada nó (a ponta de um segmento, no config)
        con.execute("create temp table asf as select ST_Union_Agg(ST_GeomFromText(w)) g from (select unnest(?::varchar[]) w)",
                    [[w for w, _ in estrada]])
        for j in a["juncoes"]:
            pts = rs[URN_SEG + str(j["segmento"])]; x, y = pts[0] if j["ponta"] == "ini" else pts[-1]
            w = con.execute("select ST_AsText(ST_ConvexHull(ST_Intersection(g, ST_Buffer(ST_Point(?, ?), ?)))) from asf",
                            [x, y, a["raio_juncao_m"]]).fetchall()[0][0]
            if w and not w.endswith("EMPTY"):
                estrada.append((w, {"nome": f"junção ({j['nome']})", "origem": "estimada"}))

        # passeios contínuos: menos o asfalto (com as junções) e as passadeiras do corredor (com folga)
        corredor = con.execute("select ST_AsText(ST_Union_Agg(ST_Buffer(ST_GeomFromText(w), ?))) from (select unnest(?::varchar[]) w)",
                               [a["raio_corredor_m"], [_wkt(c["eixo"].p) for c in cadeias]]).fetchall()[0][0]
        fora_sc = {URN_SC + s for s in a.get("passadeiras_fora", [])}
        cw_corr = [_wkt(v, fechar=True) for k, v in cw.items()]
        pas_final = []
        con.execute(
            """create temp table cortes as select ST_Union_Agg(g) g from (
                 select ST_Buffer(ST_GeomFromText(w), ?) g from (select unnest(?::varchar[]) w)
                 union all select ST_GeomFromText(w) from (select unnest(?::varchar[]) w))""",
            [a["folga_passadeira_m"], cw_corr, [w for w, _ in estrada]])
        for w, props in passeios:
            partes = con.execute(
                """select ST_AsText(x.geom), ST_Area(x.geom) from (
                     select unnest(ST_Dump(ST_Difference(ST_GeomFromText(?), (select g from cortes)))) as x)""", [w]).fetchall()
            pas_final += [(p, props | {"area_m2": round(ar, 1)}) for p, ar in partes if ar > 1.0]
        for sid, (cw_id, pats) in sc.items():
            if sid in fora_sc: continue
            for x in pats:
                dentro = con.execute("select ST_Intersects(ST_GeomFromText(?), ST_GeomFromText(?))", [_wkt(sw[x], fechar=True), corredor]).fetchall()[0][0]
                if dentro:
                    pas_final.append((_wkt(sw[x], fechar=True), {"id": x, "origem": "medida"}))

        # 4. Lugares: ao centro da faixa de estacionamento, com o rumo da rua; longe demais, fica onde foi medido
        lugares = []
        for i, (rsu, p) in lugares_pt.items():
            c = min(com_estac, key=lambda c: abs(c["eixo"].lateral(p)[0]))
            d = c["eixo"].projetar(p); n, rumo = c["eixo"].normal(d); centro, larg = c["perfil"](d)
            pos = c["eixo"].ponto(d) + n * (centro - larg / 2 + estac_m / 2)
            desvio = float(np.hypot(*(pos - p)))
            por_confirmar = desvio > a["desvio_lugar_max_m"]
            lugares.append((f"POINT({(p if por_confirmar else pos)[0]:.3f} {(p if por_confirmar else pos)[1]:.3f})", {
                "id": i, "rsu": rsu, "rumo_graus": round(rumo, 1), "estacionamento": "paralelo", "origem": "medida",
                "desvio_m": round(desvio, 1), "posicao": "por confirmar (mostra-se onde foi medido)" if por_confirmar else "na faixa de estacionamento"}))

        n_geo = {f"avenida_{nome}.geojson": _escrever_geojson(con, itens, destino / f"avenida_{nome}.geojson")
                 for nome, itens in (("estrada", estrada), ("faixas", faixas), ("passeios", pas_final), ("lugares", lugares))}

        # 5. Deslocamentos: o centro de cada sentido, em cada segmento das cadeias, de `passo_m` em `passo_m`
        linhas = []
        for c in cadeias:
            for m in c["mapa"]:
                for s, inverso in ((m["s1"], False), (m["s2"], True)):
                    comp = Linha(rs[s]).comprimento; comp1 = Linha(rs[m["s1"]]).comprimento
                    for d in np.arange(0, comp + 1e-9, passo):
                        d1 = (comp - d) * comp1 / comp if inverso else d  # o mesmo ponto, medido no 1.º segmento do par
                        dc = m["inicio"] + d1 - m["corte0"]
                        _, _, _, s_eixo, s_contra = sentidos(*c["perfil"](dc), estac_em(c, dc))
                        linhas.append((s, round(float(d), 1), round(-s_contra if inverso else s_eixo, 2)))
        con.register("desl", pd.DataFrame(linhas, columns=["segmento", "d", "desloc_m"]))
        con.sql("select * from desl order by segmento, d").write_parquet(str(destino / "avenida_deslocamentos.parquet"))

        # 6. Estado de cada lugar a meio de cada hora; desconhecido sem eventos até lá ou com a RSU em falha (①)
        inicio = pd.Timestamp(cfg["periodo_dados"]["inicio"]).floor("h"); fim = pd.Timestamp(cfg["periodo_dados"]["fim"]).ceil("h")
        con.execute(
            """create temp table lh as
            with h as (select unnest(generate_series(?::timestamp, ?::timestamp - interval 1 hour, interval 1 hour)) t),
            l as (select unnest(?::varchar[]) lugar, unnest(?::varchar[]) rsu),
            e as (select id, t, arg_min(estado, duracao_s) estado from read_parquet(?) where id in (select lugar from l) group by id, t),
            g as (select l.lugar, l.rsu, h.t, h.t + interval 30 minute meio from l cross join h)
            select g.lugar, g.t,
                   case when exists (select 1 from read_parquet(?) f where f.sensor = g.rsu and g.meio >= f.inicio and g.meio < f.fim)
                          or e.estado is null then 'desconhecido'
                        when e.estado = 'occupied' then 'ocupado' else 'livre' end as estado
            from g asof left join e on g.lugar = e.id and g.meio >= e.t order by 1, 2""",
            [str(inicio), str(fim), list(lugares_pt), [r for r, _ in lugares_pt.values()], str(fontes["estac"]), str(fontes["falhas"])])
        con.sql("select * from lh").write_parquet(str(destino / "avenida_lugares_hora.parquet"))
        n_lh = con.execute("select count(*) from lh").fetchall()[0][0]
    finally:
        con.close()
    return dict(n_geo) | {"avenida_deslocamentos.parquet": len(linhas), "avenida_lugares_hora.parquet": int(n_lh)}


def correr(cfg: dict) -> int:
    """Subcomando `riasense avenida`: lê RIASENSE_DATA_RAW, RIASENSE_DATA_INTERIM e escreve em RIASENSE_DATA_PROCESSED."""
    bruto = os.environ.get("RIASENSE_DATA_RAW")
    if not bruto or not Path(bruto).is_dir():
        print("erro: RIASENSE_DATA_RAW tem de apontar para a pasta dos CSV do Living Lab", file=sys.stderr)
        return 1
    interim = Path(os.environ.get("RIASENSE_DATA_INTERIM") or ingerir.INTERIM_PADRAO)
    destino = Path(os.environ.get("RIASENSE_DATA_PROCESSED") or sensores.PROCESSED_PADRAO)
    try:
        n = calcular(Path(bruto) / "reference-entities", interim, destino, cfg)
    except FileNotFoundError as e:
        print(f"erro: {e}", file=sys.stderr)
        return 1
    print("avenida: " + ", ".join(f"{k} {v}" for k, v in n.items()) + f" → {destino}")
    return 0
