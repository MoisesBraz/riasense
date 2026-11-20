/**
 * O modo «Ao vivo» (ADR-0049) por cima do mapa:
 * - `EtiquetaAoVivo`: em cima, sempre à vista, de onde vêm os dados e que não estão validados (ponto 6).
 * - `PainelAoVivo`: no lugar da barra da hora, «N de M estações ativas», o último dado de cada estação e o
 *   «Voltar aos dados da semana» (pontos 4 e 5).
 * - `AvisoAoVivo`: depois de sair sozinho, «Ligação perdida» (ou «sem rede»), por cima da semana gravada.
 */
import { useEffect, useRef } from "react";
import { ETIQUETA_AO_VIVO, type EstacaoAoVivo, type LeituraAoVivo, type SensorAoVivo } from "../api/aoVivo";
import { numeroAoVivo, peoesPorExtenso, resumoAoVivo, ultimoDado, veiculosPorExtenso } from "../dominio/aoVivo";
import { rotuloSensor } from "../dominio/formato";
import { nivelDoRisco } from "../dominio/risco";
import { IconeTipo } from "../componentes/Simbolos";
import { numero } from "../dominio/formato";
import { Icone } from "../componentes/Icone";

/** O aviso de saída fica 8 s e sai sozinho (ou com o ✕). */
const AVISO_MS = 8000;

/** No «Ao vivo», na ② e na ③: o chip que diz que o mapa e o painel são da semana gravada, a esta hora (ADR-0055, ponto 4). */
export function EtiquetaSemanaGravada({ texto }: { texto: string }) {
  return (
    <p className="chip-mapa sobreposto etiqueta-semana-gravada" role="note">
      {texto}
    </p>
  );
}

export function EtiquetaAoVivo() {
  return (
    <p className="chip-mapa sobreposto etiqueta-ao-vivo" role="note">
      <span className="etiqueta-ao-vivo__ponto" aria-hidden="true" />
      {ETIQUETA_AO_VIVO}
    </p>
  );
}

/**
 * O pop-up de uma estação do Living Lab no «Ao vivo» (ADR-0055): os números de agora (veículos e peões, já sem as deteções
 * repetidas) e o último dado. É o único sítio onde estão: o marcador fica só com o ícone. Atualiza-se a cada leitura.
 */
export function PopupEstacaoAoVivo({ estacao, recebido, onFechar }: { estacao: EstacaoAoVivo; recebido: number | null; onFechar: () => void }) {
  const caixa = useRef<HTMLDivElement>(null);
  useEffect(() => {
    caixa.current?.focus({ preventScroll: true });
  }, [estacao.id]);
  return (
    <div ref={caixa} className="popup popup--ao-vivo" role="dialog" aria-label={`Estação ${estacao.id} do Living Lab, ao vivo`} tabIndex={-1}>
      <header className="popup__cabecalho">
        <div className="popup__titulo">
          <strong className="popup__nome">Estação {estacao.id}</strong>
          <button type="button" className="botao-icone popup__fechar" onClick={onFechar} aria-label="Fechar o pop-up">
            <Icone nome="fechar" />
          </button>
        </div>
        <div className="popup__meta">
          <span className="popup__tipo">
            <IconeTipo especie="rsu" decorativo />
            RSU do Living Lab
          </span>
          <span className="popup__etiqueta">{estacao.ativa ? "ativa" : "inativa"}</span>
          <span className="popup__etiqueta">ao vivo · não validado</span>
        </div>
      </header>
      {estacao.ativa ? (
        <>
          <p className="popup__linha">
            <strong>{veiculosPorExtenso(estacao.veiculos ?? 0)}</strong> e <strong>{peoesPorExtenso(estacao.peoes ?? 0)}</strong> detetados agora
          </p>
          <p className="popup__linha popup__nota">Último dado: {ultimoDado(estacao, recebido)}</p>
        </>
      ) : (
        <p className="popup__linha popup__nota">Inativa: não envia deteções agora.</p>
      )}
    </div>
  );
}

/** A ressalva do radar (ADR-0039, ponto 4), no segmento e no risco ao vivo. */
export const RESSALVA_RADAR = "o radar e a câmara medem velocidades diferentes: o excesso não é comparável entre sensores";
export const NOTA_ESPERADO = "esperado pelo perfil da semana gravada; não é a previsão da ③";

/**
 * O pop-up de uma passadeira ou de um segmento no «Ao vivo» (ADR-0055, pontos 2, 5 e 6): o agora (os ids distintos na janela
 * móvel, por hora), o esperado pelo perfil da semana daqui a 1 h e a 3 h e, na passadeira, o risco potencial ao vivo; no
 * segmento, a velocidade mediana de agora contra o limite. Tudo «ao vivo · não validado».
 */
