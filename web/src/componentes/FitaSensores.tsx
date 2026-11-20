/**
 * ① Vigiar: a linha do tempo no pop-up. Duas vistas (a fita na barra da hora saiu):
 * - `LinhaDoTempoSensor`: uma faixa só do sensor escolhido (passadeira ou zona turística);
 * - `LinhaDoTempoRsu`: os sensores de uma RSU (passadeiras, estacionamento, um resumo dos segmentos e a própria RSU).
 * Cada hora da semana é uma célula de uma faixa de calor: o verde é mais forte com mais atividade (só as passadeiras
 * têm a atividade medida), o vermelho são as falhas inesperadas, e depois da hora escolhida só fica a grelha: não se
 * antecipa o que ainda não aconteceu (ADR-0033).
 * A hora escolhida no cursor fica marcada com um contorno.
 */
import { useMemo, type ReactNode } from "react";
import { useFalhas, useIntervalos, useSensores } from "../api/recursos";
import type { Falha, Sensor } from "../api/tipos";
import { config } from "../config";
import { rotuloSensor } from "../dominio/formato";
import { ESTADO_DA_FALHA, type EspecieDoSensor, type EstadoSensor } from "../dominio/marcadores";
import { IconeTipo } from "./Simbolos";
import { HORA_MS, horasEntre, inicioDaHora, lerInstante, rotuloDia } from "../dominio/tempo";
import { falhaNaHora } from "../dominio/vigiar";
import { useEstadoDemo } from "../estado/estado";

/** Uma célula: «ok» com a intensidade da atividade (0 a 1), «falha» com a intensidade da falha, ou vazia. */
type Celula = { tipo: "ok" | "falha" | "vazia"; nivel: number };

const HORAS = horasEntre(config.periodo.inicio, config.periodo.fim);
const INICIO = HORAS[0];
const FIM = HORAS[HORAS.length - 1];
const pct = (t: number) => `${(((t - INICIO) / (FIM - INICIO)) * 100).toFixed(3)}%`;
const LARGURA = `${(100 / Math.max(1, HORAS.length - 1)).toFixed(3)}%`;

/** Travessias por hora (início da hora em ms) a partir dos intervalos de 15 min. */
function porHora(intervalos: { t: string; travessias: number }[]): Map<number, number> {
  const m = new Map<number, number>();
  for (const i of intervalos) {
    const h = inicioDaHora(lerInstante(i.t));
    m.set(h, (m.get(h) ?? 0) + i.travessias);
  }
  return m;
}

const nestaHora = (falhas: Falha[], h: number) => falhas.filter((f) => lerInstante(f.inicio) < h + HORA_MS && lerInstante(f.fim) >= h);
/**
 * Os estados do ADR-0033 de um sensor (ou de um resumo de sensores) à hora do cursor, para o ícone do tipo os levar:
 * «ativo», ou cada tipo de falha dessa hora (a rede primeiro). Num resumo pode haver os dois (os segmentos da RSU).
 */
const estadosNaHora = (falhas: Falha[], h: number): EstadoSensor[] => {
  const tipos = new Set(nestaHora(falhas, h).map((f) => f.tipo));
  const estados = (["rede", "dispositivo"] as const).filter((t) => tipos.has(t)).map((t) => ESTADO_DA_FALHA[t]);
  return estados.length ? estados : ["ativo"];
};
/** O estado dito em texto, para o leitor de ecrã e o título da linha («falha de rede e de dispositivo»). */
const textoDosEstados = (estados: EstadoSensor[]) => {
  const rede = estados.includes("falha-rede");
  const dispositivo = estados.includes("falha-dispositivo");
  return rede && dispositivo ? "falha de rede e de dispositivo" : rede ? "falha de rede" : dispositivo ? "falha de dispositivo" : "ativo";
};
const emFalhaNaHora = (falhas: Falha[], h: number) => nestaHora(falhas, h).length > 0;
const soEstado =
  (falhas: Falha[]) =>
  (h: number): Celula =>
    emFalhaNaHora(falhas, h) ? { tipo: "falha", nivel: 1 } : { tipo: "ok", nivel: 0.35 };

