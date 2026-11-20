/** Verdadeiro a partir de 760 px (ponto de quebra do Figma entre móvel e desktop). */
import { useEffect, useState } from "react";

const CONSULTA = "(min-width: 760px)";

export function useEcraLargo(): boolean {
  const [largo, setLargo] = useState(() => typeof matchMedia !== "function" || matchMedia(CONSULTA).matches);
  useEffect(() => {
    if (typeof matchMedia !== "function") return;
    const mq = matchMedia(CONSULTA);
    const mudar = () => setLargo(mq.matches);
    mq.addEventListener("change", mudar);
    return () => mq.removeEventListener("change", mudar);
  }, []);
  return largo;
}
