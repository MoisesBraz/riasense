/**
 * O cabeçalho entre 760 e 1023 px: cabia só com 1021 px, e a página toda alargava. O jsdom não desenha, por isso
 * lêem-se as regras do CSS; a medida no browser (760, 800, 900 e 996 px, nos dois temas) faz-se à mão.
 */
import { fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { App } from "../App";
import { falsificarApi } from "../test/apiFalsa";

vi.mock("./mapa/Mapa", () => ({ Mapa: () => <div data-testid="mapa" /> }));
afterEach(() => vi.unstubAllGlobals());

const { readFileSync } = (globalThis as unknown as { process: { getBuiltinModule: (nome: string) => { readFileSync: (f: string, c: string) => string } } }).process.getBuiltinModule("node:fs");
const css = readFileSync("src/styles/app.css", "utf8").replace(/\s+/g, " ");

describe("o cabeçalho entre 760 e 1023 px", () => {
  it("fica só o «R» da marca: o nome sai da vista, mas continua para o leitor de ecrã", () => {
    expect(css).toMatch(
      /@media \(max-width: 1023px\) and \(min-width: 760px\) \{ \.marca__nome \{ position: absolute; width: 1px; height: 1px; overflow: hidden; clip: rect\(0 0 0 0\); white-space: nowrap; \}/,
    );
    falsificarApi();
    render(<App />);
    expect(document.querySelector(".marca__nome")).toHaveTextContent("RiaSense");
  });

  it("o «Simular falha» sai da barra e abre-se na janela do indicador; a partir de 1024 px, só na barra", () => {
    expect(css).toMatch(/\.marca__nome \{[^}]*\} \.barra-superior__direita \.botao-agora \{ display: none; \} \}/);
    expect(css).toMatch(/@media \(min-width: 1024px\) \{ \.popover \.botao-agora \{ display: none; \} \}/);
  });

  it("a janela do indicador tem o «Simular falha» quando a API o serve", async () => {
    falsificarApi({ "/agora/disponivel": { corpo: { disponivel: true, fonte: "simulador", etiqueta: "x" } } });
    render(<App />);
    await userEvent.click(await screen.findByRole("button", { name: "Offline" }));
    const janela = screen.getByRole("dialog", { name: "Dados locais" });
    expect(janela.querySelector(".botao-agora")).toHaveTextContent("Simular falha");
    // O aviso da voz (ADR-0054) fica junto das fontes.
    expect(janela).toHaveTextContent("A voz é reconhecida pelo browser, na Internet.");
  });

  it("até 1179 px, os separadores ficam mais justos (12 px de cada lado)", () => {
    expect(css).toMatch(/@media \(max-width: 1179px\) \{[^@]*\.separador \{ padding: 0 var\(--space-12\); \} \}/);
  });
});

describe("a janela «Dados locais»", () => {
  it("fecha com a tecla Esc e rola por dentro quando é mais alta do que o ecrã", async () => {
    falsificarApi();
    render(<App />);
    await userEvent.click(await screen.findByRole("button", { name: "Offline" }));
    expect(screen.getByRole("dialog", { name: "Dados locais" })).toBeInTheDocument();
    await userEvent.keyboard("{Escape}");
    expect(screen.queryByRole("dialog", { name: "Dados locais" })).toBeNull();
    expect(css).toMatch(/\.popover \{[^}]*max-height: calc\(100dvh - var\(--altura-cabecalho, 64px\) - var\(--space-16\)\); overflow-y: auto;/);
  });
});

