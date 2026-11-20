/** As passadeiras com a forma real (ADR-0038): 5 listas paralelas ao lado curto, e a ponta a que o marcador se prende. */
import { describe, expect, it } from "vitest";
import type { PassadeiraMapa } from "../api/tipos";
import { colecoesDasPassadeiras, listasDaPassadeira, N_LISTAS, pontaDaPassadeira, pontasDasPassadeiras } from "./passadeiras";

const LON0 = -8.65;
const LAT0 = 40.64;
const M_LAT = 110_574;
const M_LON = 111_320 * Math.cos((LAT0 * Math.PI) / 180);
/** De metros (este, norte) para [lon, lat], e de volta. */
const lonLat = (x: number, y: number): [number, number] => [LON0 + x / M_LON, LAT0 + y / M_LAT];
const metros = ([lon, lat]: [number, number]): [number, number] => [(lon - LON0) * M_LON, (lat - LAT0) * M_LAT];

/** Um retângulo de `comp` m (a travessia) por `larg` m, rodado `graus` graus a partir do este, centrado em (cx, cy). */
function retangulo(comp: number, larg: number, graus = 0, cx = 0, cy = 0): [number, number][] {
  const t = (graus * Math.PI) / 180;
  const [c, s] = [Math.cos(t), Math.sin(t)];
  const cantos = [[-comp / 2, -larg / 2], [comp / 2, -larg / 2], [comp / 2, larg / 2], [-comp / 2, larg / 2]];
  const anel = cantos.map(([a, b]) => lonLat(cx + a * c - b * s, cy + a * s + b * c));
  return [...anel, anel[0]];
}
const dist = (a: [number, number], b: [number, number]) => Math.hypot(a[0] - b[0], a[1] - b[1]);

describe("listasDaPassadeira", () => {
  it("são 5, em número fixo, e ficam dentro do polígono", () => {
    const anel = retangulo(10, 3);
    const listas = listasDaPassadeira(anel);
    expect(N_LISTAS).toBe(5);
    expect(listas).toHaveLength(5);
    const [xs, ys] = [anel.map((p) => metros(p)[0]), anel.map((p) => metros(p)[1])];
    for (const lista of listas)
      for (const p of lista) {
        const [x, y] = metros(p);
        expect(x).toBeGreaterThanOrEqual(Math.min(...xs) - 1e-3);
        expect(x).toBeLessThanOrEqual(Math.max(...xs) + 1e-3);
        expect(y).toBeGreaterThanOrEqual(Math.min(...ys) - 1e-3);
        expect(y).toBeLessThanOrEqual(Math.max(...ys) + 1e-3);
      }
  });

  it("são paralelas ao lado curto (ao trânsito) e repartem-se ao longo da travessia, com espaços do tamanho das listas", () => {
    // 10 m de este a oeste (a travessia) por 3 m de norte a sul: cada lista é comprida de norte a sul.
    const listas = listasDaPassadeira(retangulo(10, 3)).map((l) => l.slice(0, 4).map(metros));
    const largura = (10 - 2 * 0.4) / 9; // 5 listas e 4 espaços
    for (const [i, l] of listas.entries()) {
      const [xs, ys] = [l.map((p) => p[0]), l.map((p) => p[1])];
      expect(Math.max(...xs) - Math.min(...xs)).toBeCloseTo(largura, 2); // a largura de uma lista
      expect(Math.max(...ys) - Math.min(...ys)).toBeCloseTo(3 - 2 * 0.2, 2); // o lado curto, menos a folga
      if (i > 0) expect(Math.min(...xs) - Math.max(...listas[i - 1].map((p) => p[0]))).toBeCloseTo(largura, 2); // o espaço
    }
  });

  it.each([0, 30, 77, 120])("com o polígono rodado %i°, as listas rodam com ele", (graus) => {
    const listas = listasDaPassadeira(retangulo(10, 3, graus, 5, -4));
    expect(listas).toHaveLength(5);
    const m = listas.map((l) => l.slice(0, 4).map(metros));
    // O lado de cada lista: 3 − 0,4 = 2,6 m no sentido do trânsito e 1,02 m na travessia, qualquer que seja a rotação.
    for (const l of m) {
      const lados = [dist(l[0], l[1]), dist(l[1], l[2])].sort((a, b) => a - b);
      expect(lados[0]).toBeCloseTo((10 - 0.8) / 9, 1);
      expect(lados[1]).toBeCloseTo(2.6, 1);
    }
  });

  it("não inventa listas num polígono pequeno ou degenerado", () => {
    expect(listasDaPassadeira(retangulo(3, 2))).toEqual([]);
    expect(listasDaPassadeira(retangulo(10, 0.5))).toEqual([]);
    expect(listasDaPassadeira([lonLat(0, 0), lonLat(1, 0)])).toEqual([]);
  });
});

