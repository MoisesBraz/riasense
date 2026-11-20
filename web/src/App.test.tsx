/** Os 4 separadores: ordem, troca e estado partilhado (a mesma zona e a mesma hora em todos). */
import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { App } from "./App";
import { PASSO_REPRODUCAO_MS } from "./componentes/BarraHora";
import { falsificarApi, ok } from "./test/apiFalsa";
import { SENSORES } from "./test/dados";

// O MapLibre precisa de WebGL, que o jsdom não tem. O mapa testa-se no browser; aqui conta-se o que ele recebe.
vi.mock("./componentes/mapa/Mapa", () => ({
  Mapa: (props: {
    marcadores: { id: string; tipo: string }[];
    enquadrarSitios?: [[number, number], [number, number]] | null;
    conteudoPopup: ReactNode;
    onSelecionar: (id: string) => void;
  }) => (
    <div>
      <ul data-testid="mapa" data-sitios={JSON.stringify(props.enquadrarSitios ?? null)}>
        {props.marcadores.map((m) => (
          <li key={m.id} data-tipo={m.tipo}>
            <button type="button" data-sensor={m.id} onClick={() => props.onSelecionar(m.id)}>
              {m.id}
            </button>
          </li>
        ))}
      </ul>
      {props.conteudoPopup}
    </div>
  ),
}));

/** Os 2 sítios do próximo sensor nos dados falsos, longe da zona, com posição para o mapa. */
const SITIOS = [
  { ...SENSORES[1], id: "urn:ngsi-ld:SmartCrosswalk:0016", nome: "Rua X", lon: -8.66, lat: 40.65 },
  { ...SENSORES[1], id: "urn:ngsi-ld:SmartCrosswalk:0024", nome: "Rua Y", lon: -8.64, lat: 40.62 },
];

const cursorDeTempo = () => screen.getByRole("slider", { name: /hora/i });
const rotuloDaHora = () => cursorDeTempo().getAttribute("aria-valuetext");

