"""O modo «Ao vivo» (ADR-0049): o que os sensores do Aveiro Living Lab detetam agora, lido do socket.io público.

A ligação só abre quando alguém entra no modo (`ligar`) e fecha ao sair (`desligar`), ou sozinha se a web deixar de pedir
durante `inativo_s`. O socket manda o retrato completo do momento cerca de 6 vezes por segundo, num só evento, `data`;
guarda-se só o último, em memória, e a web lê-o reduzido 1 vez por segundo. Nada vai para o disco.

Antes de ir para a web, o retrato arruma-se (ADR-0055, ponto 1; `Arrumo`): as deteções repetidas fundem-se, os veículos
parados marcam-se e orientam-se, e cada estação leva as suas contagens.
"""

from __future__ import annotations

import math
import socket
import threading
import time
from collections import defaultdict
from collections.abc import Callable
from typing import Any
from urllib.parse import urlparse

from ao_vivo_mapa import M_POR_GRAU, Segmentos
from ao_vivo_sensores import Sensores

URL = "https://api.aveiro-living-lab.it.pt"
ETIQUETA = ("Ao vivo · dados públicos do Aveiro Living Lab (IT), não validados. "
            "As camadas ao vivo usam os dados de agora; ② e ③ usam a semana gravada")

# As classes que contam como peões; as outras são veículos (ADR-0055).
PEOES = frozenset({"pedestrian"})

# Os estados que a web lê em `GET /ao-vivo`.
DESLIGADO, A_LIGAR, LIGADO, SEM_REDE, PERDIDA = "desligado", "a ligar", "ligado", "sem rede", "ligação perdida"


def _numero(x: Any) -> float | None:
    return float(x) if isinstance(x, (int, float)) and not isinstance(x, bool) else None


def reduzir(bruto: dict) -> dict:
    """Do retrato do socket, só o que o mapa usa: as estações (posição, ativa, último dado) e as deteções de agora.

    A posição de uma deteção é a ajustada à via (`matchedLatitude`/`matchedLongitude`) quando existe, senão a medida.
    A identidade é a do `trackingId` (ADR-0055, ponto 1), que se mantém entre retratos; sem ele, o `id`.
    Só contam as estações com `active` (as RSU): a OBU de um veículo não tem esse campo e não é uma estação fixa.
    """
    estacoes: list[dict] = []
    detecoes: list[dict] = []
    for chave, est in (bruto or {}).items():
        if not isinstance(est, dict) or not isinstance(est.get("active"), bool):
            continue
        lat, lon = _numero(est.get("latitude")), _numero(est.get("longitude"))
        if lat is None or lon is None:
            continue
        ident = str(est.get("id") or chave)
        ultimo = None
        n = 0
        for d in est.get("detections") or []:
            if not isinstance(d, dict):
                continue
            mlat, mlon = _numero(d.get("matchedLatitude")), _numero(d.get("matchedLongitude"))
            ajustada = bool(mlat and mlon)
            dlat = mlat if ajustada else _numero(d.get("latitude"))
            dlon = mlon if ajustada else _numero(d.get("longitude"))
            if dlat is None or dlon is None:
                continue
            instante = _numero(d.get("timestamp"))
            if instante is not None:
                ultimo = instante if ultimo is None else max(ultimo, instante)
            n += 1
            detecoes.append({
                "id": f"{ident}:{d.get('trackingId') or d.get('id')}",
                "estacao": ident,
                "lat": dlat,
                "lon": dlon,
                "classe": str(d.get("classification") or "unknown"),
                "sensor": str(d.get("sensor") or ""),
                "velocidade": _numero(d.get("speed")),  # m/s
                "direcao": _numero(d.get("heading")),  # graus a partir do norte
                "ajustada": ajustada,
            })
        estacoes.append({"id": ident, "lat": lat, "lon": lon, "ativa": est["active"], "detecoes": n,
                         "ultimo_dado": int(ultimo) if ultimo is not None else None})
    estacoes.sort(key=lambda e: (len(e["id"]), e["id"]))  # p1, p2, …, p10, como os ids do Living Lab
    return {"estacoes": estacoes, "detecoes": detecoes}


