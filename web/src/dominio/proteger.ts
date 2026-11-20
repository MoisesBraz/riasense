/** ④ Proteger: resumos de `/proteger/passadeiras` (efeito por +N travessias, IC 95 %, placebo). */
import type { PassadeiraProteger } from "../api/tipos";

export interface ResumoProteger {
  abrandam: number;
  total: number;
  /** % de veículos acima do limite na zona, nos intervalos movimentados e nos calmos (mínimo e máximo). */
  acimaMovimentados: [number, number] | null;
  acimaCalmos: [number, number] | null;
}

const minMax = (vals: number[]): [number, number] | null =>
  vals.length ? [Math.min(...vals), Math.max(...vals)] : null;

export function resumirProteger(passadeiras: PassadeiraProteger[], zona: Set<string>): ResumoProteger {
  const daZona = passadeiras.filter((p) => zona.has(p.id));
  return {
    abrandam: passadeiras.filter((p) => p.abranda).length,
    total: passadeiras.length,
    acimaMovimentados: minMax(daZona.map((p) => p.pct_acima_limite_movimentados)),
    acimaCalmos: minMax(daZona.map((p) => p.pct_acima_limite_calmos)),
  };
}

/**
 * Linhas do gráfico do efeito: por omissão, as passadeiras da zona e as assinaladas de fora (as que contam a
 * história); com `todas`, as 24.
 */
export function linhasDoEfeito(passadeiras: PassadeiraProteger[], zona: Set<string>, todas: boolean): PassadeiraProteger[] {
  return passadeiras
    .filter((p) => todas || zona.has(p.id) || p.assinalada)
    .sort((a, b) => a.id.localeCompare(b.id));
}

/**
 * Dias de dados da ④ a partir de `n_intervalos`: «6 dias de dados», ou «1 dia de dados, antes da falha da
 * RSU0030» nas passadeiras da zona da falha, onde o pipeline corta os intervalos no início da falha.
 * Abaixo de meio dia, em horas.
 */
export function diasDeDados(nIntervalos: number, intervaloMin: number, rsuDaFalha: string | null = null): string {
  const horas = (nIntervalos * intervaloMin) / 60;
  const dias = Math.round(horas / 24);
  const texto = dias >= 1 ? `${dias} ${dias === 1 ? "dia" : "dias"} de dados` : `${Math.round(horas)} h de dados`;
  return rsuDaFalha ? `${texto}, antes da falha da ${rsuDaFalha}` : texto;
}

/** De onde vem o semáforo (ADR-0019), com a atribuição que a ODbL pede. */
export const FONTE_SEMAFORO = "OpenStreetMap, fonte aberta, por validar com a Câmara · © contribuidores do OpenStreetMap";
