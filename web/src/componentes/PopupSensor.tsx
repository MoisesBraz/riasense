/**
 * Pop-up de um sensor no mapa (ADR-0033, ponto 3): o nome, o tipo e o estado (com a cor e a forma do ponto 1), um
 * número grande, um gráfico e uma linha que depende do separador. No máximo 25 palavras, sem contar com as etiquetas
 * obrigatórias. Só passadeiras e RSU, que são os que têm marcador.
 */
import { Icone } from "./Icone";
import { especieDoId, EstadoComSimbolo, IconeTipo } from "./Simbolos";
import { useEffect, useRef, type ReactNode } from "react";
import type { Resultado } from "../api/cliente";
import type { ProximoSensor } from "../api/recursos";
import {
  useFalhas,
  useIntervalos,
  useLuminosidade,
  usePassadeirasProteger,
  usePrevisoes,
  useProximoSensor,
  useRiscoPotencial,
  useSensores,
  useSensoresVirtuais,
} from "../api/recursos";
import type { Falha, Sensor, SensorVirtual } from "../api/tipos";
import { config } from "../config";
import { emAtencao, serieVirtual, sitiosDoProximo, travessiasPorHora, virtualNaHora } from "../dominio/completar";
import { comSinal, numero, rotuloLista, rotuloSensor } from "../dominio/formato";
import { rotuloLuz } from "../dominio/luminosidade";
import { estadoDeSaude, type EspecieDoSensor, type EstadoSensor, type TipoDaFalha } from "../dominio/marcadores";
import { HORIZONTE_H, sensoresDaRsu } from "../dominio/prever";
import { diasDeDados } from "../dominio/proteger";
import { nivelDoRisco, percentil } from "../dominio/risco";
import { HORA_MS, lerInstante, rotuloDia, rotuloHoras } from "../dominio/tempo";
import { falhaDoPopup, falhaNaHora, redeDesde } from "../dominio/vigiar";
import { useEstadoDemo, type EstadoDemo } from "../estado/estado";
import { GraficoIntervalo } from "./graficos/GraficoIntervalo";

const ok = <T,>(r: Resultado<T>): T[] => (r.estado === "ok" ? r.dados : []);
const ZONA = new Set(config.zona.passadeiras.map((p) => `urn:ngsi-ld:${p}`));

/** O estado do sensor, com o símbolo ao lado do nome por extenso: a cor nunca vem sozinha (ADR-0033). */
export function EstadoDoSensor({ estado, falha }: { estado: EstadoSensor; falha?: TipoDaFalha }) {
  return <EstadoComSimbolo estado={estado} falha={falha} />;
}

/**
 * O cabeçalho, em duas linhas. Na 1.ª, o título completo (quebra se for comprido) e o ✕ no canto de cima, à
 * direita; na 2.ª, o tipo e os badges de informação em fila que quebra: o estado (com a forma e a cor do ADR-0033) e
 * as etiquetas («estimado», «às escuras», ADR-0018).
 */
export function Cabecalho({
  titulo,
  tipo,
  especie,
  estado,
  falha,
  etiquetas = [],
  onFechar,
}: {
  titulo: string;
  tipo: string;
  /** O ícone do tipo, ao lado do nome do tipo: o mesmo das listas e do mapa; o segmento leva o da legenda. */
  especie?: EspecieDoSensor;
  estado: EstadoSensor;
  falha?: TipoDaFalha;
  etiquetas?: string[];
  onFechar: () => void;
}) {
  return (
    <header className="popup__cabecalho">
      <div className="popup__titulo">
        <strong className="popup__nome">{titulo}</strong>
        <button type="button" className="botao-icone popup__fechar" onClick={onFechar} aria-label="Fechar o pop-up">
          <Icone nome="fechar" />
        </button>
      </div>
      <div className="popup__meta">
        <span className="popup__tipo">
          {especie && <IconeTipo especie={especie} decorativo />}
          {tipo}
        </span>
        <EstadoDoSensor estado={estado} falha={falha} />
        {etiquetas.map((e) => (
          <span key={e} className="popup__etiqueta">
            {e}
          </span>
        ))}
      </div>
    </header>
  );
}

function NumeroGrande({ valor, unidade, nota }: { valor: ReactNode; unidade: string; nota?: ReactNode }) {
  return (
    <p className="popup__numero">
      <strong>{valor}</strong> <span>{unidade}</span>
      {nota && <span className="popup__nota">{nota}</span>}
    </p>
  );
}

const falhaDesde = (f: Falha) => `${rotuloDia(lerInstante(f.inicio))} ${rotuloHoras(lerInstante(f.inicio), true)}`;

