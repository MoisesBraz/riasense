/**
 * O modo «Ao vivo» (ADR-0049). Os retratos são sintéticos, com a forma da resposta de `GET /ao-vivo` (ids, posições e
 * deteções inventados): nenhum dado real do socket do Living Lab entra no git.
 */
import { act, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { App } from "../App";
import { ETIQUETA_AO_VIVO, type DetecaoAoVivo, type EstacaoAoVivo, type RetratoAoVivo, type SensorAoVivo } from "../api/aoVivo";
import { NOTA_ESPERADO, PopupSensorAoVivo, RESSALVA_RADAR } from "./PainelAoVivo";
import { SENSORES } from "../test/dados";
import type { PropsMapa } from "../componentes/mapa/Mapa";
import { camadasDoSeparador } from "../componentes/Camadas";
import {
  marcadoresAoVivo,
  etiquetaSemanaGravada,
  horaDaSemanaGravada,
  marcadoresPassadeirasAoVivo,
  pessoasAoVivo,
  semModeloAoVivo,
  pontosAoVivo,
  posicoesAoVivo,
  resumoAoVivo,
  rotulosAoVivo,
  ultimoDado,
  veiculosAoVivo,
} from "../dominio/aoVivo";
import { falsificarApi } from "../test/apiFalsa";

// O mapa falso mostra o que recebe: os marcadores, os pontos (no fim do movimento) e se há modelos 3D.
vi.mock("../componentes/mapa/Mapa", () => ({
  Mapa: (p: PropsMapa) => (
    <div
      data-testid="mapa"
      data-marcadores={p.marcadores.map((m) => m.id).join(",")}
      data-pontos={p.carros ? p.carros(1e9).length : -1}
      data-peoes={p.carros ? p.carros(1e9).filter((c) => c.peao).length : -1}
      data-modelos={p.modelos ? "sim" : "nao"}
      data-trocos={(p.trocosEmFalha ?? []).length}
      data-enquadrar-sitios={JSON.stringify(p.enquadrarSitios ?? null)}
      data-rotulos={(p.rotulos ?? []).map((r) => r.texto).join("|")}
      data-calor={JSON.stringify(
        p.calor
          ? {
              peoes: p.calor.peoes?.features.map((f) => [f.properties.id.slice(-4), Number(f.properties.intensidade.toFixed(3))]) ?? null,
              veiculos: p.calor.veiculos?.features.length ?? null,
            }
          : null,
      )}
    >
      {/* Um botão por marcador, para clicar como no mapa; e o pop-up preso ao marcador, se houver. */}
      {p.marcadores.map((m) => (
        <button key={m.id} type="button" data-marcador={m.id} aria-label={`marcador ${m.id}`} onClick={() => p.onSelecionar(m.id)} />
      ))}
      {p.conteudoPopup}
    </div>
  ),
}));

afterEach(() => vi.unstubAllGlobals());

// ── Retratos inventados ──
const ESTACOES: EstacaoAoVivo[] = [
  { id: "e1", lat: 40.64, lon: -8.65, ativa: true, detecoes: 2, ultimo_dado: 1_000_000_001_000, veiculos: 1, peoes: 1 },
  { id: "e2", lat: 40.63, lon: -8.64, ativa: false, detecoes: 0, ultimo_dado: null, veiculos: 0, peoes: 0 },
  { id: "e3", lat: 40.62, lon: -8.63, ativa: true, detecoes: 0, ultimo_dado: null, veiculos: 0, peoes: 0 },
];
const det = (id: string, classe: string, lon: number, lat: number, velocidade: number | null, direcao: number | null = 90): DetecaoAoVivo => ({
  id,
  estacao: "e1",
  lat,
  lon,
  classe,
  sensor: "monovideo",
  velocidade,
  direcao,
});
const DETECOES = [det("e1:1", "passengerCar", -8.65, 40.64, 10), det("e1:2", "pedestrian", -8.651, 40.641, 1.2, 180)];
const U = "urn:ngsi-ld:";
const SENSORES_VIVOS: SensorAoVivo[] = [
  { id: `${U}SmartCrosswalk:0019`, tipo: "passadeira", n: 15, minutos: 15, por_hora: 60, esperado_1h: 40, esperado_3h: 55,
    risco: { valor: 0.72, exposicao_pct: 0.9, comportamento_pct: 0.54, semaforo: false } },
  { id: `${U}SmartCrosswalk:0020`, tipo: "passadeira", n: 2, minutos: 0.5, por_hora: null, esperado_1h: 12, esperado_3h: null, risco: null },
  { id: `${U}RoadSegment:11165`, tipo: "segmento", n: 75, minutos: 15, por_hora: 300, esperado_1h: 280, esperado_3h: 250,
    velocidade_kmh: 62.4, acima: true, limite_kmh: 50, radar: true },
];
const RESPOSTA = {
  estado: "ligado", etiqueta: ETIQUETA_AO_VIVO, recebido: 1_000_000_003_000, intervalo_s: 0.05, estacoes: ESTACOES, detecoes: DETECOES,
  sensores: SENSORES_VIVOS,
};
const retrato = (detecoes: DetecaoAoVivo[], chegada = 0): RetratoAoVivo => ({
  estacoes: ESTACOES,
  detecoes,
  recebido: 1_000_000_003_000,
  chegada,
  intervalo_ms: 1000,
});

const ok = (corpo: unknown) => ({ corpo });
const ROTAS_LIGADO = {
  "/ao-vivo/disponivel": ok({ disponivel: true, estado: "com rede", intervalo_s: 0.05, etiqueta: ETIQUETA_AO_VIVO }),
  "/ao-vivo/ligar": ok({ estado: "a ligar", intervalo_s: 0.05 }),
  "/ao-vivo": ok(RESPOSTA),
  "/ao-vivo/desligar": ok({ estado: "desligado" }),
};

async function abrirJanelaDoIndicador() {
  await userEvent.click(await screen.findByRole("button", { name: "Offline" }));
  return screen.getByRole("dialog", { name: "Dados locais" });
}

async function entrarAoVivo(rotas: Parameters<typeof falsificarApi>[0] = ROTAS_LIGADO) {
  const fetchFalso = falsificarApi(rotas);
  const vista = render(<App />);
  const janela = await abrirJanelaDoIndicador();
  await userEvent.click(await within(janela).findByRole("button", { name: "Ver ao vivo (Living Lab)" }));
  await screen.findByText("2 de 3 estações ativas");
  return { fetchFalso, ...vista };
}
const pedidos = (f: ReturnType<typeof falsificarApi>, caminho: string, metodo = "GET") =>
  f.mock.calls.filter(([url, init]) => new URL(String(url)).pathname === caminho && (init?.method ?? "GET") === metodo).length;

describe("o botão na janela do indicador (ADR-0049, ponto 3)", () => {
  it("o botão aparece logo, desligado enquanto se vê se há rede; nada liga antes do clique", async () => {
    let responder: (r: Response) => void = () => {};
    const f = falsificarApi(ROTAS_LIGADO);
    const original = f.getMockImplementation()!;
    f.mockImplementation((pedido, init) =>
      new URL(String(pedido)).pathname === "/ao-vivo/disponivel" ? new Promise<Response>((r) => (responder = r)) : original(pedido, init),
    );
    render(<App />);
    const janela = await abrirJanelaDoIndicador();
    expect(within(janela).getByRole("button", { name: "Ver ao vivo (Living Lab)" })).toBeDisabled();
    expect(within(janela).getByText("A ver se há rede…")).toBeInTheDocument();
    await act(async () => responder(new Response(JSON.stringify({ disponivel: true, estado: "com rede", intervalo_s: 1 }))));
    expect(within(janela).getByRole("button", { name: "Ver ao vivo (Living Lab)" })).toBeEnabled();
    expect(pedidos(f, "/ao-vivo/ligar", "POST")).toBe(0);
    expect(pedidos(f, "/ao-vivo")).toBe(0);
  });

  it("com ao_vivo.ativo: false (só em caso de avaria; a API responde 503), o botão esconde-se", async () => {
    falsificarApi({ "/ao-vivo/disponivel": { status: 503, corpo: { estado: "desligado", motivo: "ao_vivo.ativo: false" } } });
    render(<App />);
    const janela = await abrirJanelaDoIndicador();
    await waitFor(() => expect(within(janela).getByText(/Dados recolhidos de fontes abertas/)).toBeInTheDocument());
    await act(() => new Promise((r) => setTimeout(r, 20)));
    expect(within(janela).queryByRole("button", { name: /Ver ao vivo/ })).toBeNull();
  });

  it("sem rede, o botão fica desligado e diz porquê; nada liga", async () => {
    const f = falsificarApi({ "/ao-vivo/disponivel": ok({ disponivel: false, estado: "sem rede", intervalo_s: 1 }) });
    render(<App />);
    const janela = await abrirJanelaDoIndicador();
    expect(await within(janela).findByRole("button", { name: "Ver ao vivo (Living Lab)" })).toBeDisabled();
    expect(within(janela).getByText(/Sem rede: o «Ao vivo» precisa da Internet/)).toBeInTheDocument();
    expect(pedidos(f, "/ao-vivo/ligar", "POST")).toBe(0);
  });
});

describe("no modo «Ao vivo» (ADR-0049, pontos 3 a 6)", () => {
  it("liga, diz «Ao vivo» com o ponto azul, a etiqueta à vista e «N de M estações ativas»; as camadas da semana saem", async () => {
    const { fetchFalso, container } = await entrarAoVivo();
    expect(pedidos(fetchFalso, "/ao-vivo/ligar", "POST")).toBe(1);
    const indicador = screen.getByRole("button", { name: "Ao vivo" });
    expect(indicador).toHaveClass("estado-dados--ao-vivo");
    expect(screen.getByRole("note", { name: "" }).textContent).toBe(ETIQUETA_AO_VIVO);
    const janela = screen.getByRole("region", { name: "Ao vivo" });
    expect(janela).toHaveTextContent("1 peões e 1 veículos detetados agora");
    // As camadas da semana gravada saem: a barra da hora, os chips, o botão das camadas, os troços em falha.
    expect(container.querySelector(".barra-hora")).toBeNull();
    expect(screen.queryByRole("group", { name: "Resumo das falhas inesperadas" })).toBeNull();
    // As Camadas ficam, só com as que se calculam com as deteções de agora (ADR-0055, ponto 3).
    expect(screen.getByRole("button", { name: /Camadas/ })).toBeInTheDocument();
    const mapa = screen.getByTestId("mapa");
    expect(mapa.dataset.marcadores).toBe(`ao-vivo:e1,ao-vivo:e2,ao-vivo:e3,${U}SmartCrosswalk:0019,${U}SmartCrosswalk:0020`) // as estações e as passadeiras ao vivo (ADR-0055);
    expect(mapa.dataset.pontos).toBe("2");
    expect(mapa.dataset.peoes).toBe("1");
    expect(mapa.dataset.modelos).toBe("sim");
    expect(mapa.dataset.trocos).toBe("0");
  });

  it("o último dado de cada estação: «há 2 s», «sem deteções agora», «inativa»", async () => {
    await entrarAoVivo();
    await userEvent.click(screen.getByText("Último dado de cada estação"));
    const linhas = within(screen.getByRole("region", { name: "Ao vivo" })).getAllByRole("listitem").map((li) => li.textContent);
    expect(linhas).toEqual(["e1há 2 s", "e2inativa", "e3sem deteções agora"]);
  });

  it("a legenda é só a do «Ao vivo»", async () => {
    await entrarAoVivo();
    await userEvent.click(screen.getByRole("button", { name: /Legenda/ }));
    for (const item of ["Estação ativa", "Estação inativa", "Veículo detetado", "Veículo parado", "Peão detetado"]) expect(screen.getByText(item)).toBeInTheDocument();
    expect(screen.queryByText("Falha de rede")).toBeNull();
    expect(screen.queryByText("Dia ou noite")).toBeNull();
  });

  it("«Voltar aos dados da semana» desliga e volta à hora onde se estava", async () => {
    const f = falsificarApi(ROTAS_LIGADO);
    const { container } = render(<App />);
    const cursor = () => (container.querySelector(".barra-hora input[type=range]") as HTMLInputElement).value;
    await screen.findByRole("button", { name: "Offline" });
    const hora = cursor();
    await userEvent.click(screen.getByRole("button", { name: "Offline" }));
    await userEvent.click(await screen.findByRole("button", { name: "Ver ao vivo (Living Lab)" }));
    await screen.findByText("2 de 3 estações ativas");
    await userEvent.click(screen.getByRole("button", { name: "Voltar aos dados da semana" }));
    expect(pedidos(f, "/ao-vivo/desligar", "POST")).toBe(1);
    expect(cursor()).toBe(hora);
    expect(screen.getByRole("button", { name: "Offline" })).toBeInTheDocument();
    expect(screen.queryByText(ETIQUETA_AO_VIVO)).toBeNull();
  });

  it("se a ligação cair, sai sozinho com «Ligação perdida»", async () => {
    const { container } = await entrarAoVivo();
    falsificarApi({ ...ROTAS_LIGADO, "/ao-vivo": ok({ estado: "ligação perdida", intervalo_s: 0.05 }) });
    expect(await screen.findByRole("alert")).toHaveTextContent("Ligação perdida");
    expect(container.querySelector(".barra-hora")).not.toBeNull();
    expect(screen.queryByRole("region", { name: "Ao vivo" })).toBeNull();
  });

  it("se a API deixar de responder, também sai com «Ligação perdida»", async () => {
    await entrarAoVivo();
    falsificarApi({ ...ROTAS_LIGADO, "/ao-vivo": "sem-ligacao" });
    expect(await screen.findByRole("alert")).toHaveTextContent("Ligação perdida");
  });

  // A tolerância (ADR-0055, ponto 7): as leituras do `/ao-vivo` falham pela ordem dada (true = falha); depois, respondem.
  const falharLeituras = (falhas: boolean[]) => {
    const fila = [...falhas];
    const f = falsificarApi(ROTAS_LIGADO);
    const original = f.getMockImplementation()!;
    f.mockImplementation((pedido, init) =>
      new URL(String(pedido)).pathname === "/ao-vivo" && fila.shift() ? Promise.reject(new TypeError("Failed to fetch")) : original(pedido, init),
    );
    return f;
  };

  it.each([1, 2])("com %i leitura(s) seguida(s) sem resposta, o modo fica, com o último retrato no mapa", async (n) => {
    await entrarAoVivo();
    const f = falharLeituras(Array(n).fill(true));
    await waitFor(() => expect(pedidos(f, "/ao-vivo")).toBeGreaterThanOrEqual(n));
    expect(screen.getByTestId("mapa").dataset.pontos).toBe("2"); // enquanto falha, o mapa não se esvazia
    await waitFor(() => expect(pedidos(f, "/ao-vivo")).toBeGreaterThan(n + 1)); // e depois volta a ler
    expect(screen.getByRole("region", { name: "Ao vivo" })).toBeInTheDocument();
    expect(screen.queryByRole("alert")).toBeNull();
  });

  it("uma leitura boa põe a contagem a 0: 2 falhas, 1 boa e mais 2 falhas não saem", async () => {
    await entrarAoVivo();
    const f = falharLeituras([true, true, false, true, true]);
    await waitFor(() => expect(pedidos(f, "/ao-vivo")).toBeGreaterThan(6));
    expect(screen.getByRole("region", { name: "Ao vivo" })).toBeInTheDocument();
    expect(screen.queryByRole("alert")).toBeNull();
  });

  it("com 3 leituras seguidas sem resposta, sai com «Ligação perdida»", async () => {
    await entrarAoVivo();
    const f = falharLeituras([true, true, true]);
    expect(await screen.findByRole("alert")).toHaveTextContent("Ligação perdida");
    expect(screen.queryByRole("region", { name: "Ao vivo" })).toBeNull();
    expect(pedidos(f, "/ao-vivo")).toBe(3);
  });

  it("mudar para a ② não sai do modo: a ② mostra a semana gravada, com a etiqueta; ao voltar ao ①, o mapa volta ao ao vivo (ADR-0055)", async () => {
    await entrarAoVivo();
    await userEvent.click(screen.getByRole("tab", { name: /Completar/ }));
    expect(screen.getByRole("region", { name: "Ao vivo" })).toBeInTheDocument(); // a janela do modo continua (e o «Voltar»)
    expect(screen.getByRole("button", { name: "Ao vivo" })).toBeInTheDocument();
    expect(screen.getByText(/^semana gravada · (dom|seg|ter|qua|qui|sex|sáb) \d\d\/11 às \d\dh$/)).toBeInTheDocument();
    expect(screen.getByTestId("mapa").dataset.marcadores).not.toContain("ao-vivo:"); // o mapa é o da semana gravada
    await userEvent.click(screen.getByRole("tab", { name: /Vigiar/ }));
    await waitFor(() => expect(screen.getByTestId("mapa").dataset.marcadores).toContain("ao-vivo:e1"));
    expect(screen.queryByText(/^semana gravada ·/)).toBeNull();
  });

  it("a hora da semana gravada é a do mesmo dia da semana e hora de agora, em Lisboa; sem ela, a mais próxima desse dia", () => {
    const horas = [Date.UTC(2026, 10, 3, 15), Date.UTC(2026, 10, 3, 16), Date.UTC(2026, 10, 5, 22), Date.UTC(2026, 10, 5, 23), Date.UTC(2026, 10, 10, 9)];
    // Quinta, 19/11 às 23h40 de Lisboa (UTC em novembro) → quinta, 05/11 às 23h.
    expect(horaDaSemanaGravada(new Date(Date.UTC(2026, 10, 19, 23, 40)), horas)).toBe(Date.UTC(2026, 10, 5, 23));
    // Terça às 12h: a semana não tem essa hora; fica a mais próxima de terça (10/11 às 9h ou 03/11 às 15h: as 9h estão a 3 h, as 15h a 3 h).
    expect([Date.UTC(2026, 10, 10, 9), Date.UTC(2026, 10, 3, 15)]).toContain(horaDaSemanaGravada(new Date(Date.UTC(2026, 10, 17, 12)), horas));
    expect(etiquetaSemanaGravada(Date.UTC(2026, 10, 5, 23))).toBe("semana gravada · qui 05/11 às 23h");
  });
});

describe("os pontos que andam (ADR-0049, ponto 4)", () => {
  const antes = retrato([det("a", "passengerCar", -8.65, 40.64, 10), det("b", "pedestrian", -8.66, 40.65, 1)]);
  const depois = retrato([det("a", "passengerCar", -8.64, 40.64, 10), det("c", "bus", -8.6, 40.6, 0)], 1000);

  it("andam do retrato anterior para o novo durante o intervalo; uma deteção nova aparece logo no sítio", () => {
    const meio = posicoesAoVivo(antes, depois, 1500);
    expect(meio.map((p) => p.d.id)).toEqual(["a", "c"]); // a «b» saiu
    expect(meio[0].coord[0]).toBeCloseTo(-8.645);
    expect(meio[1].coord).toEqual([-8.6, 40.6]);
    expect(posicoesAoVivo(antes, depois, 5000)[0].coord[0]).toBeCloseTo(-8.64);
    expect(posicoesAoVivo(antes, depois, 0)[0].coord[0]).toBeCloseTo(-8.65);
  });

  it("com prefers-reduced-motion (parado), saltam logo para a posição nova", () => {
    expect(posicoesAoVivo(antes, depois, 1000, true)[0].coord[0]).toBeCloseTo(-8.64);
  });

  it("os peões noutra cor e sem número; os veículos com km/h; os modelos 3D de tipo, e os outros só como ponto", () => {
    const pos = posicoesAoVivo(
      null,
      retrato([
        det("1", "passengerCar", 0, 0, 10),
        det("2", "pedestrian", 0, 0, 1.5),
        det("3", "motorcycle", 0, 0, 0.1),
        det("4", "lightTruck", 0, 0, 5),
        det("5", "bus", 0, 0, 7),
        det("6", "moliceiro", 0, 0, 2),
        det("7", "cyclist", 0, 0, 4),
      ]),
      0,
    );
    const pontos = pontosAoVivo(pos);
    expect(pontos.map((p) => p.kmh)).toEqual([36, null, null, 18, 25, 7, 14]);
    expect(pontos.filter((p) => p.peao)).toHaveLength(1);
    expect(veiculosAoVivo(pos).map((v) => v.categoria)).toEqual(["B", "A", "C", "D", "A"]);
    expect(veiculosAoVivo(pos).map((v) => v.kmh)).toEqual([36, null, 18, 25, 14]); // parado: sem número, também em 3D
    expect(pessoasAoVivo(pos)).toHaveLength(1);
  });

  it("as estações com o ícone da RSU; o nome só ao passar o rato; o resumo e o último dado", () => {
    const m = marcadoresAoVivo(ESTACOES);
    expect(m.map((x) => [x.tipo, x.especie, x.nomeAPedido, x.rotulo])).toEqual([
      ["ativo", "rsu", true, "e1"],
      ["neutro", "rsu", true, "e2 · inativa"],
      ["ativo", "rsu", true, "e3"],
    ]);
    expect(resumoAoVivo(retrato(DETECOES))).toEqual({ ativas: 2, total: 3, peoes: 1, veiculos: 1 });
    expect(ultimoDado(ESTACOES[0], 1_000_000_121_000)).toBe("há 2 min");
  });
});

describe("o «Ao vivo» arrumado (ADR-0055, ponto 1)", () => {
  it("ao entrar, o mapa enquadra as estações ativas uma vez (e não a zona da demo); ao sair, volta à zona", async () => {
    const rotas = { ...ROTAS_LIGADO, "/ao-vivo": ok(RESPOSTA) };
    await entrarAoVivo(rotas);
    const mapa = screen.getByTestId("mapa");
    // As ativas são a e1 (-8,65; 40,64) e a e3 (-8,63; 40,62); a e2, inativa, fica de fora.
    const caixa = [[-8.65, 40.62], [-8.63, 40.64]];
    await waitFor(() => expect(JSON.parse(mapa.dataset.enquadrarSitios ?? "null")).toEqual(caixa));
    // A e3 deixa de comunicar e a e2 acorda: o mapa não se volta a enquadrar (quem aproximou não é puxado para trás).
    const outras = ESTACOES.map((e) => (e.id === "e3" ? { ...e, ativa: false } : e.id === "e2" ? { ...e, ativa: true } : e));
    rotas["/ao-vivo"] = ok({ ...RESPOSTA, estacoes: outras });
    await screen.findByText("2 de 3 estações ativas");
    await waitFor(() => expect(screen.getByRole("button", { name: "marcador ao-vivo:e2" })).toBeInTheDocument());
    await new Promise((r) => setTimeout(r, 150)); // algumas leituras depois
    expect(JSON.parse(screen.getByTestId("mapa").dataset.enquadrarSitios ?? "null")).toEqual(caixa);
    await userEvent.click(screen.getByRole("button", { name: "Voltar aos dados da semana" }));
    await waitFor(() => expect(JSON.parse(screen.getByTestId("mapa").dataset.enquadrarSitios ?? "")).toBeNull());
  });

  it("os marcadores ficam só com o ícone; os números de uma estação aparecem no pop-up, ao clicar nela", async () => {
    await entrarAoVivo();
    expect(screen.queryByText(/veículos? e/)).toBeNull(); // nada de números ao abrir
    await userEvent.click(screen.getByRole("button", { name: "marcador ao-vivo:e1" }));
    const popup = await screen.findByRole("dialog", { name: "Estação e1 do Living Lab, ao vivo" });
    expect(popup).toHaveTextContent("1 veículo e 1 peão detetados agora");
    expect(popup).toHaveTextContent("ao vivo · não validado");
    expect(popup).toHaveTextContent(/Último dado: há \d+ s/);
    await userEvent.click(within(popup).getByRole("button", { name: "Fechar o pop-up" }));
    expect(screen.queryByRole("dialog", { name: /Estação e1/ })).toBeNull();
    await userEvent.click(screen.getByRole("button", { name: "marcador ao-vivo:e2" }));
    expect(await screen.findByRole("dialog", { name: /Estação e2/ })).toHaveTextContent("Inativa: não envia deteções agora.");
  });

  it("os parados ficam discretos e sem número de velocidade; todos os pontos levam «vivo» (só se veem a partir do zoom 16)", () => {
    const parado = { ...det("1", "passengerCar", 0, 0, 0.1, 75), parado: true };
    const lento = det("2", "passengerCar", 0, 0, 0.5, 75); // lento, mas ainda não «parado»: leva o número (2 km/h)
    const peao = det("3", "pedestrian", 0, 0, 1.2);
    const pontos = pontosAoVivo(posicoesAoVivo(null, retrato([parado, lento, peao]), 0));
    expect(pontos.map((p) => [p.kmh, p.parado ?? false, p.peao ?? false, p.vivo])).toEqual([
      [null, true, false, true],
      [2, false, false, true],
      [null, false, true, true],
    ]);
    // O parado mantém o rumo que a API lhe deu (o último a andar, ou o da rua), também no modelo 3D.
    expect(veiculosAoVivo(posicoesAoVivo(null, retrato([parado]), 0))[0]).toMatchObject({ rumo: 75, kmh: null });
  });

  it("a trotinete (lightVruVehicle) usa o modelo da bicicleta; o moliceiro fica só como ponto", () => {
    const pos = posicoesAoVivo(null, retrato([det("1", "lightVruVehicle", 0, 0, 3), det("2", "moliceiro", 0, 0, 2)]), 0);
    expect(veiculosAoVivo(pos).map((v) => v.categoria)).toEqual(["A"]);
    expect(pontosAoVivo(pos)).toHaveLength(2);
  });

  it("os números das estações vão para o mapa (que só os desenha a partir do zoom 17): só as ativas com alguma deteção", async () => {
    await entrarAoVivo();
    await waitFor(() => expect(screen.getByTestId("mapa").dataset.rotulos).toBe("1 veículo · 1 peão"));
    const r = rotulosAoVivo([{ ...ESTACOES[0], veiculos: 12, peoes: 3 }, ESTACOES[1], { ...ESTACOES[2], veiculos: 0, peoes: 0 }]);
    expect(r).toEqual([{ lon: -8.65, lat: 40.64, texto: "12 veículos · 3 peões" }]);
  });

  it("o marcador da estação aberta fica selecionado, e nenhum leva texto além do nome (que só aparece ao passar o rato)", () => {
    const m = marcadoresAoVivo([{ ...ESTACOES[0], veiculos: 12, peoes: 3 }, ESTACOES[2]], "ao-vivo:e1");
    expect(m.map((x) => [x.selecionado, x.rotulo, x.nomeAPedido])).toEqual([
      [true, "e1", true],
      [false, "e3", true],
    ]);
  });
});

describe("o «Ao vivo» ligado aos sensores do dataset (ADR-0055, pontos 2, 5 e 6)", () => {
  it("as passadeiras aparecem com o degrau do risco potencial ao vivo (quando a janela já tem número)", () => {
    const m = marcadoresPassadeirasAoVivo(SENSORES_VIVOS, SENSORES, `${U}SmartCrosswalk:0019`);
    expect(m.map((x) => [x.id.slice(-4), x.especie, x.risco?.nivel ?? null, x.selecionado])).toEqual([
      ["0019", "passadeira", 4, true],
      ["0020", "passadeira", null, false],
    ]);
  });

  it("o pop-up de uma passadeira diz o agora por hora, o esperado pelo perfil da semana e o risco ao vivo, com as ressalvas", async () => {
    await entrarAoVivo();
    await userEvent.click(await screen.findByRole("button", { name: `marcador ${U}SmartCrosswalk:0019` }));
    const popup = await screen.findByRole("dialog", { name: "SC0019, ao vivo" });
    expect(popup).toHaveTextContent("Agora: 60 travessias por hora (últimos 15 min)");
    expect(popup).toHaveTextContent("contagem ao vivo aproximada");
    expect(popup).toHaveTextContent("Esperado daqui a 1 h: 40; daqui a 3 h: 55 travessias por hora");
    expect(popup).toHaveTextContent(NOTA_ESPERADO);
    expect(popup).toHaveTextContent("Risco potencial ao vivo: 4 de 5");
    expect(popup).toHaveTextContent("ao vivo · não validado · não mede acidentes · o comportamento é o da semana gravada");
    expect(popup).toHaveTextContent(RESSALVA_RADAR);
    await userEvent.click(within(popup).getByRole("button", { name: "Fechar o pop-up" }));
    await userEvent.click(screen.getByRole("button", { name: `marcador ${U}SmartCrosswalk:0020` }));
    const outra = await screen.findByRole("dialog", { name: "SC0020, ao vivo" });
    expect(outra).toHaveTextContent("A contar: 2 travessias em 0,5 min (o número por hora aparece aos 2 min)");
    expect(outra).not.toHaveTextContent("Risco potencial ao vivo");
  });

  it("o pop-up de um segmento diz o agora por hora (aproximado), a velocidade de agora e o esperado pela semana (ADR-0055)", () => {
    render(<PopupSensorAoVivo id={`${U}RoadSegment:11165`} sensor={SENSORES_VIVOS[2]} onFechar={() => {}} />);
    const popup = screen.getByRole("dialog", { name: /11165, ao vivo/ });
    expect(popup).toHaveTextContent("Agora: 300 veículos por hora (últimos 15 min)");
    expect(popup).toHaveTextContent("contagem ao vivo aproximada");
    expect(popup).toHaveTextContent("Velocidade mediana agora: 62 km/h (limite 50) · acima do limite");
    expect(popup).toHaveTextContent("Esperado daqui a 1 h: 280; daqui a 3 h: 250 veículos por hora");
    expect(popup).toHaveTextContent(NOTA_ESPERADO);
    expect(popup).toHaveTextContent(RESSALVA_RADAR);
    expect(popup).not.toHaveTextContent("Risco");
  });

  it("a ressalva do radar só aparece nos segmentos que o radar mede", () => {
    const camara = { ...SENSORES_VIVOS[2], radar: false };
    render(<PopupSensorAoVivo id={camara.id} sensor={camara} onFechar={() => {}} />);
    expect(screen.getByRole("dialog")).not.toHaveTextContent(RESSALVA_RADAR);
  });

  it("um sensor sem dados ao vivo di-lo; o anel vem do segmento (a mediana de agora), e o moliceiro fica como ponto no 3D", () => {
    render(<PopupSensorAoVivo id={`${U}SmartCrosswalk:0013`} sensor={null} onFechar={() => {}} />);
    expect(screen.getByRole("dialog")).toHaveTextContent("Sem dados ao vivo deste sensor.");
    const acima = { ...det("1", "passengerCar", 0, 0, 20), acima: true };
    const barco = det("2", "moliceiro", 0, 0, 2);
    const pos = posicoesAoVivo(null, retrato([acima, barco]), 0);
    expect(pontosAoVivo(pos).map((p) => p.acima)).toEqual([true, false]);
    expect(veiculosAoVivo(pos)[0].acima).toBe(true);
    expect(semModeloAoVivo(pos)).toEqual([expect.objectContaining({ semModelo: true, vivo: true })]);
  });

  it("sem dados não é zero: um sensor que nenhuma fonte viva vê diz «Sem dados ao vivo», sem degrau (ADR-0007)", () => {
    const calado = { ...SENSORES_VIVOS[0], coberto: false, por_hora: null };
    render(<PopupSensorAoVivo id={calado.id} sensor={calado} onFechar={() => {}} />);
    const popup = screen.getByRole("dialog");
    expect(popup).toHaveTextContent("Sem dados ao vivo deste sensor.");
    expect(popup).not.toHaveTextContent("Agora");
    expect(popup).not.toHaveTextContent("Risco");
    const m = marcadoresPassadeirasAoVivo([calado], SENSORES);
    expect(m.map((x) => [x.especie, x.risco ?? null])).toEqual([["passadeira", null]]);
  });

  it("o «a contar» diz a janela mínima do config", () => {
    const curto = { ...SENSORES_VIVOS[1], minima_min: 3 };
    render(<PopupSensorAoVivo id={curto.id} sensor={curto} onFechar={() => {}} />);
    expect(screen.getByRole("dialog")).toHaveTextContent("(o número por hora aparece aos 3 min)");
  });

  it("o calor ao vivo: as Camadas de agora, o «por hora» na escala da semana, o «Trânsito» com o calor, e ao sair a semana", async () => {
    const maximos = { passadeiras: { maximo: 240 }, zonas: { maximo: 100 }, segmentos: { maximo: 600 } };
    await entrarAoVivo({ ...ROTAS_LIGADO, "/mapa/calor/maximos": ok(maximos) });
    await userEvent.click(screen.getByRole("button", { name: /Camadas/ }));
    expect(screen.getAllByRole("switch").map((b) => [b.textContent, b.getAttribute("aria-checked")])).toEqual([
      ["Trânsito", "true"],
      ["Calor · peões", "false"],
      ["Calor · veículos", "false"],
    ]);
    const mapa = screen.getByTestId("mapa");
    expect(JSON.parse(mapa.dataset.calor ?? "")).toBeNull();
    await userEvent.click(screen.getByRole("switch", { name: "Calor · peões" }));
    // Só a SC0019 tem «por hora» (60/h): a SC0020 ainda está a contar. A intensidade é a da semana: √(60/240).
    await waitFor(() => expect(JSON.parse(mapa.dataset.calor ?? "null")).toEqual({ peoes: [["0019", 0.5]], veiculos: null }));
    // As duas camadas de calor continuam exclusivas; o «Trânsito» fica com qualquer uma.
    await userEvent.click(screen.getByRole("switch", { name: "Calor · veículos" }));
    expect(screen.getByRole("switch", { name: "Calor · peões" })).toHaveAttribute("aria-checked", "false");
    expect(screen.getByRole("switch", { name: "Trânsito" })).toHaveAttribute("aria-checked", "true");
    await userEvent.click(screen.getByRole("switch", { name: "Calor · peões" }));
    await userEvent.click(screen.getByRole("button", { name: "Legenda" }));
    expect(document.querySelector(".legenda")).toHaveTextContent("Calor · peões");
    expect(document.querySelector(".legenda")).toHaveTextContent("contagem ao vivo aproximada");
    // Sem o «Trânsito», saem os veículos ao vivo e ficam os peões; o calor fica.
    await userEvent.click(screen.getByRole("switch", { name: "Trânsito" }));
    expect([mapa.dataset.pontos, mapa.dataset.peoes]).toEqual(["1", "1"]);
    expect(JSON.parse(mapa.dataset.calor ?? "null").peoes).toEqual([["0019", 0.5]]);
    // Ao sair, o calor volta a ser o da semana gravada (o da hora escolhida, e não o de agora).
    await userEvent.click(screen.getByRole("button", { name: "Voltar aos dados da semana" }));
    await waitFor(() => expect(screen.getByTestId("mapa").dataset.marcadores).not.toContain("ao-vivo:"));
    expect(JSON.parse(screen.getByTestId("mapa").dataset.calor ?? "null")?.peoes ?? []).not.toEqual([["0019", 0.5]]);
  });

  it("as Camadas ao vivo: o «Trânsito» e os 2 de calor; no mapa de risco do ④, só o «Trânsito»", () => {
    expect(camadasDoSeparador("vigiar", "", true)).toEqual(["transito", "calorPeoes", "calorVeiculos"]);
    expect(camadasDoSeparador("proteger", "risco", true)).toEqual(["transito"]);
  });

  it("a etiqueta do modo diz que as camadas ao vivo usam os dados de agora e a ② e a ③ a semana gravada", () => {
    expect(ETIQUETA_AO_VIVO).toBe(
      "Ao vivo · dados públicos do Aveiro Living Lab (IT), não validados. As camadas ao vivo usam os dados de agora; ② e ③ usam a semana gravada",
    );
  });
});

describe("o CSS do «Ao vivo»", () => {
  const { readFileSync } = (globalThis as unknown as { process: { getBuiltinModule: (nome: string) => { readFileSync: (f: string, c: string) => string } } }).process.getBuiltinModule("node:fs");
  const css = readFileSync("src/styles/app.css", "utf8").replace(/\s+/g, " ");

  it("o ponto azul pulsa, e para com prefers-reduced-motion", () => {
    // O do indicador e o da etiqueta (no telemóvel, o indicador do cabeçalho não está à vista).
    expect(css).toMatch(/\.estado-dados--ao-vivo \.estado-dados__ponto, \.etiqueta-ao-vivo__ponto \{ animation: pulso-ao-vivo/);
    expect(css).toMatch(
      /@media \(prefers-reduced-motion: reduce\) \{ \.estado-dados--ao-vivo \.estado-dados__ponto, \.etiqueta-ao-vivo__ponto \{ animation: none; \} \}/,
    );
  });

  it("no telemóvel, a etiqueta continua à vista (o chip do mapa sai) e a janela fica fixa em baixo", () => {
    expect(css).toMatch(/@media \(max-width: 759px\) \{ \.chip-mapa\.etiqueta-ao-vivo \{ display: flex;/);
    expect(css).toMatch(/\.painel-ao-vivo \{ position: fixed; right: 0; bottom: 0; left: 0;/);
  });
});
