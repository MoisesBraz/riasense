import { describe, expect, it } from "vitest";
import { carrosEstacionados, contornosDosLugares, deslocar, desvioNoSegmento, type EstadoLugar, type LugarGeo } from "./avenida";
import { distanciaM } from "./carros";

const LUGARES: LugarGeo[] = ["a", "b", "c"].map((id, i) => ({
  type: "Feature",
  properties: { id, rumo_graus: 90 },
  geometry: { type: "Point", coordinates: [-8.646 + i * 0.0001, 40.636] },
}));

describe("a avenida da demo (ADR-0044)", () => {
  it("deslocar: para a frente segue o rumo, e para a esquerda fica a 90° dele", () => {
    const o: [number, number] = [-8.646, 40.636];
    const frente = deslocar(o, 90, 10, 0); // para este
    expect(distanciaM(o, frente)).toBeCloseTo(10, 1);
    expect(frente[0]).toBeGreaterThan(o[0]);
    const esquerda = deslocar(o, 90, 0, 3); // a andar para este, a esquerda é o norte
    expect(distanciaM(o, esquerda)).toBeCloseTo(3, 1);
    expect(esquerda[1]).toBeGreaterThan(o[1]);
  });

  it("os carros estacionados são só os dos lugares ocupados nesta hora, parados e sem velocidade", () => {
    const estados = new Map<string, EstadoLugar>([
      ["a", "ocupado"],
      ["b", "livre"],
    ]);
    const carros = carrosEstacionados(LUGARES, estados);
    expect(carros).toHaveLength(1);
    expect(carros[0]).toMatchObject({ coord: LUGARES[0].geometry.coordinates, rumo: 90, kmh: null, acima: false, categoria: "B" });
  });

  it("cada lugar tem um contorno de 5 × 2 m, com o estado da hora; sem estado, é desconhecido", () => {
    const c = contornosDosLugares(LUGARES, new Map([["a", "ocupado" as EstadoLugar]]));
    expect(c.features.map((f) => f.properties.estado)).toEqual(["ocupado", "desconhecido", "desconhecido"]);
    const anel = c.features[0].geometry.coordinates[0];
    expect(distanciaM(anel[0], anel[1])).toBeCloseTo(2, 1);
    expect(distanciaM(anel[1], anel[2])).toBeCloseTo(5, 1);
  });

  it("o desvio de um segmento lê-se de metro a metro; fora do corredor é 0", () => {
    const desl = { s: { passo: 1, desloc_m: [1, 2, 3] } };
    expect(desvioNoSegmento(desl, "s", 1.4)).toBe(2);
    expect(desvioNoSegmento(desl, "s", 99)).toBe(3);
    expect(desvioNoSegmento(desl, "outro", 5)).toBe(0);
    expect(desvioNoSegmento(undefined, "s", 1)).toBe(0);
  });
});
