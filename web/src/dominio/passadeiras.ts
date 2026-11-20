/**
 * As passadeiras desenhadas no mapa com a forma real (ADR-0038). O polígono vem do Living Lab (`Crosswalk.csv`,
 * `GET /mapa/passadeiras`): a zona listada onde se atravessa. Aqui desenham-se as listas brancas dentro dele, e calcula-se a
 * ponta a que o marcador se prende. Nada se estima: se o polígono não chega para listas, fica só o chão e o marcador.
 *
 * O retângulo de menor área à volta do polígono dá os dois eixos: o lado longo (de 10,3 m de mediana) é a travessia, de um
 * passeio ao outro, e o curto é o sentido do trânsito.
 */
import type { PassadeiraMapa } from "../api/tipos";

type Ponto = [number, number];

/** O número de listas é fixo por passadeira (ADR-0038): 5 listas e 4 espaços, do mesmo tamanho. */
export const N_LISTAS = 5;
/** As listas ficam um pouco dentro do retângulo, para não tocarem na borda (m). */
const FOLGA_TRAVESSIA_M = 0.4;
const FOLGA_TRANSITO_M = 0.2;
/** Abaixo disto o polígono não chega para listas (m). */
const MIN_TRAVESSIA_M = 4;
const MIN_TRANSITO_M = 1;

const M_POR_GRAU_LAT = 110_574;
const M_POR_GRAU_LON = (lat: number) => 111_320 * Math.cos((lat * Math.PI) / 180);

/** O retângulo de menor área à volta do polígono, em metros à volta do centro, com o eixo longo (travessia) e o curto. */
interface Retangulo {
  lon0: number;
  lat0: number;
  kx: number;
  /** Centro do retângulo, em metros (este, norte) a partir de (lon0, lat0). */
  centro: Ponto;
  /** Vetores unitários (este, norte): `longo` é a travessia e `curto` o sentido do trânsito. */
  longo: Ponto;
  curto: Ponto;
  /** Comprimento da travessia e largura no sentido do trânsito, em metros. */
  L: number;
  S: number;
}

function retanguloMinimo(anel: Ponto[]): Retangulo | null {
  const pontos = anel.length > 1 && anel[0][0] === anel[anel.length - 1][0] && anel[0][1] === anel[anel.length - 1][1] ? anel.slice(0, -1) : anel;
  if (pontos.length < 3) return null;
  const lon0 = pontos.reduce((s, p) => s + p[0], 0) / pontos.length;
  const lat0 = pontos.reduce((s, p) => s + p[1], 0) / pontos.length;
  const kx = M_POR_GRAU_LON(lat0);
  const metros = pontos.map(([lon, lat]) => [(lon - lon0) * kx, (lat - lat0) * M_POR_GRAU_LAT] as Ponto);

  let melhor = { area: Infinity, c: 1, s: 0, umin: 0, umax: 0, vmin: 0, vmax: 0 };
  for (let g = 0; g < 180; g++) {
    const t = (g * Math.PI) / 180;
    const [c, s] = [Math.cos(t), Math.sin(t)];
    let [umin, umax, vmin, vmax] = [Infinity, -Infinity, Infinity, -Infinity];
    for (const [x, y] of metros) {
      const u = x * c + y * s;
      const v = -x * s + y * c;
      [umin, umax, vmin, vmax] = [Math.min(umin, u), Math.max(umax, u), Math.min(vmin, v), Math.max(vmax, v)];
    }
    const area = (umax - umin) * (vmax - vmin);
    if (area < melhor.area - 1e-9) melhor = { area, c, s, umin, umax, vmin, vmax };
  }

  const { c, s } = melhor;
  const [du, dv] = [melhor.umax - melhor.umin, melhor.vmax - melhor.vmin];
  const [uc, vc] = [(melhor.umin + melhor.umax) / 2, (melhor.vmin + melhor.vmax) / 2];
  const e1: Ponto = [c, s];
  const e2: Ponto = [-s, c];
  return {
    lon0,
    lat0,
    kx,
    centro: [uc * c - vc * s, uc * s + vc * c],
    longo: du >= dv ? e1 : e2,
    curto: du >= dv ? e2 : e1,
    L: Math.max(du, dv),
    S: Math.min(du, dv),
  };
}

