/** A pergunta por voz (ADR-0054): o reconhecimento simulado, o recuo para a caixa de texto, a resposta no mapa e em voz alta. */
import { act, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { App } from "../App";
import { falsificarApi, ok } from "../test/apiFalsa";
import { EstadoDemoProvider } from "../estado/estado";
import { AVISO_PRIVACIDADE, RESSALVA_RADAR, vozDesligadaNoModo } from "../dominio/voz";
import { BotaoVoz, FaixaVoz, useVoz } from "./PerguntaVoz";

const RESSALVA = RESSALVA_RADAR;

vi.mock("./mapa/Mapa", () => ({
  Mapa: (props: { conteudoPopup: ReactNode; realce?: { nome: string; segmentos: string[] } | null; popup: { id: string } | null }) => (
    <div data-testid="mapa" data-realce={JSON.stringify(props.realce ?? null)} data-popup={props.popup?.id ?? ""}>
      {props.conteudoPopup}
    </div>
  ),
}));

const seg = (n: number) => `urn:ngsi-ld:RoadSegment:${n}`;
const PASSAGENS = [
  { id: seg(10084), sensor: "Radar", veiculos: 664, vel_media_ms: 7, limite_kmh: 30, acima_limite: 246, velocidades_kmh: [20, 24, 28] },
  { id: seg(11168), sensor: "Radar", veiculos: 336, vel_media_ms: 7, limite_kmh: 30, acima_limite: 124, velocidades_kmh: [22, 24, 26] },
];
const GEO = {
  corpo: {
    type: "FeatureCollection",
    features: [10084, 11168].map((n, i) => ({
      type: "Feature",
      properties: { id: seg(n), sensor: "Radar" },
      geometry: { type: "LineString", coordinates: [[-8.647, 40.636 + i * 0.001], [-8.646, 40.637 + i * 0.001]] },
    })),
  },
};

/** O SpeechRecognition do browser, simulado: guarda a última instância para o teste mandar resultados e erros. */
class ReconhecimentoFalso {
  static ultimo: ReconhecimentoFalso | null = null;
  lang = "";
  interimResults = false;
  continuous = false;
  onresult: ((e: unknown) => void) | null = null;
  onerror: ((e: { error: string }) => void) | null = null;
  onend: (() => void) | null = null;
  start = vi.fn();
  abort = vi.fn(() => this.onend?.());
  constructor() {
    ReconhecimentoFalso.ultimo = this;
  }
  dizer(texto: string, isFinal: boolean) {
    const r = Object.assign([{ transcript: texto }], { isFinal });
    act(() => this.onresult?.({ resultIndex: 0, results: [r] }));
    if (isFinal) act(() => this.onend?.());
  }
}

const speak = vi.fn();
beforeEach(() => {
  falsificarApi({ "/mapa/carros": ok(PASSAGENS), "/mapa/segmentos-carros": GEO });
  localStorage.clear();
  speak.mockClear();
  vi.stubGlobal("speechSynthesis", { speak, cancel: vi.fn() });
  vi.stubGlobal(
    "SpeechSynthesisUtterance",
    class {
      lang = "";
      constructor(public text: string) {}
    },
  );
});
afterEach(() => {
  vi.unstubAllGlobals();
  ReconhecimentoFalso.ultimo = null;
});

const comVoz = () => vi.stubGlobal("webkitSpeechRecognition", ReconhecimentoFalso);
const regiaoViva = () => document.querySelector("[aria-live='polite'].so-leitor") as HTMLElement;

describe("sem reconhecimento de fala (Firefox, Safari)", () => {
  it("o 🎙 não aparece e a caixa de texto dá a mesma resposta no mapa", async () => {
    render(<App />);
    expect(screen.queryByRole("button", { name: "Perguntar por voz (V)" })).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Perguntar sobre uma rua (V)" }));
    await userEvent.type(screen.getByRole("textbox", { name: "Pergunta sobre uma rua" }), "av 25 abril{Enter}");

    // O pop-up é o do troço, o mesmo do clique (ADR-0039, ponto 4): a % acima do limite só por troço, com o sensor e a ressalva.
    const popup = await screen.findByRole("dialog");
    await waitFor(() => expect(popup).toHaveTextContent("664 veículos medidos nesta hora, pelo radar."));
    expect(popup).toHaveTextContent("37 % dos veículos medidos acima dele nesta hora");
    expect(popup).toHaveTextContent(/o radar e a câmara medem velocidades diferentes/i);
    const mapa = screen.getByTestId("mapa");
    expect(JSON.parse(mapa.dataset.realce ?? "null")).toEqual({ nome: "Av. 25 de Abril", segmentos: [seg(10084), seg(11168)] });
    expect(mapa.dataset.popup).toBe(seg(10084));
    // A frase escrita e a falada levam a ressalva do radar, e nunca a % de excesso da rua.
    const frase = "Av. 25 de Abril: 1000 veículos por hora, nos dois sentidos, medidos pelo radar, trânsito igual ao de ontem a esta hora. Atenção: o radar";
    const resposta = await screen.findByRole("region", { name: "Resposta sobre uma rua" });
    await waitFor(() => expect(resposta).toHaveTextContent(frase));
    expect(resposta).not.toHaveTextContent("%");
    await waitFor(() => expect(regiaoViva()).toHaveTextContent(frase));
    expect(speak).toHaveBeenCalledTimes(1);
    expect(speak.mock.calls[0][0]).toMatchObject({ lang: "pt-PT" });
    expect(speak.mock.calls[0][0].text).toContain(RESSALVA);
  });

  it("uma pergunta que não se reconhece diz «Não percebi» e as sugestões levam à rua", async () => {
    render(<App />);
    await userEvent.click(screen.getByRole("button", { name: "Perguntar sobre uma rua (V)" }));
    await userEvent.type(screen.getByRole("textbox", { name: "Pergunta sobre uma rua" }), "como está a rua de santiago{Enter}");
    expect(screen.getByText("Não percebi. Experimente:")).toBeInTheDocument();
    expect(regiaoViva()).toHaveTextContent("Não percebi. Experimente:");
    const chips = screen.getAllByRole("button", { name: /^Como está a / });
    expect(chips.map((c) => c.textContent)).toEqual(["Como está a Av. 25 de Abril?", "Como está a Av. de Oita?", "Como está a Av. da Universidade?"]);
    await userEvent.click(chips[0]);
    await waitFor(() => expect(screen.getByTestId("mapa").dataset.popup).toBe(seg(10084)));
  });

  it("uma rua em falha à hora do cursor diz «sem dados medidos» e não mostra números", async () => {
    falsificarApi({ "/mapa/carros": ok([]), "/mapa/segmentos-carros": GEO });
    render(<App />);
    await userEvent.click(screen.getByRole("button", { name: "Perguntar sobre uma rua (V)" }));
    await userEvent.click(screen.getByRole("button", { name: "Como está a Av. 25 de Abril?" }));
    const popup = await screen.findByRole("dialog");
    await waitFor(() => expect(popup).toHaveTextContent("Sem veículos medidos nesta hora pelo radar."));
    await waitFor(() => expect(regiaoViva()).toHaveTextContent("Av. 25 de Abril: sem dados medidos a esta hora."));
  });
});

describe("com reconhecimento de fala (Chrome, Edge)", () => {
  it("o 🎙 ouve em pt-PT, mostra o texto ao vivo e responde no mapa; o aviso de privacidade aparece uma vez", async () => {
    comVoz();
    render(<App />);
    const botao = screen.getByRole("button", { name: "Perguntar por voz (V)" });
    await userEvent.click(botao);
    const rec = ReconhecimentoFalso.ultimo as ReconhecimentoFalso;
    expect(rec.lang).toBe("pt-PT");
    expect(rec.start).toHaveBeenCalled();
    expect(botao).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByText(AVISO_PRIVACIDADE)).toBeInTheDocument();

    rec.dizer("como está a avenida 25", false);
    expect(screen.getByText("«como está a avenida 25…»")).toBeInTheDocument();
    rec.dizer("como está a avenida 25 de abril", true);
    await waitFor(() => expect(screen.getByTestId("mapa").dataset.popup).toBe(seg(10084)));
    expect(botao).toHaveAttribute("aria-pressed", "false");

    // Na 2.ª pergunta, o aviso já não aparece.
    await userEvent.click(botao);
    expect(screen.queryByText(AVISO_PRIVACIDADE)).not.toBeInTheDocument();
  });

  it("a tecla V abre a pergunta fora dos campos de texto, e Esc cancela", async () => {
    comVoz();
    render(<App />);
    await userEvent.keyboard("v");
    const rec = ReconhecimentoFalso.ultimo as ReconhecimentoFalso;
    expect(rec.start).toHaveBeenCalled();
    expect(screen.getByRole("region", { name: "Pergunta sobre uma rua" })).toBeInTheDocument();
    await userEvent.keyboard("{Escape}");
    expect(rec.abort).toHaveBeenCalled();
    expect(screen.queryByRole("region", { name: "Pergunta sobre uma rua" })).not.toBeInTheDocument();
  });

  it("com o microfone recusado, o 🎙 sai e fica a caixa de texto", async () => {
    comVoz();
    render(<App />);
    await userEvent.click(screen.getByRole("button", { name: "Perguntar por voz (V)" }));
    const rec = ReconhecimentoFalso.ultimo as ReconhecimentoFalso;
    act(() => rec.onerror?.({ error: "not-allowed" }));
    act(() => rec.onend?.());
    expect(screen.queryByRole("button", { name: "Perguntar por voz (V)" })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Perguntar sobre uma rua (V)" })).toBeInTheDocument();
    expect(screen.getByRole("textbox", { name: "Pergunta sobre uma rua" })).toBeInTheDocument();
  });

  it("sem rede, o 🎙 sai", () => {
    comVoz();
    vi.spyOn(navigator, "onLine", "get").mockReturnValue(false);
    render(<App />);
    expect(screen.queryByRole("button", { name: "Perguntar por voz (V)" })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Perguntar sobre uma rua (V)" })).toBeInTheDocument();
    vi.restoreAllMocks();
  });
});

describe("a leitura em voz alta pode ser interrompida (WCAG 1.4.2)", () => {
  const cancel = () => (speechSynthesis.cancel as ReturnType<typeof vi.fn>);
  async function perguntarEOuvirResposta() {
    render(<App />);
    await userEvent.click(screen.getByRole("button", { name: "Perguntar sobre uma rua (V)" }));
    await userEvent.click(screen.getByRole("button", { name: "Como está a Av. 25 de Abril?" }));
    await waitFor(() => expect(speak).toHaveBeenCalledTimes(1));
    cancel().mockClear();
    return screen.findByRole("button", { name: "Parar leitura" });
  }

  it("o ⏹ «Parar leitura» aparece enquanto lê e pára a leitura", async () => {
    const parar = await perguntarEOuvirResposta();
    await userEvent.click(parar);
    expect(cancel()).toHaveBeenCalled();
    expect(screen.queryByRole("button", { name: "Parar leitura" })).not.toBeInTheDocument();
    // A resposta escrita fica.
    expect(screen.getByRole("region", { name: "Resposta sobre uma rua" })).toBeInTheDocument();
  });

  it("Esc pára a leitura", async () => {
    await perguntarEOuvirResposta();
    await userEvent.keyboard("{Escape}");
    expect(cancel()).toHaveBeenCalled();
    expect(screen.queryByRole("button", { name: "Parar leitura" })).not.toBeInTheDocument();
  });

  it("uma pergunta nova pára a leitura anterior antes de falar", async () => {
    await perguntarEOuvirResposta();
    await userEvent.click(screen.getByRole("button", { name: "Perguntar sobre uma rua (V)" }));
    expect(cancel()).toHaveBeenCalled();
    expect(screen.queryByRole("button", { name: "Parar leitura" })).not.toBeInTheDocument();
  });

  it("depois de «Não percebi.», a resposta a uma sugestão lê-se com o ⏹, mesmo com o erro tardio da leitura cancelada", async () => {
    render(<App />);
    await userEvent.click(screen.getByRole("button", { name: "Perguntar sobre uma rua (V)" }));
    await userEvent.type(screen.getByRole("textbox", { name: "Pergunta sobre uma rua" }), "como está a rua de santiago{Enter}");
    await waitFor(() => expect(speak).toHaveBeenCalledTimes(1)); // «Não percebi.»
    await userEvent.click(screen.getByRole("button", { name: "Como está a Av. de Oita?" }));
    await waitFor(() => expect(speak).toHaveBeenCalledTimes(2));
    const [[naoPercebi], [resposta]] = speak.mock.calls as [{ onerror?: () => void; onend?: () => void }][];
    await screen.findByRole("button", { name: "Parar leitura" });
    // Como no Chromium: o «interrupted» de «Não percebi.» chega depois de a resposta começar.
    act(() => naoPercebi.onerror?.());
    expect(screen.getByRole("button", { name: "Parar leitura" })).toBeInTheDocument();
    // Quando a resposta acaba, o ⏹ sai.
    act(() => resposta.onend?.());
    expect(screen.queryByRole("button", { name: "Parar leitura" })).not.toBeInTheDocument();
  });

  it("fechar a resposta pára a leitura, e a pergunta seguinte volta a dizer-se", async () => {
    await perguntarEOuvirResposta();
    await userEvent.click(screen.getByRole("button", { name: "Fechar a resposta" }));
    expect(cancel()).toHaveBeenCalled();
    await userEvent.click(screen.getByRole("button", { name: "Perguntar sobre uma rua (V)" }));
    await userEvent.click(screen.getByRole("button", { name: "Como está a Av. 25 de Abril?" }));
    await waitFor(() => expect(speak).toHaveBeenCalledTimes(2));
  });
});

describe("nos modos «agora» e «Ao vivo», a voz fica desligada", () => {
  function SoVoz({ modo }: { modo: "agora" | "Ao vivo" }) {
    const voz = useVoz(modo);
    return (
      <>
        <BotaoVoz voz={voz} />
        <FaixaVoz voz={voz} />
      </>
    );
  }
  it.each(["agora", "Ao vivo"] as const)("no modo «%s», o 🎙, a tecla V e a caixa de texto não respondem, e o botão diz porquê", async (modo) => {
    comVoz();
    render(
      <EstadoDemoProvider>
        <SoVoz modo={modo} />
      </EstadoDemoProvider>,
    );
    const botao = screen.getByRole("button", { name: vozDesligadaNoModo(modo) });
    expect(botao).toBeDisabled();
    expect(botao).toHaveAttribute("title", vozDesligadaNoModo(modo));
    await userEvent.keyboard("v");
    expect(ReconhecimentoFalso.ultimo).toBeNull();
    expect(screen.queryByRole("textbox")).not.toBeInTheDocument();
    expect(screen.queryByRole("region", { name: "Pergunta sobre uma rua" })).not.toBeInTheDocument();
  });
});
