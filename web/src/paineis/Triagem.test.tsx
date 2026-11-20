/** A triagem das falhas para o IT (ADR-0053): a ordem na lista, a sugestão no pop-up e o botão que copia o alerta NGSI-LD. */
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { ReactNode } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { App } from "../App";
import { EstadoDemoProvider } from "../estado/estado";
import { DetalheVigiar } from "./PainelVigiar";
import { rotuloSensor } from "../dominio/formato";
import { chaveDaFalha, ordemDeIntervencao } from "../dominio/vigiar";
import { falsificarApi, ok } from "../test/apiFalsa";
import { FALHAS } from "../test/dados";

vi.mock("../componentes/mapa/Mapa", () => ({
  Mapa: (props: { marcadores: { id: string }[]; conteudoPopup: ReactNode; onSelecionar: (id: string) => void }) => (
    <div data-testid="mapa">
      {props.marcadores.map((m) => (
        <button key={m.id} type="button" data-sensor={m.id} onClick={() => props.onSelecionar(m.id)}>
          {m.id}
        </button>
      ))}
      <div data-testid="popup-no-mapa">{props.conteudoPopup}</div>
    </div>
  ),
}));

/** O `Alert` como `riasense exportar` o escreve em `falhas.jsonld` (ADR-0008), reduzido ao que o teste precisa. */
const ALERTA = {
  id: "urn:ngsi-ld:Alert:riasense:RoadSegment:11165:2026-11-04T20:16:30.750000Z",
  type: "Alert",
  subCategory: { type: "Property", value: "falhaDeRede" },
  alertSource: { type: "Relationship", object: "urn:ngsi-ld:RoadSegment:11165" },
};

const abrirLista = async () => {
  render(<App />);
  const chips = await screen.findByRole("group", { name: "Resumo das falhas inesperadas" });
  await userEvent.click(within(chips).getByRole("button", { name: /^\d+ falhas:/ }));
  return screen.getByRole("tabpanel");
};
/** O nome de cada linha da lista, que começa pela ordem («7.º 11165»). */
const linhas = (painel: HTMLElement) => [...painel.querySelectorAll(".lista-falhas__nome")].map((l) => l.textContent);
const triagem = () => within(screen.getByTestId("popup-no-mapa")).getByRole("region", { name: "Triagem para o IT" });

/** Abre o pop-up da linha do 11165 (um segmento: abre o da RSU0030). */
const abrirO11165 = async () => {
  const painel = await abrirLista();
  await userEvent.selectOptions(within(painel).getByRole("combobox", { name: "Tipo de sensor" }), "segmento");
  await userEvent.click(within(painel).getByRole("button", { name: /^7\.º 11165/ }));
  return triagem();
};

const mudarAreaDeTransferencia = (valor: unknown) => Object.defineProperty(navigator, "clipboard", { value: valor, configurable: true });

afterEach(() => {
  mudarAreaDeTransferencia(undefined);
});

describe("a ordem de intervenção (ADR-0053)", () => {
  it("primeiro as falhas em curso, depois as de rede, depois as outras; em cada grupo pelo início, e o empate pelo id do sensor", () => {
    const pela = (falhas: typeof FALHAS) => {
      const ordem = ordemDeIntervencao(falhas);
      return [...falhas].sort((a, b) => ordem.get(chaveDaFalha(a))! - ordem.get(chaveDaFalha(b))!).map((f) => rotuloSensor(f.sensor));
    };
    // A SC0020 e a SC0022 começam no mesmo segundo: fica primeiro a do id menor. A 10566 é a mais antiga, mas já acabou.
    const esperada = ["SC0021", "SC0019", "RSU0030", "SC0020", "SC0022", "11166", "11165", "10962", "10566", "TZ0006"];
    expect(pela(FALHAS)).toEqual(esperada);
    expect(pela([...FALHAS].reverse())).toEqual(esperada);
    // Uma falha de rede que já acabou passa à frente das de dispositivo que acabaram, mesmo começando depois delas.
    const redeAcabada = { ...FALHAS[0], sensor: "urn:ngsi-ld:RoadSegment:10368", inicio: "2026-11-05T09:56:00", em_curso: false };
    expect(pela([...FALHAS, redeAcabada]).slice(8)).toEqual(["10368", "10566", "TZ0006"]);
  });

  it("cada linha da lista leva só a ordem, e os filtros escondem linhas sem mudar os números", async () => {
    falsificarApi();
    const painel = await abrirLista();
    expect(linhas(painel).slice(0, 3)).toEqual(["1.º SC0021", "2.º SC0019", "3.º RSU0030"]);
    expect(painel).not.toHaveTextContent("Sugestão");
    await userEvent.selectOptions(within(painel).getByRole("combobox", { name: "Tipo de sensor" }), "segmento");
    expect(linhas(painel)).toEqual(["6.º 11166", "7.º 11165", "8.º 10962", "9.º 10566"]);
  });
});

