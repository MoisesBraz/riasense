/**
 * ② Completar: quanto valia o sensor que falhou? A parte medida vem de `/proteger/intervalos` (travessias reais),
 * a estimada de `/completar/sensores-virtuais`. O painel resume (ADR-0033, ponto 4): o valor à hora do cursor, o
 * erro contra a referência e as horas preenchidas, com o gráfico do sensor em foco. O botão do próximo sensor mostra
 * os sítios no mapa e a lista curta deles (ponto 5).
 */
import { INFO_AEREA } from "./PainelVigiar";
import {
  useAvaliacaoCompletar,
  useFalhas,
  useIntervalos,
  useProximoSensor,
  useSensoresVirtuais,
  type AvaliacaoCompletar,
  type ProximoSensor,
} from "../api/recursos";
import type { SensorVirtual } from "../api/tipos";
import { Botao, Cartao, Kpi, Selo } from "../componentes/Basicos";
import { CabecalhoDoPainel } from "../componentes/CabecalhoDoPainel";
import { IconeTipo } from "../componentes/Simbolos";
import { ComResultado, Vazio } from "../componentes/Estados";
import { GraficoIntervalo } from "../componentes/graficos/GraficoIntervalo";
import { LinhaSensor, ListaSensores } from "../componentes/ListaSensores";
import { EstadoDoSensor } from "../componentes/PopupSensor";
import { config } from "../config";
import { emAtencao, horasPreenchidas, serieVirtual, sitiosDoProximo, travessiasPorHora, virtualNaHora } from "../dominio/completar";
import { numero, rotuloSensor, urn } from "../dominio/formato";
import { lerInstante, rotuloHoras } from "../dominio/tempo";
import { useEstadoDemo } from "../estado/estado";

/** ⓘ do Completar: no máximo 40 palavras (ADR-0033, ponto 4). */
// ADR-0005: o treino não tem fins de semana, por isso o erro sobe e o intervalo alarga ao sábado e ao domingo.
export const INFO_COMPLETAR =
  "O sensor virtual estima o sensor em falha pela variação dos vizinhos do mesmo tipo, com um intervalo de 80 %. Ao fim de semana erra mais: o treino não teve sábados nem domingos.";

function EscolhaDoSensor() {
  const { estado, despachar } = useEstadoDemo();
  return (
    <div className="escolha" role="group" aria-label="Passadeira da zona">
      {config.zona.passadeiras.map((p) => (
        <button
          key={p}
          type="button"
          className="escolha__opcao"
          aria-pressed={estado.foco === urn(p)}
          onClick={() => despachar({ tipo: "foco", sensor: p })}
        >
          {rotuloSensor(p)}
        </button>
      ))}
    </div>
  );
}

/** O erro do sensor virtual contra o da referência, ao deixar um sensor de fora (passadeiras, todos os dias). */
function erroContraReferencia(linhas: AvaliacaoCompletar[], tipo = "passadeira"): { riasense: number; referencia: number } | null {
  const erro = (modelo: string) =>
    linhas.find((l) => l.cenario === "deixar_um_de_fora" && l.dias === "todos" && l.tipo === tipo && l.modelo === modelo)?.erro_mediano;
  const riasense = erro("razao");
  const referencia = erro("referencia");
  return riasense === undefined || referencia === undefined ? null : { riasense, referencia };
}

function Numeros({ virtuais }: { virtuais: SensorVirtual[] }) {
  const { estado } = useEstadoDemo();
  const avaliacao = useAvaliacaoCompletar();
  const intervalos = useIntervalos(estado.foco);
  const serie = serieVirtual(virtuais, estado.foco);
  const ponto = virtualNaHora(serie, estado.hora);
  const preenchido = horasPreenchidas(serie);
  const medido =
    intervalos.resultado.estado === "ok" ? travessiasPorHora(intervalos.resultado.dados).find((p) => p.t === estado.hora) : undefined;
  const comparacao = avaliacao.resultado.estado === "ok" ? erroContraReferencia(avaliacao.resultado.dados) : null;
  const rotulo = `${rotuloSensor(estado.foco)} às ${rotuloHoras(estado.hora)}`;
  return (
    <div className={comparacao && preenchido ? "kpis" : "kpis kpis--2"}>
      {ponto ? (
        <Kpi rotulo={rotulo} valor={`≈ ${numero(ponto.estimativa)}`} nota={`estimado · 80 %: ${numero(ponto.inf)} a ${numero(ponto.sup)}`} />
      ) : (
        <Kpi rotulo={rotulo} valor={medido ? numero(medido.valor) : "—"} nota="travessias/h, medidas" />
      )}
      {comparacao && (
        <Kpi rotulo="Erro do sensor virtual" valor={numero(comparacao.riasense, 2)} nota={`contra ${numero(comparacao.referencia, 2)} da referência`} />
      )}
      {preenchido && <Kpi rotulo="Horas preenchidas" valor={`${preenchido.n} h`} nota={rotuloSensor(estado.foco)} />}
    </div>
  );
}

