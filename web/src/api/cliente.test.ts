import { afterEach, describe, expect, it, vi } from "vitest";

afterEach(() => {
  vi.unstubAllGlobals();
  vi.doUnmock("../config");
  vi.resetModules();
});

describe("cliente da API com um endereço relativo (/api)", () => {
  it("pede à mesma origem da página e lê os dados", async () => {
    // A web compilada para a VM usa a API na mesma origem (ADR-0028): VITE_API_URL=/api, um endereço relativo.
    vi.resetModules();
    vi.doMock("../config", () => ({ API_URL: "/api" }));
    const { lerCamada } = await import("./cliente");
    const pedidos: string[] = [];
    vi.stubGlobal("fetch", async (url: string) => {
      pedidos.push(url);
      return new Response(JSON.stringify({ dados: [{ id: "a" }] }), { status: 200 });
    });

    const r = await lerCamada<{ id: string }>("/vigiar/falhas", { sensor: "SmartCrosswalk:0019" });

    expect(r).toEqual({ estado: "ok", dados: [{ id: "a" }] });
    const url = new URL(pedidos[0]);
    expect(url.origin).toBe(globalThis.location.origin);
    expect(url.pathname).toBe("/api/vigiar/falhas");
    expect(url.searchParams.get("sensor")).toBe("SmartCrosswalk:0019");
  });
});