/** Aviso da frase do local (ADR-0015), curto: a atividade subiu face ao tipo, e o erro pode vir daí. */
function avisoDoLocal(l: ProximoSensor): string | null {
  if (!/a atividade subiu/.test(l.frase) || l.queda_diaria === null) return null;
  return `A atividade subiu ${numero(1 - l.queda_diaria, 1)} vezes: o erro pode vir daí.`;
}

/** «Onde pôr o próximo sensor» (ADR-0033, ponto 5): a redução potencial estimada, a distância e o aviso do local. */
function LinhasDoProximo({ local, posicao }: { local: ProximoSensor; posicao: number }) {
  const aviso = avisoDoLocal(local);
  return (
    <>
      <NumeroGrande valor={`${posicao}.º`} unidade="lugar" />
      <p className="popup__linha">Redução potencial estimada: {numero(local.reducao_potencial ?? 0, 2)} (hipótese)</p>
      {local.vizinho_m !== null && <p className="popup__linha">Vizinho mais próximo a {numero(local.vizinho_m)} m.</p>}
      {aviso && <p className="popup__aviso">{aviso}</p>}
    </>
  );
}

function LinhaDoRisco({ id, hora }: { id: string; hora: number }) {
  const linha = ok(useRiscoPotencial(hora).resultado).find((l) => l.id === id);
  if (!linha) return <p className="popup__linha">Risco potencial por calcular a esta hora.</p>;
  const n = nivelDoRisco(linha.risco_potencial);
  const previsao = linha.previsao_disponivel ? percentil(linha.previsao_pct) : "—";
  // Com semáforo (ADR-0024) o comportamento «não se aplica» e não entra na soma.
  const comportamento = linha.semaforo || linha.comportamento_pct === null ? "não se aplica (semáforo)" : percentil(linha.comportamento_pct);
  return (
    <p className="popup__linha popup__linha--risco">
      <span className={`degrau degrau--${n} ${linha.estimado ? "degrau--estimado" : ""}`} aria-hidden="true">
        {n}
      </span>
      <span>
        Risco potencial {n} de 5: exposição {percentil(linha.exposicao_pct)}, comportamento {comportamento}, previsão {previsao};{" "}
        {numero(linha.pct_acima_limite_movimentados)} % acima do limite.
      </span>
    </p>
  );
}

/** A linha do separador: Vigiar, Completar, Prever, Proteger ou o mapa de risco potencial. */
function LinhaDoSeparador({
  estado,
  id,
  falha,
  atencao,
  virtual,
}: {
  estado: EstadoDemo;
  id: string;
  falha?: Falha;
  atencao?: ProximoSensor;
  virtual?: SensorVirtual;
}) {
  const previsoes = ok(usePrevisoes().resultado);
  const proteger = ok(usePassadeirasProteger().resultado).find((p) => p.id === id);
  switch (estado.separador) {
    case "vigiar":
      if (falha)
        return (
          <p className="popup__linha">
            Em falha desde {falhaDesde(falha)}: falha {falha.tipo === "rede" ? "de rede" : "de dispositivo"}.
          </p>
        );
      if (atencao)
        return (
          <p className="popup__linha">
            Verificar o sensor: a média diária caiu {numero(100 * (atencao.queda_diaria ?? 0))} % sem perder a comunicação.
          </p>
        );
      return <p className="popup__linha">Sem falha a esta hora.</p>;
    case "completar":
      if (virtual)
        return (
          <p className="popup__linha">
            Erro esperado {numero(virtual.erro_esperado, 2)}
            {virtual.fim_de_semana ? ", ao fim de semana" : ""}.
          </p>
        );
      return <p className="popup__linha">Medido: não precisa de estimativa a esta hora.</p>;
    case "prever": {
      const alvo = estado.hora + HORIZONTE_H * HORA_MS;
      const p = previsoes.find((x) => x.id === id && lerInstante(x.t) === alvo);
      return p ? (
        <p className="popup__linha">
          Previsão para as {rotuloHoras(alvo)}: ≈ {numero(p.previsao)} travessias.
        </p>
      ) : (
        <p className="popup__linha">Sem previsão para as {rotuloHoras(alvo)}.</p>
      );
    }
    case "proteger":
      if (estado.vistaProteger === "risco") return <LinhaDoRisco id={id} hora={estado.hora} />;
      if (!proteger) return <p className="popup__linha">Sem efeito calculado nesta passadeira.</p>;
      return (
        <p className="popup__linha">
          {comSinal(proteger.efeito_kmh, 2)} km/h por +{config.proteger.porTravessias} travessias
          {proteger.assinalada ? " · assinalada" : proteger.semaforo ? " · com semáforo" : ""} · {diasDeDados(proteger.n_intervalos, config.proteger.intervaloMin, ZONA.has(id) ? rotuloSensor(config.zona.rsu) : null)}.
        </p>
      );
  }
}

