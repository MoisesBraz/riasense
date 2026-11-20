/**
 * Tempo da demo. Os Parquet guardam a hora UTC sem fuso, que em novembro é a hora local de Aveiro
 * (config: fuso_horario Europe/Lisbon, UTC+0). Por isso tudo se lê e se mostra em UTC: assim a demo
 * mostra as mesmas horas em qualquer máquina, seja qual for o fuso do browser.
 */
export const HORA_MS = 3_600_000;
const DIAS = ["dom", "seg", "ter", "qua", "qui", "sex", "sáb"];

/** ISO sem fuso (como vem da API) → milissegundos UTC. */
export function lerInstante(iso: string): number {
  const temFuso = /([zZ]|[+-]\d\d:?\d\d)$/.test(iso);
  const ms = Date.parse(temFuso ? iso : `${iso}Z`);
  if (Number.isNaN(ms)) throw new Error(`Data inválida: ${iso}`);
  return ms;
}

export function inicioDaHora(ms: number): number {
  return Math.floor(ms / HORA_MS) * HORA_MS;
}

/** Parâmetro `desde`/`ate` da API: ISO sem fuso, que a API lê como UTC. */
export function isoParaApi(ms: number): string {
  return new Date(ms).toISOString().slice(0, 19);
}

const dois = (n: number) => String(n).padStart(2, "0");

/** «04/11» */
export function rotuloDia(ms: number): string {
  const d = new Date(ms);
  return `${dois(d.getUTCDate())}/${dois(d.getUTCMonth() + 1)}`;
}

/** «20h» ou «20h06» */
export function rotuloHoras(ms: number, comMinutos = false): string {
  const d = new Date(ms);
  return comMinutos ? `${dois(d.getUTCHours())}h${dois(d.getUTCMinutes())}` : `${dois(d.getUTCHours())}h`;
}

/** «qua 04/11 · 20h», o rótulo do cursor de tempo. */
export function rotuloHora(ms: number): string {
  return `${DIAS[new Date(ms).getUTCDay()]} ${rotuloDia(ms)} · ${rotuloHoras(ms)}`;
}

/** Todas as horas inteiras entre dois instantes, inclusive. */
export function horasEntre(inicio: number, fim: number): number[] {
  const horas: number[] = [];
  for (let h = inicioDaHora(inicio); h <= fim; h += HORA_MS) horas.push(h);
  return horas;
}

/** Meias-noites dentro do período: as marcas do eixo (04, 05, …, 10). */
export function diasDoPeriodo(inicio: number, fim: number): number[] {
  const dias: number[] = [];
  const primeiro = Math.ceil(inicio / (24 * HORA_MS)) * 24 * HORA_MS;
  for (let d = primeiro; d <= fim; d += 24 * HORA_MS) dias.push(d);
  return dias;
}
