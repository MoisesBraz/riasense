/**
 * Cursor de tempo partilhado pelos 4 separadores. A faixa cobre o período dos dados (config: periodo_dados)
 * e marca a falha de rede da RSU da zona, vinda de `/vigiar/falhas`. É um `input range` nativo:
 * funciona com teclado (setas = 1 h) e leitor de ecrã.
 *
 * «▶ Reproduzir» (ADR-0029) avança a hora sozinha, 1 hora de dados por segundo: a demo mostra «ao vivo» a RSU a
 * cair, sem dados em tempo real. São os dados de 3 a 10/11, acelerados.
 */
import { useEffect, useState } from "react";
import { useFalhas, useLuminosidade } from "../api/recursos";
import { config } from "../config";
import { rotuloSensor, urn } from "../dominio/formato";
import { ICONE_DA_LUZ, luzDaHora, NOME_DA_LUZ, rotuloLuz } from "../dominio/luminosidade";
import { diasDoPeriodo, horasEntre, rotuloDia, rotuloHora, rotuloHoras } from "../dominio/tempo";
import { incidenteDeRede, pulsoDasFalhas, type InicioDeFalhas } from "../dominio/vigiar";
import { useEstadoDemo } from "../estado/estado";
import { useAlturaCss } from "../estado/useAlturaCss";
import { Icone } from "./Icone";

const HORA_MS = 3_600_000;
/** Quanto tempo real dura 1 hora de dados na reprodução (ADR-0029). */
export const PASSO_REPRODUCAO_MS = 1000;

