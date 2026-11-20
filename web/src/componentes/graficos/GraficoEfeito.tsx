/**
 * Gráfico da ④: efeito na velocidade (km/h por +N travessias) com o IC 95 %, uma linha por passadeira, mais o
 * placebo. É uma tabela, para o leitor de ecrã ler os números; cada linha desenha o seu intervalo num SVG.
 */
import { comSinal, numero } from "../../dominio/formato";
import { useEcraLargo } from "../../estado/useEcraLargo";
import { IconeTipo } from "../Simbolos";

export interface LinhaEfeito {
  id: string;
  rotulo: string;
  efeito: number;
  inf: number;
  sup: number;
  assinalada: boolean;
  /** Com semáforo (ADR-0024): o efeito mostra-se, mas não se mede da mesma forma e não se assinala. */
  semaforo?: boolean;
  placebo?: boolean;
}

const W = 200;
const H = 16;

function dominioDoEfeito(linhas: LinhaEfeito[]): [number, number] {
  const min = Math.min(0, ...linhas.map((l) => l.inf));
  const max = Math.max(0, ...linhas.map((l) => l.sup));
  const folga = (max - min) * 0.05;
  return [Math.floor((min - folga) * 2) / 2, Math.ceil((max + folga) * 2) / 2];
}

/** Com `onEscolher`, o nome de cada passadeira (não o placebo) abre o pop-up no mapa (ADR-0033, ponto 4). */
export function GraficoEfeito({ linhas, unidade, onEscolher }: { linhas: LinhaEfeito[]; unidade: string; onEscolher?: (id: string) => void }) {
  const [a, b] = dominioDoEfeito(linhas);
  const x = (v: number) => ((v - a) / (b - a)) * W;
  // Marcas de 0,5 em 0,5 km/h (de 1 em 1 se o eixo for largo), sempre com o zero; num ecrã estreito, de metade em metade
  // (a coluna dos nomes ganhou o ícone do tipo, e o eixo ficava com os valores colados).
  const largo = useEcraLargo();
  const passo = ((b - a) / 0.5 <= 6 ? 0.5 : 1) * (largo ? 1 : 2);
  const marcas: number[] = [];
  for (let v = Math.ceil(a / passo) * passo; v <= b + 1e-9; v += passo) marcas.push(Number(v.toFixed(2)));
  return (
    <table className="grafico-efeito">
      <caption className="visualmente-oculto">Efeito na velocidade ({unidade}) com intervalo de confiança de 95 %</caption>
      <thead className="visualmente-oculto">
        <tr>
          <th scope="col">Passadeira</th>
          <th scope="col">Intervalo</th>
          <th scope="col">Efeito</th>
          <th scope="col">Assinalada</th>
        </tr>
      </thead>
      <tbody>
        {linhas.map((l) => (
          <tr key={l.id + (l.placebo ? "-placebo" : "")} className={l.assinalada ? "grafico-efeito--assinalada" : l.placebo ? "grafico-efeito--placebo" : ""}>
            <th scope="row">
              {/* O cabeçalho da coluna já diz «Passadeira»: o ícone é decorativo. O placebo não é um sensor: fica sem ícone. */}
              <span className="grafico-efeito__nome">
                {!l.placebo && <IconeTipo id={l.id} decorativo />}
                {onEscolher && !l.placebo ? (
                  <button type="button" className="linha-tempo__rotulo--botao" onClick={() => onEscolher(l.id)}>
                    {l.rotulo}
                  </button>
                ) : (
                  l.rotulo
                )}
              </span>
            </th>
            <td>
              <svg viewBox={`0 0 ${W} ${H}`} aria-hidden="true">
                <line className="grafico-efeito__zero" x1={x(0)} x2={x(0)} y1={0} y2={H} />
                <line className="grafico-efeito__ic" x1={x(l.inf)} x2={x(l.sup)} y1={H / 2} y2={H / 2} />
                <line className="grafico-efeito__ic" x1={x(l.inf)} x2={x(l.inf)} y1={H / 2 - 4} y2={H / 2 + 4} />
                <line className="grafico-efeito__ic" x1={x(l.sup)} x2={x(l.sup)} y1={H / 2 - 4} y2={H / 2 + 4} />
                <circle className="grafico-efeito__ponto" cx={x(l.efeito)} cy={H / 2} r={3.5} />
              </svg>
              <span className="visualmente-oculto">
                IC 95 % de {numero(l.inf, 2)} a {numero(l.sup, 2)}
              </span>
            </td>
            <td className="grafico-efeito__valor">{comSinal(l.efeito, 2)}</td>
            <td className="grafico-efeito__marca">
              {l.assinalada ? (
                <span className="marcador marcador--assinalada" role="img" aria-label="assinalada">
                  !
                </span>
              ) : l.semaforo ? (
                <span className="nota" title="Com semáforo: o abrandamento não se mede da mesma forma">
                  semáforo
                </span>
              ) : null}
            </td>
          </tr>
        ))}
      </tbody>
      <tfoot aria-hidden="true">
        <tr>
          <td />
          <td className="grafico-efeito__eixo">
            {marcas.map((v) => (
              <span key={v} style={{ left: `${(x(v) / W) * 100}%` }}>
                {v === 0 ? "0" : comSinal(v, 1)}
              </span>
            ))}
          </td>
          <td />
          <td />
        </tr>
      </tfoot>
    </table>
  );
}
