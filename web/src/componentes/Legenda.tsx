/**
 * Legenda do mapa por separador (ADR-0048, ponto 1): só o que se vê no mapa, cada linha com o símbolo e um nome curto.
 * As frases e as ressalvas ficam fora (ADR-0048, ponto 2): o selo do risco, a barra da hora, o painel «agora», o «ⓘ»
 * do painel e a janela «Dados locais». As ruas «sem cobertura» aparecem sempre (ADR-0007). No Vigiar e no Completar
 * mostra os 6 estados do sensor (ADR-0033, ponto 1), e o ícone de cada tipo, que vale em todos os separadores.
 */
import type { ReactNode } from "react";
import type { Separador, VistaProteger } from "../estado/estado";
import { Recolhivel } from "./Basicos";
import type { EspecieDoSensor } from "../dominio/marcadores";
import { Icone } from "./Icone";
import { DistintivoAmostra, IconeTipo, NOME_DA_ESPECIE, SimboloEstado } from "./Simbolos";

function Item({ amostra, children }: { amostra: ReactNode; children: ReactNode }) {
  return (
    <li className="legenda__item">
      <span className="legenda__amostra" aria-hidden="true">
        {amostra}
      </span>
      <span>{children}</span>
    </li>
  );
}

const marcador = (tipo: string, conteudo: ReactNode = null) => <span className={`marcador marcador--${tipo}`}>{conteudo}</span>;
const rua = (tipo: "sensor" | "sem-cobertura") => <span className={`legenda__rua legenda__rua--${tipo}`} />;

/** Os 6 estados do ADR-0033 (ponto 1): o símbolo e o nome em texto, e a cor nunca vem sozinha (WCAG 1.4.1). */
function Estados() {
  return (
    <li className="legenda__grupo">
      <span className="legenda__subtitulo">Estado</span>
      <ul className="legenda__lista">
        <Item amostra={<SimboloEstado estado="falha-rede" />}>Falha de rede</Item>
        <Item amostra={<SimboloEstado estado="falha-dispositivo" />}>Falha de dispositivo</Item>
        <Item amostra={<SimboloEstado estado="atencao" />}>Atenção</Item>
        <Item amostra={<SimboloEstado estado="ativo" />}>Ativo</Item>
        <Item amostra={<SimboloEstado estado="estimado" />}>Estimado</Item>
        <Item amostra={rua("sem-cobertura")}>Sem cobertura</Item>
      </ul>
    </li>
  );
}

/**
 * Os ícones do tipo de sensor, os mesmos em todos os separadores e nas linhas dos painéis. O ① Vigiar e o
 * ② Completar mostram os cinco: o segmento e o estacionamento não têm marcador, mas as listas e a fita nomeiam-nos com o ícone.
 */
function Tipos({ todos = false }: { todos?: boolean }) {
  const tipo = (especie: EspecieDoSensor) => (
    <Item key={especie} amostra={<IconeTipo especie={especie} decorativo />}>
      {NOME_DA_ESPECIE[especie]}
    </Item>
  );
  return (
    <li className="legenda__grupo">
      <span className="legenda__subtitulo">Tipo</span>
      <ul className="legenda__lista">
        {tipo("passadeira")}
        {todos && tipo("zona")}
        {tipo("rsu")}
        {todos && tipo("segmento")}
        {todos && tipo("estacionamento")}
      </ul>
    </li>
  );
}

/** O halo só marca a RSU com falha de rede: uma falha de dispositivo marca só o sensor (ADR-0033). */
const halo = <span className="legenda__halo-falha" />;

/** Os mapas de calor do ADR-0047: o lugar deles na legenda, com a escala «pouco → muito». */
export interface CalorNaLegenda {
  peoes?: boolean;
  veiculos?: boolean;
}

function Calor({ calor, aoVivo = false }: { calor?: CalorNaLegenda; aoVivo?: boolean }) {
  if (!calor?.peoes && !calor?.veiculos) return null;
  const escala = (tipo: string) => <span className={`legenda__calor legenda__calor--${tipo}`} />;
  return (
    <li className="legenda__grupo">
      <span className="legenda__subtitulo">
        Calor <span className="legenda__extremos legenda__extremos--linha">pouco → muito</span>
      </span>
      <ul className="legenda__lista">
        {calor.peoes && <Item amostra={escala("peoes")}>Calor · peões</Item>}
        {calor.veiculos && <Item amostra={escala("veiculos")}>Calor · veículos</Item>}
      </ul>
      {/* Ao vivo, o calor usa o «por hora» de agora, na escala da semana (ADR-0055, pontos 3 e 8). */}
      {aoVivo && <span className="legenda__nota">contagem ao vivo aproximada</span>}
    </li>
  );
}

/** O que está em todos os mapas: os edifícios em relevo (ADR-0037) e o fundo do dia ou da noite (ADR-0040). */
function Fundo({ aoVivo = false }: { aoVivo?: boolean }) {
  return (
    <>
      <Item amostra={<span className="legenda__edificio" />}>Edifícios</Item>
      {/* O «Ao vivo» não segue a luminosidade da hora gravada: o fundo fica o de dia. */}
      {!aoVivo && (
        <Item
        amostra={
          <span className="legenda__dia-noite">
            <Icone nome="sol" tamanho={16} />
            <Icone nome="lua" tamanho={16} />
          </span>
        }
      >
          Dia ou noite
        </Item>
      )}
    </>
  );
}