describe("abaixo dos 1400 px, o cabeçalho recolhe numa faixa fina (ADR-0059)", () => {
  const faixa = "@media (min-width: 760px) and (max-width: 1399px)";
  it("entre 760 e 1399 px, a faixa tem 44 px e só mostra o separador ativo e o «Offline»", () => {
    const i = css.indexOf(`${faixa} {`);
    expect(i).toBeGreaterThan(-1);
    const bloco = css.slice(i, css.indexOf(" } }", css.indexOf(".barra-superior:is(:hover", i)));
    expect(bloco).toMatch(/\.app \{ grid-template-rows: var\(--touch-min\) minmax\(0, 1fr\); \}/);
    expect(bloco).toMatch(/\.barra-superior \{ align-self: start; height: var\(--touch-min\); overflow: hidden; \}/);
    // Escondem-se a marca, os separadores inativos, o «Simular falha» e o tema; o ativo e o «Offline» ficam.
    expect(bloco).toMatch(
      /\.barra-superior:is\(:not\(:hover, :focus-within, \.barra-superior--expandida\), \.barra-superior--fechada\) :is\(\.marca, \.separador\[aria-selected="false"\], \.botao-agora, \.barra-superior__tema\) \{ display: none; \}/,
    );
    expect(bloco).not.toMatch(/estado-dados[^}]*display: none/);
    // Expande com o rato, com o foco e com o toque, e o Esc recolhe-o.
    expect(bloco).toMatch(
      /\.barra-superior:is\(:hover, :focus-within, \.barra-superior--expandida\):not\(\.barra-superior--fechada\) \{ height: var\(--topbar-height\);/,
    );
  });

  it("a transição só existe sem prefers-reduced-motion", () => {
    expect(css).toMatch(/@media \(min-width: 760px\) and \(max-width: 1399px\) and \(prefers-reduced-motion: no-preference\) \{ \.barra-superior \{ transition: height 150ms ease-out; \} \}/);
    expect(css.match(/transition: height 150ms/g)).toHaveLength(1);
  });

  it("um toque na faixa expande-a e um toque fora recolhe-a; o rato não a prende", () => {
    falsificarApi();
    render(<App />);
    const cabecalho = document.querySelector("header.barra-superior") as HTMLElement;
    fireEvent.pointerDown(cabecalho, { pointerType: "mouse" });
    expect(cabecalho).not.toHaveClass("barra-superior--expandida");
    fireEvent.pointerDown(screen.getByRole("tab", { name: /vigiar/i }), { pointerType: "touch" });
    expect(cabecalho).toHaveClass("barra-superior--expandida");
    fireEvent.pointerDown(screen.getByTestId("mapa"), { pointerType: "touch" });
    expect(cabecalho).not.toHaveClass("barra-superior--expandida");
  });

  it("o Esc recolhe-o sem tirar o foco, que passa para o separador ativo; volta a abrir quando o foco sai", async () => {
    falsificarApi();
    render(<App />);
    const cabecalho = document.querySelector("header.barra-superior") as HTMLElement;
    fireEvent.pointerDown(cabecalho, { pointerType: "touch" });
    screen.getByRole("button", { name: /tema/i }).focus();
    await userEvent.keyboard("{Escape}");
    expect(cabecalho).toHaveClass("barra-superior--fechada");
    expect(cabecalho).not.toHaveClass("barra-superior--expandida");
    expect(document.activeElement).toHaveAttribute("aria-selected", "true");
    fireEvent.pointerLeave(cabecalho);
    expect(cabecalho).not.toHaveClass("barra-superior--fechada");
  });

  it("um Esc já tratado no document (o pop-up) não recolhe o cabeçalho: o 1.º Esc fecha só o pop-up", async () => {
    falsificarApi();
    render(<App />);
    const cabecalho = document.querySelector("header.barra-superior") as HTMLElement;
    fireEvent.pointerDown(cabecalho, { pointerType: "touch" });
    const tema = screen.getByRole("button", { name: /tema/i });
    tema.focus();
    // Como o pop-up do mapa: ouve no document, regista-se depois do cabeçalho e marca o Esc.
    const popup = (e: KeyboardEvent) => e.key === "Escape" && e.preventDefault();
    document.addEventListener("keydown", popup);
    try {
      await userEvent.keyboard("{Escape}");
    } finally {
      document.removeEventListener("keydown", popup);
    }
    expect(cabecalho).not.toHaveClass("barra-superior--fechada");
    expect(cabecalho).toHaveClass("barra-superior--expandida");
    expect(document.activeElement).toBe(tema);
  });

  it("com a janela «Dados locais» aberta, o cabeçalho fica expandido, mesmo depois de um Esc o recolher", async () => {
    falsificarApi();
    render(<App />);
    const cabecalho = document.querySelector("header.barra-superior") as HTMLElement;
    screen.getByRole("button", { name: /tema/i }).focus();
    await userEvent.keyboard("{Escape}");
    expect(cabecalho).toHaveClass("barra-superior--fechada");
    await userEvent.click(await screen.findByRole("button", { name: "Offline" }));
    expect(screen.getByRole("dialog", { name: "Dados locais" })).toBeInTheDocument();
    expect(cabecalho).toHaveClass("barra-superior--expandida");
    expect(cabecalho).not.toHaveClass("barra-superior--fechada");
    // O foco sai para o mapa: a janela continua aberta e o cabeçalho continua expandido.
    fireEvent.pointerDown(screen.getByTestId("mapa"), { pointerType: "mouse" });
    (document.activeElement as HTMLElement | null)?.blur();
    expect(cabecalho).toHaveClass("barra-superior--expandida");
    // O Esc fecha a janela e não recolhe o cabeçalho.
    await userEvent.keyboard("{Escape}");
    expect(screen.queryByRole("dialog", { name: "Dados locais" })).toBeNull();
  });

  it("a 1440 px (fora da faixa), o Esc não recolhe o cabeçalho nem lhe muda o foco (ADR-0059, ponto 4)", async () => {
    falsificarApi();
    render(<App />);
    vi.stubGlobal("matchMedia", (q: string) => ({
      matches: q.includes("min-width") && !q.includes("max-width: 1399px"),
      media: q,
      addEventListener() {},
      removeEventListener() {},
    }));
    const cabecalho = document.querySelector("header.barra-superior") as HTMLElement;
    const tema = screen.getByRole("button", { name: /tema/i });
    tema.focus();
    await userEvent.keyboard("{Escape}");
    expect(cabecalho).not.toHaveClass("barra-superior--fechada");
    expect(document.activeElement).toBe(tema);
  });
});
