/**
 * A avenida da demo em 3D (ADR-0044): os lugares com sensor (o contorno no chão, com o estado da hora), os carros estacionados
 * (só nos lugares ocupados nessa hora, que é o que se mede) e o desvio dos carros em andamento para o centro do seu sentido (o eixo
 * dos segmentos corre junto a uma berma). O resto da avenida (o asfalto, as linhas e os passeios) chega já desenhado da API.
 */
import type { Veiculo3D } from "./carros";

/** O tamanho de um lugar de estacionamento em paralelo, no chão (m). */
const COMPRIMENTO_LUGAR_M = 5.0;
const LARGURA_LUGAR_M = 2.0;
const M_POR_GRAU_LAT = 110_574;

export type EstadoLugar = "ocupado" | "livre" | "desconhecido";

/** Um lugar com sensor, como vem de `/mapa/avenida/lugares`: um ponto, com o rumo da rua. */
export interface LugarGeo {
  type: "Feature";
  properties: { id: string; rumo_graus: number };
  geometry: { type: "Point"; coordinates: [number, number] };
}

/** O ponto a `frente` metros no rumo e `esquerda` metros para a esquerda dele. */
export function deslocar([lon, lat]: [number, number], rumo: number, frente: number, esquerda: number): [number, number] {
  const r = (rumo * Math.PI) / 180;
  const kx = 111_320 * Math.cos((lat * Math.PI) / 180);
  // Para a frente: (sen, cos) em (este, norte); para a esquerda: (-cos, sen).
  const este = frente * Math.sin(r) - esquerda * Math.cos(r);
  const norte = frente * Math.cos(r) + esquerda * Math.sin(r);
  return [lon + este / kx, lat + norte / M_POR_GRAU_LAT];
}

/** O contorno de cada lugar no chão, com o estado da hora (sem estado conhecido: «desconhecido»), para a camada do mapa. */
export function contornosDosLugares(lugares: LugarGeo[], estados: ReadonlyMap<string, EstadoLugar>) {
  return {
    type: "FeatureCollection" as const,
    features: lugares.map((l) => {
      const { coordinates: c } = l.geometry;
      const r = l.properties.rumo_graus;
      const [a, b] = [COMPRIMENTO_LUGAR_M / 2, LARGURA_LUGAR_M / 2];
      const cantos = [deslocar(c, r, a, b), deslocar(c, r, a, -b), deslocar(c, r, -a, -b), deslocar(c, r, -a, b)];
      return {
        type: "Feature" as const,
        properties: { id: l.properties.id, estado: estados.get(l.properties.id) ?? "desconhecido" },
        geometry: { type: "Polygon" as const, coordinates: [[...cantos, cantos[0]]] },
      };
    }),
  };
}

/** Os carros estacionados: um ligeiro em cada lugar ocupado nesta hora, parado, sem velocidade. */
export function carrosEstacionados(lugares: LugarGeo[], estados: ReadonlyMap<string, EstadoLugar>): Veiculo3D[] {
  return lugares
    .filter((l) => estados.get(l.properties.id) === "ocupado")
    .map((l, i) => ({ coord: l.geometry.coordinates, rumo: l.properties.rumo_graus, categoria: "B" as const, kmh: null, acima: false, variante: i % 2 }));
}

/** O desvio, por segmento, para o centro do seu sentido (+ à esquerda), de `/mapa/avenida/deslocamentos`. */
export type Deslocamentos = Record<string, { passo: number; desloc_m: number[] }>;

/** Quanto se desvia um carro do segmento `id` a `d` metros do início (0 fora do corredor). */
export function desvioNoSegmento(desl: Deslocamentos | undefined, id: string, d: number): number {
  const x = desl?.[id];
  if (!x || x.desloc_m.length === 0) return 0;
  return x.desloc_m[Math.max(0, Math.min(x.desloc_m.length - 1, Math.round(d / x.passo)))];
}
