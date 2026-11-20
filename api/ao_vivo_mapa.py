"""A geometria do «Ao vivo» (ADR-0055): os segmentos com câmara ou radar, para orientar os veículos parados.

Usa uma projeção plana local (metros a partir dos graus, com o cosseno da latitude de Aveiro), que chega para distâncias de
poucas dezenas de metros. Os segmentos partem-se em troços retos, arrumados numa grelha, para achar depressa o mais próximo
de cada deteção.
"""

from __future__ import annotations

import math
from collections import defaultdict
from dataclasses import dataclass

M_POR_GRAU = 111_320.0


class Plano:
    """Graus (lon, lat) para metros (x, y), numa projeção plana em torno de `lat0`."""

    def __init__(self, lat0: float):
        self.kx = M_POR_GRAU * math.cos(math.radians(lat0))
        self.ky = M_POR_GRAU

    def xy(self, lon: float, lat: float) -> tuple[float, float]:
        return lon * self.kx, lat * self.ky


def rumo(ax: float, ay: float, bx: float, by: float) -> float:
    """O rumo de a para b, em graus a partir do norte, no sentido dos ponteiros (0 a 360)."""
    return math.degrees(math.atan2(bx - ax, by - ay)) % 360


@dataclass(frozen=True)
class Troco:
    """Um troço reto de um segmento, em metros."""

    segmento: str
    ax: float
    ay: float
    bx: float
    by: float

    def distancia(self, x: float, y: float) -> float:
        dx, dy = self.bx - self.ax, self.by - self.ay
        comprimento2 = dx * dx + dy * dy
        t = 0.0 if comprimento2 == 0 else max(0.0, min(1.0, ((x - self.ax) * dx + (y - self.ay) * dy) / comprimento2))
        return math.hypot(x - (self.ax + t * dx), y - (self.ay + t * dy))

    @property
    def rumo(self) -> float:
        return rumo(self.ax, self.ay, self.bx, self.by)


class Segmentos:
    """Os segmentos (GeoJSON de `segmentos_carros.geojson`), partidos em troços e arrumados numa grelha de `celula_m`."""

    def __init__(self, features: list[dict], plano: Plano, celula_m: float = 50.0):
        self.plano, self.celula = plano, celula_m
        self._grelha: dict[tuple[int, int], list[Troco]] = defaultdict(list)
        self.ids: list[str] = []
        for f in features:
            geometria = f.get("geometry") or {}
            linhas = {"LineString": [geometria.get("coordinates")], "MultiLineString": geometria.get("coordinates")}.get(
                geometria.get("type"), []
            )
            ident = str((f.get("properties") or {}).get("id") or f.get("id") or "")
            self.ids.append(ident)
            for linha in linhas or []:
                pontos = [plano.xy(float(lon), float(lat)) for lon, lat, *_ in linha or []]
                for (ax, ay), (bx, by) in zip(pontos, pontos[1:]):
                    troco = Troco(ident, ax, ay, bx, by)
                    for celula in self._celulas(min(ax, bx), min(ay, by), max(ax, bx), max(ay, by)):
                        self._grelha[celula].append(troco)

    def _celulas(self, x0: float, y0: float, x1: float, y1: float):
        c = self.celula
        for i in range(math.floor(x0 / c), math.floor(x1 / c) + 1):
            for j in range(math.floor(y0 / c), math.floor(y1 / c) + 1):
                yield i, j

    def mais_proximo(self, lon: float, lat: float, max_m: float) -> tuple[str, float, float] | None:
        """O segmento mais próximo a menos de `max_m`: (id, distância em m, rumo do troço). None se não houver."""
        x, y = self.plano.xy(lon, lat)
        melhor: tuple[float, Troco] | None = None
        for celula in self._celulas(x - max_m, y - max_m, x + max_m, y + max_m):
            for troco in self._grelha.get(celula, ()):
                d = troco.distancia(x, y)
                if d <= max_m and (melhor is None or d < melhor[0]):
                    melhor = (d, troco)
        if melhor is None:
            return None
        return melhor[1].segmento, melhor[0], melhor[1].rumo
