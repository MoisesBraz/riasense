import { describe, expect, it } from "vitest";
import { distanciaM, pontosPorSegmento, posicoesDosCarros, prepararSegmentos, textoDaVelocidade, velocidadeDoPonto } from "./carros";

const O = { veiculosPorPonto: 20, pontosMax: 600, aceleracao: 8 };
// Uma linha reta para leste com cerca de 100 m (0,0011837° de longitude a 40,64° N), noutra um só vértice.
const geo = {
  features: [
    { properties: { id: "A" }, geometry: { type: "LineString", coordinates: [[-8.64, 40.64], [-8.6388163, 40.64]] } },
    { properties: { id: "B" }, geometry: { type: "LineString", coordinates: [[-8.65, 40.64]] } },
  ],
};

describe("carros medidos (ADR-0034)", () => {
  it("mede as linhas em metros e ignora as que não têm comprimento", () => {
    const s = prepararSegmentos(geo);
    expect(s.map((x) => x.id)).toEqual(["A"]);
    expect(s[0].comprimento).toBeCloseTo(100, 0);
    expect(distanciaM([-8.64, 40.64], [-8.64, 40.64])).toBe(0);
  });

  it("um ponto por cada 20 veículos medidos, pelo menos 1; nada num segmento em falha ou sem passagens", () => {
    const n = pontosPorSegmento(
      [
        { id: "A", veiculos: 120, vel_media_ms: 6 },
        { id: "C", veiculos: 5, vel_media_ms: 6 },
        { id: "D", veiculos: 0, vel_media_ms: null },
        { id: "E", veiculos: 400, vel_media_ms: 6 },
      ],
      new Set(["E"]),
      O,
    );
    expect(Object.fromEntries(n)).toEqual({ A: 6, C: 1 });
  });

  it("com mais pontos do que o teto, reduz todos na mesma proporção", () => {
    const n = pontosPorSegmento(
      [
        { id: "A", veiculos: 8000, vel_media_ms: 6 },
        { id: "B", veiculos: 4000, vel_media_ms: 6 },
      ],
      new Set(),
      { ...O, pontosMax: 300 },
    );
    expect([n.get("A"), n.get("B")]).toEqual([200, 100]);
  });

  it("os pontos andam à velocidade medida × aceleração, e dão a volta ao fim do segmento", () => {
    const s = prepararSegmentos(geo);
    const passagens = [{ id: "A", veiculos: 20, vel_media_ms: 5 }];
    const [p0] = posicoesDosCarros(s, passagens, new Set(), 0, O);
    const [p1] = posicoesDosCarros(s, passagens, new Set(), 1, O); // 5 m/s × 8 = 40 m
    expect(distanciaM(p0.coord, p1.coord)).toBeCloseTo(40, 0);
    const [p3] = posicoesDosCarros(s, passagens, new Set(), 3, O); // 120 m: volta e fica a 20 m do início
    expect(distanciaM(p0.coord, p3.coord)).toBeCloseTo(20, 0);
    expect(p0).toMatchObject({ kmh: null, acima: false }); // sem os grupos (dados antigos), sem número nem anel
  });

  it("sem a hora medida ou com o segmento em falha, não há carros", () => {
    const s = prepararSegmentos(geo);
    expect(posicoesDosCarros(s, [], new Set(), 0, O)).toEqual([]);
    expect(posicoesDosCarros(s, [{ id: "A", veiculos: 100, vel_media_ms: 5 }], new Set(["A"]), 0, O)).toEqual([]);
  });
});

