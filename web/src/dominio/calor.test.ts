import { describe, expect, it } from "vitest";
import { prepararSegmentos } from "./carros";
import { calorDosPeoes, calorDosVeiculos, estimadosDaHora, incluiEstimados, meioDoSegmento } from "./calor";
import { calorAoVivo } from "./aoVivo";
import type { SensorAoVivo } from "../api/aoVivo";
import type { Sensor } from "../api/tipos";

const MAX = { passadeiras: { maximo: 100 }, zonas: { maximo: 1000 }, segmentos: { maximo: 500 } };

describe("os mapas de calor (ADR-0047)", () => {
  it("cada tipo normaliza-se pelo seu máximo da semana (raiz quadrada): travessias e visitas não se misturam", () => {
    const c = calorDosPeoes(
      [{ id: "p1", coord: [0, 0] }],
      [{ id: "z1", coord: [1, 1] }],
      new Map([["p1", 50]]),
      new Map([["z1", 500]]),
      new Map(),
      MAX,
    );
    expect(c.features.map((f) => [f.properties.id, f.properties.intensidade, f.properties.tipo])).toEqual([
      ["p1", Math.sqrt(0.5), "passadeiras"],
      ["z1", Math.sqrt(0.5), "zonas"],
    ]);
  });

  it("nas horas de falha entra o estimado da ②; sem medida nem estimado, não há nuvem (só onde há sensor)", () => {
    const c = calorDosPeoes(
      [{ id: "p1", coord: [0, 0] }, { id: "p2", coord: [0, 1] }, { id: "p3", coord: [0, 2] }],
      [],
      new Map([["p1", 20]]),
      new Map(),
      new Map([["p2", 30]]),
      MAX,
    );
    expect(c.features.map((f) => [f.properties.id, f.properties.estimado])).toEqual([
      ["p1", false],
      ["p2", true],
    ]);
    expect(incluiEstimados(c)).toBe(true);
  });

  it("os veículos ficam no meio do segmento, e a escala nunca passa de 1", () => {
    const seg = prepararSegmentos({ features: [{ properties: { id: "s" }, geometry: { type: "LineString", coordinates: [[0, 0], [0, 0.002]] } }] });
    const [lon, lat] = meioDoSegmento(seg[0]);
    expect(lon).toBeCloseTo(0, 6);
    expect(lat).toBeCloseTo(0.001, 6);
    const c = calorDosVeiculos(seg, new Map([["s", 900]]), new Map(), MAX);
    expect(c.features[0].properties.intensidade).toBe(1);
  });

  it("os estimados da hora são só as linhas marcadas como estimadas", () => {
    const linhas = [
      { id: "a", t: "2026-11-05T10:00:00", estimativa: 5, estimado: true },
      { id: "b", t: "2026-11-05T10:00:00", estimativa: 7, estimado: false },
      { id: "c", t: "2026-11-05T11:00:00", estimativa: 9, estimado: true },
    ] as never[];
    const ler = (t: string) => Date.parse(t);
    expect([...estimadosDaHora(linhas, Date.parse("2026-11-05T10:00:00"), ler)]).toEqual([["a", 5]]);
  });
});

describe("o calor ao vivo (ADR-0055, ponto 3)", () => {
  const MAX = { passadeiras: { maximo: 100 }, zonas: { maximo: 50 }, segmentos: { maximo: 400 } };
  const seg = prepararSegmentos({ features: [{ properties: { id: "sg" }, geometry: { type: "LineString", coordinates: [[0, 0], [0, 0.002]] } }] });
  const posicoes = [
    { id: "pa", tipo: "passadeira", lon: 1, lat: 2 },
    { id: "pb", tipo: "passadeira", lon: 3, lat: 4 },
    { id: "pc", tipo: "passadeira", lon: 5, lat: 6 },
    { id: "zt", tipo: "zona", lon: 7, lat: 8 },
  ] as unknown as Sensor[];
  const vivo = (id: string, tipo: "passadeira" | "segmento", por_hora: number | null, coberto?: boolean): SensorAoVivo => ({
    id, tipo, n: 0, minutos: 15, por_hora, esperado_1h: null, esperado_3h: null, ...(coberto === undefined ? {} : { coberto }),
  });

  it("usa o «por hora» de agora na escala da semana, só onde uma fonte viva vê o sensor e já há número", () => {
    const vivos = [vivo("pa", "passadeira", 25), vivo("pb", "passadeira", null), vivo("pc", "passadeira", 80, false), vivo("sg", "segmento", 100)];
    const c = calorAoVivo(vivos, posicoes, seg, MAX, { peoes: true, veiculos: true });
    // A pb ainda a contar e a pc sem cobertura não têm nuvem; sem cobertura não é zero (ADR-0007).
    expect(c.peoes?.features.map((f) => [f.properties.id, f.properties.intensidade, f.geometry.coordinates])).toEqual([["pa", 0.5, [1, 2]]]);
    expect(c.veiculos?.features.map((f) => [f.properties.id, f.properties.intensidade, f.properties.estimado])).toEqual([["sg", 0.5, false]]);
  });

  it("sem zonas turísticas (não têm contagem ao vivo), e a camada desligada fica null", () => {
    const c = calorAoVivo([vivo("zt", "passadeira", 40)], posicoes, seg, MAX, { peoes: true, veiculos: false });
    expect(c.peoes?.features).toEqual([]);
    expect(c.veiculos).toBeNull();
  });
});
