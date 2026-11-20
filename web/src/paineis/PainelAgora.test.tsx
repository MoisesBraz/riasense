/** Painel «agora» (ADR-0030, ADR-0032): a etiqueta vem dos dados, «sem comunicação» nunca é «falha» e a demo fica igual sem ele. */
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { App } from "../App";
import { ETIQUETA_SIMULADOR, type EstadoAgora } from "../api/agora";
import { falsificarApi } from "../test/apiFalsa";
import { AvisosAgora, DetalheAgora, ha, PainelAgora } from "./PainelAgora";
import { EstadoDemoProvider } from "../estado/estado";
import { AgoraProvider } from "../estado/agora";

vi.mock("../componentes/mapa/Mapa", () => ({ Mapa: () => <div data-testid="mapa" /> }));

const RSU = "urn:ngsi-ld:RoadSideUnit:0030";
const cw = (n: string, calado: boolean, ultimo: number) => ({
  id: `urn:ngsi-ld:SmartCrosswalk:${n}`, tipo: "passadeira" as const, rsus: [RSU], passadeiras: [n],
  ultimo_dado_min: ultimo, limite_min: 41.4, calado,
});

/** Um estado inventado do simulador, com a RSU0030 sem comunicação há 14 min. */
function estado(fonte = "simulador", calada = true): EstadoAgora {
  return {
    fonte,
    etiqueta: ETIQUETA_SIMULADOR,
    hora_simulada: "20h14",
    velocidade: 60,
    leitura_ms: 60_000,
    prob_max: 1e-6,
    falha: { rsu: RSU, ativa: calada },
    sensores: [
      cw("0019", false, 14), cw("0020", false, 14), cw("0021", false, 14), cw("0022", false, 14),
      { id: "urn:ngsi-ld:RoadSegment:11165", tipo: "segmento", rsus: [RSU], passadeiras: ["0019"], ultimo_dado_min: 14, limite_min: 5.2, calado: true },
    ],
    rsus: [{ id: RSU, passadeiras: ["urn:ngsi-ld:SmartCrosswalk:0019", "urn:ngsi-ld:SmartCrosswalk:0020", "urn:ngsi-ld:SmartCrosswalk:0021", "urn:ngsi-ld:SmartCrosswalk:0022"], ultimo_dado_min: 14, limite_min: 12.6, calado: calada }],
  };
}

const ok = (corpo: unknown) => ({ corpo });
/** A API do painel: abrir chama o «iniciar» (o relógio começa às 19h50), e a barra pergunta à «disponivel».
 */
const comAgora = (e: EstadoAgora) => ({
  "/agora": ok(e),
  "/agora/simulador/iniciar": ok(e),
  "/agora/disponivel": ok({ disponivel: true, fonte: e.fonte, etiqueta: e.etiqueta }),
});

