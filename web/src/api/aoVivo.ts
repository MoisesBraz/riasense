/**
 * O modo «Ao vivo» (ADR-0049): a nossa API lê o socket.io público do Aveiro Living Lab e a web pede-lhe o último retrato
 * 1 vez por segundo. A web nunca fala com o Living Lab. Entrar no modo abre a ligação (`POST /ao-vivo/ligar`) e sair
 * fecha-a (`POST /ao-vivo/desligar`); se a ligação cair, ou a API deixar de responder, a leitura diz «ligação perdida».
 */
import { useEffect, useState } from "react";
import { API_URL } from "../config";

/** Uma leitura por segundo (ADR-0049, ponto 1), se a API não disser outro `ao_vivo.intervalo_s`. */
const LEITURA_MS = 1000;
/** Limite de cada pedido: a ligação ao Living Lab pode demorar (o `limite_s` da API é 10 s). */
const LIMITE_MS = 4000;
/** O «há rede?» e o ligar esperam mais: a API tenta a ligação TCP até 3 vezes, de 2 s, antes de dizer «sem rede» (ADR-0055). */
const LIMITE_REDE_MS = 8000;
/**
 * Quantas leituras seguidas sem resposta (falhadas, ou acima de `LIMITE_MS`) até a web declarar «ligação perdida»: um soluço
 * da rede ou uma leitura lenta não tira do modo. A «ligação perdida» que vem da API (o socket caiu) continua a sair à primeira.
 */
const LEITURAS_ATE_PERDIDA = 3;

export const ETIQUETA_AO_VIVO =
  "Ao vivo · dados públicos do Aveiro Living Lab (IT), não validados. As camadas ao vivo usam os dados de agora; ② e ③ usam a semana gravada";

export interface EstacaoAoVivo {
  id: string;
  lat: number;
  lon: number;
  ativa: boolean;
  detecoes: number;
  /** O instante (ms) da deteção mais recente da estação; null se não deteta nada agora. */
  ultimo_dado: number | null;
  /** Os veículos e os peões de agora, já sem as deteções repetidas (ADR-0055, ponto 1): o número do marcador com pouco zoom. */
  veiculos?: number;
  peoes?: number;
}

export interface DetecaoAoVivo {
  id: string;
  estacao: string;
  lat: number;
  lon: number;
  /** A `classification` do Living Lab: pedestrian, passengerCar, bus, lightTruck, motorcycle, cyclist, moliceiro… */
  classe: string;
  sensor: string;
  /** m/s */
  velocidade: number | null;
  /** graus a partir do norte; nos parados, o último rumo a andar ou o da rua (ADR-0055, ponto 1) */
  direcao: number | null;
  /** Lento (abaixo de `ao_vivo.parado_ms`) há mais de `ao_vivo.parado_s`: desenha-se mais discreto e sem número. */
  parado?: boolean;
  /** O sensor do dataset a que a deteção se liga pela posição (a passadeira ou o segmento; ADR-0055, ponto 2). */
  liga?: string | null;
  /** O segmento onde está passa o limite da via agora (a mediana dos que circulam): o anel do ADR-0039. */
  acima?: boolean;
}

/** O risco potencial ao vivo de uma passadeira (ADR-0055, ponto 6): de 0 a 1, nos 5 degraus da semana gravada. */
interface RiscoAoVivo {
  valor: number;
  exposicao_pct: number;
  /** O comportamento da semana (a ④), fixo por passadeira; null com semáforo (ADR-0024). */
  comportamento_pct: number | null;
  semaforo: boolean;
}

/** Um sensor do dataset, ao vivo (ADR-0055): o agora (na janela móvel, por hora), o esperado e o risco ou a velocidade. */
export interface SensorAoVivo {
  id: string;
  tipo: "passadeira" | "segmento";
  /** Ids distintos na janela móvel. */
  n: number;
  /** Os minutos da janela (até 15). */
  minutos: number;
  /** Se uma fonte viva do Living Lab vê este sensor; sem ela, «Sem dados ao vivo» e não 0 (ADR-0007). */
  coberto?: boolean;
  /** Por hora; null enquanto a janela é curta (menos de `minima_min`) ou sem cobertura. */
  por_hora: number | null;
  /** A janela mínima para haver número por hora (`ao_vivo.janela_minima_s` do config), em minutos. */
  minima_min?: number;
  /** O perfil típico da semana gravada daqui a 1 h e a 3 h (não é a previsão da ③). */
  esperado_1h: number | null;
  esperado_3h: number | null;
  risco?: RiscoAoVivo | null;
  velocidade_kmh?: number | null;
  acima?: boolean;
  limite_kmh?: number | null;
  /** O segmento é medido pelo radar (leva a ressalva do radar). */
  radar?: boolean;
}

export interface RetratoAoVivo {
  estacoes: EstacaoAoVivo[];
  detecoes: DetecaoAoVivo[];
  /** Os sensores do dataset, ao vivo (ADR-0055); vazio se a API não tiver os perfis. */
  sensores?: SensorAoVivo[];
  /** Quando a API recebeu o retrato (ms, relógio da API). */
  recebido: number | null;
  /** Quando chegou à web (`performance.now()`): os pontos andam do retrato anterior para este durante `intervalo_ms`. */
  chegada: number;
  /** O ritmo das leituras (`ao_vivo.intervalo_s` do config). */
  intervalo_ms: number;
}

type EstadoAoVivo = "a ligar" | "ligado" | "sem rede" | "ligação perdida" | "desligado";

export interface LeituraAoVivo {
  estado: EstadoAoVivo;
  anterior: RetratoAoVivo | null;
  atual: RetratoAoVivo | null;
}

