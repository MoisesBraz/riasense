/**
 * ADR-0048: a lista das falhas paginada pela altura e com dois filtros que se combinam; o indicador «Offline»
 * cinzento; o tema só no cabeçalho; o aviso das fontes abertas nos «Dados locais»; e as notas que saíram da legenda no «ⓘ».
 */
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { App } from "../App";
import { contarPalavras, MAX_PALAVRAS_INFO } from "../dominio/etiquetas";
import { FONTE_SEMAFORO } from "../dominio/proteger";
import { falsificarApi } from "../test/apiFalsa";
import { INFO_SEMAFORO_PROTEGER } from "./PainelProteger";
import { INFO_SEMAFORO_RISCO } from "./PainelRisco";
import { INFO_AEREA, INFO_AVENIDA_VIGIAR, INFO_CALOR, INFO_MAPA_VIGIAR, LINHAS_SEM_MEDIDA, linhasQueCabem } from "./PainelVigiar";

vi.mock("../componentes/mapa/Mapa", () => ({ Mapa: () => <div data-testid="mapa" /> }));

afterEach(() => vi.unstubAllGlobals());

/** Abre a app e carrega no chip `nome` (o fixture tem 10 falhas: 7 de rede e 3 de dispositivo). */
async function abrirPeloChip(nome: RegExp) {
  falsificarApi();
  render(<App />);
  const chips = await screen.findByRole("group", { name: "Resumo das falhas inesperadas" });
  await userEvent.click(within(chips).getByRole("button", { name: nome }));
  return screen.getByRole("region", { name: "Lista das falhas" });
}
const filtro = (lista: HTMLElement, nome: string) => within(lista).getByRole("combobox", { name: nome }) as HTMLSelectElement;
const opcao = (sel: HTMLSelectElement, valor: string) => [...sel.options].find((o) => o.value === valor)!;
const posicao = (lista: HTMLElement) => within(lista).getByRole("navigation", { name: "Páginas da lista" });

describe("a lista das falhas (ADR-0048, ponto 5)", () => {
  it("os chips abrem a lista com o filtro certo, e o tipo de sensor em «Todos»", async () => {
    const lista = await abrirPeloChip(/falhas de rede/);
    expect(filtro(lista, "Tipo de falha").value).toBe("rede");
    expect(filtro(lista, "Tipo de sensor").value).toBe("todos");
    expect(within(lista).getAllByRole("listitem")).toHaveLength(7);
  });

  it("os dois filtros combinam-se; cada opção diz quantas tem, e a que fica vazia pelo outro filtro diz «(0)» e fica desativada", async () => {
    const lista = await abrirPeloChip(/^\d+ falhas:/);
    const falha = filtro(lista, "Tipo de falha");
    const sensor = filtro(lista, "Tipo de sensor");
    expect([...falha.options].map((o) => o.text)).toEqual(["Todas (10)", "Rede (7)", "Dispositivo (3)"]);
    expect([...sensor.options].map((o) => o.text)).toEqual(["Todos (10)", "Passadeira (4)", "Segmento (4)", "Estacionamento (1)", "Zona (1)"]);
    expect([...sensor.options].map((o) => o.value)).not.toContain("rsu"); // nenhuma falha é da RSU como tipo de sensor
    await userEvent.selectOptions(falha, "dispositivo");
    expect(opcao(sensor, "passadeira").text).toBe("Passadeira (0)");
    expect(opcao(sensor, "passadeira").disabled).toBe(true);
    expect(opcao(sensor, "segmento").disabled).toBe(false);
    await userEvent.selectOptions(sensor, "segmento");
    expect(within(lista).getAllByRole("listitem")).toHaveLength(2); // segmentos com falha de dispositivo
    expect(opcao(falha, "rede").text).toBe("Rede (2)");
  });

  it("pagina-se: «1–8 de 10» e ‹ ›; mudar de filtro volta à página 1; clicar numa linha abre o pop-up", async () => {
    const lista = await abrirPeloChip(/^\d+ falhas:/);
    expect(LINHAS_SEM_MEDIDA).toBe(8); // o jsdom não desenha: sem medida, 8 por página
    expect(posicao(lista)).toHaveTextContent("1–8 de 10");
    const anterior = within(lista).getByRole("button", { name: "Página anterior" });
    const seguinte = within(lista).getByRole("button", { name: "Página seguinte" });
    expect(anterior).toBeDisabled();
    await userEvent.click(seguinte);
    expect(posicao(lista)).toHaveTextContent("9–10 de 10");
    expect(within(lista).getAllByRole("listitem")).toHaveLength(2);
    expect(seguinte).toBeDisabled();
    await userEvent.selectOptions(filtro(lista, "Tipo de sensor"), "passadeira");
    expect(posicao(lista)).toHaveTextContent("1–4 de 4");
    await userEvent.click(within(lista).getAllByRole("listitem")[0].querySelector("button")!);
    expect(screen.getByRole("region", { name: "Lista das falhas" })).toBeInTheDocument(); // a lista fica, com o pop-up no mapa
  });

  it("as linhas que cabem contam-se pela altura que sobra: num ecrã mais baixo, menos linhas e mais páginas", () => {
    expect(linhasQueCabem(600, 56, 4)).toBe(10);
    expect(linhasQueCabem(300, 56, 4)).toBe(5);
    expect(linhasQueCabem(40, 56, 4)).toBe(1); // pelo menos uma
    expect(linhasQueCabem(0, 56, 4)).toBe(LINHAS_SEM_MEDIDA); // sem medida
  });

  it("o CSS nunca deixa a lista passar da altura da janela, em nenhum tamanho", () => {
    const { readFileSync } = (globalThis as unknown as { process: { getBuiltinModule: (nome: string) => { readFileSync: (f: string, c: string) => string } } }).process.getBuiltinModule("node:fs");
    const css = readFileSync("src/styles/app.css", "utf8").replace(/\s+/g, " ");
    expect(css).toMatch(/\.falhas \.lista-falhas \{ --linha: 56px; flex: 1 1 0; min-height: 0; overflow: hidden; \}/);
    expect(css).toMatch(/@media \(max-width: 979px\) \{ \.falhas \{ flex: none; height: calc\(100dvh - var\(--space-32\)\); \} \}/);
    expect(css).toMatch(/@media \(max-width: 759px\) \{ \.falhas \{ height: calc\(100dvh - var\(--altura-barra-hora, 89px\) - var\(--space-32\)\); \} \}/);
  });
});

