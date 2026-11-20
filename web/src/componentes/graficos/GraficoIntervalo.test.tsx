/** O gráfico de intervalo da ②: medido contínuo, estimado tracejado, intervalo de 80 %, fim de semana, falha e cursor. */
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { serieVirtual, travessiasPorHora } from "../../dominio/completar";
import { lerInstante } from "../../dominio/tempo";
import { INTERVALOS, VIRTUAIS } from "../../test/dados";
import { GraficoIntervalo, maximoDoEixo } from "./GraficoIntervalo";

const SC0020 = "urn:ngsi-ld:SmartCrosswalk:0020";
const DOMINIO: [number, number] = [lerInstante("2026-11-03T15:00"), lerInstante("2026-11-10T11:00")];

function desenhar(hora = lerInstante("2026-11-04T20:00"), virtuais = serieVirtual(VIRTUAIS, SC0020)) {
  return render(
    <GraficoIntervalo
      rotulo="SC0020"
      reais={travessiasPorHora(INTERVALOS)}
      virtuais={virtuais}
      inicioFalha={lerInstante("2026-11-04T20:07:25")}
      hora={hora}
      dominio={DOMINIO}
    />,
  );
}

const serie = (nome: string) => document.querySelectorAll(`[data-serie="${nome}"]`);

describe("gráfico de intervalo da ②", () => {
  it("desenha o medido a cheio e o estimado a tracejado, com a faixa do intervalo", () => {
    desenhar();
    expect(serie("real")).toHaveLength(1);
    expect(serie("virtual")).toHaveLength(1);
    expect(serie("virtual")[0]).toHaveAttribute("stroke-dasharray");
    expect(serie("real")[0]).not.toHaveAttribute("stroke-dasharray");
    expect(serie("intervalo")).toHaveLength(1);
  });

  it("sombreia o fim de semana e marca o início da falha e a hora do cursor", () => {
    desenhar();
    expect(serie("fim-de-semana")).toHaveLength(1);
    expect(screen.getByText("fim de semana")).toBeInTheDocument();
    expect(serie("falha")).toHaveLength(1);
    expect(serie("cursor")).toHaveLength(1);
  });

  it("descreve o valor estimado na hora do cursor, sempre com o intervalo", () => {
    desenhar();
    const grafico = screen.getByRole("img", { name: /SC0020 · travessias por hora: 2 h medidas e 5 h estimadas/ });
    expect(grafico).toHaveAccessibleDescription("Às qua 04/11 · 20h: estimado ≈ 3 travessias, intervalo de 80 % de 1 a 7.");
  });

  it("descreve o valor medido quando a hora é anterior à falha", () => {
    desenhar(lerInstante("2026-11-04T18:00"));
    expect(screen.getByRole("img")).toHaveAccessibleDescription("Às qua 04/11 · 18h: 39 travessias medidas.");
  });

  it("sem sensor virtual não desenha estimado nem intervalo", () => {
    desenhar(undefined, []);
    expect(serie("virtual")).toHaveLength(0);
    expect(serie("intervalo")).toHaveLength(0);
    expect(serie("real")).toHaveLength(1);
  });

  it("arredonda o topo do eixo para um número legível", () => {
    expect(maximoDoEixo(37)).toBe(40);
    expect(maximoDoEixo(276)).toBe(400);
    expect(maximoDoEixo(0)).toBe(10);
    expect(maximoDoEixo(1000)).toBe(1000);
  });
});
