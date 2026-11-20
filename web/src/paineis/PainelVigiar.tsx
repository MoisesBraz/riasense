/**
 * ① Vigiar: que falhas tem o IT de tratar primeiro? Tudo vem de `/vigiar/falhas` e `/sensores`.
 *
 * Mapa primeiro, detalhe a pedido (ADR-0033): ao abrir, só os 3 chips por cima do mapa (`ChipsVigiar`), sem barra
 * lateral. Clicar num sensor ou na RSU abre um pop-up preso ao marcador (`DetalheVigiar`), com a sua linha do tempo.
 * A barra lateral abre só ao clicar num chip, com a lista dessas falhas; abrir uma linha mostra o sensor no mapa.
 */
import { useCallback, useId, useLayoutEffect, useRef, useState, type RefObject } from "react";
import { Icone } from "../componentes/Icone";
import { useCarros, useFalhas, useSegmentosCarros, useSensores } from "../api/recursos";
import type { Falha, TipoSensor } from "../api/tipos";
import { Botao, Pergunta, TipoFalha, useFecharComEscape } from "../componentes/Basicos";
import { ComResultado, Vazio } from "../componentes/Estados";
import { Cabecalho, PopupSensor } from "../componentes/PopupSensor";
import { IconeTipo, SimboloDaFalha } from "../componentes/Simbolos";
import { LinhaDoTempoRsu, LinhaDoTempoSensor } from "../componentes/FitaSensores";
import { TriagemDaFalha } from "../componentes/TriagemDaFalha";
import { config } from "../config";
import { numero, rotuloSensor } from "../dominio/formato";
import { ESTADO_DA_FALHA, type TipoDaFalha } from "../dominio/marcadores";
import { inicioDaHora, lerInstante, rotuloDia } from "../dominio/tempo";
import { chaveDaFalha, falhaDoPopup, falhaNaHora, ordemDeIntervencao, resumirFalhas } from "../dominio/vigiar";
import { useEstadoDemo, type FiltroSensor, type FiltroVigiar } from "../estado/estado";
import { useModoAgora } from "../estado/agora";
import { DetalheAgora } from "./PainelAgora";

const periodo = `${rotuloDia(config.periodo.inicio)} a ${rotuloDia(config.periodo.fim)}`;

/** ⓘ do Vigiar: no máximo 40 palavras (ADR-0033, ponto 4). */
export const INFO_VIGIAR =
  "Falha inesperada: um sensor sem dados em horas que costumam ter atividade. A noite calma é sossego normal, não falha. Falha de rede: vários sensores da mesma RSU ficam sem comunicação ao mesmo tempo.";

/**
 * A 2.ª nota do «ⓘ» do Vigiar (ADR-0048, ponto 2): o que vale cada ponto do «Trânsito» e cada figura 3D, e de onde vêm
 * as alturas dos edifícios (as que o OpenStreetMap não tem dizem-se aproximadas, ADR-0037). Saiu da legenda, que só tem o
 * símbolo e o nome. Também no máximo 40 palavras.
 */
/** A ressalva da vista aérea (ADR-0045, ponto 6; no «ⓘ» pelo ADR-0048). No máximo 40 palavras. */
export const INFO_AEREA =
  "Vista aérea: fotografia da DGT de 2025, não é da semana dos dados; os carros e as pessoas da fotografia não são dados. " +
  "Sobre ela, o contraste das cores dos estados não está garantido.";

export const INFO_MAPA_VIGIAR =
  `No mapa: cada ponto do «Trânsito» ≈ ${config.carros.veiculosPorPonto} veículos medidos na hora, com anel se a mediana passa o ` +
  `limite da via; cada figura 3D ≈ ${config.pessoas.travessiasPorFigura} travessias (máx. ${config.pessoas.figurasMax} por passadeira)` +
  `${config.pessoas.aspeto === "variado" ? ", de aspeto ilustrativo" : ""}; alturas: LiDAR da DGT (2024) na zona; fora, ` +
  `OpenStreetMap ou ${config.mapa.edificioAlturaM} m (aproximada).`

/**
 * A 3.ª nota do «ⓘ» do Vigiar (ADR-0043 e ADR-0044, pela regra do ADR-0048): o que é medido e o que é ilustrativo na avenida e
 * nos peões da vista 3D. No máximo 40 palavras.
 */
