/**
 * Gráfico da ②: travessias medidas (linha contínua), o sensor virtual (tracejado, «estimado») e o intervalo de
 * 80 % (faixa), com o fim de semana sombreado, o início da falha e a hora do cursor. SVG próprio: são 4 formas
 * e não justificam uma biblioteca de gráficos.
 */
import { useId } from "react";
import type { PontoReal, PontoVirtual } from "../../dominio/completar";
import { numero } from "../../dominio/formato";
import { HORA_MS, diasDoPeriodo, rotuloDia, rotuloHora } from "../../dominio/tempo";

const L = 26;
const R = 4;
const T = 8;
const B = 22;
const W = 360;
const H = 150;
const AREA_H = H - T - B;

/** Máximo «redondo» do eixo, para as 3 marcas (0, metade, máximo) serem números legíveis. */
export function maximoDoEixo(valor: number): number {
  if (valor <= 0) return 10;
  const potencia = 10 ** Math.floor(Math.log10(valor));
  const passo = [1, 2, 2.5, 4, 5, 10].find((p) => p * potencia >= valor) ?? 10;
  return passo * potencia;
}

function corridasDeFimDeSemana(pts: PontoVirtual[]): [number, number][] {
  const corridas: [number, number][] = [];
  for (const p of pts) {
    if (!p.fimDeSemana) continue;
    const ultima = corridas[corridas.length - 1];
    if (ultima && p.t - ultima[1] <= HORA_MS) ultima[1] = p.t;
    else corridas.push([p.t, p.t]);
  }
  return corridas;
}

export interface PropsGraficoIntervalo {
  rotulo: string;
  reais: PontoReal[];
  virtuais: PontoVirtual[];
  inicioFalha: number | null;
  hora: number;
  dominio: [number, number];
  /** «virtual» (estimado, tracejado vermelho) ou «previsao» (a ③, tracejado neutro e sem intervalo). */
  serie?: "virtual" | "previsao";
  /** Versão do pop-up: mais baixa e sem o rótulo do fim de semana. */
  compacto?: boolean;
}

export function GraficoIntervalo({ rotulo, reais, virtuais, inicioFalha, hora, dominio, serie = "virtual", compacto = false }: PropsGraficoIntervalo) {
  const previsao = serie === "previsao";
  const id = useId();
  const [d0, d1] = dominio;
  // O eixo segue a série (medida e estimada), não o topo do intervalo: alguns limites superiores são várias vezes
  // a estimativa e esmagariam a curva. A faixa corta-se no topo do gráfico (clipPath) e a descrição dá os números.
  const yMax = maximoDoEixo(Math.max(0, ...reais.map((p) => p.valor), ...virtuais.map((p) => p.estimativa)) * 1.1);
  const x = (t: number) => L + ((t - d0) / (d1 - d0)) * (W - L - R);
  const y = (v: number) => T + AREA_H - (v / yMax) * AREA_H;
  const linha = (pts: [number, number][]) => pts.map(([t, v], i) => `${i ? "L" : "M"}${x(t).toFixed(1)},${y(v).toFixed(1)}`).join("");
  const faixa = virtuais.length && !previsao
    ? `${linha(virtuais.map((p) => [p.t, p.sup]))}${[...virtuais].reverse().map((p) => `L${x(p.t).toFixed(1)},${y(p.inf).toFixed(1)}`).join("")}Z`
    : "";
  const naHora = virtuais.find((p) => p.t === hora);
  const realNaHora = reais.find((p) => p.t === hora);
  const descricao = naHora && previsao
    ? `Às ${rotuloHora(hora)}: previsão ≈ ${numero(naHora.estimativa)} travessias.`
    : naHora
    ? `Às ${rotuloHora(hora)}: estimado ≈ ${numero(naHora.estimativa)} travessias, intervalo de 80 % de ${numero(naHora.inf)} a ${numero(naHora.sup)}.`
    : realNaHora
      ? `Às ${rotuloHora(hora)}: ${numero(realNaHora.valor)} travessias medidas.`
      : `Sem valor às ${rotuloHora(hora)}.`;

  return (
    <svg className={`grafico grafico-intervalo ${compacto ? "grafico--compacto" : ""}`} viewBox={`0 0 ${W} ${H}`} role="img" aria-labelledby={`${id}-titulo`} aria-describedby={`${id}-desc`}>
      <title id={`${id}-titulo`}>
        {previsao
          ? `${rotulo} · travessias por hora: ${reais.length} h medidas e ${virtuais.length} h previstas`
          : `${rotulo} · travessias por hora: ${reais.length} h medidas e ${virtuais.length} h estimadas`}
      </title>
      <desc id={`${id}-desc`}>{descricao}</desc>
      {corridasDeFimDeSemana(virtuais).map(([a, b], i) => (
        <g key={a} data-serie="fim-de-semana">
          <rect className="grafico__fim-de-semana" x={x(a)} y={T} width={Math.max(x(b + HORA_MS) - x(a), 1)} height={AREA_H} />
          {i === 0 && !compacto && (
            <text className="grafico__texto" x={x(a) + 4} y={T + 11}>
              fim de semana
            </text>
          )}
        </g>
      ))}
      {[0, yMax / 2, yMax].map((v) => (
        <g key={v}>
          <line className="grafico__grelha" x1={L} x2={W - R} y1={y(v)} y2={y(v)} />
          <text className="grafico__texto" x={0} y={y(v) + 4}>
            {numero(v)}
          </text>
        </g>
      ))}
      <clipPath id={`${id}-area`}>
        <rect x={L} y={T} width={W - L - R} height={AREA_H} />
      </clipPath>
      {faixa && <path className="grafico__intervalo" d={faixa} clipPath={`url(#${id}-area)`} data-serie="intervalo" />}
      {reais.length > 0 && <path className="grafico__real" d={linha(reais.map((p) => [p.t, p.valor]))} data-serie="real" />}
      {virtuais.length > 0 && (
        <path
          className={previsao ? "grafico__previsao" : "grafico__virtual"}
          d={linha(virtuais.map((p) => [p.t, p.estimativa]))}
          strokeDasharray="4 3"
          data-serie={serie}
        />
      )}
      {inicioFalha !== null && <line className="grafico__falha" x1={x(inicioFalha)} x2={x(inicioFalha)} y1={T} y2={T + AREA_H} data-serie="falha" />}
      {hora >= d0 && hora <= d1 && <line className="grafico__cursor" x1={x(hora)} x2={x(hora)} y1={T} y2={T + AREA_H} data-serie="cursor" />}
      {diasDoPeriodo(d0, d1)
        .filter((_, i) => i % 2 === 0)
        .map((d) => (
          <text key={d} className="grafico__texto" x={x(d)} y={H - 6} textAnchor="middle">
            {rotuloDia(d)}
          </text>
        ))}
    </svg>
  );
}