export function BarraHora() {
  const { estado, despachar } = useEstadoDemo();
  const { resultado } = useFalhas();
  const luminosidade = useLuminosidade();
  // Contexto (ADR-0018): de noite, o cursor diz «às escuras»; não muda o risco potencial. O ícone de sol, de crepúsculo ou de
  // lua diz a mesma coisa que o fundo do mapa (ADR-0040).
  const dadosLuz = luminosidade.resultado.estado === "ok" ? luminosidade.resultado.dados : null;
  const classeDaLuz = dadosLuz ? luzDaHora(dadosLuz, estado.hora) : undefined;
  const luz = dadosLuz ? rotuloLuz(dadosLuz, estado.hora) : null;
  const horas = horasEntre(config.periodo.inicio, config.periodo.fim);
  const inicio = horas[0];
  const fim = horas[horas.length - 1];
  const pct = (t: number) => `${(((t - inicio) / (fim - inicio)) * 100).toFixed(3)}%`;
  const incidente = resultado.estado === "ok" ? incidenteDeRede(resultado.dados, urn(config.zona.rsu)) : null;
  // A falha pinta-se só até ao cursor (ADR-0033, ponto 1: não se antecipa o que ainda não aconteceu): até ao fim da hora que o
  // cursor mostra, a mesma que o mapa mostra em falha. Antes das 20h06, o trilho fica todo neutro.
  const falhaAte = incidente ? Math.min(incidente.fim, fim, estado.hora + HORA_MS) : null;
  const indice = Math.max(0, horas.indexOf(estado.hora));
  // O «batimento» (ADR-0057): só no ① Vigiar, uma linha plana com um batimento (como num eletrocardiograma) em cada hora em
  // que começam falhas, mais alto quanto mais sensores; vermelho com um círculo se há falha de rede, a cor do dispositivo com um
  // quadrado se não (ADR-0033, ponto 1). Como a falha da RSU, só até à hora do cursor.
  const comPulso = estado.separador === "vigiar";
  const pulso = comPulso && resultado.estado === "ok" ? pulsoDasFalhas(resultado.dados, horas) : null;
  const pontosPulso = pulso ? pulso.inicios.filter((g) => g.instante < estado.hora + HORA_MS) : [];
  const batimentos = desenharBatimentos(pontosPulso, (t) => ((t - inicio) / (fim - inicio)) * 1000, ((Math.min(fim, estado.hora + HORA_MS) - inicio) / (fim - inicio)) * 1000);
  const [aReproduzir, setAReproduzir] = useState(false);

  // Um passo de cada vez: cada mudança de hora agenda a seguinte. Mexer no cursor à mão não pára a reprodução.
  useEffect(() => {
    if (!aReproduzir) return;
    if (estado.hora + HORA_MS > fim) {
      setAReproduzir(false);
      return;
    }
    const id = setTimeout(() => despachar({ tipo: "hora", hora: estado.hora + HORA_MS }), PASSO_REPRODUCAO_MS);
    return () => clearTimeout(id);
  }, [aReproduzir, estado.hora, fim, despachar]);

  function alternar() {
    if (!aReproduzir && estado.hora + HORA_MS > fim) despachar({ tipo: "hora", hora: inicio });
    setAReproduzir(!aReproduzir);
  }

  // A altura da barra (89 a 169 px no telemóvel) fica numa variável CSS: a folha do detalhe abre por cima dela.
  const barra = useAlturaCss<HTMLDivElement>("--altura-barra-hora");
  // No ecrã largo a barra fica por cima do fundo do mapa: com `data-tapa-mapa`, o centrar do mapa desconta-a.
  return (
    <div className={comPulso ? "barra-hora barra-hora--pulso" : "barra-hora"} ref={barra} data-tapa-mapa="">
      <button
        type="button"
        className="botao botao--secundario barra-hora__reproduzir"
        title="Reprodução da semana de 3 a 10/11, 1 hora por segundo"
        onClick={alternar}
      >
        {/* Um só mecanismo de alternar: o texto muda (sem aria-pressed), e os símbolos não se leem. */}
        <span aria-hidden="true">{aReproduzir ? "❚❚" : "▶"}</span> {aReproduzir ? "Pausar" : "Reproduzir"}
      </button>
      <label className="barra-hora__rotulo" htmlFor="cursor-hora">
        <span>Hora</span>
        <strong>{rotuloHora(estado.hora)}</strong>
        {classeDaLuz && (
          <span className={`barra-hora__luz barra-hora__luz--${classeDaLuz}`}>
            <Icone nome={ICONE_DA_LUZ[classeDaLuz]} tamanho={16} />
            {luz ?? <span className="so-leitor">{NOME_DA_LUZ[classeDaLuz]}</span>}
          </span>
        )}
        {/* ADR-0029, ponto 3: à vista enquanto corre, e nunca «tempo real». */}
        {aReproduzir && (
          <span className="barra-hora__reproducao">
            reprodução da semana de {rotuloDia(config.periodo.inicio)} a {rotuloDia(config.periodo.fim)}
          </span>
        )}
      </label>
      <div className="barra-hora__faixa">
        {/* A escala tem o recuo de meio cursor de cada lado, para a falha e os dias alinharem com o centro do cursor. */}
        <div className="barra-hora__escala" aria-hidden="true">
          <span className="barra-hora__trilho" />
          {incidente && falhaAte !== null && falhaAte > incidente.primeiroInicio && (
            <span
              className="barra-hora__falha"
              style={{ left: pct(incidente.primeiroInicio), width: `calc(${pct(falhaAte)} - ${pct(incidente.primeiroInicio)})` }}
            />
          )}
          {pulso && (
            <svg className="barra-hora__pulso" viewBox="0 0 1000 16" preserveAspectRatio="none">
              <polyline points={batimentos.linha} />
              {batimentos.rede.map((pts) => (
                <polyline key={pts} className="barra-hora__pulso-rede" points={pts} />
              ))}
              {batimentos.dispositivo.map((pts) => (
                <polyline key={pts} className="barra-hora__pulso-dispositivo" points={pts} />
              ))}
            </svg>
          )}
          <ol className="barra-hora__dias">
            {diasDoPeriodo(inicio, fim).map((d) => (
              <li key={d} style={{ left: pct(d) }}>
                {rotuloDia(d).slice(0, 2)}
              </li>
            ))}
          </ol>
        </div>
        {/* Os pontos ficam fora da escala (que é aria-hidden), por serem botões: o clique leva o cursor a essa hora. */}
        {pulso && (
          <div className="barra-hora__pontos">
            {pontosPulso.map((g) => {
              const texto = textoDoPonto(g);
              return (
                <button
                  key={g.hora}
                  type="button"
                  tabIndex={-1}
                  className={`barra-hora__ponto ${g.rede ? "barra-hora__ponto--rede" : "barra-hora__ponto--dispositivo"}`}
                  style={{ left: pct(g.instante), ["--pico" as string]: `${batimentos.alto.get(g.hora) ?? 0}px` }}
                  title={texto}
                  aria-label={`${texto}. Levar o cursor a esta hora.`}
                  onClick={() => despachar({ tipo: "hora", hora: g.hora })}
                />
              );
            })}
          </div>
        )}
        <input
          id="cursor-hora"
          className="barra-hora__cursor"
          type="range"
          min={0}
          max={horas.length - 1}
          step={1}
          value={indice}
          aria-valuetext={luz ? `${rotuloHora(estado.hora)}, ${luz}` : rotuloHora(estado.hora)}
          onChange={(e) => despachar({ tipo: "hora", hora: horas[Number(e.target.value)] })}
        />
      </div>
    </div>
  );
}