export const INFO_AVENIDA_VIGIAR =
  "Na avenida, a largura é medida nas passadeiras; passeios e estacionamento são estimados; carros estacionados só nos " +
  "lugares com sensor (tracejado: desconhecido). A espera dos peões e a paragem dos carros são ilustrativas: a ④ mede se abrandam.";
/** A nota do «ⓘ» sobre os mapas de calor (ADR-0047, pontos 3 e 4). No máximo 40 palavras. */
export const INFO_CALOR =
  "Calor: intensidade relativa ao máximo da semana de cada tipo de sensor. As manchas somam os sensores próximos; a cor é relativa " +
  "e não é a medida de um só sensor. Só onde há sensor; nas falhas inclui estimados.";

const TIPO: Record<TipoSensor, string> = {
  passadeira: "Passadeira",
  zona: "Zona turística",
  segmento: "Segmento de estrada",
  estacionamento: "Estacionamento",
};

// ── Os 3 chips por cima do mapa ────────────────────────────────

/**
 * Os 3 indicadores do ① Vigiar, por cima do mapa: cartões com o rótulo, o número e uma nota. Clicar abre a lista.
 * Ao lado, o «ⓘ» com as duas notas do separador: sem chip escolhido não há painel, e as ressalvas do mapa ficavam só no
 * cabeçalho da lista (ADR-0048, «sempre visíveis onde fazem sentido»).
 */
export function ChipsVigiar() {
  const { estado, despachar } = useEstadoDemo();
  const { resultado } = useFalhas();
  const [info, setInfo] = useState(false);
  useFecharComEscape(info, useCallback(() => setInfo(false), []));
  const idInfo = useId();
  if (resultado.estado !== "ok") return null;
  const r = resumirFalhas(resultado.dados);
  const cartoes: { filtro: FiltroVigiar; rotulo: string; valor: number; nota: string; tom: string; tipo?: TipoDaFalha }[] = [
    { filtro: "todas", rotulo: "Falhas", valor: r.total, nota: "inesperadas", tom: "neutro" },
    { filtro: "rede", rotulo: "Falhas de rede", valor: r.incidentesRede, nota: `${r.falhasRede} sensores juntos`, tom: "erro", tipo: "rede" },
    { filtro: "dispositivo", rotulo: "Falhas de dispositivo", valor: r.dispositivo, nota: "um sensor sozinho", tom: "dispositivo", tipo: "dispositivo" },
  ];
  return (
    <div className="indicadores kpis" role="group" aria-label="Resumo das falhas inesperadas">
      {cartoes.map((c) => {
        const ativo = estado.filtroVigiar === c.filtro;
        return (
          <button
            key={c.filtro}
            type="button"
            className={`kpi kpi--botao kpi--${c.tom}`}
            aria-pressed={ativo}
            aria-label={`${c.valor} ${c.rotulo.toLowerCase()}: ${c.nota}`}
            onClick={() => despachar({ tipo: "filtro-vigiar", filtro: ativo ? null : c.filtro, sensor: "todos" })}
          >
            <span className={`kpi__rotulo ${c.tipo ? "kpi__rotulo--com-simbolo" : ""}`}>
              {c.tipo && <SimboloDaFalha tipo={c.tipo} />}
              {c.rotulo}
            </span>
            <strong className="kpi__valor">{c.valor}</strong>
            <span className="kpi__nota">{c.nota}</span>
          </button>
        );
      })}
      <button
        type="button"
        className="botao-info indicadores__botao-info"
        aria-expanded={info}
        aria-controls={idInfo}
        aria-label="Sobre o Vigiar e o mapa"
        onClick={() => setInfo((a) => !a)}
      >
        ⓘ
      </button>
      {info && (
        <div id={idInfo} className="pergunta__info indicadores__info" role="note">
          <p>{INFO_VIGIAR}</p>
          <p>{INFO_MAPA_VIGIAR}</p>
          <p>{INFO_AVENIDA_VIGIAR}</p>
          <p>{INFO_AEREA}</p>
          <p>{INFO_CALOR}</p>
        </div>
      )}
    </div>
  );
}

// ── A lista de um chip ─────────────────────────────────────────