function GraficoDoSensor({ id, estado, virtuais, falha }: { id: string; estado: EstadoDemo; virtuais: SensorVirtual[]; falha?: Falha }) {
  const intervalos = ok(useIntervalos(id).resultado);
  const previsoes = ok(usePrevisoes().resultado);
  const serie = serieVirtual(virtuais, id);
  const inicioVirtual = serie[0]?.t;
  const reais = travessiasPorHora(intervalos).filter((p) => inicioVirtual === undefined || p.t < inicioVirtual);
  const rotulo = rotuloSensor(id);
  const dominio: [number, number] = [config.periodo.inicio, config.periodo.fim];
  if (estado.separador === "prever") {
    const daPrevisao = previsoes.filter((p) => p.id === id);
    const pontos = daPrevisao.map((p) => ({
      t: lerInstante(p.t),
      estimativa: p.previsao,
      inf: p.previsao,
      sup: p.previsao,
      fimDeSemana: false,
    }));
    const medidos = daPrevisao.filter((p) => p.real !== null).map((p) => ({ t: lerInstante(p.t), valor: p.real as number }));
    if (pontos.length === 0) return null;
    return (
      <GraficoIntervalo
        rotulo={rotulo}
        reais={medidos}
        virtuais={pontos}
        inicioFalha={null}
        hora={estado.hora}
        dominio={dominio}
        serie="previsao"
        compacto
      />
    );
  }
  if (reais.length === 0 && serie.length === 0) return null;
  return (
    <GraficoIntervalo
      rotulo={rotulo}
      reais={reais}
      virtuais={serie}
      inicioFalha={falha ? lerInstante(falha.inicio) : null}
      hora={estado.hora}
      dominio={dominio}
      compacto
    />
  );
}

function PopupPassadeira({ sensor, onFechar }: { sensor: Sensor; onFechar: () => void }) {
  const { estado } = useEstadoDemo();
  const falhas = ok(useFalhas().resultado);
  const virtuais = ok(useSensoresVirtuais().resultado).filter((v) => v.id === sensor.id);
  const proximo = ok(useProximoSensor().resultado);
  const intervalos = ok(useIntervalos(sensor.id).resultado);
  const luz = rotuloLuz(ok(useLuminosidade().resultado), estado.hora);
  const falha = falhaDoPopup(falhas, sensor.id, estado.hora); // com duas falhas nesta hora, a mais recente (ADR-0053)
  const naHora = virtualNaHora(serieVirtual(virtuais, sensor.id), estado.hora);
  const virtual = virtuais.find((v) => lerInstante(v.t) === estado.hora);
  const atencao = emAtencao(proximo, estado.hora, config.verificarDesde).has(sensor.id)
    ? proximo.find((l) => l.id === sensor.id)
    : undefined;
  const saude = estadoDeSaude(estado.separador, { falha: falha?.tipo ?? null, estimado: !!naHora, atencao: !!atencao });
  const medido = travessiasPorHora(intervalos).find((p) => p.t === estado.hora);
  const titulo = `${rotuloSensor(sensor.id)}${sensor.nome ? ` · ${sensor.nome}` : ""}`;
  const sitio = estado.separador === "completar" && estado.proximo ? sitiosDoProximo(proximo).find((l) => l.id === sensor.id) : undefined;
  // Os badges do cabeçalho: «estimado» quando o valor o é e o estado não o diz já, e «às escuras» (ADR-0018).
  const etiquetas = [...(naHora && saude !== "estimado" ? ["estimado"] : []), ...(luz ? [luz] : [])];

  return (
    <>
      <Cabecalho titulo={titulo} tipo="passadeira" especie="passadeira" estado={saude} falha={falha?.tipo} etiquetas={etiquetas} onFechar={onFechar} />
      {sitio ? (
        <LinhasDoProximo local={sitio} posicao={sitio.posicao} />
      ) : (
        <>
          {naHora ? (
            <NumeroGrande
              valor={`≈ ${numero(naHora.estimativa)}`}
              unidade="travessias/h · estimado"
              nota={`80 %: ${numero(naHora.inf)} a ${numero(naHora.sup)}`}
            />
          ) : (
            <NumeroGrande valor={medido ? numero(medido.valor) : "—"} unidade="travessias/h" />
          )}
          <GraficoDoSensor id={sensor.id} estado={estado} virtuais={virtuais} falha={falha} />
          <LinhaDoSeparador estado={estado} id={sensor.id} falha={falha} atencao={atencao} virtual={virtual} />
        </>
      )}
    </>
  );
}

