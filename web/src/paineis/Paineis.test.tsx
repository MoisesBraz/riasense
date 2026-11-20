/** Painéis com os dados reais da API (ADR-0033, ponto 4): números grandes, «ⓘ», listas que abrem o pop-up e etiquetas. */
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { ReactNode } from "react";
import { describe, expect, it } from "vitest";
import { contarPalavras, ETIQUETAS_OBRIGATORIAS, MAX_PALAVRAS_INFO } from "../dominio/etiquetas";
import { contraReferencia } from "../dominio/prever";
import { EstadoDemoProvider, useEstadoDemo, type EstadoDemo } from "../estado/estado";
import { falsificarApi } from "../test/apiFalsa";
import { INFO_COMPLETAR, PainelCompletar } from "./PainelCompletar";
import { INFO_PREVER, PainelPrever } from "./PainelPrever";
import { INFO_PROTEGER, PainelProteger } from "./PainelProteger";
import { INFO_RISCO, PainelRisco } from "./PainelRisco";
import { INFO_VIGIAR } from "./PainelVigiar";
import { GraficoEfeito } from "../componentes/graficos/GraficoEfeito";

const comEstado = (filhos: ReactNode, inicial: Partial<EstadoDemo> = {}) =>
  render(<EstadoDemoProvider inicial={inicial}>{filhos}</EstadoDemoProvider>);

/** Mostra o pop-up pedido ao mapa: o painel não desenha o mapa, mas o estado diz o que ele vai mostrar. */
function Sonda() {
  const { estado } = useEstadoDemo();
  return <output data-testid="sonda">{JSON.stringify(estado.popup)}</output>;
}

describe("painéis curtos (ADR-0033, ponto 4)", () => {
  it.each([
    ["Vigiar", INFO_VIGIAR],
    ["Completar", INFO_COMPLETAR],
    ["Prever", INFO_PREVER],
    ["Proteger", INFO_PROTEGER],
    ["Risco potencial", INFO_RISCO],
  ])("o «ⓘ» do %s tem no máximo 40 palavras, sem as etiquetas obrigatórias", (_nome, info) => {
    expect(contarPalavras(info)).toBeLessThanOrEqual(MAX_PALAVRAS_INFO);
  });

  it("o «ⓘ» abre e fecha a nota, e o título não tem fórmula por baixo", async () => {
    falsificarApi();
    comEstado(<PainelCompletar />);
    expect(document.querySelector(".pergunta__texto")).toBeNull();
    const botao = screen.getByRole("button", { name: "Sobre este separador" });
    await userEvent.click(botao);
    expect(botao).toHaveAttribute("aria-expanded", "true");
    expect(screen.getByRole("note")).toHaveTextContent(/o treino não teve sábados nem domingos/);
    await userEvent.click(botao);
    expect(screen.queryByRole("note")).not.toBeInTheDocument();
  });

  it("os cartões de validação saem da app", async () => {
    falsificarApi();
    comEstado(
      <>
        <PainelCompletar />
        <PainelPrever />
      </>,
    );
    await screen.findByText("Erro do sensor virtual");
    expect(screen.queryByRole("heading", { name: "Erro ao deixar um sensor de fora" })).not.toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: /Contra a referência/ })).not.toBeInTheDocument();
    expect(screen.queryByText(/Ganha|Fora/)).not.toBeInTheDocument();
  });
});