function Faixa({ hora, celula, rotulo }: { hora: number; celula: (h: number) => Celula; rotulo: string }) {
  return (
    <span className="fita__faixa" role="cell" aria-label={rotulo}>
      {HORAS.map((h) => {
        const c = celula(h);
        if (c.tipo === "vazia" || h > hora) return null;
        const classe = ["fita__celula", `fita__celula--${c.tipo}`, h === hora ? "fita__celula--agora" : ""].join(" ");
        return (
          <span key={h} className={classe} style={{ left: pct(h), width: LARGURA, opacity: 0.25 + 0.75 * c.nivel }} />
        );
      })}
    </span>
  );
}

/** A escala por baixo das faixas: os dias da semana. */
function Dias() {
  const dias = HORAS.filter((h) => new Date(h).getUTCHours() === 0);
  return (
    <div className="fita__dias" aria-hidden="true">
      {dias.map((d) => (
        <span key={d} style={{ left: pct(d) }}>
          {rotuloDia(d).slice(0, 5)}
        </span>
      ))}
    </div>
  );
}

function Legenda() {
  return (
    <span className="fita__legenda" aria-hidden="true">
      <i className="fita__amostra fita__amostra--ok" /> ativo
      <i className="fita__amostra fita__amostra--falha" /> falha
    </span>
  );
}

function Linha({
  nome,
  detalhe,
  especie,
  estados,
  children,
}: {
  nome: string;
  detalhe?: string;
  /** O tipo da linha: o ícone leva o estado à hora do cursor, como no mapa. O texto da linha já diz o tipo. */
  especie: EspecieDoSensor;
  /** O estado à hora do cursor: um, ou dois se o resumo mistura falhas de rede e de dispositivo. */
  estados: EstadoSensor[];
  children: ReactNode;
}) {
  // Os estados do ADR-0033, ditos pelo nome: «ativo», «falha de rede», «falha de dispositivo».
  const texto = textoDosEstados(estados);
  const emFalha = texto !== "ativo";
  return (
    <div className="fita__linha" role="row">
      <span className="fita__nome" role="rowheader">
        <IconeTipo especie={especie} estado={estados} decorativo />
        <span className="fita__titulo">
          {nome}
          {detalhe && <small>{detalhe}</small>}
        </span>
        <span
          className={`fita__estado ${emFalha ? "fita__estado--falha" : "fita__estado--ativo"}`}
          title={texto}
        >
          <span className="fita__ponto" aria-hidden="true" />
          <span className="so-leitor">{texto}</span>
        </span>
      </span>
      {children}
    </div>
  );
}

function FaixaPassadeira({ id, falhas, hora }: { id: string; falhas: Falha[]; hora: number }) {
  const { resultado } = useIntervalos(id);
  const valores = useMemo(() => (resultado.estado === "ok" ? porHora(resultado.dados) : new Map<number, number>()), [resultado]);
  const max = Math.max(1, ...valores.values());
  const celula = (h: number): Celula => {
    if (falhaNaHora(falhas, id, h)) return { tipo: "falha", nivel: 1 };
    const v = valores.get(h) ?? 0;
    return v > 0 ? { tipo: "ok", nivel: v / max } : { tipo: "vazia", nivel: 0 };
  };
  return <Faixa hora={hora} celula={celula} rotulo={`${rotuloSensor(id)} ao longo da semana`} />;
}

function Cartao({ titulo, comNomes, children }: { titulo: string; comNomes?: boolean; children: ReactNode }) {
  return (
    <section className="linha-tempo-cartao" aria-label={titulo}>
      <header className="linha-tempo-cartao__cabecalho">
        <h3 className="titulo-grupo">{titulo}</h3>
        <Legenda />
      </header>
      {children}
      {/* Os dias na mesma grelha das faixas: alinham por construção. */}
      {comNomes ? (
        <div className="fita__linha" aria-hidden="true">
          <span />
          <Dias />
        </div>
      ) : (
        <Dias />
      )}
    </section>
  );
}

