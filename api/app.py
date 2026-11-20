"""API fina sobre os Parquet de data/processed/ (ADR-0003): sem base de dados, só leitura.

Um endpoint por camada (① vigiar, ② completar, ③ prever, ④ proteger e o mapa de risco potencial), mais os sensores.
Todos aceitam `sensor` (forma curta `SmartCrosswalk:0019` ou URN completo) e, quando a tabela tem tempo, `desde`/`ate`.

O painel «agora» (ADR-0030, ADR-0032) é a exceção: corre a ① sobre uma fonte em memória (o simulador de dados
fictícios), vem desligado por omissão (`agora.ativo`) e não grava nada em disco. O modo «Ao vivo» (ADR-0049) também:
lê o socket.io público do Living Lab só enquanto alguém está no modo, e guarda só o último retrato, em memória.
"""

import json
import threading
from datetime import datetime
from typing import Annotated, Literal

import duckdb
from fastapi import FastAPI, HTTPException, Query
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

from consultas import PorCalcular, alertas_da_falha, boletim_camara, consultar, maximos_calor, pasta_resultados, poligonos_passadeiras
import ao_vivo
import ao_vivo_mapa
import ao_vivo_sensores
from riasense import agora, config

app = FastAPI(title="RiaSense", description="Resultados pré-calculados das 4 camadas sobre o Living Lab de Aveiro.")
# Dados públicos e só de leitura: o mapa (outra origem, porta 5173) pode pedir sem credenciais. O POST serve só os
# botões do simulador do painel «agora» e o ligar e desligar do «Ao vivo», que mudam o estado em memória e nada em disco.
# Só a web de desenvolvimento local (o Vite noutra porta) precisa de CORS: na VM, a web e a API têm a mesma origem (ADR-0028).
# Com «*», qualquer site aberto por um visitante podia disparar os POST do simulador e do «Ao vivo».
app.add_middleware(CORSMiddleware, allow_origin_regex=r"http://(localhost|127\.0\.0\.1)(:\d+)?", allow_methods=["GET", "POST"])

# Validação na fronteira (convenções do README): o sensor tem a forma Tipo:Id, com ou sem o prefixo urn:ngsi-ld:.
Sensor = Annotated[
    str | None,
    Query(min_length=3, max_length=120, pattern=r"^(urn:ngsi-ld:)?[A-Za-z]+:[A-Za-z0-9:_.\-]+$",
          description="SmartCrosswalk:0019 ou urn:ngsi-ld:SmartCrosswalk:0019"),
]
Desde = Annotated[datetime | None, Query(description="ISO 8601; sem fuso, é UTC (= hora local em novembro)")]
Ate = Annotated[datetime | None, Query(description="ISO 8601, inclusive")]
Limite = Annotated[int, Query(ge=1, le=10_000)]
Deslocamento = Annotated[int, Query(ge=0)]
Horizonte = Annotated[int | None, Query(ge=1, le=24, description="horas à frente (prever.horizontes_h, ADR-0027)")]


def _responder(nome: str, sensor=None, desde=None, ate=None, limite=1000, deslocamento=0, **extra):
    if desde and ate and desde > ate:
        raise HTTPException(status_code=422, detail="`desde` tem de ser anterior ou igual a `ate`")
    try:
        dados = consultar(nome, sensor, desde, ate, limite, deslocamento, **extra)
    except PorCalcular as e:
        return JSONResponse(status_code=503, content={"estado": "por calcular", "motivo": str(e)})
    return {"dados": dados, "n": len(dados), "limite": limite, "deslocamento": deslocamento}


@app.get("/health")
def health():
    return {"estado": "ok"}


@app.get("/ready")
def ready():
    """Pronta quando a configuração é válida e a pasta dos resultados existe."""
    try:
        config.carregar()
    except config.ConfigInvalida as e:
        return JSONResponse(status_code=503, content={"estado": "indisponivel", "motivo": str(e)})
    processados = pasta_resultados()
    if not processados.is_dir():
        return JSONResponse(status_code=503, content={"estado": "indisponivel", "motivo": f"{processados} não existe"})
    return {"estado": "pronta"}


