/** ① Vigiar, mapa primeiro: sem barra lateral ao abrir; o detalhe abre ao clicar num sensor, na RSU ou num chip. */
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { App } from "../App";
import { LinhaDoTempoRsu } from "../componentes/FitaSensores";
import { MapaDaDemo } from "../componentes/mapa/MapaDaDemo";
import { EstadoDemoProvider } from "../estado/estado";
import { falsificarApi, ok } from "../test/apiFalsa";
import { SENSORES } from "../test/dados";

vi.mock("../componentes/mapa/Mapa", () => ({
  Mapa: (props: { marcadores: { id: string }[]; conteudoPopup: ReactNode; luz?: string; passadeiras?: { chao: { features: unknown[] }; listas: { features: unknown[] } }; pontas?: Record<string, unknown>; onSelecionar: (id: string) => void; onVazio?: () => void }) => (
    <div data-testid="mapa" data-luz={props.luz} data-passadeiras={props.passadeiras ? `${props.passadeiras.chao.features.length}/${props.passadeiras.listas.features.length}` : undefined} data-pontas={props.pontas ? Object.keys(props.pontas).length : undefined}>
      {props.marcadores.map((m) => (
        <button key={m.id} type="button" data-sensor={m.id} onClick={() => props.onSelecionar(m.id)}>
          {m.id}
        </button>
      ))}
      <button type="button" onClick={() => props.onVazio?.()}>
        mapa vazio
      </button>
      <div data-testid="popup-no-mapa">{props.conteudoPopup}</div>
    </div>
  ),
}));

const marcador = async (id: string) => within(screen.getByTestId("mapa")).findByText(`urn:ngsi-ld:${id}`);

