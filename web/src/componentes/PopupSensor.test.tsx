/** Pop-up do sensor (ADR-0033, ponto 3): o estado, o número, a linha do separador e o limite de 25 palavras. */
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { contarPalavras, MAX_PALAVRAS_POPUP } from "../dominio/etiquetas";
import { EstadoDemoProvider, type EstadoDemo } from "../estado/estado";
import { ok, falsificarApi } from "../test/apiFalsa";
import { FALHAS, SENSORES } from "../test/dados";
import { PopupSensor } from "./PopupSensor";

const U = "urn:ngsi-ld:";
const SC20 = `${U}SmartCrosswalk:0020`;
const RSU30 = `${U}RoadSideUnit:0030`;

function abrir(id: string, inicial: Partial<EstadoDemo> = {}, onFechar = () => {}) {
  return render(
    <EstadoDemoProvider inicial={inicial}>
      <PopupSensor id={id} onFechar={onFechar} />
    </EstadoDemoProvider>,
  );
}

/** O texto que se lê no pop-up, sem o gráfico (o SVG tem título, descrição e eixos para o leitor de ecrã). */
function textoVisivel(): string {
  const copia = screen.getByRole("dialog").cloneNode(true) as HTMLElement;
  copia.querySelectorAll("svg").forEach((s) => s.remove());
  return [...copia.querySelectorAll("*")]
    .filter((e) => e.children.length === 0)
    .map((e) => e.textContent ?? "")
    .join(" ");
}

describe("pop-up de uma passadeira", () => {
  it("no Vigiar: o estado «Falha de rede», com o símbolo do sinal cortado, o valor estimado com o intervalo, e desde quando e de que tipo é a falha", async () => {
    falsificarApi();
    abrir(SC20, { separador: "vigiar" });
    expect(await screen.findByText(/Em falha desde 04\/11 20h07: falha de rede\./)).toBeInTheDocument();
    // O símbolo da falha de rede (círculo vermelho com o sinal cortado) e o nome por extenso: nunca só a cor (WCAG 1.4.1).
    const estado = screen.getByText("Falha de rede").closest(".estado-sensor");
    expect(estado?.querySelector(".simbolo-estado--falha-rede svg")).not.toBeNull();
    expect(screen.getByText("≈ 3")).toBeInTheDocument();
    expect(screen.getByText(/80 %: \d+ a \d+/)).toBeInTheDocument();
    expect(await screen.findByText("às escuras")).toBeInTheDocument();
  });

  it("no Completar: o estado «Estimado» e o erro esperado", async () => {
    falsificarApi();
    abrir(SC20, { separador: "completar" });
    expect(await screen.findByText("Erro esperado 0,32.")).toBeInTheDocument();
    expect(screen.getByText("Estimado").closest(".estado-sensor")?.querySelector(".simbolo-estado--estimado")).not.toBeNull();
  });

  it("no Proteger: o efeito na velocidade, se está assinalada ou tem semáforo, e os dias de dados", async () => {
    falsificarApi();
    abrir(SC20, { separador: "proteger" });
    expect(await screen.findByText(/−0,21 km\/h por \+10 travessias · com semáforo · 1 dia de dados, antes da falha da RSU0030\./)).toBeInTheDocument();
  });

  it("no mapa de risco potencial: o degrau, as 3 componentes e a % acima do limite", async () => {
    falsificarApi();
    abrir(SC20, { separador: "proteger", vistaProteger: "risco" });
    expect(await screen.findByText(/Risco potencial 3 de 5: exposição 57, comportamento não se aplica \(semáforo\), previsão —; 23 % acima do limite\./)).toBeInTheDocument();
  });

  it("no Prever: a previsão daqui a 3 h, ou que não há", async () => {
    falsificarApi();
    abrir(SC20, { separador: "prever" });
    expect(await screen.findByText("Sem previsão para as 23h.")).toBeInTheDocument();
  });

  it.each(["vigiar", "completar", "prever", "proteger"] as const)("no %s tem no máximo 25 palavras, sem as etiquetas obrigatórias", async (separador) => {
    falsificarApi();
    abrir(SC20, { separador });
    await screen.findByText("≈ 3");
    await screen.findByText(/\.$/, { selector: ".popup__linha" });
    expect(contarPalavras(textoVisivel())).toBeLessThanOrEqual(MAX_PALAVRAS_POPUP);
  });

  it("o botão de fechar chama o fecho", async () => {
    falsificarApi();
    const fechar = vi.fn();
    abrir(SC20, {}, fechar);
    await userEvent.click(await screen.findByRole("button", { name: "Fechar o pop-up" }));
    expect(fechar).toHaveBeenCalled();
  });
});

