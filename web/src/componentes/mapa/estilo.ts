/**
 * Estilo MapLibre próprio sobre o extrato PMTiles da Protomaps (esquema v4), feito com os tokens de
 * `styles/tokens.css` (ADR-0014). Só o que o desenho mostra: a ria, os quarteirões e as ruas com nome.
 *
 * As ruas do mapa base ficam todas a cinzento, «sem cobertura» (ADR-0007). Por cima, a azul, as «ruas com sensor»
 * (ADR-0034, ponto 2): a geometria real dos troços que o Living Lab mede, com câmara ou radar ou junto a uma passadeira,
 * vinda da API (`/mapa/ruas-com-sensor`). Antes, uma rua do mapa base ficava azul inteira se passasse perto de um
 * sensor, e o resultado mudava com o zoom (as ruas das tiles juntam-se de forma diferente em cada nível).
 */
import type { Luz } from "../../dominio/luminosidade";
import type { ColecoesDasPassadeiras } from "../../dominio/passadeiras";
import type { ExpressionSpecification, LayerSpecification, Map as MapaMapLibre, StyleSpecification } from "maplibre-gl";

export interface CoresMapa {
  fundo: string;
  agua: string;
  quarteirao: string;
  ruaSensor: string;
  ruaFalha: string;
  carro: string;
  /** Os peões do modo «Ao vivo» (ADR-0049). */
  peao: string;
  /** O anel de excesso de velocidade (ADR-0039). */
  excesso: string;
  ruaSemCobertura: string;
  rotulo: string;
  halo: string;
  /** O asfalto e as listas da passadeira desenhada (ADR-0038): não mudam com a hora nem com o estado. */
  passadeiraAsfalto: string;
  passadeiraLista: string;
  /** O passeio da avenida em 3D (ADR-0044): um cinzento mais claro do que o asfalto, que é o da passadeira. */
  passeio: string;
  /** O céu e o horizonte da vista 3D (ADR-0042): só se veem com o mapa muito inclinado. */
  ceu: string;
  horizonte: string;
  /** A rua da pergunta por voz (ADR-0054): a linha realçada, por cima de um contorno. */
  realce: string;
}

const VARIAVEIS: Record<keyof CoresMapa, string> = {
  fundo: "--map-bg",
  agua: "--map-water",
  quarteirao: "--map-block",
  ruaSensor: "--map-road-sensor",
  ruaFalha: "--state-error",
  carro: "--text-primary",
  peao: "--accent-ink",
  excesso: "--speed-excess",
  ruaSemCobertura: "--map-road-nocoverage",
  rotulo: "--map-label",
  halo: "--map-label-halo",
  passadeiraAsfalto: "--crosswalk-asfalto",
  passadeiraLista: "--crosswalk-lista",
  passeio: "--map-passeio",
  ceu: "--map-sky",
  horizonte: "--map-horizon",
  realce: "--accent-fill",
};

/** A luminosidade da hora (ADR-0018, ADR-0040): o fundo do mapa tem uma paleta para cada uma. */
export type { Luz };

const SUFIXO_DA_LUZ: Record<Luz, string> = { dia: "", crepusculo: "-crepusculo", noite: "-noite" };

/** O que muda com a hora: o fundo, a água, os quarteirões, as ruas sem cobertura e os rótulos. As ruas com sensor e os estados não mudam. */
const MUDAM_COM_A_HORA: (keyof CoresMapa)[] = ["fundo", "agua", "quarteirao", "ruaSemCobertura", "rotulo", "halo", "ceu", "horizonte"];

/** O nome da variável CSS de uma cor do mapa para a luminosidade (`--map-bg`, `--map-bg-crepusculo`, `--map-bg-noite`). */
export function variavelDaCor(cor: keyof CoresMapa, luz: Luz): string {
  return VARIAVEIS[cor] + (MUDAM_COM_A_HORA.includes(cor) ? SUFIXO_DA_LUZ[luz] : "");
}

/** A duração da transição entre paletas (ADR-0040): 600 ms, ou nenhuma com `prefers-reduced-motion`. */
export const TRANSICAO_MS = 600;
export function duracaoDaTransicao(): number {
  return typeof matchMedia === "function" && matchMedia("(prefers-reduced-motion: reduce)").matches ? 0 : TRANSICAO_MS;
}

