/** O «batimento» da barra da hora: sensores em falha por hora e as horas em que começam falhas. */
import { describe, expect, it } from "vitest";
import type { Falha } from "../api/tipos";
import { pulsoDasFalhas } from "./vigiar";

const H = 3_600_000;
const T0 = Date.parse("2026-11-04T18:00:00Z");
const falha = (sensor: string, ini: number, fim: number, tipo: Falha["tipo"], rsu: string | null = null): Falha => ({
  sensor, tipo_sensor: "passadeira", rsu, inicio: new Date(ini).toISOString(), fim: new Date(fim).toISOString(),
  duracao_h: (fim - ini) / H, em_curso: false, tipo, grupo: 1,
});

describe("pulsoDasFalhas", () => {
  const horas = [0, 1, 2, 3, 4].map((i) => T0 + i * H); // 18h a 22h
  const falhas = [
    falha("urn:ngsi-ld:SmartCrosswalk:0020", T0 + 2 * H + 6 * 60_000, T0 + 9 * H, "rede", "urn:ngsi-ld:RoadSideUnit:0030"),
    falha("urn:ngsi-ld:SmartCrosswalk:0019", T0 + 2 * H + 6 * 60_000, T0 + 9 * H, "rede", "urn:ngsi-ld:RoadSideUnit:0030"),
    falha("urn:ngsi-ld:RoadSegment:10576", T0 + 1 * H + 32 * 60_000, T0 + 3 * H, "dispositivo"),
  ];
  const { emFalha, inicios } = pulsoDasFalhas(falhas, horas);

  it("conta os sensores em falha em cada hora, incluindo a hora em que a falha começa e a em que acaba", () => {
    expect(emFalha).toEqual([0, 1, 3, 2, 2]);
  });

  it("agrupa os inícios por hora: um ponto às 19h (dispositivo) e um às 20h com os 2 sensores da rede", () => {
    expect(inicios.map((g) => [new Date(g.hora).toISOString().slice(11, 16), g.sensores.length, g.rede, g.rsus])).toEqual([
      ["19:00", 1, false, []],
      ["20:00", 2, true, ["urn:ngsi-ld:RoadSideUnit:0030"]],
    ]);
    expect(inicios[1].instante).toBe(T0 + 2 * H + 6 * 60_000); // o ponto fica às 20h06, não às 20h00
  });
});