describe("① Vigiar: mapa primeiro, detalhe a pedido", () => {
  beforeEach(() => {
    falsificarApi();
  });

  it("ao abrir não há barra lateral, só os 3 chips por cima do mapa (e o «ⓘ» ao lado)", async () => {
    render(<App />);
    const chips = await screen.findByRole("group", { name: "Resumo das falhas inesperadas" });
    expect(within(chips).getAllByRole("button", { pressed: false })).toHaveLength(3);
    expect(within(chips).getAllByRole("button")).toHaveLength(4);
    expect(within(chips).getByRole("button", { name: "Sobre o Vigiar e o mapa" })).toBeInTheDocument();
    expect(screen.queryByRole("tabpanel")).toBeNull();
  });

  it("clicar numa passadeira abre um pop-up no mapa só com ela e a sua linha do tempo; sem barra lateral; o ✕ fecha", async () => {
    render(<App />);
    await userEvent.click(await marcador("SmartCrosswalk:0020"));
    const popup = screen.getByTestId("popup-no-mapa");
    expect(within(popup).getByRole("dialog", { name: "Sensor SC0020" })).toBeInTheDocument();
    expect(within(popup).getByRole("table", { name: /SC0020 ao longo da semana/ })).toBeInTheDocument();
    expect(within(popup).queryByRole("table", { name: /Sensores da RSU/ })).toBeNull(); // só ela, não a RSU toda
    expect(screen.queryByRole("tabpanel")).toBeNull();
    await userEvent.click(within(popup).getByRole("button", { name: "Fechar o pop-up" }));
    expect(screen.getByTestId("popup-no-mapa")).toBeEmptyDOMElement();
  });

  it("clicar na RSU abre o pop-up com os sensores dela, uma linha cada, e a rede por último", async () => {
    render(<App />);
    await userEvent.click(await marcador("RoadSideUnit:0030"));
    const popup = screen.getByTestId("popup-no-mapa");
    expect(within(popup).getByRole("dialog", { name: "Sensor RSU0030" })).toBeInTheDocument();
    const fita = await within(popup).findByRole("table", { name: /Sensores da RSU ao longo da semana/ });
    const linhas = within(fita).getAllByRole("row");
    expect(linhas.slice(0, 4).map((l) => l.textContent?.slice(0, 6))).toEqual(["SC0019", "SC0020", "SC0021", "SC0022"]);
    expect(linhas[linhas.length - 1].textContent).toMatch(/^RedeRSU0030/);
    // A demo abre às 20h de 04/11, quando a RSU0030 deixa de comunicar: a SC0020 já está em falha, e a rede em falha de rede.
    expect(within(linhas[1]).getByText("falha de rede")).toBeInTheDocument();
    expect(within(linhas[linhas.length - 1]).getByText("falha de rede")).toBeInTheDocument();
  });

  it("o chip das falhas de rede lista-as na barra lateral; abrir uma linha mostra o sensor no mapa e a lista fica", async () => {
    render(<App />);
    const chips = await screen.findByRole("group", { name: "Resumo das falhas inesperadas" });
    await userEvent.click(within(chips).getByRole("button", { name: /falhas? de rede/ }));
    const painel = screen.getByRole("tabpanel");
    expect(within(painel).getByRole("heading", { name: "Falhas de rede" })).toBeInTheDocument();
    expect(within(painel).getByText(/incidentes? · \d+ sensores/)).toBeInTheDocument();
    await userEvent.click(within(painel).getAllByRole("button", { name: /SC0020/ })[0]);
    expect(within(screen.getByTestId("popup-no-mapa")).getByRole("dialog", { name: "Sensor SC0020" })).toBeInTheDocument();
    expect(within(screen.getByRole("tabpanel")).getByRole("heading", { name: "Falhas de rede" })).toBeInTheDocument();
  });

  it("com um sensor aberto a partir da lista, o Esc fecha só o sensor, como o ✕", async () => {
    render(<App />);
    const chips = await screen.findByRole("group", { name: "Resumo das falhas inesperadas" });
    await userEvent.click(within(chips).getByRole("button", { name: /falhas? de rede/ }));
    await userEvent.click(within(screen.getByRole("tabpanel")).getAllByRole("button", { name: /SC0020/ })[0]);
    await userEvent.keyboard("{Escape}");
    expect(screen.getByTestId("popup-no-mapa")).toBeEmptyDOMElement();
    expect(within(screen.getByRole("tabpanel")).getByRole("heading", { name: "Falhas de rede" })).toBeInTheDocument();
  });

  it("Esc e um clique no mapa vazio fecham a lista e o pop-up", async () => {
    render(<App />);
    const chips = await screen.findByRole("group", { name: "Resumo das falhas inesperadas" });
    await userEvent.click(within(chips).getAllByRole("button")[0]);
    await userEvent.keyboard("{Escape}");
    expect(screen.queryByRole("tabpanel")).toBeNull();
    await userEvent.click(await marcador("SmartCrosswalk:0020"));
    await userEvent.click(screen.getByRole("button", { name: "mapa vazio" }));
    expect(screen.getByTestId("popup-no-mapa")).toBeEmptyDOMElement();
  });

  it("mudar de separador na barra fecha o pop-up do Vigiar (a folha, no telemóvel)", async () => {
    render(<App />);
    await userEvent.click(await marcador("SmartCrosswalk:0020"));
    expect(screen.getByTestId("popup-no-mapa")).not.toBeEmptyDOMElement();
    await userEvent.click(screen.getByRole("tab", { name: /completar/i }));
    expect(screen.getByTestId("popup-no-mapa")).toBeEmptyDOMElement();
  });

  it("os outros separadores continuam com a barra lateral e o pop-up no mapa", async () => {
    render(<App />);
    await userEvent.click(screen.getByRole("tab", { name: /completar/i }));
    expect(screen.getByRole("tabpanel")).toBeInTheDocument();
    await userEvent.click(await marcador("SmartCrosswalk:0020"));
    expect(screen.getByTestId("popup-no-mapa")).not.toBeEmptyDOMElement();
  });
});