@app.get("/sensores", summary="Sensores com posição (EPSG:3763 e WGS84) e RSU")
def sensores(sensor: Sensor = None, tipo: Literal["passadeira", "zona", "segmento", "estacionamento"] | None = None,
             limite: Limite = 1000, deslocamento: Deslocamento = 0):
    return _responder("sensores", sensor, limite=limite, deslocamento=deslocamento, tipo=tipo)


@app.get("/mapa/passadeiras", summary="As passadeiras desenhadas no mapa com a forma real, do Living Lab (ADR-0038)")
def mapa_passadeiras():
    """Um polígono (GeoJSON) por passadeira, com o `id` do sensor, a rua e a RSU. Lê o ficheiro, não calcula nada."""
    try:
        dados = poligonos_passadeiras()
    except PorCalcular as e:
        return JSONResponse(status_code=503, content={"estado": "por calcular", "motivo": str(e)})
    return {"dados": dados, "n": len(dados), "limite": len(dados), "deslocamento": 0}


@app.get("/vigiar/falhas", summary="① Falhas inesperadas, de rede ou de dispositivo")
def falhas(sensor: Sensor = None, desde: Desde = None, ate: Ate = None,
           limite: Limite = 1000, deslocamento: Deslocamento = 0):
    return _responder("falhas", sensor, desde, ate, limite, deslocamento)


@app.get("/vigiar/falhas/alerta", summary="① A entidade NGSI-LD `Alert` de uma falha, para o IT copiar (ADR-0053)")
def alerta_da_falha(
    sensor: Annotated[str, Query(min_length=3, max_length=120, pattern=r"^(urn:ngsi-ld:)?[A-Za-z]+:[A-Za-z0-9:_.\-]+$",
                                 description="o sensor da falha, como em /vigiar/falhas")],
    inicio: Annotated[datetime, Query(description="o início da falha, como em /vigiar/falhas")],
):
    """Lê `ngsi-ld/falhas.jsonld` (ADR-0008) e devolve o `Alert` dessa falha tal como está, ou nenhum."""
    try:
        dados = alertas_da_falha(sensor, inicio)
    except PorCalcular as e:
        return JSONResponse(status_code=503, content={"estado": "por calcular", "motivo": str(e)})
    return {"dados": dados, "n": len(dados), "limite": len(dados), "deslocamento": 0}


@app.get("/completar/sensores-virtuais", summary="② Estimativas dos sensores virtuais, com intervalo")
def sensores_virtuais(sensor: Sensor = None, desde: Desde = None, ate: Ate = None,
                      limite: Limite = 1000, deslocamento: Deslocamento = 0):
    return _responder("sensores_virtuais", sensor, desde, ate, limite, deslocamento)


@app.get("/prever/previsoes",
         summary="③ Previsão a h horas (só onde ganha à referência e à persistência, ADR-0027)")
def previsoes(sensor: Sensor = None, desde: Desde = None, ate: Ate = None, horizonte_h: Horizonte = None,
              limite: Limite = 1000, deslocamento: Deslocamento = 0):
    return _responder("previsoes", sensor, desde, ate, limite, deslocamento, horizonte_h=horizonte_h)


@app.get("/proteger/passadeiras", summary="④ Abrandamento por passadeira, com placebo e passadeiras assinaladas")
def proteger_passadeiras(sensor: Sensor = None, limite: Limite = 1000, deslocamento: Deslocamento = 0):
    return _responder("proteger_passadeiras", sensor, limite=limite, deslocamento=deslocamento)


@app.get("/proteger/intervalos", summary="④ Velocidade, veículos e travessias por passadeira e intervalo de 15 min")
def proteger_intervalos(sensor: Sensor = None, desde: Desde = None, ate: Ate = None,
                        limite: Limite = 1000, deslocamento: Deslocamento = 0):
    return _responder("proteger_intervalos", sensor, desde, ate, limite, deslocamento)


