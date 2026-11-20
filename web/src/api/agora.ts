/**
 * Painel «agora» (ADR-0030, ADR-0032): lê `GET /agora` ao ritmo da fonte e manda os botões do simulador.
 * Não passa pela cache dos outros recursos: o estado muda a cada leitura. Sem resposta dentro do limite de tempo,
 * o painel diz «sem ligação ao Living Lab», e o resto da demo continua igual.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { API_URL } from "../config";

export const ETIQUETA_SIMULADOR =
  "Simulação com dados fictícios, gerados a partir da semana de 3 a 10/11 — não são dados reais";

/** Limite de tempo de cada pedido, em ms (ADR-0030, riscos). */
const LIMITE_MS = 5000;

export interface SensorAgora {
  id: string;
  tipo: "passadeira" | "segmento";
  rsus: string[];
  passadeiras: string[];
  ultimo_dado_min: number;
  limite_min: number | null;
  calado: boolean;
  /** O silêncio já cumpre a falha inesperada (`vigiar.falha_min_horas`): o «sem comunicação» (o campo `calado`) passa a vermelho. */
  falha?: boolean;
}

export interface RsuAgora {
  id: string;
  passadeiras: string[];
  ultimo_dado_min: number;
  limite_min: number | null;
  calado: boolean;
  falha?: boolean;
}

export interface EstadoAgora {
  fonte: string;
  etiqueta: string;
  hora_simulada: string;
  velocidade: number;
  leitura_ms: number;
  prob_max: number;
  falha: { rsu: string; ativa: boolean };
  sensores: SensorAgora[];
  rsus: RsuAgora[];
}

export type LeituraAgora =
  | { estado: "a-carregar" }
  | { estado: "ok"; dados: EstadoAgora }
  | { estado: "desligado" } // agora.ativo: false, ou uma API sem o painel: não se mostra nada
  | { estado: "sem-ligacao" }
  | { estado: "por-calcular"; motivo: string };

async function pedir(caminho: string, metodo: "GET" | "POST"): Promise<LeituraAgora> {
  const url = new URL(API_URL + caminho, globalThis.location?.origin ?? "http://localhost").toString();
  const controlo = new AbortController();
  const prazo = setTimeout(() => controlo.abort(), LIMITE_MS);
  try {
    const resposta = await fetch(url, { method: metodo, signal: controlo.signal });
    const corpo = await resposta.json().catch(() => null);
    if (resposta.ok && corpo && Array.isArray(corpo.sensores)) return { estado: "ok", dados: corpo as EstadoAgora };
    if (resposta.status === 503 && corpo?.estado === "por calcular") return { estado: "por-calcular", motivo: String(corpo.motivo ?? "") };
    if (resposta.status === 503 && corpo?.estado === "sem ligação") return { estado: "sem-ligacao" };
    return { estado: "desligado" };
  } catch {
    return { estado: "sem-ligacao" };
  } finally {
    clearTimeout(prazo);
  }
}

const lerAgora = () => pedir("/agora", "GET");
/** Abrir o painel recria o simulador às 19h50: o relógio só anda a partir daqui (ADR-0032). */
const iniciarSimulador = () => pedir("/agora/simulador/iniciar", "POST");
const simularFalha = () => pedir("/agora/simulador/falha", "POST");
const reporSimulador = () => pedir("/agora/simulador/repor", "POST");

/** O painel existe nesta API? Um só pedido, ao abrir a demo, que não cria o simulador nem põe o relógio a andar. */
async function agoraDisponivel(): Promise<boolean> {
  const url = new URL(API_URL + "/agora/disponivel", globalThis.location?.origin ?? "http://localhost").toString();
  const controlo = new AbortController();
  const prazo = setTimeout(() => controlo.abort(), LIMITE_MS);
  try {
    const resposta = await fetch(url, { signal: controlo.signal });
    const corpo = await resposta.json().catch(() => null);
    return resposta.ok && corpo?.disponivel === true;
  } catch {
    return false;
  } finally {
    clearTimeout(prazo);
  }
}

export function useAgoraDisponivel(): boolean {
  const [disponivel, setDisponivel] = useState(false);
  useEffect(() => {
    let vivo = true;
    agoraDisponivel().then((d) => vivo && setDisponivel(d));
    return () => {
      vivo = false;
    };
  }, []);
  return disponivel;
}

/** Lê o painel ao ritmo da fonte (`leitura_ms`: 1 s a ×60) enquanto está aberto. */
/**
 * O simulador do modo «agora», só enquanto `ativo`: ao ligar pede o «iniciar» (o relógio começa às 19h50); ao desligar
 * pára as leituras e esquece o estado, para a próxima abertura não mostrar o anterior.
 */
export function useAgora(ativo = true) {
  const [leitura, setLeitura] = useState<LeituraAgora>({ estado: "a-carregar" });
  const vivo = useRef(true);
  const proxima = useRef<ReturnType<typeof setTimeout>>(undefined);

  const aplicar = useCallback((r: LeituraAgora) => {
    if (!vivo.current) return;
    setLeitura(r);
    clearTimeout(proxima.current);
    const espera = r.estado === "ok" ? Math.max(250, r.dados.leitura_ms) : 5000;
    proxima.current = setTimeout(() => lerAgora().then(aplicar), espera);
  }, []);

  useEffect(() => {
    if (!ativo) return;
    vivo.current = true;
    iniciarSimulador().then(aplicar); // abrir o painel começa às 19h50; as leituras seguintes só leem
    return () => {
      vivo.current = false;
      clearTimeout(proxima.current);
      setLeitura({ estado: "a-carregar" });
    };
  }, [aplicar, ativo]);

  const falha = useCallback(() => simularFalha().then(aplicar), [aplicar]);
  const repor = useCallback(() => reporSimulador().then(aplicar), [aplicar]);
  return { leitura, falha, repor };
}
