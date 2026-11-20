"""O «Ao vivo» ligado aos sensores do dataset (ADR-0055, pontos 2, 5 e 6), só em memória.

- **Ligação pela posição:** um peão conta para uma passadeira se estiver dentro do seu polígono (ADR-0038) ou a menos de
  `passadeira_m`; um veículo conta para o segmento com câmara ou radar mais próximo, a menos de `segmento_m` da linha. Só
  contam os que andam (um carro estacionado ou um peão parado no passeio não passa nem atravessa).
- **Costura:** o Living Lab troca o id do mesmo objeto a meio; um id novo que aparece onde um sumiu há pouco é o mesmo, e
  não conta outra vez. Medido com o socket real (3 min): sem a costura e com 5 m, as passadeiras davam 1,9 vezes o
  perfil da semana e os segmentos 7,3; com a costura, 1 m e só os que andam, 0,7 e 2,0.
- **Janela móvel:** cada sensor guarda os ids que viu nos últimos `janela_min` minutos (desde que se abriu o modo, se for
  menos). As contagens passam a **por hora** (n a dividir pelo tempo da janela) antes de entrarem em qualquer escala; com
  menos de `janela_minima_s` de janela, ainda não há número.
- **Esperado:** o perfil típico da semana gravada daqui a 1 h e a 3 h, por dia útil ou fim de semana e hora: nas passadeiras,
  o `agora_base.parquet`; nos segmentos, a mediana do `segmentos_hora.parquet` (ADR-0055). Não é a previsão da ③
  (ADR-0010). A contagem ao vivo é aproximada (nos segmentos, 2 a 4,5 vezes o perfil): compara-se na mesma, «o que conta é
  a ideia».
- **Risco potencial ao vivo:** a regra do ADR-0013 com a exposição ao vivo (as travessias por hora, no percentil das da
  semana gravada) e o comportamento da semana (o `comportamento_pct` da ④, fixo por passadeira; nulo com semáforo,
  ADR-0024), com os pesos da exposição e do comportamento renormalizados (sem previsão: 0,5 / 0,5). A velocidade de agora
  não entra no risco: fica no «Trânsito» e no anel.
- **«Trânsito» ao vivo:** por segmento, a mediana da velocidade dos veículos que circulam agora, e se passa o limite da via
  (ADR-0039): os veículos desse segmento levam `acima`.

Nada vai para o disco nem para os registos.
"""

from __future__ import annotations

import math
import statistics
from bisect import bisect_left, bisect_right
from collections import defaultdict
from collections.abc import Callable
from dataclasses import dataclass, field
from datetime import datetime, timedelta
from zoneinfo import ZoneInfo

from ao_vivo_mapa import Plano, Segmentos

LISBOA = ZoneInfo("Europe/Lisbon")
PEOES = frozenset({"pedestrian"})


def _dentro(x: float, y: float, anel: list[tuple[float, float]]) -> bool:
    dentro = False
    for (ax, ay), (bx, by) in zip(anel, anel[1:] + anel[:1]):
        if (ay > y) != (by > y) and x < ax + (y - ay) * (bx - ax) / (by - ay):
            dentro = not dentro
    return dentro


def _distancia_ao_anel(x: float, y: float, anel: list[tuple[float, float]]) -> float:
    melhor = math.inf
    for (ax, ay), (bx, by) in zip(anel, anel[1:] + anel[:1]):
        dx, dy = bx - ax, by - ay
        c2 = dx * dx + dy * dy
        t = 0.0 if c2 == 0 else max(0.0, min(1.0, ((x - ax) * dx + (y - ay) * dy) / c2))
        melhor = min(melhor, math.hypot(x - (ax + t * dx), y - (ay + t * dy)))
    return melhor


class Passadeiras:
    """Os polígonos das passadeiras (GeoJSON de `/mapa/passadeiras`), em metros."""

    def __init__(self, features: list[dict], plano: Plano):
        self.plano = plano
        self._poligonos: list[tuple[str, list[tuple[float, float]], tuple[float, float, float, float]]] = []
        for f in features:
            geometria = f.get("geometry") or {}
            if geometria.get("type") != "Polygon" or not geometria.get("coordinates"):
                continue
            anel = [plano.xy(float(lon), float(lat)) for lon, lat, *_ in geometria["coordinates"][0]]
            if len(anel) < 3:
                continue
            xs, ys = zip(*anel)
            ident = str((f.get("properties") or {}).get("id") or f.get("id") or "")
            self._poligonos.append((ident, anel, (min(xs), min(ys), max(xs), max(ys))))

    def de(self, lon: float, lat: float, max_m: float) -> str | None:
        """A passadeira onde está o ponto, ou a mais próxima a menos de `max_m`; None se não houver."""
        x, y = self.plano.xy(lon, lat)
        melhor: tuple[float, str] | None = None
        for ident, anel, (x0, y0, x1, y1) in self._poligonos:
            if x < x0 - max_m or x > x1 + max_m or y < y0 - max_m or y > y1 + max_m:
                continue
            d = 0.0 if _dentro(x, y, anel) else _distancia_ao_anel(x, y, anel)
            if d <= max_m and (melhor is None or d < melhor[0]):
                melhor = (d, ident)
        return melhor[1] if melhor else None


