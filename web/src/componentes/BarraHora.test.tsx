/** O cursor de hora mostra o ícone de sol, de crepúsculo ou de lua, e diz a luminosidade por extenso (ADR-0040). */
import { act, render, screen, waitFor, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { EstadoDemoProvider } from "../estado/estado";
import { falsificarApi } from "../test/apiFalsa";
import { BarraHora } from "./BarraHora";

const aHora = async (hora: string) => {
  falsificarApi();
  render(
    <EstadoDemoProvider inicial={{ hora: Date.parse(hora) }}>
      <BarraHora />
    </EstadoDemoProvider>,
  );
  return screen.findByText((_, el) => el?.classList.contains("barra-hora__luz") ?? false);
};
const tracado = (el: HTMLElement) => el.querySelector("svg path")?.getAttribute("d");

describe("o ícone da luminosidade no cursor de hora", () => {
  it("de noite leva a lua e diz «às escuras»", async () => {
    const luz = await aHora("2026-11-04T20:00Z");
    expect(luz).toHaveClass("barra-hora__luz--noite");
    expect(luz.querySelector("svg")).toHaveAttribute("aria-hidden", "true");
    expect(within(luz).getByText("às escuras")).toBeInTheDocument();
    expect(tracado(luz)).toMatch(/^M20 14\.5A8 8/); // a lua
  });

  it("ao crepúsculo leva o meio sol sobre o horizonte e diz «ao crepúsculo»", async () => {
    const luz = await aHora("2026-11-04T07:00Z");
    expect(luz).toHaveClass("barra-hora__luz--crepusculo");
    expect(within(luz).getByText("ao crepúsculo")).toBeInTheDocument();
    expect(tracado(luz)).toMatch(/^M3 18h18/);
  });

  it("de dia leva o sol, e o nome fica só para o leitor de ecrã (o texto «às escuras» não aparece)", async () => {
    const luz = await aHora("2026-11-04T12:00Z");
    expect(luz).toHaveClass("barra-hora__luz--dia");
    expect(luz.querySelector("circle")).not.toBeNull(); // o centro do sol
    expect(within(luz).getByText("de dia")).toHaveClass("so-leitor");
    expect(screen.queryByText("às escuras")).toBeNull();
  });

  it("os 3 ícones são diferentes", async () => {
    const d = (await aHora("2026-11-04T12:00Z")).querySelector("svg path")?.getAttribute("d");
    document.body.innerHTML = "";
    const c = (await aHora("2026-11-04T07:00Z")).querySelector("svg path")?.getAttribute("d");
    document.body.innerHTML = "";
    const n = (await aHora("2026-11-04T20:00Z")).querySelector("svg path")?.getAttribute("d");
    expect(new Set([d, c, n]).size).toBe(3);
  });
});

describe("o trilho só pinta a falha até ao cursor (ADR-0033, ponto 1)", () => {
  const trilhoAs = async (hora: string) => {
    const f = falsificarApi();
    render(
      <EstadoDemoProvider inicial={{ hora: Date.parse(hora) }}>
        <BarraHora />
      </EstadoDemoProvider>,
    );
    // Espera pelas falhas da API (o trilho só sabe da falha depois delas).
    await waitFor(() => expect(f.mock.calls.some(([u]) => String(u).includes("/vigiar/falhas"))).toBe(true));
    await act(() => new Promise((r) => setTimeout(r, 30)));
    return document.querySelector<HTMLElement>(".barra-hora__falha");
  };
  // A escala vai de 03/11 15h a 10/11 11h (periodo_dados: 164 horas de largura).
  const pct = (iso: string) => ((Date.parse(iso) - Date.parse("2026-11-03T15:00Z")) / (164 * 3_600_000)) * 100;
  // O jsdom resolve o calc() da largura: «calc(1.154%)».
  const largura = (el: HTMLElement) => parseFloat(el.style.width.replace("calc(", ""));

  it("às 19h de 04/11, antes da falha das 20h06, o trilho fica todo neutro", async () => {
    expect(await trilhoAs("2026-11-04T19:00Z")).toBeNull();
  });

  it("às 21h de 04/11, a falha vai das 20h06 até ao fim da hora do cursor, e não até ao fim da semana", async () => {
    const falha = (await trilhoAs("2026-11-04T21:00Z"))!;
    expect(falha).not.toBeNull();
    expect(falha.style.left).toBe(`${pct("2026-11-04T20:06:25Z").toFixed(3)}%`);
    expect(largura(falha)).toBeCloseTo(pct("2026-11-04T22:00Z") - pct("2026-11-04T20:06:25Z"), 2);
  });

  it("no fim da semana, a falha vai até onde acaba (11h de 10/11, o fim da escala)", async () => {
    const falha = (await trilhoAs("2026-11-10T11:00Z"))!;
    expect(largura(falha)).toBeCloseTo(100 - pct("2026-11-04T20:06:25Z"), 2);
  });
});

describe("a barra da hora do ① Vigiar sem a fita dos sensores (ADR-0033, ponto 4)", () => {
  const lerFicheiro = (f: string) => {
    const { readFileSync } = (globalThis as unknown as { process: { getBuiltinModule: (nome: string) => { readFileSync: (f: string, c: string) => string } } }).process.getBuiltinModule("node:fs");
    return readFileSync(f, "utf8").replace(/\s+/g, " ");
  };
  const filhos = () => [...document.querySelector(".barra-hora")!.children].map((e) => e.className.split(" ")[0]);

  it.each(["vigiar", "completar"] as const)("no ecrã largo, no separador %s, a barra tem só o ▶, a hora e o cursor", async (separador) => {
    falsificarApi();
    render(
      <EstadoDemoProvider inicial={{ hora: Date.parse("2026-11-04T20:00Z"), separador }}>
        <BarraHora />
      </EstadoDemoProvider>,
    );
    await screen.findByRole("slider", { name: /hora/i });
    expect(screen.getByRole("button", { name: /Reproduzir/ })).toBeInTheDocument();
    expect(screen.queryByRole("table", { name: /Sensores da zona da demo/ })).toBeNull();
    expect(document.querySelector(".barra-hora .fita")).toBeNull();
    expect(document.querySelector(".barra-hora")).not.toHaveClass("barra-hora--com-fita");
    expect(filhos()).toEqual(["botao", "barra-hora__rotulo", "barra-hora__faixa"]);
  });

  it("o CSS só da fita saiu, e o gravar-demo põe a legenda onde estava antes da fita (150 px), sem ler a altura da barra", () => {
    const css = lerFicheiro("src/styles/app.css");
    expect(css).not.toMatch(/barra-hora--com-fita|fita--barra|fita__estado-texto/);
    const script = lerFicheiro("scripts/gravar-demo.mjs");
    expect(script).toContain('bottom: "150px"');
    expect(script).not.toContain("altura-barra-hora");
  });
});

describe("o batimento das falhas (ADR-0057)", () => {
  const { readFileSync } = (globalThis as unknown as { process: { getBuiltinModule: (nome: string) => { readFileSync: (f: string, c: string) => string } } }).process.getBuiltinModule("node:fs");
  const css = readFileSync("src/styles/app.css", "utf8").replace(/\s+/g, " ");
  const comSeparador = async (separador: "vigiar" | "completar" | "prever" | "proteger") => {
    falsificarApi();
    const { container } = render(
      <EstadoDemoProvider inicial={{ hora: Date.parse("2026-11-04T20:00Z"), separador }}>
        <BarraHora />
      </EstadoDemoProvider>,
    );
    await screen.findByText((_, el) => el?.classList.contains("barra-hora__luz") ?? false);
    return container;
  };

  it("no ① Vigiar: um batimento por hora com falhas, rede e dispositivo cada um com a sua cor, e o tipo no aria-label", async () => {
    const c = await comSeparador("vigiar");
    await waitFor(() => expect(c.querySelectorAll(".barra-hora__ponto").length).toBeGreaterThan(0));
    expect(c.querySelector(".barra-hora")).toHaveClass("barra-hora--pulso");
    const rede = c.querySelectorAll(".barra-hora__ponto--rede");
    const disp = c.querySelectorAll(".barra-hora__ponto--dispositivo");
    expect(rede.length + disp.length).toBe(c.querySelectorAll(".barra-hora__ponto").length);
    expect(rede.length).toBeGreaterThan(0);
    expect(rede[0].getAttribute("aria-label")).toMatch(/\(rede/);
    if (disp.length) expect(disp[0].getAttribute("aria-label")).toMatch(/\(dispositivo\)/);
    // a altura do pico (px)
    expect((rede[0] as HTMLElement).style.getPropertyValue("--pico")).toMatch(/^\d+(\.\d+)?px$/);
    expect(c.querySelectorAll(".barra-hora__pulso-rede").length).toBe(rede.length);
    expect(c.querySelectorAll(".barra-hora__pulso-dispositivo").length).toBe(disp.length);
    // O tipo lê-se pela forma: o pico de rede sobe acima da base (y < 8), o de dispositivo desce abaixo (y > 8).
    const ys = (sel: string) => [...c.querySelectorAll(sel)].flatMap((p) => (p.getAttribute("points") ?? "").split(" ").map((xy) => Number(xy.split(",")[1])));
    expect(Math.min(...ys(".barra-hora__pulso-rede"))).toBeLessThan(8 - 2);
    if (disp.length) {
      expect(Math.max(...ys(".barra-hora__pulso-dispositivo"))).toBeGreaterThan(8 + 2);
      expect(Math.min(...ys(".barra-hora__pulso-dispositivo"))).toBeGreaterThan(8 - 2.5);
    }
  });

  it.each(["completar", "prever", "proteger"] as const)("no separador %s a barra fica como está, sem batimento", async (sep) => {
    const c = await comSeparador(sep);
    expect(c.querySelector(".barra-hora")).not.toHaveClass("barra-hora--pulso");
    expect(c.querySelector(".barra-hora__pulso")).toBeNull();
    expect(c.querySelectorAll(".barra-hora__ponto")).toHaveLength(0);
  });

  it("as cores: rede a vermelho, dispositivo na cor do dispositivo, sem transparência e sem símbolos no pico", () => {
    expect(css).toMatch(/\.barra-hora__pulso polyline\.barra-hora__pulso-rede \{[^}]*stroke: var\(--state-error\)/);
    expect(css).toMatch(/\.barra-hora__pulso polyline\.barra-hora__pulso-dispositivo \{ stroke: var\(--state-device\);/);
    expect(css).not.toMatch(/\.barra-hora__ponto[^{]*::after/);
    expect(css).not.toMatch(/\.barra-hora__pulso polyline \{[^}]*opacity: 0\.55/);
    expect(css).toMatch(/\.barra-hora__faixa \{ position: relative; flex: 1; height: 40px; \}/);
    expect(css).toMatch(/\.barra-hora--pulso \.barra-hora__faixa \{ height: 58px; \}/);
  });
});
