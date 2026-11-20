/** O estilo do mapa: as ruas com sensor (ADR-0034), a paleta do fundo por luminosidade (ADR-0040) e a passadeira desenhada (ADR-0038). */
import { afterEach, describe, expect, it, vi } from "vitest";
import { colecoesDasPassadeiras } from "../../dominio/passadeiras";
import {
  aplicarCores,
  CAMADA_PASSADEIRAS,
  CAMADA_PEOES,
  ZOOM_PASSADEIRAS,
  construirEstilo,
  duracaoDaTransicao,
  lerCores,
  OPACIDADE_PONTOS,
  OPACIDADE_PONTOS_3D,
  TRANSICAO_MS,
  variavelDaCor,
  ZOOM_VIVO,
  FONTE_ROTULOS_VIVO,
  type CoresMapa,
} from "./estilo";

const OPCOES = { tiles: "pmtiles://x", glifos: "x/{fontstack}/{range}.pbf", ruas: "r", trocosEmFalha: [] as string[] };

const CORES: CoresMapa = {
  fundo: "#000",
  agua: "#001",
  quarteirao: "#002",
  ruaSensor: "#00f",
  ruaFalha: "#f00",
  carro: "#fff",
  peao: "#36f",
  excesso: "#f0f",
  ruaSemCobertura: "#888",
  rotulo: "#fff",
  halo: "#000",
  passadeiraAsfalto: "#333",
  passadeiraLista: "#eee",
  passeio: "#999",
  ceu: "#123",
  horizonte: "#456",
  realce: "#2b5bff",
};

describe("a rua da pergunta por voz (ADR-0054)", () => {
  it("realça os segmentos com cor, contorno e o nome, para a cor não ser a única pista", () => {
    const segs = ["urn:ngsi-ld:RoadSegment:10084", "urn:ngsi-ld:RoadSegment:11168"];
    const estilo = construirEstilo(CORES, { ...OPCOES, realce: { nome: "Av. 25 de Abril", segmentos: segs } });
    const ids = estilo.layers.map((c) => c.id);
    expect(ids).toEqual(expect.arrayContaining(["rua-realce-contorno", "rua-realce", "rua-realce-nome"]));
    expect(ids.indexOf("rua-realce-contorno")).toBeLessThan(ids.indexOf("rua-realce"));
    const nome = estilo.layers.find((c) => c.id === "rua-realce-nome") as { layout: Record<string, unknown> };
    expect(nome.layout["text-field"]).toBe("Av. 25 de Abril");
  });
  it("sem pergunta, não há camadas de realce", () => {
    expect(construirEstilo(CORES, OPCOES).layers.some((c) => c.id.startsWith("rua-realce"))).toBe(false);
  });
});

describe("o céu da vista 3D (ADR-0042)", () => {
  it("o estilo tem o céu e o horizonte da paleta", () => {
    const estilo = construirEstilo(CORES, OPCOES);
    expect(estilo.sky?.["sky-color"]).toBe("#123");
    expect(estilo.sky?.["horizon-color"]).toBe("#456");
  });
});