function CartaoSerie({ virtuais }: { virtuais: SensorVirtual[] }) {
  const { estado } = useEstadoDemo();
  const intervalos = useIntervalos(estado.foco);
  const falhas = useFalhas();
  const serie = serieVirtual(virtuais, estado.foco);
  const rotulo = rotuloSensor(estado.foco);
  const preenchido = horasPreenchidas(serie);
  const falha =
    falhas.resultado.estado === "ok" ? falhas.resultado.dados.find((f) => f.sensor === estado.foco && f.tipo === "rede") : undefined;
  return (
    <Cartao
      titulo={
        <span className="titulo-com-icone">
          <IconeTipo id={estado.foco} />
          {rotulo} · travessias por hora
        </span>
      }
      selo={<Selo tipo="estimado">Estimado</Selo>}
    >
      <ComResultado resultado={intervalos.resultado} recarregar={intervalos.recarregar} titulo="Travessias medidas">
        {(medidas) => (
          <GraficoIntervalo
            rotulo={rotulo}
            reais={travessiasPorHora(medidas).filter((p) => !preenchido || p.t < preenchido.inicio)}
            virtuais={serie}
            inicioFalha={falha ? lerInstante(falha.inicio) : null}
            hora={estado.hora}
            dominio={[config.periodo.inicio, config.periodo.fim]}
          />
        )}
      </ComResultado>
      <ul className="legenda-serie" aria-label="Legenda do gráfico">
        <li>
          <span className="legenda-serie__real" aria-hidden="true" />
          real
        </li>
        <li>
          <span className="legenda-serie__virtual" aria-hidden="true" />
          virtual
        </li>
        <li>
          <span className="legenda-serie__intervalo" aria-hidden="true" />
          intervalo 80 %
        </li>
      </ul>
    </Cartao>
  );
}

/**
 * «Onde pôr o próximo sensor» (ADR-0015, ADR-0033 ponto 5): só o número, o local e a redução potencial estimada.
 * Os sensores em «verificar o sensor» ficam à parte, com o estado «Atenção».
 */
function ListaProximoSensor({ locais }: { locais: ProximoSensor[] }) {
  const { estado } = useEstadoDemo();
  const sitios = sitiosDoProximo(locais);
  const atencao = locais.filter((l) => emAtencao(locais, estado.hora, config.verificarDesde).has(l.id));
  return (
    <Cartao titulo="Onde pôr o próximo sensor" selo={<Selo>Hipótese</Selo>}>
      <ListaSensores rotulo="Onde pôr o próximo sensor" numerada>
        {sitios.map((l) => (
          <LinhaSensor key={l.id} id={l.id} antes={<span className="lista-sensores__posicao">{l.posicao}</span>}>
            <strong>{rotuloSensor(l.id)}</strong>
            <span className="lista-sensores__valor" title="redução potencial estimada">
              {numero(l.reducao_potencial ?? 0, 2)}
            </span>
          </LinhaSensor>
        ))}
      </ListaSensores>
      <p className="nota">À direita, a redução potencial estimada do erro (hipótese).</p>
      {atencao.length > 0 && (
        <ListaSensores rotulo="Verificar o sensor">
          {atencao.map((l) => (
            <LinhaSensor key={l.id} id={l.id} antes={<EstadoDoSensor estado="atencao" />}>
              <strong>{rotuloSensor(l.id)}</strong>
              <span className="lista-sensores__nota">verificar o sensor</span>
            </LinhaSensor>
          ))}
        </ListaSensores>
      )}
    </Cartao>
  );
}

function ProximoSensor() {
  const { estado, despachar } = useEstadoDemo();
  const proximo = useProximoSensor();
  return (
    <>
      <div className="acoes">
        <Botao variante={estado.proximo ? "primario" : "secundario"} aria-pressed={estado.proximo} onClick={() => despachar({ tipo: "proximo" })}>
          Onde pôr o próximo sensor
        </Botao>
      </div>
      {estado.proximo && (
        <ComResultado
          resultado={proximo.resultado}
          recarregar={proximo.recarregar}
          titulo="Onde pôr o próximo sensor"
          vazio={<Vazio titulo="Sem locais propostos">O ranking não devolveu locais.</Vazio>}
        >
          {(locais) => <ListaProximoSensor locais={locais} />}
        </ComResultado>
      )}
    </>
  );
}

export function PainelCompletar() {
  const { estado } = useEstadoDemo();
  const virtuais = useSensoresVirtuais();
  return (
    <>
      <CabecalhoDoPainel titulo="O que mediria o sensor que falhou?" info={[INFO_COMPLETAR, INFO_AEREA]} />
      <EscolhaDoSensor />
      <ComResultado
        resultado={virtuais.resultado}
        recarregar={virtuais.recarregar}
        titulo="Sensores virtuais"
        vazio={
          <>
            <Numeros virtuais={[]} />
            <Vazio titulo="Sem sensores virtuais">Nenhum sensor da zona precisou de ser completado.</Vazio>
          </>
        }
      >
        {(dados) =>
          serieVirtual(dados, estado.foco).length === 0 ? (
            // A comparação com a referência é da avaliação inteira: fica à vista mesmo sem sensor virtual em foco.
            <>
              <Numeros virtuais={dados} />
              <Vazio titulo={`Sem sensor virtual para ${rotuloSensor(estado.foco)}`}>
                Este sensor não falhou no período, por isso a RiaSense não o estimou.
              </Vazio>
            </>
          ) : (
            <>
              <Numeros virtuais={dados} />
              <CartaoSerie virtuais={dados} />
            </>
          )
        }
      </ComResultado>
      <ProximoSensor />
    </>
  );
}
