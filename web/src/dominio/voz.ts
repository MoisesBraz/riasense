/**
 * A pergunta por voz (ADR-0054): reconhece a rua na pergunta, sem modelo de linguagem, e resume o trânsito medido nessa rua à
 * hora do cursor, comparado com a referência (mesma hora, dia anterior). Nada se estima: sem dados medidos, diz-se isso.
 * A % acima do limite nunca se diz por rua: só por troço e com o sensor, no pop-up do troço (ADR-0039, ponto 4).
 */
import type { PassagemHora } from "./carros";

export interface RuaVoz {
  /** O nome que se mostra e se diz, por exemplo «Av. 25 de Abril». */
  nome: string;
  /** Os URN dos segmentos da rua (`urn:ngsi-ld:RoadSegment:NNNNN`), separados por sentido (um ou dois). */
  sentidos: string[][];
  /** Os mesmos URN numa lista só (os sentidos seguidos), para o mapa. */
  segmentos: string[];
}

/** Palavras que não distinguem uma rua de outra. */
const VAZIAS = new Set(["a", "o", "as", "os", "de", "da", "do", "das", "dos", "e", "av", "avenida", "rua", "r"]);

/** Minúsculas, sem acentos nem pontuação, em palavras. */
function palavras(texto: string): string[] {
  return texto
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter(Boolean);
}

/** A rua de que a pergunta fala: a que tem todas as suas palavras na pergunta (a de mais palavras ganha), ou null. */
export function reconhecerRua(pergunta: string, ruas: readonly RuaVoz[]): RuaVoz | null {
  const ditas = new Set(palavras(pergunta));
  let melhor: { rua: RuaVoz; n: number } | null = null;
  for (const rua of ruas) {
    const chave = palavras(rua.nome).filter((p) => !VAZIAS.has(p));
    if (chave.length > 0 && chave.every((p) => ditas.has(p)) && (!melhor || chave.length > melhor.n)) melhor = { rua, n: chave.length };
  }
  return melhor?.rua ?? null;
}

type Comparacao = "acima" | "abaixo" | "igual";

export type ResumoRua =
  | { medido: false }
  | {
      medido: true;
      /** Veículos por hora: em cada sentido, a média dos troços medidos (troços seguidos contam o mesmo carro), e depois a soma
       *  dos sentidos medidos. Sem arredondar: arredonda-se só na frase. */
      veiculos: number;
      /** Quantos sentidos têm medidas: 1 ou 2. */
      sentidos: number;
      /** A mediana das medianas dos grupos (ADR-0039), em km/h; null sem velocidades. */
      kmh: number | null;
      sensor: "câmara" | "radar" | "câmara e radar" | null;
      /** A referência: os veículos à mesma hora do dia anterior, nos mesmos segmentos; null sem dados ontem. */
      comparacao: Comparacao | null;
      variacaoPct: number | null;
    };

/** «Igual» dentro de ±10 % da referência. */
const MARGEM_IGUAL = 0.1;

function mediana(v: number[]): number | null {
  if (v.length === 0) return null;
  const s = [...v].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}

function medidas(passagens: readonly PassagemHora[], ids: readonly string[], emFalha: ReadonlySet<string>): PassagemHora[] {
  return passagens.filter((p) => ids.includes(p.id) && !emFalha.has(p.id) && p.veiculos > 0);
}

const mediaVeiculos = (ps: PassagemHora[]) => ps.reduce((a, p) => a + p.veiculos, 0) / ps.length;

/** A soma, nos sentidos com medidas, da média dos troços medidos em cada sentido. */
const somaDosSentidos = (porSentido: PassagemHora[][]) =>
  porSentido.filter((ps) => ps.length > 0).reduce((a, ps) => a + mediaVeiculos(ps), 0);