/**
 * A forma de cada batimento (unidades da faixa: 1000 de largura, 16 de altura, base a meio, a 8): onda P, o pico e onda T.
 * O pico da falha de rede sobe e o da falha de dispositivo desce: o tipo lê-se pela
 * forma e pela cor, nunca só pela cor (ADR-0033, ponto 1).
 */
const ONDA_P: [number, number][] = [[-14, 0], [-11, -1.2], [-8, 0]];
const PICO = (alto: number, desce: boolean): [number, number][] =>
  (desce ? [[-4, 0], [-2, -1.5], [0, alto], [2, -2], [4, 0]] : [[-4, 0], [-2, 1.5], [0, -alto], [2, 2], [4, 0]]) as [number, number][];
const ONDA_T: [number, number][] = [[8, 0], [12, -1.6], [16, 0]];
const BASE = 8;

/**
 * A linha da faixa (até ao cursor), os batimentos de rede e os de dispositivo à parte, para se pintarem com a cor de cada tipo,
 * e a altura de cada pico (em px: a faixa tem 16 px para 16 unidades).
 */
function desenharBatimentos(
  grupos: InicioDeFalhas[],
  x: (t: number) => number,
  ate: number,
): { linha: string; rede: string[]; dispositivo: string[]; alto: Map<number, number> } {
  const maxSensores = Math.max(1, ...grupos.map((g) => g.sensores.length));
  const pts: string[] = [`0,${BASE}`];
  const rede: string[] = [];
  const dispositivo: string[] = [];
  const altos = new Map<number, number>();
  let ultimo = 0;
  grupos.forEach((g, i) => {
    // Batimentos encostados (às 19h32 e às 20h06 de 04/11 há 34 min entre eles): o segundo desloca-se o que for preciso, sem perder o pico.
    const cx = Math.max(x(g.instante), ultimo + 4);
    const alto = 2.5 + 5.5 * Math.sqrt(g.sensores.length / maxSensores);
    const seguinte = grupos[i + 1] ? x(grupos[i + 1].instante) : Infinity;
    // As ondas P e T só cabem quando o batimento vizinho está longe; o pico desenha-se sempre.
    const forma = [...(cx - ultimo > 18 ? ONDA_P : []), ...PICO(alto, !g.rede), ...(seguinte - cx > 34 ? ONDA_T : [])];
    const desta = forma.map(([dx, dy]) => [cx + dx, BASE + dy]).filter(([px]) => px > ultimo).map(([px, py]) => `${px.toFixed(1)},${py.toFixed(1)}`);
    pts.push(...desta);
    (g.rede ? rede : dispositivo).push(desta.join(" "));
    altos.set(g.hora, alto);
    ultimo = cx + forma[forma.length - 1][0];
  });
  pts.push(`${Math.max(ate, ultimo).toFixed(1)},${BASE}`);
  return { linha: pts.join(" "), rede, dispositivo, alto: altos };
}

/** A dica de um batimento: «04/11 20h06 · 9 sensores em falha (rede, RSU0030)». */
function textoDoPonto(g: InicioDeFalhas): string {
  const quando = `${rotuloDia(g.instante)} ${rotuloHoras(g.instante, true)}`;
  const quem = g.sensores.length === 1 ? `${rotuloSensor(g.sensores[0])} em falha` : `${g.sensores.length} sensores em falha`;
  const porque = g.rede ? `rede${g.rsus.length ? `, ${g.rsus.map(rotuloSensor).join(", ")}` : ""}` : "dispositivo";
  return `${quando} · ${quem} (${porque})`;
}
