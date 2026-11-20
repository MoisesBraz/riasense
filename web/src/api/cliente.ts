/**
 * Leitura da API. Cada pedido acaba num de quatro estados, que os painéis desenham com os estados do Figma:
 * a carregar, dados, «por calcular» (503 da API: o Parquet da camada ainda não existe) e erro.
 * Nunca se inventa um valor: sem dados, mostra-se o estado.
 */
import { API_URL } from "../config";

export type Resultado<T> =
  | { estado: "a-carregar" }
  | { estado: "ok"; dados: T[] }
  | { estado: "por-calcular"; motivo: string }
  | { estado: "erro"; tipo: "sem-ligacao" | "http"; mensagem: string };

export type Parametros = Record<string, string | number | undefined>;

/** A API aceita até 10 000 linhas por página; pede-se página a página até vir uma incompleta. */
const LIMITE = 10_000;

function urlDe(caminho: string, params: Parametros, deslocamento: number): string {
  // A base resolve um API_URL relativo (/api, na mesma origem: ADR-0028); um endereço absoluto ignora-a.
  const url = new URL(API_URL + caminho, globalThis.location?.origin ?? "http://localhost");
  for (const [chave, valor] of Object.entries(params)) {
    if (valor !== undefined) url.searchParams.set(chave, String(valor));
  }
  url.searchParams.set("limite", String(LIMITE));
  url.searchParams.set("deslocamento", String(deslocamento));
  return url.toString();
}

async function pagina<T>(url: string, sinal?: AbortSignal): Promise<Resultado<T>> {
  let resposta: Response;
  try {
    resposta = await fetch(url, { signal: sinal });
  } catch (e) {
    if (sinal?.aborted) throw e;
    return { estado: "erro", tipo: "sem-ligacao", mensagem: `A API não responde em ${API_URL}.` };
  }
  const corpo = await resposta.json().catch(() => null);
  if (resposta.status === 503 && corpo?.estado === "por calcular") {
    return { estado: "por-calcular", motivo: String(corpo.motivo ?? "") };
  }
  // Um endpoint que a API ainda não tem é, para a demo, um resultado por calcular.
  if (resposta.status === 404) {
    return { estado: "por-calcular", motivo: `a API ainda não serve ${new URL(url).pathname}` };
  }
  if (!resposta.ok) {
    return { estado: "erro", tipo: "http", mensagem: `A API respondeu ${resposta.status}.` };
  }
  if (!Array.isArray(corpo?.dados)) {
    return { estado: "erro", tipo: "http", mensagem: "A resposta da API não tem `dados`." };
  }
  return { estado: "ok", dados: corpo.dados as T[] };
}

export async function lerCamada<T>(caminho: string, params: Parametros = {}, sinal?: AbortSignal): Promise<Resultado<T>> {
  const linhas: T[] = [];
  for (let deslocamento = 0; ; deslocamento += LIMITE) {
    const r = await pagina<T>(urlDe(caminho, params, deslocamento), sinal);
    if (r.estado !== "ok") return r;
    linhas.push(...r.dados);
    if (r.dados.length < LIMITE) return { estado: "ok", dados: linhas };
  }
}
