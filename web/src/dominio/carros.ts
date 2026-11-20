/**
 * A camada «Trânsito» (ADR-0034): os carros no mapa são os medidos. Em cada segmento com câmara ou radar, o número de
 * pontos é proporcional às passagens medidas nessa hora. Cada ponto é um grupo de cerca de 20 veículos e anda à mediana da
 * velocidade do seu grupo (ADR-0039), acelerada pelo mesmo fator para todos; acima do limite da via, leva o anel de excesso.
 * Um segmento em falha fica sem carros. Nada se estima.
 */

export type Coordenada = [number, number];

/** Um segmento com a sua linha e o comprimento acumulado de cada vértice, em metros. */
export interface SegmentoCarros {
  id: string;
  /** O sensor do segmento para a semana toda (ADR-0034): a câmara, ou o radar. */
  sensor?: "Camera" | "Radar";
  linha: Coordenada[];
  acumulado: number[];
  comprimento: number;
}

export interface PassagemHora {
  id: string;
  /** O sensor que mediu nesta hora: a câmara, ou o radar se a câmara não mediu (ADR-0034). */
  sensor?: "Camera" | "Radar";
  veiculos: number;
  vel_media_ms: number | null;
  /** ADR-0039: o limite da via, as passagens medidas acima dele e a mediana de cada grupo de ≈ 20 veículos, em km/h. */
  limite_kmh?: number | null;
  acima_limite?: number | null;
  velocidades_kmh?: number[] | null;
  /** ADR-0041: os grupos da vista 3D, com o tipo medido (A mota, B ligeiro, C camião, D autocarro) e a mediana em km/h. */
  grupos?: GrupoVeiculos[] | null;
  /** ADR-0041, ponto 9: um total estimado (②) ou previsto (③), e não medido; os carros ficam translúcidos. */
  estimado?: boolean;
}

export type Categoria = "A" | "B" | "C" | "D";
interface GrupoVeiculos {
  categoria: Categoria;
  kmh: number;
}

/** Um veículo da vista 3D (ADR-0041): onde está, para onde aponta (graus a partir do norte), o tipo e o excesso. */
export interface Veiculo3D {
  coord: Coordenada;
  rumo: number;
  categoria: Categoria;
  /** A velocidade medida do grupo (km/h), escrita junto ao modelo; null sem número: parado, a travar ou a arrancar (ADR-0043), ou
   * um veículo parado no «Ao vivo» (ADR-0049). */
  kmh: number | null;
  acima: boolean;
  /** Uma variante fixa do modelo (os ligeiros têm 2): não depende da hora, para o mesmo grupo não trocar de carro. */
  variante: number;
  /** O tamanho do modelo (0 a 1): encolhe nas pontas do segmento, onde o grupo dá a volta. Sem valor, 1. */
  escala?: number;
  /** Um veículo do «Ao vivo»: o número da velocidade não se sobrepõe a outro (ADR-0055). */
  vivo?: boolean;
  /** Estimado (②) ou previsto (③), e não medido: desenha-se translúcido (ADR-0041, ponto 9). */
  estimado?: boolean;
}

/** Um ponto da camada «Trânsito»: onde está, a velocidade do seu grupo (km/h, arredondada) e se passa o limite da via. */
export interface PontoCarro {
  coord: Coordenada;
  kmh: number | null;
  acima: boolean;
  /** Um peão detetado no modo «Ao vivo» (ADR-0049): numa camada própria, por cima dos veículos (ADR-0055). */
  peao?: boolean;
  /** Um ponto do «Ao vivo»: só se vê a partir do zoom 16; com menos, cada estação mostra os seus números (ADR-0055). */
  vivo?: boolean;
  /** Um veículo parado no «Ao vivo»: mais discreto e sem número de velocidade (ADR-0055). */
  parado?: boolean;
  /** Uma deteção do «Ao vivo» sem modelo 3D (o moliceiro): na vista 3D continua como ponto. */
  semModelo?: boolean;
}

export interface OpcoesCarros {
  veiculosPorPonto: number;
  pontosMax: number;
  aceleracao: number;
}

const RAIO_TERRA_M = 6_371_000;
const rad = (g: number) => (g * Math.PI) / 180;

/** Distância em metros entre dois pontos (lon, lat), pela fórmula de haversine. */
export function distanciaM([lon1, lat1]: Coordenada, [lon2, lat2]: Coordenada): number {
  const a = Math.sin(rad(lat2 - lat1) / 2) ** 2 + Math.cos(rad(lat1)) * Math.cos(rad(lat2)) * Math.sin(rad(lon2 - lon1) / 2) ** 2;
  return 2 * RAIO_TERRA_M * Math.asin(Math.sqrt(a));
}

/** Os segmentos do GeoJSON (`/mapa/segmentos-carros`), com os comprimentos já calculados. */
export function prepararSegmentos(geo: {
  features: { properties: { id: string; sensor?: string }; geometry: { type: string; coordinates: unknown } }[];
}): SegmentoCarros[] {
  return geo.features.flatMap((f) => {
    if (f.geometry.type !== "LineString") return [];
    const linha = f.geometry.coordinates as Coordenada[];
    if (linha.length < 2) return [];
    const acumulado = [0];
    for (let i = 1; i < linha.length; i++) acumulado.push(acumulado[i - 1] + distanciaM(linha[i - 1], linha[i]));
    const comprimento = acumulado[acumulado.length - 1];
    const sensor = f.properties.sensor === "Camera" || f.properties.sensor === "Radar" ? f.properties.sensor : undefined;
    return comprimento > 0 ? [{ id: f.properties.id, sensor, linha, acumulado, comprimento }] : [];
  });
}