/** O modo «Ao vivo» (ADR-0049): as estações do Living Lab e o que detetam agora; nada da semana gravada. */
function ItensAoVivo() {
  return (
    <>
      <Item amostra={<DistintivoAmostra tipo="ativo" especie="rsu" />}>Estação ativa</Item>
      <Item amostra={<DistintivoAmostra tipo="neutro" especie="rsu" />}>Estação inativa</Item>
      <Item amostra={<span className="legenda__carro" />}>Veículo detetado</Item>
      <Item amostra={<span className="legenda__carro legenda__carro--parado" />}>Veículo parado</Item>
      <Item amostra={<span className="legenda__carro legenda__carro--peao" />}>Peão detetado</Item>
      <Item amostra={<span className="legenda__peao" />}>Peões e veículos 3D</Item>
    </>
  );
}

function itensDoSeparador(separador: Separador, vista: VistaProteger, proximo: boolean, calor?: CalorNaLegenda): ReactNode {
  switch (separador) {
    case "vigiar":
      return (
        <>
          <Estados />
          <Tipos todos />
          <Item amostra={halo}>RSU com falha de rede</Item>
          <Item amostra={rua("sensor")}>Rua com sensor</Item>
          <Item amostra={<span className="legenda__carro" />}>Trânsito</Item>
          <Item amostra={<span className="legenda__carro legenda__carro--excesso" />}>Acima do limite</Item>
          <Item amostra={<span className="legenda__peao" />}>Peões 3D</Item>
          <Calor calor={calor} />
        </>
      );
    case "completar":
      return proximo ? (
        <>
          <Item amostra={marcador("proximo", "1")}>Próximo sensor (hipótese)</Item>
          <Item amostra={rua("sensor")}>Rua com sensor</Item>
          <Item amostra={rua("sem-cobertura")}>Sem cobertura</Item>
          <Calor calor={calor} />
        </>
      ) : (
        <>
          <Estados />
          <Tipos todos />
          <Item amostra={halo}>RSU com falha de rede</Item>
          <Item amostra={rua("sensor")}>Rua com sensor</Item>
          <Calor calor={calor} />
        </>
      );
    case "prever":
      return (
        <>
          <Tipos />
          <Item amostra={<span className="legenda__halo-previsao" />}>Previsão</Item>
          <Item amostra={rua("sensor")}>Rua com sensor</Item>
          <Item amostra={rua("sem-cobertura")}>Sem cobertura</Item>
          <Calor calor={calor} />
        </>
      );
    case "proteger":
      return vista === "risco" ? (
        <>
          <Tipos />
          <li className="legenda__risco">
            <span className="legenda__subtitulo">Risco potencial</span>
            <span className="legenda__degraus" aria-label="Escala de risco potencial de 1 (menor) a 5 (maior)">
              {[1, 2, 3, 4, 5].map((n) => (
                <span key={n} className={`degrau degrau--${n}`}>
                  {n}
                </span>
              ))}
            </span>
            <span className="legenda__extremos">
              <span>menor</span>
              <span>maior</span>
            </span>
          </li>
          <Item amostra={<span className="degrau degrau--3 degrau--estimado">3</span>}>Estimado</Item>
          <Item amostra={rua("sem-cobertura")}>Sem cobertura</Item>
        </>
      ) : (
        <>
          <Item amostra={<DistintivoAmostra tipo="assinalada" />}>Assinalada</Item>
          <Item amostra={<DistintivoAmostra tipo="neutro" />}>Não assinalada</Item>
          <Tipos />
          <Item amostra={rua("sensor")}>Rua com sensor</Item>
          <Item amostra={rua("sem-cobertura")}>Sem cobertura</Item>
          <Calor calor={calor} />
        </>
      );
  }
}

export function Legenda({
  separador,
  vista,
  proximo = false,
  calor,
  aoVivo = false,
}: {
  separador: Separador;
  vista: VistaProteger;
  proximo?: boolean;
  /** Os mapas de calor ligados (ADR-0047): cada um junta a sua linha à legenda do ① Vigiar. */
  calor?: CalorNaLegenda;
  /** O modo «Ao vivo» (ADR-0049): a legenda é a dele, mais o calor ao vivo se estiver ligado. */
  aoVivo?: boolean;
}) {
  // Fechada por omissão: as etiquetas obrigatórias estão no painel, no pop-up ou nos «Dados locais».
  return (
    <Recolhivel classe="legenda" icone="legenda" rotulo="Legenda">
      <ul className="legenda__lista">
        {aoVivo ? (
          <>
            <ItensAoVivo />
            <Calor calor={calor} aoVivo />
          </>
        ) : (
          itensDoSeparador(separador, vista, proximo, calor)
        )}
        <Fundo aoVivo={aoVivo} />
      </ul>
    </Recolhivel>
  );
}