describe("① Vigiar: as duas falhas distinguem-se em cor, ícone e nome (ADR-0033)", () => {
  beforeEach(() => {
    falsificarApi();
  });

  it("os chips das falhas levam o símbolo de cada tipo ao lado do nome: sinal cortado (rede) e aparelho com aviso (dispositivo)", async () => {
    render(<App />);
    const chips = await screen.findByRole("group", { name: "Resumo das falhas inesperadas" });
    const rede = within(chips).getByRole("button", { name: /falhas? de rede/ });
    const dispositivo = within(chips).getByRole("button", { name: /falhas? de dispositivo/ });
    expect(rede.querySelector(".simbolo-estado--falha-rede svg")).not.toBeNull();
    expect(dispositivo.querySelector(".simbolo-estado--falha-dispositivo svg")).not.toBeNull();
    expect(rede).toHaveTextContent("Falhas de rede");
    expect(dispositivo).toHaveTextContent("Falhas de dispositivo");
    expect(dispositivo).toHaveTextContent("um sensor sozinho");
    // A de dispositivo já não é âmbar: o âmbar é a atenção. É a cor da falha de dispositivo.
    expect(dispositivo).toHaveClass("kpi--dispositivo");
    expect(rede).toHaveClass("kpi--erro");
  });

  it("o chip das falhas de dispositivo abre a lista «Falhas de dispositivo» (e não «de sensor», ADR-0033)", async () => {
    render(<App />);
    const chips = await screen.findByRole("group", { name: "Resumo das falhas inesperadas" });
    await userEvent.click(within(chips).getByRole("button", { name: /falhas? de dispositivo/ }));
    expect(within(screen.getByRole("tabpanel")).getByRole("heading", { name: "Falhas de dispositivo" })).toBeInTheDocument();
  });

  it("a lista de todas as falhas diz o tipo de cada uma com o mesmo símbolo e o nome por extenso", async () => {
    render(<App />);
    const chips = await screen.findByRole("group", { name: "Resumo das falhas inesperadas" });
    await userEvent.click(within(chips).getByRole("button", { name: /^\d+ falhas:/ }));
    const lista = within(screen.getByRole("tabpanel")).getByRole("list");
    const rede = lista.querySelector(".tipo-falha--rede");
    const dispositivo = lista.querySelector(".tipo-falha--dispositivo");
    expect(rede).toHaveTextContent("Falha de rede");
    expect(rede?.querySelector(".simbolo-estado--falha-rede svg")).not.toBeNull();
    expect(dispositivo).toHaveTextContent("Falha de dispositivo");
    expect(dispositivo?.querySelector(".simbolo-estado--falha-dispositivo svg")).not.toBeNull();
  });

  it("o pop-up de uma zona turística tem o mesmo cabeçalho em duas linhas: o título e o ✕ em cima, o tipo (com o ícone) e o estado por baixo", async () => {
    render(<App />);
    await userEvent.click(await marcador("TouristZone:0004"));
    const popup = within(screen.getByTestId("popup-no-mapa")).getByRole("dialog", { name: "Sensor TZ0004" });
    const cabecalho = popup.querySelector(".popup__cabecalho");
    expect(cabecalho?.querySelector(".popup__titulo")).toHaveTextContent("TZ0004");
    expect(cabecalho?.querySelector(".popup__titulo button")).toHaveAccessibleName("Fechar o pop-up");
    const meta = cabecalho?.querySelector(".popup__meta");
    expect(meta).toHaveTextContent("zona turística");
    expect(meta?.querySelector(".popup__tipo svg")).not.toBeNull();
    expect(meta?.querySelector(".estado-sensor--ativo")).toHaveTextContent("Ativo");
  });
});