/** Lê as cores do tema atual nas variáveis CSS, na paleta da luminosidade: o mapa não tem cores próprias. */
export function lerCores(elemento: Element = document.documentElement, luz: Luz = "dia"): CoresMapa {
  const css = getComputedStyle(elemento);
  return Object.fromEntries(
    (Object.keys(VARIAVEIS) as (keyof CoresMapa)[]).map((chave) => [chave, css.getPropertyValue(variavelDaCor(chave, luz)).trim()]),
  ) as unknown as CoresMapa;
}

/**
 * «Ao vivo» (ADR-0055): os pontos de uma deteção (`vivo`) só se veem a partir deste zoom; com menos, cada estação mostra os
 * seus números. Os veículos parados ficam mais discretos. Os pontos da semana gravada veem-se sempre, como antes.
 */
export const ZOOM_VIVO = 16;
export const OPACIDADE_PONTOS: ExpressionSpecification = [
  "step",
  ["zoom"],
  ["case", ["==", ["get", "vivo"], true], 0, 1],
  ZOOM_VIVO,
  ["case", ["==", ["get", "parado"], true], 0.4, 1],
];
/** Com os modelos 3D, os pontos saem; só os do «Ao vivo» sem modelo (o moliceiro) ficam. */
export const OPACIDADE_PONTOS_3D: ExpressionSpecification = ["case", ["==", ["get", "semModelo"], true], 1, 0];
/** A camada dos peões do «Ao vivo», por cima da dos veículos (ADR-0055). */
export const CAMADA_PEOES = "peoes-ao-vivo";
/** «Ao vivo» (ADR-0055): os números de cada estação e a velocidade dos que circulam só a partir deste zoom, sem se sobreporem. */
const ZOOM_ROTULOS_VIVO = 17;
export const FONTE_ROTULOS_VIVO = "rotulos-ao-vivo";

/** Os ids das camadas e a propriedade de cor de cada uma, para trocar de paleta sem reconstruir o estilo. */
const PINTURA: [camada: string, propriedade: string, cor: keyof CoresMapa][] = [
  ["fundo", "background-color", "fundo"],
  ["terra", "fill-color", "fundo"],
  ["agua", "fill-color", "agua"],
  ["edificios", "fill-extrusion-color", "quarteirao"],
  ["edificios-medidos", "fill-extrusion-color", "quarteirao"],
  ["ruas-sem-cobertura", "line-color", "ruaSemCobertura"],
  ["carros", "circle-stroke-color", "fundo"], // o contorno dos carros é da cor do fundo (ADR-0034)
  [CAMADA_PEOES, "circle-stroke-color", "fundo"],
  ["velocidade-ao-vivo", "text-halo-color", "fundo"],
  [FONTE_ROTULOS_VIVO, "text-halo-color", "fundo"],
  [FONTE_ROTULOS_VIVO, "text-color", "rotulo"],
  ["carros-excesso-contorno", "circle-stroke-color", "fundo"], // e o contorno fino do anel de excesso (ADR-0039)
  ["carros-velocidade", "text-halo-color", "fundo"],
  ["nomes-ruas", "text-color", "rotulo"],
  ["nomes-ruas", "text-halo-color", "halo"],
  ["nomes-agua", "text-color", "rotulo"],
  ["nomes-agua", "text-halo-color", "halo"],
  ["nomes-lugares", "text-color", "rotulo"],
  ["nomes-lugares", "text-halo-color", "halo"],
];

/** Passa o mapa para outra paleta da luminosidade: o MapLibre faz a transição do estilo (`transition`). */
export function aplicarCores(mapa: Pick<MapaMapLibre, "getLayer" | "setPaintProperty"> & Partial<Pick<MapaMapLibre, "setSky">>, cores: CoresMapa): void {
  for (const [camada, propriedade, cor] of PINTURA) if (mapa.getLayer(camada)) mapa.setPaintProperty(camada, propriedade as "fill-color", cores[cor]); // o tipo só aceita os nomes literais das propriedades
  mapa.setSky?.(ceuDoEstilo(cores));
}

/** O céu da vista 3D (ADR-0042): a cor do céu em cima e a do horizonte, que se mistura com o mapa ao longe. */
function ceuDoEstilo(cores: CoresMapa): NonNullable<StyleSpecification["sky"]> {
  return { "sky-color": cores.ceu, "horizon-color": cores.horizonte, "fog-color": cores.horizonte, "sky-horizon-blend": 0.6, "horizon-fog-blend": 0.4, "fog-ground-blend": 0.9 };
}