describe("as etiquetas obrigatórias ficam com o texto exato (ADR-0033, ponto 4)", () => {
  it("o risco potencial diz «não mede acidentes»", async () => {
    falsificarApi();
    comEstado(<PainelRisco />);
    expect(await screen.findByText("Risco potencial · não mede acidentes")).toBeInTheDocument();
  });

  it("o próximo sensor diz «redução potencial estimada» e «hipótese»", async () => {
    falsificarApi();
    comEstado(<PainelCompletar />);
    await userEvent.click(await screen.findByRole("button", { name: "Onde pôr o próximo sensor" }));
    expect(await screen.findByText(/redução potencial estimada do erro \(hipótese\)/)).toBeInTheDocument();
    expect(screen.getByText("Hipótese")).toBeInTheDocument();
  });

  it("o valor do sensor virtual diz «estimado»", async () => {
    falsificarApi();
    comEstado(<PainelCompletar />, { hora: Date.parse("2026-11-04T20:00Z") });
    expect(await screen.findByText(/^estimado · 80 %/)).toBeInTheDocument();
  });

  it("todas as etiquetas obrigatórias existem e não contam palavras", () => {
    for (const e of ETIQUETAS_OBRIGATORIAS) expect(contarPalavras(e)).toBe(0);
  });
});

describe("mapa de risco potencial com dados", () => {
  it("diz quantos pontos estão nos degraus 4 e 5 e quantos são estimados", async () => {
    falsificarApi();
    comEstado(<PainelRisco />);
    expect(await screen.findByText("Degrau 4 ou 5")).toBeInTheDocument();
    expect(screen.getByText("Degrau 4 ou 5").closest(".kpi")).toHaveTextContent("Degrau 4 ou 52de 5 passadeiras às 20h");
    expect(screen.getByText("Estimados").closest(".kpi")).toHaveTextContent("Estimados4");
  });

  it("ordena os pontos por risco potencial e marca os estimados", async () => {
    falsificarApi();
    comEstado(<PainelRisco />);
    const lista = await screen.findByRole("list", { name: "Pontos por risco potencial" });
    const itens = within(lista).getAllByRole("listitem");
    expect(itens[0]).toHaveTextContent("SC0013 · com semáforo");
    expect(within(itens[0]).getByRole("img", { name: "risco potencial 5 de 5" })).toBeInTheDocument();
    expect(itens[1]).toHaveTextContent("estimado");
  });

  it("clicar num ponto da lista abre o pop-up dele e pede ao mapa para centrar", async () => {
    falsificarApi();
    comEstado(
      <>
        <PainelRisco />
        <Sonda />
      </>,
    );
    await userEvent.click(await screen.findByRole("button", { name: /SC0013 · com semáforo/ }));
    expect(screen.getByTestId("sonda")).toHaveTextContent(JSON.stringify({ id: "urn:ngsi-ld:SmartCrosswalk:0013", centrar: true }));
  });

  it("no gráfico, a passadeira com semáforo diz «semáforo» em vez de assinalada (ADR-0024)", async () => {
    falsificarApi();
    comEstado(<PainelProteger />);
    const linha = (await screen.findByRole("rowheader", { name: "SC0020" })).closest("tr")!;
    expect(within(linha).getByText("semáforo")).toBeInTheDocument();
    expect(within(linha).queryByRole("img", { name: "assinalada" })).toBeNull();
    const sc0021 = screen.getByRole("rowheader", { name: "SC0021" }).closest("tr")!;
    expect(within(sc0021).getByRole("img", { name: "assinalada" })).toBeInTheDocument();
  });
});

describe("onde pôr o próximo sensor", () => {
  it("o botão mostra só as passadeiras com redução ≥ 0,01, numeradas, e os «verificar o sensor» à parte", async () => {
    falsificarApi();
    comEstado(<PainelCompletar />, { hora: Date.parse("2026-11-08T12:00Z") });
    const botao = await screen.findByRole("button", { name: "Onde pôr o próximo sensor" });
    expect(botao).toHaveAttribute("aria-pressed", "false");
    await userEvent.click(botao);
    expect(botao).toHaveAttribute("aria-pressed", "true");
    const lista = await screen.findByRole("list", { name: "Onde pôr o próximo sensor" });
    expect(within(lista).getAllByRole("listitem").map((li) => li.textContent)).toEqual(["1SC00160,34", "2SC00240,28"]);
    expect(screen.getByRole("list", { name: "Verificar o sensor" })).toHaveTextContent("SC0023");
  });

  it("antes do dia em que se mede a queda, o «verificar o sensor» ainda não aparece", async () => {
    falsificarApi();
    comEstado(<PainelCompletar />, { hora: Date.parse("2026-11-05T12:00Z") });
    await userEvent.click(await screen.findByRole("button", { name: "Onde pôr o próximo sensor" }));
    await screen.findByRole("list", { name: "Onde pôr o próximo sensor" });
    expect(screen.queryByRole("list", { name: "Verificar o sensor" })).not.toBeInTheDocument();
  });
});

