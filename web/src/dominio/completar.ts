/** ② Completar: a série de um sensor (parte medida + parte estimada) e o que o intervalo diz da incerteza. */
import type { ProximoSensor } from "../api/recursos";
import type { IntervaloProteger, SensorVirtual } from "../api/tipos";
import { inicioDaHora, lerInstante } from "./tempo";

export interface PontoReal {
  t: number;
  valor: number;
}

export interface PontoVirtual {
  t: number;
  estimativa: number;
  inf: number;
  sup: number;
  fimDeSemana: boolean;
}

/** Travessias medidas por hora: soma dos 4 intervalos de 15 min de `/proteger/intervalos`. */
export function travessiasPorHora(intervalos: IntervaloProteger[]): PontoReal[] {
  const porHora = new Map<number, number>();
  for (const i of intervalos) {
    const h = inicioDaHora(lerInstante(i.t));
    porHora.set(h, (porHora.get(h) ?? 0) + i.travessias);
  }
  return [...porHora.entries()].sort((a, b) => a[0] - b[0]).map(([t, valor]) => ({ t, valor }));
}

export function serieVirtual(virtuais: SensorVirtual[], sensor: string): PontoVirtual[] {
  return virtuais
    .filter((v) => v.id === sensor)
    .map((v) => ({ t: lerInstante(v.t), estimativa: v.estimativa, inf: v.inf, sup: v.sup, fimDeSemana: v.fim_de_semana }))
    .sort((a, b) => a.t - b.t);
}

export function virtualNaHora(serie: PontoVirtual[], hora: number): PontoVirtual | undefined {
  return serie.find((p) => p.t === hora);
}

/** Sensores da lista que têm estimativa nesta hora (os que a ② está a preencher). */
export function estimadosNaHora(virtuais: SensorVirtual[], hora: number): Set<string> {
  return new Set(virtuais.filter((v) => lerInstante(v.t) === hora).map((v) => v.id));
}

/**
 * Quantas vezes o intervalo é mais largo ao fim de semana: média da largura relativa (sup − inf) / estimativa,
 * com o mesmo piso de 1 evento/h do pipeline (`completar.piso_eventos_h`) para a noite não dividir por ~0.
 */
export function razaoLarguraFimDeSemana(serie: PontoVirtual[]): number | null {
  const media = (pts: PontoVirtual[]) =>
    pts.length ? pts.reduce((s, p) => s + (p.sup - p.inf) / Math.max(p.estimativa, 1), 0) / pts.length : null;
  const util = media(serie.filter((p) => !p.fimDeSemana));
  const fds = media(serie.filter((p) => p.fimDeSemana));
  return util && fds ? fds / util : null;
}

export function horasPreenchidas(serie: PontoVirtual[]): { n: number; inicio: number; fim: number } | null {
  if (serie.length === 0) return null;
  return { n: serie.length, inicio: serie[0].t, fim: serie[serie.length - 1].t };
}

/** Redução potencial estimada mínima para um sítio aparecer no mapa (ADR-0033, ponto 5). */
const REDUCAO_MIN = 0.01;

/**
 * «Onde pôr o próximo sensor» no mapa (ADR-0033, ponto 5): só as passadeiras do ranking com redução potencial
 * estimada ≥ 0,01, pela ordem, numeradas de 1 em diante. As zonas turísticas ainda não têm marcador.
 */
export function sitiosDoProximo(locais: ProximoSensor[]): (ProximoSensor & { posicao: number })[] {
  return locais
    .filter((l) => l.tipo === "passadeira" && l.motivo === "ranking" && l.ordem !== null && (l.reducao_potencial ?? 0) >= REDUCAO_MIN)
    .sort((a, b) => (a.ordem ?? 0) - (b.ordem ?? 0))
    .map((l, i) => ({ ...l, posicao: i + 1 }));
}

/**
 * Os sensores em «verificar o sensor» a esta hora. Na reprodução da semana só ficam «Atenção» a partir do 1.º dia da
 * janela em que se mede a queda, para não se antecipar o que ainda não aconteceu (ADR-0033, ponto 1).
 */
export function emAtencao(locais: ProximoSensor[], hora: number, desde: number): Set<string> {
  if (hora < desde) return new Set();
  return new Set(locais.filter((l) => l.motivo === "verificar o sensor").map((l) => l.id));
}
