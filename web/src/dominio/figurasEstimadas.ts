/**
 * As figuras da vista 3D no ② Completar e no ③ Prever (ADR-0041, ponto 9).
 * - No ②, os sensores em falha a esta hora andam com a estimativa dos sensores virtuais (as passadeiras com a razão, os
 *   segmentos com a ridge), e os outros com o que mediram, como no ①. O estacionamento não se completa.
 * - No ③, tudo anda com a previsão a t + 3 h, e só onde ela existe (as 48 h do teste).
 * Nada se estima onde a ② e a ③ não têm valor (ADR-0007). As estimadas e as previstas levam a marca `estimado` e ficam
 * translúcidas. Os Parquet só têm o total (de todos os sensores somados): os carros são todos ligeiros, sem anel nem número.
 */
import type { PassagemHora } from "./carros";

/** A velocidade dos carros estimados e previstos: os Parquet não a têm, e o número não se mostra. */
export const KMH_ESTIMADO = 30;

/**
 * Os grupos de carros dos totais estimados ou previstos, todos ligeiros. O número de grupos da zona é o total a dividir por
 * `veiculosPorPonto`, repartido pelos segmentos com os maiores restos (ADR-0041, ponto 2): um segmento com poucos carros não
 * fica vazio só por arredondar, e o total não muda. O empate desfaz-se pelo id.
 */
export function passagensDosTotais(totais: ReadonlyMap<string, number>, veiculosPorPonto: number, kmh = KMH_ESTIMADO): PassagemHora[] {
  const ids = [...totais.keys()].sort();
  const quotas = ids.map((id) => Math.max(0, totais.get(id) ?? 0) / veiculosPorPonto);
  const grupos = quotas.map(Math.floor);
  let falta = Math.round(quotas.reduce((a, q) => a + q, 0)) - grupos.reduce((a, g) => a + g, 0);
  const ordem = ids.map((_, i) => i).sort((a, b) => quotas[b] - grupos[b] - (quotas[a] - grupos[a]) || ids[a].localeCompare(ids[b]));
  for (const i of ordem) {
    if (falta <= 0) break;
    grupos[i]++;
    falta--;
  }
  return ids.map((id, i) => ({
    id,
    veiculos: Math.round(totais.get(id) ?? 0),
    vel_media_ms: null,
    limite_kmh: null,
    grupos: Array.from({ length: grupos[i] }, () => ({ categoria: "B" as const, kmh })),
    estimado: true,
  }));
}

/** O que a cena 3D recebe: as passagens dos segmentos, as travessias das passadeiras e o que fica sem figuras. */
export interface DadosDaCena {
  passagens: PassagemHora[];
  emFalha: ReadonlySet<string>;
  travessias: ReadonlyMap<string, number>;
  passadeirasEmFalha: ReadonlySet<string>;
  /** As passadeiras com figuras estimadas ou previstas (translúcidas). */
  estimadas: ReadonlySet<string>;
  /** Há pelo menos uma figura estimada ou prevista: só então o mapa mostra o selo. */
  comEstimados: boolean;
}

/**
 * Os dados da cena no ② ou no ③, a partir dos medidos (os do ①) e dos valores do separador: no ②, as estimativas desta hora
 * (só as horas em falha); no ③, as previsões para t + 3 h. Só contam os segmentos e as passadeiras que a cena desenha.
 */
export function dadosDaCenaEstimada(
  separador: "completar" | "prever",
  medido: Omit<DadosDaCena, "estimadas" | "comEstimados">,
  valores: ReadonlyMap<string, number>,
  segmentos: ReadonlySet<string>,
  passadeiras: ReadonlySet<string>,
  veiculosPorPonto: number,
): DadosDaCena {
  const segEstimados = new Map([...valores].filter(([id]) => segmentos.has(id)));
  const pasEstimadas = new Map([...valores].filter(([id]) => passadeiras.has(id)));
  const estimadas = new Set(pasEstimadas.keys());
  const doTotal = passagensDosTotais(segEstimados, veiculosPorPonto);
  const comEstimados = doTotal.some((p) => (p.grupos?.length ?? 0) > 0) || [...pasEstimadas.values()].some((v) => v > 0);
  if (separador === "prever") {
    // No ③ não há medidos: sem previsão nesse sítio, não há figuras.
    return { passagens: doTotal, emFalha: new Set(), travessias: pasEstimadas, passadeirasEmFalha: new Set(), estimadas, comEstimados };
  }
  return {
    passagens: [...medido.passagens.filter((p) => !segEstimados.has(p.id)), ...doTotal],
    emFalha: new Set([...medido.emFalha].filter((id) => !segEstimados.has(id))),
    travessias: new Map([...medido.travessias, ...pasEstimadas]),
    passadeirasEmFalha: new Set([...medido.passadeirasEmFalha].filter((id) => !estimadas.has(id))),
    estimadas,
    comEstimados,
  };
}