describe("pontaDaPassadeira", () => {
  it("é a ponta da travessia mais a norte, a meio do trânsito, e diz para que lado fica «fora»", () => {
    const ponta = pontaDaPassadeira(retangulo(10, 3, 90))!; // a travessia vai de sul a norte
    const [x, y] = metros([ponta.lon, ponta.lat]);
    expect(x).toBeCloseTo(0, 1);
    expect(y).toBeCloseTo(5, 1); // 5 m a norte do centro: a ponta
    expect(ponta.saida[0]).toBeCloseTo(0, 5);
    expect(ponta.saida[1]).toBeCloseTo(1, 5);
  });

  it("é sempre a mesma ponta para a mesma passadeira, e fica a metade da travessia do centro", () => {
    const anel = retangulo(10.3, 2, 35, 8, 3);
    const a = pontaDaPassadeira(anel)!;
    const b = pontaDaPassadeira([...anel].reverse())!;
    expect([a.lon, a.lat]).toEqual([b.lon, b.lat]);
    expect(dist(metros([a.lon, a.lat]), [8, 3])).toBeCloseTo(10.3 / 2, 1);
    expect(Math.hypot(...a.saida)).toBeCloseTo(1, 5);
  });

  it("num polígono sem retângulo (menos de 3 pontos) não há ponta", () => {
    expect(pontaDaPassadeira([lonLat(0, 0)])).toBeNull();
  });
});

const feature = (id: string, anel: [number, number][]): PassadeiraMapa => ({
  type: "Feature",
  id,
  properties: { id, crosswalk: `urn:ngsi-ld:Crosswalk:${id.slice(-4)}`, nome: null, rsu: null },
  geometry: { type: "Polygon", coordinates: [anel] },
});

describe("as coleções para o mapa", () => {
  it("o chão é o polígono tal e qual e as listas são 5 por passadeira, com o id do sensor", () => {
    const a = feature("urn:ngsi-ld:SmartCrosswalk:0001", retangulo(10, 3));
    const b = feature("urn:ngsi-ld:SmartCrosswalk:0002", retangulo(9, 3, 40, 20, 20));
    const { chao, listas } = colecoesDasPassadeiras([a, b]);
    expect(chao.features.map((f) => f.properties.id)).toEqual([a.properties.id, b.properties.id]);
    expect(chao.features[0].geometry).toBe(a.geometry);
    expect(listas.features).toHaveLength(10);
    expect(listas.features.filter((f) => f.properties.id === b.properties.id)).toHaveLength(5);
  });

  it("um polígono que não é simples (MultiPolygon) fica de fora: só tem o marcador", () => {
    const multi = { ...feature("urn:ngsi-ld:SmartCrosswalk:0003", retangulo(10, 3)), geometry: { type: "MultiPolygon" as const, coordinates: [] } };
    expect(colecoesDasPassadeiras([multi]).chao.features).toHaveLength(0);
    expect(pontasDasPassadeiras([multi])).toEqual({});
  });

  it("dá a ponta de cada passadeira por id", () => {
    const pontas = pontasDasPassadeiras([feature("urn:ngsi-ld:SmartCrosswalk:0001", retangulo(10, 3, 90))]);
    expect(Object.keys(pontas)).toEqual(["urn:ngsi-ld:SmartCrosswalk:0001"]);
  });
});

const GEOJSON_REAL = "../data/processed/passadeiras.geojson";
const { readFileSync, existsSync } = (globalThis as unknown as { process: { getBuiltinModule: (nome: string) => { readFileSync: (f: string, c: string) => string; existsSync: (f: string) => boolean } } }).process.getBuiltinModule("node:fs");

describe("os 24 polígonos reais do Living Lab", () => {
  // Sem `data/processed/` (a cópia pública não o inclui, ver «Os dados desta cópia» no README), o teste salta.
  it.skipIf(!existsSync(GEOJSON_REAL))("todos têm 5 listas e uma ponta (data/processed/passadeiras.geojson)", () => {
    const reais = JSON.parse(readFileSync(GEOJSON_REAL, "utf8")).features as PassadeiraMapa[];
    expect(reais).toHaveLength(24);
    const { chao, listas } = colecoesDasPassadeiras(reais);
    expect(chao.features).toHaveLength(24);
    expect(listas.features).toHaveLength(24 * 5);
    expect(Object.keys(pontasDasPassadeiras(reais))).toHaveLength(24);
  });
});