describe("pop-up da RSU", () => {
  it("diz a falha de rede e junta os sensores por estado", async () => {
    falsificarApi();
    abrir(RSU30, { separador: "vigiar" });
    expect(await screen.findByText(/Falha de rede desde 04\/11 20h06\./)).toBeInTheDocument();
    const lista = screen.getByRole("list", { name: "Sensores da RSU0030" });
    expect(lista).toHaveTextContent("Falha de redeSC0019–0022, 11165 e 11166, Estac.");
    expect(contarPalavras(textoVisivel())).toBeLessThanOrEqual(MAX_PALAVRAS_POPUP);
  });

  it("diz a mesma hora do cartão do incidente (20h06), seja qual for a ordem das falhas na API", async () => {
    falsificarApi({ "/vigiar/falhas": ok([...FALHAS].reverse()) });
    abrir(RSU30, { separador: "vigiar" });
    expect(await screen.findByText("Falha de rede desde 04/11 20h06.")).toBeInTheDocument();
  });
});

describe("pop-up do próximo sensor (ADR-0033, ponto 5)", () => {
  it("diz «Redução potencial estimada: X (hipótese)», a distância ao vizinho e o aviso do local", async () => {
    const sc16 = { ...SENSORES[1], id: `${U}SmartCrosswalk:0016`, nome: "Rua X", lon: -8.65, lat: 40.64 };
    falsificarApi({ "/sensores": ok([...SENSORES, sc16]) });
    abrir(sc16.id, { separador: "completar", proximo: true });
    expect(await screen.findByText("Redução potencial estimada: 0,34 (hipótese)")).toBeInTheDocument();
    expect(screen.getByText("1.º")).toBeInTheDocument();
    expect(screen.getByText("Vizinho mais próximo a 121 m.")).toBeInTheDocument();
    expect(screen.getByText(/A atividade subiu 2,7 vezes: o erro pode vir daí\./)).toBeInTheDocument();
    expect(contarPalavras(textoVisivel())).toBeLessThanOrEqual(MAX_PALAVRAS_POPUP);
  });
});

describe("cabeçalho do pop-up", () => {
  const cabecalho = () => screen.getByRole("dialog").querySelector("header.popup__cabecalho") as HTMLElement;

  it("tem o título completo e o ✕ na 1.ª linha, e por baixo o tipo e os badges, com «às escuras» no cabeçalho e não no corpo", async () => {
    falsificarApi();
    abrir(SC20, { separador: "vigiar" });
    await screen.findByText("≈ 3");
    const cab = cabecalho();
    const linha1 = cab.querySelector(".popup__titulo") as HTMLElement;
    const linha2 = cab.querySelector(".popup__meta") as HTMLElement;
    expect(linha1).toHaveTextContent("SC0020 · Rua Dom Afonso V");
    expect(linha1.querySelector("button")).toHaveAccessibleName("Fechar o pop-up");
    expect(linha2).toHaveTextContent("passadeira");
    expect(linha2.querySelector(".estado-sensor--falha-rede")).toHaveTextContent("Falha de rede");
    const badges = [...linha2.querySelectorAll(".popup__etiqueta")].map((e) => e.textContent);
    expect(badges).toEqual(["estimado", "às escuras"]);
    expect(screen.getAllByText("às escuras")).toHaveLength(1);   // só no cabeçalho, já não no corpo
  });

  it("no Completar o estado já é «Estimado»: não repete o badge «estimado»", async () => {
    falsificarApi();
    abrir(SC20, { separador: "completar" });
    await screen.findByText("Erro esperado 0,32.");
    const meta = cabecalho().querySelector(".popup__meta") as HTMLElement;
    expect(meta.querySelector(".estado-sensor--estimado")).toHaveTextContent("Estimado");
    expect([...meta.querySelectorAll(".popup__etiqueta")].map((e) => e.textContent)).toEqual(["às escuras"]);
  });

  it("não corta um título comprido: o nome da rua vem inteiro no cabeçalho", async () => {
    const comprido = { ...SENSORES[1], id: `${U}SmartCrosswalk:0016`, nome: "Avenida Doutor Lourenço Peixinho, junto ao Largo do Rossio", lon: -8.65, lat: 40.64 };
    falsificarApi({ "/sensores": ok([...SENSORES, comprido]) });
    abrir(comprido.id, { separador: "vigiar" });
    await screen.findByText("Sem falha a esta hora.");
    expect(cabecalho().querySelector(".popup__nome")).toHaveTextContent("SC0016 · Avenida Doutor Lourenço Peixinho, junto ao Largo do Rossio");
  });

  it("na RSU: o título e o ✕ na 1.ª linha, e «RSU» e o estado na 2.ª", async () => {
    falsificarApi();
    abrir(RSU30, { separador: "vigiar" });
    await screen.findByText(/Falha de rede desde 04\/11 20h06\./);
    const cab = cabecalho();
    expect(cab.querySelector(".popup__titulo")).toHaveTextContent("RSU0030");
    expect(cab.querySelector(".popup__titulo button")).toHaveAccessibleName("Fechar o pop-up");
    expect(cab.querySelector(".popup__meta")).toHaveTextContent("RSU");
    expect(cab.querySelector(".popup__meta .estado-sensor--falha-rede")).toHaveTextContent("Falha de rede");
  });
});
