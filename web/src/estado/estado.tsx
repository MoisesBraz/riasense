/**
 * Estado único da demo, partilhado pelos 4 separadores: a mesma zona, a mesma hora e o mesmo sensor em foco.
 * Trocar de separador só muda o que se lê; a hora e o sensor ficam. É isto que conta a história da RSU0030
 * como um fio: Vigiar → Completar → Prever → Proteger.
 */
import { createContext, useContext, useMemo, useReducer, type Dispatch, type ReactNode } from "react";
import type { TipoSensor } from "../api/tipos";
import { config } from "../config";
import { urn } from "../dominio/formato";
import { inicioDaHora } from "../dominio/tempo";

export type Separador = "vigiar" | "completar" | "prever" | "proteger";
export type VistaProteger = "abrandamento" | "risco";
export type Camada = "sensores" | "falhas" | "estimados" | "previsao" | "assinaladas" | "risco" | "transito" | "aerea" | "calorPeoes" | "calorVeiculos";

export const SEPARADORES: { id: Separador; rotulo: string }[] = [
  { id: "vigiar", rotulo: "Vigiar" },
  { id: "completar", rotulo: "Completar" },
  { id: "prever", rotulo: "Prever" },
  { id: "proteger", rotulo: "Proteger" },
];

export interface EstadoDemo {
  separador: Separador;
  vistaProteger: VistaProteger;
  /** Início da hora selecionada, em ms UTC. */
  hora: number;
  /** URN do sensor em foco (o gráfico da ② e o cartão do ponto). */
  foco: string;
  /** Pop-up aberto no mapa (ADR-0033, ponto 3): o sensor, e se o mapa se deve centrar nele (clique numa lista). */
  popup: { id: string; centrar: boolean; falha?: string } | null;
  /** «Onde pôr o próximo sensor» no mapa do Completar (ADR-0033, ponto 5). */
  proximo: boolean;
  /** Rua «sem cobertura» clicada no mapa (nome do OpenStreetMap, ou null se a rua não tiver nome). */
  rua: { nome: string | null } | null;
  camadasDesligadas: Camada[];
  /** ① Vigiar: o tipo de falha da lista (o chip escolhido por cima do mapa); null com a lista fechada (ADR-0048). */
  filtroVigiar: FiltroVigiar | null;
  /** ① Vigiar: o tipo de sensor da lista das falhas, que se combina com o tipo de falha (ADR-0048, ponto 5). */
  filtroSensor: FiltroSensor;
  /** A rua da pergunta por voz (ADR-0054), realçada, com o pop-up do seu troço aberto; `n` conta as perguntas, para a resposta se dizer uma vez. */
  ruaVoz: { nome: string; n: number } | null;
  /** ② a ④: o painel da direita fechado pelo ✕, para o mapa ocupar a largura toda. Mudar de separador volta a abri-lo. */
  painelFechado: boolean;
}

export type FiltroVigiar = "todas" | "rede" | "dispositivo";
export type FiltroSensor = "todos" | TipoSensor;

export type Acao =
  | { tipo: "separador"; separador: Separador }
  | { tipo: "vista-proteger"; vista: VistaProteger }
  | { tipo: "painel"; aberto: boolean }
  | { tipo: "hora"; hora: number }
  | { tipo: "foco"; sensor: string }
  | { tipo: "popup"; sensor: string | null; centrar?: boolean; falha?: string }
  | { tipo: "proximo" }
  | { tipo: "rua"; rua: EstadoDemo["rua"] }
  | { tipo: "camada"; camada: Camada }
  /** Muda o tipo de falha (e abre ou fecha a lista). Os chips mandam `sensor: "todos"`; o filtro da lista não mexe nele. */
  | { tipo: "filtro-vigiar"; filtro: FiltroVigiar | null; sensor?: FiltroSensor }
  | { tipo: "filtro-sensor"; sensor: FiltroSensor }
  /** Uma pergunta por voz (ou pela caixa de texto) reconheceu esta rua: abre o pop-up do troço `segmento`, o mesmo do clique. */
  | { tipo: "rua-voz"; nome: string; segmento: string };

export function estadoInicial(): EstadoDemo {
  return {
    separador: "vigiar",
    vistaProteger: "abrandamento",
    // A demo abre na hora em que a RSU0030 deixa de comunicar (demo.incidente.inicio).
    hora: inicioDaHora(config.incidenteInicio),
    foco: urn(config.zona.foco),
    popup: null,
    proximo: false,
    rua: null,
    // A vista aérea (ADR-0045, ponto 3) e os mapas de calor (ADR-0047, ponto 1) começam desligados.
    camadasDesligadas: ["aerea", "calorPeoes", "calorVeiculos"],
    filtroVigiar: null,
    filtroSensor: "todos",
    ruaVoz: null,
    painelFechado: false,
  };
}

