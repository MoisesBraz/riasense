/** API falsa para os testes: responde por caminho, como a FastAPI (200 com `dados`, 503 «por calcular», 404). */
import { vi } from "vitest";
import { AVALIACAO_COMPLETAR, AVALIACAO_PREVER, FALHAS, INTERVALOS, LUMINOSIDADE, PASSADEIRAS_MAPA, PREVISOES, PROTEGER, PROXIMO_SENSOR, RISCO, SENSORES, VIRTUAIS } from "./dados";

type Resposta = { status?: number; corpo: unknown } | "sem-ligacao";

export const ok = (dados: unknown[]): Resposta => ({ corpo: { dados, n: dados.length, limite: 10000, deslocamento: 0 } });
export const porCalcular = (motivo: string): Resposta => ({ status: 503, corpo: { estado: "por calcular", motivo } });

export const naoExiste: Resposta = { status: 404, corpo: { detail: "Not Found" } };

/** A API do `main` a 17/11: todas as camadas com dados (os testes forçam 503, 404 ou falta de ligação quando precisam). */
const API_DO_DIA: Record<string, Resposta> = {
  "/sensores": ok(SENSORES),
  "/vigiar/falhas": ok(FALHAS),
  "/completar/sensores-virtuais": ok(VIRTUAIS),
  "/completar/avaliacao": ok(AVALIACAO_COMPLETAR),
  "/completar/proximo-sensor": ok(PROXIMO_SENSOR),
  "/proteger/intervalos": ok(INTERVALOS),
  "/proteger/passadeiras": ok(PROTEGER),
  "/proteger/risco-potencial": ok(RISCO),
  "/prever/previsoes": ok(PREVISOES),
  "/prever/avaliacao": ok(AVALIACAO_PREVER),
  "/contexto/luminosidade": ok(LUMINOSIDADE),
  "/mapa/passadeiras": ok(PASSADEIRAS_MAPA),
};

export function falsificarApi(rotas: Record<string, Resposta> = {}) {
  const todas = { ...API_DO_DIA, ...rotas };
  // `_init` fica na assinatura para os testes verem o método (os botões do painel «agora» fazem POST).
  const fetchFalso = vi.fn(async (pedido: RequestInfo | URL, _init?: RequestInit) => {
    const caminho = new URL(String(pedido)).pathname;
    const r = todas[caminho] ?? naoExiste;
    if (r === "sem-ligacao") throw new TypeError("Failed to fetch");
    return new Response(JSON.stringify(r.corpo), { status: r.status ?? 200, headers: { "content-type": "application/json" } });
  });
  vi.stubGlobal("fetch", fetchFalso);
  return fetchFalso;
}