const TITULO_FILTRO: Record<FiltroVigiar, string> = {
  todas: "Falhas inesperadas",
  rede: "Falhas de rede",
  dispositivo: "Falhas de dispositivo",
};

const OPCOES_FALHA: { valor: FiltroVigiar; nome: string }[] = [
  { valor: "todas", nome: "Todas" },
  { valor: "rede", nome: "Rede" },
  { valor: "dispositivo", nome: "Dispositivo" },
];
// Sem «RSU»: nenhuma falha é da RSU como tipo de sensor (as de rede filtram-se por «Rede», e o estacionamento mede-se na RSU).
const OPCOES_SENSOR: { valor: FiltroSensor; nome: string }[] = [
  { valor: "todos", nome: "Todos" },
  { valor: "passadeira", nome: "Passadeira" },
  { valor: "segmento", nome: "Segmento" },
  { valor: "estacionamento", nome: "Estacionamento" },
  { valor: "zona", nome: "Zona" },
];
const daFalha = (f: Falha, filtro: FiltroVigiar) => filtro === "todas" || f.tipo === filtro;
const doSensor = (f: Falha, sensor: FiltroSensor) => sensor === "todos" || f.tipo_sensor === sensor;

/** Sem medida (o jsdom não desenha, ou antes da 1.ª medição), a página leva este número de linhas. */
export const LINHAS_SEM_MEDIDA = 8;

/** Quantas linhas de altura `linha` cabem em `altura`, com `espaco` entre elas (ADR-0048, ponto 5); pelo menos 1. */
export function linhasQueCabem(altura: number, linha: number, espaco: number): number {
  if (!(altura > 0) || !(linha > 0)) return LINHAS_SEM_MEDIDA;
  return Math.max(1, Math.floor((altura + espaco) / (linha + espaco)));
}

/** Mede a lista (que ocupa a altura que sobra na coluna) e diz quantas linhas cabem: num ecrã mais baixo, menos. */
function useLinhasQueCabem(lista: RefObject<HTMLUListElement | null>): number {
  const [n, setN] = useState(LINHAS_SEM_MEDIDA);
  useLayoutEffect(() => {
    const el = lista.current;
    if (!el || typeof ResizeObserver === "undefined") return;
    const medir = () => {
      const estilo = getComputedStyle(el);
      setN(linhasQueCabem(el.clientHeight, parseFloat(estilo.getPropertyValue("--linha")), parseFloat(estilo.rowGap) || 0));
    };
    medir();
    const obs = new ResizeObserver(medir);
    obs.observe(el);
    return () => obs.disconnect();
  }, [lista]);
  return n;
}

