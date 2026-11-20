import { describe, expect, it } from "vitest";
import type { PassadeiraMapa } from "../api/tipos";
import { distanciaM, prepararSegmentos } from "./carros";
import { criarCena, ESPERA_MIN_S, FILA_MAX, PEDIR_S } from "./cena3d";
import { figurasDaPassadeira, prepararPassadeiras } from "./peoes";
import { cortesDosSegmentos } from "./transito3d";

const OP = { travessiasPorFigura: 10, figurasMax: 12, aceleracao: 1 };
const OC = { veiculosPorPonto: 20, pontosMax: 600, aceleracao: 1 };
const KX = 111_320 * Math.cos((40.636 * Math.PI) / 180);
const KY = 110_574;
// Uma passadeira de 10 m (travessia, de oeste para este) por 4 m (sentido do trânsito, norte-sul).
const dx = 10 / KX;
const dy = 4 / KY;
const POLIGONO: PassadeiraMapa = {
  type: "Feature",
  id: "p",
  properties: { id: "p", crosswalk: "c", nome: null, rsu: null },
  geometry: { type: "Polygon", coordinates: [[[-8.6, 40.636], [-8.6 + dx, 40.636], [-8.6 + dx, 40.636 + dy], [-8.6, 40.636 + dy], [-8.6, 40.636]]] },
};
const [P] = prepararPassadeiras([POLIGONO]);
// Um segmento de 100 m, de sul para norte, que corta a passadeira a meio (o centro dela fica a 50 m do início).
const CENTRO = P.ponto(0, 0);
const SEG = prepararSegmentos({
  features: [
    { properties: { id: "s" }, geometry: { type: "LineString", coordinates: [[CENTRO[0], CENTRO[1] - 50 / KY], [CENTRO[0], CENTRO[1] + 50 / KY]] } },
  ],
});
const CORTES = cortesDosSegmentos(SEG, [P]);
const desdeOInicio = (c: [number, number]) => distanciaM(SEG[0].linha[0], c);
const passagem = (kmhs: number[]) => ({
  id: "s",
  veiculos: 20 * kmhs.length,
  vel_media_ms: 10,
  limite_kmh: 40,
  grupos: kmhs.map((kmh) => ({ categoria: "B" as const, kmh })),
});
const cena = (kmhs: number[], travessias = 30) =>
  criarCena(SEG, [passagem(kmhs)], new Set(), [P], new Map([["p", travessias]]), new Set(), CORTES, OC, OP);

describe("os peões da vista 3D (ADR-0041, ponto 3)", () => {
  it("1 figura ≈ 10 travessias, pelo menos 1 com travessias, e o teto de 12 por passadeira", () => {
    expect([0, 3, 92, 422].map((n) => figurasDaPassadeira(n, OP))).toEqual([0, 1, 9, 12]);
  });

  it("a passadeira corta o segmento a cerca de 50 m do início", () => {
    expect(CORTES.get("s")?.[0].d).toBeCloseTo(50, 0);
  });

  it("as figuras ficam na passadeira ou no passeio dela; numa passadeira em falha, nenhuma", () => {
    const relogio = cena([]);
    for (let t = 0; t < 30; t += 0.5)
      for (const p of relogio(t).pessoas) {
        expect(p.coord[0]).toBeGreaterThanOrEqual(-8.6 - 2 / KX);
        expect(p.coord[0]).toBeLessThanOrEqual(-8.6 + dx + 2 / KX);
        expect(Math.round(((p.rumo % 360) + 360) % 180)).toBe(90); // para este ou para oeste
      }
    const emFalha = criarCena(SEG, [], new Set(), [P], new Map([["p", 30]]), new Set(["p"]), CORTES, OC, OP);
    expect(emFalha(1).pessoas).toEqual([]);
  });
});

