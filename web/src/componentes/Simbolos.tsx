/**
 * Os símbolos do estado do sensor (ADR-0033, ponto 1). Um só desenho para o marcador, a legenda, o pop-up, os
 * chips e a lista: a cor nunca vem sozinha (WCAG 1.4.1) e cada símbolo tem pelo menos 3:1 contra o mapa e o cartão (1.4.11).
 *
 * São 6, e não há mais nenhum no mapa:
 * - Ativo: círculo cheio, verde.
 * - Atenção: círculo vazio, âmbar.
 * - Falha de rede: círculo vermelho com o sinal cortado (arcos com um traço diagonal); a RSU leva também o halo.
 * - Falha de dispositivo: quadrado magenta com o aparelho com aviso.
 * - Estimado: círculo tracejado, na cor da falha que o sensor virtual preenche.
 * - Sem cobertura: a linha cinzenta da rua (não é um marcador).
 *
 * O marcador do mapa é o distintivo do TIPO (passadeira, zona, RSU), que repete o tratamento do estado (cheio, oco,
 * tracejado) e leva por cima o mesmo símbolo da falha (`elementoDistintivo`).
 */
import { ESTADO_DA_FALHA, NOME_DO_ESTADO, type EspecieDoSensor, type EstadoSensor, type TipoDaFalha, type TipoMarcador } from "../dominio/marcadores";
import { elementoIcone, Icone, type NomeIcone } from "./Icone";

/** O ícone que acompanha cada tipo de falha. */
export const ICONE_DA_FALHA: Record<TipoDaFalha, NomeIcone> = { rede: "sinal-cortado", dispositivo: "aparelho-aviso" };

/** O estado visto como símbolo: o tipo da falha quando é uma falha, para as cores e os ícones ficarem iguais em todo o lado. */
export function simboloDoEstado(estado: EstadoSensor, falha?: TipoDaFalha): { classe: string; icone?: NomeIcone } {
  if (estado === "falha-rede") return { classe: "simbolo-estado--falha-rede", icone: ICONE_DA_FALHA.rede };
  if (estado === "falha-dispositivo") return { classe: "simbolo-estado--falha-dispositivo", icone: ICONE_DA_FALHA.dispositivo };
  if (estado === "estimado") return { classe: `simbolo-estado--estimado simbolo-estado--estimado-${falha ?? "rede"}` };
  return { classe: `simbolo-estado--${estado}` };
}

/** O símbolo de um estado, ao lado do nome (legenda, pop-up, chips, lista). Decorativo: o nome vem sempre em texto. */
export function SimboloEstado({ estado, falha, tamanho = 16 }: { estado: EstadoSensor; falha?: TipoDaFalha; tamanho?: 16 | 20 }) {
  const { classe, icone } = simboloDoEstado(estado, falha);
  return (
    <span className={`simbolo-estado ${classe}`} aria-hidden="true">
      {icone && <Icone nome={icone} tamanho={tamanho} />}
    </span>
  );
}

/** Símbolo + nome por extenso, para os sítios que dizem o estado (o pop-up, as listas). */
export function EstadoComSimbolo({ estado, falha }: { estado: EstadoSensor; falha?: TipoDaFalha }) {
  return (
    <span className={`estado-sensor estado-sensor--${estado}`}>
      <SimboloEstado estado={estado} falha={falha} />
      {NOME_DO_ESTADO[estado]}
    </span>
  );
}

/** A falha pelo tipo («Falha de rede» e «Falha de dispositivo»): símbolo e nome, nos chips e na lista. */
export function SimboloDaFalha({ tipo }: { tipo: TipoDaFalha }) {
  return <SimboloEstado estado={ESTADO_DA_FALHA[tipo]} />;
}

/** O nome de cada tipo, o mesmo na legenda, nas listas e nos leitores de ecrã. */
export const NOME_DA_ESPECIE: Record<EspecieDoSensor, string> = {
  passadeira: "Passadeira",
  zona: "Zona turística",
  rsu: "RSU",
  segmento: "Segmento de estrada",
  estacionamento: "Estacionamento",
};

/**
 * A espécie de um sensor pelo id (urn, «SmartCrosswalk:0020», «RoadSegment:11165»…). O estacionamento não tem id próprio
 * (usa o da RSU), por isso as listas que o trazem dizem a espécie pelo `tipo_sensor` e não por aqui.
 */
