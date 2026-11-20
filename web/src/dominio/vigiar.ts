/** ① Vigiar: resumos das falhas inesperadas tal como vêm de `/vigiar/falhas`. */
import type { Falha } from "../api/tipos";
import { HORA_MS, inicioDaHora, lerInstante } from "./tempo";

export interface ResumoFalhas {
  total: number;
  incidentesRede: number;
  falhasRede: number;
  dispositivo: number;
}

export function resumirFalhas(falhas: Falha[]): ResumoFalhas {
  const rede = falhas.filter((f) => f.tipo === "rede");
  return {
    total: falhas.length,
    incidentesRede: new Set(rede.map((f) => f.grupo)).size,
    falhasRede: rede.length,
    dispositivo: falhas.length - rede.length,
  };
}

export interface Incidente {
  rsu: string;
  falhas: Falha[];
  primeiroInicio: number;
  ultimoInicio: number;
  fim: number;
  emCurso: boolean;
  duracaoH: number;
}

/** O incidente de rede da RSU da zona (o grupo de falhas «rede» mais antigo dessa RSU). */
export function incidenteDeRede(falhas: Falha[], rsu: string): Incidente | null {
  const daRsu = falhas.filter((f) => f.tipo === "rede" && f.rsu === rsu);
  if (daRsu.length === 0) return null;
  const grupo = [...daRsu].sort((a, b) => lerInstante(a.inicio) - lerInstante(b.inicio))[0].grupo;
  const doGrupo = daRsu.filter((f) => f.grupo === grupo);
  const inicios = doGrupo.map((f) => lerInstante(f.inicio));
  return {
    rsu,
    falhas: doGrupo,
    primeiroInicio: Math.min(...inicios),
    ultimoInicio: Math.max(...inicios),
    fim: Math.max(...doGrupo.map((f) => lerInstante(f.fim))),
    emCurso: doGrupo.some((f) => f.em_curso),
    duracaoH: Math.max(...doGrupo.map((f) => f.duracao_h)),
  };
}

/**
 * Desde quando a RSU está em falha de rede a esta hora, ou null: o início mais cedo dos grupos de rede em curso, com
 * todas as falhas do grupo, como o `primeiroInicio` do cartão do incidente (o pop-up e o painel dizem a mesma hora).
 */
export function redeDesde(falhas: Falha[], rsu: string, hora: number): number | null {
  const rede = falhas.filter((f) => f.tipo === "rede" && f.rsu === rsu);
  const grupos = new Set(rede.filter((f) => falhaNaHora([f], f.sensor, hora)).map((f) => f.grupo));
  const inicios = rede.filter((f) => grupos.has(f.grupo)).map((f) => lerInstante(f.inicio));
  return inicios.length ? Math.min(...inicios) : null;
}

/** A falha que toca esta hora num sensor, se houver: a hora das 20h conta a falha que começa às 20h06. */
export function falhaNaHora(falhas: Falha[], sensor: string, hora: number): Falha | undefined {
  return falhas.find((f) => f.sensor === sensor && lerInstante(f.inicio) < hora + HORA_MS && lerInstante(f.fim) >= hora);
}

/**
 * A falha que o pop-up mostra à hora escolhida (ADR-0053): se a hora tiver duas falhas do mesmo sensor (uma acaba no instante
 * em que começa a seguinte, como no 10962, que passa de rede a dispositivo às 18h31 de 05/11), a que começou mais tarde.
 */
export function falhaDoPopup(falhas: Falha[], sensor: string, hora: number): Falha | undefined {
  let escolhida: Falha | undefined;
  for (const f of falhas) {
    if (f.sensor !== sensor || lerInstante(f.inicio) >= hora + HORA_MS || lerInstante(f.fim) < hora) continue;
    if (!escolhida || lerInstante(f.inicio) > lerInstante(escolhida.inicio)) escolhida = f;
  }
  return escolhida;
}

/** A chave de uma falha: o sensor e o início. É também a do `Alert` em `falhas.jsonld` (ADR-0008). */
export const chaveDaFalha = (f: Falha) => `${f.sensor}|${f.inicio}`;

/** Os grupos da ordem de intervenção: as em curso no fim dos dados, depois as de rede, e por fim as outras. */
const grupoDaOrdem = (f: Falha) => (f.em_curso ? 0 : f.tipo === "rede" ? 1 : 2);

/**
 * A ordem de intervenção para o IT (ADR-0053, ponto 1): primeiro as falhas ainda em curso no fim dos dados, depois as de rede
 * (deixam vários sensores sem comunicação de uma vez), e por fim as outras; em cada grupo pelo início, a mais antiga primeiro, e um empate
 * desfaz-se pelo id do sensor. É uma ordem sugerida, não uma prioridade medida. Conta-se sobre todas as falhas, por isso o
 * número de uma falha não muda com os filtros da lista.
 */
export function ordemDeIntervencao(falhas: Falha[]): Map<string, number> {
  const ordenadas = [...falhas].sort(
    (a, b) =>
      grupoDaOrdem(a) - grupoDaOrdem(b) ||
      lerInstante(a.inicio) - lerInstante(b.inicio) ||
      (a.sensor < b.sensor ? -1 : a.sensor > b.sensor ? 1 : 0),
  );
  return new Map(ordenadas.map((f, i) => [chaveDaFalha(f), i + 1]));
}

/** Uma hora em que começa pelo menos uma falha: um ponto no traço da barra da hora. */
export interface InicioDeFalhas {
  /** O início da hora. */
  hora: number;
  /** O instante da primeira falha dessa hora (onde o ponto se desenha). */
  instante: number;
  sensores: string[];
  /** Há pelo menos uma falha de rede nesta hora. */
  rede: boolean;
  rsus: string[];
}

/**
 * O «batimento» da barra da hora: quantos sensores estão em falha em cada hora (uma falha conta numa hora se se sobrepõe a
 * ela) e as horas em que começam falhas, agrupadas por hora, para não haver pontos uns em cima dos outros (às 20h de 04/11
 * começam 9 de uma vez, na RSU0030).
 */
export function pulsoDasFalhas(falhas: Falha[], horas: number[]): { emFalha: number[]; inicios: InicioDeFalhas[] } {
  const intervalos = falhas.map((f) => ({ f, ini: lerInstante(f.inicio), fim: lerInstante(f.fim) }));
  const emFalha = horas.map((h) => intervalos.filter(({ ini, fim }) => ini < h + HORA_MS && fim > h).length);
  const porHora = new Map<number, InicioDeFalhas>();
  for (const { f, ini } of [...intervalos].sort((a, b) => a.ini - b.ini)) {
    const hora = inicioDaHora(ini);
    const g = porHora.get(hora) ?? { hora, instante: ini, sensores: [], rede: false, rsus: [] };
    g.sensores.push(f.sensor);
    g.rede ||= f.tipo === "rede";
    if (f.tipo === "rede" && f.rsu && !g.rsus.includes(f.rsu)) g.rsus.push(f.rsu);
    porHora.set(hora, g);
  }
  return { emFalha, inicios: [...porHora.values()] };
}