@app.get("/proteger/boletim", summary="④ O boletim de segurança pedonal para a Câmara (ADR-0052)")
def boletim():
    """O top 3 do risco potencial da semana, o excesso de velocidade na zona da demo e as passadeiras com semáforo."""
    zona = [f"urn:ngsi-ld:{p}" for p in config.carregar()["demo"]["passadeiras"]]
    try:
        dados = boletim_camara(zona)
    except PorCalcular as e:
        return JSONResponse(status_code=503, content={"estado": "por calcular", "motivo": str(e)})
    return {"dados": [dados], "n": 1, "limite": 1, "deslocamento": 0}


@app.get("/proteger/risco-potencial", summary="④ Mapa de risco potencial (ADR-0007): só pontos com sensor")
def risco_potencial(sensor: Sensor = None, desde: Desde = None, ate: Ate = None,
                    limite: Limite = 1000, deslocamento: Deslocamento = 0):
    """Por passadeira e hora, com as componentes para a legenda; a hora do cursor vai em `desde`/`ate`."""
    return _responder("risco_potencial", sensor, desde, ate, limite, deslocamento)


@app.get("/mapa/ruas-com-sensor", summary="As ruas com sensor: a geometria real dos troços medidos (ADR-0034, ponto 2)")
def ruas_com_sensor():
    """GeoJSON dos troços com câmara ou radar e dos troços junto às passadeiras (passo `riasense carros`)."""
    caminho = pasta_resultados() / "ruas_com_sensor.geojson"
    if not caminho.is_file():
        return JSONResponse(status_code=503, content={"estado": "por calcular", "motivo": f"{caminho.name} não existe: corre `riasense carros`"})
    return json.loads(caminho.read_text(encoding="utf-8"))


@app.get("/mapa/segmentos-carros", summary="Os 194 segmentos com câmara ou radar: a geometria onde andam os carros (ADR-0034)")
def segmentos_carros():
    """GeoJSON dos segmentos com câmara ou radar (passo `riasense carros`): os carros desenham-se sobre estas linhas."""
    caminho = pasta_resultados() / "segmentos_carros.geojson"
    if not caminho.is_file():
        return JSONResponse(status_code=503, content={"estado": "por calcular", "motivo": f"{caminho.name} não existe: corre `riasense carros`"})
    return json.loads(caminho.read_text(encoding="utf-8"))


@app.get("/mapa/edificios-medidos", summary="Os edifícios da zona da demo com a altura medida pelo LiDAR da DGT (ADR-0050)")
def edificios_medidos():
    """GeoJSON dos edifícios da zona com `altura_m` (LiDAR DGT 2024, MDS − MDT) e o `id` do edifício nos tiles do mapa base."""
    caminho = pasta_resultados() / "edificios_alturas.geojson"
    if not caminho.is_file():
        return JSONResponse(status_code=503, content={"estado": "por calcular", "motivo": f"{caminho.name} não existe: ver web/scripts/lidar"})
    return json.loads(caminho.read_text(encoding="utf-8"))


@app.get("/mapa/carros", summary="As passagens medidas por segmento e hora (ADR-0034): pede-se uma hora de cada vez")
def carros(sensor: Sensor = None, desde: Desde = None, ate: Ate = None, limite: Limite = 1000, deslocamento: Deslocamento = 0):
    """Por segmento e hora: o tipo de sensor escolhido, os veículos e a velocidade média (m/s). Nada se estima."""
    return _responder("segmentos_hora", sensor, desde, ate, limite, deslocamento)