/** A camada do polígono da passadeira: clicar nela abre o pop-up do sensor, como o marcador (ADR-0038). */
export const CAMADA_PASSADEIRAS = "passadeiras-asfalto";
/** O zoom a partir do qual a passadeira se desenha e o marcador se prende à ponta dela (ADR-0038, ponto 3). */
export const ZOOM_PASSADEIRAS = 17;
const VAZIA = { type: "FeatureCollection" as const, features: [] };
/** O anel de excesso, um pouco maior do que o ponto do carro (que vai de 1,2 a 3,6 px de raio). */
const RAIO_ANEL: ExpressionSpecification = ["interpolate", ["linear"], ["zoom"], 13, 4, 16, 5.4, 18, 6.8];

/** A avenida (ADR-0044) aparece a partir deste zoom; os passeios ficam com esta altura (m). */
const ZOOM_AVENIDA = 16;
const ALTURA_PASSEIO_M = 0.15;
type ColecaoGeo = { type: "FeatureCollection"; features: unknown[] };
export interface ColecoesDaAvenida {
  /** O asfalto; cada elemento traz os `segmentos` que cobre e `emFalha` (algum deles sem dados à hora escolhida). */
  estrada: ColecaoGeo;
  faixas: ColecaoGeo;
  passeios: ColecaoGeo;
  lugares: ColecaoGeo;
  /** Os segmentos do corredor: a partir do zoom 16, a linha da «rua com sensor» sai deles (está na berma) e fica o asfalto. */
  corredor: string[];
}
/** Os edifícios da zona com a altura do LiDAR (ADR-0050): o GeoJSON e os ids que saem da camada dos tiles. */
export type EdificiosMedidos = { geo: { type: "FeatureCollection"; features: unknown[] }; ids: number[] };

/**
 * A rampa do mapa de calor (ADR-0047, ponto 5): a clássica, de pouco para muito, azul → ciano → verde →
 * amarelo → laranja → vermelho; começa transparente. A mesma para os peões e para os veículos. Os estados leem-se pelo ícone e
 * pela forma dos marcadores, que ficam por cima.
 */
const RAMPA_CALOR: [number, string][] = [
  [0, "rgba(0, 0, 0, 0)"],
  [0.06, "rgba(49, 54, 149, 0.35)"],
  [0.2, "rgba(43, 131, 186, 0.55)"],
  [0.38, "rgba(0, 190, 200, 0.65)"],
  [0.55, "rgba(102, 194, 80, 0.72)"],
  [0.7, "rgba(250, 220, 60, 0.8)"],
  [0.85, "rgba(245, 130, 40, 0.85)"],
  [1, "rgba(215, 40, 40, 0.9)"],
];

/**
 * Um mapa de calor (ADR-0047, ponto 3): as medidas dos sensores perto uns dos outros somam-se, para se ver onde há mais
 * movimento na cidade. O raio é em pixels e cresce com o zoom, para se ver também de longe. A rampa começa transparente: um
 * sensor fraco e isolado quase não pinta, e só as zonas com mais movimento ficam com a cor forte.
 */
function nuvemDeCalor(fonte: string): LayerSpecification {
  return {
    id: fonte,
    type: "heatmap",
    source: fonte,
    paint: {
      "heatmap-weight": ["get", "intensidade"],
      "heatmap-radius": ["interpolate", ["linear"], ["zoom"], 11, 35, 14, 60, 16, 90, 18, 160, 20, 380],
      // Os núcleos com mais movimento chegam ao vermelho; um sensor fraco e isolado fica azul.
      "heatmap-intensity": ["interpolate", ["linear"], ["zoom"], 11, 3, 14, 2.2, 17, 1.4, 20, 0.9],
      "heatmap-color": ["interpolate", ["linear"], ["heatmap-density"], ...RAMPA_CALOR.flat()],
      "heatmap-opacity": 0.85,
    },
  };
}

/** A altura dos edifícios sem altura no OpenStreetMap, se o config não a disser (ADR-0037). */
const ALTURA_EDIFICIO_M = 9;

export const CAMADAS_RUAS = ["ruas-sem-cobertura", "ruas-com-sensor", "ruas-com-sensor-corredor"] as const;
const TIPOS_DE_RUA = ["highway", "major_road", "minor_road"];
const eRua: ExpressionSpecification = ["in", ["get", "kind"], ["literal", TIPOS_DE_RUA]];

