/**
 * As luzes dos semáforos da vista 3D (ilustrativas: não há dados da fase dos semáforos). O dos carros faz verde → amarelo →
 * vermelho → amarelo → verde, em ciclo (o amarelo também do vermelho para o verde); o dos peões está verde só
 * quando o dos carros está vermelho. Os semáforos de uma passadeira mudam juntos. O tempo é o real, não o relógio da semana.
 */
export type LuzCarros = "verde" | "amarelo" | "vermelho";
export type LuzPeoes = "verde" | "vermelho";

/** As fases do ciclo dos carros e a duração de cada uma, em segundos. */
const CICLO: readonly { carros: LuzCarros; s: number }[] = [
  { carros: "verde", s: 6 },
  { carros: "amarelo", s: 2 },
  { carros: "vermelho", s: 6 },
  { carros: "amarelo", s: 2 },
];
export const DURACAO_CICLO_S = CICLO.reduce((t, f) => t + f.s, 0);

/** Com «reduzir movimento», o ciclo fica parado neste estado: os peões a verde. */
const PARADO: { carros: LuzCarros; peoes: LuzPeoes } = { carros: "vermelho", peoes: "verde" };

/** As luzes acesas no instante `segundos` (tempo real), e quantos segundos faltam para a fase seguinte. */
export function luzesDoSemaforo(segundos: number, parado = false): { carros: LuzCarros; peoes: LuzPeoes; faltaS: number } {
  if (parado) return { ...PARADO, faltaS: Infinity };
  let t = ((segundos % DURACAO_CICLO_S) + DURACAO_CICLO_S) % DURACAO_CICLO_S;
  for (const f of CICLO) {
    if (t < f.s) return { carros: f.carros, peoes: f.carros === "vermelho" ? "verde" : "vermelho", faltaS: f.s - t };
    t -= f.s;
  }
  return { carros: "verde", peoes: "vermelho", faltaS: CICLO[0].s }; // não se chega aqui: t < DURACAO_CICLO_S
}