describe("separadores", () => {
  beforeEach(() => {
    falsificarApi();
  });

  it("mostra os 4 separadores pela ordem Vigiar, Completar, Prever, Proteger, com o Vigiar ativo", () => {
    render(<App />);
    const separadores = screen.getAllByRole("tab");
    expect(separadores.map((s) => s.textContent?.replace(/^\d/, ""))).toEqual(["Vigiar", "Completar", "Prever", "Proteger"]);
    expect(screen.getByRole("tab", { name: /vigiar/i })).toHaveAttribute("aria-selected", "true");
  });

  it("troca o painel quando se clica noutro separador", async () => {
    render(<App />);
    await userEvent.click(screen.getByRole("tab", { name: /completar/i }));
    expect(screen.getByRole("tab", { name: /completar/i })).toHaveAttribute("aria-selected", "true");
    expect(screen.getByRole("tab", { name: /vigiar/i })).toHaveAttribute("aria-selected", "false");
    expect(screen.getByRole("heading", { name: "O que mediria o sensor que falhou?" })).toBeInTheDocument();
  });

  it("muda de separador com as setas do teclado", async () => {
    render(<App />);
    screen.getByRole("tab", { name: /vigiar/i }).focus();
    await userEvent.keyboard("{ArrowRight}");
    expect(screen.getByRole("tab", { name: /completar/i })).toHaveAttribute("aria-selected", "true");
    await userEvent.keyboard("{ArrowLeft}{ArrowLeft}");
    expect(screen.getByRole("tab", { name: /proteger/i })).toHaveAttribute("aria-selected", "true");
  });

  it("abre na hora em que a RSU da zona deixa de comunicar (demo.incidente.inicio)", () => {
    render(<App />);
    expect(rotuloDaHora()).toBe("qua 04/11 · 20h");
  });

  it("de noite, o cursor de hora diz «às escuras» (ADR-0018)", async () => {
    render(<App />);
    expect(await screen.findByText("às escuras")).toBeInTheDocument();
    await waitFor(() => expect(rotuloDaHora()).toBe("qua 04/11 · 20h, às escuras"));
    fireEvent.change(cursorDeTempo(), { target: { value: 70 } }); // sex 06/11 às 13h: sem «às escuras»
    expect(screen.queryByText("às escuras")).toBeNull();
  });

  it("mantém a hora escolhida ao trocar de separador", async () => {
    render(<App />);
    // O cursor anda à hora: 03/11 às 15h + 70 h = sex 06/11 às 13h.
    fireEvent.change(cursorDeTempo(), { target: { value: "70" } });
    expect(rotuloDaHora()).toBe("sex 06/11 · 13h");
    for (const nome of [/completar/i, /prever/i, /proteger/i, /vigiar/i]) {
      await userEvent.click(screen.getByRole("tab", { name: nome }));
      expect(rotuloDaHora()).toBe("sex 06/11 · 13h");
    }
  });

  it("▶ Reproduzir avança a hora sozinha, 1 hora por passo, e Pausar pára (ADR-0029)", () => {
    vi.useFakeTimers();
    try {
      render(<App />);
      expect(rotuloDaHora()).toBe("qua 04/11 · 20h");
      fireEvent.click(screen.getByRole("button", { name: /reproduzir/i }));
      for (let i = 0; i < 3; i++) act(() => vi.advanceTimersByTime(PASSO_REPRODUCAO_MS));
      expect(rotuloDaHora()).toBe("qua 04/11 · 23h");
      // Enquanto corre, o rótulo da hora diz que é a reprodução da semana (ADR-0029, ponto 3).
      expect(screen.getByText(/reprodução da semana de/)).toBeInTheDocument();
      const pausar = screen.getByRole("button", { name: /pausar/i });
      fireEvent.click(pausar);
      for (let i = 0; i < 3; i++) act(() => vi.advanceTimersByTime(PASSO_REPRODUCAO_MS));
      expect(rotuloDaHora()).toBe("qua 04/11 · 23h");
    } finally {
      vi.useRealTimers();
    }
  });

  it("no fim do período, ▶ Reproduzir recomeça no início", () => {
    vi.useFakeTimers();
    try {
      render(<App />);
      fireEvent.change(cursorDeTempo(), { target: { value: cursorDeTempo().getAttribute("max") } });
      fireEvent.click(screen.getByRole("button", { name: /reproduzir/i }));
      expect(rotuloDaHora()).toBe("ter 03/11 · 15h");
      act(() => vi.advanceTimersByTime(PASSO_REPRODUCAO_MS));
      expect(rotuloDaHora()).toBe("ter 03/11 · 16h");
    } finally {
      vi.useRealTimers();
    }
  });

  it("mantém a mesma zona: o mapa é o mesmo nos 4 separadores", async () => {
    render(<App />);
    const mapa = screen.getByTestId("mapa");
    await screen.findAllByText(/SmartCrosswalk:0020/);
    await userEvent.click(screen.getByRole("tab", { name: /proteger/i }));
    expect(screen.getByTestId("mapa")).toBe(mapa);
  });

  it("clicar numa passadeira em falha e «Ver a estimativa» leva ao Completar sem perder a hora", async () => {
    render(<App />);
    fireEvent.change(cursorDeTempo(), { target: { value: "29" } }); // 04/11 às 20h
    await userEvent.click(await within(screen.getByTestId("mapa")).findByText("urn:ngsi-ld:SmartCrosswalk:0020"));
    await userEvent.click(await screen.findByRole("button", { name: /ver a estimativa/i }));
    expect(screen.getByRole("tab", { name: /completar/i })).toHaveAttribute("aria-selected", "true");
    expect(await screen.findByText("SC0020 às 20h")).toBeInTheDocument();
    expect(screen.getAllByText("≈ 3").length).toBeGreaterThan(0); // no painel e no pop-up do mesmo sensor
  });

  it("o mapa recebe os marcadores do separador ativo: falhas no Vigiar, estimados no Completar", async () => {
    render(<App />);
    const mapa = screen.getByTestId("mapa");
    const tipoDe = async (id: string) => (await within(mapa).findByText(`urn:ngsi-ld:${id}`)).closest("li")?.getAttribute("data-tipo");
    await vi.waitFor(async () => expect(await tipoDe("SmartCrosswalk:0020")).toBe("falha-rede"));
    expect(await tipoDe("RoadSideUnit:0030")).toBe("rsu-falha");
    await userEvent.click(screen.getByRole("tab", { name: /completar/i }));
    await vi.waitFor(async () => expect(await tipoDe("SmartCrosswalk:0020")).toBe("estimado"));
    await userEvent.click(screen.getByRole("tab", { name: /proteger/i }));
    await vi.waitFor(async () => expect(await tipoDe("SmartCrosswalk:0021")).toBe("assinalada"));
    expect(await tipoDe("SmartCrosswalk:0020")).toBe("neutro"); // com semáforo: não se assinala (ADR-0024)
  });

  it("clicar num marcador abre o pop-up; Esc fecha-o e devolve o foco ao marcador (ADR-0033, ponto 3)", async () => {
    render(<App />);
    const marcador = await within(screen.getByTestId("mapa")).findByRole("button", { name: "urn:ngsi-ld:SmartCrosswalk:0020" });
    await userEvent.click(marcador);
    const popup = await screen.findByRole("dialog", { name: "Sensor SC0020" });
    expect(popup).toHaveFocus();
    await userEvent.keyboard("{Escape}");
    expect(screen.queryByRole("dialog", { name: "Sensor SC0020" })).not.toBeInTheDocument();
    expect(marcador).toHaveFocus();
  });

  it("aberto a partir da lista do painel, o Esc devolve o foco à linha da lista", async () => {
    falsificarApi({ "/sensores": ok([...SENSORES, ...SITIOS]) });
    render(<App />);
    await userEvent.click(screen.getByRole("tab", { name: /completar/i }));
    await userEvent.click(await screen.findByRole("button", { name: "Onde pôr o próximo sensor" }));
    const linha = within(await screen.findByRole("list", { name: "Onde pôr o próximo sensor" })).getAllByRole("button")[0];
    await userEvent.click(linha);
    expect(await screen.findByRole("dialog", { name: "Sensor SC0016" })).toHaveFocus();
    await userEvent.keyboard("{Escape}");
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(linha).toHaveFocus();
  });

  it("com o próximo sensor ligado, o mapa enquadra os sítios todos; ao desligar, volta à zona (ADR-0033, ponto 5)", async () => {
    falsificarApi({ "/sensores": ok([...SENSORES, ...SITIOS]) });
    render(<App />);
    await userEvent.click(screen.getByRole("tab", { name: /completar/i }));
    const botao = await screen.findByRole("button", { name: "Onde pôr o próximo sensor" });
    const mapa = screen.getByTestId("mapa");
    expect(mapa).toHaveAttribute("data-sitios", "null");
    await userEvent.click(botao);
    await vi.waitFor(() => expect(mapa.getAttribute("data-sitios")).not.toBe("null"));
    const [[oeste, sul], [este, norte]] = JSON.parse(mapa.getAttribute("data-sitios") ?? "null") as number[][];
    for (const s of SITIOS) {
      expect(s.lon).toBeGreaterThanOrEqual(oeste);
      expect(s.lon).toBeLessThanOrEqual(este);
      expect(s.lat).toBeGreaterThanOrEqual(sul);
      expect(s.lat).toBeLessThanOrEqual(norte);
    }
    await userEvent.click(botao);
    expect(mapa).toHaveAttribute("data-sitios", "null");
  });

  it("clicar na RSU abre o pop-up dela, com os seus sensores", async () => {
    render(<App />);
    await userEvent.click(await within(screen.getByTestId("mapa")).findByRole("button", { name: "urn:ngsi-ld:RoadSideUnit:0030" }));
    expect(await screen.findByRole("list", { name: "Sensores da RSU0030" })).toBeInTheDocument();
  });

  it("com a Legenda fechada, as etiquetas obrigatórias continuam no painel", async () => {
    render(<App />);
    expect(screen.getByRole("button", { name: "Legenda" })).toHaveAttribute("aria-expanded", "false");
    const foraDaLegenda = (re: RegExp) => screen.getAllByText(re).filter((e) => !e.closest(".legenda") && e.checkVisibility?.() !== false);
    await userEvent.click(screen.getByRole("tab", { name: /proteger/i }));
    await userEvent.click(screen.getByRole("button", { name: "Mapa de risco potencial", pressed: false }));
    expect(foraDaLegenda(/não mede acidentes/i).length).toBeGreaterThan(0);
    await userEvent.click(screen.getByRole("tab", { name: /completar/i }));
    await userEvent.click(await screen.findByRole("button", { name: "Onde pôr o próximo sensor" }));
    await screen.findByRole("list", { name: "Onde pôr o próximo sensor" });
    expect(foraDaLegenda(/hipótese/i).length).toBeGreaterThan(0);
    expect(foraDaLegenda(/estimado/i).length).toBeGreaterThan(0);
  });

  it("a Legenda fica na coluna da direita e abre com as Camadas abertas, em lados opostos (ADR-0058)", async () => {
    render(<App />);
    const legenda = screen.getByRole("button", { name: "Legenda" });
    const camadas = screen.getByRole("button", { name: /^Camadas/ });
    expect(legenda.closest(".controlos-direita")).not.toBeNull();
    expect(legenda.closest(".controlos-mapa")).toBeNull();
    expect(camadas.closest(".controlos-mapa")).not.toBeNull();
    await userEvent.click(camadas);
    await userEvent.click(legenda);
    expect(camadas).toHaveAttribute("aria-expanded", "true");
    expect(legenda).toHaveAttribute("aria-expanded", "true");
  });

  it("no telemóvel, abrir a Legenda fecha as Camadas (ADR-0042, ponto 5)", async () => {
    vi.stubGlobal("matchMedia", (q: string) => ({ matches: false, media: q, addEventListener() {}, removeEventListener() {} }));
    render(<App />);
    const camadas = screen.getByRole("button", { name: /^Camadas/ });
    await userEvent.click(camadas);
    await userEvent.click(screen.getByRole("button", { name: "Legenda" }));
    expect(screen.getByRole("button", { name: "Legenda" })).toHaveAttribute("aria-expanded", "true");
    expect(camadas).toHaveAttribute("aria-expanded", "false");
  });
});

