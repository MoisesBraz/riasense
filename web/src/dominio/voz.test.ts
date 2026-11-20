import { describe, expect, it } from "vitest";
import type { PassagemHora } from "./carros";
import { fraseDaRua, RESSALVA_RADAR, reconhecerRua, resumirRua, vozDesligadaNoModo, type RuaVoz } from "./voz";

const seg = (n: number) => `urn:ngsi-ld:RoadSegment:${n}`;
const rua = (nome: string, sentidos: number[][]): RuaVoz => {
  const urn = sentidos.map((s) => s.map(seg));
  return { nome, sentidos: urn, segmentos: urn.flat() };
};
// Os sentidos de config/riasense.yaml (voz.ruas).
const RUAS: RuaVoz[] = [
  rua("Av. 25 de Abril", [[10084], [11168]]),
  rua("Av. de Oita", [[10368, 11146, 11152], [10366, 11153, 11169]]),
  rua("Av. da Universidade", [[10415, 10419, 11285, 11328, 11361, 11362], [10871]]),
];
const p = (n: number, veiculos: number, extra: Partial<PassagemHora> = {}): PassagemHora => ({
  id: seg(n),
  sensor: "Radar",
  veiculos,
  vel_media_ms: 7,
  limite_kmh: 30,
  acima_limite: Math.round(veiculos * 0.37),
  velocidades_kmh: [20, 24, 28],
  ...extra,
});

describe("reconhecer a rua da pergunta", () => {
  it.each([
    "Como está a Av. 25 de Abril?",
    "como esta a avenida 25 de abril",
    "AV 25 ABRIL",
    "e a vinte... 25 de Abril, como está?",
  ])("«%s» → Av. 25 de Abril", (frase) => {
    expect(reconhecerRua(frase, RUAS)?.nome).toBe("Av. 25 de Abril");
  });

  it("reconhece sem acentos nem maiúsculas", () => {
    expect(reconhecerRua("trânsito na OITA", RUAS)?.nome).toBe("Av. de Oita");
    expect(reconhecerRua("universidade", RUAS)?.nome).toBe("Av. da Universidade");
  });

  it("não reconhece uma pergunta sem rua da lista", () => {
    expect(reconhecerRua("Como está a Rua de Santiago?", RUAS)).toBeNull();
    expect(reconhecerRua("abril", RUAS)).toBeNull();
    expect(reconhecerRua("", RUAS)).toBeNull();
  });
});