const paraLonLat = (r: Retangulo, x: number, y: number): Ponto => [r.lon0 + x / r.kx, r.lat0 + y / M_POR_GRAU_LAT];
/** Um ponto do retângulo: `a` metros ao longo da travessia e `b` no sentido do trânsito, a partir do centro. */
const noRetangulo = (r: Retangulo, a: number, b: number): Ponto =>
  paraLonLat(r, r.centro[0] + a * r.longo[0] + b * r.curto[0], r.centro[1] + a * r.longo[1] + b * r.curto[1]);

/**
 * As 5 listas de uma passadeira, como polígonos em [lon, lat]: paralelas ao lado curto (ao trânsito) e repartidas ao longo
 * da travessia, com 4 espaços do mesmo tamanho. Sem espaço para listas, não há listas.
 */
export function listasDaPassadeira(anel: Ponto[]): Ponto[][] {
  const r = retanguloMinimo(anel);
  if (!r || r.L < MIN_TRAVESSIA_M || r.S < MIN_TRANSITO_M) return [];
  const total = r.L - 2 * FOLGA_TRAVESSIA_M;
  const largura = total / (2 * N_LISTAS - 1);
  const meio = (r.S - 2 * FOLGA_TRANSITO_M) / 2;
  const listas: Ponto[][] = [];
  for (let k = 0; k < N_LISTAS; k++) {
    const a0 = -total / 2 + 2 * k * largura;
    const canto = [noRetangulo(r, a0, -meio), noRetangulo(r, a0 + largura, -meio), noRetangulo(r, a0 + largura, meio), noRetangulo(r, a0, meio)];
    listas.push([...canto, canto[0]]);
  }
  return listas;
}

/**
 * Um ponto da passadeira (ADR-0041): `a` metros ao longo da travessia e `b` no sentido do trânsito, a partir do centro, e o rumo da
 * travessia (graus a partir do norte, do lado `-L/2` para o `+L/2`). Devolve também o comprimento e a largura, em metros.
 */
export function eixosDaPassadeira(anel: Ponto[]): { L: number; S: number; ponto: (a: number, b: number) => Ponto; rumo: number } | null {
  const r = retanguloMinimo(anel);
  if (!r) return null;
  return { L: r.L, S: r.S, ponto: (a, b) => noRetangulo(r, a, b), rumo: (Math.atan2(r.longo[0], r.longo[1]) * 180) / Math.PI };
}

/** A ponta a que o marcador se prende (no passeio), e para onde fica «fora» da passadeira, em [este, norte] unitário. */
export interface Ponta {
  lon: number;
  lat: number;
  saida: Ponto;
}

/** A ponta da travessia mais a norte (a mais a este, se empatarem): sempre a mesma para a mesma passadeira. */
export function pontaDaPassadeira(anel: Ponto[]): Ponta | null {
  const r = retanguloMinimo(anel);
  if (!r) return null;
  const norte = r.longo[1] !== 0 ? Math.sign(r.longo[1]) : Math.sign(r.longo[0]);
  const sinal = norte === 0 ? 1 : norte;
  const [lon, lat] = noRetangulo(r, (sinal * r.L) / 2, 0);
  return { lon, lat, saida: [sinal * r.longo[0], sinal * r.longo[1]] };
}

type Colecao = { type: "FeatureCollection"; features: { type: "Feature"; properties: { id: string }; geometry: { type: "Polygon"; coordinates: Ponto[][] } }[] };

/** O chão (o polígono tal e qual) e as listas de todas as passadeiras, em duas coleções GeoJSON para o mapa. O `id` é o do sensor. */
export function colecoesDasPassadeiras(passadeiras: PassadeiraMapa[]): { chao: Colecao; listas: Colecao } {
  const chao: Colecao = { type: "FeatureCollection", features: [] };
  const listas: Colecao = { type: "FeatureCollection", features: [] };
  for (const p of passadeiras) {
    if (p.geometry.type !== "Polygon") continue;
    chao.features.push({ type: "Feature", properties: { id: p.properties.id }, geometry: p.geometry });
    for (const anel of listasDaPassadeira(p.geometry.coordinates[0]))
      listas.features.push({ type: "Feature", properties: { id: p.properties.id }, geometry: { type: "Polygon", coordinates: [anel] } });
  }
  return { chao, listas };
}

