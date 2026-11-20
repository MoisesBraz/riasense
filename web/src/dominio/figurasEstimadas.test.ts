/** As figuras da vista 3D no ② e no ③ (ADR-0041, ponto 9), com dados inventados. */
import { describe, expect, it } from "vitest";
import type { PassagemHora } from "./carros";
import { dadosDaCenaEstimada, KMH_ESTIMADO, passagensDosTotais } from "./figurasEstimadas";

const S = "urn:ngsi-ld:RoadSegment:";
const P = "urn:ngsi-ld:SmartCrosswalk:";
const medida = (id: string, n: number): PassagemHora => ({ id, veiculos: 20 * n, vel_media_ms: 10, grupos: Array.from({ length: n }, () => ({ categoria: "C" as const, kmh: 40 })) });

describe("os grupos dos totais estimados ou previstos", () => {
  it("dividem o total da zona por 20 e repartem-no com os maiores restos: nenhum segmento fica vazio só por arredondar", () => {
    // 88 + 13 + 4 + 19 + 10 + 29 = 163 veículos → 8 grupos (os de 05/11 às 18h, na zona da RSU0030).
    const totais = new Map([["10368", 88], ["10962", 13], ["11152", 4], ["11165", 19], ["11166", 10], ["11169", 29]].map(([id, n]) => [S + id, n as number]));
    const p = passagensDosTotais(totais, 20);
    const grupos = Object.fromEntries(p.map((x) => [x.id.slice(-5), x.grupos?.length]));
    expect(grupos).toEqual({ "10368": 4, "10962": 1, "11152": 0, "11165": 1, "11166": 1, "11169": 1 });
    expect(p.reduce((a, x) => a + (x.grupos?.length ?? 0), 0)).toBe(8);
  });

  it("são todos ligeiros, à mesma velocidade, sem limite (sem anel) e marcados como estimados", () => {
    const [p] = passagensDosTotais(new Map([[S + "1", 45]]), 20);
    expect(p.grupos).toEqual([{ categoria: "B", kmh: KMH_ESTIMADO }, { categoria: "B", kmh: KMH_ESTIMADO }]);
    expect(p).toMatchObject({ veiculos: 45, limite_kmh: null, estimado: true });
  });

  it("o empate dos restos desfaz-se pelo id", () => {
    const p = passagensDosTotais(new Map([[S + "b", 10], [S + "a", 10]]), 20);
    expect(p.map((x) => [x.id.slice(-1), x.grupos?.length])).toEqual([["a", 1], ["b", 0]]);
  });
});

describe("os dados da cena no ② e no ③", () => {
  const segmentos = new Set([S + "1", S + "2", S + "3"]);
  const passadeiras = new Set([P + "19", P + "20"]);
  const medido = {
    passagens: [medida(S + "1", 2), medida(S + "2", 1)],
    emFalha: new Set([S + "2", S + "3"]),
    travessias: new Map([[P + "20", 30]]),
    passadeirasEmFalha: new Set([P + "19"]),
  };

  it("②: os sensores em falha com estimativa andam com ela; os sem estimativa ficam sem figuras; os outros, com o medido", () => {
    // O segmento 2 e a passadeira 19 estão em falha e têm estimativa; o 3 está em falha e não tem (ADR-0007).
    const d = dadosDaCenaEstimada("completar", medido, new Map([[S + "2", 60], [P + "19", 140], [S + "9", 500]]), segmentos, passadeiras, 20);
    expect(d.passagens.map((p) => [p.id.slice(-1), p.estimado ?? false, p.grupos?.length])).toEqual([["1", false, 2], ["2", true, 3]]);
    expect([...d.emFalha]).toEqual([S + "3"]);
    expect([...d.travessias]).toEqual([[P + "20", 30], [P + "19", 140]]);
    expect([...d.passadeirasEmFalha]).toEqual([]);
    expect([...d.estimadas]).toEqual([P + "19"]);
    expect(d.comEstimados).toBe(true);
  });

  it("③: só as previsões, e só onde existem; sem medidos", () => {
    const d = dadosDaCenaEstimada("prever", medido, new Map([[S + "3", 20], [P + "20", 12]]), segmentos, passadeiras, 20);
    expect(d.passagens.map((p) => [p.id.slice(-1), p.estimado, p.grupos?.length])).toEqual([["3", true, 1]]);
    expect([...d.travessias]).toEqual([[P + "20", 12]]);
    expect([...d.estimadas]).toEqual([P + "20"]);
    expect(d.emFalha.size + d.passadeirasEmFalha.size).toBe(0);
  });

  it("③ fora das 48 h do teste: sem previsões, sem figuras e sem selo", () => {
    const d = dadosDaCenaEstimada("prever", medido, new Map(), segmentos, passadeiras, 20);
    expect(d.passagens).toEqual([]);
    expect(d.travessias.size).toBe(0);
    expect(d.comEstimados).toBe(false);
  });
});

describe("a camada «Trânsito» no ② e no ③", () => {
  it("aparece nas Camadas dos 2 separadores, como no ①", async () => {
    const { camadasDoSeparador } = await import("../componentes/Camadas");
    expect(camadasDoSeparador("completar", "")).toContain("transito");
    expect(camadasDoSeparador("prever", "")).toContain("transito");
    expect(camadasDoSeparador("proteger", "abrandamento")).not.toContain("transito");
  });
});