const largura = (fino: number, grosso: number): ExpressionSpecification => [
  "interpolate",
  ["exponential", 1.6],
  ["zoom"],
  12,
  ["match", ["get", "kind"], "minor_road", fino * 0.3, grosso * 0.3],
  18,
  ["match", ["get", "kind"], "minor_road", fino * 4, grosso * 4],
];

/** A camada da vista aérea e a sua atribuição (ADR-0045, ponto 4). */
export const CAMADA_AEREA = "vista-aerea";
/** A opacidade dos edifícios (ADR-0037); com a vista aérea, baixa para se verem os telhados reais da fotografia. */
export const OPACIDADE_EDIFICIOS = 0.85;
export const OPACIDADE_EDIFICIOS_AEREA = 0.3;
/** Na vista 3D com a fotografia: quase sólidos, um pouco abaixo dos 0,85. */
export const OPACIDADE_EDIFICIOS_AEREA_3D = 0.7;
/** A camada dos edifícios da zona da demo, medidos pelo LiDAR (ADR-0050): a única que desce com a vista aérea. */
export const CAMADA_EDIFICIOS_ZONA = "edificios-medidos";
/** A atribuição fixa do mapa (OSM e Protomaps, as alturas da DGT), no controlo do MapLibre; o texto completo está nos «Dados locais». */
export const ATRIBUICAO_MAPA =
  '<a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noreferrer">© contribuidores do OpenStreetMap</a> · Protomaps · Alturas: © DGT (LiDAR 2024)';
const ATRIBUICAO_AEREA = "Ortofotos © Direção-Geral do Território (CC BY 4.0)";
/** De noite, a fotografia escurece, para não parecer dia (ADR-0045, ponto 5). */
export const BRILHO_AEREA: Record<Luz, number> = { dia: 1, crepusculo: 0.7, noite: 0.4 };