/** O modo «agora» aberto: a faixa e os avisos, dentro dos contextos da demo. */
const abrirAgora = () =>
  render(
    <EstadoDemoProvider>
      <AgoraProvider ativo onFechar={() => {}}>
        <PainelAgora />
        <AvisosAgora />
      </AgoraProvider>
    </EstadoDemoProvider>,
  );

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("painel agora", () => {
  it("mostra a etiqueta da simulação dentro da moldura quando a fonte é o simulador, e só a hora simulada", async () => {
    falsificarApi(comAgora(estado()));
    abrirAgora();
    const moldura = screen.getByRole("region", { name: "Painel agora" });
    expect(await within(moldura).findByText(ETIQUETA_SIMULADOR)).toBeInTheDocument();
    expect(within(moldura).getByText("hora simulada 20h14 · ×60")).toBeInTheDocument();
    expect(moldura.textContent).not.toMatch(/\d{1,2}\/11\/|\d{4}-\d{2}-\d{2}/); // nenhuma data além da etiqueta
  });

  it("sem a fonte «simulador», não há etiqueta", async () => {
    falsificarApi(comAgora(estado("context_broker")));
    abrirAgora();
    expect(await screen.findByText(/hora simulada/)).toBeInTheDocument();
    expect(screen.queryByText(ETIQUETA_SIMULADOR)).not.toBeInTheDocument();
  });

  it("um sensor sem comunicação é um alerta «sem comunicação», nunca uma «falha»", async () => {
    falsificarApi(comAgora(estado()));
    abrirAgora();
    const alerta = await screen.findByRole("alert");
    expect(alerta).toHaveTextContent("Sem comunicação");
    expect(alerta).toHaveTextContent("RSU0030 (SC0019–0022): sem dados há 14 min");
    expect(alerta.textContent).not.toMatch(/falha/i);
  });

  it("o aviso leva o ícone da RSU com o estado: sem comunicação é «atenção» (oco), nunca o símbolo da falha", async () => {
    falsificarApi(comAgora(estado()));
    abrirAgora();
    const alerta = await screen.findByRole("alert");
    expect(within(alerta).getByRole("img", { name: "RSU" })).toBeInTheDocument();
    expect(alerta.querySelector(".distintivo--atencao")).not.toBeNull();
    expect(alerta.querySelector(".distintivo__estado")).toBeNull();
  });

  it("a RSU em falha leva o círculo vermelho do sinal cortado, no aviso", async () => {
    const emFalha = estado();
    emFalha.rsus[0] = { ...emFalha.rsus[0], falha: true };
    falsificarApi(comAgora(emFalha));
    abrirAgora();
    const alerta = await screen.findByRole("alert");
    expect(alerta).toHaveTextContent("Falha de rede"); // o silêncio é da RSU
    expect(alerta.querySelector(".distintivo--rsu-falha .simbolo-estado--falha-rede")).not.toBeNull();
  });

  it("no detalhe, a RSU em falha diz «falha de rede» e o sensor isolado diz só «falha», porque o simulador não distingue o tipo", async () => {
    const emFalha = estado();
    emFalha.rsus[0] = { ...emFalha.rsus[0], falha: true };
    emFalha.sensores[0] = { ...emFalha.sensores[0], calado: true, falha: true };
    falsificarApi(comAgora(emFalha));
    const detalhe = (id: string) =>
      render(
        <EstadoDemoProvider>
          <AgoraProvider ativo onFechar={() => {}}>
            <DetalheAgora id={id} onFechar={() => {}} />
          </AgoraProvider>
        </EstadoDemoProvider>,
      );
    const rsu = detalhe(RSU);
    const daRsu = await screen.findByRole("region", { name: "Agora: RSU0030" });
    expect(within(daRsu).getByText("falha de rede")).toBeInTheDocument();
    rsu.unmount();
    detalhe("urn:ngsi-ld:SmartCrosswalk:0019");
    const doSensor = await screen.findByRole("region", { name: "Agora: SC0019" });
    expect(within(doSensor).getByText("falha")).toBeInTheDocument();
    expect(within(doSensor).queryByText("falha de rede")).toBeNull();
  });

  it("o detalhe de uma RSU ou de uma passadeira leva o ícone do tipo ao lado do nome", async () => {
    falsificarApi(comAgora(estado()));
    render(
      <EstadoDemoProvider>
        <AgoraProvider ativo onFechar={() => {}}>
          <DetalheAgora id={RSU} onFechar={() => {}} />
        </AgoraProvider>
      </EstadoDemoProvider>,
    );
    const detalhe = await screen.findByRole("region", { name: "Agora: RSU0030" });
    expect(within(detalhe).getByRole("img", { name: "RSU" })).toBeInTheDocument();
    expect(detalhe.querySelector(".distintivo--atencao")).not.toBeNull();
  });

  it("os botões chamam o simulador: cortar a RSU e repor", async () => {
    const fetchFalso = falsificarApi({
      "/agora": ok(estado("simulador", false)),
      "/agora/simulador/iniciar": ok(estado("simulador", false)),
      "/agora/simulador/falha": ok(estado()),
      "/agora/simulador/repor": ok(estado("simulador", false)),
    });
    abrirAgora();
    await userEvent.click(await screen.findByRole("button", { name: "Cortar a RSU0030" }));
    await userEvent.click(await screen.findByRole("button", { name: "Repor" }));
    const pedidos = fetchFalso.mock.calls.map(([url, init]) => [new URL(String(url)).pathname, (init as RequestInit)?.method]);
    expect(pedidos[0]).toEqual(["/agora/simulador/iniciar", "POST"]); // abrir o painel começa às 19h50
    expect(pedidos).toContainEqual(["/agora/simulador/falha", "POST"]);
    expect(pedidos).toContainEqual(["/agora/simulador/repor", "POST"]);
    expect(await screen.findByRole("button", { name: "Cortar a RSU0030" })).toBeInTheDocument();
  });

  it("sem resposta da API, diz «sem ligação ao Living Lab»", async () => {
    falsificarApi({ "/agora": "sem-ligacao", "/agora/simulador/iniciar": "sem-ligacao" });
    abrirAgora();
    expect(await screen.findByText(/Sem ligação ao Living Lab/)).toBeInTheDocument();
  });

  it("escreve o tempo desde o último dado em minutos e horas", () => {
    expect(ha(3.7)).toBe("há 3 min");
    expect(ha(65)).toBe("há 1 h 05 min");
  });
});

describe("a demo sem o painel agora", () => {
  it("com o painel desligado na API, a barra não mostra o botão e a demo fica igual", async () => {
    const fetchFalso = falsificarApi({ "/agora/disponivel": { status: 503, corpo: { estado: "desligado", motivo: "agora.ativo: false" } } });
    render(<App />);
    await waitFor(() => expect(fetchFalso.mock.calls.some(([u]) => new URL(String(u)).pathname === "/agora/disponivel")).toBe(true));
    expect(screen.queryByRole("button", { name: /Simular falha/ })).not.toBeInTheDocument();
    expect(screen.getAllByRole("tab")).toHaveLength(4);
  });

  it("com o painel ligado, o botão abre a moldura com a etiqueta", async () => {
    falsificarApi(comAgora(estado()));
    render(<App />);
    await userEvent.click(await screen.findByRole("button", { name: /Simular falha/ }));
    const moldura = await screen.findByRole("region", { name: "Painel agora" });
    expect(await within(moldura).findByText(ETIQUETA_SIMULADOR)).toBeInTheDocument();
  });
});