describe("a sugestão no pop-up (ADR-0053, ponto 1)", () => {
  it("a linha de um segmento abre o pop-up da RSU com a falha desse segmento: falha de rede, começar pela ligação da RSU", async () => {
    falsificarApi();
    const caixa = await abrirO11165();
    expect(within(screen.getByTestId("popup-no-mapa")).getByRole("dialog", { name: "Sensor RSU0030" })).toBeInTheDocument();
    expect(caixa).toHaveTextContent("7.º 11165: Sugestão: começar pela ligação da RSU.");
  });

  it("uma falha de dispositivo: começar pelo próprio sensor", async () => {
    falsificarApi();
    const painel = await abrirLista();
    await userEvent.selectOptions(within(painel).getByRole("combobox", { name: "Tipo de sensor" }), "segmento");
    await userEvent.click(within(painel).getByRole("button", { name: /^8\.º 10962/ }));
    expect(triagem()).toHaveTextContent("8.º 10962: Sugestão: começar pelo próprio sensor.");
  });

  it("o clique na linha leva a hora ao início da falha; mudar a hora à mão mostra a falha dessa hora", async () => {
    falsificarApi();
    const painel = await abrirLista();
    await userEvent.selectOptions(within(painel).getByRole("combobox", { name: "Tipo de sensor" }), "segmento");
    // A 10962 deixou de comunicar às 18h31 de 05/11: a hora vai para as 18h desse dia, e o pop-up da RSU0030 mostra essa falha.
    await userEvent.click(within(painel).getByRole("button", { name: /^8\.º 10962/ }));
    const hora = screen.getByRole("slider", { name: /qui 05\/11 · 18h/ });
    expect(triagem()).toHaveTextContent("8.º 10962: Sugestão: começar pelo próprio sensor.");
    // Uma hora depois, o pop-up mostra a falha da RSU0030 a essa hora: o estacionamento, sem comunicação com a rede desde 04/11.
    fireEvent.change(hora, { target: { value: String(Number((hora as HTMLInputElement).value) + 1) } });
    expect(screen.getByRole("slider", { name: /qui 05\/11 · 19h/ })).toBeInTheDocument();
    expect(triagem()).toHaveTextContent(/^3\.º Sugestão: começar pela ligação da RSU\.Copiar/);
  });

  it("no mapa, o pop-up de um sensor em falha à hora escolhida diz a sugestão sem repetir o nome; sem falha, não há triagem", async () => {
    falsificarApi();
    render(<App />);
    // A demo abre às 20h de 04/11: a SC0019 deixou de comunicar às 20h06, com a RSU0030; a SC0013 não tem falhas.
    await userEvent.click(await within(screen.getByTestId("mapa")).findByText("urn:ngsi-ld:SmartCrosswalk:0019"));
    expect(triagem()).toHaveTextContent(/^2\.º Sugestão: começar pela ligação da RSU\./);
    await userEvent.click(within(screen.getByTestId("mapa")).getByText("urn:ngsi-ld:SmartCrosswalk:0013"));
    expect(within(screen.getByTestId("popup-no-mapa")).queryByRole("region", { name: "Triagem para o IT" })).toBeNull();
  });
});

