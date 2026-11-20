/**
 * Tema claro ou escuro. Segue o sistema até a pessoa escolher; a escolha fica no browser (só conveniência,
 * por isso a leitura e a escrita estão protegidas: em modo privado o armazenamento pode falhar).
 * O tema aplica-se ao <html> logo na troca, e não num efeito: o mapa lê as cores dos tokens nos seus próprios
 * efeitos, que correm antes dos do componente pai.
 */
import { useCallback, useState } from "react";

export type Tema = "claro" | "escuro";
const CHAVE = "riasense.tema";

function guardado(): Tema | null {
  try {
    const v = localStorage.getItem(CHAVE);
    return v === "claro" || v === "escuro" ? v : null;
  } catch {
    return null;
  }
}

function doSistema(): Tema {
  return typeof matchMedia === "function" && matchMedia("(prefers-color-scheme: light)").matches ? "claro" : "escuro";
}

function aplicarTema(tema: Tema): void {
  document.documentElement.dataset.theme = tema === "claro" ? "light" : "dark";
}

export function useTema() {
  const [tema, setTema] = useState<Tema>(() => {
    const inicial = guardado() ?? doSistema();
    aplicarTema(inicial);
    return inicial;
  });

  const alternar = useCallback(() => {
    const novo: Tema = document.documentElement.dataset.theme === "light" ? "escuro" : "claro";
    aplicarTema(novo);
    try {
      localStorage.setItem(CHAVE, novo);
    } catch {
      /* sem armazenamento: o tema vale só nesta sessão */
    }
    setTema(novo);
  }, []);

  return { tema, alternar };
}