export function PopupSensorAoVivo({ id, sensor, onFechar }: { id: string; sensor: SensorAoVivo | null; onFechar: () => void }) {
  const caixa = useRef<HTMLDivElement>(null);
  useEffect(() => {
    caixa.current?.focus({ preventScroll: true });
  }, [id]);
  const passadeira = id.includes("SmartCrosswalk");
  const unidade = passadeira ? "travessias" : "veículos";
  return (
    <div ref={caixa} className="popup popup--ao-vivo" role="dialog" aria-label={`${rotuloSensor(id)}, ao vivo`} tabIndex={-1}>
      <header className="popup__cabecalho">
        <div className="popup__titulo">
          <strong className="popup__nome">{rotuloSensor(id)}</strong>
          <button type="button" className="botao-icone popup__fechar" onClick={onFechar} aria-label="Fechar o pop-up">
            <Icone nome="fechar" />
          </button>
        </div>
        <div className="popup__meta">
          <span className="popup__tipo">
            <IconeTipo especie={passadeira ? "passadeira" : "segmento"} decorativo />
            {passadeira ? "Passadeira" : "Segmento de estrada"}
          </span>
          <span className="popup__etiqueta">ao vivo · não validado</span>
        </div>
      </header>
      {!sensor || sensor.coberto === false ? (
        <p className="popup__linha popup__nota">Sem dados ao vivo deste sensor.</p>
      ) : (
        <>
          <p className="popup__linha">
            {sensor.por_hora === null ? (
              <>
                A contar: <strong>{sensor.n}</strong> {unidade} em {numeroAoVivo(sensor.minutos)} min{" "}
                <span className="popup__nota">(o número por hora aparece aos {numeroAoVivo(sensor.minima_min ?? 2)} min)</span>
              </>
            ) : (
              <>
                Agora: <strong>{numeroAoVivo(sensor.por_hora)}</strong> {unidade} por hora{" "}
                <span className="popup__nota">(últimos {numeroAoVivo(sensor.minutos)} min)</span>
              </>
            )}
          </p>
          {/* «O que conta é a ideia»: compara-se com a semana nos dois tipos, a dizer que é aproximado. */}
          <p className="popup__linha popup__nota">contagem ao vivo aproximada</p>
          {!passadeira && sensor.velocidade_kmh != null && (
            <p className="popup__linha">
              Velocidade mediana agora: <strong>{Math.round(sensor.velocidade_kmh)} km/h</strong>
              {sensor.limite_kmh != null && <> (limite {Math.round(sensor.limite_kmh)})</>}
              {sensor.acima && <strong className="popup__alerta"> · acima do limite</strong>}
            </p>
          )}
          <p className="popup__linha">
            Esperado daqui a 1 h: <strong>{numeroAoVivo(sensor.esperado_1h)}</strong>; daqui a 3 h:{" "}
            <strong>{numeroAoVivo(sensor.esperado_3h)}</strong> {unidade} por hora
          </p>
          <p className="popup__linha popup__nota">{NOTA_ESPERADO}</p>
          {passadeira && sensor.risco && (
            <>
              <p className="popup__linha">
                Risco potencial ao vivo: <strong>{nivelDoRisco(sensor.risco.valor)} de 5</strong>
              </p>
              <p className="popup__linha popup__nota">
                ao vivo · não validado · não mede acidentes ·{" "}
                {sensor.risco.semaforo ? "com semáforo, só a exposição" : "o comportamento é o da semana gravada"}
              </p>
            </>
          )}
          {(passadeira ? sensor.risco : sensor.radar) && <p className="popup__linha popup__nota">{RESSALVA_RADAR}</p>}
        </>
      )}
    </div>
  );
}

export function PainelAoVivo({ leitura, onVoltar }: { leitura: LeituraAoVivo; onVoltar: () => void }) {
  const r = leitura.atual;
  const resumo = r ? resumoAoVivo(r) : null;
  return (
    <section className="painel-ao-vivo sobreposto" aria-label="Ao vivo">
      <div className="painel-ao-vivo__resumo" role="status">
        {resumo ? (
          <>
            <strong>
              {resumo.ativas} de {resumo.total} estações ativas
            </strong>
            <span className="painel-ao-vivo__nota">
              {numero(resumo.peoes)} peões e {numero(resumo.veiculos)} veículos detetados agora
            </span>
          </>
        ) : (
          <strong>A ligar ao Living Lab…</strong>
        )}
      </div>
      {r && (
        <details className="painel-ao-vivo__estacoes">
          <summary>Último dado de cada estação</summary>
          <ul>
            {r.estacoes.map((e) => (
              <li key={e.id} className={e.ativa ? "" : "painel-ao-vivo__inativa"}>
                <span>{e.id}</span>
                <span>{ultimoDado(e, r.recebido)}</span>
              </li>
            ))}
          </ul>
        </details>
      )}
      <button type="button" className="botao botao--secundario" onClick={onVoltar}>
        Voltar aos dados da semana
      </button>
    </section>
  );
}

export function AvisoAoVivo({ texto, onFechar }: { texto: string; onFechar: () => void }) {
  useEffect(() => {
    const id = setTimeout(onFechar, AVISO_MS);
    return () => clearTimeout(id);
  }, [texto, onFechar]);
  return (
    <div className="aviso-ao-vivo sobreposto" role="alert">
      <span>{texto}</span>
      <button type="button" className="botao-icone" aria-label="Fechar o aviso" onClick={onFechar}>
        <Icone nome="fechar" />
      </button>
    </div>
  );
}
