/**
 * Os peões da vista 3D (ADR-0041, ponto 3): só nas passadeiras, na quantidade medida. Cada figura vale cerca de
 * `travessiasPorFigura` travessias medidas nessa hora, até `figurasMax` por passadeira. O aspeto das figuras não vem dos dados:
 * quem atravessa não se mede.
 *
 * Os carros não passam por cima das pessoas (ADR-0043, opção b): as figuras esperam no passeio e só atravessam, todas juntas,
 * quando há uma aberta no trânsito, a 1,3 m/s × `aceleracao`. Os carros nunca param. A espera é só a animação (a legenda di-lo);
 * as quantidades são as medidas.
 */
import type { PassadeiraMapa } from "../api/tipos";
import { eixosDaPassadeira } from "./passadeiras";

/** O passo de quem atravessa (m/s), antes da aceleração. */
export const PASSO_MS = 1.3;
/** Margem para dentro do polígono, para as figuras não pisarem a borda (m). */
const MARGEM_M = 0.5;
/** As figuras esperam e atravessam umas atrás das outras, nesta distância (m). */
const ATRAS_M = 0.6;

export interface OpcoesPessoas {
  travessiasPorFigura: number;
  figurasMax: number;
  aceleracao: number;
}

export interface Pessoa3D {
  coord: [number, number];
  /** Para onde está virada, em graus a partir do norte. */
  rumo: number;
  /** Uma figura fixa da passadeira (0, 1, 2…): escolhe o modelo, sempre o mesmo para a mesma figura. */
  indice: number;
  /** A andar (a atravessar) ou parada no passeio, à espera. */
  andar: boolean;
  /** Estimada (②) ou prevista (③), e não medida: desenha-se translúcida (ADR-0041, ponto 9). */
  estimado?: boolean;
}

/** Uma passadeira pronta para a vista 3D: os eixos do retângulo e o curso de um passeio ao outro. */
export interface Passadeira3D {
  id: string;
  /** Comprimento da travessia e largura no sentido do trânsito (m). */
  L: number;
  S: number;
  /** De um passeio ao outro, já sem as margens (m). */
  curso: number;
  ponto: (a: number, b: number) => [number, number];
  rumo: number;
  /** Desfasa o ciclo de cada passadeira, para não abrirem todas ao mesmo tempo (0 a 1, fixo por id). */
  fase: number;
}

/** Um número fixo entre 0 e 1 a partir do id (FNV-1a): o mesmo id dá sempre o mesmo desfasamento. */
function semente(id: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < id.length; i++) h = Math.imul(h ^ id.charCodeAt(i), 0x01000193);
  return (h >>> 0) / 0x1_0000_0000;
}

export function prepararPassadeiras(passadeiras: PassadeiraMapa[]): Passadeira3D[] {
  return passadeiras.flatMap((p) => {
    if (p.geometry.type !== "Polygon") return [];
    const e = eixosDaPassadeira(p.geometry.coordinates[0]);
    if (!e) return [];
    return [{ id: p.properties.id, L: e.L, S: e.S, curso: Math.max(0.1, e.L - 2 * MARGEM_M), ponto: e.ponto, rumo: e.rumo, fase: semente(p.properties.id) }];
  });
}

/** Quantas figuras tem uma passadeira com `travessias` nesta hora: ≈ 1 por `travessiasPorFigura`, pelo menos 1, até ao teto. */
export function figurasDaPassadeira(travessias: number, o: OpcoesPessoas): number {
  if (!(travessias > 0)) return 0;
  return Math.min(o.figurasMax, Math.max(1, Math.round(travessias / o.travessiasPorFigura)));
}

/** Quanto tempo dura uma travessia, desde que a 1.ª figura sai até a última (2 × ATRAS_M atrás) chegar ao outro passeio (s). */
export function duracaoDaTravessia(p: Passadeira3D, o: OpcoesPessoas): number {
  return (p.curso + 2 * ATRAS_M) / (PASSO_MS * o.aceleracao);
}