# As rotas fixas vêm antes de /mapa/avenida/{camada}, senão o FastAPI tomava «lugares-hora» por uma camada.
@app.get("/mapa/avenida/lugares-hora", summary="O estado de cada lugar da avenida por hora (ADR-0044): pede-se uma hora de cada vez")
def avenida_lugares_hora(sensor: Sensor = None, desde: Desde = None, ate: Ate = None,
                         limite: Limite = 1000, deslocamento: Deslocamento = 0):
    """Por lugar e hora: `ocupado`, `livre` ou `desconhecido` (sem eventos ainda, ou a RSU em falha)."""
    return _responder("avenida_lugares_hora", sensor, desde, ate, limite, deslocamento)


@app.get("/mapa/avenida/deslocamentos", summary="O deslocamento lateral de cada segmento do corredor até ao centro da sua faixa (ADR-0044)")
def avenida_deslocamentos():
    """{segmento: {passo, desloc_m}}: `desloc_m[i]` vale a `i × passo` metros do início do segmento; + é para a esquerda."""
    caminho = pasta_resultados() / "avenida_deslocamentos.parquet"
    if not caminho.is_file():
        return JSONResponse(status_code=503, content={"estado": "por calcular", "motivo": f"{caminho.name} não existe: corre `riasense avenida`"})
    con = duckdb.connect()
    try:
        linhas = con.sql("select segmento, list(d order by d), list(desloc_m order by d) from read_parquet($f) group by segmento order by segmento",
                         params={"f": str(caminho)}).fetchall()
    finally:
        con.close()
    # O pipeline amostra cada segmento de passo em passo desde d = 0; o passo lê-se dos dados, não do config.
    return {seg: {"passo": round(ds[1] - ds[0], 6) if len(ds) > 1 else None, "desloc_m": [round(v, 3) for v in vs]}
            for seg, ds, vs in linhas}


@app.get("/mapa/avenida/{camada}", summary="A avenida em 3D (ADR-0044): a via, as faixas, os passeios ou os lugares, em GeoJSON")
def avenida(camada: Literal["estrada", "faixas", "passeios", "lugares"]):
    """GeoJSON do passo `riasense avenida`, tal qual; cada elemento diz a `origem` (medida, interpolada ou estimada)."""
    caminho = pasta_resultados() / f"avenida_{camada}.geojson"
    if not caminho.is_file():
        return JSONResponse(status_code=503, content={"estado": "por calcular", "motivo": f"{caminho.name} não existe: corre `riasense avenida`"})
    return json.loads(caminho.read_text(encoding="utf-8"))


@app.get("/mapa/zonas-hora", summary="As visitas medidas por zona turística e hora (ADR-0047): pede-se uma hora de cada vez")
def zonas_hora(sensor: Sensor = None, desde: Desde = None, ate: Ate = None, limite: Limite = 1000, deslocamento: Deslocamento = 0):
    """Por zona e hora: as visitas que entraram nessa hora. Só as horas com visitas; nada se estima."""
    return _responder("zonas_hora", sensor, desde, ate, limite, deslocamento)


@app.get("/mapa/calor/maximos", summary="O máximo por hora na semana de cada tipo de sensor, com os estimados da ② (ADR-0047, ponto 4)")
def calor_maximos():
    """A escala fixa do mapa de calor: cada tipo (passadeiras, zonas, segmentos) normaliza-se pelo seu `maximo`."""
    try:
        return maximos_calor()
    except PorCalcular as e:
        return JSONResponse(status_code=503, content={"estado": "por calcular", "motivo": str(e)})


@app.get("/contexto/luminosidade", summary="Dia, crepúsculo ou noite em cada hora, pela posição do sol (ADR-0018)")
def luminosidade(desde: Desde = None, ate: Ate = None, limite: Limite = 1000, deslocamento: Deslocamento = 0):
    """Contexto «às escuras» para o cursor de hora e o cartão: não entra no risco potencial nem na ④."""
    return _responder("luminosidade", None, desde, ate, limite, deslocamento)


