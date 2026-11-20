/**
 * O efeito da luz no `Mapa`: depois do 1.º carregamento, a paleta troca-se logo com `setPaintProperty`, mesmo com o
 * `isStyleLoaded()` falso (os carros mudam a fonte a cada fotograma) e numa hora sem mudança de troços (sem `setStyle`).
 */
import { act, fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

const estado = vi.hoisted(() => ({ mapas: [] as FakeMapa[], alturaPopup: 0 }));

interface FakeMapa {
  opcoes: { pitch?: number; maxPitch?: number; touchPitch?: boolean };
  dragRotate: { enable: ReturnType<typeof vi.fn>; disable: ReturnType<typeof vi.fn> };
  touchPitch: { enable: ReturnType<typeof vi.fn>; disable: ReturnType<typeof vi.fn> };
  setMaxPitch: ReturnType<typeof vi.fn>;
  setMaxZoom: ReturnType<typeof vi.fn>;
  easeTo: ReturnType<typeof vi.fn>;
  quando: Record<string, ((...a: unknown[]) => void)[]>;
  umaVez: Record<string, ((...a: unknown[]) => void)[]>;
  setPaintProperty: ReturnType<typeof vi.fn>;
  setLayoutProperty: ReturnType<typeof vi.fn>;
  setStyle: ReturnType<typeof vi.fn>;
}

vi.mock("maplibre-gl", () => {
  class Mapa {
    quando: Record<string, ((...a: unknown[]) => void)[]> = {};
    umaVez: Record<string, ((...a: unknown[]) => void)[]> = {};
    setPaintProperty = vi.fn();
    setLayoutProperty = vi.fn();
    setStyle = vi.fn();
    triggerRepaint = vi.fn();
    touchZoomRotate = { disableRotation: () => {} };
    dragRotate = { enable: vi.fn(), disable: vi.fn() };
    touchPitch = { enable: vi.fn(), disable: vi.fn() };
    setMaxPitch = vi.fn();
    setMaxZoom = vi.fn();
    getBearing = () => 0;
    easeTo = vi.fn();
    opcoes: unknown;
    constructor(opcoes: unknown) {
      this.opcoes = opcoes;
      estado.mapas.push(this as unknown as FakeMapa);
    }
    on(evento: string, a: unknown, b?: unknown) {
      (this.quando[evento] ??= []).push((typeof a === "function" ? a : b) as () => void);
      return this;
    }
    once(evento: string, f: () => void) {
      (this.umaVez[evento] ??= []).push(f);
      return this;
    }
    off(evento: string, f: () => void) {
      this.umaVez[evento] = (this.umaVez[evento] ?? []).filter((g) => g !== f);
      return this;
    }
    isStyleLoaded() {
      return false; // como com os carros a mudar a fonte a cada fotograma
    }
    getLayer() {
      return {};
    }
    getSource() {
      return { setData: () => {} };
    }
    getCanvas() {
      return { style: {} };
    }
    getContainer() {
      return document.createElement("div");
    }
    getZoom() {
      return 17.5;
    }
    queryRenderedFeatures() {
      return [];
    }
    fitBounds() {}
    resize() {}
    remove() {}
  }
  class Marker {
    setLngLat() {
      return this;
    }
    addTo() {
      return this;
    }
    remove() {}
    getElement() {
      return document.createElement("div");
    }
  }
  class Popup {
    el = document.createElement("div");
    setLngLat() {
      return this;
    }
    setDOMContent() {
      return this;
    }
    addTo() {
      return this;
    }
    isOpen() {
      return false;
    }
    getElement() {
      Object.defineProperty(this.el, "offsetHeight", { configurable: true, value: estado.alturaPopup });
      return this.el;
    }
    remove() {}
  }
  return { Map: Mapa, Marker, Popup, addProtocol: () => {}, setWorkerUrl: () => {} };
});
vi.mock("pmtiles", () => ({ Protocol: class { tile = () => {}; } }));
// A camada 3D (ADR-0041) desenha com o Three.js e o WebGL, que o jsdom não tem: aqui só conta que o Mapa a cria.
vi.mock("./camada3d", () => ({ ID_CAMADA_3D: "modelos-3d", Camada3D: class { ativa = false; } }));
vi.mock("./camadaMobiliario", () => ({ ID_CAMADA_MOBILIARIO: "mobiliario-3d", CamadaMobiliario: class { ativa = false; definir() {} } }));

import { INCLINACAO_3D, INCLINACAO_INICIAL, INCLINACAO_MAX, Mapa } from "./Mapa";

const props = {
  marcadores: [],
  enquadrar: null,
  tema: "dark",
  popup: null,
  conteudoPopup: null,
  onSelecionar: () => {},
  onFecharPopup: () => {},
  onRua: () => {},
};

describe("o efeito da luz no Mapa", () => {
  it("antes de o estilo ser lido espera pelo «style.load»; depois, troca a paleta logo, sem setStyle", () => {
    const { rerender } = render(<Mapa {...props} luz="dia" />);
    const m = estado.mapas[estado.mapas.length - 1];
    rerender(<Mapa {...props} luz="crepusculo" />);
    expect(m.setPaintProperty).not.toHaveBeenCalled(); // ainda sem o estilo carregado
    act(() => {
      for (const f of m.umaVez["style.load"] ?? []) f();
    });
    expect(m.setPaintProperty).toHaveBeenCalledWith("fundo", "background-color", expect.anything());
    m.setPaintProperty.mockClear();
    m.setStyle.mockClear();
    // Uma hora sem mudança de troços: só a luz muda, e a paleta troca-se mesmo com o isStyleLoaded() falso.
    rerender(<Mapa {...props} luz="noite" />);
    expect(m.setPaintProperty).toHaveBeenCalledWith("fundo", "background-color", expect.anything());
    expect(m.setStyle).not.toHaveBeenCalled();
  });
});

describe("o tema no Mapa", () => {
  const fundo = (m: FakeMapa) => {
    const estilo = m.setStyle.mock.calls.at(-1)?.[0] as { layers: { id: string; paint?: Record<string, unknown> }[] };
    return estilo.layers.find((l) => l.id === "fundo")?.paint?.["background-color"];
  };

  it("trocar o tema depois de o estilo ser lido muda o mapa, mesmo sem o «load» (que pode não chegar), e sem o remontar", () => {
    const raiz = document.documentElement;
    raiz.style.setProperty("--map-bg-noite", "#0b0f17"); // a noite do tema escuro
    const { rerender } = render(<Mapa {...props} tema="dark" luz="noite" />);
    const m = estado.mapas[estado.mapas.length - 1];
    const mapas = estado.mapas.length;
    act(() => {
      for (const f of m.umaVez["style.load"] ?? []) f(); // o estilo foi lido; o «load» nunca vem
    });
    m.setStyle.mockClear();

    raiz.style.setProperty("--map-bg-noite", "#b1b5bc"); // a noite do tema claro
    rerender(<Mapa {...props} tema="light" luz="noite" />);
    expect(m.setStyle).toHaveBeenCalledTimes(1);
    expect(fundo(m)).toBe("#b1b5bc");

    raiz.style.setProperty("--map-bg-noite", "#0b0f17");
    rerender(<Mapa {...props} tema="dark" luz="noite" />);
    expect(m.setStyle).toHaveBeenCalledTimes(2);
    expect(fundo(m)).toBe("#0b0f17");
    expect(estado.mapas).toHaveLength(mapas); // o mesmo MapLibre: não se remontou
    raiz.style.removeProperty("--map-bg-noite");
  });
});

describe("a vista 3D (ADR-0037)", () => {
  const ultimo = () => estado.mapas[estado.mapas.length - 1];
  const fps = (valor: number) => () => Promise.resolve(valor);

  it("no ecrã largo abre a 25°, com o máximo de 60°; no telemóvel, de cima e sem o botão «3D»", () => {
    const { unmount } = render(<Mapa {...props} largo medir={fps(60)} />);
    expect(ultimo().opcoes).toMatchObject({ pitch: INCLINACAO_INICIAL, maxPitch: INCLINACAO_MAX });
    expect(INCLINACAO_INICIAL).toBe(25);
    expect(INCLINACAO_MAX).toBe(60);
    expect(screen.getByRole("button", { name: "Vista 3D" })).toHaveAttribute("aria-pressed", "false");
    unmount();
    render(<Mapa {...props} largo={false} />);
    expect(ultimo().opcoes).toMatchObject({ pitch: 0 });
    expect(screen.queryByRole("button", { name: "Vista 3D" })).toBeNull();
  });

  it("o «3D» leva a 55° e deixa rodar; o 2.º clique volta aos 25°, com o norte para cima", () => {
    render(<Mapa {...props} largo medir={fps(60)} />);
    const m = ultimo();
    const botao = screen.getByRole("button", { name: "Vista 3D" });
    expect(botao).toHaveAttribute("title", expect.stringMatching(/botão direito/));
    fireEvent.click(botao);
    expect(botao).toHaveAttribute("aria-pressed", "true");
    expect(m.easeTo).toHaveBeenLastCalledWith(expect.objectContaining({ pitch: INCLINACAO_3D }));
    expect(INCLINACAO_3D).toBe(55);
    expect(m.dragRotate.enable).toHaveBeenCalled();
    // O arrasto com o botão direito também inclina: sem isto, o rato não chegava ao céu (ADR-0042, ponto 2).
    expect(m.opcoes).toMatchObject({ pitchWithRotate: true });
    fireEvent.click(botao);
    expect(m.easeTo).toHaveBeenLastCalledWith(expect.objectContaining({ pitch: 25, bearing: 0 }));
    expect(m.dragRotate.disable).toHaveBeenCalled();
  });

  it("com prefers-reduced-motion, a mudança é instantânea, sem animação de câmara", () => {
    vi.stubGlobal("matchMedia", (q: string) => ({ matches: q.includes("reduce"), addEventListener() {}, removeEventListener() {} }));
    render(<Mapa {...props} largo medir={fps(60)} />);
    fireEvent.click(screen.getByRole("button", { name: "Vista 3D" }));
    expect(ultimo().easeTo).toHaveBeenLastCalledWith(expect.objectContaining({ pitch: 55, duration: 0 }));
    vi.unstubAllGlobals();
  });

  it("abaixo de 30 fps, volta à vista de cima e o 3D fica só no botão, mesmo sem o «idle» (que com os carros nunca chega)", async () => {
    const medir = vi.fn(fps(29.7)); // logo abaixo do mínimo: o número fica 29, não 30
    render(<Mapa {...props} largo medir={medir} />);
    const m = ultimo();
    const contentor = screen.getByRole("region", { name: "Mapa da zona" });
    expect(m.umaVez.idle ?? []).toHaveLength(0); // não se espera pelo «idle»
    expect(contentor).not.toHaveAttribute("data-recuo"); // antes da amostra, ainda não há decisão
    await act(async () => {
      for (const f of m.umaVez.load ?? []) f(); // só o «load»
      await Promise.resolve();
    });
    expect(medir).toHaveBeenCalledWith(3000); // uma amostra de 3 s
    // A decisão fica no contentor, para o gravar-demo parar sem gravar.
    expect(contentor).toHaveAttribute("data-recuo", "sim");
    expect(contentor).toHaveAttribute("data-fps", "29");
    expect(m.easeTo).toHaveBeenLastCalledWith(expect.objectContaining({ pitch: 0, bearing: 0 }));
    fireEvent.click(screen.getByRole("button", { name: "Vista 3D" }));
    expect(m.easeTo).toHaveBeenLastCalledWith(expect.objectContaining({ pitch: 55 }));
  });

  it("com 30 fps ou mais, fica a 25°", async () => {
    render(<Mapa {...props} largo medir={fps(30)} />);
    const m = ultimo();
    await act(async () => {
      for (const f of m.umaVez.load ?? []) f();
      await Promise.resolve();
    });
    expect(m.easeTo).not.toHaveBeenCalled();
    const contentor = screen.getByRole("region", { name: "Mapa da zona" });
    expect(contentor).toHaveAttribute("data-recuo", "nao");
    expect(contentor).toHaveAttribute("data-fps", "30");
  });

  it("no telemóvel não inclina, nem com 2 dedos: o máximo é 0° e o gesto de inclinar fica desligado", () => {
    render(<Mapa {...props} largo={false} />);
    const m = ultimo();
    expect(m.opcoes).toMatchObject({ pitch: 0, maxPitch: 0, touchPitch: false });
    expect(m.setMaxPitch).toHaveBeenLastCalledWith(0);
    expect(m.touchPitch.disable).toHaveBeenCalled();
  });

  it("no ecrã largo, o gesto de inclinar fica ligado e o máximo é 60°", () => {
    render(<Mapa {...props} largo medir={fps(60)} />);
    const m = ultimo();
    expect(m.opcoes).toMatchObject({ maxPitch: 60, touchPitch: true });
    expect(m.setMaxPitch).toHaveBeenLastCalledWith(60);
    expect(m.touchPitch.enable).toHaveBeenCalled();
  });
});

describe("a vista aérea (ADR-0045)", () => {
  it("está desligada por omissão; ligada, aparece e escurece de noite", () => {
    const { rerender } = render(<Mapa {...props} />);
    const m = estado.mapas[estado.mapas.length - 1];
    expect(m.setLayoutProperty).not.toHaveBeenCalled(); // antes de o estilo ser lido
    act(() => {
      for (const f of m.umaVez["style.load"] ?? []) f();
    });
    expect(m.setLayoutProperty).toHaveBeenLastCalledWith("vista-aerea", "visibility", "none");
    rerender(<Mapa {...props} vistaAerea luz="noite" />);
    expect(m.setLayoutProperty).toHaveBeenLastCalledWith("vista-aerea", "visibility", "visible");
    expect(m.setPaintProperty).toHaveBeenCalledWith("vista-aerea", "raster-brightness-max", 0.4);
    expect(m.setPaintProperty).toHaveBeenLastCalledWith("edificios-medidos", "fill-extrusion-opacity", 0.3); // só os da zona
  });

  it("na vista 3D, com a fotografia, os edifícios da zona ficam quase sólidos", () => {
    render(<Mapa {...props} largo medir={() => Promise.resolve(60)} vistaAerea />);
    const m = estado.mapas[estado.mapas.length - 1];
    act(() => {
      for (const f of m.umaVez["style.load"] ?? []) f();
    });
    expect(m.setPaintProperty).toHaveBeenLastCalledWith("edificios-medidos", "fill-extrusion-opacity", 0.3);
    fireEvent.click(screen.getByRole("button", { name: "Vista 3D" }));
    expect(m.setPaintProperty).toHaveBeenLastCalledWith("edificios-medidos", "fill-extrusion-opacity", 0.7);
  });
});

describe("o centrar no centro da parte visível do mapa", () => {
  // O mapa a 1440 × 900 com o painel aberto: de y = 80 a 884, com a barra da hora (data-tapa-mapa) por cima, de 795 a 884.
  const caixas = (el: Element) =>
    el.classList.contains("mapa")
      ? { top: 80, bottom: 884, left: 16, right: 988, height: 804, width: 972 }
      : el.getAttribute("data-tapa-mapa") === "pop-up"
        ? { top: 96, bottom: 140, left: 389, right: 615, height: 44, width: 226 }
        : el.hasAttribute("data-tapa-mapa")
        ? { top: 795, bottom: 884, left: 16, right: 988, height: 89, width: 972 }
        : { top: 0, bottom: 0, left: 0, right: 0, height: 0, width: 0 };
  const montar = () => {
    vi.spyOn(Element.prototype, "getBoundingClientRect").mockImplementation(function (this: Element) {
      return { ...caixas(this), x: 0, y: 0, toJSON: () => ({}) } as DOMRect;
    });
    Object.defineProperty(window, "innerHeight", { configurable: true, value: 900 });
    const barra = document.createElement("div");
    barra.setAttribute("data-tapa-mapa", "");
    document.body.appendChild(barra);
    return () => {
      barra.remove();
      vi.restoreAllMocks();
    };
  };
  const popup = { id: "urn:ngsi-ld:SmartCrosswalk:0002", lon: -8.65, lat: 40.63, centrar: true };

  it("sem pop-up no mapa (a lista do ③ no telemóvel abre a folha), o alvo vai para o centro sem a barra da hora", () => {
    const desmontar = montar();
    render(<Mapa {...props} popup={popup} />);
    const m = estado.mapas[estado.mapas.length - 1];
    // O centro do que se vê fica 44,5 px acima do centro do contentor; antes, o alvo ia para o centro do contentor.
    expect(m.easeTo).toHaveBeenCalledWith(expect.objectContaining({ center: [-8.65, 40.63], offset: [0, -44] }));
    desmontar();
  });

  it("com o pop-up preso, o alvo fica no centro se o pop-up cabe, e só desce o que falta para um pop-up alto caber", () => {
    const desmontar = montar();
    estado.alturaPopup = 300;
    const { unmount } = render(<Mapa {...props} popup={popup} conteudoPopup={<p>SC0002</p>} />);
    expect(estado.mapas[estado.mapas.length - 1].easeTo).toHaveBeenCalledWith(expect.objectContaining({ offset: [0, -44] }));
    unmount();
    // O pop-up da RSU0030 (570 px, mais a seta de 20): o alvo fica 602 px abaixo do topo do mapa, e o pop-up cabe em cima.
    estado.alturaPopup = 570;
    render(<Mapa {...props} popup={{ ...popup, id: "urn:ngsi-ld:RoadSideUnit:0030" }} conteudoPopup={<p>RSU0030</p>} />);
    expect(estado.mapas[estado.mapas.length - 1].easeTo).toHaveBeenCalledWith(expect.objectContaining({ offset: [0, 200] }));
    estado.alturaPopup = 0;
    desmontar();
  });

  it("o pop-up preso abre por baixo do selo do ③, e o alvo só desce o que falta", () => {
    const desmontar = montar();
    const selo = document.createElement("div");
    selo.setAttribute("data-tapa-mapa", "pop-up");
    document.body.appendChild(selo);
    estado.alturaPopup = 302;
    render(<Mapa {...props} popup={popup} conteudoPopup={<p>SC0002</p>} />);
    // O topo do pop-up fica em 60 + 12 px do topo do mapa: o alvo em 394, ou seja, 8 px abaixo do centro do contentor (402).
    expect(estado.mapas[estado.mapas.length - 1].easeTo).toHaveBeenCalledWith(expect.objectContaining({ offset: [0, -8] }));
    estado.alturaPopup = 0;
    selo.remove();
    desmontar();
  });
});