describe("comparação com a referência como número grande", () => {
  it("no Completar: o erro do sensor virtual contra o da referência", async () => {
    falsificarApi();
    comEstado(<PainelCompletar />);
    const kpi = (await screen.findByText("Erro do sensor virtual")).closest(".kpi")!;
    expect(kpi).toHaveTextContent("0,36");
    expect(kpi).toHaveTextContent("contra 0,62 da referência");
  });

  it("no Completar, fica à vista mesmo com o foco numa passadeira sem sensor virtual (a SC0023)", async () => {
    falsificarApi();
    comEstado(<PainelCompletar />, { foco: "urn:ngsi-ld:SmartCrosswalk:0023" });
    expect(await screen.findByText(/Sem sensor virtual para SC0023/)).toBeInTheDocument();
    const kpi = (await screen.findByText("Erro do sensor virtual")).closest(".kpi")!;
    expect(kpi).toHaveTextContent("0,36");
    expect(kpi).toHaveTextContent("contra 0,62 da referência");
  });

  it("no Prever: quanto menos erra do que a referência, e quantos tipos ganham (sem «Ganha» nem «Fora»)", async () => {
    falsificarApi();
    comEstado(<PainelPrever />);
    const kpi = (await screen.findByText("Menos erro do que a referência")).closest(".kpi")!;
    // A avaliação a 3 h (ADR-0027): 0,557 contra a referência 0,617 e a persistência 0,72.
    expect(kpi).toHaveTextContent("10 %");
    expect(kpi).toHaveTextContent("passadeiras: 0,56 contra 0,62");
    expect(screen.getByText("Menos erro do que a persistência").closest(".kpi")).toHaveTextContent("23 %");
    // A 1 h é só avaliação (ADR-0027, ponto 3): a linha de 1 h dos dados não entra nos números nem nos tipos.
    expect(screen.getByText("Tipos de sensor com previsão").closest(".kpi")).toHaveTextContent("1 de 1");
    expect(screen.queryByText(/0,42/)).not.toBeInTheDocument();
  });

  it("no Prever, com a avaliação com horizontes e persistência, mostra também a persistência a 1 h", () => {
    const linhas = [
      { horizonte_h: 1, tipo: "passadeira", erro_referencia: 0.6, erro_persistencia: 0.5, erro_sem_meteo: 0.4, erro_com_meteo: 0.45, meteo_melhora: false, ganha: true },
      { horizonte_h: 3, tipo: "passadeira", erro_referencia: 0.6, erro_persistencia: 0.7, erro_sem_meteo: 0.55, erro_com_meteo: 0.5, meteo_melhora: true, ganha: false },
    ];
    expect(contraReferencia(linhas, "passadeira", 1)).toMatchObject({ erro: 0.4, persistencia: 0.5, ganham: 1, tipos: 1 });
    expect(contraReferencia(linhas, "passadeira", 1)?.menosQuePersistencia).toBeCloseTo(0.2);
    expect(contraReferencia(linhas, "passadeira", 3)).toMatchObject({ erro: 0.5, ganham: 0 });
  });
});

