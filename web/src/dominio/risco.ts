/** Mapa de risco potencial (ADR-0007, ADR-0013): da pontuação de 0 a 1 da API aos 5 degraus do desenho. */
import type { LinhaRisco } from "../api/tipos";

export type Nivel = 1 | 2 | 3 | 4 | 5;

/**
 * Degrau de 1 a 5 em faixas iguais de 0,2. A pontuação já é uma soma pesada de percentis (0 a 1), por isso as
 * faixas iguais não acrescentam nenhum critério; os degraus só dão a leitura rápida do desenho («menor» a «maior»).
 */
export function nivelDoRisco(risco: number): Nivel {
  return Math.min(5, Math.max(1, Math.floor(risco * 5) + 1)) as Nivel;
}

/** As linhas de uma hora, da maior para a menor pontuação. */
export function pontosPorRisco(linhas: LinhaRisco[]): LinhaRisco[] {
  return [...linhas].sort((a, b) => b.risco_potencial - a.risco_potencial);
}

/** Componente em percentil (0–1) → 0–100, como no cartão do ponto. */
export const percentil = (v: number | null): number | null => (v === null ? null : Math.round(v * 100));