describe("estilo do mapa: ruas com sensor", () => {
  it("pinta a vermelho só os troços em falha, e os outros a azul", () => {
    const estilo = construirEstilo(CORES, { tiles: "t", glifos: "g", ruas: "r", trocosEmFalha: ["urn:ngsi-ld:RoadSegment:1"] });
    const camada = estilo.layers.find((c) => c.id === "ruas-com-sensor");
    expect(camada && "paint" in camada && camada.paint).toMatchObject({
      "line-color": ["case", ["in", ["get", "id"], ["literal", ["urn:ngsi-ld:RoadSegment:1"]]], "#f00", "#00f"],
    });
  });

  it("desenha o troço em falha por cima do outro sentido da mesma rua", () => {
    const estilo = construirEstilo(CORES, { tiles: "t", glifos: "g", ruas: "r", trocosEmFalha: ["urn:ngsi-ld:RoadSegment:10368"] });
    const camada = estilo.layers.find((c) => c.id === "ruas-com-sensor");
    expect(camada && "layout" in camada && camada.layout?.["line-sort-key" as never]).toEqual([
      "case",
      ["in", ["get", "id"], ["literal", ["urn:ngsi-ld:RoadSegment:10368"]]],
      1,
      0,
    ]);
  });
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("a paleta do fundo do mapa por luminosidade", () => {
  it("o fundo, a água, os quarteirões, as ruas sem cobertura e os rótulos têm uma variável por luminosidade", () => {
    expect(variavelDaCor("fundo", "dia")).toBe("--map-bg");
    expect(variavelDaCor("fundo", "crepusculo")).toBe("--map-bg-crepusculo");
    expect(variavelDaCor("fundo", "noite")).toBe("--map-bg-noite");
    expect(variavelDaCor("agua", "noite")).toBe("--map-water-noite");
    expect(variavelDaCor("quarteirao", "noite")).toBe("--map-block-noite");
    expect(variavelDaCor("ruaSemCobertura", "noite")).toBe("--map-road-nocoverage-noite");
    expect(variavelDaCor("rotulo", "crepusculo")).toBe("--map-label-crepusculo");
    expect(variavelDaCor("halo", "noite")).toBe("--map-label-halo-noite");
  });

  it("as ruas com sensor não mudam com a hora", () => {
    for (const luz of ["dia", "crepusculo", "noite"] as const) expect(variavelDaCor("ruaSensor", luz)).toBe("--map-road-sensor");
  });

  it("lê as cores da luminosidade pedida nas variáveis CSS do tema", () => {
    const el = document.createElement("div");
    document.body.appendChild(el);
    for (const [nome, valor] of Object.entries({
      "--map-bg": "#111111",
      "--map-bg-noite": "#222222",
      "--map-bg-crepusculo": "#333333",
      "--map-road-sensor": "#0000ff",
    }))
      el.style.setProperty(nome, valor);
    expect(lerCores(el, "dia").fundo).toBe("#111111");
    expect(lerCores(el, "noite").fundo).toBe("#222222");
    expect(lerCores(el, "crepusculo").fundo).toBe("#333333");
    expect(lerCores(el, "noite").ruaSensor).toBe("#0000ff");
    expect(lerCores(el).fundo).toBe("#111111"); // sem luminosidade, é dia
    el.remove();
  });
});

describe("a transição entre paletas", () => {
  it("dura 600 ms e vai no estilo, para o MapLibre a fazer com setPaintProperty", () => {
    vi.stubGlobal("matchMedia", () => ({ matches: false }));
    expect(duracaoDaTransicao()).toBe(TRANSICAO_MS);
    expect(TRANSICAO_MS).toBe(600);
    const estilo = construirEstilo(CORES, OPCOES);
    expect(estilo.transition).toEqual({ duration: 600, delay: 0 });
  });

  it("com prefers-reduced-motion é instantânea", () => {
    vi.stubGlobal("matchMedia", (consulta: string) => ({ matches: consulta.includes("reduce") }));
    expect(duracaoDaTransicao()).toBe(0);
    const estilo = construirEstilo(CORES, OPCOES);
    expect(estilo.transition).toEqual({ duration: 0, delay: 0 });
  });
});

describe("aplicarCores troca a paleta sem reconstruir o estilo", () => {
  const cores: CoresMapa = { ...CORES, fundo: "#f1", agua: "#f2", quarteirao: "#f3", ruaSensor: "#f4", ruaSemCobertura: "#f5", rotulo: "#f6", halo: "#f7" };

  it("pinta o fundo, a terra, a água, os quarteirões, as ruas sem cobertura, o contorno dos carros e os rótulos, e nada mais", () => {
    const pintado: Record<string, string> = {};
    aplicarCores({ getLayer: () => ({}) as never, setPaintProperty: (camada: string, propriedade: string, valor: unknown) => void (pintado[`${camada}/${propriedade}`] = String(valor)) } as never, cores);
    expect(pintado).toMatchObject({
      "fundo/background-color": "#f1",
      "terra/fill-color": "#f1",
      "agua/fill-color": "#f2",
      "edificios/fill-extrusion-color": "#f3",
      "ruas-sem-cobertura/line-color": "#f5",
      "carros/circle-stroke-color": "#f1", // o contorno dos carros acompanha o fundo
      "nomes-ruas/text-color": "#f6",
      "nomes-ruas/text-halo-color": "#f7",
      "nomes-agua/text-color": "#f6",
      "nomes-lugares/text-halo-color": "#f7",
    });
    // As ruas com sensor (e os estados, que são marcadores) não mudam com a hora.
    expect(Object.keys(pintado).some((k) => k.startsWith("ruas-com-sensor"))).toBe(false);
  });

  it("salta as camadas que ainda não existem (o estilo a carregar)", () => {
    const chamadas: string[] = [];
    aplicarCores({ getLayer: (id: string) => (id === "fundo" ? ({} as never) : undefined), setPaintProperty: (camada: string) => void chamadas.push(camada) } as never, cores);
    expect(chamadas).toEqual(["fundo"]);
  });
});

describe("a passadeira desenhada (ADR-0038)", () => {
  const ids = (e: ReturnType<typeof construirEstilo>) => e.layers.map((c) => c.id);

  it("fica por cima das ruas com sensor e por baixo dos carros e dos nomes, com o asfalto e as listas por cima", () => {
    const camadas = ids(construirEstilo(CORES, OPCOES));
    expect(camadas.indexOf("ruas-com-sensor")).toBeLessThan(camadas.indexOf(CAMADA_PASSADEIRAS));
    expect(camadas.indexOf(CAMADA_PASSADEIRAS)).toBeLessThan(camadas.indexOf("passadeiras-listas"));
    expect(camadas.indexOf("passadeiras-listas")).toBeLessThan(camadas.indexOf("carros"));
    expect(camadas.indexOf("passadeiras-listas")).toBeLessThan(camadas.indexOf("nomes-ruas"));
  });

  it("os mapas de calor ficam por baixo das ruas com sensor (o vermelho da rampa não tapa um troço em falha, ADR-0047, ponto 5)", () => {
    const camadas = ids(construirEstilo(CORES, OPCOES));
    for (const calor of ["calor-peoes", "calor-veiculos"]) {
      expect(camadas.indexOf(calor)).toBeGreaterThan(-1);
      expect(camadas.indexOf(calor)).toBeLessThan(camadas.indexOf("ruas-com-sensor"));
    }
  });

  it("aparece a partir do zoom 17, o mesmo a que o marcador se prende à ponta, e o asfalto e as listas têm cores próprias", () => {
    const estilo = construirEstilo(CORES, OPCOES);
    const camada = (id: string) => estilo.layers.find((c) => c.id === id) as { minzoom?: number; paint: Record<string, unknown> };
    expect(camada(CAMADA_PASSADEIRAS).minzoom).toBe(17);
    expect(camada("passadeiras-listas").minzoom).toBe(17);
    expect(ZOOM_PASSADEIRAS).toBe(17); // o Mapa prende o marcador à ponta a partir deste zoom (ZOOM_PRENDER)
    expect(camada(CAMADA_PASSADEIRAS).paint["fill-color"]).toBe("#333");
    expect(camada("passadeiras-listas").paint["fill-color"]).toBe("#eee");
  });

  it("as fontes levam o chão e as listas que o mapa recebe, e começam vazias sem eles", () => {
    const vazia = construirEstilo(CORES, OPCOES).sources as Record<string, { data: { features: unknown[] } }>;
    expect(vazia["passadeiras-asfalto"].data.features).toEqual([]);
    expect(vazia["passadeiras-listas"].data.features).toEqual([]);
    const lonLat = (x: number, y: number): [number, number] => [-8.65 + x / 84_400, 40.64 + y / 110_574];
    const anel = [lonLat(-5, -1.5), lonLat(5, -1.5), lonLat(5, 1.5), lonLat(-5, 1.5), lonLat(-5, -1.5)];
    const colecoes = colecoesDasPassadeiras([{ type: "Feature", id: "x", properties: { id: "x", crosswalk: "c", nome: null, rsu: null }, geometry: { type: "Polygon", coordinates: [anel] } }]);
    const com = construirEstilo(CORES, { ...OPCOES, passadeiras: colecoes }).sources as Record<string, { data: unknown }>;
    expect(com["passadeiras-asfalto"].data).toBe(colecoes.chao);
    expect(com["passadeiras-listas"].data).toBe(colecoes.listas);
  });

  it("a paleta da hora não toca na passadeira", () => {
    const pintado: string[] = [];
    aplicarCores({ getLayer: () => ({}) as never, setPaintProperty: (camada: string) => void pintado.push(camada) } as never, CORES);
    expect(pintado.some((c) => c.startsWith("passadeiras"))).toBe(false);
  });
});

describe("o anel de excesso e a velocidade dos carros (ADR-0039)", () => {
  const estilo = construirEstilo(CORES, { tiles: "t", glifos: "g", ruas: "r", trocosEmFalha: [] });
  const camada = (id: string) => estilo.layers.find((c) => c.id === id) as { filter?: unknown; minzoom?: number; paint: Record<string, unknown>; layout?: Record<string, unknown> };
  const ordem = estilo.layers.map((c) => c.id);

  it("o anel só nos pontos acima do limite, vermelho néon por cima de um contorno na cor do fundo, sem preenchimento", () => {
    for (const id of ["carros-excesso-contorno", "carros-excesso"]) {
      expect(camada(id).filter).toEqual(["==", ["get", "acima"], true]);
      expect(camada(id).paint["circle-opacity"]).toBe(0);
    }
    expect(camada("carros-excesso").paint["circle-stroke-color"]).toBe("#f0f");
    expect(camada("carros-excesso-contorno").paint["circle-stroke-color"]).toBe("#000"); // o fundo
    expect(ordem.indexOf("carros")).toBeLessThan(ordem.indexOf("carros-excesso-contorno"));
    expect(ordem.indexOf("carros-excesso-contorno")).toBeLessThan(ordem.indexOf("carros-excesso"));
  });

  it("com a paleta da hora, o contorno do anel e o halo da velocidade acompanham o fundo; o vermelho do anel não muda", () => {
    const pintado: Record<string, unknown> = {};
    aplicarCores({ getLayer: () => ({}) as never, setPaintProperty: (c: string, p: string, v: unknown) => void (pintado[`${c}/${p}`] = v) } as never, CORES);
    expect(pintado["carros-excesso-contorno/circle-stroke-color"]).toBe(CORES.fundo);
    expect(pintado["carros-velocidade/text-halo-color"]).toBe(CORES.fundo);
    expect(Object.keys(pintado).some((k) => k.startsWith("carros-excesso/"))).toBe(false);
  });

  it("o ponto continua neutro: a cor do carro não muda com o excesso; só o peão do «Ao vivo» tem outra (ADR-0049)", () => {
    expect(camada("carros").paint["circle-color"]).toBe("#fff");
    expect(camada("carros").filter).toEqual(["!=", ["get", "peao"], true]);
    expect(camada(CAMADA_PEOES).paint["circle-color"]).toBe("#36f");
    expect(camada(CAMADA_PEOES).filter).toEqual(["==", ["get", "peao"], true]);
  });

  it("«Ao vivo» (ADR-0055): os peões numa camada por cima dos veículos, e os pontos só a partir do zoom 16, os parados mais discretos", () => {
    const ids = construirEstilo(CORES, OPCOES).layers.map((l) => l.id);
    expect(ids.indexOf(CAMADA_PEOES)).toBeGreaterThan(ids.indexOf("carros-velocidade"));
    expect(ids.indexOf(CAMADA_PEOES)).toBeLessThan(ids.indexOf("nomes-ruas"));
    for (const id of ["carros", CAMADA_PEOES]) {
      expect(camada(id).paint["circle-opacity"]).toEqual(OPACIDADE_PONTOS);
      expect(camada(id).paint["circle-stroke-opacity"]).toEqual(OPACIDADE_PONTOS);
    }
    // Abaixo do zoom 16, um ponto «vivo» não se vê e os da semana gravada sim; a partir dele, o parado fica a 0,4.
    expect(OPACIDADE_PONTOS).toEqual(["step", ["zoom"], ["case", ["==", ["get", "vivo"], true], 0, 1], ZOOM_VIVO,
      ["case", ["==", ["get", "parado"], true], 0.4, 1]]);
    expect(ZOOM_VIVO).toBe(16);
  });

  it("com os modelos 3D, os pontos saem, menos os do «Ao vivo» sem modelo (o moliceiro)", () => {
    expect(OPACIDADE_PONTOS_3D).toEqual(["case", ["==", ["get", "semModelo"], true], 1, 0]);
  });

  it("«Ao vivo» (ADR-0055): os números das estações e a velocidade dos que circulam só a partir do zoom 17, sem se sobreporem", () => {
    const rotulos = camada(FONTE_ROTULOS_VIVO);
    expect(rotulos.minzoom).toBe(17);
    expect(rotulos.layout).toMatchObject({ "text-field": ["get", "texto"], "text-anchor": "top", "text-allow-overlap": false, "text-ignore-placement": false });
    const v = camada("velocidade-ao-vivo");
    expect(v.minzoom).toBe(17);
    expect(v.filter).toEqual(["all", ["has", "kmh"], ["==", ["get", "vivo"], true]]);
    expect(v.layout).toMatchObject({ "text-allow-overlap": false, "text-ignore-placement": false });
    // A velocidade da semana gravada fica como estava (ADR-0039): sem os do «Ao vivo».
    expect(camada("carros-velocidade").filter).toEqual(["all", ["has", "kmh"], ["!=", ["get", "vivo"], true]]);
  });

  it("a velocidade escreve-se em km/h junto ao ponto a partir do zoom 17", () => {
    const v = camada("carros-velocidade");
    expect(v.minzoom).toBe(17);
    expect(v.layout?.["text-field"]).toEqual(["to-string", ["get", "kmh"]]);
  });
});

describe("os edifícios em relevo (ADR-0037)", () => {
  const estilo = construirEstilo(CORES, { ...OPCOES, alturaEdificio: 9 });
  const camada = estilo.layers.find((c) => c.id === "edificios") as { type: string; paint: Record<string, unknown>; "source-layer"?: string };
  const ordem = estilo.layers.map((c) => c.id);

  it("são a camada `buildings` dos mesmos tiles, em relevo, com a cor dos quarteirões e 85 % de opacidade", () => {
    expect(camada.type).toBe("fill-extrusion");
    expect(camada["source-layer"]).toBe("buildings");
    expect(camada.paint["fill-extrusion-color"]).toBe(CORES.quarteirao);
    expect(camada.paint["fill-extrusion-opacity"]).toBe(0.85);
    expect(ordem).not.toContain("quarteiroes"); // vistos de cima, os edifícios são os quarteirões de antes
  });

  it("a altura é a do OpenStreetMap quando existe, e 9 m (config) quando não", () => {
    expect(camada.paint["fill-extrusion-height"]).toEqual(["coalesce", ["get", "height"], 9]);
    const outra = construirEstilo(CORES, { ...OPCOES, alturaEdificio: 12 }).layers.find((c) => c.id === "edificios") as { paint: Record<string, unknown> };
    expect(outra.paint["fill-extrusion-height"]).toEqual(["coalesce", ["get", "height"], 12]);
  });

  it("ficam por baixo das ruas com sensor, dos carros e dos nomes", () => {
    for (const id of ["ruas-com-sensor", "ruas-sem-cobertura", "carros", "nomes-ruas"]) expect(ordem.indexOf("edificios")).toBeLessThan(ordem.indexOf(id));
  });

  it("com a paleta da hora (ADR-0040), a cor dos edifícios acompanha a dos quarteirões", () => {
    const pintado: Record<string, unknown> = {};
    aplicarCores({ getLayer: () => ({}) as never, setPaintProperty: (c: string, p: string, v: unknown) => void (pintado[`${c}/${p}`] = v) } as never, { ...CORES, quarteirao: "#123456" });
    expect(pintado["edificios/fill-extrusion-color"]).toBe("#123456");
  });
});
