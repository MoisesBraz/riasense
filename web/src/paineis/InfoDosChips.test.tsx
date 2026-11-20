/**
 * No ① Vigiar, o «ⓘ» com as ressalvas do mapa fica junto dos 3 chips, à vista sem abrir a lista
 * das falhas. E os dois could da mesma nota: as alturas dizem-se aproximadas (ADR-0037), e o selo «Offline» dos «Dados
 * locais» fica cinzento, como o indicador do cabeçalho (ADR-0048, ponto 3).
 */
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { App } from "../App";
import { falsificarApi } from "../test/apiFalsa";
import { INFO_AVENIDA_VIGIAR, INFO_CALOR, INFO_MAPA_VIGIAR, INFO_VIGIAR } from "./PainelVigiar";

vi.mock("../componentes/mapa/Mapa", () => ({ Mapa: () => <div data-testid="mapa" /> }));

afterEach(() => vi.unstubAllGlobals());

const lerCss = () => {
  const { readFileSync } = (globalThis as unknown as { process: { getBuiltinModule: (nome: string) => { readFileSync: (f: string, c: string) => string } } }).process.getBuiltinModule("node:fs");
  return readFileSync("src/styles/app.css", "utf8").replace(/\s+/g, " ");
};

describe("o «ⓘ» junto dos 3 chips do ① Vigiar", () => {
  it("a nota aberta fecha com a tecla Esc (WCAG 1.4.13)", async () => {
    falsificarApi();
    render(<App />);
    const chips = await screen.findByRole("group", { name: "Resumo das falhas inesperadas" });
    const info = within(chips).getByRole("button", { name: "Sobre o Vigiar e o mapa" });
    await userEvent.click(info);
    expect(within(chips).getByRole("note")).toBeInTheDocument();
    await userEvent.keyboard("{Escape}");
    expect(info).toHaveAttribute("aria-expanded", "false");
    expect(within(chips).queryByRole("note")).toBeNull();
  });

  it("com um pop-up aberto, o 1.º Esc fecha só o pop-up, e a nota fica", async () => {
    falsificarApi();
    render(<App />);
    const chips = await screen.findByRole("group", { name: "Resumo das falhas inesperadas" });
    await userEvent.click(within(chips).getByRole("button", { name: "Sobre o Vigiar e o mapa" }));
    // O pop-up do mapa trata o Esc no document e chama o preventDefault (MapaDaDemo).
    const popup = (e: KeyboardEvent) => e.key === "Escape" && e.preventDefault();
    document.addEventListener("keydown", popup);
    await userEvent.keyboard("{Escape}");
    expect(within(chips).getByRole("note")).toBeInTheDocument();
    document.removeEventListener("keydown", popup);
    await userEvent.keyboard("{Escape}");
    expect(within(chips).queryByRole("note")).toBeNull();
  });

  it("sem chip escolhido (sem painel), o «ⓘ» está ao lado dos chips e abre as duas notas, a do mapa incluída", async () => {
    falsificarApi();
    render(<App />);
    const chips = await screen.findByRole("group", { name: "Resumo das falhas inesperadas" });
    expect(screen.queryByRole("region", { name: "Lista das falhas" })).toBeNull();
    const info = within(chips).getByRole("button", { name: "Sobre o Vigiar e o mapa" });
    expect(info).toHaveAttribute("aria-expanded", "false");
    expect(within(chips).queryByRole("note")).toBeNull();

    await userEvent.click(info);
    expect(info).toHaveAttribute("aria-expanded", "true");
    const nota = within(chips).getByRole("note");
    expect(info).toHaveAttribute("aria-controls", nota.id);
    expect(nota).toHaveTextContent(INFO_VIGIAR);
    expect(nota).toHaveTextContent(INFO_MAPA_VIGIAR);
    // A ressalva da avenida e da paragem ilustrativa (ADR-0043 (d), ADR-0044) também no ⓘ dos chips.
    expect(nota).toHaveTextContent(INFO_AVENIDA_VIGIAR);
    // A nota dos mapas de calor (ADR-0047) também no ⓘ dos chips, como a da avenida.
    expect(nota).toHaveTextContent(INFO_CALOR);
    expect(nota).toHaveTextContent(/cada ponto do «Trânsito»/);

    await userEvent.click(info);
    expect(within(chips).queryByRole("note")).toBeNull();
  });

  it("o «ⓘ» não conta como chip: os 3 chips continuam a abrir a lista com o filtro deles", async () => {
    falsificarApi();
    render(<App />);
    const chips = await screen.findByRole("group", { name: "Resumo das falhas inesperadas" });
    expect(within(chips).getAllByRole("button", { pressed: false })).toHaveLength(3);
    await userEvent.click(within(chips).getByRole("button", { name: /falhas de rede/ }));
    expect(screen.getByRole("region", { name: "Lista das falhas" })).toBeInTheDocument();
  });

  it("o CSS: a partir de 760 px o «ⓘ» fica à direita dos cartões (fora da grelha, ou numa coluna com a lista aberta); no telemóvel fica por cima deles, e sai com a lista aberta", () => {
    const css = lerCss();
    expect(css).toMatch(/\.indicadores \{ position: absolute;[^}]*grid-template-columns: repeat\(3, 184px\);/);
    expect(css).toMatch(/@media \(min-width: 760px\) \{ \.corpo--sem-painel \.indicadores__botao-info \{ position: absolute; top: 0; left: calc\(100% \+ var\(--space-8\)\); \} \}/);
    expect(css).toMatch(/\.corpo:not\(\.corpo--sem-painel\) \.indicadores \{ right: var\(--space-16\);[^}]*grid-template-columns: repeat\(3, minmax\(0, 184px\)\) auto;/);
    expect(css).toMatch(/\.indicadores__info \{ position: absolute; top: calc\(100% \+ var\(--space-8\)\);/);
    expect(css).toMatch(/\.indicadores:has\(> \.indicadores__info\) \{ z-index: 4; \}/);
    expect(css).toMatch(/\.indicadores \{ top: 120px;[^}]*grid-template-columns: repeat\(3, minmax\(0, 1fr\)\);/);
    expect(css).toMatch(/\.indicadores__botao-info \{ position: absolute; right: 0; bottom: calc\(100% \+ var\(--space-8\)\); \}/);
    expect(css).toMatch(/\.corpo:not\(\.corpo--sem-painel\) \.indicadores__botao-info, \.corpo:not\(\.corpo--sem-painel\) \.indicadores__info \{ display: none; \}/);
  });
});

describe("as notas do ⓘ dos chips", () => {
  it("as alturas dizem-se aproximadas fora da zona, com a fonte OpenStreetMap (ADR-0037), e medidas pelo LiDAR de 2024 na zona (ADR-0050)", () => {
    expect(INFO_MAPA_VIGIAR).toMatch(/alturas: LiDAR da DGT \(2024\) na zona; fora, OpenStreetMap ou 9 m \(aproximada\)\.$/);
  });

  it("o selo «Offline» dos «Dados locais» é cinzento, como o indicador", async () => {
    falsificarApi();
    render(<App />);
    await screen.findByRole("button", { name: "Offline" });
    await userEvent.click(screen.getByRole("button", { name: "Menu: zona e dados locais" }));
    const selo = within(screen.getByRole("dialog", { name: "Dados locais" })).getByText("Offline");
    expect(selo).toHaveClass("selo--neutro");
    expect(selo).not.toHaveClass("selo--ok");
  });

  it("sem resposta da API, o selo dos «Dados locais» continua vermelho", async () => {
    falsificarApi({ "/sensores": "sem-ligacao" });
    render(<App />);
    await screen.findByRole("button", { name: "API sem resposta" });
    await userEvent.click(screen.getByRole("button", { name: "Menu: zona e dados locais" }));
    expect(within(screen.getByRole("dialog", { name: "Dados locais" })).getByText("API sem resposta")).toHaveClass("selo--erro");
  });
});

describe("os 3 chips mais pequenos (ADR-0033, ponto 4)", () => {
  it("o número a 22 px, o resto a 12 px, o nome numa linha no ecrã largo, menos espaço interior e alvo de toque ≥ 44 px", () => {
    const css = lerCss();
    const bloco = css.slice(css.indexOf("/* ════ Os 3 chips do ① Vigiar mais pequenos (ADR-0033, ponto 4)"));
    expect(bloco).toMatch(/\.indicadores \{ grid-template-columns: repeat\(3, max-content\); \}/);
    expect(bloco).toMatch(/\.indicadores \.kpi \{ display: grid;[^}]*min-height: var\(--touch-min\); padding: var\(--space-8\) var\(--space-12\); \}/);
    expect(bloco).toMatch(/\.indicadores \.kpi__rotulo \{ grid-area: rotulo; font: 500 12px\/16px var\(--font-sans\); white-space: nowrap; \}/);
    expect(bloco).toMatch(/\.indicadores \.kpi__valor \{ grid-area: valor; font: 600 22px\/26px var\(--font-sans\); \}/);
    expect(bloco).toMatch(/\.indicadores \.kpi__nota \{ grid-area: nota; font: 400 12px\/16px var\(--font-sans\); \}/);
    // O «ⓘ» a meio da altura nova.
    expect(bloco).toMatch(/\.corpo--sem-painel \.indicadores__botao-info \{ top: 50%; transform: translateY\(-50%\); \}/);
  });

  it("no telemóvel, a 390 px, os 3 nomes cabem numa linha: menos espaço à volta, a mesma letra; só abaixo dos 375 px o nome parte", () => {
    const css = lerCss();
    const bloco = css.slice(css.indexOf("/* ════ Os 3 chips do ① Vigiar mais pequenos (ADR-0033, ponto 4)"));
    expect(bloco).toMatch(
      /@media \(max-width: 759px\) \{ \.indicadores \{ column-gap: var\(--space-4\); \} \.indicadores \.kpi \{ padding: var\(--space-4\); \} \.indicadores \.kpi__rotulo--com-simbolo \{ gap: var\(--space-2\); \} \}/,
    );
    expect(bloco).toMatch(/@media \(max-width: 374px\) \{ \.indicadores \.kpi__rotulo \{ white-space: normal; \} \}/);
    expect(bloco).not.toMatch(/@media \(max-width: 759px\) \{ \.indicadores \.kpi__rotulo \{ white-space: normal; \} \}/);
  });
});
