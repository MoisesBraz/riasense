/** A luminosidade da hora (ADR-0018, ADR-0040): a classe que o fundo do mapa segue e o ícone do cursor de hora. */
import { describe, expect, it } from "vitest";
import type { HoraLuminosidade } from "../api/tipos";
import { ICONE_DA_LUZ, luzDaHora, NOME_DA_LUZ, rotuloLuz } from "./luminosidade";
import { lerInstante } from "./tempo";

const LINHAS: HoraLuminosidade[] = [
  { t: "2026-11-04T07:00:00", elevacao_graus: -0.9, luminosidade: "crepusculo" },
  { t: "2026-11-04T12:00:00", elevacao_graus: 33.5, luminosidade: "dia" },
  { t: "2026-11-04T20:00:00", elevacao_graus: -28.1, luminosidade: "noite" },
];

describe("luzDaHora", () => {
  it("diz dia, crepúsculo ou noite pela linha dessa hora, sem cálculo novo", () => {
    expect(luzDaHora(LINHAS, lerInstante("2026-11-04T12:00:00"))).toBe("dia");
    expect(luzDaHora(LINHAS, lerInstante("2026-11-04T07:00:00"))).toBe("crepusculo");
    expect(luzDaHora(LINHAS, lerInstante("2026-11-04T20:00:00"))).toBe("noite");
  });

  it("sem linha para a hora, não há luminosidade (o mapa fica de dia)", () => {
    expect(luzDaHora(LINHAS, lerInstante("2026-11-05T03:00:00"))).toBeUndefined();
    expect(luzDaHora([], lerInstante("2026-11-04T12:00:00"))).toBeUndefined();
  });

  it("cada luminosidade tem o seu ícone (sol, crepúsculo, lua) e o seu nome por extenso", () => {
    expect(ICONE_DA_LUZ).toEqual({ dia: "sol", crepusculo: "crepusculo", noite: "lua" });
    expect(NOME_DA_LUZ).toEqual({ dia: "de dia", crepusculo: "ao crepúsculo", noite: "às escuras" });
  });

  it("o rótulo continua só para o crepúsculo e a noite", () => {
    expect(rotuloLuz(LINHAS, lerInstante("2026-11-04T12:00:00"))).toBeNull();
    expect(rotuloLuz(LINHAS, lerInstante("2026-11-04T20:00:00"))).toBe("às escuras");
  });
});
