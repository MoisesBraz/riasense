/**
 * ③ Prever: o que vai acontecer daqui a 3 h (HORIZONTE_H, ADR-0027)? Só há previsões dos tipos que ganharam à
 * referência. O painel resume (ADR-0033, ponto 4): quanto menos erra a previsão do que a referência (e do que a
 * persistência, quando a avaliação a tiver), quantos tipos ganham, e as passadeiras com mais travessias previstas.
 * Sem dados, mostra o estado («por calcular» ou vazio), nunca valores de exemplo.
 */
import { INFO_AEREA } from "./PainelVigiar";
import { useAvaliacaoPrever, usePrevisoes } from "../api/recursos";
import type { Previsao } from "../api/tipos";
import { Botao, Cartao, Kpi, Selo } from "../componentes/Basicos";
import { CabecalhoDoPainel } from "../componentes/CabecalhoDoPainel";
import { ComResultado, PorCalcular, Vazio } from "../componentes/Estados";
import { LinhaSensor, ListaSensores } from "../componentes/ListaSensores";
import { numero, rotuloSensor } from "../dominio/formato";
import { contraReferencia, HORIZONTE_H, maioresPrevisoes, periodoDasPrevisoes, type LinhaAvaliacaoPrever } from "../dominio/prever";
import { HORA_MS, rotuloDia, rotuloHora, rotuloHoras } from "../dominio/tempo";
import { useEstadoDemo } from "../estado/estado";

/** ⓘ do Prever: no máximo 40 palavras (ADR-0033, ponto 4). */
// ADR-0010: um tipo de sensor só entra se ganhar à referência; senão, a previsão desse tipo sai do produto.
export const INFO_PREVER =
  "A previsão de um tipo de sensor só entra se errar menos do que a referência (a mesma hora de ontem) e do que a persistência (o último valor medido). A 1 hora, repetir o último valor basta.";

const pct = (v: number) => `${numero(Math.max(0, v) * 100)} %`;

/** Os números grandes: a comparação com a referência (e a persistência) é um deles (ADR-0033, ponto 4). */
function Numeros({ linhas }: { linhas: LinhaAvaliacaoPrever[] }) {
  const c = contraReferencia(linhas, "passadeira", HORIZONTE_H);
  if (!c) return null;
  const comPersistencia = c.persistencia !== null && c.menosQuePersistencia !== null;
  return (
    <div className={comPersistencia ? "kpis" : "kpis kpis--2"}>
      <Kpi rotulo="Menos erro do que a referência" valor={pct(c.menosQueReferencia)} nota={`passadeiras: ${numero(c.erro, 2)} contra ${numero(c.referencia, 2)}`} />
      {comPersistencia && (
        <Kpi
          rotulo="Menos erro do que a persistência"
          valor={pct(c.menosQuePersistencia ?? 0)}
          nota={`passadeiras: ${numero(c.erro, 2)} contra ${numero(c.persistencia ?? 0, 2)}`}
        />
      )}
      <Kpi rotulo="Tipos de sensor com previsão" valor={`${c.ganham} de ${c.tipos}`} nota={`a ${HORIZONTE_H} h`} />
    </div>
  );
}

function ProximaHora({ previsoes }: { previsoes: Previsao[] }) {
  const { estado, despachar } = useEstadoDemo();
  const alvo = estado.hora + HORIZONTE_H * HORA_MS;
  const periodo = periodoDasPrevisoes(previsoes);
  if (periodo && (alvo < periodo.inicio || alvo > periodo.fim)) {
    return (
      <Vazio
        titulo={`Sem previsão para ${rotuloHora(alvo)}`}
        acao={
          <Botao variante="secundario" onClick={() => despachar({ tipo: "hora", hora: periodo.inicio - HORIZONTE_H * HORA_MS })}>
            Ir para {rotuloHora(periodo.inicio - HORIZONTE_H * HORA_MS)}
          </Botao>
        }
      >
        A ③ só tem previsões no período de teste, de {rotuloDia(periodo.inicio)} às {rotuloHoras(periodo.inicio)} a {rotuloDia(periodo.fim)} às{" "}
        {rotuloHoras(periodo.fim)}.
      </Vazio>
    );
  }
  const maiores = maioresPrevisoes(previsoes, estado.hora);
  return (
    <Cartao titulo={`Daqui a ${HORIZONTE_H} h · ${rotuloHoras(alvo)}`} selo={<Selo>Previsão</Selo>}>
      {maiores.length ? (
        <ListaSensores rotulo="Passadeiras com mais travessias previstas">
          {maiores.map((p) => (
            <LinhaSensor key={p.id} id={p.id}>
              <strong>{rotuloSensor(p.id)}</strong>
              <span className="lista-sensores__valor">≈ {numero(p.previsao)}</span>
            </LinhaSensor>
          ))}
        </ListaSensores>
      ) : (
        <p className="nota">Sem previsão das passadeiras para as {rotuloHoras(alvo)}.</p>
      )}
      <p className="nota">Travessias previstas por passadeira; no mapa, a área do halo.</p>
    </Cartao>
  );
}

export function PainelPrever() {
  const previsoes = usePrevisoes();
  const avaliacao = useAvaliacaoPrever();
  return (
    <>
      <CabecalhoDoPainel titulo={`O que vai acontecer daqui a ${HORIZONTE_H} h?`} info={[INFO_PREVER, INFO_AEREA]} />
      {avaliacao.resultado.estado === "ok" && <Numeros linhas={avaliacao.resultado.dados} />}
      {previsoes.resultado.estado === "por-calcular" ? (
        <PorCalcular titulo={`Previsão daqui a ${HORIZONTE_H} h`} motivo={previsoes.resultado.motivo}>
          <p>A ③ ainda não correu. Quando correr, o ecrã mostra um de dois cenários:</p>
          <ul className="lista-simples">
            <li>A · ganha à referência e à persistência: a previsão daqui a {HORIZONTE_H} h em cada sensor.</li>
            <li>B · não ganha: só o grafo «o que antecipa o quê», que mostra associação e não promete previsão.</li>
          </ul>
        </PorCalcular>
      ) : (
        <ComResultado
          resultado={previsoes.resultado}
          recarregar={previsoes.recarregar}
          titulo={`Previsão daqui a ${HORIZONTE_H} h`}
          vazio={<Vazio titulo="Sem previsões">A ③ correu, mas nenhum tipo de sensor ganhou à referência: fica só o grafo «o que antecipa o quê».</Vazio>}
        >
          {(dados) => <ProximaHora previsoes={dados} />}
        </ComResultado>
      )}
    </>
  );
}