/** O ponto a `d` metros do início da linha. */
export function pontoNaLinha(s: SegmentoCarros, d: number): Coordenada {
  let i = 1;
  while (i < s.acumulado.length - 1 && s.acumulado[i] < d) i++;
  const [a, b] = [s.linha[i - 1], s.linha[i]];
  const troco = s.acumulado[i] - s.acumulado[i - 1];
  const f = troco > 0 ? (d - s.acumulado[i - 1]) / troco : 0;
  return [a[0] + (b[0] - a[0]) * f, a[1] + (b[1] - a[1]) * f];
}

/** Quantos pontos tem cada segmento nesta hora: ≈ veículos / veiculosPorPonto, com o teto de pontos no total. */
export function pontosPorSegmento(passagens: PassagemHora[], emFalha: ReadonlySet<string>, o: OpcoesCarros): Map<string, number> {
  const n = new Map<string, number>();
  for (const p of passagens) {
    if (emFalha.has(p.id) || p.veiculos <= 0) continue;
    n.set(p.id, Math.max(1, Math.round(p.veiculos / o.veiculosPorPonto)));
  }
  const total = [...n.values()].reduce((a, b) => a + b, 0);
  if (total > o.pontosMax) {
    const f = o.pontosMax / total;
    for (const [id, k] of n) n.set(id, Math.max(1, Math.floor(k * f)));
  }
  return n;
}

/**
 * A velocidade do ponto `i` de `k` num segmento: a mediana do seu grupo (ADR-0039). Os grupos vêm ordenados pela velocidade;
 * com menos pontos do que grupos (o teto de pontos), cada ponto toma o grupo do meio da sua fatia.
 */
export function velocidadeDoPonto(grupos: readonly number[], i: number, k: number): number | null {
  if (grupos.length === 0 || k <= 0) return null;
  return grupos[Math.min(grupos.length - 1, Math.floor(((i + 0.5) * grupos.length) / k))];
}

/**
 * Os carros no instante `segundos` (relógio da animação). Os pontos de um segmento partem igualmente espaçados, e cada um anda à
 * mediana do seu grupo × aceleração (sem os grupos, à velocidade média medida); com `segundos` fixo (movimento reduzido), ficam
 * parados. Um ponto acima do limite da via leva o anel de excesso.
 */
export function posicoesDosCarros(
  segmentos: SegmentoCarros[],
  passagens: PassagemHora[],
  emFalha: ReadonlySet<string>,
  segundos: number,
  o: OpcoesCarros,
): PontoCarro[] {
  const n = pontosPorSegmento(passagens, emFalha, o);
  const porId = new Map(passagens.map((p) => [p.id, p]));
  const pontos: PontoCarro[] = [];
  for (const s of segmentos) {
    const k = n.get(s.id);
    const p = porId.get(s.id);
    if (!k || !p) continue;
    const grupos = p.velocidades_kmh ?? [];
    for (let i = 0; i < k; i++) {
      const kmh = velocidadeDoPonto(grupos, i, k);
      const ms = kmh !== null ? kmh / 3.6 : (p.vel_media_ms ?? 0);
      const avanco = ms * o.aceleracao * segundos;
      const d = (((i / k) * s.comprimento + avanco) % s.comprimento + s.comprimento) % s.comprimento;
      // O anel decide-se com o mesmo número que se escreve: «50» numa via de 50 não leva anel, mesmo que a mediana seja
      // 50,3 km/h; o limite também se arredonda (vem de m/s: 13,89 m/s dá 50,0004 km/h).
      const escrito = kmh === null ? null : Math.round(kmh);
      const acima = escrito !== null && p.limite_kmh !== null && p.limite_kmh !== undefined && escrito > Math.round(p.limite_kmh);
      pontos.push({ coord: pontoNaLinha(s, d), kmh: escrito, acima });
    }
  }
  return pontos;
}

/** O rumo da linha a `d` metros do início, em graus a partir do norte, no sentido de andar. */
export function rumoNaLinha(s: SegmentoCarros, d: number): number {
  let i = 1;
  while (i < s.acumulado.length - 1 && s.acumulado[i] < d) i++;
  const [a, b] = [s.linha[i - 1], s.linha[i]];
  const este = (b[0] - a[0]) * Math.cos(rad((a[1] + b[1]) / 2));
  return (Math.atan2(este, b[1] - a[1]) * 180) / Math.PI;
}

/** O texto da velocidade de um carro ao passar o rato: é a mediana de um grupo de veículos, nunca «este carro ia a X» (ADR-0039). */
export function textoDaVelocidade(kmh: number, acima: boolean): string {
  return `${kmh} km/h${acima ? ", acima do limite da via" : ""} (mediana de um grupo de veículos medidos)`;
}
