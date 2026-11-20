/**
 * O cabeçalho do painel da direita no ②, no ③, no ④ e no mapa de risco: a pergunta e o ✕ «Fechar o painel», com o mesmo
 * botão do «Fechar a lista» do ① (ADR-0033). Fechado, o mapa ocupa a largura toda; o botão «Abrir o painel» do mapa volta a abri-lo.
 */
import type { ReactNode } from "react";
import { useEstadoDemo } from "../estado/estado";
import { Pergunta } from "./Basicos";
import { Icone } from "./Icone";

export function CabecalhoDoPainel({ titulo, info }: { titulo: string; info?: ReactNode | string[] }) {
  const { despachar } = useEstadoDemo();
  return (
    <header className="detalhe__cabecalho">
      <Pergunta titulo={titulo} info={info} />
      <button type="button" className="botao-icone" aria-label="Fechar o painel" onClick={() => despachar({ tipo: "painel", aberto: false })}>
        <Icone nome="fechar" />
      </button>
    </header>
  );
}