@app.get("/completar/proximo-sensor", summary="② Onde pôr o próximo sensor: ranking e «verificar o sensor» (ADR-0015)")
def proximo_sensor(tipo: Literal["passadeira", "zona"] | None = None,
                   motivo: Literal["ranking", "verificar o sensor"] | None = None,
                   limite: Limite = 1000, deslocamento: Deslocamento = 0):
    """A redução potencial estimada é uma hipótese, não uma medição (ADR-0015)."""
    return _responder("proximo_sensor", limite=limite, deslocamento=deslocamento, tipo=tipo, motivo=motivo)


@app.get("/completar/avaliacao", summary="② Erro dos sensores virtuais contra a referência, por cenário, tipo e dias")
def avaliacao_completar(tipo: Literal["passadeira", "zona", "segmento"] | None = None,
                        cenario: Literal["deixar_um_de_fora", "simulacao"] | None = None,
                        dias: Literal["todos", "semana", "fim_de_semana"] | None = None,
                        limite: Limite = 1000, deslocamento: Deslocamento = 0):
    return _responder("avaliacao_completar", limite=limite, deslocamento=deslocamento, tipo=tipo, cenario=cenario,
                      dias=dias)


@app.get("/prever/avaliacao",
         summary="③ Erro da previsão contra a referência e a persistência, por horizonte e tipo (ADR-0027)")
def avaliacao_prever(tipo: Literal["passadeira", "zona", "segmento", "estacionamento"] | None = None,
                     horizonte_h: Horizonte = None, limite: Limite = 1000, deslocamento: Deslocamento = 0):
    return _responder("avaliacao_prever", limite=limite, deslocamento=deslocamento, tipo=tipo, horizonte_h=horizonte_h)


# --- Painel «agora» (ADR-0030, ADR-0032) ---

_simulador: dict[str, agora.Simulador] = {}  # só em memória: reiniciar a API apaga o estado (ADR-0030, ponto 5)
_trinco = threading.Lock()  # os pontos de acesso são síncronos (threads): um pedido de cada vez mexe no simulador


def _config_agora():
    """O config, e a resposta que diz porque não há painel (desligado, sem autorização ou sem base), ou None."""
    cfg = config.carregar()
    a = cfg["agora"]
    if not a["ativo"]:
        return cfg, JSONResponse(status_code=503, content={"estado": "desligado", "motivo": "agora.ativo: false"})
    if a["fonte"] != "simulador":
        return cfg, JSONResponse(status_code=503, content={
            "estado": "sem ligação", "motivo": f"a fonte «{a['fonte']}» precisa da autorização do IT (ADR-0030)"})
    caminho = pasta_resultados() / "agora_base.parquet"
    if not caminho.is_file():
        return cfg, JSONResponse(status_code=503, content={
            "estado": "por calcular", "motivo": f"{caminho.name} não existe: corre `riasense agora`"})
    return cfg, None


def _fonte_agora(novo: bool = False):
    """O simulador, ou a resposta que diz porque não há. `novo` cria-o de novo: o relógio volta às 19h50 (ADR-0032)."""
    cfg, erro = _config_agora()
    if erro is not None:
        return cfg, erro
    if novo or "sim" not in _simulador:
        con = duckdb.connect()
        try:
            tab = con.read_parquet(str(pasta_resultados() / "agora_base.parquet")).df()
        finally:
            con.close()
        _simulador["sim"] = agora.simulador_do_config(tab, cfg)
    return cfg, _simulador["sim"]


def _estado_agora(cfg: dict, sim: agora.Simulador) -> dict:
    return agora.estado(sim, float(cfg["agora"]["prob_max"]), float(cfg["agora"]["intervalo_s"]),
                        falha_min=float(cfg["vigiar"]["falha_min_horas"]) * 60)


@app.get("/agora/disponivel", summary="O painel «agora» existe nesta API? Não cria o simulador nem põe o relógio a andar")
def agora_disponivel():
    cfg, erro = _config_agora()
    return erro if erro is not None else {"disponivel": True, "fonte": cfg["agora"]["fonte"], "etiqueta": agora.ETIQUETA}