describe("① Vigiar: o ícone do tipo em cada linha", () => {
  beforeEach(() => {
    falsificarApi();
  });

  it("a lista das falhas põe antes do nome o ícone do tipo com o símbolo da falha, decorativo porque a linha já diz o tipo", async () => {
    render(<App />);
    const chips = await screen.findByRole("group", { name: "Resumo das falhas inesperadas" });
    await userEvent.click(within(chips).getByRole("button", { name: /^\d+ falhas:/ }));
    const linhas = within(screen.getByRole("tabpanel")).getAllByRole("listitem");
    const comIcone = linhas.filter((l) => l.querySelector(".icone-tipo svg"));
    expect(comIcone).toHaveLength(linhas.length);
    for (const l of linhas) {
      expect(l.querySelector(".icone-tipo")).toHaveAttribute("aria-hidden", "true");
      const rede = l.querySelector(".tipo-falha--rede") !== null;
      expect(l.querySelector(`.icone-tipo .simbolo-estado--falha-${rede ? "rede" : "dispositivo"}`)).not.toBeNull();
    }
    const doTipo = (texto: string) => linhas.find((l) => l.textContent?.includes(texto))!.querySelector(".distintivo .icone path")?.getAttribute("d");
    expect(new Set([doTipo("Passadeira"), doTipo("Segmento de estrada"), doTipo("Estacionamento")]).size).toBe(3);
  });

  it("o pop-up da RSU junta os sensores por estado, cada tipo com o seu ícone (passadeiras, segmentos e «Estac.»)", async () => {
    render(<App />);
    await userEvent.click(await marcador("RoadSideUnit:0030"));
    const lista = within(screen.getByTestId("popup-no-mapa")).getByRole("list", { name: "Sensores da RSU0030" });
    const falhaRede = within(lista).getByText(/SC0019–0022/).closest(".popup__nomes")!;
    expect(within(falhaRede as HTMLElement).getByRole("img", { name: "Passadeira" })).toBeInTheDocument();
    expect(within(falhaRede as HTMLElement).getByRole("img", { name: "Segmento de estrada" })).toBeInTheDocument();
    expect(within(falhaRede as HTMLElement).getByRole("img", { name: "Estacionamento" })).toBeInTheDocument();
  });

  it("o pop-up da RSU tem a fita com o ícone do tipo antes de cada linha, com o estado à hora do cursor", async () => {
    render(<App />);
    await userEvent.click(await marcador("RoadSideUnit:0030"));
    const fita = within(screen.getByTestId("popup-no-mapa")).getByRole("table", { name: /Sensores da RSU ao longo da semana/ });
    const linhas = within(fita).getAllByRole("row");
    expect(linhas.length).toBeGreaterThan(3);
    for (const l of linhas) expect(l.querySelector(".fita__nome .icone-tipo svg")).not.toBeNull();
    const rede = linhas.find((l) => l.textContent?.startsWith("Rede"))!;
    expect(rede.querySelector(".icone-tipo .distintivo__estado")).not.toBeNull();
  });
});

describe("a linha dos segmentos na fita da RSU diz o estado certo de cada segmento", () => {
  const RSU30 = "urn:ngsi-ld:RoadSideUnit:0030";
  const aHora = async (hora: string) => {
    falsificarApi();
    render(
      <EstadoDemoProvider inicial={{ hora: Date.parse(hora) }}>
        <LinhaDoTempoRsu rsu={RSU30} />
      </EstadoDemoProvider>,
    );
    const fita = await screen.findByRole("table", { name: /Sensores da RSU ao longo da semana/ });
    return within(fita)
      .getAllByRole("row")
      .find((l) => l.textContent?.startsWith("Segmentos"))!;
  };

  it("com os segmentos todos em falha de rede, leva só o símbolo da rede", async () => {
    const linha = await aHora("2026-11-04T21:00Z"); // o 10962 ainda não falhou
    expect(linha.querySelector(".icone-tipo .simbolo-estado--falha-rede")).not.toBeNull();
    expect(linha.querySelector(".icone-tipo .simbolo-estado--falha-dispositivo")).toBeNull();
    expect(within(linha).getByText("falha de rede")).toBeInTheDocument();
  });

  it("com falhas de rede e de dispositivo ao mesmo tempo, leva os dois símbolos e diz os dois", async () => {
    const linha = await aHora("2026-11-06T12:00Z"); // 11165 e 11166 em rede, 10962 em dispositivo
    expect(linha.querySelector(".icone-tipo .simbolo-estado--falha-rede")).not.toBeNull();
    expect(linha.querySelector(".icone-tipo .simbolo-estado--falha-dispositivo")).not.toBeNull();
    expect(within(linha).getByText("falha de rede e de dispositivo")).toBeInTheDocument();
    expect(linha.querySelector(".icone-tipo")).toHaveAttribute("aria-hidden", "true");
  });
});

