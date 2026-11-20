/** Interruptores das camadas do mapa. Cada separador só mostra as camadas que fazem sentido nele. */
import { config } from "../config";
import { camadaLigada, useEstadoDemo, type Camada } from "../estado/estado";
import { Recolhivel } from "./Basicos";

const ROTULOS: Record<Camada, string> = {
  sensores: "Sensores",
  falhas: "Falhas",
  estimados: "Estimados",
  previsao: `Previsão daqui a ${config.prever.horizonteH} h`,
  assinaladas: "Passadeiras assinaladas",
  risco: "Risco potencial",
  transito: "Trânsito",
  aerea: "Vista aérea",
  calorPeoes: "Calor · peões",
  calorVeiculos: "Calor · veículos",
};

export function camadasDoSeparador(separador: string, vista: string, aoVivo = false): Camada[] {
  // No mapa ao vivo (① e ④), só as camadas que se calculam com as deteções de agora (ADR-0055, ponto 3);
  // o calor fica fora do mapa de risco, como na semana. A vista aérea não se desenha no «Ao vivo», e por isso também não aparece.
  if (aoVivo) return separador === "proteger" && vista === "risco" ? ["transito"] : ["transito", "calorPeoes", "calorVeiculos"];
  // A vista aérea (ADR-0045, ponto 3) está em todos os separadores, por último.
  return [...camadasDoMapa(separador, vista), "aerea"];
}

function camadasDoMapa(separador: string, vista: string): Camada[] {
  // A camada «Trânsito» está no ① Vigiar, ligada por omissão (ADR-0034, ponto 7), e no ② e no ③, onde as figuras da vista 3D
  // andam com as estimativas e as previsões (ADR-0041, ponto 9).
  // Os mapas de calor (ADR-0047, ponto 6) em todos os separadores menos no mapa de risco, que já tem a sua escala.
  const calor: Camada[] = ["calorPeoes", "calorVeiculos"];
  if (separador === "vigiar") return ["sensores", "falhas", "transito", ...calor];
  if (separador === "completar") return ["sensores", "falhas", "estimados", "transito", ...calor];
  if (separador === "prever") return ["sensores", "previsao", "transito", ...calor];
  return vista === "risco" ? ["sensores", "risco", "estimados"] : ["sensores", "assinaladas", ...calor];
}

export function Camadas({ aoVivo = false }: { aoVivo?: boolean }) {
  const { estado, despachar } = useEstadoDemo();
  const camadas = camadasDoSeparador(estado.separador, estado.vistaProteger, aoVivo);
  const ligadas = camadas.filter((c) => camadaLigada(estado, c)).length;
  // Fechada por omissão, para não tapar o mapa; o título diz quantas camadas estão ligadas.
  return (
    <Recolhivel classe="camadas" icone="camadas" rotulo={`Camadas · ${ligadas} ligadas`} titulo="Camadas">
      <ul className="camadas__lista">
        {camadas.map((c) => {
          const ligada = camadaLigada(estado, c);
          return (
            <li key={c}>
              <button
                type="button"
                role="switch"
                aria-checked={ligada}
                className="interruptor"
                onClick={() => despachar({ tipo: "camada", camada: c })}
              >
                <span className="interruptor__trilho" aria-hidden="true" />
                {ROTULOS[c]}
              </button>
            </li>
          );
        })}
      </ul>
    </Recolhivel>
  );
}
