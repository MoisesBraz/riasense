/**
 * O modo «agora» (ADR-0030, ADR-0032): o simulador mostra-se no próprio mapa, e não numa caixa com listas.
 * - `PainelAgora`: a faixa no topo do mapa, com a etiqueta (vem dos dados, `fonte: "simulador"`), a hora simulada e
 *   os botões «cortar a RSU» e «repor» (ADR-0032).
 * - `AvisosAgora`: no canto, um aviso por RSU sem comunicação («sem comunicação», com «sem dados há 13 min»); clicar abre o detalhe na barra lateral.
 * - `DetalheAgora`: na barra lateral, o último dado e o limite do sensor ou da RSU clicada.
 * Um «sem comunicação» é um alerta rápido (âmbar); passa a «falha» (vermelho) quando cumpre a falha inesperada (ADR-0033).
 */
import { Icone } from "../componentes/Icone";
import { ETIQUETA_SIMULADOR, type RsuAgora, type SensorAgora } from "../api/agora";
import { Botao, Selo } from "../componentes/Basicos";
import { IconeTipo } from "../componentes/Simbolos";
import type { EstadoSensor } from "../dominio/marcadores";
import { numero, rotuloLista, rotuloSensor } from "../dominio/formato";
import { useEstadoDemo } from "../estado/estado";
import { useModoAgora } from "../estado/agora";

/** «há 3 min», «há 1 h 05 min». */
export function ha(minutos: number): string {
  const m = Math.max(0, Math.floor(minutos));
  if (m < 60) return `há ${m} min`;
  return `há ${Math.floor(m / 60)} h ${String(m % 60).padStart(2, "0")} min`;
}

/** O estado do simulador como estado do ADR-0033, para o ícone do tipo o levar (a RSU sem comunicação é «atenção»; a em falha, «falha de rede»). */
const estadoDoSimulador = (x: { calado: boolean; falha?: boolean }): EstadoSensor => (x.falha ? "falha-rede" : x.calado ? "atencao" : "ativo");

/** A RSU em falha diz «falha de rede» (o silêncio é o da RSU); o sensor isolado fica «falha», porque o simulador não distingue o tipo. */
function EstadoAgora({ calado, falha, rsu }: { calado: boolean; falha?: boolean; rsu?: boolean }) {
  if (falha) return <Selo tipo="erro">{rsu ? "falha de rede" : "falha"}</Selo>;
  return calado ? <Selo tipo="aviso">sem comunicação</Selo> : <Selo tipo="ok">a enviar</Selo>;
}

/** A faixa do modo «agora», no topo do mapa (no lugar dos chips). */
export function PainelAgora() {
  const agora = useModoAgora();
  if (!agora) return null;
  const { leitura, falha, repor, fechar } = agora;
  const dados = leitura.estado === "ok" ? leitura.dados : null;
  return (
    <section className="faixa-agora kpi" aria-label="Painel agora">
      {/* O mesmo cartão dos indicadores (Kpi): o rótulo, a hora simulada em destaque e a etiqueta por baixo. */}
      <div className="faixa-agora__corpo">
        <span className="kpi__rotulo">Agora</span>
        {dados && (
          <strong className="faixa-agora__relogio">
            hora simulada {dados.hora_simulada} · ×{numero(dados.velocidade)}
          </strong>
        )}
        {leitura.estado === "a-carregar" && <span className="kpi__nota">A ligar…</span>}
        {leitura.estado === "sem-ligacao" && <span className="kpi__nota">Sem ligação ao Living Lab. O resto da demo continua igual.</span>}
        {leitura.estado === "por-calcular" && <span className="kpi__nota">Por calcular: {leitura.motivo}</span>}
        {leitura.estado === "desligado" && <span className="kpi__nota">O painel «agora» está desligado.</span>}
      </div>
      <div className="faixa-agora__acoes">
        {dados &&
          (dados.falha.ativa ? (
            <Botao variante="secundario" onClick={repor}>
              Repor
            </Botao>
          ) : (
            <Botao onClick={falha}>Cortar a {rotuloSensor(dados.falha.rsu)}</Botao>
          ))}
        <button type="button" className="ferramenta" onClick={fechar} aria-label="Fechar o painel agora" title="Fechar">
          <Icone nome="fechar" />
        </button>
      </div>
      {/* A etiqueta numa linha a toda a largura: o cartão tem a mesma altura antes e depois de simular. */}
      {dados?.fonte === "simulador" && (
        <p className="etiqueta-simulacao" role="note">
          {ETIQUETA_SIMULADOR}
        </p>
      )}
    </section>
  );
}