describe("o cabeçalho (ADR-0048, pontos 3 e 4) e os «Dados locais» (ponto 2)", () => {
  it("o estado normal é um ponto cinzento com «Offline» à vista", async () => {
    falsificarApi();
    render(<App />);
    const estado = await screen.findByRole("button", { name: "Offline" });
    expect(estado).toHaveClass("estado-dados--offline");
    expect(estado).not.toHaveClass("estado-dados--erro");
  });

  it("sem resposta da API, fica a vermelho, «API sem resposta»", async () => {
    falsificarApi({ "/sensores": "sem-ligacao" });
    render(<App />);
    expect(await screen.findByRole("button", { name: "API sem resposta" })).toHaveClass("estado-dados--erro");
  });

  it("o tema está só no cabeçalho, fora do menu; os «Dados locais» dizem que os dados das fontes abertas carecem de validação", async () => {
    falsificarApi();
    render(<App />);
    expect(screen.getByRole("button", { name: /Mudar para o tema/ })).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Menu: zona e dados locais" }));
    const menu = screen.getByRole("dialog", { name: "Dados locais" });
    expect(within(menu).queryByRole("button", { name: /Mudar para o tema/ })).toBeNull();
    expect(menu).toHaveTextContent(
      "Dados recolhidos de fontes abertas, usados só para contexto e coerência. Carecem de validação junto das entidades responsáveis.",
    );
  });

  it("no telemóvel, o tema fica à vista ao lado do ☰ (fora da parte da direita, que se esconde)", () => {
    const { readFileSync } = (globalThis as unknown as { process: { getBuiltinModule: (nome: string) => { readFileSync: (f: string, c: string) => string } } }).process.getBuiltinModule("node:fs");
    const css = readFileSync("src/styles/app.css", "utf8").replace(/\s+/g, " ");
    expect(css).toMatch(/\.barra-superior__direita \{ display: none; \} \.barra-superior__menu \{ display: inline-grid; \} \/\* O tema fica ao lado do ☰ \(ADR-0048, ponto 4\)\. \*\/ \.barra-superior__tema \{ margin-left: auto; \}/);
  });
});

describe("as notas que saíram da legenda vão para o «ⓘ» (ADR-0048, ponto 2)", () => {
  it.each([
    ["do mapa do Vigiar", INFO_MAPA_VIGIAR],
    ["da avenida e dos peões 3D (ADR-0043, ADR-0044)", INFO_AVENIDA_VIGIAR],
    ["da vista aérea (ADR-0045)", INFO_AEREA],
    ["dos mapas de calor (ADR-0047)", INFO_CALOR],
    ["dos semáforos no Proteger", INFO_SEMAFORO_PROTEGER],
    ["dos semáforos no risco potencial", INFO_SEMAFORO_RISCO],
  ])("a nota %s tem no máximo 40 palavras", (_nome, info) => {
    expect(contarPalavras(info)).toBeLessThanOrEqual(MAX_PALAVRAS_INFO);
  });

  it("dizem o que vale cada ponto e cada figura, de onde vêm as alturas e os semáforos", () => {
    expect(INFO_MAPA_VIGIAR).toMatch(/cada ponto do «Trânsito» ≈ 20 veículos medidos na hora/);
    expect(INFO_MAPA_VIGIAR).toMatch(/cada figura 3D ≈ \d+ travessias/);
    expect(INFO_MAPA_VIGIAR).toMatch(/com anel se a mediana passa o limite da via;/);
    expect(INFO_MAPA_VIGIAR).toMatch(/alturas: LiDAR da DGT \(2024\) na zona; fora, OpenStreetMap ou 9 m/);
    expect(INFO_MAPA_VIGIAR).not.toMatch(/ADR-/);
    for (const nota of [INFO_SEMAFORO_PROTEGER, INFO_SEMAFORO_RISCO]) expect(nota).toContain(FONTE_SEMAFORO);
  });

  it("o «ⓘ» da lista do Vigiar mostra as 5 notas, uma em cada parágrafo", async () => {
    const lista = await abrirPeloChip(/^\d+ falhas:/);
    await userEvent.click(within(lista).getByRole("button", { name: "Sobre este separador" }));
    const nota = within(lista).getByRole("note");
    expect(nota.querySelectorAll("p")).toHaveLength(5);
    expect(nota).toHaveTextContent("inclui estimados");
    expect(nota).toHaveTextContent("As manchas somam os sensores próximos; a cor é relativa e não é a medida de um só sensor");
    expect(nota).toHaveTextContent("Trânsito");
    expect(nota).toHaveTextContent("ilustrativas");
    expect(nota).toHaveTextContent("não é da semana dos dados");
  });
});