describe("o trânsito da rua comparado com a referência (mesma hora, dia anterior)", () => {
  const rua = RUAS[0];

  it("acima de ontem a esta hora", () => {
    const r = resumirRua(rua, [p(10084, 600), p(11168, 400)], [p(10084, 400), p(11168, 300)]);
    expect(r).toMatchObject({ medido: true, veiculos: 1000, sentidos: 2, comparacao: "acima", variacaoPct: 43, sensor: "radar" });
    expect(fraseDaRua(rua.nome, r)).toBe(
      "Av. 25 de Abril: 1000 veículos por hora, nos dois sentidos, medidos pelo radar, mais trânsito do que ontem a esta hora. " +
        "Atenção: o radar e a câmara medem velocidades diferentes: o excesso não é comparável entre sensores.",
    );
  });

  it("abaixo de ontem a esta hora", () => {
    const r = resumirRua(rua, [p(10084, 300)], [p(10084, 600)]);
    expect(r).toMatchObject({ comparacao: "abaixo", variacaoPct: -50 });
    expect(fraseDaRua(rua.nome, r)).toContain("menos trânsito do que ontem a esta hora");
  });

  it("igual dentro de ±10 %", () => {
    const r = resumirRua(rua, [p(10084, 105)], [p(10084, 100)]);
    expect(r).toMatchObject({ comparacao: "igual", variacaoPct: 5 });
    expect(fraseDaRua(rua.nome, r)).toContain("igual ao de ontem a esta hora");
  });

  it("sem dados ontem, diz que não há referência", () => {
    const r = resumirRua(rua, [p(10084, 100)], []);
    expect(r).toMatchObject({ comparacao: null });
    expect(fraseDaRua(rua.nome, r)).toContain("sem referência de ontem a esta hora");
  });

  it("compara só os segmentos medidos nos dois dias", () => {
    const r = resumirRua(rua, [p(10084, 100), p(11168, 900)], [p(10084, 100)]);
    expect(r).toMatchObject({ veiculos: 1000, comparacao: "igual" });
  });

  it("em cada sentido entra a média dos troços, não a soma (Av. de Oita, 3 troços por sentido)", () => {
    const oita = RUAS[1];
    const r = resumirRua(oita, [p(10368, 10), p(11146, 12), p(10366, 9), p(11153, 10)], null);
    expect(r).toMatchObject({ veiculos: 20.5, sentidos: 2 });
    expect(fraseDaRua(oita.nome, r)).toMatch(/^Av\. de Oita: 21 veículos por hora, nos dois sentidos,/);
  });

  it("com um só sentido medido, diz «num só sentido»", () => {
    const uni = RUAS[2];
    const r = resumirRua(uni, [p(10415, 60), p(10419, 73)], null);
    expect(r).toMatchObject({ veiculos: 66.5, sentidos: 1 });
    expect(fraseDaRua(uni.nome, r)).toMatch(/^Av\. da Universidade: 67 veículos por hora, num só sentido,/);
  });

  it("arredonda só no fim: 66,5 + 14 = 80,5 → 81, e a variação vem sem arredondar", () => {
    const uni = RUAS[2];
    const r = resumirRua(uni, [p(10415, 60), p(10419, 73), p(10871, 14)], [p(10415, 101), p(10419, 101), p(10871, 101)]);
    expect(r).toMatchObject({ veiculos: 80.5, sentidos: 2, comparacao: "abaixo", variacaoPct: -60 });
    expect(fraseDaRua(uni.nome, r)).toContain("Av. da Universidade: 81 veículos por hora, nos dois sentidos");
  });

  it("a referência usa só os sentidos medidos nas duas horas (Universidade, 01h de 05/11 contra 01h de 04/11)", () => {
    const uni = RUAS[2];
    // Hoje, os dois sentidos (5,4 a norte + 4 a sul = 9,4); ontem, só o norte (5,0): compara-se só o norte, +8 %, «igual».
    const agora = [p(10415, 5), p(10419, 6), p(11285, 5), p(11328, 6), p(11361, 5), p(10871, 4)];
    const ontem = [p(10415, 5), p(10419, 5), p(11285, 5), p(11328, 5), p(11361, 5)];
    const r = resumirRua(uni, agora, ontem);
    expect(r).toMatchObject({ veiculos: 9.4, sentidos: 2, comparacao: "igual", variacaoPct: 8 });
    expect(fraseDaRua(uni.nome, r)).toContain("Av. da Universidade: 9 veículos por hora, nos dois sentidos");
  });

  it("a velocidade é a mediana dos grupos", () => {
    const r = resumirRua(rua, [p(10084, 100, { velocidades_kmh: [10, 24, 40] })], null);
    expect(r).toMatchObject({ kmh: 24 });
  });

  it("sem grupos, a velocidade vem da média medida em m/s (km/h = ×3,6)", () => {
    const r = resumirRua(rua, [p(10084, 100, { velocidades_kmh: null, vel_media_ms: 10 })], null);
    expect(r).toMatchObject({ kmh: 36 });
  });
});

describe("uma rua em falha não mostra números", () => {
  const rua = RUAS[0];
  it("sem passagens à hora do cursor", () => {
    const r = resumirRua(rua, [p(10415, 300)], [p(10084, 300)]);
    expect(r).toEqual({ medido: false });
    expect(fraseDaRua(rua.nome, r)).toBe("Av. 25 de Abril: sem dados medidos a esta hora.");
  });
  it("com os segmentos em falha (①), mesmo que haja linhas", () => {
    const r = resumirRua(rua, [p(10084, 300), p(11168, 200)], null, new Set([seg(10084), seg(11168)]));
    expect(r).toEqual({ medido: false });
  });
});

describe("a ressalva do radar (ADR-0039, ponto 4) e nunca a % de excesso por rua", () => {
  const rua = RUAS[0];
  it("com o radar, a frase leva a ressalva", () => {
    const frase = fraseDaRua(rua.nome, resumirRua(rua, [p(10084, 300), p(11168, 200)], null));
    expect(frase).toContain("medidos pelo radar");
    expect(frase).toContain(RESSALVA_RADAR);
  });
  it("com a câmara e o radar, também", () => {
    const frase = fraseDaRua(rua.nome, resumirRua(rua, [p(10084, 300, { sensor: "Camera" }), p(11168, 200)], null));
    expect(frase).toContain("medidos pela câmara e pelo radar");
    expect(frase).toContain(RESSALVA_RADAR);
  });
  it("só com a câmara, sem ressalva", () => {
    const frase = fraseDaRua(rua.nome, resumirRua(rua, [p(10084, 300, { sensor: "Camera" })], null));
    expect(frase).toContain("medidos pela câmara");
    expect(frase).not.toContain(RESSALVA_RADAR);
  });
  it("a frase da rua não dá a % acima do limite", () => {
    const r = resumirRua(rua, [p(10084, 300), p(11168, 200)], null);
    expect(r).not.toHaveProperty("acimaPct");
    expect(fraseDaRua(rua.nome, r)).not.toMatch(/%|limite|excesso de/);
  });
});

describe("a voz desligada nos modos «agora» e «Ao vivo»", () => {
  it.each(["agora", "Ao vivo"] as const)("no modo «%s», diz porquê", (modo) => {
    expect(vozDesligadaNoModo(modo)).toBe(`A pergunta por voz é sobre a semana gravada: está desligada no modo «${modo}».`);
  });
});