export function construirEstilo(
  cores: CoresMapa,
  opcoes: {
    tiles: string;
    glifos: string;
    ruas: string;
    trocosEmFalha?: string[];
    realce?: { nome: string; segmentos: string[] } | null;
    passadeiras?: ColecoesDasPassadeiras;
    alturaEdificio?: number;
    /** A avenida da demo (ADR-0044): o asfalto, as linhas, os passeios e os lugares com sensor (com o estado da hora). */
    avenida?: ColecoesDaAvenida;
    /** O PMTiles da vista aérea (ADR-0045); sem ele, a camada não existe. */
    aerea?: string;
    /** Os edifícios da zona da demo com a altura medida pelo LiDAR da DGT (ADR-0050), e os ids que saem da camada dos tiles. */
    edificiosMedidos?: EdificiosMedidos;
  },
): StyleSpecification {
  const nome: ExpressionSpecification = ["coalesce", ["get", "name:pt"], ["get", "name"]];
  return {
    version: 8,
    // A mudança de paleta (dia, crepúsculo, noite) faz uma transição, que acompanha o ▶ (ADR-0040).
    transition: { duration: duracaoDaTransicao(), delay: 0 },
    glyphs: opcoes.glifos,
    sky: ceuDoEstilo(cores),
    sources: {
      protomaps: {
        type: "vector",
        url: opcoes.tiles,
      },
      // A vista aérea da zona da demo (ADR-0045): a ortofoto da DGT, recortada, em tiles WebP; fora do recorte, transparente.
      ...(opcoes.aerea
        ? {
            "vista-aerea": {
              type: "raster" as const,
              url: opcoes.aerea,
              tileSize: 256,
              attribution: ATRIBUICAO_AEREA,
            },
          }
        : {}),
      // Sem a API (ou sem `riasense carros`), a fonte fica vazia e nenhuma rua aparece como coberta.
      ruas: { type: "geojson", data: opcoes.ruas },
      // As passadeiras com a forma real (ADR-0038): o polígono (o asfalto) e as 5 listas; vazias até a API responder.
      "passadeiras-asfalto": { type: "geojson", data: opcoes.passadeiras?.chao ?? VAZIA },
      "passadeiras-listas": { type: "geojson", data: opcoes.passadeiras?.listas ?? VAZIA },
      // A avenida da demo (ADR-0044): vazias até a API responder (ou sem `riasense avenida`).
      "avenida-estrada": { type: "geojson", data: opcoes.avenida?.estrada ?? VAZIA },
      "avenida-faixas": { type: "geojson", data: opcoes.avenida?.faixas ?? VAZIA },
      "avenida-passeios": { type: "geojson", data: opcoes.avenida?.passeios ?? VAZIA },
      "avenida-lugares": { type: "geojson", data: opcoes.avenida?.lugares ?? VAZIA },
      // ADR-0050: os edifícios da zona com a altura do LiDAR; vazios até a API responder.
      "edificios-medidos": {
        type: "geojson",
        data: opcoes.edificiosMedidos?.geo ?? VAZIA,
      },
      // Os mapas de calor (ADR-0047): o Mapa preenche estas fontes com as nuvens da hora; começam vazias.
      "calor-peoes": { type: "geojson", data: VAZIA },
      "calor-veiculos": { type: "geojson", data: VAZIA },
      // Os carros medidos (ADR-0034): o Mapa preenche esta fonte a cada fotograma; começa vazia.
      carros: { type: "geojson", data: { type: "FeatureCollection", features: [] } },
      // «Ao vivo» (ADR-0055): os números de cada estação (o Mapa preenche-a a cada leitura); começa vazia.
      [FONTE_ROTULOS_VIVO]: { type: "geojson", data: { type: "FeatureCollection", features: [] } },
    },
    layers: [
      { id: "fundo", type: "background", paint: { "background-color": cores.fundo } },
      { id: "terra", type: "fill", source: "protomaps", "source-layer": "earth", paint: { "fill-color": cores.fundo } },
      { id: "agua", type: "fill", source: "protomaps", "source-layer": "water", paint: { "fill-color": cores.agua } },
      // A vista aérea (ADR-0045, ponto 3): desligada por omissão (o Mapa liga-a), por cima do fundo e por baixo dos edifícios,
      // das ruas com sensor, das passadeiras, dos carros e dos marcadores.
      ...(opcoes.aerea
        ? [{ id: CAMADA_AEREA, type: "raster" as const, source: "vista-aerea", layout: { visibility: "none" as const }, paint: { "raster-fade-duration": 0 } }]
        : []),
      // Os edifícios em relevo (ADR-0037): a camada `buildings` dos mesmos tiles, com a altura do OpenStreetMap quando existe e
      // `mapa.edificio_altura_m` (9 m) quando não; a 85 % de opacidade, para não esconderem uma rua com sensor nem um carro. Vistos
      // de cima (no telemóvel), são os quarteirões de antes. As ruas, os carros e os marcadores ficam por cima.
      {
        id: "edificios",
        type: "fill-extrusion",
        source: "protomaps",
        "source-layer": "buildings",
        minzoom: 13,
        // Os edifícios com a altura medida (ADR-0050) desenham-se na camada seguinte, e saem desta.
        filter: ["!", ["in", ["id"], ["literal", opcoes.edificiosMedidos?.ids ?? []]]],
        paint: {
          "fill-extrusion-color": cores.quarteirao,
          "fill-extrusion-height": ["coalesce", ["get", "height"], opcoes.alturaEdificio ?? ALTURA_EDIFICIO_M],
          "fill-extrusion-base": ["coalesce", ["get", "min_height"], 0],
          "fill-extrusion-opacity": OPACIDADE_EDIFICIOS,
          "fill-extrusion-vertical-gradient": true,
        },
      },
      // ADR-0050: na zona da demo, os edifícios com a altura medida pelo LiDAR da DGT (MDS − MDT), no mesmo estilo.
      {
        id: "edificios-medidos",
        type: "fill-extrusion",
        source: "edificios-medidos",
        minzoom: 13,
        paint: {
          "fill-extrusion-color": cores.quarteirao,
          "fill-extrusion-height": ["get", "altura_m"],
          "fill-extrusion-base": 0,
          "fill-extrusion-opacity": 0.85,
          "fill-extrusion-vertical-gradient": true,
        },
      },
      {
        id: "ruas-sem-cobertura",
        type: "line",
        source: "protomaps",
        "source-layer": "roads",
        filter: eRua,
        layout: { "line-cap": "round", "line-join": "round" },
        paint: { "line-color": cores.ruaSemCobertura, "line-width": largura(1.4, 2.2) },
      },
      // A avenida da demo (ADR-0044), a partir do zoom 16: o asfalto à largura medida nas passadeiras, os lugares com sensor (o
      // contorno: contínuo se se sabe o estado, tracejado se é desconhecido; o carro estacionado é um modelo 3D), as linhas e os
      // passeios, um pouco em relevo. As ruas com sensor ficam por cima, como até aqui.
      { id: "avenida-asfalto", type: "fill", source: "avenida-estrada", minzoom: ZOOM_AVENIDA, paint: { "fill-color": cores.passadeiraAsfalto } },
      // Um troço do corredor em falha: o asfalto fica avermelhado, na cor da falha (a linha vermelha sai, porque corre na berma).
      {
        id: "avenida-asfalto-falha",
        type: "fill",
        source: "avenida-estrada",
        minzoom: ZOOM_AVENIDA,
        filter: ["==", ["get", "emFalha"], true],
        paint: { "fill-color": cores.ruaFalha, "fill-opacity": 0.45 },
      },
      {
        id: "avenida-lugares",
        type: "line",
        source: "avenida-lugares",
        minzoom: ZOOM_AVENIDA,
        filter: ["!=", ["get", "estado"], "desconhecido"],
        paint: { "line-color": cores.passadeiraLista, "line-width": 1, "line-opacity": 0.7 },
      },
      {
        id: "avenida-lugares-desconhecidos",
        type: "line",
        source: "avenida-lugares",
        minzoom: ZOOM_AVENIDA,
        filter: ["==", ["get", "estado"], "desconhecido"],
        paint: { "line-color": cores.passadeiraLista, "line-width": 1.5, "line-dasharray": [2, 2] },
      },
      {
        id: "avenida-faixas",
        type: "line",
        source: "avenida-faixas",
        minzoom: ZOOM_AVENIDA,
        filter: ["!=", ["get", "tracejado"], true],
        paint: { "line-color": cores.passadeiraLista, "line-width": ["interpolate", ["linear"], ["zoom"], 16, 1, 19, 3] },
      },
      {
        id: "avenida-faixas-tracejadas",
        type: "line",
        source: "avenida-faixas",
        minzoom: ZOOM_AVENIDA,
        filter: ["==", ["get", "tracejado"], true],
        paint: { "line-color": cores.passadeiraLista, "line-width": ["interpolate", ["linear"], ["zoom"], 16, 1, 19, 3], "line-dasharray": [4, 4] },
      },
      {
        id: "avenida-passeios",
        type: "fill-extrusion",
        source: "avenida-passeios",
        minzoom: ZOOM_AVENIDA,
        paint: { "fill-extrusion-color": cores.passeio, "fill-extrusion-height": ALTURA_PASSEIO_M, "fill-extrusion-opacity": 1 },
      },
      // Os mapas de calor (ADR-0047, pontos 3 e 5): por baixo das ruas com sensor (o vermelho da rampa não tapa um troço em falha),
      // das passadeiras, dos carros e dos marcadores.
      nuvemDeCalor("calor-veiculos"),
      nuvemDeCalor("calor-peoes"),
      {
        id: "ruas-com-sensor",
        type: "line",
        source: "ruas",
        // No corredor da avenida, só abaixo do zoom 16 (ADR-0044): a linha está no eixo do segmento, na berma.
        filter: ["!", ["in", ["get", "id"], ["literal", opcoes.avenida?.corredor ?? []]]],
        layout: {
          "line-cap": "round",
          "line-join": "round",
          // Os 2 sentidos de uma rua são troços com a mesma linha: o que está em falha desenha-se por cima.
          "line-sort-key": ["case", ["in", ["get", "id"], ["literal", opcoes.trocosEmFalha ?? []]], 1, 0],
        },
        // Um troço medido sem dados à hora escolhida fica a vermelho na própria linha (a falha está na rua).
        paint: {
          "line-color": ["case", ["in", ["get", "id"], ["literal", opcoes.trocosEmFalha ?? []]], cores.ruaFalha, cores.ruaSensor],
          "line-width": largura(2.4, 3.2),
        },
      },
      {
        id: "ruas-com-sensor-corredor",
        type: "line",
        source: "ruas",
        maxzoom: ZOOM_AVENIDA,
        filter: ["in", ["get", "id"], ["literal", opcoes.avenida?.corredor ?? []]],
        layout: {
          "line-cap": "round",
          "line-join": "round",
          // Os 2 sentidos de uma rua são troços com a mesma linha: o que está em falha desenha-se por cima.
          "line-sort-key": ["case", ["in", ["get", "id"], ["literal", opcoes.trocosEmFalha ?? []]], 1, 0],
        },
        // Um troço medido sem dados à hora escolhida fica a vermelho na própria linha (a falha está na rua).
        paint: {
          "line-color": ["case", ["in", ["get", "id"], ["literal", opcoes.trocosEmFalha ?? []]], cores.ruaFalha, cores.ruaSensor],
          "line-width": largura(2.4, 3.2),
        },
      },
      // A rua da pergunta por voz (ADR-0054): cor e contorno e o nome ao longo da linha, para a cor não ser a única pista.
      ...(opcoes.realce
        ? ([
            {
              id: "rua-realce-contorno",
              type: "line",
              source: "ruas",
              filter: ["in", ["get", "id"], ["literal", opcoes.realce.segmentos]],
              layout: { "line-cap": "round", "line-join": "round" },
              paint: { "line-color": cores.realce, "line-width": largura(9, 12) },
            },
            {
              id: "rua-realce",
              type: "line",
              source: "ruas",
              filter: ["in", ["get", "id"], ["literal", opcoes.realce.segmentos]],
              layout: { "line-cap": "round", "line-join": "round" },
              paint: { "line-color": cores.carro, "line-width": largura(3, 4) },
            },
            {
              id: "rua-realce-nome",
              type: "symbol",
              source: "ruas",
              filter: ["in", ["get", "id"], ["literal", opcoes.realce.segmentos]],
              layout: {
                "symbol-placement": "line",
                "text-field": opcoes.realce.nome,
                "text-font": ["Noto Sans Regular"],
                "text-size": 14,
                "text-offset": [0, -1.2],
                "text-max-angle": 30,
              },
              paint: { "text-color": cores.carro, "text-halo-color": cores.fundo, "text-halo-width": 2 },
            },
          ] satisfies LayerSpecification[])
        : []),
      // A passadeira por cima das ruas com sensor e dos troços em falha (um troço em falha fica interrompido nela) e por baixo dos
      // carros e dos marcadores. Aparece a partir do zoom 17, o mesmo a que o marcador se prende à ponta (ADR-0038, ponto 3): entre o
      // 16 e o 17, o marcador ao centro tapava-a.
      {
        id: CAMADA_PASSADEIRAS,
        type: "fill",
        source: "passadeiras-asfalto",
        minzoom: ZOOM_PASSADEIRAS,
        paint: { "fill-color": cores.passadeiraAsfalto },
      },
      {
        id: "passadeiras-listas",
        type: "fill",
        source: "passadeiras-listas",
        minzoom: ZOOM_PASSADEIRAS,
        paint: { "fill-color": cores.passadeiraLista },
      },
      {
        id: "carros",
        type: "circle",
        source: "carros",
        // Os peões do «Ao vivo» vão para a camada deles, por cima (ADR-0055); na semana gravada não há peões nesta fonte.
        filter: ["!=", ["get", "peao"], true],
        // Pontos numa cor neutra: o verde e o vermelho são só para os estados dos sensores (ADR-0034, ponto 4).
        paint: {
          "circle-color": cores.carro,
          "circle-radius": ["interpolate", ["linear"], ["zoom"], 13, 1.2, 16, 2.4, 18, 3.6],
          "circle-stroke-color": cores.fundo,
          "circle-stroke-width": 1,
          "circle-opacity": OPACIDADE_PONTOS,
          "circle-stroke-opacity": OPACIDADE_PONTOS,
        },
      },
      // O anel de excesso (ADR-0039): só nos pontos acima do limite da via, um contorno vermelho néon com um contorno fino na cor do
      // fundo, à volta do ponto neutro. Não é um ícone preenchido: não se confunde com o marcador de um sensor em falha.
      {
        id: "carros-excesso-contorno",
        type: "circle",
        source: "carros",
        filter: ["==", ["get", "acima"], true],
        paint: { "circle-opacity": 0, "circle-radius": RAIO_ANEL, "circle-stroke-color": cores.fundo, "circle-stroke-width": 4 },
      },
      {
        id: "carros-excesso",
        type: "circle",
        source: "carros",
        filter: ["==", ["get", "acima"], true],
        paint: { "circle-opacity": 0, "circle-radius": RAIO_ANEL, "circle-stroke-color": cores.excesso, "circle-stroke-width": 2 },
      },
      // A velocidade em km/h junto ao ponto, a partir do zoom 17 (com menos zoom ficavam demasiados números): o excesso não se vê só
      // pela cor (WCAG 1.4.1).
      {
        id: "carros-velocidade",
        type: "symbol",
        source: "carros",
        minzoom: 17,
        // Os do «Ao vivo» vão para a camada deles, sem se sobreporem (ADR-0055).
        filter: ["all", ["has", "kmh"], ["!=", ["get", "vivo"], true]],
        layout: {
          "text-field": ["to-string", ["get", "kmh"]],
          "text-font": ["Noto Sans Medium"],
          "text-size": 11,
          "text-offset": [0, -1.2],
          "text-allow-overlap": true,
          "text-ignore-placement": true,
        },
        paint: { "text-color": cores.carro, "text-halo-color": cores.fundo, "text-halo-width": 1.5 },
      },
      // «Ao vivo» (ADR-0055): a velocidade dos que circulam, a partir do zoom 17; um número que choque com outro não se desenha.
      {
        id: "velocidade-ao-vivo",
        type: "symbol",
        source: "carros",
        minzoom: ZOOM_ROTULOS_VIVO,
        filter: ["all", ["has", "kmh"], ["==", ["get", "vivo"], true]],
        layout: {
          "text-field": ["to-string", ["get", "kmh"]],
          "text-font": ["Noto Sans Medium"],
          "text-size": 11,
          "text-offset": [0, -1.2],
          "text-allow-overlap": false,
          "text-ignore-placement": false,
        },
        paint: { "text-color": cores.carro, "text-halo-color": cores.fundo, "text-halo-width": 1.5 },
      },
      // Os peões do «Ao vivo» (ADR-0049) noutra cor, que não é de estado, por cima dos veículos (ADR-0055).
      {
        id: CAMADA_PEOES,
        type: "circle",
        source: "carros",
        filter: ["==", ["get", "peao"], true],
        paint: {
          "circle-color": cores.peao,
          "circle-radius": ["interpolate", ["linear"], ["zoom"], 13, 1.2, 16, 2.4, 18, 3.6],
          "circle-stroke-color": cores.fundo,
          "circle-stroke-width": 1,
          "circle-opacity": OPACIDADE_PONTOS,
          "circle-stroke-opacity": OPACIDADE_PONTOS,
        },
      },
      // «Ao vivo» (ADR-0055): os números de cada estação por baixo do ícone, a partir do zoom 17; um que choque com outro (ou com
      // a velocidade) não se desenha. Com menos zoom, só o ícone; e sempre no pop-up, ao clicar.
      {
        id: FONTE_ROTULOS_VIVO,
        type: "symbol",
        source: FONTE_ROTULOS_VIVO,
        minzoom: ZOOM_ROTULOS_VIVO,
        layout: {
          "text-field": ["get", "texto"],
          "text-font": ["Noto Sans Medium"],
          "text-size": 12,
          "text-anchor": "top",
          "text-offset": [0, 1.6],
          "text-allow-overlap": false,
          "text-ignore-placement": false,
        },
        paint: { "text-color": cores.rotulo, "text-halo-color": cores.fundo, "text-halo-width": 1.5 },
      },
      {
        id: "nomes-ruas",
        type: "symbol",
        source: "protomaps",
        "source-layer": "roads",
        minzoom: 14,
        filter: ["all", eRua, ["has", "name"]],
        layout: {
          "symbol-placement": "line",
          "text-field": nome,
          "text-font": ["Noto Sans Regular"],
          "text-size": ["interpolate", ["linear"], ["zoom"], 14, 10, 18, 13],
          "text-max-angle": 30,
        },
        paint: { "text-color": cores.rotulo, "text-halo-color": cores.halo, "text-halo-width": 1.5 },
      },
      {
        id: "nomes-agua",
        type: "symbol",
        source: "protomaps",
        "source-layer": "water",
        filter: ["all", ["==", ["geometry-type"], "Point"], ["has", "name"]],
        layout: { "text-field": nome, "text-font": ["Noto Sans Italic"], "text-size": 12 },
        paint: { "text-color": cores.rotulo, "text-halo-color": cores.halo, "text-halo-width": 1.5 },
      },
      {
        id: "nomes-lugares",
        type: "symbol",
        source: "protomaps",
        "source-layer": "places",
        filter: ["in", ["get", "kind"], ["literal", ["locality", "neighbourhood", "macrohood"]]],
        layout: {
          "text-field": nome,
          "text-font": ["Noto Sans Medium"],
          "text-size": 12,
          "text-transform": "uppercase",
          "text-letter-spacing": 0.08,
        },
        paint: { "text-color": cores.rotulo, "text-halo-color": cores.halo, "text-halo-width": 1.5 },
      },
    ],
  };
}
