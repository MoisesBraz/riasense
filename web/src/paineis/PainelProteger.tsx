/**
 * ④ Proteger: os carros abrandam quando há peões? Dados de `/proteger/passadeiras` (efeito, IC 95 %, placebo,
 * assinaladas). Termina no mapa de risco potencial, que é uma vista deste separador e não uma 5.ª camada (ADR-0007).
 * O painel resume (ADR-0033, ponto 4); os dias de dados e o efeito de cada passadeira estão no pop-up.
 */
import { INFO_AEREA } from "./PainelVigiar";
import { useState } from "react";
import { usePassadeirasProteger } from "../api/recursos";
import type { PassadeiraProteger } from "../api/tipos";
import { Botao, Cartao, Kpi, Selo } from "../componentes/Basicos";
import { CabecalhoDoPainel } from "../componentes/CabecalhoDoPainel";
import { ComResultado } from "../componentes/Estados";
import { GraficoEfeito, type LinhaEfeito } from "../componentes/graficos/GraficoEfeito";
import { config } from "../config";
import { intervaloPct, rotuloSensor, urn } from "../dominio/formato";
import { FONTE_SEMAFORO, linhasDoEfeito, resumirProteger } from "../dominio/proteger";
import { useEstadoDemo } from "../estado/estado";
import { PainelRisco } from "./PainelRisco";

const ZONA = new Set(config.zona.passadeiras.map(urn));

function linhasComPlacebo(passadeiras: PassadeiraProteger[], foco: string, todas: boolean): LinhaEfeito[] {
  const linhas: LinhaEfeito[] = linhasDoEfeito(passadeiras, ZONA, todas).map((p) => ({
    id: p.id,
    rotulo: rotuloSensor(p.id),
    efeito: p.efeito_kmh,
    inf: p.ic_inf,
    sup: p.ic_sup,
    assinalada: p.assinalada,
    semaforo: p.semaforo,
  }));
  // O placebo da passadeira em foco: as travessias de uma passadeira longe deviam dar efeito nulo.
  const emFoco = passadeiras.find((p) => p.id === foco) ?? passadeiras.find((p) => ZONA.has(p.id));
  if (emFoco) {
    linhas.push({
      id: emFoco.placebo,
      rotulo: `Placebo`,
      efeito: emFoco.placebo_efeito_kmh,
      inf: emFoco.placebo_ic_inf,
      sup: emFoco.placebo_ic_sup,
      assinalada: false,
      placebo: true,
    });
  }
  return linhas;
}

function ConteudoProteger({ passadeiras }: { passadeiras: PassadeiraProteger[] }) {
  const { estado, despachar } = useEstadoDemo();
  const [todas, setTodas] = useState(false);
  const resumo = resumirProteger(passadeiras, ZONA);
  return (
    <>
      <div className="kpis kpis--2">
        <Kpi rotulo="Abrandam" valor={`${resumo.abrandam} de ${resumo.total}`} nota="passadeiras" />
        {resumo.acimaMovimentados && (
          <Kpi
            rotulo="Acima do limite"
            valor={intervaloPct(...resumo.acimaMovimentados)}
            nota={`${config.zona.nome}${resumo.acimaCalmos ? ` · ${intervaloPct(...resumo.acimaCalmos)} nos intervalos calmos` : ""}`}
          />
        )}
      </div>
      <Cartao titulo="Efeito na velocidade (km/h)" selo={<Selo>IC 95 %</Selo>}>
        <GraficoEfeito
          linhas={linhasComPlacebo(passadeiras, estado.foco, todas)}
          unidade={`km/h por +${config.proteger.porTravessias} travessias`}
          onEscolher={(id) => despachar({ tipo: "popup", sensor: id, centrar: true })}
        />
        <Botao variante="fantasma" onClick={() => setTodas((t) => !t)}>
          {todas ? "Mostrar só a zona e as assinaladas" : `Mostrar as ${resumo.total} passadeiras`}
        </Botao>
      </Cartao>
      <div className="acoes">
        <Botao onClick={() => despachar({ tipo: "vista-proteger", vista: "risco" })}>Ver mapa de risco potencial →</Botao>
      </div>
    </>
  );
}

function EscolhaDaVista() {
  const { estado, despachar } = useEstadoDemo();
  return (
    <div className="escolha escolha--segmentada" role="group" aria-label="Vista do Proteger">
      <button
        type="button"
        className="escolha__opcao"
        aria-pressed={estado.vistaProteger === "abrandamento"}
        onClick={() => despachar({ tipo: "vista-proteger", vista: "abrandamento" })}
      >
        Abrandamento
      </button>
      <button
        type="button"
        className="escolha__opcao"
        aria-pressed={estado.vistaProteger === "risco"}
        onClick={() => despachar({ tipo: "vista-proteger", vista: "risco" })}
      >
        Mapa de risco potencial
      </button>
    </div>
  );
}

/** ⓘ do Proteger: no máximo 40 palavras (ADR-0033, ponto 4). Inclui a ressalva do ADR-0006 (segmentos partilhados). */
export const INFO_PROTEGER =
  "Efeito de +10 travessias em 15 min na velocidade, descontados tráfego e hora: associação, não causalidade. Assinalada: não abranda com clareza e tem muitas travessias. SC0007–0010, SC0011–0013, SC0019–0022 e SC0023/24 partilham segmentos: não são independentes.";

/** A 2.ª nota do «ⓘ» (ADR-0048, ponto 2): a fonte dos semáforos, que saiu da legenda. */
export const INFO_SEMAFORO_PROTEGER = `Com semáforo (${FONTE_SEMAFORO}): o abrandamento não se mede da mesma forma, e a passadeira não é assinalada.`;

/**
 * O boletim da Câmara (ADR-0052): um botão discreto abre, noutro separador, a página para imprimir, que o browser guarda em PDF
 * sem rede.
 */
function BotaoBoletim() {
  return (
    <a className="botao botao--fantasma boletim-botao" href="?boletim" target="_blank" rel="noopener">
      Exportar boletim da Câmara
    </a>
  );
}

export function PainelProteger() {
  const { estado } = useEstadoDemo();
  const passadeiras = usePassadeirasProteger();
  if (estado.vistaProteger === "risco") {
    return (
      <>
        <EscolhaDaVista />
        <PainelRisco />
        <BotaoBoletim />
      </>
    );
  }
  return (
    <>
      <EscolhaDaVista />
      <CabecalhoDoPainel titulo="Os carros abrandam quando há peões?" info={[INFO_PROTEGER, INFO_SEMAFORO_PROTEGER, INFO_AEREA]} />
      <ComResultado resultado={passadeiras.resultado} recarregar={passadeiras.recarregar} titulo="Abrandamento por passadeira">
        {(dados) => <ConteudoProteger passadeiras={dados} />}
      </ComResultado>
      <BotaoBoletim />
    </>
  );
}