@dataclass
class Perfis:
    """O que a semana gravada diz de cada sensor: o perfil típico, o limite da via e as escalas do risco potencial."""

    tipos: dict[str, str]  # id → «passadeira» ou «segmento»
    base: dict[tuple[str, bool, int], float]  # (id, dia útil, hora) → taxa por hora (`agora_base.parquet`)
    limites: dict[str, float] = field(default_factory=dict)  # segmento → limite da via (km/h)
    exposicoes: list[float] = field(default_factory=list)  # as travessias por hora da semana, todas, ordenadas
    comportamento: dict[str, float | None] = field(default_factory=dict)  # passadeira → `comportamento_pct` (None: semáforo)
    base_segmentos: dict[tuple[str, bool, int], float] = field(default_factory=dict)  # mediana dos veículos (`segmentos_hora`)
    peso_exposicao: float = 0.5
    peso_comportamento: float = 0.5
    radar: frozenset[str] = frozenset()  # os segmentos medidos pelo radar (a coluna `sensor` do `segmentos_hora`)

    def esperado(self, ident: str, instante: datetime) -> float | None:
        """O perfil típico da semana gravada para `ident` nesse instante (hora de Lisboa): dia útil ou fim de semana, e a hora."""
        local = instante.astimezone(LISBOA)
        chave = (ident, local.weekday() < 5, local.hour)
        if self.tipos.get(ident) == "segmento":
            return self.base_segmentos.get(chave)
        return self.base.get(chave)

    def percentil_exposicao(self, valor: float) -> float | None:
        """O percentil de `valor` entre as travessias por hora da semana (média dos empates, como o `risco.percentil`)."""
        n = len(self.exposicoes)
        if n == 0:
            return None
        esq, dir_ = bisect_left(self.exposicoes, valor), bisect_right(self.exposicoes, valor)
        return min(1.0, max(0.0, ((esq + dir_ + 1) / 2) / n if dir_ > esq else (esq + 0.5) / n))

    def risco(self, ident: str, exposicao_h: float | None) -> dict | None:
        """O risco potencial ao vivo de uma passadeira (0 a 1), pela regra do ADR-0013 sem previsão; None sem exposição."""
        if ident not in self.comportamento or exposicao_h is None:
            return None
        exp_pct = self.percentil_exposicao(exposicao_h)
        if exp_pct is None:
            return None
        comp_pct = self.comportamento[ident]
        if comp_pct is None:  # com semáforo, o comportamento não se aplica (ADR-0024): só a exposição
            valor = exp_pct
        else:
            valor = (self.peso_exposicao * exp_pct + self.peso_comportamento * comp_pct) / (self.peso_exposicao + self.peso_comportamento)
        return {"valor": valor, "exposicao_pct": exp_pct, "comportamento_pct": comp_pct, "semaforo": comp_pct is None}


class Janela:
    """Os ids vistos em cada sensor nos últimos `janela_s` segundos, só em memória."""

    def __init__(self, janela_s: float = 900.0, minima_s: float = 60.0):
        self.janela_s, self.minima_s = janela_s, minima_s
        self.inicio: float | None = None
        self._vistos: dict[str, dict[str, float]] = defaultdict(dict)

    def comecar(self, agora: float) -> None:
        if self.inicio is None:
            self.inicio = agora

    def registar(self, sensor: str, ident: str, agora: float) -> None:
        self.comecar(agora)
        self._vistos[sensor][ident] = agora

    def contagens(self, agora: float) -> dict[str, dict]:
        """Por sensor: quantos ids distintos na janela, os minutos da janela e o número por hora (None se a janela for curta)."""
        if self.inicio is None:
            return {}
        corte = agora - self.janela_s
        decorrido = min(self.janela_s, agora - self.inicio)
        saida = {}
        for sensor, vistos in list(self._vistos.items()):
            for ident in [i for i, t in vistos.items() if t < corte]:
                del vistos[ident]
            n = len(vistos)
            saida[sensor] = {"n": n, "minutos": round(decorrido / 60, 1),
                             "por_hora": n * 3600 / decorrido if decorrido > 0 and decorrido >= self.minima_s else None}
        return saida


