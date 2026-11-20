/**
 * Lista de sensores de um painel (ADR-0033, ponto 4): clicar numa linha centra o mapa nesse sensor e abre o pop-up.
 * Cada linha leva o ícone do tipo (passadeira, zona, RSU), o mesmo do marcador no mapa, junto ao nome.
 */
import type { ReactNode } from "react";
import { useEstadoDemo } from "../estado/estado";
import { IconeTipo } from "./Simbolos";

export function ListaSensores({ rotulo, children, numerada = false }: { rotulo: string; children: ReactNode; numerada?: boolean }) {
  const Lista = numerada ? "ol" : "ul";
  return (
    <Lista className="lista-sensores" aria-label={rotulo}>
      {children}
    </Lista>
  );
}

/** `antes` é o que vem à frente do ícone (a posição, o degrau do risco, o estado): o ícone do tipo fica sempre junto ao nome. */
export function LinhaSensor({ id, antes, children, className = "" }: { id: string; antes?: ReactNode; children: ReactNode; className?: string }) {
  const { estado, despachar } = useEstadoDemo();
  return (
    <li className={className}>
      <button
        type="button"
        className="lista-sensores__botao"
        aria-pressed={estado.popup?.id === id}
        onClick={() => despachar({ tipo: "popup", sensor: id, centrar: true })}
      >
        {antes}
        <IconeTipo id={id} />
        {children}
      </button>
    </li>
  );
}
