/** Publica a altura de um elemento numa variável CSS da raiz (por exemplo, `--altura-barra-hora`), sempre atualizada. */
import { useEffect, useRef } from "react";

export function useAlturaCss<T extends HTMLElement>(variavel: string) {
  const ref = useRef<T>(null);
  useEffect(() => {
    const el = ref.current;
    if (!el || typeof ResizeObserver === "undefined") return;
    const raiz = document.documentElement.style;
    const obs = new ResizeObserver(() => raiz.setProperty(variavel, `${el.offsetHeight}px`));
    obs.observe(el);
    return () => {
      obs.disconnect();
      raiz.removeProperty(variavel);
    };
  }, [variavel]);
  return ref;
}