class Sensores:
    """Liga as deteções aos sensores e diz, por sensor, o agora, o esperado e o risco (ADR-0055). Uma por ligação."""

    def __init__(self, perfis: Perfis, segmentos: Segmentos | None = None, passadeiras: Passadeiras | None = None,
                 passadeira_m: float = 5.0, segmento_m: float = 8.0, parado_ms: float = 0.3, janela: Janela | None = None,
                 relogio_real: Callable[[], datetime] = lambda: datetime.now(LISBOA), costura_s: float = 20.0,
                 costura_m: float = 8.0, so_a_andar: bool = True, calada_s: float = 120.0):
        self.perfis, self.segmentos, self.passadeiras = perfis, segmentos, passadeiras
        self.plano = getattr(segmentos, "plano", None) or getattr(passadeiras, "plano", None) or Plano(40.64)
        self.passadeira_m, self.segmento_m, self.parado_ms = passadeira_m, segmento_m, parado_ms
        self.janela = janela or Janela()
        self.relogio_real = relogio_real
        self.costura_s, self.costura_m, self.so_a_andar, self.calada_s = costura_s, costura_m, so_a_andar, calada_s
        # id → (lon, lat, sensor, os sensores do dataset que a fonte vê ali): não se recalcula parado
        self._ligacao: dict[str, tuple[float, float, str | None, frozenset[str]]] = {}
        # A cobertura (sem dados não é zero, ADR-0007): as fontes do Living Lab (estação, sensor) que já viram cada sensor do
        # dataset desde que se abriu o modo, e a última vez que cada fonte mandou uma deteção.
        self._fontes: dict[str, set[tuple[str, str]]] = defaultdict(set)
        self._fonte_vista: dict[tuple[str, str], float] = {}
        self._origem: dict[str, str] = {}  # id → o id do rasto de que é continuação (a costura)
        self._ultimo: dict[str, tuple[float, float, float, str, float]] = {}  # id → (t, x, y, grupo, m/s) da última vez
        self._sumidos: list[tuple[float, float, float, str, str, float]] = []  # (t, x, y, grupo, origem, m/s) dos que sumiram

    def _ligar(self, d: dict) -> tuple[str | None, frozenset[str]]:
        """O sensor do dataset a que a deteção conta (o peão à passadeira, o veículo ao segmento), e os sensores que a fonte
        cobre naquele ponto, com qualquer classe: um carro em cima da passadeira também mostra que a câmara a vê."""
        anterior = self._ligacao.get(d["id"])
        if anterior and abs(anterior[0] - d["lon"]) < 1e-6 and abs(anterior[1] - d["lat"]) < 1e-6:
            return anterior[2], anterior[3]
        passadeira = segmento = None
        if self.passadeiras is not None:
            passadeira = self.passadeiras.de(d["lon"], d["lat"], self.passadeira_m)
        if self.segmentos is not None:
            perto = self.segmentos.mais_proximo(d["lon"], d["lat"], self.segmento_m)
            segmento = perto[0] if perto else None
        sensor = passadeira if d["classe"] in PEOES else segmento
        cobertos = frozenset(s for s in (passadeira, segmento) if s is not None)
        self._ligacao[d["id"]] = (d["lon"], d["lat"], sensor, cobertos)
        return sensor, cobertos

    def _coberto(self, sensor: str, agora: float) -> bool:
        """Há dados ao vivo deste sensor: uma fonte que já o viu desde que se abriu o modo mandou deteções há menos de `calada_s`."""
        return any(agora - self._fonte_vista.get(f, -math.inf) <= self.calada_s for f in self._fontes.get(sensor, ()))

    @staticmethod
    def _grupo(classe: str) -> str:
        return "peao" if classe in PEOES else "veiculo"  # a classe de um veículo muda às vezes de um id para o outro

    def _coser(self, d: dict, agora: float) -> str:
        """O rasto a que a deteção pertence. O Living Lab troca o id do mesmo objeto a meio (só ~79 % dos ids duram 6 s): um id
        novo do mesmo grupo (peão ou veículo) que aparece perto de onde um desapareceu há menos de `costura_s` é o mesmo
        objeto, e não conta outra vez. «Perto» é `costura_m` mais o que esse objeto andou entretanto, à sua velocidade."""
        ident = d["id"]
        if ident in self._origem:
            return self._origem[ident]
        x, y = self.plano.xy(d["lon"], d["lat"])
        grupo = self._grupo(d["classe"])
        melhor = None
        for i, (t, sx, sy, g, origem, v) in enumerate(self._sumidos):
            if g == grupo and agora - t <= self.costura_s:
                dist = math.hypot(x - sx, y - sy)
                if dist <= self.costura_m + v * (agora - t) and (melhor is None or dist < melhor[0]):
                    melhor = (dist, i, origem)
        if melhor is None:
            self._origem[ident] = ident
        else:
            self._origem[ident] = melhor[2]
            del self._sumidos[melhor[1]]
        return self._origem[ident]

    def aplicar(self, detecoes: list[dict], agora: float) -> tuple[list[dict], list[dict]]:
        """As deteções com o sensor a que se ligam (e `acima`, nos veículos), e o resumo por sensor."""
        self.janela.comecar(agora)
        # Primeiro, os que sumiram neste retrato: a troca de id acontece no mesmo retrato (sai um, entra o outro).
        vistos = {d["id"] for d in detecoes}
        for ident in [i for i in self._ultimo if i not in vistos]:
            t, x, y, grupo, v = self._ultimo.pop(ident)
            self._sumidos.append((t, x, y, grupo, self._origem.pop(ident, ident), v))
        self._sumidos = [s for s in self._sumidos if agora - s[0] <= self.costura_s]
        velocidades: dict[str, list[float]] = defaultdict(list)
        ligadas = []
        for d in detecoes:
            sensor, cobertos = self._ligar(d)
            fonte = (str(d.get("estacao") or ""), str(d.get("sensor") or ""))
            self._fonte_vista[fonte] = agora
            for s in cobertos:
                self._fontes[s].add(fonte)
            rasto = self._coser(d, agora)
            v = d.get("velocidade") or 0.0
            self._ultimo[d["id"]] = (agora, *self.plano.xy(d["lon"], d["lat"]), self._grupo(d["classe"]), v)
            if sensor is not None:
                # Contam os que passam: um carro estacionado ou um peão parado no passeio não é uma passagem nem uma travessia.
                if not self.so_a_andar or v >= self.parado_ms:
                    self.janela.registar(sensor, rasto, agora)
                if d["classe"] not in PEOES and v >= self.parado_ms:
                    velocidades[sensor].append(v * 3.6)
            ligadas.append({**d, "liga": sensor})
        for ident in [i for i in self._ligacao if i not in vistos]:
            del self._ligacao[ident]
        medianas = {s: statistics.median(v) for s, v in velocidades.items()}
        acima = {s: m > self.perfis.limites[s] for s, m in medianas.items() if s in self.perfis.limites}
        for d in ligadas:
            d["acima"] = d["classe"] not in PEOES and bool(acima.get(d["liga"]))
        return ligadas, self._resumo(agora, medianas, acima)

    def _resumo(self, agora: float, medianas: dict[str, float], acima: dict[str, bool]) -> list[dict]:
        contagens = self.janela.contagens(agora)
        real = self.relogio_real()
        saida = []
        for ident, tipo in sorted(self.perfis.tipos.items()):
            c = contagens.get(ident, {"n": 0, "minutos": round(min(self.janela.janela_s, agora - (self.janela.inicio or agora)) / 60, 1),
                                      "por_hora": None})
            coberto = self._coberto(ident, agora)
            if not coberto:  # nenhuma fonte viva o vê: sem dados, e não «0 por hora» nem um degrau de risco (ADR-0007)
                c = {**c, "por_hora": None}
            elif c["por_hora"] is None and (self.janela.inicio is not None and agora - self.janela.inicio >= self.janela.minima_s):
                c = {**c, "por_hora": 0.0}
            linha = {"id": ident, "tipo": tipo, "coberto": coberto, "n": c["n"], "minutos": c["minutos"], "por_hora": c["por_hora"],
                     "minima_min": round(self.janela.minima_s / 60, 1),
                     "esperado_1h": self.perfis.esperado(ident, real + timedelta(hours=1)),
                     "esperado_3h": self.perfis.esperado(ident, real + timedelta(hours=3))}
            if tipo == "passadeira":
                linha["risco"] = self.perfis.risco(ident, c["por_hora"])
            else:
                linha["velocidade_kmh"] = medianas.get(ident) if coberto else None
                linha["acima"] = acima.get(ident, False)
                linha["limite_kmh"] = self.perfis.limites.get(ident)
                linha["radar"] = ident in self.perfis.radar
            saida.append(linha)
        return saida
