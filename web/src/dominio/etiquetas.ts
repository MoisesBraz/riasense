/**
 * Etiquetas que outros ADR exigem com o texto exato (ADR-0033, ponto 4). Não contam para os limites de palavras
 * do pop-up (25) nem do «ⓘ» (40). Algumas ainda não estão no `main` (fontes abertas, reprodução, simulador): ficam
 * já aqui para não contarem quando entrarem.
 */
export const ETIQUETAS_OBRIGATORIAS = [
  "não mede acidentes", // ADR-0013
  "Redução potencial estimada", // ADR-0015
  "hipótese", // ADR-0015
  "Dados recolhidos de fontes abertas", // ADR-0017 a ADR-0019 e ADR-0022
  "às escuras", // ADR-0018
  "reprodução da semana", // ADR-0029
  "Simulação com dados fictícios", // ADR-0032
  "estimado", // GLOSSARY
] as const;

export const MAX_PALAVRAS_POPUP = 25;
export const MAX_PALAVRAS_INFO = 40;

const escapar = (t: string) => t.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/**
 * Palavras de um texto, sem as etiquetas obrigatórias. Conta tudo o que tem uma letra (nomes como «SC0020» e horas
 * como «20h06» contam); números e sinais sozinhos («0,34», «·», «−») não contam.
 */
export function contarPalavras(texto: string): number {
  const semEtiquetas = ETIQUETAS_OBRIGATORIAS.reduce((t, e) => t.replace(new RegExp(escapar(e), "gi"), " "), texto);
  return semEtiquetas.split(/\s+/).filter((p) => /\p{L}/u.test(p)).length;
}