describe("o ícone do tipo em cada linha dos painéis", () => {
  const passadeira = (el: HTMLElement) => within(el).getByRole("img", { name: "Passadeira" });
  const semVerde = (el: HTMLElement) => {
    expect(el.querySelector(".distintivo--neutro")).not.toBeNull();
    expect(el.querySelector(".distintivo--ativo, .distintivo__estado")).toBeNull(); // só o tipo, sem o verde nem o símbolo da falha
  };

  it("② Completar: «Onde pôr o próximo sensor» e «Verificar o sensor» levam o ícone da passadeira antes do nome", async () => {
    falsificarApi();
    comEstado(<PainelCompletar />, { hora: Date.parse("2026-11-08T12:00Z") });
    await userEvent.click(await screen.findByRole("button", { name: "Onde pôr o próximo sensor" }));
    for (const nome of ["Onde pôr o próximo sensor", "Verificar o sensor"]) {
      const lista = await screen.findByRole("list", { name: nome });
      for (const li of within(lista).getAllByRole("listitem")) {
        within(li).getByRole("button");
        // O ícone fica junto ao nome: o que vem à frente (a posição, o «Atenção») fica antes dele, e o nome logo a seguir.
        const icone = passadeira(li).closest(".icone-tipo");
        expect(icone?.nextElementSibling?.tagName).toBe("STRONG");
        semVerde(li);
      }
    }
  });

  it("② Completar: o título do cartão da série («SC0020 · travessias por hora») leva o ícone da passadeira", async () => {
    falsificarApi();
    comEstado(<PainelCompletar />);
    const titulo = await screen.findByRole("heading", { name: /SC0020 · travessias por hora/ });
    passadeira(titulo);
  });

  it("③ Prever: o círculo neutro deu lugar ao ícone da passadeira", async () => {
    falsificarApi();
    comEstado(<PainelPrever />, { hora: Date.parse("2026-11-08T08:00Z") });
    const lista = await screen.findByRole("list", { name: "Passadeiras com mais travessias previstas" });
    for (const li of within(lista).getAllByRole("listitem")) {
      passadeira(li);
      semVerde(li);
      expect(li.querySelector(".marcador--neutro")).toBeNull();
    }
  });

  it("④ Proteger: o gráfico põe o ícone antes de cada «SC00NN», decorativo (o cabeçalho da coluna diz «Passadeira»), e o «Placebo» fica sem ícone", async () => {
    falsificarApi();
    comEstado(<PainelProteger />, { foco: "urn:ngsi-ld:SmartCrosswalk:0020" });
    const linha = (await screen.findByRole("rowheader", { name: "SC0020" })).closest("tr")!;
    expect(linha.querySelector("th .icone-tipo")).toHaveAttribute("aria-hidden", "true");
    expect(linha.querySelector("th .icone-tipo svg")).not.toBeNull();
    const placebo = screen.queryByRole("rowheader", { name: "Placebo" });
    if (placebo) expect(placebo.querySelector(".icone-tipo")).toBeNull();
  });

  it("④ Proteger: uma linha «Placebo» não é um sensor e não leva ícone", () => {
    render(
      <GraficoEfeito
        unidade="km/h"
        linhas={[
          { id: "urn:ngsi-ld:SmartCrosswalk:0020", rotulo: "SC0020", efeito: -0.2, inf: -0.4, sup: 0, assinalada: false },
          { id: "urn:ngsi-ld:SmartCrosswalk:0020", rotulo: "Placebo", efeito: 0.1, inf: -0.2, sup: 0.4, assinalada: false, placebo: true },
        ]}
      />,
    );
    expect(screen.getByRole("rowheader", { name: "SC0020" }).querySelector(".icone-tipo")).not.toBeNull();
    expect(screen.getByRole("rowheader", { name: "Placebo" }).querySelector(".icone-tipo")).toBeNull();
  });

  it("④ Risco: a ordem é degrau, ícone da passadeira e nome", async () => {
    falsificarApi();
    comEstado(<PainelRisco />);
    const lista = await screen.findByRole("list", { name: "Pontos por risco potencial" });
    for (const li of within(lista).getAllByRole("listitem")) {
      const icone = passadeira(li).closest(".icone-tipo");
      // Degrau → ícone → nome: o ícone fica junto ao nome.
      expect(icone?.previousElementSibling).toBe(li.querySelector(".degrau"));
      expect(icone?.nextElementSibling?.tagName).toBe("STRONG");
      semVerde(li);
    }
  });
});
