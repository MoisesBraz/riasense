/** O modo «agora»: o simulador mostra-se no mapa (âmbar = sem comunicação), sem a barra da hora nem a caixa com listas. */
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { App } from "../App";
import { ETIQUETA_SIMULADOR, type EstadoAgora } from "../api/agora";
import { falsificarApi } from "../test/apiFalsa";

vi.mock("../componentes/mapa/Mapa", () => ({
  Mapa: (props: { marcadores: { id: string; tipo: string; halo?: { tipo: string } }[]; trocosEmFalha?: string[] }) => (
    <ul data-testid="mapa" data-trocos={(props.trocosEmFalha ?? []).join(",")}>
      {props.marcadores.map((m) => (
        <li key={m.id} data-tipo={m.tipo} data-halo={m.halo?.tipo ?? ""}>
          {m.id}
        </li>
      ))}
    </ul>
  ),
}));

const RSU = "urn:ngsi-ld:RoadSideUnit:0030";
const cw = (n: string, calado: boolean) => ({
  id: `urn:ngsi-ld:SmartCrosswalk:${n}`, tipo: "passadeira" as const, rsus: [RSU], passadeiras: [n],
  ultimo_dado_min: calado ? 14 : 1, limite_min: 41.4, calado, falha: false,
});
const simulado: EstadoAgora = {
  fonte: "simulador", etiqueta: ETIQUETA_SIMULADOR, hora_simulada: "20h14", velocidade: 60, leitura_ms: 60_000, prob_max: 1e-6,
  falha: { rsu: RSU, ativa: true },
  sensores: [cw("0019", false), cw("0020", true), cw("0021", false), cw("0022", false)],
  rsus: [{ id: RSU, passadeiras: [`urn:ngsi-ld:SmartCrosswalk:0020`], ultimo_dado_min: 14, limite_min: 12.6, calado: true, falha: false }],
};
const ok = (corpo: unknown) => ({ corpo });

afterEach(() => vi.unstubAllGlobals());