describe("com a lista das falhas aberta, as camadas e a legenda continuam à mão", () => {
  it("a legenda e as camadas abrem com a lista aberta", async () => {
    falsificarApi();
    render(<App />);
    const chips = await screen.findByRole("group", { name: "Resumo das falhas inesperadas" });
    await userEvent.click(within(chips).getByRole("button", { name: /^\d+ falhas:/ }));
    expect(screen.getByRole("tabpanel")).toBeInTheDocument();
    const legenda = screen.getByRole("button", { name: "Legenda" });
    await userEvent.click(legenda);
    expect(legenda).toHaveAttribute("aria-expanded", "true");
    expect(screen.getByText("Tipo")).toBeVisible();
    const camadas = screen.getByRole("button", { name: /^Camadas/ });
    await userEvent.click(camadas);
    expect(camadas).toHaveAttribute("aria-expanded", "true");
  });

  it("a 390 px, o CSS deixa os botões na coluna deles, o painel da legenda a deslizar dentro do mapa e os indicadores numa faixa baixa", () => {
    // O jsdom não desenha: guarda-se aqui a regra do CSS (o vitest tem `css: false`, que esvazia o `?raw`).
    const { readFileSync } = (globalThis as unknown as { process: { getBuiltinModule: (nome: string) => { readFileSync: (f: string, c: string) => string } } }).process.getBuiltinModule("node:fs");
    const css = readFileSync("src/styles/app.css", "utf8").replace(/\s+/g, " ");
    const bloco = css.slice(css.lastIndexOf("A 390 px, com a lista das falhas aberta"));
    expect(bloco).toMatch(/@media \(max-width: 759px\) \{/);
    expect(bloco).toMatch(/\.camadas, \.legenda \{ min-width: 0; \}/); // já não são 132 px de largura mínima cada
    const painel = bloco.match(/\.recolhivel__corpo \{([^}]*)\}/)![1];
    expect(painel).toMatch(/overflow-y: auto/); // desliza em vez de ser cortado
    expect(painel).toMatch(/width: min\(var\(--painel-ferramenta\), calc\(100vw - 112px\)\)/); // cabe ao lado dos botões
    expect(painel).not.toMatch(/max-height/); // sem a lista, o mapa é alto e a legenda vê-se inteira
    // A altura máxima só vale com a lista aberta, quando o mapa tem 240 px.
    const comLista = bloco.match(/\.corpo:not\(\.corpo--sem-painel\) \.recolhivel__corpo \{([^}]*)\}/)![1];
    expect(Number(comLista.match(/max-height: (\d+)px/)![1])).toBeLessThanOrEqual(240 - 16);
    expect(bloco).toMatch(/\.corpo:not\(\.corpo--sem-painel\) \.indicadores \{ top: auto; bottom: /); // por baixo do zoom
  });

  it("o CSS põe os indicadores depois dos botões do mapa quando há lista e as camadas abertas por cima deles", () => {
    // O jsdom não desenha, e o vitest não carrega o CSS: guarda-se aqui a regra que resolve a sobreposição.
    // (o vitest tem `css: false`, que esvazia o `?raw`: lê-se o ficheiro com o `fs` do Node)
    const { readFileSync } = (globalThis as unknown as { process: { getBuiltinModule: (nome: string) => { readFileSync: (f: string, c: string) => string } } }).process.getBuiltinModule("node:fs");
    const css = readFileSync("src/styles/app.css", "utf8").replace(/\s+/g, " ");
    const regra = css.match(/@media \(min-width: 760px\) \{ \.corpo:not\(\.corpo--sem-painel\) \.indicadores \{([^}]*)\}/);
    expect(regra).not.toBeNull();
    expect(regra![1]).toMatch(/left: calc\(/); // começa depois da coluna de botões
    expect(regra![1]).toMatch(/transform: none/); // já não está centrada
    expect(css).toMatch(/\.controlos-mapa \{ z-index: 4; \}/); // acima dos indicadores (z-index 3)
    expect(css).toMatch(/\.indicadores \{ position: absolute; z-index: 3;/);
  });
});

describe("a lista das falhas abre o pop-up de qualquer linha", () => {
  const U = "urn:ngsi-ld:";
  const RSU6 = `${U}RoadSideUnit:0006`;
  const doRsu6 = (id: string, tipo: "zona" | "segmento", lon: number, lat: number) => ({ id: U + id, tipo, rsu: RSU6, rsus: [RSU6], nome: null, lon, lat });
  const abrirLista = async () => {
    render(<App />);
    const chips = await screen.findByRole("group", { name: "Resumo das falhas inesperadas" });
    await userEvent.click(within(chips).getByRole("button", { name: /^\d+ falhas:/ }));
    return screen.getByRole("tabpanel");
  };

  it.each([
    ["TZ0006", "zona"],
    ["10566", "segmento"],
  ])("clicar em %s, cuja RSU0006 não é um sensor no mapa, abre o pop-up do próprio sensor", async (rotulo, tipo) => {
    falsificarApi({ "/sensores": ok([...SENSORES, doRsu6("TouristZone:0006", "zona", -8.653, 40.6416), doRsu6("RoadSegment:10566", "segmento", -8.6525, 40.6406)]) });
    const painel = await abrirLista();
    // A lista é paginada (ADR-0048): filtra-se pelo tipo de sensor para a linha estar na 1.ª página.
    await userEvent.selectOptions(within(painel).getByRole("combobox", { name: "Tipo de sensor" }), tipo);
    await userEvent.click(within(painel).getByRole("button", { name: new RegExp(`^\\d+\\.º ${rotulo}`) }));
    expect(within(screen.getByTestId("popup-no-mapa")).getByRole("dialog", { name: `Sensor ${rotulo}` })).toBeInTheDocument();
  });

  it("um segmento cuja RSU é um sensor no mapa continua a abrir o pop-up da RSU", async () => {
    falsificarApi();
    const painel = await abrirLista();
    // A lista vai pela ordem de intervenção (ADR-0053) e é paginada: filtra-se pelos segmentos para a linha estar na 1.ª página.
    await userEvent.selectOptions(within(painel).getByRole("combobox", { name: "Tipo de sensor" }), "segmento");
    await userEvent.click(within(painel).getByRole("button", { name: /^\d+\.º 11165/ }));
    expect(within(screen.getByTestId("popup-no-mapa")).getByRole("dialog", { name: "Sensor RSU0030" })).toBeInTheDocument();
  });
});

describe("o fundo do mapa segue a luminosidade da hora escolhida (ADR-0040)", () => {
  it("a demo abre às 20h de 04/11 e o mapa recebe «noite»", async () => {
    falsificarApi();
    render(<App />);
    await screen.findByRole("group", { name: "Resumo das falhas inesperadas" });
    await waitFor(() => expect(screen.getByTestId("mapa")).toHaveAttribute("data-luz", "noite"));
  });

  it("muda com a hora: dia ao meio-dia e crepúsculo às 7h, e sem dado fica sem luminosidade (dia)", async () => {
    falsificarApi();
    const mapa = async (hora: string) => {
      const r = render(
        <EstadoDemoProvider inicial={{ hora: Date.parse(hora) }}>
          <MapaDaDemo tema="dark" />
        </EstadoDemoProvider>,
      );
      await screen.findByTestId("mapa");
      return r;
    };
    for (const [hora, luz] of [
      ["2026-11-04T12:00Z", "dia"],
      ["2026-11-04T07:00Z", "crepusculo"],
    ] as const) {
      const r = await mapa(hora);
      await waitFor(() => expect(screen.getByTestId("mapa")).toHaveAttribute("data-luz", luz));
      r.unmount();
    }
    const r = await mapa("2026-11-05T03:00Z");
    await waitFor(() => expect(screen.getByTestId("mapa")).not.toHaveAttribute("data-luz"));
    r.unmount();
  });
});

describe("as passadeiras com a forma real chegam ao mapa (ADR-0038)", () => {
  it("o mapa recebe o asfalto e as 5 listas de cada passadeira e a ponta a que o marcador se prende", async () => {
    falsificarApi();
    render(<App />);
    await screen.findByRole("group", { name: "Resumo das falhas inesperadas" });
    // 2 passadeiras com polígono: 2 chãos, 10 listas (5 cada) e 2 pontas.
    await waitFor(() => expect(screen.getByTestId("mapa")).toHaveAttribute("data-passadeiras", "2/10"));
    expect(screen.getByTestId("mapa")).toHaveAttribute("data-pontas", "2");
  });

  it("sem a API das passadeiras, o mapa não recebe polígonos: ficam só os marcadores", async () => {
    const pedidos = falsificarApi({ "/mapa/passadeiras": { status: 503, corpo: { estado: "por calcular", motivo: "passadeiras.geojson não existe" } } });
    render(<App />);
    await screen.findByRole("group", { name: "Resumo das falhas inesperadas" });
    await waitFor(() => expect(pedidos.mock.calls.some(([url]) => String(url).includes("/mapa/passadeiras"))).toBe(true));
    await new Promise((r) => setTimeout(r, 50)); // a resposta 503 chega ao estado
    expect(screen.getByTestId("mapa")).not.toHaveAttribute("data-passadeiras");
    expect(screen.getByTestId("mapa")).not.toHaveAttribute("data-pontas");
  });
});
