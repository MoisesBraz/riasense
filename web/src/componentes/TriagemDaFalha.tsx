/**
 * A triagem de uma falha para o IT (ADR-0053), no pop-up do ① Vigiar: por onde começar, sempre como «Sugestão» (a ① só sabe
 * que um sensor, ou vários da mesma RSU, deixaram de enviar dados; não é um diagnóstico), e o botão que copia o `Alert`
 * NGSI-LD dessa falha, tal como está em `falhas.jsonld` (ADR-0008), sem formato novo.
 */
import { useState } from "react";
import { lerCamada } from "../api/cliente";
import type { Falha } from "../api/tipos";
import { rotuloSensor } from "../dominio/formato";
import { Botao } from "./Basicos";

const SUGESTAO: Record<Falha["tipo"], string> = {
  rede: "Sugestão: começar pela ligação da RSU.",
  dispositivo: "Sugestão: começar pelo próprio sensor.",
};

type Copia = { estado: "parado" | "a-copiar" | "copiado" } | { estado: "manual"; texto: string } | { estado: "erro" };

/** `doSensor`: a falha é do sensor do pop-up. Numa RSU, a falha pode ser de um segmento dela, e a linha diz qual. */
export function TriagemDaFalha({ falha, ordem, doSensor }: { falha: Falha; ordem?: number; doSensor: boolean }) {
  const [copia, setCopia] = useState<Copia>({ estado: "parado" });
  const copiar = async () => {
    setCopia({ estado: "a-copiar" });
    const r = await lerCamada<object>("/vigiar/falhas/alerta", { sensor: falha.sensor, inicio: falha.inicio });
    if (r.estado !== "ok" || r.dados.length !== 1) {
      setCopia({ estado: "erro" });
      return;
    }
    const texto = JSON.stringify(r.dados[0], null, 2);
    try {
      // Sem a área de transferência (http sem localhost, ou o browser não deixa), mostra-se o texto para copiar à mão.
      if (!navigator.clipboard?.writeText) throw new Error("sem área de transferência");
      await navigator.clipboard.writeText(texto);
      setCopia({ estado: "copiado" });
    } catch {
      setCopia({ estado: "manual", texto });
    }
  };
  return (
    <section className="triagem" aria-label="Triagem para o IT">
      <p className="popup__linha">
        {ordem !== undefined && <strong className="triagem__ordem">{ordem}.º </strong>}
        {!doSensor && `${rotuloSensor(falha.sensor)}: `}
        {SUGESTAO[falha.tipo]}
      </p>
      <div className="triagem__copiar">
        <Botao variante="secundario" onClick={copiar} disabled={copia.estado === "a-copiar"}>
          Copiar alerta NGSI-LD
        </Botao>
        <span className="triagem__estado" role="status">
          {copia.estado === "copiado" ? "Copiado" : copia.estado === "erro" ? "A API não deu o alerta. Tente de novo." : ""}
        </span>
      </div>
      {copia.estado === "manual" && (
        <>
          <p className="popup__nota">Não foi possível usar a área de transferência: selecione o texto e copie-o.</p>
          <textarea
            className="triagem__texto"
            aria-label="Alerta NGSI-LD"
            readOnly
            rows={6}
            value={copia.texto}
            ref={(t) => t?.select()}
          />
        </>
      )}
    </section>
  );
}