/** Uma página da lista e os botões ‹ ›. Muda de chave com os filtros: mudar de filtro volta à página 1. */
function PaginasDeFalhas({
  lista,
  filtro,
  alvo,
  ordem,
}: {
  lista: Falha[];
  filtro: FiltroVigiar;
  alvo: (f: Falha) => string;
  ordem: Map<string, number>;
}) {
  const { despachar } = useEstadoDemo();
  const ul = useRef<HTMLUListElement>(null);
  const porPagina = useLinhasQueCabem(ul);
  const [pagina, setPagina] = useState(0);
  const paginas = Math.max(1, Math.ceil(lista.length / porPagina));
  const atual = Math.min(pagina, paginas - 1); // a janela cresceu: a página atual pode deixar de existir
  const inicio = atual * porPagina;
  const fim = Math.min(inicio + porPagina, lista.length);
  return (
    <>
      <ul className="lista-falhas" ref={ul}>
        {lista.slice(inicio, fim).map((f) => (
          <li key={`${f.sensor}-${f.inicio}`}>
            <button
              type="button"
              className="lista-falhas__linha"
              onClick={() => {
                // A hora vai para o início da falha, e o pop-up mostra essa falha (ADR-0053, ponto 1).
                despachar({ tipo: "hora", hora: inicioDaHora(lerInstante(f.inicio)) });
                despachar({ tipo: "popup", sensor: alvo(f), centrar: true, falha: chaveDaFalha(f) });
              }}
            >
              {/* O texto da linha já diz o tipo («Passadeira», «Segmento de estrada»…): o ícone é decorativo. */}
              <IconeTipo especie={f.tipo_sensor} estado={ESTADO_DA_FALHA[f.tipo]} decorativo />
              <span className="lista-falhas__texto">
                {/* Só a ordem de intervenção (ADR-0053), antes do nome para nunca ficar cortada: a sugestão fica no pop-up,
                    porque a linha tem altura fixa e uma só linha (ADR-0048). */}
                <span className="lista-falhas__nome">
                  <span className="lista-falhas__ordem">{ordem.get(chaveDaFalha(f))}.º</span> {rotuloSensor(f.sensor)}
                </span>
                {/* O dia e a duração primeiro: numa coluna estreita, é o tipo (que o ícone também diz) que fica com reticências. */}
                <span className="lista-falhas__detalhe">
                  <span className="lista-falhas__quando">
                    {rotuloDia(lerInstante(f.inicio))} · {numero(f.duracao_h)} h
                  </span>
                  <span className="lista-falhas__tipo">{TIPO[f.tipo_sensor]}</span>
                </span>
              </span>
              {filtro === "todas" && <TipoFalha tipo={f.tipo} />}
            </button>
          </li>
        ))}
      </ul>
      <nav className="paginacao" aria-label="Páginas da lista">
        <span className="paginacao__posicao" aria-live="polite">
          {lista.length ? `${inicio + 1}–${fim} de ${lista.length}` : "0 de 0"}
        </span>
        <button type="button" className="botao-icone" aria-label="Página anterior" disabled={atual === 0} onClick={() => setPagina(atual - 1)}>
          ‹
        </button>
        <button
          type="button"
          className="botao-icone"
          aria-label="Página seguinte"
          disabled={fim >= lista.length}
          onClick={() => setPagina(atual + 1)}
        >
          ›
        </button>
      </nav>
    </>
  );
}

/**
 * A lista das falhas na coluna da direita (ADR-0048, ponto 5): nunca passa da altura da janela, pagina-se pela altura que
 * sobra, e filtra-se por tipo de falha e por tipo de sensor, os dois juntos. Cada opção diz quantas falhas tem; a que fica
 * vazia por causa do outro filtro diz «(0)» e fica desativada.
 */
function ListaFalhas({ filtro, falhas }: { filtro: FiltroVigiar; falhas: Falha[] }) {
  const { estado, despachar } = useEstadoDemo();
  const sensor = estado.filtroSensor;
  const sensores = useSensores();
  const noMapa = new Set(sensores.resultado.estado === "ok" ? sensores.resultado.dados.filter((s) => s.lon !== null && s.lat !== null).map((s) => s.id) : []);
  // Só passadeiras, zonas e RSU têm pop-up com detalhe (ADR-0033, ponto 3); os segmentos e o estacionamento abrem o da RSU. Se a RSU não
  // for um sensor no mapa (a RSU0006 não é), o pop-up fica no próprio sensor, e a TZ0006 e os segmentos dela abrem em vez de não abrir nada.
  const alvo = (f: Falha) => (f.tipo_sensor === "passadeira" || f.tipo_sensor === "zona" ? f.sensor : f.rsu && noMapa.has(f.rsu) ? f.rsu : f.sensor);
  // Pela ordem de intervenção (ADR-0053), contada sobre todas as falhas: os filtros escondem linhas, não mudam os números.
  const ordem = ordemDeIntervencao(falhas);
  const lista = falhas
    .filter((f) => daFalha(f, filtro) && doSensor(f, sensor))
    .sort((a, b) => (ordem.get(chaveDaFalha(a)) ?? 0) - (ordem.get(chaveDaFalha(b)) ?? 0));
  // O chip das falhas de rede conta incidentes (a RSU que deixou de comunicar); a lista mostra os sensores de cada um.
  const incidentes = new Set(lista.filter((f) => f.tipo === "rede").map((f) => f.grupo)).size;
  const resumo =
    filtro === "rede"
      ? `${incidentes} ${incidentes === 1 ? "incidente" : "incidentes"} · ${lista.length} sensores · ${periodo}`
      : `${lista.length} · ${periodo}`;
  const nFalha = (v: FiltroVigiar) => falhas.filter((f) => daFalha(f, v) && doSensor(f, sensor)).length;
  const nSensor = (v: FiltroSensor) => falhas.filter((f) => daFalha(f, filtro) && doSensor(f, v)).length;
  return (
    <section className="falhas" aria-label="Lista das falhas">
      <header className="detalhe__cabecalho">
        <Pergunta titulo={TITULO_FILTRO[filtro]} info={[INFO_VIGIAR, INFO_MAPA_VIGIAR, INFO_AVENIDA_VIGIAR, INFO_AEREA, INFO_CALOR]} />
        <button
          type="button"
          className="botao-icone"
          aria-label="Fechar a lista"
          onClick={() => despachar({ tipo: "filtro-vigiar", filtro: null })}
        >
          <Icone nome="fechar" />
        </button>
      </header>
      <p className="detalhe__subtitulo">{resumo}</p>
      <div className="falhas__filtros">
        <label className="falhas__filtro">
          Tipo de falha
          <select value={filtro} onChange={(e) => despachar({ tipo: "filtro-vigiar", filtro: e.target.value as FiltroVigiar })}>
            {OPCOES_FALHA.map((o) => {
              const n = nFalha(o.valor);
              return (
                <option key={o.valor} value={o.valor} disabled={n === 0 && o.valor !== filtro}>
                  {o.nome} ({n})
                </option>
              );
            })}
          </select>
        </label>
        <label className="falhas__filtro">
          Tipo de sensor
          <select value={sensor} onChange={(e) => despachar({ tipo: "filtro-sensor", sensor: e.target.value as FiltroSensor })}>
            {OPCOES_SENSOR.map((o) => {
              const n = nSensor(o.valor);
              return (
                <option key={o.valor} value={o.valor} disabled={n === 0 && o.valor !== sensor}>
                  {o.nome} ({n})
                </option>
              );
            })}
          </select>
        </label>
      </div>
      <PaginasDeFalhas key={`${filtro}|${sensor}`} lista={lista} filtro={filtro} alvo={alvo} ordem={ordem} />
    </section>
  );
}