function limitarHora(hora: number): number {
  const { inicio, fim } = config.periodo;
  return Math.min(Math.max(inicioDaHora(hora), inicioDaHora(inicio)), inicioDaHora(fim));
}

export function reduzir(estado: EstadoDemo, acao: Acao): EstadoDemo {
  switch (acao.tipo) {
    case "separador":
      return { ...estado, separador: acao.separador, rua: null, proximo: false, filtroVigiar: null, filtroSensor: "todos", painelFechado: false };
    case "painel":
      return { ...estado, painelFechado: !acao.aberto };
    case "vista-proteger":
      return { ...estado, separador: "proteger", vistaProteger: acao.vista };
    case "hora": {
      // Mudar a hora à mão deixa o pop-up mostrar a falha da hora escolhida, e não a da linha da lista (ADR-0053).
      const popup = estado.popup?.falha ? { id: estado.popup.id, centrar: estado.popup.centrar } : estado.popup;
      return { ...estado, hora: limitarHora(acao.hora), popup };
    }
    case "foco":
      return { ...estado, foco: urn(acao.sensor), rua: null };
    case "popup": {
      if (acao.sensor === null) return { ...estado, popup: null, ruaVoz: null };
      const id = urn(acao.sensor);
      // Abrir uma passadeira também a põe em foco (o painel acompanha o pop-up), exceto com o próximo sensor ligado:
      // aí os sítios são outros sensores, e o gráfico do Completar fica no sensor em falha.
      const foco = id.includes("SmartCrosswalk") && !estado.proximo ? id : estado.foco;
      // A linha da lista das falhas diz qual abriu (ADR-0053): numa RSU, o pop-up mostra a triagem dessa falha.
      const popup = { id, centrar: acao.centrar ?? false, ...(acao.falha ? { falha: acao.falha } : {}) };
      return { ...estado, foco, popup, rua: null, ruaVoz: null };
    }
    case "proximo":
      return { ...estado, proximo: !estado.proximo, popup: null };
    case "rua":
      return { ...estado, rua: acao.rua, popup: null };
    case "filtro-vigiar":
      return {
        ...estado,
        filtroVigiar: acao.filtro,
        filtroSensor: acao.filtro === null ? "todos" : (acao.sensor ?? estado.filtroSensor),
        popup: null,
        rua: null,
      };
    case "rua-voz":
      return {
        ...estado,
        ruaVoz: { nome: acao.nome, n: (estado.ruaVoz?.n ?? 0) + 1 },
        popup: { id: urn(acao.segmento), centrar: true },
        rua: null,
      };
    case "filtro-sensor":
      return { ...estado, filtroSensor: acao.sensor };
    case "camada": {
      const ligar = estado.camadasDesligadas.includes(acao.camada);
      let desligadas = ligar ? estado.camadasDesligadas.filter((c) => c !== acao.camada) : [...estado.camadasDesligadas, acao.camada];
      // Os 2 mapas de calor são exclusivos (ADR-0047, ponto 1): têm a mesma rampa, e juntos não se distinguiam.
      const outra = CALOR_EXCLUSIVO[acao.camada];
      if (ligar && outra && !desligadas.includes(outra)) desligadas = [...desligadas, outra];
      return { ...estado, camadasDesligadas: desligadas };
    }
  }
}

const Contexto = createContext<{ estado: EstadoDemo; despachar: Dispatch<Acao> } | null>(null);

export function EstadoDemoProvider({ children, inicial }: { children: ReactNode; inicial?: Partial<EstadoDemo> }) {
  const [estado, despachar] = useReducer(reduzir, undefined, () => ({ ...estadoInicial(), ...inicial }));
  const valor = useMemo(() => ({ estado, despachar }), [estado]);
  return <Contexto.Provider value={valor}>{children}</Contexto.Provider>;
}

export function useEstadoDemo() {
  const ctx = useContext(Contexto);
  if (!ctx) throw new Error("useEstadoDemo fora do EstadoDemoProvider");
  return ctx;
}

/** Ligar um mapa de calor desliga o outro (ADR-0047, ponto 1). */
const CALOR_EXCLUSIVO: Partial<Record<Camada, Camada>> = { calorPeoes: "calorVeiculos", calorVeiculos: "calorPeoes" };

export function camadaLigada(estado: EstadoDemo, camada: Camada): boolean {
  return !estado.camadasDesligadas.includes(camada);
}
