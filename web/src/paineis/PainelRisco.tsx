/**
 * Mapa de risco potencial (ADR-0007, ADR-0013): exposição + comportamento + previsão, com a confiança do dado à
 * parte. Diz sempre «risco potencial» e «não mede acidentes». Lê `/proteger/risco-potencial` na hora do cursor;
 * se a API der 503, mostra «por calcular» e o que já existe de cada componente, sem números inventados.
 * O painel resume (ADR-0033, ponto 4): quantos pontos estão nos degraus altos, quantos são estimados, e a lista dos
 * pontos por risco potencial. As componentes de cada ponto estão no pop-up.
 */
import { INFO_AEREA } from "./PainelVigiar";
import type { Resultado } from "../api/cliente";
import { useFalhas, usePassadeirasProteger, usePrevisoes, useRiscoPotencial, useSensores, useSensoresVirtuais } from "../api/recursos";
import type { LinhaRisco } from "../api/tipos";
import { Kpi, Selo, Cartao } from "../componentes/Basicos";
import { CabecalhoDoPainel } from "../componentes/CabecalhoDoPainel";
import { ComResultado, PorCalcular, Vazio } from "../componentes/Estados";
import { LinhaSensor, ListaSensores } from "../componentes/ListaSensores";
import { rotuloSensor } from "../dominio/formato";
import { HORIZONTE_H } from "../dominio/prever";
import { FONTE_SEMAFORO } from "../dominio/proteger";
import { nivelDoRisco, pontosPorRisco } from "../dominio/risco";
import { rotuloHora, rotuloHoras } from "../dominio/tempo";
import { useEstadoDemo } from "../estado/estado";

/** ⓘ do risco potencial: no máximo 40 palavras, sem contar com «não mede acidentes» (ADR-0033, ponto 4). */
export const INFO_RISCO =
  "O risco potencial junta a exposição, o comportamento e a previsão, em percentis; a confiança do dado mostra-se à parte, a tracejado. Só pontos com sensor; as ruas sem sensor ficam sem cobertura. Sem acidentes georreferenciados para validar: não mede acidentes.";

/** A 2.ª nota do «ⓘ» (ADR-0048, ponto 2): a fonte dos semáforos, que saiu da legenda. */
export const INFO_SEMAFORO_RISCO = `Com semáforo (${FONTE_SEMAFORO}): o abrandamento não se mede da mesma forma, e o comportamento não entra na soma.`;

function SeloDisponivel({ resultado }: { resultado: Resultado<unknown> }) {
  if (resultado.estado === "ok") return <Selo tipo="ok">Disponível</Selo>;
  if (resultado.estado === "a-carregar") return <Selo>A carregar</Selo>;
  if (resultado.estado === "erro") return <Selo tipo="erro">Erro</Selo>;
  return <Selo tipo="aviso">Por calcular</Selo>;
}

/** As componentes e de onde vêm; o selo diz se a camada que as alimenta já tem dados na API. */
function Componentes() {
  const virtuais = useSensoresVirtuais();
  const proteger = usePassadeirasProteger();
  const previsoes = usePrevisoes();
  const falhas = useFalhas();
  const linhas = [
    { nome: "Exposição", origem: "travessias medidas, ou estimadas pela ② quando a passadeira está em falha", r: virtuais.resultado },
    { nome: "Comportamento", origem: "efeito da ④: quanto menos abranda, maior", r: proteger.resultado },
    { nome: "Previsão", origem: `travessias daqui a ${HORIZONTE_H} h, pela ③`, r: previsoes.resultado },
    { nome: "Confiança do dado", origem: "falhas da ①; não entra na soma, mostra-se a tracejado", r: falhas.resultado },
  ];
  return (
    <ul className="componentes">
      {linhas.map((l) => (
        <li key={l.nome}>
          <span className="componentes__texto">
            <strong>{l.nome}</strong>
            <span className="nota">{l.origem}</span>
          </span>
          <SeloDisponivel resultado={l.r} />
        </li>
      ))}
    </ul>
  );
}

function Degrau({ linha }: { linha: LinhaRisco }) {
  const n = nivelDoRisco(linha.risco_potencial);
  return (
    <span className={`degrau degrau--${n} ${linha.estimado ? "degrau--estimado" : ""}`} role="img" aria-label={`risco potencial ${n} de 5`}>
      {n}
    </span>
  );
}

function ConteudoRisco({ linhas }: { linhas: LinhaRisco[] }) {
  const { estado } = useEstadoDemo();
  const sensores = useSensores();
  const nomes = new Map(sensores.resultado.estado === "ok" ? sensores.resultado.dados.map((s) => [s.id, s.nome]) : []);
  const altos = linhas.filter((l) => nivelDoRisco(l.risco_potencial) >= 4).length;
  const estimados = linhas.filter((l) => l.estimado).length;
  return (
    <>
      <div className="kpis kpis--2">
        <Kpi rotulo="Degrau 4 ou 5" valor={altos} nota={`de ${linhas.length} passadeiras às ${rotuloHoras(estado.hora)}`} />
        <Kpi rotulo="Estimados" valor={estimados} nota="a tracejado, confiança menor" />
      </div>
      <Cartao titulo="Pontos por risco potencial">
        <ListaSensores rotulo="Pontos por risco potencial" numerada>
          {pontosPorRisco(linhas)
            .slice(0, 5)
            .map((l) => (
              <LinhaSensor key={l.id} id={l.id} antes={<Degrau linha={l} />}>
                <strong>
                  {rotuloSensor(l.id)}
                  {l.assinalada ? " · assinalada" : l.semaforo ? " · com semáforo" : nomes.get(l.id) ? ` · ${nomes.get(l.id)}` : ""}
                </strong>
                <span className="lista-sensores__nota">{l.estimado ? "estimado" : "medido"}</span>
              </LinhaSensor>
            ))}
        </ListaSensores>
      </Cartao>
    </>
  );
}

export function PainelRisco() {
  const { estado } = useEstadoDemo();
  const risco = useRiscoPotencial(estado.hora);
  return (
    <>
      <CabecalhoDoPainel titulo="Onde estão os peões menos protegidos?" info={[INFO_RISCO, INFO_SEMAFORO_RISCO, INFO_AEREA]} />
      <div className="linha-selos">
        <Selo>Risco potencial · não mede acidentes</Selo>
      </div>
      {risco.resultado.estado === "por-calcular" ? (
        <PorCalcular titulo="Risco potencial por calcular" motivo={risco.resultado.motivo}>
          <p>O mapa junta estas componentes por passadeira e por hora. Sem o cálculo do risco potencial, não se mostra nenhum nível.</p>
          <Componentes />
        </PorCalcular>
      ) : (
        <ComResultado
          resultado={risco.resultado}
          recarregar={risco.recarregar}
          titulo="Risco potencial"
          vazio={<Vazio titulo="Sem risco potencial a esta hora">A API não tem pontos para {rotuloHora(estado.hora)}.</Vazio>}
        >
          {(linhas) => <ConteudoRisco linhas={linhas} />}
        </ComResultado>
      )}
    </>
  );
}