class Arrumo:
    """Arruma os retratos de uma ligação (ADR-0055, ponto 1), com memória de um retrato para o seguinte, só em memória.

    - **Repetidas:** a mesma classe a menos de `fundir_m` no mesmo retrato, vista por **sensores diferentes** (a câmara e o
      radar da mesma estação) **ou por estações diferentes** (vizinhas), conta uma vez. Duas deteções do mesmo sensor da mesma
      estação são duas coisas (dois peões lado a lado, dois carros em vias paralelas): ficam as duas.
      Fica a que ficou no retrato anterior, para a identidade não saltar; depois, a da posição ajustada à via; depois, a do id
      mais baixo.
    - **Parados:** um veículo abaixo de `parado_ms` há mais de `parado_s` leva `parado`: desenha-se mais discreto e sem número.
    - **Rumo dos lentos:** abaixo de `parado_ms`, o socket manda o `heading` a 0. Usa-se o último rumo com que se viu o veículo
      a andar; sem ele, o do segmento com câmara ou radar mais próximo (a menos de `rumo_m`); sem ele, fica o do socket.
    - **Estações:** cada uma leva os veículos e os peões que ficaram (para o marcador com pouco zoom).
    """

    def __init__(self, fundir_m: float = 3.0, parado_ms: float = 0.3, parado_s: float = 30.0, rumo_m: float = 15.0,
                 segmentos: Segmentos | None = None, esquecer_s: float = 120.0, sensores: Sensores | None = None):
        self.fundir_m, self.parado_ms, self.parado_s, self.rumo_m = fundir_m, parado_ms, parado_s, rumo_m
        self.segmentos, self.esquecer_s, self.sensores = segmentos, esquecer_s, sensores
        self._mantidos: set[str] = set()
        self._lento_desde: dict[str, float] = {}
        self._rumo: dict[str, float] = {}
        self._visto: dict[str, float] = {}

    def _fundir(self, detecoes: list[dict]) -> list[dict]:
        lat0 = sum(d["lat"] for d in detecoes) / len(detecoes) if detecoes else 40.64
        kx, ky, c = M_POR_GRAU * math.cos(math.radians(lat0)), M_POR_GRAU, self.fundir_m
        ordem = sorted(detecoes, key=lambda d: (d["id"] not in self._mantidos, not d.get("ajustada"), d["id"]))
        grelha: dict[tuple[str, int, int], list[tuple[float, float, str, str]]] = defaultdict(list)
        ficam = []
        for d in ordem:
            x, y = d["lon"] * kx, d["lat"] * ky
            i, j = math.floor(x / c), math.floor(y / c)
            origem = (d["estacao"], d.get("sensor") or "")
            repetida = any(
                math.hypot(x - ox, y - oy) < c and (est, sen) != origem
                for di in (-1, 0, 1) for dj in (-1, 0, 1) for ox, oy, est, sen in grelha[(d["classe"], i + di, j + dj)]
            )
            if not repetida:
                grelha[(d["classe"], i, j)].append((x, y, *origem))
                ficam.append(d)
        return sorted(ficam, key=lambda d: d["id"])

    def _orientar(self, d: dict, agora: float) -> dict:
        ident, v = d["id"], d.get("velocidade") or 0.0
        self._visto[ident] = agora
        if d["classe"] in PEOES:
            return {**d, "parado": False}
        if v < self.parado_ms:
            desde = self._lento_desde.setdefault(ident, agora)
            direcao = d.get("direcao")
            if not direcao:  # o socket manda 0 (ou nada) com o veículo parado
                direcao = self._rumo.get(ident)
                if direcao is None and self.segmentos is not None:
                    perto = self.segmentos.mais_proximo(d["lon"], d["lat"], self.rumo_m)
                    direcao = perto[2] if perto else None
                if direcao is None:
                    direcao = d.get("direcao")
            return {**d, "direcao": direcao, "parado": agora - desde >= self.parado_s}
        self._lento_desde.pop(ident, None)
        if d.get("direcao") is not None:
            self._rumo[ident] = d["direcao"]
        return {**d, "parado": False}

    def aplicar(self, reduzido: dict, agora: float) -> dict:
        """O retrato reduzido (`reduzir`), arrumado. `agora` em segundos (relógio monótono)."""
        detecoes = [self._orientar(d, agora) for d in self._fundir(reduzido.get("detecoes", []))]
        self._mantidos = {d["id"] for d in detecoes}
        for ident in [k for k, t in self._visto.items() if agora - t > self.esquecer_s]:  # quem saiu há muito, esquece-se
            for memoria in (self._visto, self._lento_desde, self._rumo):
                memoria.pop(ident, None)
        veiculos, peoes = defaultdict(int), defaultdict(int)
        for d in detecoes:
            (peoes if d["classe"] in PEOES else veiculos)[d["estacao"]] += 1
        estacoes = [{**e, "veiculos": veiculos[e["id"]], "peoes": peoes[e["id"]]} for e in reduzido.get("estacoes", [])]
        if self.sensores is None:
            return {"estacoes": estacoes, "detecoes": detecoes}
        # A ligação aos sensores do dataset, a janela móvel, o esperado e o risco ao vivo (ADR-0055, pontos 2, 5 e 6).
        detecoes, resumo = self.sensores.aplicar(detecoes, agora)
        return {"estacoes": estacoes, "detecoes": detecoes, "sensores": resumo}


def _cliente_socketio():
    import socketio  # só se importa quando alguém entra no modo

    # Sem religar sozinho: se a ligação cair, a web sai do modo com «Ligação perdida» (ADR-0049, ponto 5). Sem registos do
    # socket.io nem do Engine.IO: as deteções não vão para os logs da API.
    return socketio.Client(reconnection=False, logger=False, engineio_logger=False)