describe("cada ponto é um grupo de cerca de 20 veículos, à mediana da sua velocidade (ADR-0039)", () => {
  it("o ponto i de k toma o seu grupo; com menos pontos do que grupos, o grupo do meio da sua fatia", () => {
    expect(velocidadeDoPonto([10, 20, 30], 0, 3)).toBe(10);
    expect(velocidadeDoPonto([10, 20, 30], 2, 3)).toBe(30);
    expect(velocidadeDoPonto([10, 20, 30, 40], 0, 2)).toBe(20); // fatia 10–20: o do meio
    expect(velocidadeDoPonto([10, 20, 30, 40], 1, 2)).toBe(40);
    expect(velocidadeDoPonto([], 0, 1)).toBeNull();
  });

  it("cada ponto anda à velocidade do seu grupo (em km/h), e escreve-a arredondada", () => {
    const s = prepararSegmentos(geo);
    // 40 veículos: 2 pontos, um grupo a 18 km/h (5 m/s) e outro a 36 km/h (10 m/s).
    const passagens = [{ id: "A", veiculos: 40, vel_media_ms: 7.5, limite_kmh: 50, acima_limite: 0, velocidades_kmh: [18, 36] }];
    const [a0, b0] = posicoesDosCarros(s, passagens, new Set(), 0, O);
    const [a1, b1] = posicoesDosCarros(s, passagens, new Set(), 0.5, O);
    expect(distanciaM(a0.coord, a1.coord)).toBeCloseTo(20, 0); // 5 m/s × 8 × 0,5 s
    expect(distanciaM(b0.coord, b1.coord)).toBeCloseTo(40, 0); // 10 m/s × 8 × 0,5 s: o dobro
    expect([a0.kmh, b0.kmh]).toEqual([18, 36]);
  });

  it("só o ponto acima do limite da via leva o anel; no limite, não", () => {
    const s = prepararSegmentos(geo);
    const passagens = [{ id: "A", veiculos: 60, vel_media_ms: 8, limite_kmh: 30, acima_limite: 10, velocidades_kmh: [24.4, 30, 36.6] }];
    expect(posicoesDosCarros(s, passagens, new Set(), 0, O).map((p) => [p.kmh, p.acima])).toEqual([
      [24, false],
      [30, false], // no limite: sem anel
      [37, true],
    ]);
  });

  it("sem o limite da via não há anel, mesmo depressa", () => {
    const s = prepararSegmentos(geo);
    const [p] = posicoesDosCarros(s, [{ id: "A", veiculos: 20, vel_media_ms: 20, limite_kmh: null, velocidades_kmh: [72] }], new Set(), 0, O);
    expect(p).toMatchObject({ kmh: 72, acima: false });
  });

  it("o segmento guarda o sensor da semana (câmara ou radar), para o pop-up o dizer", () => {
    const [a] = prepararSegmentos({ features: [{ ...geo.features[0], properties: { id: "A", sensor: "Radar" } }] });
    expect(a.sensor).toBe("Radar");
  });
});

describe("a velocidade ao passar o rato (ADR-0039, ponto 3)", () => {
  it("diz os km/h e se passa o limite, e que é a mediana de um grupo: nunca «este carro ia a»", () => {
    expect(textoDaVelocidade(47, false)).toBe("47 km/h (mediana de um grupo de veículos medidos)");
    expect(textoDaVelocidade(37, true)).toBe("37 km/h, acima do limite da via (mediana de um grupo de veículos medidos)");
    expect(textoDaVelocidade(47, true)).not.toMatch(/este carro|ia a/);
  });
});

describe("o anel decide-se com o valor escrito", () => {
  const ponto = (kmh: number, limite: number) =>
    posicoesDosCarros(prepararSegmentos(geo), [{ id: "A", veiculos: 20, vel_media_ms: kmh / 3.6, limite_kmh: limite, velocidades_kmh: [kmh] }], new Set(), 0, O)[0];

  it("50,4 km/h numa via de 50 escreve «50» e não leva anel; 50,6 escreve «51» e leva", () => {
    expect(ponto(50.4, 50)).toMatchObject({ kmh: 50, acima: false });
    expect(ponto(50.6, 50)).toMatchObject({ kmh: 51, acima: true });
  });

  it("o limite que vem de m/s (50,0004 km/h) também se arredonda", () => {
    expect(ponto(50.3, 13.89 * 3.6)).toMatchObject({ kmh: 50, acima: false });
    expect(ponto(30.6, 8.333 * 3.6)).toMatchObject({ kmh: 31, acima: true });
  });
});