export type ColecoesDasPassadeiras = ReturnType<typeof colecoesDasPassadeiras>;

/** A ponta de cada passadeira com polígono, por id do sensor. */
export function pontasDasPassadeiras(passadeiras: PassadeiraMapa[]): Record<string, Ponta> {
  const pontas: Record<string, Ponta> = {};
  for (const p of passadeiras) {
    if (p.geometry.type !== "Polygon") continue;
    const ponta = pontaDaPassadeira(p.geometry.coordinates[0]);
    if (ponta) pontas[p.properties.id] = ponta;
  }
  return pontas;
}

/** Um semáforo ou um sinal H7 na vista 3D: onde fica e para onde está virado (graus a partir do norte, como os veículos). */
export interface Mobiliario {
  id: string;
  tipo: "semaforo" | "peoes" | "sinal_h7";
  coord: Ponto;
  rumo: number;
}

/** No passeio, para lá da ponta da passadeira, e para o lado de onde vem o trânsito (metros). */
const ALEM_DA_PONTA_M = 0.6;
const AO_LADO_M = 0.5;

/**
 * Os semáforos (um por passadeira, com o braço por cima da via) e os sinais H7 (um em cada ponta) de cada passadeira. Com trânsito pela direita, em cada ponta os carros que
 * passam junto a esse passeio vêm de um lado só: o poste fica desse lado, virado para eles. As passadeiras com semáforo vêm
 * do OpenStreetMap (ADR-0019, ADR-0024); as com H7, do config (`mapa.sinais_h7`). A posição é a da ponta real da passadeira
 * (ADR-0038), e não a medida do poste, que não existe nos dados: é ilustrativa.
 */
export function mobiliarioDasPassadeiras(
  passadeiras: PassadeiraMapa[],
  comSemaforo: Set<string>,
  comH7: Set<string>,
  pontaOposta: Set<string> = new Set(),
): Mobiliario[] {
  const lista: Mobiliario[] = [];
  for (const p of passadeiras) {
    const id = p.properties.id;
    const tipo = comSemaforo.has(id) ? "semaforo" : comH7.has(id) ? "sinal_h7" : null;
    if (!tipo || p.geometry.type !== "Polygon") continue;
    const r = retanguloMinimo(p.geometry.coordinates[0]);
    if (!r) continue;
    // O semáforo de braço cobre a via toda: um só por passadeira, na ponta este; na ponta oeste, um poste
    // só com a cabeça dos peões, virada para a ponta este, para quem espera desse lado ter luz à frente. O H7 fica nas duas.
    for (const e of [1, -1]) {
      // Nas de `pontaOposta` (a SC0021, vista no local), o braço vai para a ponta oeste e o poste de peões para a este.
      const ladoDoBraco = pontaOposta.has(id) ? -1 : 1;
      const deste: Mobiliario["tipo"] = tipo === "semaforo" ? (e === ladoDoBraco ? "semaforo" : "peoes") : tipo;
      const l: Ponto = [e * r.longo[0], e * r.longo[1]];
      const d: Ponto = [-l[1], l[0]]; // o sentido dos carros junto a esta ponta (o passeio fica-lhes à direita)
      const x = r.centro[0] + l[0] * (r.L / 2 + ALEM_DA_PONTA_M) - d[0] * (r.S / 2 + AO_LADO_M);
      const y = r.centro[1] + l[1] * (r.L / 2 + ALEM_DA_PONTA_M) - d[1] * (r.S / 2 + AO_LADO_M);
      lista.push({ id, tipo: deste, coord: paraLonLat(r, x, y), rumo: ((Math.atan2(-d[0], -d[1]) * 180) / Math.PI + 360) % 360 });
    }
  }
  return lista;
}
