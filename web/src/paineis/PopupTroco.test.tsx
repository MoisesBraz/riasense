/**
 * O pop-up de um troço (segmento) no ① Vigiar: os veículos medidos nesta hora e o sensor (ADR-0034), o limite da via e a parte
 * acima dele, e a ressalva do radar (ADR-0039). Nunca «nem pelo radar»; «1 veículo medido», no singular.
 */
import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { limparCache } from "../api/useRecurso";
import { EstadoDemoProvider } from "../estado/estado";
import { falsificarApi, ok } from "../test/apiFalsa";
import { DetalheVigiar } from "./PainelVigiar";

vi.mock("../componentes/mapa/Mapa", () => ({ Mapa: () => <div data-testid="mapa" /> }));

const RADAR = "urn:ngsi-ld:RoadSegment:11168";
const CAMARA = "urn:ngsi-ld:RoadSegment:10010";
const SEM_CARROS = "urn:ngsi-ld:RoadSegment:99999"; // sem câmara nem radar: não está nos segmentos dos carros
const linha = (id: string): [number, number][] => [[-8.65, 40.64], [-8.651, 40.641]].map(([x, y]) => [x + id.length * 1e-6, y]) as [number, number][];
// A geometria dos segmentos com câmara ou radar, com o sensor de cada um para a semana toda (pede-se uma vez por sessão).
const SEGMENTOS = {
  corpo: {
    type: "FeatureCollection",
    features: [RADAR, CAMARA].map((id) => ({ type: "Feature", properties: { id, sensor: id === RADAR ? "Radar" : "Camera" }, geometry: { type: "LineString", coordinates: linha(id) } })),
  },
};
const hora = (id: string, sensor: "Camera" | "Radar", veiculos: number, acima: number, limite = 30) => ({
  id, t: "2026-11-04T20:00:00", sensor, veiculos, vel_media_ms: 8, limite_kmh: limite, acima_limite: acima, velocidades_kmh: [25],
});

async function abrir(id: string, passagens: unknown[]) {
  limparCache(); // a mesma hora pede o mesmo URL: sem isto, a 2.ª abertura do mesmo teste vinha da cache
  falsificarApi({ "/mapa/carros": ok(passagens), "/mapa/segmentos-carros": SEGMENTOS });
  render(
    <EstadoDemoProvider>
      <DetalheVigiar id={id} onFechar={() => {}} />
    </EstadoDemoProvider>,
  );
  return screen.findByRole("dialog");
}

describe("o pop-up do troço (ADR-0034, ADR-0039)", () => {
  it("diz os veículos medidos nesta hora e o sensor, o limite da via e a parte acima dele", async () => {
    await abrir(RADAR, [hora(RADAR, "Radar", 42, 16)]);
    expect(await screen.findByText("42 veículos medidos nesta hora, pelo radar.")).toBeInTheDocument();
    expect(screen.getByText(/Limite da via: 30 km\/h; 38 % dos veículos medidos acima dele nesta hora\./)).toBeInTheDocument();
  });

  it("num troço medido pelo radar, acrescenta que o excesso não é comparável entre sensores; pela câmara, não", async () => {
    await abrir(RADAR, [hora(RADAR, "Radar", 42, 16)]);
    expect(await screen.findByText("O radar e a câmara medem velocidades diferentes: o excesso não é comparável entre sensores.")).toBeInTheDocument();
    document.body.innerHTML = "";
    await abrir(CAMARA, [hora(CAMARA, "Camera", 120, 6, 50)]);
    expect(await screen.findByText("120 veículos medidos nesta hora, pela câmara.")).toBeInTheDocument();
    expect(screen.queryByText(/não é comparável entre sensores/)).toBeNull();
  });

  it("1 veículo medido, no singular", async () => {
    await abrir(CAMARA, [hora(CAMARA, "Camera", 1, 0, 50)]);
    expect(await screen.findByText("1 veículo medido nesta hora, pela câmara.")).toBeInTheDocument();
  });

  it("sem passagens nesta hora, diz o sensor do troço, e nunca «nem pelo radar»", async () => {
    await abrir(RADAR, []);
    expect(await screen.findByText("Sem veículos medidos nesta hora pelo radar.")).toBeInTheDocument();
    document.body.innerHTML = "";
    await abrir(CAMARA, []);
    expect(await screen.findByText("Sem veículos medidos nesta hora pela câmara.")).toBeInTheDocument();
    expect(document.body.textContent).not.toMatch(/nem pelo radar/);
  });

  it("um troço sem câmara nem radar não fala de veículos medidos", async () => {
    const dialogo = await abrir(SEM_CARROS, []);
    await screen.findByText(/falhas? inesperadas? na semana|Sem falhas inesperadas na semana/);
    expect(dialogo.textContent).not.toMatch(/veículos? medidos?|nem pelo radar/);
  });
});