describe("sem atropelamentos (ADR-0043, 3.ª saída)", () => {
  /** Corre a cena e devolve, a cada fotograma, os carros (distância e velocidade mostrada) e se há peões a atravessar. */
  function correr(kmhs: number[], ate: number) {
    const relogio = cena(kmhs);
    const fotogramas = [];
    for (let t = 0; t < ate; t += 0.05) {
      const c = relogio(t);
      fotogramas.push({ t, carros: c.veiculos.map((v) => ({ d: desdeOInicio(v.coord), kmh: v.kmh })), aAtravessar: c.pessoas.some((p) => p.andar) });
    }
    return fotogramas;
  }

  it("nunca há um peão a atravessar com um carro em cima da passadeira", () => {
    for (const kmhs of [[36], [36, 50, 30, 45, 40, 33]])
      for (const f of correr(kmhs, 120)) if (f.aAtravessar) expect(f.carros.some((c) => Math.abs(c.d - 50) < 2 + 0.5)).toBe(false);
  });

  it("com pouco trânsito, os peões atravessam numa aberta e os carros não param", () => {
    // Um carro a 9 km/h num segmento de 100 m: passa na passadeira a cada 40 s, e há abertas de sobra.
    const fs = correr([9], 120);
    expect(fs.some((f) => f.aAtravessar)).toBe(true);
    // Quase sempre à velocidade do grupo: só para se os peões, sem aberta, pedirem passagem quando ele se aproxima.
    expect(fs.filter((f) => f.carros[0].kmh === 9).length / fs.length).toBeGreaterThan(0.8);
  });

  it("com muito trânsito, os peões pedem passagem: os carros param e voltam a andar, e os peões atravessam", () => {
    const fs = correr([36, 50, 30, 45, 40, 33], 120);
    const travessias = fs.filter((f, i) => f.aAtravessar && !fs[i - 1]?.aAtravessar).length;
    expect(travessias).toBeGreaterThan(3); // em 2 minutos, várias travessias, mesmo sem abertas
    const parado = fs.findIndex((f) => f.carros.some((c) => c.kmh === null));
    expect(parado).toBeGreaterThan(-1); // há carros parados ou a travar...
    const i = fs[parado].carros.findIndex((c) => c.kmh === null);
    expect(fs.slice(parado).some((f) => f.carros[i].kmh !== null)).toBe(true); // ...que voltam a andar
  });

  it("parado, a travar ou a arrancar, o carro não mostra a velocidade do grupo nem o anel; a andar, mostra", () => {
    const relogio = cena([36, 50, 30, 45, 40, 33]);
    for (let t = 0; t < 60; t += 0.05) for (const v of relogio(t).veiculos) if (v.kmh === null) expect(v.acima).toBe(false);
  });

  it("os peões esperam pelo menos a espera mínima, e no máximo a espera mais o pedido, antes de atravessar", () => {
    const fs = correr([36, 50, 30, 45, 40, 33], 60);
    const primeira = fs.find((f) => f.aAtravessar)!.t;
    expect(primeira).toBeGreaterThanOrEqual(ESPERA_MIN_S - P.fase * ESPERA_MIN_S - 0.1);
    expect(primeira).toBeLessThan(ESPERA_MIN_S + PEDIR_S + 10); // + o tempo de os carros pararem e a passadeira ficar livre
  });

  it("a fila de espera mostra no máximo 4 carros; os outros desvanecem e nenhum se perde", () => {
    const kmhs = [36, 50, 30, 45, 40, 33, 38, 42, 35, 47];
    const relogio = cena(kmhs);
    let antes: number[] = [];
    let maior = 0;
    for (let t = 0; t < 120; t += 0.05) {
      const v = relogio(t).veiculos;
      expect(v).toHaveLength(kmhs.length); // nenhum grupo se perde
      const ds = v.map((x) => desdeOInicio(x.coord));
      // Parados à vista, antes da passadeira: quase não andaram neste fotograma e não estão a desvanecer.
      const parados = v.filter((x, i) => antes.length && Math.abs(ds[i] - antes[i]) < 0.02 && (x.escala ?? 1) > 0.99 && ds[i] < 48).length;
      if (t > 1) maior = Math.max(maior, parados);
      antes = ds;
    }
    expect(maior).toBeGreaterThan(0); // houve fila...
    expect(maior).toBeLessThanOrEqual(FILA_MAX); // ...mas nunca mais de 4 à vista
  });

  it("os carros nunca se atravessam: na mesma faixa ficam a mais de um carro de distância", () => {
    // 8 grupos com velocidades diferentes num segmento de 100 m: os rápidos apanham os lentos e têm de mudar de faixa ou seguir.
    const relogio = cena([20, 55, 30, 50, 25, 45, 35, 40]);
    for (let t = 0; t < 120; t += 0.05) {
      const v = relogio(t).veiculos.filter((x) => (x.escala ?? 1) > 0.5);
      for (let i = 0; i < v.length; i++)
        for (let j = i + 1; j < v.length; j++) expect(distanciaM(v[i].coord, v[j].coord)).toBeGreaterThan(2);
    }
  });
});

describe("as figuras estimadas e previstas (ADR-0041, ponto 9)", () => {
  it("um grupo estimado anda, translúcido, sem número nem anel; os medidos ficam como estão", () => {
    // 60 km/h num troço de 40: o medido leva o número e o anel; o estimado, nenhum.
    const medido = criarCena(SEG, [passagem([60])], new Set(), [], new Map(), new Set(), CORTES, OC, OP);
    const estimado = criarCena(SEG, [{ ...passagem([60]), estimado: true }], new Set(), [], new Map(), new Set(), CORTES, OC, OP);
    const [m] = medido(1).veiculos;
    const [e] = estimado(1).veiculos;
    expect(m).toMatchObject({ kmh: 60, acima: true });
    expect(m.estimado).toBeUndefined();
    expect(e).toMatchObject({ kmh: null, acima: false, estimado: true });
  });

  it("as figuras de uma passadeira estimada ficam translúcidas, e as das outras não", () => {
    const estimadas = criarCena(SEG, [], new Set(), [P], new Map([["p", 30]]), new Set(), CORTES, OC, OP, undefined, undefined, new Set(["p"]));
    expect(estimadas(1).pessoas.length).toBe(3);
    expect(estimadas(1).pessoas.every((p) => p.estimado)).toBe(true);
    expect(cena([], 30)(1).pessoas.some((p) => p.estimado)).toBe(false);
  });
});