describe("fechar o painel da direita no ②, no ③, no ④ e no mapa de risco", () => {
  beforeEach(() => {
    falsificarApi();
  });
  const painel = () => screen.queryByRole("tabpanel");
  const corpo = () => document.querySelector("main.corpo");

  it.each([
    ["completar", "O que mediria o sensor que falhou?"],
    ["prever", /^O que vai acontecer daqui a \d+ h\?$/],
    ["proteger", "Os carros abrandam quando há peões?"],
  ])("no %s, o ✕ fecha o painel, o mapa fica com a largura toda, e o botão do mapa reabre-o", async (separador, titulo) => {
    render(<App />);
    await userEvent.click(screen.getByRole("tab", { name: new RegExp(separador, "i") }));
    expect(within(painel()!).getByRole("heading", { name: titulo })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Abrir o painel" })).toBeNull();
    const fechar = within(painel()!).getByRole("button", { name: "Fechar o painel" });
    expect(fechar).toHaveClass("botao-icone");
    await userEvent.click(fechar);
    expect(painel()).toBeNull();
    expect(corpo()).toHaveClass("corpo--sem-painel");
    await userEvent.click(screen.getByRole("button", { name: "Abrir o painel" }));
    expect(within(painel()!).getByRole("heading", { name: titulo })).toBeInTheDocument();
    expect(corpo()).not.toHaveClass("corpo--sem-painel");
    expect(screen.queryByRole("button", { name: "Abrir o painel" })).toBeNull();
  });

  it("no mapa de risco do ④ também, e mudar de separador volta a abrir o painel", async () => {
    render(<App />);
    await userEvent.click(screen.getByRole("tab", { name: /proteger/i }));
    await userEvent.click(within(painel()!).getByRole("button", { name: "Mapa de risco potencial", pressed: false }));
    expect(within(painel()!).getByRole("heading", { name: "Onde estão os peões menos protegidos?" })).toBeInTheDocument();
    await userEvent.click(within(painel()!).getByRole("button", { name: "Fechar o painel" }));
    expect(painel()).toBeNull();
    await userEvent.click(screen.getByRole("tab", { name: /prever/i }));
    expect(painel()).not.toBeNull();
    expect(screen.queryByRole("button", { name: "Abrir o painel" })).toBeNull();
  });

  it("o Esc não fecha o painel, e o ① não tem o botão «Abrir o painel»", async () => {
    render(<App />);
    expect(screen.queryByRole("button", { name: "Abrir o painel" })).toBeNull();
    await userEvent.click(screen.getByRole("tab", { name: /completar/i }));
    await userEvent.keyboard("{Escape}");
    expect(painel()).not.toBeNull();
  });
});
