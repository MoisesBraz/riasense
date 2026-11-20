/** Os símbolos do estado do sensor (ADR-0033): o mesmo desenho no marcador, na legenda, no pop-up e nos chips. */
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { NOME_DO_ESTADO, type EstadoSensor } from "../dominio/marcadores";
import { DistintivoAmostra, EstadoComSimbolo, elementoDistintivo, especieDoId, ICONE_DA_FALHA, IconeTipo, NOME_DA_ESPECIE, simboloDoEstado } from "./Simbolos";

const caminho = (el: Element | null) => el?.querySelector("svg path")?.getAttribute("d");

describe("o distintivo do marcador", () => {
  it("a falha de rede leva o círculo do sinal cortado no canto, e a de dispositivo o quadrado do aparelho com aviso", () => {
    const rede = elementoDistintivo("falha-rede", "passadeira");
    const dispositivo = elementoDistintivo("falha-dispositivo", "passadeira");
    const chipRede = rede.querySelector(".distintivo__estado");
    const chipDispositivo = dispositivo.querySelector(".distintivo__estado");
    expect(chipRede?.className).toContain("simbolo-estado--falha-rede");
    expect(chipDispositivo?.className).toContain("simbolo-estado--falha-dispositivo");
    // Diferem no ícone e na forma (círculo ou quadrado), e não só na cor (WCAG 1.4.1).
    expect(caminho(chipRede)).not.toBe(caminho(chipDispositivo));
    expect(rede.className).toContain("distintivo--falha-rede");
    expect(dispositivo.className).toContain("distintivo--falha-dispositivo");
  });

  it("o ícone do tipo está sempre no distintivo: passadeira, zona e RSU", () => {
    const icone = (e: "passadeira" | "zona" | "rsu") => caminho(elementoDistintivo("ativo", e));
    expect(new Set([icone("passadeira"), icone("zona"), icone("rsu")]).size).toBe(3);
  });

  it("a RSU em falha de rede leva o mesmo símbolo da falha de rede", () => {
    const rsu = elementoDistintivo("rsu-falha", "rsu");
    expect(rsu.querySelector(".distintivo__estado")?.className).toContain("simbolo-estado--falha-rede");
  });

  it("ativo, atenção e neutro não levam símbolo no canto (o estado vê-se no preenchimento); o assinalado leva o «!»", () => {
    for (const tipo of ["ativo", "atencao", "neutro", "rsu"] as const) {
      expect(elementoDistintivo(tipo, "passadeira").querySelector(".distintivo__estado, .distintivo__aviso")).toBeNull();
    }
    expect(elementoDistintivo("assinalada", "passadeira").querySelector(".distintivo__aviso")?.textContent).toBe("!");
  });

  it("o estimado é tracejado, na cor da falha que preenche (vermelho por omissão, magenta na de dispositivo)", () => {
    expect(elementoDistintivo("estimado", "passadeira").className).toContain("distintivo--estimado-rede");
    expect(elementoDistintivo("estimado", "passadeira", "dispositivo").className).toContain("distintivo--estimado-dispositivo");
  });

  it("a amostra da legenda é o mesmo distintivo", () => {
    render(<DistintivoAmostra tipo="falha-dispositivo" especie="zona" />);
    expect(document.querySelector(".distintivo-amostra .distintivo--falha-dispositivo .distintivo__estado")).not.toBeNull();
  });
});

