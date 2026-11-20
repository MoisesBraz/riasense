/** O boletim de segurança pedonal para a Câmara (ADR-0052): os avisos, o top 3, a zona, os semáforos e o botão da ④. */
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { ReactNode } from "react";
import { describe, expect, it, vi } from "vitest";
import { App } from "../App";
import type { Boletim } from "../api/tipos";
import { falsificarApi, ok } from "../test/apiFalsa";
import { AVISOS_BOLETIM, BoletimCamara, RESSALVA_RADAR_CAMARA } from "./BoletimCamara";

vi.mock("../componentes/mapa/Mapa", () => ({
  Mapa: (props: { conteudoPopup: ReactNode }) => <div data-testid="mapa">{props.conteudoPopup}</div>,
}));

const U = "urn:ngsi-ld:SmartCrosswalk:";
const S = "urn:ngsi-ld:RoadSegment:";
/** Os valores de hoje do `/proteger/boletim` (ADR-0052), com um semáforo inventado na 3.ª para ver a frase. */
const BOLETIM: Boletim = {
  top: [
    { id: `${U}0002`, risco_medio: 0.7949, horas_medidas: 164, horas: 164, semaforo: false },
    { id: `${U}0019`, risco_medio: 0.7788, horas_medidas: 29, horas: 164, semaforo: false },
    { id: `${U}0007`, risco_medio: 0.7513, horas_medidas: 164, horas: 164, semaforo: true },
  ],
  zona: {
    passadeiras: ["0019", "0020", "0021", "0022"].map((p) => U + p),
    com_dados: 4,
    acima_limite_movimentados: [22.756, 23.77],
    acima_limite_calmos: [32.98, 36.93],
    radar: [
      { segmento: `${S}10084`, passadeiras: 4 },
      { segmento: `${S}11168`, passadeiras: 4 },
    ],
  },
  semaforos: ["0011", "0012", "0013", "0020", "0021"].map((p) => U + p),
};

const abrir = async (boletim: Boletim = BOLETIM) => {
  falsificarApi({ "/proteger/boletim": ok([boletim]) });
  render(<BoletimCamara />);
  return screen.findByRole("table");
};

describe("a página do boletim (ADR-0052)", () => {
  it("o cabeçalho tem os 2 avisos obrigatórios, com o texto exato (ponto 3)", async () => {
    await abrir();
    expect(screen.getByRole("heading", { level: 1, name: "Boletim de segurança pedonal para a Câmara" })).toBeInTheDocument();
    expect(within(screen.getByRole("list", { name: "Avisos" })).getAllByRole("listitem").map((l) => l.textContent)).toEqual([
      "Risco potencial estimado — não substitui registo oficial de sinistralidade (BEAV)",
      "Semana de dados de 03 a 10/11/2026",
    ]);
    expect(AVISOS_BOLETIM).toHaveLength(2);
  });

  it("o top 3 diz o risco médio, o semáforo e as horas medidas, com a ressalva do ADR-0024", async () => {
    const tabela = await abrir();
    const linhas = within(tabela).getAllByRole("row").slice(1).map((r) => [...r.children].map((c) => c.textContent));
    expect(linhas).toEqual([
      [expect.stringMatching(/^SC0002/), "0,79", "Não", "164 de 164"],
      [expect.stringMatching(/^SC0019/), "0,78", "Não", "29 de 164, as outras estimadas"],
      [expect.stringMatching(/^SC0007/), "0,75", "Sim: o risco usa os pesos do ADR-0024", "164 de 164"],
    ]);
  });

  it("a zona: do menor ao maior das 4 passadeiras, arredondados às unidades, com o aviso da hora e a ressalva do radar", async () => {
    await abrir();
    const zona = screen.getByRole("region", { name: /Veículos acima do limite da via na zona das passadeiras SC0019 a SC0022/ });
    expect(zona).toHaveTextContent("23–24 % nos intervalos de 15 min com mais travessias, e 33–37 % nos com menos, sobretudo à noite.");
    expect(zona).toHaveTextContent("A comparação não desconta a hora.");
    expect(zona).toHaveTextContent("É um valor da zona, e não quatro medidas independentes");
    expect(zona).toHaveTextContent(`Medido pela câmara e pelo radar (os segmentos 10084 e 11168, nas quatro passadeiras). ${RESSALVA_RADAR_CAMARA}`);
    expect(zona).toHaveTextContent("Fala-se por passadeira ou por zona, nunca por rua.");
  });

  it("um segmento do radar que não entra em todas as passadeiras não leva «nas quatro»", async () => {
    await abrir({ ...BOLETIM, zona: { ...BOLETIM.zona, radar: [{ segmento: `${S}10084`, passadeiras: 3 }] } });
    expect(screen.getByRole("region", { name: /Veículos acima do limite/ })).toHaveTextContent("Medido pela câmara e pelo radar (o segmento 10084).");
  });

  it("as passadeiras com semáforo, com a fonte por validar", async () => {
    await abrir();
    expect(screen.getByRole("region", { name: "3. Passadeiras com semáforo" })).toHaveTextContent(
      "SC0011, SC0012, SC0013, SC0020 e SC0021. Ficam fora da anomalia de abrandamento (ADR-0024). Fonte: OpenStreetMap, por validar com a Câmara.",
    );
  });

  it("o botão imprime pela impressão do browser, que guarda em PDF", async () => {
    await abrir();
    const imprimir = vi.spyOn(window, "print").mockImplementation(() => {});
    await userEvent.click(screen.getByRole("button", { name: "Imprimir ou guardar em PDF" }));
    expect(imprimir).toHaveBeenCalledOnce();
    imprimir.mockRestore();
  });
});

describe("o botão na ④ Proteger (ADR-0052, ponto 1)", () => {
  it("«Exportar boletim da Câmara» abre a página para imprimir noutro separador, nas 2 vistas", async () => {
    falsificarApi();
    render(<App />);
    await userEvent.click(screen.getByRole("tab", { name: /proteger/i }));
    const ligacao = await screen.findByRole("link", { name: "Exportar boletim da Câmara" });
    expect(ligacao).toHaveAttribute("href", "?boletim");
    expect(ligacao).toHaveAttribute("target", "_blank");
    await userEvent.click(screen.getByRole("button", { name: "Mapa de risco potencial", pressed: false }));
    expect(screen.getByRole("link", { name: "Exportar boletim da Câmara" })).toHaveAttribute("href", "?boletim");
  });
});