const url = (caminho: string) => new URL(API_URL + caminho, globalThis.location?.origin ?? "http://localhost").toString();
const agoraMs = () => (typeof performance !== "undefined" ? performance.now() : Date.now());

async function pedir(caminho: string, metodo: "GET" | "POST" = "GET", limiteMs = LIMITE_MS): Promise<Record<string, unknown> | null> {
  const controlo = new AbortController();
  const prazo = setTimeout(() => controlo.abort(), limiteMs);
  try {
    const resposta = await fetch(url(caminho), { method: metodo, signal: controlo.signal, keepalive: metodo === "POST" });
    return resposta.ok ? ((await resposta.json()) as Record<string, unknown>) : null;
  } catch {
    return null;
  } finally {
    clearTimeout(prazo);
  }
}

const ESTADOS: EstadoAoVivo[] = ["a ligar", "ligado", "sem rede", "ligação perdida", "desligado"];
const estadoDe = (corpo: Record<string, unknown> | null): EstadoAoVivo | null =>
  corpo && ESTADOS.includes(corpo.estado as EstadoAoVivo) ? (corpo.estado as EstadoAoVivo) : null;

export type DisponivelAoVivo = "a perguntar" | "com rede" | "sem rede" | "desligado";

/**
 * Pode-se ligar? Só se pergunta quando a janela do indicador abre: a API abre e fecha uma ligação TCP, sem entrar no modo.
 * Com `ao_vivo.ativo: false` (só em caso de avaria), ou sem a API, «desligado»: o botão esconde-se.
 */
export function useAoVivoDisponivel(perguntar: boolean): DisponivelAoVivo {
  const [estado, setEstado] = useState<DisponivelAoVivo>("a perguntar");
  useEffect(() => {
    if (!perguntar) return;
    let vivo = true;
    setEstado("a perguntar");
    void pedir("/ao-vivo/disponivel", "GET", LIMITE_REDE_MS).then((corpo) => {
      if (vivo) setEstado(!corpo ? "desligado" : corpo.disponivel === true ? "com rede" : "sem rede");
    });
    return () => {
      vivo = false;
    };
  }, [perguntar]);
  return estado;
}

const intervaloDe = (corpo: Record<string, unknown> | null) =>
  typeof corpo?.intervalo_s === "number" && corpo.intervalo_s > 0 ? corpo.intervalo_s * 1000 : LEITURA_MS;

function retratoDe(corpo: Record<string, unknown>): RetratoAoVivo | null {
  if (!Array.isArray(corpo.estacoes) || !Array.isArray(corpo.detecoes)) return null;
  return {
    estacoes: corpo.estacoes as EstacaoAoVivo[],
    detecoes: corpo.detecoes as DetecaoAoVivo[],
    sensores: Array.isArray(corpo.sensores) ? (corpo.sensores as SensorAoVivo[]) : [],
    recebido: typeof corpo.recebido === "number" ? corpo.recebido : null,
    chegada: agoraMs(),
    intervalo_ms: intervaloDe(corpo),
  };
}

/**
 * Enquanto `ativo`, liga e lê ao ritmo do config (1 vez por segundo); ao sair, desliga. Guarda os 2 últimos retratos (para os pontos andarem
 * de um para o outro). Só ao fim de `LEITURAS_ATE_PERDIDA` leituras seguidas sem resposta da API é que conta como ligação perdida; até lá, o
 * mapa fica com o último retrato, e uma leitura boa põe a contagem a 0.
 */
export function useAoVivo(ativo: boolean): LeituraAoVivo {
  const [leitura, setLeitura] = useState<LeituraAoVivo>({ estado: "a ligar", anterior: null, atual: null });
  useEffect(() => {
    if (!ativo) return;
    let vivo = true;
    let proxima: ReturnType<typeof setTimeout> | undefined;
    let semResposta = 0;
    let intervalo = LEITURA_MS;
    const ler = async () => {
      const corpo = await pedir("/ao-vivo");
      if (!vivo) return;
      const declarado = estadoDe(corpo);
      if (declarado === null) {
        // Sem resposta: tenta-se de novo ao mesmo ritmo, com o último retrato no mapa; à 3.ª seguida, sai-se.
        semResposta += 1;
        if (semResposta < LEITURAS_ATE_PERDIDA) proxima = setTimeout(ler, intervalo);
        else setLeitura((l) => ({ ...l, estado: "ligação perdida" }));
        return;
      }
      semResposta = 0;
      intervalo = intervaloDe(corpo);
      const estado = declarado;
      const retrato = corpo && estado === "ligado" ? retratoDe(corpo) : null;
      setLeitura((l) => (retrato ? { estado, anterior: l.atual, atual: retrato } : { ...l, estado }));
      if (estado === "a ligar" || estado === "ligado") proxima = setTimeout(ler, intervalo);
    };
    setLeitura({ estado: "a ligar", anterior: null, atual: null });
    void pedir("/ao-vivo/ligar", "POST", LIMITE_REDE_MS).then((corpo) => {
      if (!vivo) return;
      const estado = estadoDe(corpo);
      if (estado === "a ligar" || estado === "ligado") void ler();
      else setLeitura({ estado: estado ?? "sem rede", anterior: null, atual: null });
    });
    return () => {
      vivo = false;
      clearTimeout(proxima);
      void pedir("/ao-vivo/desligar", "POST"); // nada fica ligado depois de sair (ADR-0049, ponto 2)
      setLeitura({ estado: "a ligar", anterior: null, atual: null }); // e nada fica na memória da web
    };
  }, [ativo]);
  return leitura;
}