@app.get("/agora", summary="Painel «agora»: último dado e «sem comunicação» por sensor e por RSU (simulação, ADR-0032)")
def painel_agora():
    """Cada resposta leva `fonte` («simulador») e a `etiqueta`: a web mostra-a sempre que a fonte é essa."""
    with _trinco:
        cfg, fonte = _fonte_agora()
        return fonte if isinstance(fonte, JSONResponse) else _estado_agora(cfg, fonte)


@app.post("/agora/simulador/iniciar", summary="Abre o painel: o simulador começa às 19h50, com a semente do config")
def iniciar_simulador():
    with _trinco:
        cfg, fonte = _fonte_agora(novo=True)
        return fonte if isinstance(fonte, JSONResponse) else _estado_agora(cfg, fonte)


@app.post("/agora/simulador/falha", summary="Simula a falha da RSU de demo.incidente: as passadeiras e os segmentos deixam de comunicar")
def simular_falha():
    with _trinco:
        cfg, fonte = _fonte_agora()
        if isinstance(fonte, JSONResponse):
            return fonte
        fonte.simular_falha()
        return _estado_agora(cfg, fonte)


@app.post("/agora/simulador/repor", summary="Repõe o simulador: volta às 19h50, com a mesma semente e sem a falha")
def repor_simulador():
    with _trinco:
        cfg, fonte = _fonte_agora(novo=True)
        return fonte if isinstance(fonte, JSONResponse) else _estado_agora(cfg, fonte)


# --- Modo «Ao vivo» (ADR-0049) ---

_ao_vivo: dict[str, ao_vivo.AoVivo] = {}  # uma ligação para toda a API, criada no 1.º pedido; nada em disco
_DESLIGADO_AO_VIVO = {"estado": ao_vivo.DESLIGADO, "motivo": "ao_vivo.ativo: false"}


def _config_ao_vivo() -> dict | None:
    """A secção `ao_vivo` do config, ou None se o botão estiver escondido (`ao_vivo.ativo: false`, só em caso de avaria).

    Mesmo com `ativo: true`, nada liga ao Living Lab antes de alguém clicar no botão (`POST /ao-vivo/ligar`).
    """
    a = config.carregar().get("ao_vivo") or {}
    return a if a.get("ativo") is True else None


def _segmentos_ao_vivo() -> ao_vivo_mapa.Segmentos | None:
    """Os segmentos com câmara ou radar (`segmentos_carros.geojson`), para orientar os veículos parados (ADR-0055).

    Sem o ficheiro (o passo `riasense carros` por correr), os parados ficam com o rumo do socket.
    """
    caminho = pasta_resultados() / "segmentos_carros.geojson"
    if not caminho.is_file():
        return None
    features = json.loads(caminho.read_text(encoding="utf-8")).get("features", [])
    lats = [lat for f in features for _, lat, *_ in (f.get("geometry") or {}).get("coordinates") or []
            if (f.get("geometry") or {}).get("type") == "LineString"]
    return ao_vivo_mapa.Segmentos(features, ao_vivo_mapa.Plano(sum(lats) / len(lats) if lats else 40.64))


_geometria_ao_vivo: dict[str, object] = {}  # os segmentos, as passadeiras e os perfis: lêem-se uma vez, só em memória


