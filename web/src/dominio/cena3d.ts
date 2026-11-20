/**
 * A vista 3D sem atropelamentos (ADR-0043, 3.ª saída): os peões esperam por uma aberta no trânsito; se ela não vier ao fim de
 * `PEDIR_S`, pedem passagem, e os carros travam antes da passadeira e esperam. Os carros andam à velocidade medida do grupo
 * (ADR-0039) sempre que nada os trava, arrancam e travam como carros, e não passam pelo carro da frente. O número e o anel de
 * excesso (a velocidade medida do grupo) só aparecem enquanto o carro anda a essa velocidade.
 *
 * Os grupos, o tipo, a velocidade e as quantidades são os medidos. A espera, o pedido e a paragem são só a animação, e a legenda
 * di-lo: os dados não medem a interação entre um peão e um carro (ADR-0006). Guarda estado; em cada hora nova começa outra vez.
 */
import { pontoNaLinha, rumoNaLinha, type OpcoesCarros, type PassagemHora, type SegmentoCarros, type Veiculo3D } from "./carros";
import { duracaoDaTravessia, figurasDaPassadeira, PASSO_MS, type OpcoesPessoas, type Passadeira3D, type Pessoa3D } from "./peoes";
import { deslocar, desvioNoSegmento, type Deslocamentos } from "./avenida";
import type { Corte } from "./transito3d";

/**
 * A espera mínima no passeio, e quanto tempo depois dela os peões esperam por uma aberta antes de pedirem passagem (s). Medido com
 * os dados de 05/11 (as acelerações do config): às 17h, cada figura anda cerca de 26 s em cada 180 s e os carros ficam sem a
 * velocidade do grupo (parados, a travar ou a arrancar) em 23 % do tempo; às 03h, 59 s e 3 %.
 */
export const ESPERA_MIN_S = 10;
export const PEDIR_S = 5;
/** A distância mínima ao carro da frente, de traseira a traseira (m). */
const DISTANCIA_M = 7;
/** O centro do carro para a esta distância antes da borda da passadeira (m): meio ligeiro e um pouco de folga. */
const ANTES_M = 3;
/** A zona de uma passadeira, para os peões verem se há carros, vai além da borda (m). */
const FOLGA_ZONA_M = 3;
/** Arranque e travagem de um ligeiro (m/s²), à escala do tempo da animação (× aceleração²). */
const ARRANQUE_MS2 = 2.5;
const TRAVAGEM_MS2 = 5;
/** Abaixo desta fração da velocidade do grupo, o carro não mostra o número nem o anel. */
const FRACAO_A_ANDAR = 0.9;
/** Nos últimos metros de cada ponta do segmento, o carro encolhe até desaparecer (m). */
const PONTAS_M = 6;
/** Ultrapassar: a que distância do da frente se desvia (m), quanto (m) e a que velocidade lateral (m/s, × aceleração). */
const ULTRAPASSAR_PERTO_M = 15;
/** Dois carros estão na mesma faixa se o desvio lateral diferir menos do que isto (m); o comprimento de um carro com folga (m). */
const MESMA_FAIXA_M = 1.8;
const COMPRIMENTO_M = 6.5;
/** Segue o da frente na mesma faixa a partir desta distância a mais do que a mínima (m). */
const FOLGA_SEGUIR_M = 4;
/** Fora do corredor da avenida, o centro de cada sentido fica este tanto à direita do eixo (m, negativo é à direita); as 2 faixas
 * ficam a ±1,25 m desse centro, sem invadir o sentido contrário. */
const DIREITA_M = -2.5;
const ULTRAPASSAR_M = 2.5;
const LATERAL_MS = 1.5;
/** A fila de espera visível por passadeira: no máximo 4 carros, contados até esta distância da linha (m). */
export const FILA_MAX = 4;
const FILA_ALCANCE_M = 80;
/** A que ritmo um carro desvanece ou volta (por segundo). */
const VIS_POR_S = 2;
/** O maior passo de tempo de um fotograma (s). */
const DT_MAX = 0.1;
/** Margem para dentro do polígono da passadeira (m), e distância entre figuras na fila (m), como em `peoes.ts`. */
const MARGEM_M = 0.5;
const ATRAS_M = 0.6;

type Fase = "espera" | "pedido" | "travessia";