export function especieDoId(id: string): EspecieDoSensor | null {
  if (id.includes("SmartCrosswalk")) return "passadeira";
  if (id.includes("TouristZone")) return "zona";
  if (id.includes("RoadSideUnit")) return "rsu";
  if (id.includes("RoadSegment")) return "segmento";
  return null;
}

/**
 * O ícone do tipo antes do nome, em cada linha dos painéis que nomeia um sensor: o mesmo distintivo do marcador do
 * mapa, mais pequeno. Sem `estado`, só o tipo (neutro); onde o painel mostra o estado (as falhas, o «agora», a fita),
 * leva o tratamento e o símbolo do estado, como no mapa. O segmento e o estacionamento, que não têm marcador, levam o
 * ícone da legenda (o traço e o «P»). É decorativo quando o texto da linha já diz o tipo; senão leva o nome do tipo.
 */
export function IconeTipo({
  id,
  especie: daEspecie,
  estado,
  decorativo = false,
}: {
  id?: string;
  especie?: EspecieDoSensor;
  /** Um estado, ou vários quando o sensor-resumo mistura estados (a fita dos segmentos com falhas de rede e de dispositivo): o corpo fica neutro e cada falha leva o seu símbolo. */
  estado?: EstadoSensor | EstadoSensor[];
  decorativo?: boolean;
}) {
  const especie = daEspecie ?? (id ? especieDoId(id) : null);
  if (!especie) return null;
  const estados = estado === undefined ? [] : Array.isArray(estado) ? estado : [estado];
  const misturado = estados.length > 1;
  const [um] = estados;
  const tipo: TipoMarcador = misturado || !um ? (especie === "rsu" ? "rsu" : "neutro") : um === "falha-rede" && especie === "rsu" ? "rsu-falha" : um;
  const comSimbolo = estados.some((e) => e === "falha-rede" || e === "falha-dispositivo");
  return (
    <span
      className={`icone-tipo${comSimbolo ? " icone-tipo--com-simbolo" : ""}`}
      {...(decorativo ? { "aria-hidden": true } : { role: "img", "aria-label": NOME_DA_ESPECIE[especie] })}
    >
      <DistintivoAmostra tipo={tipo} especie={especie} misturado={misturado} />
    </span>
  );
}

/** O distintivo do marcador numa amostra da legenda (o mesmo desenho, mais pequeno). */
export function DistintivoAmostra({ tipo, especie = "passadeira", misturado = false }: { tipo: TipoMarcador; especie?: EspecieDoSensor; misturado?: boolean }) {
  return <span className="distintivo-amostra" aria-hidden="true" ref={(el) => el?.replaceChildren(elementoDistintivo(tipo, especie, undefined, misturado))} />;
}

/**
 * O distintivo do marcador, em nós DOM (o MapLibre não é React): o ícone do tipo, o tratamento do estado e, nas falhas,
 * o símbolo da falha no canto. As classes são as dos outros sítios (`simbolo-estado--*`).
 */
export function elementoDistintivo(tipo: TipoMarcador, especie: EspecieDoSensor, falha?: TipoDaFalha, misturado = false): HTMLElement {
  const d = document.createElement("span");
  d.className = `distintivo distintivo--${tipo}${tipo === "estimado" ? ` distintivo--estimado-${falha ?? "rede"}` : ""}`;
  d.appendChild(elementoIcone(especie, 20));
  const estado: EstadoSensor | null =
    tipo === "falha-rede" || tipo === "rsu-falha" ? "falha-rede" : tipo === "falha-dispositivo" ? "falha-dispositivo" : null;
  const simbolo = (e: EstadoSensor, extra = "") => {
    const { classe, icone } = simboloDoEstado(e);
    const chip = document.createElement("span");
    chip.className = `simbolo-estado ${classe} distintivo__estado${extra}`;
    if (icone) chip.appendChild(elementoIcone(icone, 16));
    d.appendChild(chip);
  };
  if (misturado) {
    // Falhas de rede e de dispositivo ao mesmo tempo (um resumo): os dois símbolos, um por cima do outro, no canto.
    simbolo("falha-rede");
    simbolo("falha-dispositivo", " distintivo__estado--baixo");
  } else if (estado) {
    simbolo(estado);
  } else if (tipo === "assinalada") {
    const chip = document.createElement("span");
    chip.className = "distintivo__aviso";
    chip.textContent = "!";
    d.appendChild(chip);
  }
  return d;
}