def _perfis_ao_vivo() -> ao_vivo_sensores.Perfis | None:
    """O que a semana gravada diz de cada sensor (ADR-0055, pontos 5 e 6), dos Parquet de `data/processed`.

    - o perfil típico: `agora_base.parquet` nas passadeiras e a mediana do `segmentos_hora.parquet` nos segmentos (dia útil ou
      fim de semana, e a hora);
    - o limite da via de cada segmento: `segmentos_hora.parquet`;
    - as escalas do risco potencial: as travessias por hora da semana e o `comportamento_pct` de cada passadeira
      (`risco_potencial.parquet`; nulo com semáforo, ADR-0024), com os pesos de `risco_potencial.pesos` sem a previsão.

    Sem o `agora_base.parquet`, não há ligação aos sensores (o resto do «Ao vivo» continua).
    """
    pasta = pasta_resultados()
    base = pasta / "agora_base.parquet"
    if not base.is_file():
        return None
    con = duckdb.connect()
    try:
        linhas = con.execute("select id, tipo, dia_util, hora, taxa_h from read_parquet(?)", [str(base)]).fetchall()
        tipos = {i: t for i, t, *_ in linhas}
        taxas = {(i, bool(u), int(h)): float(x) for i, _, u, h, x in linhas if x is not None}
        limites, exposicoes, comportamento = {}, [], {}
        base_segmentos, radar = {}, frozenset()
        if (pasta / "segmentos_hora.parquet").is_file():
            hora = str(pasta / "segmentos_hora.parquet")
            limites = {i: float(x) for i, x in con.execute(
                "select id, max(limite_kmh) from read_parquet(?) where limite_kmh is not null group by id", [hora]).fetchall()}
            # O esperado dos segmentos (ADR-0055): a mediana dos veículos por dia útil ou fim de semana e hora.
            base_segmentos = {(i, bool(u), int(h)): float(m) for i, u, h, m in con.execute(
                "select id, dia_util, hora, median(veiculos) from (select id, isodow(t) <= 5 as dia_util, hour(t) as hora,"
                " veiculos from read_parquet(?)) group by id, dia_util, hora", [hora]).fetchall() if m is not None}
            # A ressalva do radar só nos segmentos que ele mede (ADR-0055, ponto 6).
            radar = frozenset(i for (i,) in con.execute(
                "select distinct id from read_parquet(?) where sensor = 'Radar'", [hora]).fetchall())
        if (pasta / "risco_potencial.parquet").is_file():
            risco = str(pasta / "risco_potencial.parquet")
            exposicoes = sorted(float(x) for (x,) in con.execute(
                "select exposicao from read_parquet(?) where exposicao is not null", [risco]).fetchall())
            comportamento = {i: (None if sem or c is None else float(c)) for i, c, sem in con.execute(
                "select id, any_value(comportamento_pct), bool_or(semaforo) from read_parquet(?) group by id", [risco]).fetchall()}
    finally:
        con.close()
    pesos = (config.carregar().get("risco_potencial") or {}).get("pesos") or {}
    return ao_vivo_sensores.Perfis(tipos=tipos, base=taxas, limites=limites, exposicoes=exposicoes, comportamento=comportamento,
                                   base_segmentos=base_segmentos, radar=radar,
                                   peso_exposicao=float(pesos.get("exposicao", 0.5)),
                                   peso_comportamento=float(pesos.get("comportamento", 0.5)))


def _carregados_ao_vivo() -> dict[str, object]:
    if not _geometria_ao_vivo:
        segmentos = _segmentos_ao_vivo()
        perfis = _perfis_ao_vivo()
        try:
            poligonos = poligonos_passadeiras()
        except PorCalcular:
            poligonos = []
        plano = segmentos.plano if segmentos else ao_vivo_mapa.Plano(40.64)
        if perfis is not None and segmentos is not None:
            for ident in segmentos.ids:  # os segmentos com câmara ou radar fora do `agora_base` também contam (sem esperado)
                perfis.tipos.setdefault(ident, "segmento")
        _geometria_ao_vivo.update(segmentos=segmentos, perfis=perfis,
                                  passadeiras=ao_vivo_sensores.Passadeiras(poligonos, plano) if poligonos else None)
    return _geometria_ao_vivo


