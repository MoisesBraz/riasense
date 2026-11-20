/**
 * O modo «agora» (ADR-0030, ADR-0032): o simulador alimenta o mapa, a faixa no topo e os avisos no canto.
 * Fora do modo, o contexto é null e a demo fica igual.
 */
import { createContext, useContext, useMemo, type ReactNode } from "react";
import { useAgora, type LeituraAgora } from "../api/agora";

export interface ModoAgora {
  leitura: LeituraAgora;
  falha: () => void;
  repor: () => void;
  fechar: () => void;
}

const Contexto = createContext<ModoAgora | null>(null);

/**
 * O contexto do modo. A árvore por baixo é sempre a mesma, com o modo aberto ou fechado: abrir o modo não volta a
 * montar o mapa (o MapLibre, os modelos 3D e a medição dos fps, ADR-0041), só lhe muda os marcadores.
 */
export function AgoraProvider({ ativo, onFechar, children }: { ativo: boolean; onFechar: () => void; children: ReactNode }) {
  const { leitura, falha, repor } = useAgora(ativo); // abrir o modo chama o «iniciar»: o relógio começa às 19h50
  const valor = useMemo(() => (ativo ? { leitura, falha, repor, fechar: onFechar } : null), [ativo, leitura, falha, repor, onFechar]);
  return <Contexto.Provider value={valor}>{children}</Contexto.Provider>;
}

/** O modo «agora», ou null fora dele. */
export const useModoAgora = () => useContext(Contexto);