/** O detalhe de uma zona turística ou de um segmento: o nome, o estado à hora escolhida e as falhas na semana. */
function DetalheSimples({ id, onFechar }: { id: string; onFechar: () => void }) {
  const { estado } = useEstadoDemo();
  const falhas = useFalhas();
  const sensores = useSensores();
  const sensor = sensores.resultado.estado === "ok" ? sensores.resultado.dados.find((s) => s.id === id) : undefined;
  const daZona = falhas.resultado.estado === "ok" ? falhas.resultado.dados.filter((f) => f.sensor === id) : [];
  const daFalha = falhaDoPopup(daZona, id, estado.hora);
  const segmento = id.includes("RoadSegment");
  // Num segmento, os carros medidos nesta hora e o sensor que os mediu: a câmara, ou o radar se a câmara não mediu (ADR-0034).
  const carros = useCarros(estado.hora).resultado;
  const medida = carros.estado === "ok" ? carros.dados.find((c) => c.id === id) : undefined;
  // O sensor do troço para a semana toda (ADR-0034): diz-se mesmo nas horas sem passagens, e nunca «nem pelo radar» (ADR-0039).
  const segmentosCarros = useSegmentosCarros();
  const sensorDoTroco = medida?.sensor ?? segmentosCarros.find((s) => s.id === id)?.sensor;
  const peloSensor = sensorDoTroco === "Radar" ? "pelo radar" : "pela câmara";
  return (
    <section className="popup" role="dialog" aria-label={`Sensor ${rotuloSensor(id)}`}>
      {/* O mesmo cabeçalho em duas linhas dos outros pop-ups: o título e o ✕ em cima, o tipo e o estado por baixo. */}
      <Cabecalho
        titulo={`${rotuloSensor(id)}${sensor?.nome ? ` · ${sensor.nome}` : ""}`}
        tipo={segmento ? "segmento de estrada" : "zona turística"}
        especie={segmento ? "segmento" : "zona"}
        estado={daFalha ? ESTADO_DA_FALHA[daFalha.tipo] : "ativo"}
        onFechar={onFechar}
      />
      <p className="popup__linha">
        {daZona.length === 0
          ? "Sem falhas inesperadas na semana."
          : `${daZona.length} ${daZona.length === 1 ? "falha inesperada" : "falhas inesperadas"} na semana.`}
      </p>
      {id.includes("RoadSegment") && carros.estado === "ok" && sensorDoTroco && (
        <>
          <p className="popup__linha">
            {medida
              ? `${numero(medida.veiculos)} ${medida.veiculos === 1 ? "veículo medido" : "veículos medidos"} nesta hora, ${peloSensor}.`
              : `Sem veículos medidos nesta hora ${peloSensor}.`}
          </p>
          {/* O limite da via e a parte dos veículos medidos acima dele, nesta hora e neste troço (ADR-0039, ponto 4). */}
          {medida && medida.limite_kmh != null && medida.acima_limite != null && medida.veiculos > 0 && (
            <p className="popup__linha">
              Limite da via: {numero(Math.round(medida.limite_kmh))} km/h; {numero(Math.round((100 * medida.acima_limite) / medida.veiculos))} % dos veículos medidos
              acima dele nesta hora.
            </p>
          )}
          {sensorDoTroco === "Radar" && (
            <p className="popup__nota">O radar e a câmara medem velocidades diferentes: o excesso não é comparável entre sensores.</p>
          )}
        </>
      )}
    </section>
  );
}