/** Os avisos no canto: um por RSU sem comunicação ou em falha; clicar abre o detalhe da RSU na barra lateral. */
export function AvisosAgora() {
  const agora = useModoAgora();
  const { despachar } = useEstadoDemo();
  const dados = agora?.leitura.estado === "ok" ? agora.leitura.dados : null;
  const rsus = dados?.rsus.filter((r) => r.calado) ?? [];
  const sensores = dados?.sensores.filter((s) => s.calado).length ?? 0;
  if (!rsus.length) return null;
  return (
    <div className="avisos-agora" role="alert">
      {rsus.map((r) => (
        <button
          key={r.id}
          type="button"
          className={`aviso-agora ${r.falha ? "aviso-agora--falha" : ""}`}
          onClick={() => despachar({ tipo: "popup", sensor: r.id })}
        >
          <span className="aviso-agora__titulo">
            <IconeTipo especie="rsu" estado={estadoDoSimulador(r)} />
            <strong>{r.falha ? "Falha de rede" : "Sem comunicação"}</strong>
          </span>
          <span>
            {rotuloSensor(r.id)} ({rotuloLista(r.passadeiras)}): sem dados {ha(r.ultimo_dado_min)}. Verificar no local.
          </span>
          {sensores > 0 && <span className="aviso-agora__nota">{sensores} sensores sem comunicação</span>}
        </button>
      ))}
    </div>
  );
}

/** Na barra lateral, no modo «agora»: o sensor ou a RSU clicada, segundo o simulador. */
export function DetalheAgora({ id, onFechar }: { id: string; onFechar: () => void }) {
  const agora = useModoAgora();
  const dados = agora?.leitura.estado === "ok" ? agora.leitura.dados : null;
  const x: SensorAgora | RsuAgora | undefined = dados?.sensores.find((s) => s.id === id) ?? dados?.rsus.find((r) => r.id === id);
  return (
    <section className="detalhe-agora" aria-label={`Agora: ${rotuloSensor(id)}`}>
      <header className="detalhe__cabecalho">
        <div className="detalhe-agora__nome">
          <IconeTipo id={id} estado={x ? estadoDoSimulador(x) : undefined} />
          <div>
            <h2 className="detalhe-agora__titulo">{rotuloSensor(id)}</h2>
            <p className="detalhe__subtitulo">Simulação com dados fictícios</p>
          </div>
        </div>
        <button type="button" className="botao-icone" onClick={onFechar} aria-label="Fechar o detalhe">
          <Icone nome="fechar" />
        </button>
      </header>
      {!x ? (
        <p className="nota">Sem dados do simulador para este sensor.</p>
      ) : (
        <>
          <EstadoAgora calado={x.calado} falha={x.falha} rsu={!("tipo" in x)} />
          <p className="detalhe-agora__numero">
            <strong>{ha(x.ultimo_dado_min)}</strong> <span>o último dado</span>
          </p>
          <p className="nota">
            {x.limite_min === null ? "Quase sem atividade a esta hora: sem alerta." : `O alerta «sem comunicação» aparece aos ${numero(x.limite_min, 1)} min sem dados.`}
          </p>
        </>
      )}
    </section>
  );
}
