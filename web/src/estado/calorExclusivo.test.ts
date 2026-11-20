import { describe, expect, it } from "vitest";
import { camadaLigada, estadoInicial, reduzir } from "./estado";

describe("os 2 mapas de calor são exclusivos (ADR-0047, ponto 1)", () => {
  it("começam desligados; ligar um desliga o outro; desligar não liga nada", () => {
    let e = estadoInicial();
    expect(camadaLigada(e, "calorPeoes") || camadaLigada(e, "calorVeiculos")).toBe(false);
    e = reduzir(e, { tipo: "camada", camada: "calorPeoes" });
    expect([camadaLigada(e, "calorPeoes"), camadaLigada(e, "calorVeiculos")]).toEqual([true, false]);
    e = reduzir(e, { tipo: "camada", camada: "calorVeiculos" });
    expect([camadaLigada(e, "calorPeoes"), camadaLigada(e, "calorVeiculos")]).toEqual([false, true]);
    e = reduzir(e, { tipo: "camada", camada: "calorVeiculos" });
    expect([camadaLigada(e, "calorPeoes"), camadaLigada(e, "calorVeiculos")]).toEqual([false, false]);
  });

  it("as outras camadas não mexem no calor", () => {
    let e = reduzir(estadoInicial(), { tipo: "camada", camada: "calorPeoes" });
    e = reduzir(e, { tipo: "camada", camada: "transito" });
    expect(camadaLigada(e, "calorPeoes")).toBe(true);
  });
});