def ha_rede(url: str = URL, limite_s: float = 2.0, tentativas: int = 3) -> bool:
    """Abre e fecha uma ligação TCP ao servidor, sem falar socket.io: diz se o botão pode ligar, sem abrir o modo.

    Uma ligação que esgota o tempo uma vez não chega para dizer «sem rede» (já aconteceu, e o modo caía a meio da demo):
    tenta-se até `tentativas` vezes antes de o declarar.
    """
    alvo = urlparse(url)
    porta = alvo.port or (443 if alvo.scheme == "https" else 80)
    for _ in range(max(1, tentativas)):
        try:
            with socket.create_connection((alvo.hostname, porta), timeout=limite_s):
                return True
        except OSError:
            continue
    return False


class AoVivo:
    """A ligação ao socket, uma para toda a API, e o último retrato, só em memória."""

    def __init__(self, url: str = URL, inativo_s: float = 30.0, limite_s: float = 10.0,
                 fabrica: Callable[[], Any] = _cliente_socketio, relogio: Callable[[], float] = time.monotonic,
                 arrumo: Callable[[], Arrumo] = Arrumo):
        self.url, self.inativo_s, self.limite_s = url, inativo_s, limite_s
        self._fabrica, self._relogio, self._novo_arrumo = fabrica, relogio, arrumo
        self._arrumo = arrumo()
        self._trinco = threading.Lock()
        self._trinco_arrumo = threading.Lock()
        self._cliente: Any = None
        self._estado = DESLIGADO
        self._ultimo: dict | None = None
        self._recebido: float | None = None  # time.time() do último `data`, para a web dizer «há N s»
        self._pedido = 0.0  # o último pedido da web (relógio monótono)

    @property
    def estado(self) -> str:
        return self._estado

    def ligar(self) -> str:
        """Abre a ligação numa thread (o connect do socket.io espera pelo servidor); devolve logo o estado."""
        with self._trinco:
            self._pedido = self._relogio()
            if self._estado in (A_LIGAR, LIGADO):
                return self._estado
            self._estado, self._ultimo, self._recebido = A_LIGAR, None, None
            self._arrumo = self._novo_arrumo()  # cada ligação começa sem memória
            cliente = self._fabrica()
            self._cliente = cliente
        cliente.on("data", lambda dados: self._receber(cliente, dados))
        cliente.on("disconnect", lambda *_: self._caiu(cliente))
        threading.Thread(target=self._abrir, args=(cliente,), daemon=True, name="ao-vivo").start()
        return A_LIGAR

    def _abrir(self, cliente) -> None:
        try:
            # O só-websocket falha neste servidor: começa-se pelo polling e sobe-se para o websocket (Engine.IO 4).
            cliente.connect(self.url, transports=["polling", "websocket"], wait_timeout=self.limite_s)
        except Exception:  # sem rede, DNS, recusa ou o servidor mudou: para a web, é sempre «sem rede»
            with self._trinco:
                if self._cliente is cliente:
                    self._cliente, self._estado = None, SEM_REDE
            return
        with self._trinco:
            atual = self._cliente is cliente
            if atual and self._estado == A_LIGAR:
                self._estado = LIGADO
        if not atual:
            cliente.disconnect()  # saiu-se do modo enquanto ligava

    def _receber(self, cliente, dados) -> None:
        with self._trinco:
            if self._cliente is not cliente:
                return
            if isinstance(dados, dict):
                self._ultimo, self._recebido = dados, time.time()
                if self._estado == A_LIGAR:
                    self._estado = LIGADO
            # Ninguém pede há `inativo_s` (o separador fechou-se): fecha-se, para não ficar ligado sem ninguém a ver.
            inativo = self._relogio() - self._pedido > self.inativo_s
        if inativo:  # numa thread à parte: o cliente não se fecha de dentro do seu próprio evento
            threading.Thread(target=self.desligar, daemon=True, name="ao-vivo-fecho").start()

    def _caiu(self, cliente) -> None:
        with self._trinco:
            if self._cliente is cliente:
                self._cliente, self._ultimo, self._estado = None, None, PERDIDA

    def desligar(self) -> str:
        with self._trinco:
            cliente, self._cliente = self._cliente, None
            self._estado, self._ultimo, self._recebido = DESLIGADO, None, None
        if cliente is not None:
            try:
                cliente.disconnect()
            except Exception:
                pass
        return DESLIGADO

    def leitura(self) -> dict:
        """O estado e o último retrato, reduzido; conta como um pedido da web (mantém a ligação aberta)."""
        with self._trinco:
            self._pedido = agora = self._relogio()
            estado, ultimo, recebido, arrumo = self._estado, self._ultimo, self._recebido, self._arrumo
        corpo: dict = {"estado": estado, "etiqueta": ETIQUETA, "fonte": self.url}
        if estado == LIGADO and ultimo is not None:
            corpo["recebido"] = int(recebido * 1000) if recebido else None
            with self._trinco_arrumo:  # dois pedidos ao mesmo tempo não baralham a memória do arrumo
                corpo.update(arrumo.aplicar(reduzir(ultimo), agora))
        return corpo