describe("modo agora", () => {
  it("abrir o modo pinta o mapa com o simulador, tira a barra da hora e mostra o aviso da RSU sem comunicação", async () => {
    falsificarApi({
      "/agora/disponivel": ok({ disponivel: true, fonte: "simulador", etiqueta: ETIQUETA_SIMULADOR }),
      "/agora/simulador/iniciar": ok(simulado),
      "/agora": ok(simulado),
    });
    render(<App />);
    expect(screen.getByRole("slider", { name: /hora/i })).toBeInTheDocument();
    await userEvent.click(await screen.findByRole("button", { name: /Simular falha/ }));
    const faixa = await screen.findByRole("region", { name: "Painel agora" });
    expect(await within(faixa).findByText(ETIQUETA_SIMULADOR)).toBeInTheDocument();
    const mapa = screen.getByTestId("mapa");
    expect((await within(mapa).findByText("urn:ngsi-ld:SmartCrosswalk:0020")).getAttribute("data-tipo")).toBe("atencao");
    expect(within(mapa).getByText("urn:ngsi-ld:SmartCrosswalk:0019").getAttribute("data-tipo")).toBe("ativo");
    // A SC0020 é da RSU sem comunicação: mesmo que sozinha ainda comunicasse, mostra o alerta da RSU.
    expect(within(mapa).getByText(RSU).getAttribute("data-tipo")).toBe("rsu"); // sem comunicação é alerta (âmbar), não falha
    expect(screen.queryByRole("slider", { name: /hora/i })).toBeNull(); // a hora é a simulada
    expect(screen.getByRole("alert")).toHaveTextContent("RSU0030 (SC0020): sem dados há 14 min");
  });

  it("a 390 px o modo abre pelo menu ☰, com a etiqueta da simulação", async () => {
    falsificarApi({
      "/agora/disponivel": ok({ disponivel: true, fonte: "simulador", etiqueta: ETIQUETA_SIMULADOR }),
      "/agora/simulador/iniciar": ok(simulado),
      "/agora": ok(simulado),
    });
    render(<App />);
    await userEvent.click(screen.getByRole("button", { name: /^Menu/ }));
    const menu = screen.getByRole("dialog", { name: "Dados locais" });
    await userEvent.click(await within(menu).findByRole("button", { name: /Simular falha/ }));
    expect(screen.queryByRole("dialog", { name: "Dados locais" })).toBeNull(); // o menu fecha
    const faixa = await screen.findByRole("region", { name: "Painel agora" });
    expect(await within(faixa).findByText(ETIQUETA_SIMULADOR)).toBeInTheDocument();
  });

  it("o CSS deixa a faixa baixa abaixo de 760 px e esconde o «Agora» do menu no ecrã largo", () => {
    // O jsdom não desenha e o vitest tem `css: false`: guarda-se a regra lendo o ficheiro com o `fs` do Node.
    const { readFileSync } = (globalThis as unknown as { process: { getBuiltinModule: (nome: string) => { readFileSync: (f: string, c: string) => string } } }).process.getBuiltinModule("node:fs");
    const css = readFileSync("src/styles/app.css", "utf8").replace(/\s+/g, " ");
    const bloco = css.slice(css.indexOf("@media (max-width: 759px) { /* O cabeçalho tem a altura"));
    expect(bloco).toMatch(/\.faixa-agora__corpo \{ flex-direction: row;/); // o «Agora» e a hora numa linha
    expect(bloco).toMatch(/\.faixa-agora \.etiqueta-simulacao \{ font: var\(--type-seal\); white-space: normal; \}/); // 2 linhas, não 3
    // A partir de 1024 px: entre 760 e 1023 px a barra já não tem o «Agora», e fica o da janela.
    expect(css).toMatch(/@media \(min-width: 1024px\) \{ \.popover \.botao-agora \{ display: none; \} \}/);
    // A folha do detalhe (ecrã estreito) não deixa o aviso tapado a meio: o aviso sai enquanto ela está aberta.
    expect(css).toMatch(/\.area-mapa:has\(\.folha\) \.avisos-agora \{ display: none; \}/);
  });

  it("a hora é a simulada: o anel da RSU e os troços em falha da semana gravada não passam ao modo, e o mapa não se monta de novo", async () => {
    // Às 20h de 04/11 (a hora inicial), a RSU0030 está em falha de rede na semana gravada, com o anel, e 2 troços em falha.
    const emFalha = { ...simulado, rsus: [{ ...simulado.rsus[0], ultimo_dado_min: 130, falha: true }] };
    falsificarApi({
      "/agora/disponivel": ok({ disponivel: true, fonte: "simulador", etiqueta: ETIQUETA_SIMULADOR }),
      "/agora/simulador/iniciar": ok(simulado),
      "/agora": ok(simulado),
    });
    render(<App />);
    const mapa = screen.getByTestId("mapa");
    expect(await within(mapa).findByText(RSU)).toHaveAttribute("data-halo", "falha");
    await vi.waitFor(() => expect(mapa.getAttribute("data-trocos")).not.toBe(""));
    await userEvent.click(await screen.findByRole("button", { name: /Simular falha/ }));
    await screen.findByRole("region", { name: "Painel agora" });
    await within(screen.getByRole("region", { name: "Painel agora" })).findByText(ETIQUETA_SIMULADOR);
    // Abrir o modo não volta a montar o mapa (o MapLibre, os modelos 3D e a medição dos fps): é o mesmo elemento.
    const noModo = screen.getByTestId("mapa");
    expect(noModo).toBe(mapa);
    expect(within(noModo).getByText(RSU)).toHaveAttribute("data-halo", ""); // sem comunicação: sem o anel
    expect(within(noModo).getByText(RSU)).toHaveAttribute("data-tipo", "rsu");
    expect(noModo).toHaveAttribute("data-trocos", "");
    // Quando o silêncio simulado cumpre a falha (2 h), a RSU passa a vermelho, com o anel.
    falsificarApi({ "/agora/disponivel": ok({ disponivel: true }), "/agora/simulador/iniciar": ok(emFalha), "/agora": ok(emFalha) });
    await userEvent.click(screen.getByRole("button", { name: "Fechar o painel agora" }));
    await userEvent.click(screen.getByRole("button", { name: /Simular falha/ }));
    await vi.waitFor(() => expect(within(screen.getByTestId("mapa")).getByText(RSU)).toHaveAttribute("data-tipo", "rsu-falha"));
    expect(within(screen.getByTestId("mapa")).getByText(RSU)).toHaveAttribute("data-halo", "falha");
  });

  it("o relógio só arranca quando o modo abre: o «iniciar» só se pede no clique (ADR-0032)", async () => {
    const pedidos = falsificarApi({
      "/agora/disponivel": ok({ disponivel: true, fonte: "simulador", etiqueta: ETIQUETA_SIMULADOR }),
      "/agora/simulador/iniciar": ok(simulado),
      "/agora": ok(simulado),
    });
    const iniciar = () => pedidos.mock.calls.filter(([url, init]) => String(url).endsWith("/agora/simulador/iniciar") && init?.method === "POST");
    render(<App />);
    const botao = await screen.findByRole("button", { name: /Simular falha/ });
    expect(iniciar()).toHaveLength(0);
    await userEvent.click(botao);
    await screen.findByRole("region", { name: "Painel agora" });
    expect(iniciar()).toHaveLength(1);
  });

  it("mudar de separador fecha o modo: a faixa e os marcadores simulados não passam ao ② (ADR-0032)", async () => {
    falsificarApi({
      "/agora/disponivel": ok({ disponivel: true, fonte: "simulador", etiqueta: ETIQUETA_SIMULADOR }),
      "/agora/simulador/iniciar": ok(simulado),
      "/agora": ok(simulado),
    });
    render(<App />);
    await userEvent.click(await screen.findByRole("button", { name: /Simular falha/ }));
    await screen.findByRole("region", { name: "Painel agora" });
    await userEvent.click(screen.getByRole("tab", { name: /completar/i }));
    expect(screen.queryByRole("region", { name: "Painel agora" })).toBeNull();
    expect(screen.getByRole("slider", { name: /hora/i })).toBeInTheDocument(); // volta a hora da semana gravada
    expect(within(screen.getByTestId("mapa")).queryAllByText(/SmartCrosswalk/).map((li) => li.getAttribute("data-tipo"))).not.toContain("atencao");
    // De volta ao ①, o modo continua fechado.
    await userEvent.click(screen.getByRole("tab", { name: /vigiar/i }));
    expect(screen.queryByRole("region", { name: "Painel agora" })).toBeNull();
  });
});
