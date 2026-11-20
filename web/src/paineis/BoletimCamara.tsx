/**
 * O boletim de segurança pedonal para a Câmara (ADR-0052): uma página para imprimir, que o browser guarda em PDF sem rede.
 * Abre-se a partir da ④ Proteger (`?boletim`). Os números vêm todos de `/proteger/boletim`, que lê os Parquet já calculados
 * (`risco_potencial.parquet`, `proteger_passadeiras.parquet` e, para o radar, `passadeira_segmentos` e `segmentos_hora`); a página
 * só os escreve.
 */
import { useBoletim, useSensores } from "../api/recursos";
import type { Boletim } from "../api/tipos";
import { ComResultado } from "../componentes/Estados";
import { config } from "../config";
import { numero, rotuloSensor } from "../dominio/formato";

/** Os 2 avisos obrigatórios do cabeçalho (ADR-0052, ponto 3), com o texto exato. */
export const AVISOS_BOLETIM = [
  "Risco potencial estimado — não substitui registo oficial de sinistralidade (BEAV)",
  "Semana de dados de 03 a 10/11/2026",
];

export const RESSALVA_RADAR_CAMARA = "O radar e a câmara medem velocidades diferentes: o excesso não é comparável entre sensores.";

/** «a, b e c». */
const juntar = (itens: string[]) => (itens.length < 2 ? itens.join("") : `${itens.slice(0, -1).join(", ")} e ${itens[itens.length - 1]}`);
const POR_EXTENSO: Record<number, string> = { 2: "duas", 3: "três", 4: "quatro" };
/** O intervalo «do menor ao maior das passadeiras, arredondados às unidades» (ADR-0052, ponto 2): «23–24 %». */
const intervalo = ([menor, maior]: [number, number]) =>
  Math.round(menor) === Math.round(maior) ? `${numero(menor)} %` : `${numero(menor)}–${numero(maior)} %`;

function Conteudo({ boletim, nomes }: { boletim: Boletim; nomes: Map<string, string> }) {
  const { top, zona, semaforos } = boletim;
  const nomeDe = (id: string) => (nomes.get(id) ? `${rotuloSensor(id)} · ${nomes.get(id)}` : rotuloSensor(id));
  const zonaRotulo = `${rotuloSensor(zona.passadeiras[0])} a ${rotuloSensor(zona.passadeiras[zona.passadeiras.length - 1])}`;
  const n = zona.passadeiras.length;
  const radarEmTodas = zona.radar.every((g) => g.passadeiras === n);
  const segmentosRadar = juntar(zona.radar.map((g) => rotuloSensor(g.segmento)));
  return (
    <>
      <section className="boletim__seccao" aria-labelledby="boletim-top">
        <h2 id="boletim-top">1. As 3 passadeiras com maior risco potencial na semana</h2>
        <p className="boletim__nota">
          A média do risco potencial (de 0 a 1) de todas as horas da semana, por passadeira; um empate desfaz-se pelo id.
        </p>
        <table className="boletim__tabela">
          <thead>
            <tr>
              <th scope="col">Passadeira</th>
              <th scope="col">Risco potencial médio</th>
              <th scope="col">Semáforo</th>
              <th scope="col">Horas medidas</th>
            </tr>
          </thead>
          <tbody>
            {top.map((p) => (
              <tr key={p.id}>
                <th scope="row">{nomeDe(p.id)}</th>
                <td>{numero(p.risco_medio, 2)}</td>
                <td>{p.semaforo ? "Sim: o risco usa os pesos do ADR-0024" : "Não"}</td>
                <td>
                  {p.horas_medidas} de {p.horas}
                  {p.horas_medidas < p.horas ? ", as outras estimadas" : ""}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>

      <section className="boletim__seccao" aria-labelledby="boletim-zona">
        <h2 id="boletim-zona">2. Veículos acima do limite da via na zona das passadeiras {zonaRotulo}</h2>
        <ul>
          <li>
            <strong>{intervalo(zona.acima_limite_movimentados)}</strong> nos intervalos de {config.proteger.intervaloMin} min com mais
            travessias, e <strong>{intervalo(zona.acima_limite_calmos)}</strong> nos com menos, sobretudo à noite. A comparação não
            desconta a hora.
          </li>
          <li>
            É um valor da zona, e não {POR_EXTENSO[n] ?? n} medidas independentes: as passadeiras partilham segmentos, e um veículo
            conta para todas as do seu segmento. O intervalo vai do menor ao maior valor das {POR_EXTENSO[n] ?? n} passadeiras.
          </li>
          {zona.radar.length > 0 && (
            <li>
              Medido pela câmara e pelo radar (
              {zona.radar.length === 1 ? "o segmento" : "os segmentos"} {segmentosRadar}
              {radarEmTodas ? `, nas ${POR_EXTENSO[n] ?? n} passadeiras` : ""}). {RESSALVA_RADAR_CAMARA}
            </li>
          )}
          <li>Fala-se por passadeira ou por zona, nunca por rua.</li>
        </ul>
      </section>

      <section className="boletim__seccao" aria-labelledby="boletim-semaforos">
        <h2 id="boletim-semaforos">3. Passadeiras com semáforo</h2>
        <p>
          {juntar(semaforos.map(rotuloSensor))}. Ficam fora da anomalia de abrandamento (ADR-0024). Fonte: OpenStreetMap, por validar
          com a Câmara.
        </p>
      </section>
    </>
  );
}

export function BoletimCamara() {
  const boletim = useBoletim();
  const sensores = useSensores();
  const nomes = new Map(
    sensores.resultado.estado === "ok" ? sensores.resultado.dados.filter((s) => s.nome).map((s) => [s.id, s.nome as string]) : [],
  );
  return (
    <main className="boletim">
      <div className="boletim__acoes">
        <button type="button" className="botao botao--primario" onClick={() => window.print()}>
          Imprimir ou guardar em PDF
        </button>
        <a className="botao botao--fantasma" href={window.location.pathname}>
          Voltar à RiaSense
        </a>
      </div>
      <header className="boletim__cabecalho">
        <p className="boletim__marca">RiaSense · Aveiro Living Lab · ④ Proteger</p>
        <h1>Boletim de segurança pedonal para a Câmara</h1>
        <ul className="boletim__avisos" aria-label="Avisos">
          {AVISOS_BOLETIM.map((a) => (
            <li key={a}>{a}</li>
          ))}
        </ul>
      </header>
      <ComResultado resultado={boletim.resultado} recarregar={boletim.recarregar} titulo="Boletim">
        {(dados) => <Conteudo boletim={dados[0]} nomes={nomes} />}
      </ComResultado>
      <footer className="boletim__rodape">
        Gerado pela RiaSense a partir dos resultados já calculados da semana: risco_potencial.parquet e proteger_passadeiras.parquet
        e, para os segmentos do radar, passadeira_segmentos.parquet e segmentos_hora.parquet.
      </footer>
    </main>
  );
}
