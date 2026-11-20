/**
 * Luminosidade da hora (ADR-0018): dia, crepúsculo ou noite, pela posição do sol (`/contexto/luminosidade`).
 * É só contexto, para o cursor de hora e o cartão: o escuro não entra no risco potencial.
 */
import type { HoraLuminosidade } from "../api/tipos";
import { lerInstante } from "./tempo";

const ROTULOS: Record<HoraLuminosidade["luminosidade"], string | null> = {
  dia: null,
  crepusculo: "ao crepúsculo",
  noite: "às escuras",
};

/** A luminosidade de uma hora: dia, crepúsculo ou noite. */
export type Luz = HoraLuminosidade["luminosidade"];

/** A luminosidade da hora, ou undefined se não houver dado para ela (a API em baixo, ou fora da semana). */
export function luzDaHora(linhas: HoraLuminosidade[], hora: number): Luz | undefined {
  return linhas.find((l) => lerInstante(l.t) === hora)?.luminosidade;
}

/** «às escuras», «ao crepúsculo» ou null (de dia, ou sem dado para essa hora). */
export function rotuloLuz(linhas: HoraLuminosidade[], hora: number): string | null {
  const luz = luzDaHora(linhas, hora);
  return luz ? ROTULOS[luz] : null;
}

/** O ícone de cada luminosidade no cursor de hora (ADR-0040), e o nome que o diz por extenso. */
export const ICONE_DA_LUZ = { dia: "sol", crepusculo: "crepusculo", noite: "lua" } as const;
export const NOME_DA_LUZ: Record<Luz, string> = { dia: "de dia", crepusculo: "ao crepúsculo", noite: "às escuras" };
