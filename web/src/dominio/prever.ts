/** ③ Prever: a zona daqui a h horas (o horizonte principal, ADR-0027), por vertical, a partir de `/prever/previsoes`. */
import { config } from "../config";
import type { Previsao, Sensor, TipoSensor } from "../api/tipos";
import { HORA_MS, lerInstante } from "./tempo";

/** O horizonte da previsão no painel, na lista e no pop-up do Prever (um só sítio para trocar quando houver 3 e 6 h). */
export const HORIZONTE_H = config.prever.horizonteH; // o 1.º de prever.horizontes_h (ADR-0027): 3 h

const VERTICAIS: { tipo: TipoSensor; vertical: string; unidade: string }[] = [
  { tipo: "segmento", vertical: "Mobilidade", unidade: "veículos/h" },
  { tipo: "passadeira", vertical: "Segurança rodoviária", unidade: "travessias/h" },
  { tipo: "zona", vertical: "Turismo e espaço", unidade: "visitas/h" },
  { tipo: "estacionamento", vertical: "Estacionamento", unidade: "ocupação" },
];

export interface LinhaVertical {
  tipo: TipoSensor;
  vertical: string;
  unidade: string;
  /** Sensores deste tipo na zona (RSU da demo). */
  naZona: number;
  /** Sensores da zona com previsão para a hora prevista. */
  comPrevisao: number;
  previsao: number | null;
  referencia: number | null;
}

/** A zona é a RSU da demo: os sensores ligados a ela (campo `rsus`) ou cuja RSU principal é ela. */
export function sensoresDaRsu(sensores: Sensor[], rsu: string): Sensor[] {
  return sensores.filter((s) => s.rsu === rsu || (s.rsus ?? []).includes(rsu) || s.id === rsu);
}

/**
 * Previsão para `horizonteH` horas depois do cursor, por vertical. Contagens somam-se na zona; a ocupação do estacionamento
 * faz-se pela média, porque é uma fração. Uma vertical sem previsão fica a null: nunca se preenche.
 */
export function previsaoPorVertical(previsoes: Previsao[], sensoresZona: Sensor[], hora: number, horizonteH: number): LinhaVertical[] {
  const alvo = hora + horizonteH * HORA_MS;
  return VERTICAIS.map(({ tipo, vertical, unidade }) => {
    const ids = new Set(sensoresZona.filter((s) => s.tipo === tipo).map((s) => s.id));
    const linhas = previsoes.filter((p) => ids.has(p.id) && lerInstante(p.t) === alvo);
    const agregar = (vals: number[]) =>
      vals.length === 0 ? null : tipo === "estacionamento" ? vals.reduce((a, b) => a + b, 0) / vals.length : vals.reduce((a, b) => a + b, 0);
    const refs = linhas.map((l) => l.referencia).filter((r): r is number => r !== null);
    return {
      tipo,
      vertical,
      unidade,
      naZona: ids.size,
      comPrevisao: linhas.length,
      previsao: agregar(linhas.map((l) => l.previsao)),
      referencia: refs.length === linhas.length ? agregar(refs) : null,
    };
  });
}

export function periodoDasPrevisoes(previsoes: Previsao[]): { inicio: number; fim: number } | null {
  if (previsoes.length === 0) return null;
  const ts = previsoes.map((p) => lerInstante(p.t));
  return { inicio: Math.min(...ts), fim: Math.max(...ts) };
}

/** Previsão para `horizonteH` horas depois do cursor, por sensor (para o halo no mapa). */
export function previsaoPorSensor(previsoes: Previsao[], hora: number, horizonteH: number): Map<string, number> {
  const alvo = hora + horizonteH * HORA_MS;
  return new Map(previsoes.filter((p) => lerInstante(p.t) === alvo).map((p) => [p.id, p.previsao]));
}

/**
 * Uma linha de `avaliacao_prever`. O `horizonte_h` e o `erro_persistencia` são recentes (ADR-0027): sem
 * eles, a avaliação é a 1 h e só contra a referência. Assim o painel serve com e sem eles.
 */
export interface LinhaAvaliacaoPrever {
  tipo: string;
  erro_referencia: number;
  erro_sem_meteo: number;
  erro_com_meteo: number;
  meteo_melhora: boolean;
  ganha: boolean;
  horizonte_h?: number;
  erro_persistencia?: number;
}

export interface ContraReferencia {
  erro: number;
  referencia: number;
  /** 1 − erro ÷ erro da referência: 0,32 = erra 32 % menos. */
  menosQueReferencia: number;
  persistencia: number | null;
  menosQuePersistencia: number | null;
  ganham: number;
  tipos: number;
}

/** Quanto menos erra a previsão de um tipo do que a referência (e a persistência, se houver), num horizonte. */
export function contraReferencia(linhas: LinhaAvaliacaoPrever[], tipo: string, horizonte = 1): ContraReferencia | null {
  const doHorizonte = linhas.filter((l) => l.horizonte_h === undefined || l.horizonte_h === horizonte);
  const l = doHorizonte.find((x) => x.tipo === tipo);
  if (!l) return null;
  const erro = l.meteo_melhora ? l.erro_com_meteo : l.erro_sem_meteo;
  const persistencia = l.erro_persistencia ?? null;
  return {
    erro,
    referencia: l.erro_referencia,
    menosQueReferencia: 1 - erro / l.erro_referencia,
    persistencia,
    menosQuePersistencia: persistencia ? 1 - erro / persistencia : null,
    ganham: doHorizonte.filter((x) => x.ganha).length,
    tipos: doHorizonte.length,
  };
}

/** As passadeiras com previsão para a hora do horizonte, da maior para a menor (a lista do painel do Prever). */
export function maioresPrevisoes(previsoes: Previsao[], hora: number, tipo: TipoSensor = "passadeira", n = 5): Previsao[] {
  const alvo = hora + HORIZONTE_H * HORA_MS;
  return previsoes
    .filter((p) => p.tipo === tipo && lerInstante(p.t) === alvo)
    .sort((a, b) => b.previsao - a.previsao)
    .slice(0, n);
}