describe("duas falhas do mesmo sensor na mesma hora (ADR-0053)", () => {
  it("no 10962, que passa de rede a dispositivo às 18h31 de 05/11, o pop-up mostra a que começou mais tarde", async () => {
    // A de rede acaba no instante em que começa a de dispositivo; vem primeiro, como a API a pode devolver.
    const dispositivo = FALHAS.find((f) => f.sensor.endsWith("RoadSegment:10962"))!;
    const rede = { ...dispositivo, inicio: "2026-11-04T20:16:06.640000", fim: dispositivo.inicio, tipo: "rede" as const, em_curso: false, grupo: 3 };
    falsificarApi({ "/vigiar/falhas": ok([rede, ...FALHAS]) });
    render(
      <EstadoDemoProvider inicial={{ hora: Date.parse("2026-11-05T18:00:00Z") }}>
        <DetalheVigiar id={dispositivo.sensor} onFechar={() => {}} />
      </EstadoDemoProvider>,
    );
    const caixa = await screen.findByRole("region", { name: "Triagem para o IT" });
    expect(caixa).toHaveTextContent(/^8\.º Sugestão: começar pelo próprio sensor\./);
    // O cabeçalho do pop-up diz a mesma falha.
    expect(screen.getByRole("dialog", { name: "Sensor 10962" })).toHaveTextContent("Falha de dispositivo");
    expect(screen.getByRole("dialog", { name: "Sensor 10962" })).not.toHaveTextContent("Falha de rede");
  });
});

describe("copiar o alerta NGSI-LD (ADR-0053, ponto 2)", () => {
  it("pede à API o Alert dessa falha, pelo sensor e pelo início, e copia-o tal como vem; diz «Copiado»", async () => {
    const fetch = falsificarApi({ "/vigiar/falhas/alerta": ok([ALERTA]) });
    const caixa = await abrirO11165();
    const writeText = vi.fn(async () => {});
    mudarAreaDeTransferencia({ writeText });
    fireEvent.click(within(caixa).getByRole("button", { name: "Copiar alerta NGSI-LD" }));
    await waitFor(() => expect(within(caixa).getByRole("status")).toHaveTextContent("Copiado"));
    expect(writeText).toHaveBeenCalledWith(JSON.stringify(ALERTA, null, 2));
    const pedido = new URL(String(fetch.mock.calls.map((c) => c[0]).find((u) => String(u).includes("/vigiar/falhas/alerta"))));
    expect(pedido.searchParams.get("sensor")).toBe("urn:ngsi-ld:RoadSegment:11165");
    expect(pedido.searchParams.get("inicio")).toBe("2026-11-04T20:16:30.750000");
  });

  it("sem área de transferência, mostra o alerta num campo de texto, já selecionado, para copiar à mão", async () => {
    falsificarApi({ "/vigiar/falhas/alerta": ok([ALERTA]) });
    const caixa = await abrirO11165();
    mudarAreaDeTransferencia(undefined);
    fireEvent.click(within(caixa).getByRole("button", { name: "Copiar alerta NGSI-LD" }));
    const texto = await within(caixa).findByRole("textbox", { name: "Alerta NGSI-LD" });
    expect(texto).toHaveValue(JSON.stringify(ALERTA, null, 2));
    expect(texto).toHaveAttribute("readonly");
    expect(caixa).toHaveTextContent("Não foi possível usar a área de transferência: selecione o texto e copie-o.");
  });

  it("se a área de transferência recusar, também mostra o texto; se a API não der o alerta, diz isso e não copia nada", async () => {
    falsificarApi({ "/vigiar/falhas/alerta": ok([ALERTA]) });
    let caixa = await abrirO11165();
    mudarAreaDeTransferencia({ writeText: vi.fn(async () => Promise.reject(new Error("NotAllowedError"))) });
    fireEvent.click(within(caixa).getByRole("button", { name: "Copiar alerta NGSI-LD" }));
    expect(await within(caixa).findByRole("textbox", { name: "Alerta NGSI-LD" })).toHaveValue(JSON.stringify(ALERTA, null, 2));
    document.body.innerHTML = "";

    falsificarApi({ "/vigiar/falhas/alerta": ok([]) });
    caixa = await abrirO11165();
    const writeText = vi.fn(async () => {});
    mudarAreaDeTransferencia({ writeText });
    fireEvent.click(within(caixa).getByRole("button", { name: "Copiar alerta NGSI-LD" }));
    await waitFor(() => expect(within(caixa).getByRole("status")).toHaveTextContent("A API não deu o alerta. Tente de novo."));
    expect(writeText).not.toHaveBeenCalled();
  });
});