interface Carro {
  categoria: Veiculo3D["categoria"];
  /** Um grupo estimado ou previsto (ADR-0041, ponto 9): sem número nem anel, e translúcido. */
  estimado: boolean;
  kmh: number;
  acima: boolean;
  variante: number;
  ms: number;
  v: number;
  d: number;
  /** Fora da capacidade do segmento (mais grupos do que cabem em 2 faixas): não se desenha nem conta para os outros. */
  excedente: boolean;
  /** O desvio lateral da ultrapassagem neste momento (m, + à esquerda). */
  lat: number;
  /** Quanto se vê (0 a 1): na fila de espera, depois do 4.º carro, desvanece. */
  vis: number;
}

export interface Cena3D {
  veiculos: Veiculo3D[];
  pessoas: Pessoa3D[];
}

export function criarCena(
  segmentos: SegmentoCarros[],
  passagens: PassagemHora[],
  emFalha: ReadonlySet<string>,
  passadeiras: Passadeira3D[],
  travessias: ReadonlyMap<string, number>,
  passadeirasEmFalha: ReadonlySet<string>,
  cortes: ReadonlyMap<string, Corte[]>,
  oc: OpcoesCarros,
  op: OpcoesPessoas,
  /** O desvio para o centro do sentido (ADR-0044): o eixo dos segmentos corre junto a uma berma. Sem ele, os carros andam no eixo. */
  desl?: Deslocamentos,
  tempos: { espera: number; pedir: number } = { espera: ESPERA_MIN_S, pedir: PEDIR_S },
  /** As passadeiras cujas figuras são estimadas (②) ou previstas (③): ficam translúcidas (ADR-0041, ponto 9). */
  estimadas: ReadonlySet<string> = new Set(),
): (segundos: number) => Cena3D {
  // Os carros de cada segmento, igualmente espaçados, à velocidade do grupo.
  const porId = new Map(passagens.map((p) => [p.id, p]));
  const vias: { s: SegmentoCarros; carros: Carro[]; cortes: Corte[] }[] = [];
  let total = 0;
  for (const s of segmentos) {
    const p = porId.get(s.id);
    const grupos = p?.grupos ?? [];
    if (!p || emFalha.has(s.id) || grupos.length === 0 || total >= oc.pontosMax) continue;
    const k = grupos.length;
    const carros = grupos.slice(0, oc.pontosMax - total).map((g, i) => {
      const kmh = Math.round(g.kmh);
      const acima = p.limite_kmh !== null && p.limite_kmh !== undefined && kmh > Math.round(p.limite_kmh);
      const ms = (g.kmh / 3.6) * oc.aceleracao;
      // Cabem em 2 faixas, à distância de um carro: os que não cabem ficam fora (ADR-0043, (d)). Partem alternados pelas faixas.
      const cabem = Math.max(1, Math.floor((2 * s.comprimento) / COMPRIMENTO_M));
      const naFila = Math.min(k, cabem);
      const excedente = i >= cabem;
      const lat = i % 2 === 0 ? 0 : ULTRAPASSAR_M;
      return { categoria: g.categoria, estimado: p.estimado === true, kmh, acima, variante: i % 2, ms, v: ms, d: ((Math.floor(i / 2) * 2) / naFila) * s.comprimento, lat, vis: excedente ? 0 : 1, excedente };
    });
    total += carros.length;
    // Os excedentes não entram na cena: um troço curto com 13 grupos em 40 m sobrepunha-os todos.
    vias.push({ s, carros: carros.filter((c) => !c.excedente), cortes: cortes.get(s.id) ?? [] });
  }
  // As passadeiras com figuras, e o estado de cada uma. As esperas começam desencontradas.
  const ativas = passadeiras
    .filter((p) => !passadeirasEmFalha.has(p.id))
    .map((p) => ({ p, n: figurasDaPassadeira(travessias.get(p.id) ?? 0, op), duracao: duracaoDaTravessia(p, op) }))
    .filter((x) => x.n > 0);
  const estado = new Map(ativas.map(({ p }) => [p.id, { fase: "espera" as Fase, desde: -p.fase * tempos.espera, sentido: (p.fase < 0.5 ? 1 : -1) as 1 | -1 }]));
  // Uma passadeira fechada aos carros: com o pedido feito ou com figuras a atravessar.
  const fechada = (id: string) => {
    const f = estado.get(id)?.fase;
    return f === "pedido" || f === "travessia";
  };
  const arranque = ARRANQUE_MS2 * oc.aceleracao ** 2;
  const travagem = TRAVAGEM_MS2 * oc.aceleracao ** 2;

  let anterior: number | null = null;
  let ultima: Cena3D = { veiculos: [], pessoas: [] };
  return (segundos: number) => {
    if (segundos === anterior) return ultima; // os veículos e as pessoas pedem-se no mesmo fotograma
    const dt = anterior === null ? 0 : Math.max(0, Math.min(DT_MAX, segundos - anterior));
    anterior = segundos;

    // 1. Os carros andam (com as passadeiras fechadas do fotograma anterior). Por passadeira, regista-se se há um carro na zona
    //    e quanto tempo falta até o próximo lá chegar.
    const naZona = new Set<string>();
    const chegada = new Map<string, number>();
    const veiculos: Veiculo3D[] = [];
    for (const { s, carros, cortes: cs } of vias) {
      const L = s.comprimento;
      const n = carros.length;
      const distancia = DISTANCIA_M;
      const zonas = cs.flatMap((c) => {
        const z = { id: c.id, ini: c.d - c.meia - ANTES_M, fim: c.d + c.meia + 0.5, fechada: fechada(c.id), comPeoes: estado.get(c.id)?.fase === "travessia" };
        return [z, { ...z, ini: z.ini + L, fim: z.fim + L }];
      });
      const ordem = [...carros].sort((a, b) => b.d - a.d);
      ordem.forEach((c) => {
        let limite = Infinity;
        // Uma passadeira fechada à frente: para antes dela, se ainda conseguir travar a tempo. Se já não consegue, segue (como
        // um condutor real), e os peões esperam que ele passe (ver `livre`, mais abaixo).
        // Com peões já a atravessar, para sempre.
        for (const z of zonas)
          if (z.fechada && c.d <= z.ini && (z.comPeoes || (c.v * c.v) / (2 * travagem) <= z.ini - c.d + 0.5)) limite = Math.min(limite, z.ini);
        // O carro da frente NA MESMA FAIXA: nunca se passa através dele. Se for mais lento, este muda de faixa (abaixo) quando a
        // outra estiver livre; até lá, segue atrás dele. Sem isto, os carros atravessavam-se uns aos outros.
        let frente: Carro | null = null;
        let gapFrente = Infinity;
        for (const o of carros) {
          if (o === c || Math.abs(o.lat - c.lat) >= MESMA_FAIXA_M) continue;
          const gap = o.d > c.d ? o.d - c.d : o.d + L - c.d;
          if (gap < gapFrente) [frente, gapFrente] = [o, gap];
        }
        if (n > 1 && frente && gapFrente < distancia + FOLGA_SEGUIR_M) {
          const atras = c.d + gapFrente - distancia;
          // Na fila, nunca fica parado em cima de uma passadeira.
          const zona = zonas.find((z) => atras > z.ini && atras < z.fim && c.d <= z.ini);
          limite = Math.min(limite, zona ? zona.ini : atras);
        }
        limite = Math.max(c.d, limite);
        const v = Math.min(c.v + arranque * dt, c.ms, Math.sqrt(2 * travagem * (limite - c.d)));
        const d = Math.min(c.d + v * dt, limite);
        if (dt > 0) c.v = (d - c.d) / dt;
        c.d = d;
      });
      // Mudar de faixa (2 faixas por sentido: a da direita, 0, e a da esquerda, ULTRAPASSAR_M). Um carro com um mais lento à frente,
      // perto, passa para a outra faixa, se ela estiver livre ao lado dele; um carro na faixa da esquerda volta à da direita assim que
      // ela fica livre. Nunca muda para cima de outro carro (ADR-0043, (d)).
      const livre = (c: Carro, faixa: number) =>
        carros.every((o) => {
          if (o === c || Math.abs(o.lat - faixa) >= MESMA_FAIXA_M) return true;
          const dd = Math.abs(o.d - c.d);
          return Math.min(dd, L - dd) >= COMPRIMENTO_M;
        });
      for (const c of carros) {
        const faixa = c.lat < ULTRAPASSAR_M / 2 ? 0 : ULTRAPASSAR_M;
        const outra = faixa === 0 ? ULTRAPASSAR_M : 0;
        let lento = false;
        for (const o of carros) {
          if (o === c || Math.abs(o.lat - faixa) >= MESMA_FAIXA_M) continue;
          const gap = o.d > c.d ? o.d - c.d : o.d + L - c.d;
          if (gap < ULTRAPASSAR_PERTO_M && o.ms < c.ms - 0.5) lento = true;
        }
        let alvo = faixa;
        if (faixa === 0 && lento && livre(c, outra)) alvo = outra;
        else if (faixa === ULTRAPASSAR_M && livre(c, 0)) alvo = 0;
        const passo = LATERAL_MS * oc.aceleracao * dt;
        c.lat += Math.max(-passo, Math.min(passo, alvo - c.lat));
      }
      // A fila de espera mostra no máximo FILA_MAX carros por passadeira: os grupos dão a volta ao segmento, e o fluxo fica
      // acima do real (ADR-0043, (d)). Os outros desvanecem enquanto esperam e voltam quando a fila anda.
      const escondidos = new Set<Carro>();
      // Também depois de a passadeira abrir: enquanto a fila não anda, os de trás continuam escondidos.
      for (const z of zonas) {
        const fila = carros.filter((c) => c.d <= z.ini && z.ini - c.d < FILA_ALCANCE_M && c.v < 0.3 * c.ms).sort((a, b) => b.d - a.d);
        fila.slice(FILA_MAX).forEach((c) => escondidos.add(c));
      }
      for (const c of carros) {
        const passoVis = VIS_POR_S * dt;
        c.vis += Math.max(-passoVis, Math.min(passoVis, (escondidos.has(c) ? 0 : 1) - c.vis));
      }
      for (const c of carros) {
        if (c.d >= L) c.d -= L;
        for (const z of zonas) {
          // Na zona: a passar a passadeira (um carro parado na linha, antes dela, não conta, senão nunca abria).
          if (c.d > z.ini + 0.5 && c.d <= z.fim + FOLGA_ZONA_M) naZona.add(z.id);
          else if (c.d <= z.ini + 0.5 && c.v > 0.1) chegada.set(z.id, Math.min(chegada.get(z.id) ?? Infinity, Math.max(0, z.ini - FOLGA_ZONA_M - c.d) / c.v));
        }
        const aAndar = c.v >= FRACAO_A_ANDAR * c.ms;
        const rumo = rumoNaLinha(s, c.d);
        veiculos.push({
          // No corredor da avenida, o desvio medido (ADR-0044); fora dele, os 2 sentidos têm a mesma linha e cada um anda à direita.
          coord: deslocar(pontoNaLinha(s, c.d), rumo, 0, (desl?.[s.id] ? desvioNoSegmento(desl, s.id, c.d) : DIREITA_M) + c.lat - ULTRAPASSAR_M / 2),
          rumo,
          categoria: c.categoria,
          kmh: aAndar && !c.estimado ? c.kmh : null,
          acima: aAndar && !c.estimado && c.acima,
          variante: c.variante,
          ...(c.estimado ? { estimado: true } : {}),
          // Nas pontas do segmento, o carro encolhe e cresce: os grupos dão a volta ao segmento (ADR-0034), e sem isto via-se o salto.
          escala: c.vis * Math.max(0, Math.min(1, Math.min(c.d, L - c.d) / PONTAS_M)),
        });
      }
    }

    // 2. Os peões: esperam, procuram uma aberta, pedem passagem se ela não vier, e atravessam com a zona livre.
    const pessoas: Pessoa3D[] = [];
    for (const { p, n, duracao } of ativas) {
      const e = estado.get(p.id)!;
      const t = segundos - e.desde;
      const estimada = estimadas.has(p.id);
      const livre = !naZona.has(p.id);
      const aberta = livre && (chegada.get(p.id) ?? Infinity) > duracao;
      // Depois do pedido, só se entra com a zona livre e sem nenhum carro a menos de 1,5 s (os que já não conseguiam travar).
      const passagem = livre && (chegada.get(p.id) ?? Infinity) > 1.5;
      if (e.fase === "travessia" && t >= duracao) Object.assign(e, { fase: "espera", desde: segundos, sentido: -e.sentido });
      else if (e.fase === "espera" && t >= tempos.espera && aberta) Object.assign(e, { fase: "travessia", desde: segundos });
      else if (e.fase === "espera" && t >= tempos.espera + tempos.pedir) Object.assign(e, { fase: "pedido", desde: segundos });
      else if (e.fase === "pedido" && passagem) Object.assign(e, { fase: "travessia", desde: segundos });
      const aAtravessar = e.fase === "travessia";
      const andado = aAtravessar ? (segundos - e.desde) * PASSO_MS * op.aceleracao : 0;
      const largura = Math.max(0, p.S - 2 * MARGEM_M);
      for (let j = 0; j < n; j++) {
        const atras = (j % 3) * ATRAS_M;
        const x = aAtravessar ? Math.min(p.curso, Math.max(0, andado - atras)) : -atras;
        const a = e.sentido * (x - p.curso / 2);
        const b = -largura / 2 + ((j + 0.5) / n) * largura;
        pessoas.push({ coord: p.ponto(a, b), rumo: e.sentido === 1 ? p.rumo : p.rumo + 180, indice: j, andar: aAtravessar && x > 0 && x < p.curso, ...(estimada ? { estimado: true } : {}) });
      }
    }
    ultima = { veiculos, pessoas };
    return ultima;
  };
}