/** O trânsito medido na rua a esta hora, comparado com a mesma hora do dia anterior. */
export function resumirRua(
  rua: RuaVoz,
  agora: readonly PassagemHora[],
  ontem: readonly PassagemHora[] | null,
  emFalha: ReadonlySet<string> = new Set(),
): ResumoRua {
  const porSentido = rua.sentidos.map((ids) => medidas(agora, ids, emFalha));
  const ps = porSentido.flat();
  if (ps.length === 0) return { medido: false };
  const veiculos = somaDosSentidos(porSentido);
  const sentidos = porSentido.filter((s) => s.length > 0).length;
  const kmh = mediana(
    ps.flatMap((p) => (p.velocidades_kmh?.length ? p.velocidades_kmh : p.vel_media_ms !== null ? [p.vel_media_ms * 3.6] : [])),
  );
  const tipos = new Set(ps.map((p) => p.sensor).filter(Boolean));
  const sensor = tipos.size === 2 ? "câmara e radar" : tipos.has("Radar") ? "radar" : tipos.has("Camera") ? "câmara" : null;
  // A referência compara os mesmos troços, em cada sentido: um troço medido hoje e não ontem não entra, e um sentido sem troços
  // medidos nas duas horas fica de fora (senão o «mais» vinha de um sentido a mais, não do trânsito).
  const ref = porSentido.map((hoje) => (ontem ? medidas(ontem, hoje.map((p) => p.id), new Set()) : []));
  let comparacao: Comparacao | null = null;
  let variacaoPct: number | null = null;
  if (ref.some((s) => s.length > 0)) {
    const hoje = somaDosSentidos(porSentido.map((s, i) => s.filter((p) => ref[i].some((o) => o.id === p.id))));
    const antes = somaDosSentidos(ref);
    const v = (hoje - antes) / antes;
    variacaoPct = Math.round(v * 100);
    comparacao = Math.abs(v) <= MARGEM_IGUAL ? "igual" : v > 0 ? "acima" : "abaixo";
  }
  return { medido: true, veiculos, sentidos, kmh, sensor, comparacao, variacaoPct };
}

/** A ressalva do radar (ADR-0039, ponto 4): vai na frase escrita e na falada sempre que o radar mede a rua. */
export const RESSALVA_RADAR = "o radar e a câmara medem velocidades diferentes: o excesso não é comparável entre sensores";

const PELO = { câmara: "pela câmara", radar: "pelo radar", "câmara e radar": "pela câmara e pelo radar" } as const;

/** A frase curta da resposta, escrita e dita em voz alta: os veículos, o sensor e a referência; com o radar, a ressalva. */
export function fraseDaRua(nome: string, r: ResumoRua): string {
  if (!r.medido) return `${nome}: sem dados medidos a esta hora.`;
  const base = `${nome}: ${Math.round(r.veiculos)} veículos por hora, ${r.sentidos === 2 ? "nos dois sentidos" : "num só sentido"}`;
  const ref =
    r.comparacao === "acima"
      ? "mais trânsito do que ontem a esta hora"
      : r.comparacao === "abaixo"
        ? "menos trânsito do que ontem a esta hora"
        : r.comparacao === "igual"
          ? "trânsito igual ao de ontem a esta hora"
          : "sem referência de ontem a esta hora";
  const pelo = r.sensor ? `, medidos ${PELO[r.sensor]}` : "";
  const ressalva = r.sensor?.includes("radar") ? ` Atenção: ${RESSALVA_RADAR}.` : "";
  return `${base}${pelo}, ${ref}.${ressalva}`;
}

/** Porque é que a voz está desligada: nos modos «agora» (ADR-0032) e «Ao vivo» (ADR-0049) a hora não é a da semana gravada. */
export const vozDesligadaNoModo = (modo: "agora" | "Ao vivo") => `A pergunta por voz é sobre a semana gravada: está desligada no modo «${modo}».`;

/** O aviso de privacidade: na 1.ª pergunta por voz e na janela «Dados locais», junto das fontes (ADR-0048). */
export const AVISO_PRIVACIDADE = "A voz é reconhecida pelo browser, na Internet. Não guardamos áudio.";

export const NAO_PERCEBI = "Não percebi. Experimente:";