const ORDEM: EstadoSensor[] = ["falha-rede", "falha-dispositivo", "estimado", "atencao", "ativo"];

/** A RSU: os seus sensores juntos por estado («Falha de rede: SC0019–0022, Estac. e 11165»), para caber em 25 palavras. */
function PopupRsu({ rsu, sensores, onFechar }: { rsu: Sensor; sensores: Sensor[]; onFechar: () => void }) {
  const { estado } = useEstadoDemo();
  const falhas = ok(useFalhas().resultado);
  const virtuais = ok(useSensoresVirtuais().resultado);
  const estimados = new Set(virtuais.filter((v) => lerInstante(v.t) === estado.hora).map((v) => v.id));
  const saudeDe = (s: Sensor) =>
    estadoDeSaude(estado.separador, { falha: falhaNaHora(falhas, s.id, estado.hora)?.tipo ?? null, estimado: estimados.has(s.id), atencao: false });
  // A mesma hora do cartão do incidente: o início do grupo de rede, e não a primeira falha que a API devolve.
  const desde = redeDesde(falhas, rsu.id, estado.hora);
  const porEstado = new Map<EstadoSensor, string[]>();
  for (const s of sensoresDaRsu(sensores, rsu.id)) {
    const e = saudeDe(s);
    porEstado.set(e, [...(porEstado.get(e) ?? []), s.id]);
  }
  // Os nomes de cada tipo, com o ícone do tipo antes: «SC0019–0022», os segmentos e «Estac.».
  const nomes = (ids: string[]) => {
    const estac = ids.filter((i) => i === rsu.id);
    const outros = ids.filter((i) => i !== rsu.id);
    const grupos = [
      ...(["passadeira", "zona", "segmento"] as const).map((especie) => ({ especie, texto: rotuloLista(outros.filter((i) => especieDoId(i) === especie)) })),
      { especie: "estacionamento" as const, texto: estac.length ? "Estac." : "" },
    ].filter((g) => g.texto);
    return grupos.map((g, i) => (
      <span key={g.especie} className="popup__grupo">
        <IconeTipo especie={g.especie} />
        {g.texto}
        {i < grupos.length - 1 ? ", " : ""}
      </span>
    ));
  };
  return (
    <>
      <Cabecalho titulo={rotuloSensor(rsu.id)} tipo="RSU" especie="rsu" estado={desde !== null ? "falha-rede" : "ativo"} onFechar={onFechar} />
      <p className="popup__linha">
        {desde !== null ? `Falha de rede desde ${rotuloDia(desde)} ${rotuloHoras(desde, true)}.` : "Sem falha de rede a esta hora."}
      </p>
      {/* Os dados não trazem a posição da RSU: o mapa põe-na na média dos lugares de estacionamento que observa. */}
      <p className="popup__nota">Posição aproximada: a média dos lugares de estacionamento que observa.</p>
      <ul className="popup__sensores" aria-label={`Sensores da ${rotuloSensor(rsu.id)}`}>
        {ORDEM.filter((e) => porEstado.has(e)).map((e) => (
          <li key={e}>
            <EstadoDoSensor estado={e} />
            <span className="popup__nomes">{nomes(porEstado.get(e) ?? [])}</span>
          </li>
        ))}
      </ul>
    </>
  );
}

/** O conteúdo do pop-up (ou da folha, num ecrã estreito). Recebe o foco ao abrir, para se usar pelo teclado. */
export function PopupSensor({ id, onFechar }: { id: string; onFechar: () => void }) {
  const sensores = ok(useSensores().resultado);
  const caixa = useRef<HTMLDivElement>(null);
  const sensor = sensores.find((s) => s.id === id);
  useEffect(() => {
    caixa.current?.focus({ preventScroll: true });
  }, [id]);
  return (
    <div ref={caixa} className="popup" role="dialog" aria-label={`Sensor ${rotuloSensor(id)}`} tabIndex={-1}>
      {!sensor ? (
        <p className="popup__linha">A carregar…</p>
      ) : id.includes("RoadSideUnit") ? (
        <PopupRsu rsu={sensor} sensores={sensores} onFechar={onFechar} />
      ) : (
        <PopupPassadeira sensor={sensor} onFechar={onFechar} />
      )}
    </div>
  );
}