/**
 * O pop-up do ① Vigiar, preso ao sensor no mapa: só esse sensor, com a sua linha do tempo; numa RSU, os sensores
 * dela. No modo «agora», o detalhe do simulador.
 */
export function DetalheVigiar({ id, onFechar }: { id: string; onFechar: () => void }) {
  const { estado, despachar } = useEstadoDemo();
  const falhas = useFalhas();
  const agora = useModoAgora();
  if (agora) return <DetalheAgora id={id} onFechar={onFechar} />;
  // A história da RSU0030 continua no Completar: uma passadeira em falha leva ao seu sensor virtual.
  const emFalha =
    id.includes("SmartCrosswalk") && falhas.resultado.estado === "ok" && falhaNaHora(falhas.resultado.dados, id, estado.hora) !== undefined;
  const simples = id.includes("TouristZone") || id.includes("RoadSegment");
  // A triagem para o IT (ADR-0053): a falha da linha da lista que abriu o pop-up, ou a do sensor à hora escolhida (com duas
  // nessa hora, a que começou mais tarde); sem falha a essa hora, não há sugestão nem botão.
  const todas = falhas.resultado.estado === "ok" ? falhas.resultado.dados : [];
  const daLinha = estado.popup?.id === id && estado.popup.falha ? todas.find((f) => chaveDaFalha(f) === estado.popup?.falha) : undefined;
  const falha = daLinha ?? falhaDoPopup(todas, id, estado.hora);
  return (
    <div className="detalhe-mapa">
      {simples ? <DetalheSimples id={id} onFechar={onFechar} /> : <PopupSensor id={id} onFechar={onFechar} />}
      {falha && (
        <TriagemDaFalha
          key={chaveDaFalha(falha)}
          falha={falha}
          ordem={ordemDeIntervencao(todas).get(chaveDaFalha(falha))}
          doSensor={falha.sensor === id}
        />
      )}
      {emFalha && (
        <div className="acoes">
          <Botao onClick={() => despachar({ tipo: "separador", separador: "completar" })}>Ver a estimativa →</Botao>
        </div>
      )}
      {id.includes("RoadSideUnit") ? <LinhaDoTempoRsu rsu={id} /> : <LinhaDoTempoSensor id={id} />}
    </div>
  );
}

/** A barra lateral do ① Vigiar: só a lista de um chip (o detalhe de um sensor abre no pop-up do mapa, ADR-0033). */
export function PainelVigiar() {
  const { estado } = useEstadoDemo();
  const falhas = useFalhas();
  const filtro = estado.filtroVigiar;
  if (!filtro) return null;
  return (
    <ComResultado
      resultado={falhas.resultado}
      recarregar={falhas.recarregar}
      titulo="Falhas inesperadas"
      vazio={
        <Vazio titulo="Sem falhas inesperadas" icone="ok">
          Entre {periodo} não há falhas inesperadas nos sensores. O sossego noturno não conta como falha.
        </Vazio>
      }
    >
      {(dados) => <ListaFalhas filtro={filtro} falhas={dados} />}
    </ComResultado>
  );
}
