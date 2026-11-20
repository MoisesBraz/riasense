/**
 * Os mapas de calor (ADR-0047): uma nuvem por sensor, centrada nele, com a medida da hora escolhida. Só onde há sensor (ADR-0007).
 * - Peões: as passadeiras (travessias da hora) e as zonas turísticas (visitas da hora), cada uma no seu ponto.
 * - Veículos: o meio de cada segmento com câmara ou radar (os veículos medidos nessa hora, ADR-0034).
 * Nas horas de falha entra o estimado da ②; onde nem a ② tem valor, não há nuvem. Cada tipo normaliza-se pelo seu máximo da semana
 * (`/mapa/calor/maximos`, que já inclui os estimados); a camada (heatmap) soma os sensores próximos, para mostrar as zonas com mais movimento.
 */
import type { SensorVirtual } from "../api/tipos";
import type { SegmentoCarros } from "./carros";

type TipoCalor = "passadeiras" | "zonas" | "segmentos";
export type MaximosCalor = Record<TipoCalor, { maximo: number }>;

interface NuvemCalor {
  type: "Feature";
  properties: { id: string; tipo: TipoCalor; valor: number; intensidade: number; estimado: boolean };
  geometry: { type: "Point"; coordinates: [number, number] };
}
export interface ColecaoCalor {
  type: "FeatureCollection";
  features: NuvemCalor[];
}

/** O ponto a meio do segmento (o mesmo ponto para os 2 sentidos da mesma rua, que assim se somam). */
export function meioDoSegmento(s: SegmentoCarros): [number, number] {
  const metade = s.comprimento / 2;
  let i = 1;
  while (i < s.acumulado.length - 1 && s.acumulado[i] < metade) i++;
  const [a, b] = [s.linha[i - 1], s.linha[i]];
  const troco = s.acumulado[i] - s.acumulado[i - 1];
  const f = troco > 0 ? (metade - s.acumulado[i - 1]) / troco : 0;
  return [a[0] + (b[0] - a[0]) * f, a[1] + (b[1] - a[1]) * f];
}

/** O valor medido da hora, ou o estimado da ② se o sensor está em falha nessa hora (e não há medida). */
function valorDaHora(id: string, medidos: ReadonlyMap<string, number>, estimados: ReadonlyMap<string, number>) {
  const m = medidos.get(id);
  if (m !== undefined) return { valor: m, estimado: false };
  const e = estimados.get(id);
  return e !== undefined ? { valor: e, estimado: true } : null;
}

/** Os estimados da ② para a hora: só as linhas marcadas como estimadas (o sensor em falha). */
export function estimadosDaHora(virtuais: SensorVirtual[], hora: number, lerInstante: (t: string) => number): Map<string, number> {
  return new Map(virtuais.filter((v) => v.estimado && lerInstante(v.t) === hora).map((v) => [v.id, v.estimativa]));
}

function nuvens(
  pontos: { id: string; coord: [number, number] }[],
  tipo: TipoCalor,
  medidos: ReadonlyMap<string, number>,
  estimados: ReadonlyMap<string, number>,
  maximos: MaximosCalor,
): NuvemCalor[] {
  const max = maximos[tipo].maximo;
  return pontos.flatMap(({ id, coord }) => {
    const v = valorDaHora(id, medidos, estimados);
    if (!v || !(v.valor > 0) || !(max > 0)) return [];
    // Raiz quadrada: a medida tem cauda longa (nos segmentos, a mediana é 3 % do máximo), e sem ela quase tudo ficava invisível.
    const intensidade = Math.sqrt(Math.min(1, v.valor / max));
    return [{ type: "Feature" as const, properties: { id, tipo, valor: v.valor, intensidade, estimado: v.estimado }, geometry: { type: "Point" as const, coordinates: coord } }];
  });
}

/** As nuvens dos peões: passadeiras (travessias) e zonas turísticas (visitas). */
export function calorDosPeoes(
  passadeiras: { id: string; coord: [number, number] }[],
  zonas: { id: string; coord: [number, number] }[],
  travessias: ReadonlyMap<string, number>,
  visitas: ReadonlyMap<string, number>,
  estimados: ReadonlyMap<string, number>,
  maximos: MaximosCalor,
): ColecaoCalor {
  return {
    type: "FeatureCollection",
    features: [...nuvens(passadeiras, "passadeiras", travessias, estimados, maximos), ...nuvens(zonas, "zonas", visitas, estimados, maximos)],
  };
}

/** As nuvens dos veículos: o meio de cada segmento com câmara ou radar. */
export function calorDosVeiculos(
  segmentos: SegmentoCarros[],
  veiculos: ReadonlyMap<string, number>,
  estimados: ReadonlyMap<string, number>,
  maximos: MaximosCalor,
): ColecaoCalor {
  const pontos = segmentos.map((s) => ({ id: s.id, coord: meioDoSegmento(s) }));
  return { type: "FeatureCollection", features: nuvens(pontos, "segmentos", veiculos, estimados, maximos) };
}

/** Diz-se no «ⓘ»: alguma nuvem desta hora é estimada (ADR-0047, ponto 3). */
export function incluiEstimados(...colecoes: (ColecaoCalor | null)[]): boolean {
  return colecoes.some((c) => c?.features.some((f) => f.properties.estimado));
}