/** A linha do tempo de um só sensor (passadeira ou zona turística): uma faixa. */
export function LinhaDoTempoSensor({ id }: { id: string }) {
  const { estado } = useEstadoDemo();
  const { resultado } = useFalhas();
  const falhas = resultado.estado === "ok" ? resultado.dados.filter((f) => f.sensor === id) : [];
  return (
    <Cartao titulo="Linha do tempo">
      <div className="fita fita--uma" role="table" aria-label={`${rotuloSensor(id)} ao longo da semana: ativo ou em falha`}>
        {id.includes("SmartCrosswalk") ? (
          <FaixaPassadeira id={id} falhas={falhas} hora={estado.hora} />
        ) : (
          <Faixa hora={estado.hora} celula={soEstado(falhas)} rotulo={`${rotuloSensor(id)} ao longo da semana`} />
        )}
      </div>
    </Cartao>
  );
}

/** A linha do tempo de uma RSU: os seus sensores, uma faixa cada (os segmentos num resumo). */
export function LinhaDoTempoRsu({ rsu }: { rsu: string }) {
  const { estado } = useEstadoDemo();
  const { resultado } = useFalhas();
  const sensoresR = useSensores();
  const falhas = resultado.estado === "ok" ? resultado.dados : [];
  const daRsu: Sensor[] =
    sensoresR.resultado.estado === "ok" ? sensoresR.resultado.dados.filter((s) => (s.rsus ?? (s.rsu ? [s.rsu] : [])).includes(rsu)) : [];
  const passadeiras = daRsu
    .filter((s) => s.tipo === "passadeira")
    .map((s) => s.id)
    .sort();
  const segmentos = daRsu.filter((s) => s.tipo === "segmento").map((s) => s.id);
  const falhasEstac = falhas.filter((f) => f.sensor === rsu && f.tipo_sensor === "estacionamento");
  const temEstacionamento = daRsu.some((s) => s.tipo === "estacionamento") || falhasEstac.length > 0;
  const falhasRede = falhas.filter((f) => f.rsu === rsu && f.tipo === "rede");
  const segSet = new Set(segmentos);
  const falhasSeg = falhas.filter((f) => segSet.has(f.sensor));
  const segEmFalha = (h: number) =>
    new Set(falhasSeg.filter((f) => lerInstante(f.inicio) < h + HORA_MS && lerInstante(f.fim) >= h).map((f) => f.sensor)).size;
  const hora = estado.hora;
  const nSeg = segEmFalha(hora);
  return (
    <Cartao titulo="Linha do tempo" comNomes>
      <div className="fita" role="table" aria-label="Sensores da RSU ao longo da semana: ativos ou em falha">
        {passadeiras.map((p) => (
          <Linha
            key={p}
            nome={rotuloSensor(p)}
            detalhe="passadeira"
            especie="passadeira"
            estados={estadosNaHora(
              falhas.filter((f) => f.sensor === p),
              hora,
            )}
          >
            <FaixaPassadeira id={p} falhas={falhas} hora={hora} />
          </Linha>
        ))}
        {temEstacionamento && (
          <Linha nome="Estacionamento" especie="estacionamento" estados={estadosNaHora(falhasEstac, hora)}>
            <Faixa hora={hora} celula={soEstado(falhasEstac)} rotulo="Estacionamento" />
          </Linha>
        )}
        {segmentos.length > 0 && (
          <Linha
            nome={`Segmentos · ${segmentos.length}`}
            detalhe={nSeg ? `${nSeg} em falha` : "ativos"}
            especie="segmento"
            estados={estadosNaHora(falhasSeg, hora)}
          >
            <Faixa
              hora={hora}
              celula={(h) => {
                const n = segEmFalha(h);
                return n > 0 ? { tipo: "falha", nivel: Math.min(1, 0.3 + n / segmentos.length) } : { tipo: "ok", nivel: 0.35 };
              }}
              rotulo={`Segmentos da ${rotuloSensor(rsu)}`}
            />
          </Linha>
        )}
        <Linha nome="Rede" detalhe={rotuloSensor(rsu)} especie="rsu" estados={estadosNaHora(falhasRede, hora)}>
          <Faixa hora={hora} celula={soEstado(falhasRede)} rotulo={`${rotuloSensor(rsu)}: rede`} />
        </Linha>
      </div>
    </Cartao>
  );
}
