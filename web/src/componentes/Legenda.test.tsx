/** A legenda (ADR-0048): só o que está no mapa, símbolo e nome curto; «sem cobertura» sempre e o estimado a tracejado. */
import { fireEvent, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { ReactElement } from "react";
import { describe, expect, it } from "vitest";
import type { Separador } from "../estado/estado";
import { EstadoDemoProvider } from "../estado/estado";
import { Camadas } from "./Camadas";
import { Legenda } from "./Legenda";

/** Desenha a legenda e abre-a (começa fechada). */
function abrir(legenda: ReactElement) {
  const r = render(legenda);
  fireEvent.click(screen.getByRole("button", { name: "Legenda" }));
  return r;
}

const SEPARADORES: Separador[] = ["vigiar", "completar", "prever", "proteger"];

describe("legenda do mapa", () => {
  it.each(SEPARADORES)("mostra «sem cobertura» no separador %s", (separador) => {
    abrir(<Legenda separador={separador} vista="abrandamento" />);
    expect(screen.getByText(/^sem cobertura$/i)).toBeInTheDocument();
  });

  it("mostra «sem cobertura» também no mapa de risco potencial", () => {
    abrir(<Legenda separador="proteger" vista="risco" />);
    expect(screen.getByText("Sem cobertura")).toBeInTheDocument();
  });

  it("no mapa de risco potencial mostra os degraus de «Risco potencial», sem frases (a ressalva está no selo do painel)", () => {
    abrir(<Legenda separador="proteger" vista="risco" />);
    expect(screen.getByText("Risco potencial")).toBeInTheDocument();
    expect(screen.getByLabelText(/escala de risco potencial de 1 \(menor\) a 5 \(maior\)/i)).toBeInTheDocument();
    expect(screen.queryByText(/não mede acidentes|exposição, comportamento e previsão/)).toBeNull();
    // Nunca «risco» sozinho (ADR-0007): cada menção de risco leva «potencial».
    const texto = document.body.textContent ?? "";
    expect(texto.match(/risco(?! potencial)/gi)).toBeNull();
  });

  it("marca o estimado a tracejado, com o nome «Estimado», no mapa de risco potencial", () => {
    abrir(<Legenda separador="proteger" vista="risco" />);
    expect(screen.getByText("Estimado").closest("li")?.querySelector(".degrau--estimado")).not.toBeNull();
  });

  it.each(["vigiar", "completar"] as Separador[])(
    "no %s mostra os 6 estados na coluna «Estado», cada um com o símbolo e o nome em texto (ADR-0033)",
    (separador) => {
      abrir(<Legenda separador={separador} vista="abrandamento" />);
      const grupo = screen.getByText("Estado").closest("li")!;
      const amostra = (nome: string) => within(grupo).getByText(nome).closest("li")?.querySelector(".legenda__amostra > *");
      expect(amostra("Ativo")?.className).toContain("simbolo-estado--ativo");
      expect(amostra("Atenção")?.className).toContain("simbolo-estado--atencao");
      expect(amostra("Falha de rede")?.className).toContain("simbolo-estado--falha-rede");
      expect(amostra("Falha de dispositivo")?.className).toContain("simbolo-estado--falha-dispositivo");
      expect(amostra("Estimado")?.className).toContain("simbolo-estado--estimado");
      expect(amostra("Sem cobertura")?.className).toContain("legenda__rua--sem-cobertura");
      expect(within(grupo).getAllByRole("listitem")).toHaveLength(6);
      // As duas falhas distinguem-se também pelo ícone, e não só pela cor (WCAG 1.4.1).
      expect(amostra("Falha de rede")?.querySelector("svg path")?.getAttribute("d")).not.toBe(
        amostra("Falha de dispositivo")?.querySelector("svg path")?.getAttribute("d"),
      );
      expect(amostra("Falha de rede")?.querySelector("svg")).not.toBeNull();
      expect(amostra("Falha de dispositivo")?.querySelector("svg")).not.toBeNull();
    },
  );

  it.each(["vigiar", "completar"] as const)("no %s mostra também a RSU com falha de rede (o halo)", (separador) => {
    abrir(<Legenda separador={separador} vista="abrandamento" />);
    expect(screen.getByText("RSU com falha de rede").closest("li")?.querySelector(".legenda__halo-falha")).not.toBeNull();
  });

  it.each([
    ["vigiar", 5],
    ["completar", 5],
    ["prever", 2],
    ["proteger", 2],
  ] as const)(
    "no %s o grupo «Tipo» tem %i tipos, com o ícone e o nome (os 5 só no Vigiar e no Completar)",
    (separador, n) => {
      abrir(<Legenda separador={separador} vista="abrandamento" />);
      const grupo = screen.getByText("Tipo").closest("li")!;
      expect(within(grupo).getAllByRole("listitem")).toHaveLength(n);
      expect(within(grupo).getByText("Passadeira").closest("li")?.querySelector("svg")).not.toBeNull();
      expect(within(grupo).getByText("RSU").closest("li")?.querySelector("svg")).not.toBeNull();
      for (const nome of ["Zona turística", "Segmento de estrada", "Estacionamento"]) {
        expect(within(grupo).queryByText(nome) !== null).toBe(n === 5);
      }
    },
  );

  it("o segmento leva o ícone dos dois nós ligados por um traço, e não a linha cinzenta do «Sem cobertura»", () => {
    abrir(<Legenda separador="vigiar" vista="abrandamento" />);
    const segmento = within(screen.getByText("Tipo").closest("li")!).getByText("Segmento de estrada").closest("li")!;
    expect(segmento.querySelector("svg")).not.toBeNull();
    expect(segmento.querySelector(".legenda__rua")).toBeNull();
    const semCobertura = within(screen.getByText("Estado").closest("li")!).getByText("Sem cobertura").closest("li")!;
    expect(semCobertura.querySelector(".legenda__rua--sem-cobertura")).not.toBeNull();
  });

  it("no mapa de risco potencial também mostra o tipo (o degrau leva o ícone da passadeira)", () => {
    abrir(<Legenda separador="proteger" vista="risco" />);
    expect(within(screen.getByText("Tipo").closest("li")!).getByText("Passadeira")).toBeInTheDocument();
  });

  it("com o próximo sensor ligado, mostra o alvo («Próximo sensor (hipótese)») e a rua com sensor (as ruas azuis continuam no mapa)", () => {
    abrir(<Legenda separador="completar" vista="abrandamento" proximo />);
    expect(screen.getByText("Próximo sensor (hipótese)").closest("li")?.querySelector(".marcador--proximo")).not.toBeNull();
    expect(screen.getByText("Rua com sensor")).toBeInTheDocument();
  });

  it("no Prever e no Proteger não há verde nem vermelho: os marcadores são neutros (ADR-0033, ponto 2)", () => {
    for (const [separador, vista] of [["prever", "abrandamento"], ["proteger", "abrandamento"]] as const) {
      const { container, unmount } = abrir(<Legenda separador={separador} vista={vista} />);
      expect(container.querySelector(".simbolo-estado, .distintivo--ativo, .distintivo--falha-rede")).toBeNull();
      unmount();
    }
  });

});

describe("a legenda só tem o que está no mapa (ADR-0048, ponto 1)", () => {
  const VISTAS = [
    ["vigiar", "abrandamento", false],
    ["completar", "abrandamento", false],
    ["completar", "abrandamento", true],
    ["prever", "abrandamento", false],
    ["proteger", "abrandamento", false],
    ["proteger", "risco", false],
  ] as const;

  it.each(VISTAS)("no %s (%s, próximo: %s) cada linha é o símbolo e um nome curto, sem frases", (separador, vista, proximo) => {
    const { container } = abrir(<Legenda separador={separador} vista={vista} proximo={proximo} />);
    expect(container.querySelector(".legenda__nota")).toBeNull();
    for (const item of container.querySelectorAll(".legenda__item")) {
      expect(item.querySelector(".legenda__amostra")).not.toBeNull();
      expect(item.textContent!.trim().split(/\s+/).length).toBeLessThanOrEqual(5); // «RSU com falha de rede» é o mais comprido
      expect(item.textContent).not.toMatch(/[.:;]/);
    }
  });

  it.each(SEPARADORES)("no %s mostra os edifícios e o dia ou a noite (ADR-0037, ADR-0040)", (separador) => {
    abrir(<Legenda separador={separador} vista="abrandamento" />);
    expect(screen.getByText("Edifícios").closest("li")?.querySelector(".legenda__edificio")).not.toBeNull();
    expect(screen.getByText("Dia ou noite").closest("li")?.querySelectorAll("svg")).toHaveLength(2); // o sol e a lua
  });

  it("no Vigiar: «Trânsito», «Acima do limite» (o anel) e «Peões 3D»; o que vale cada um está no «ⓘ»", () => {
    abrir(<Legenda separador="vigiar" vista="abrandamento" />);
    expect(screen.getByText("Trânsito").closest("li")?.querySelector(".legenda__carro")).not.toBeNull();
    expect(screen.getByText("Acima do limite").closest("li")?.querySelector(".legenda__carro--excesso")).not.toBeNull();
    expect(screen.getByText("Peões 3D").closest("li")?.querySelector(".legenda__peao")).not.toBeNull();
  });

  it("nos outros separadores não há carros, e por isso não há anel", () => {
    abrir(<Legenda separador="completar" vista="abrandamento" />);
    expect(screen.queryByText("Acima do limite")).toBeNull();
    expect(screen.queryByText("Trânsito")).toBeNull();
  });

  it("os mapas de calor (ADR-0047) têm o seu lugar: «Calor · peões» e «Calor · veículos», de pouco a muito", () => {
    const { unmount } = abrir(<Legenda separador="vigiar" vista="abrandamento" />);
    expect(screen.queryByText(/Calor/)).toBeNull(); // só com a camada ligada
    unmount();
    abrir(<Legenda separador="vigiar" vista="abrandamento" calor={{ peoes: true, veiculos: true }} />);
    expect(screen.getByText("Calor · peões").closest("li")?.querySelector(".legenda__calor--peoes")).not.toBeNull();
    expect(screen.getByText("Calor · veículos").closest("li")?.querySelector(".legenda__calor--veiculos")).not.toBeNull();
    expect(screen.getByText("pouco → muito")).toBeInTheDocument();
  });

  it.each([
    ["completar", "abrandamento", false],
    ["completar", "abrandamento", true],
    ["prever", "abrandamento", false],
    ["proteger", "abrandamento", false],
  ] as const)("a legenda do calor também aparece no %s (vista %s, próximo %s)", (separador, vista, proximo) => {
    abrir(<Legenda separador={separador} vista={vista} proximo={proximo} calor={{ peoes: true, veiculos: false }} />);
    expect(screen.getByText("Calor · peões")).toBeInTheDocument();
  });
});

describe("Camadas e Legenda fechadas por omissão", () => {
  it("a Legenda começa fechada, e abre e fecha com o Enter e o Espaço", async () => {
    render(<Legenda separador="vigiar" vista="abrandamento" />);
    const botao = screen.getByRole("button", { name: "Legenda" });
    expect(botao).toHaveAttribute("aria-expanded", "false");
    expect(screen.getByText("Ativo")).not.toBeVisible();
    botao.focus();
    await userEvent.keyboard("{Enter}");
    expect(botao).toHaveAttribute("aria-expanded", "true");
    expect(screen.getByText("Ativo")).toBeVisible();
    await userEvent.keyboard(" ");
    expect(botao).toHaveAttribute("aria-expanded", "false");
    expect(screen.getByText("Ativo")).not.toBeVisible();
  });

  it("as Camadas começam fechadas, dizem quantas estão ligadas, e abrem e fecham pelo teclado", async () => {
    render(
      <EstadoDemoProvider>
        <Camadas />
      </EstadoDemoProvider>,
    );
    // No ① Vigiar: Sensores, Falhas e Trânsito (ADR-0034), todas ligadas por omissão.
    const botao = screen.getByRole("button", { name: /Camadas · 3/ });
    expect(botao).toHaveAttribute("aria-expanded", "false");
    expect(screen.queryByRole("switch", { name: "Falhas" })).not.toBeInTheDocument();
    botao.focus();
    await userEvent.keyboard(" ");
    expect(screen.getByRole("switch", { name: "Falhas" })).toBeVisible();
    expect(screen.getByRole("switch", { name: "Trânsito" })).toHaveAttribute("aria-checked", "true");
    await userEvent.keyboard("{Enter}");
    expect(screen.queryByRole("switch", { name: "Falhas" })).not.toBeInTheDocument();
  });
});

