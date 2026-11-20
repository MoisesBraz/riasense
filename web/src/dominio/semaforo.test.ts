/** A máquina de estados das luzes dos semáforos da vista 3D. */
import { describe, expect, it } from "vitest";
import { DURACAO_CICLO_S, luzesDoSemaforo } from "./semaforo";

const fase = (s: number) => {
  const { carros, peoes } = luzesDoSemaforo(s);
  return `${carros}/${peoes}`;
};

describe("luzesDoSemaforo", () => {
  it("os carros fazem verde 6 s → amarelo 2 s → vermelho 6 s → amarelo 2 s, e voltam ao verde", () => {
    expect(DURACAO_CICLO_S).toBe(16);
    expect([0, 5.9, 6, 7.9, 8, 13.9, 14, 15.9, 16].map(fase)).toEqual([
      "verde/vermelho", "verde/vermelho",
      "amarelo/vermelho", "amarelo/vermelho",
      "vermelho/verde", "vermelho/verde",
      "amarelo/vermelho", "amarelo/vermelho",
      "verde/vermelho",
    ]);
  });

  it("os peões só têm verde com os carros a vermelho, em todo o ciclo", () => {
    for (let s = 0; s < 3 * DURACAO_CICLO_S; s += 0.25) {
      const l = luzesDoSemaforo(s);
      expect(l.peoes === "verde").toBe(l.carros === "vermelho");
    }
  });

  it("diz quanto falta para a fase seguinte, e o ciclo repete-se (também para tempos negativos)", () => {
    expect(luzesDoSemaforo(4.5).faltaS).toBeCloseTo(1.5);
    expect(luzesDoSemaforo(9).faltaS).toBeCloseTo(5);
    expect(fase(16 * 100 + 9)).toBe("vermelho/verde");
    expect(fase(-2)).toBe("amarelo/vermelho");
  });

  it("com «reduzir movimento», fica parado com os peões a verde e não muda", () => {
    for (const s of [0, 7, 9, 15]) expect(luzesDoSemaforo(s, true)).toEqual({ carros: "vermelho", peoes: "verde", faltaS: Infinity });
  });
});