describe("os símbolos do estado", () => {
  const ESTADOS: EstadoSensor[] = ["ativo", "atencao", "falha-rede", "falha-dispositivo", "estimado"];

  it("há no máximo 6 símbolos de estado no mapa (os 5 estados mais «sem cobertura», que é a linha da rua)", () => {
    const classes = new Set(ESTADOS.map((e) => simboloDoEstado(e).classe));
    expect(classes.size).toBe(5);
    expect(classes.size + 1).toBeLessThanOrEqual(6);
  });

  it("só as falhas levam ícone, e os dois ícones são diferentes", () => {
    expect(ESTADOS.filter((e) => simboloDoEstado(e).icone).sort()).toEqual(["falha-dispositivo", "falha-rede"]);
    expect(ICONE_DA_FALHA.rede).not.toBe(ICONE_DA_FALHA.dispositivo);
  });

  it.each(ESTADOS)("«%s» diz o nome por extenso ao lado do símbolo", (estado) => {
    render(<EstadoComSimbolo estado={estado} />);
    expect(screen.getByText(NOME_DO_ESTADO[estado])).toBeInTheDocument();
    expect(document.querySelector(".simbolo-estado")?.getAttribute("aria-hidden")).toBe("true");
  });

  it("os nomes das duas falhas são «Falha de rede» e «Falha de dispositivo»", () => {
    expect(NOME_DO_ESTADO["falha-rede"]).toBe("Falha de rede");
    expect(NOME_DO_ESTADO["falha-dispositivo"]).toBe("Falha de dispositivo");
  });
});

describe("o ícone do tipo antes do nome, em todas as linhas", () => {
  it("diz a espécie pelo id, e o estacionamento (que usa o id da RSU) pela espécie dada", () => {
    expect(especieDoId("urn:ngsi-ld:SmartCrosswalk:0020")).toBe("passadeira");
    expect(especieDoId("TouristZone:0006")).toBe("zona");
    expect(especieDoId("urn:ngsi-ld:RoadSideUnit:0030")).toBe("rsu");
    expect(especieDoId("urn:ngsi-ld:RoadSegment:11165")).toBe("segmento");
    expect(especieDoId("Outro:1")).toBeNull();
  });

  it("os 5 tipos têm cada um o seu ícone, e o segmento não é o traço cinzento do «Sem cobertura»", () => {
    const especies = Object.keys(NOME_DA_ESPECIE) as (keyof typeof NOME_DA_ESPECIE)[];
    expect(especies).toHaveLength(5);
    const desenhos = especies.map((e) => caminho(elementoDistintivo("neutro", e)));
    expect(new Set(desenhos).size).toBe(5);
    expect(NOME_DA_ESPECIE.segmento).toBe("Segmento de estrada");
    // Dois nós ligados por um traço: um ícone da família (pontas redondas), e não uma barra de 16×2 px.
    expect(caminho(elementoDistintivo("neutro", "segmento"))).toContain("a2 2");
  });

  it("sem estado é neutro; com falha leva o símbolo e a cor da falha, como no mapa", () => {
    const { container, rerender } = render(<IconeTipo id="urn:ngsi-ld:SmartCrosswalk:0019" />);
    expect(container.querySelector(".distintivo--neutro")).not.toBeNull();
    expect(container.querySelector(".distintivo__estado")).toBeNull();
    rerender(<IconeTipo id="urn:ngsi-ld:SmartCrosswalk:0019" estado="falha-dispositivo" />);
    expect(container.querySelector(".distintivo--falha-dispositivo .distintivo__estado.simbolo-estado--falha-dispositivo")).not.toBeNull();
    rerender(<IconeTipo id="urn:ngsi-ld:RoadSideUnit:0030" estado="falha-rede" />);
    expect(container.querySelector(".distintivo--rsu-falha .simbolo-estado--falha-rede")).not.toBeNull();
    rerender(<IconeTipo especie="estacionamento" estado="falha-rede" />);
    expect(container.querySelector(".distintivo--falha-rede .simbolo-estado--falha-rede")).not.toBeNull();
  });

  it("leva o nome do tipo quando o texto da linha não o diz, e é decorativo quando o diz", () => {
    const { rerender } = render(<IconeTipo id="urn:ngsi-ld:SmartCrosswalk:0019" />);
    expect(screen.getByRole("img", { name: "Passadeira" })).toBeInTheDocument();
    rerender(<IconeTipo id="urn:ngsi-ld:SmartCrosswalk:0019" decorativo />);
    expect(screen.queryByRole("img")).toBeNull();
  });

  it("um id sem ícone (e sem espécie) não desenha nada", () => {
    const { container } = render(<IconeTipo id="Outro:1" />);
    expect(container).toBeEmptyDOMElement();
  });
});