def _arrumo_ao_vivo(a: dict):
    """Cada ligação arruma os retratos com os parâmetros de `ao_vivo` no config (ADR-0055, ponto 1) e liga-os aos sensores do
    dataset com uma janela nova (pontos 2, 5 e 6)."""
    def novo() -> ao_vivo.Arrumo:
        g = _carregados_ao_vivo()
        sensores = None
        if g["perfis"] is not None:
            sensores = ao_vivo_sensores.Sensores(
                g["perfis"], segmentos=g["segmentos"], passadeiras=g["passadeiras"],
                passadeira_m=float(a.get("passadeira_m", 1)), segmento_m=float(a.get("segmento_m", 8)),
                parado_ms=float(a.get("parado_ms", 0.3)), costura_s=float(a.get("costura_s", 20)),
                costura_m=float(a.get("costura_m", 8)), calada_s=float(a.get("calada_s", 120)),
                janela=ao_vivo_sensores.Janela(janela_s=60 * float(a.get("janela_min", 15)),
                                               minima_s=float(a.get("janela_minima_s", 120))))
        return ao_vivo.Arrumo(fundir_m=float(a.get("fundir_m", 3)), parado_ms=float(a.get("parado_ms", 0.3)),
                              parado_s=float(a.get("parado_s", 30)), rumo_m=float(a.get("rumo_m", 15)),
                              segmentos=g["segmentos"], sensores=sensores)
    return novo


def _ligacao_ao_vivo(a: dict) -> ao_vivo.AoVivo:
    with _trinco:
        if "ligacao" not in _ao_vivo:
            _ao_vivo["ligacao"] = ao_vivo.AoVivo(url=str(a.get("url", ao_vivo.URL)),
                                                 inativo_s=float(a.get("inativo_s", 30)),
                                                 limite_s=float(a.get("limite_s", 10)),
                                                 arrumo=_arrumo_ao_vivo(a))
        return _ao_vivo["ligacao"]


def _ritmo(a: dict) -> dict:
    return {"intervalo_s": float(a.get("intervalo_s", 1)), "etiqueta": ao_vivo.ETIQUETA}


@app.get("/ao-vivo/disponivel", summary="O «Ao vivo» está ligado no config, e há rede? Só abre e fecha uma ligação TCP")
def ao_vivo_disponivel():
    a = _config_ao_vivo()
    if a is None:
        return JSONResponse(status_code=503, content=_DESLIGADO_AO_VIVO)
    lig = _ligacao_ao_vivo(a)
    rede = lig.estado in (ao_vivo.A_LIGAR, ao_vivo.LIGADO) or ao_vivo.ha_rede(lig.url)
    return {"disponivel": rede, "estado": "com rede" if rede else ao_vivo.SEM_REDE, **_ritmo(a)}


@app.post("/ao-vivo/ligar", summary="Entra no «Ao vivo»: vê se há rede e só então abre a ligação ao socket.io do Living Lab")
def ao_vivo_ligar():
    a = _config_ao_vivo()
    if a is None:
        return JSONResponse(status_code=503, content=_DESLIGADO_AO_VIVO)
    lig = _ligacao_ao_vivo(a)
    # O «sem rede» decide-se antes de ligar: sem rede, o cliente do socket.io nem se cria.
    if lig.estado not in (ao_vivo.A_LIGAR, ao_vivo.LIGADO) and not ao_vivo.ha_rede(lig.url):
        return {"estado": ao_vivo.SEM_REDE, **_ritmo(a)}
    return {"estado": lig.ligar(), **_ritmo(a)}


@app.get("/ao-vivo", summary="O último retrato do Living Lab (pedido 1 vez por segundo): estações e deteções de agora")
def ao_vivo_leitura():
    a = _config_ao_vivo()
    if a is None:
        return JSONResponse(status_code=503, content=_DESLIGADO_AO_VIVO)
    return {**_ligacao_ao_vivo(a).leitura(), **_ritmo(a)}


@app.post("/ao-vivo/desligar", summary="Sai do «Ao vivo»: fecha a ligação e esquece o último retrato")
def ao_vivo_desligar():
    lig = _ao_vivo.get("ligacao")  # fecha-se sempre, mesmo que o config tenha mudado entretanto
    return {"estado": lig.desligar() if lig else ao_vivo.DESLIGADO}
