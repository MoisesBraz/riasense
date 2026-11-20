/**
 * A parte do mapa que se vê (ADR-0033): o contentor menos o que lhe fica por cima. No ecrã largo é a barra da hora, em
 * baixo; no telemóvel, a folha do detalhe, que sobe do fundo. Os elementos que tapam o mapa marcam-se com `data-tapa-mapa`.
 * O alvo de um «centrar» (um sensor, ou a caixa dos sítios) fica no centro desta parte, e não no do contentor.
 * Os selos no topo do mapa (`data-tapa-mapa="pop-up"`) não mudam o centro: só o pop-up preso não os pode tapar.
 */

export interface Retangulo {
  top: number;
  bottom: number;
  left: number;
  right: number;
}

/** Quantos px do mapa ficam tapados em cima e em baixo. */
export interface Tapado {
  cima: number;
  baixo: number;
  /** O que o pop-up preso não pode tapar em cima (um selo no topo do mapa); nunca menos do que `cima`. Sem valor, `cima`. */
  cimaDoPopup?: number;
}

/** A parte visível nunca fica abaixo deste tanto da altura do mapa, mesmo com uma folha alta. */
const VISIVEL_MIN = 0.25;
/** Uma sobreposição conta numa ponta do mapa se começar até esta distância dela (o selo do ③ fica a 16 px do topo). */
const PERTO_DA_PONTA_PX = 24;

/**
 * O que tapa o mapa em cima e em baixo. Só conta o que está numa das pontas, até `PERTO_DA_PONTA_PX` dela (a barra da hora,
 * a folha, um selo): uma sobreposição a meio do mapa não muda o centro. O que fica fora do mapa (a barra no telemóvel, por
 * baixo dele) não conta. Os `soDoPopup` (os selos do topo) só entram no `cimaDoPopup`.
 */
export function tapadoNoMapa(mapa: Retangulo, tapas: Retangulo[], soDoPopup: Retangulo[] = []): Tapado {
  const altura = mapa.bottom - mapa.top;
  const sobrepoe = (t: Retangulo) => t.top < mapa.bottom && t.bottom > mapa.top && t.left < mapa.right && t.right > mapa.left;
  const emCima = (t: Retangulo) => t.top <= mapa.top + PERTO_DA_PONTA_PX;
  const deCima = (t: Retangulo) => Math.min(t.bottom, mapa.bottom) - mapa.top;
  let cima = 0;
  let baixo = 0;
  for (const t of tapas) {
    if (!sobrepoe(t)) continue;
    if (t.bottom >= mapa.bottom - PERTO_DA_PONTA_PX) baixo = Math.max(baixo, mapa.bottom - Math.max(t.top, mapa.top));
    else if (emCima(t)) cima = Math.max(cima, deCima(t));
  }
  const maximo = altura * (1 - VISIVEL_MIN);
  if (cima + baixo > maximo) baixo = Math.max(0, maximo - cima);
  // Os selos do topo contam em pilha: um selo que começa até `PERTO_DA_PONTA_PX` do fundo de outro já contado também conta
  // (no ③, o das figuras previstas fica por baixo do da «Previsão»).
  let cimaDoPopup = cima;
  let limite = mapa.top + PERTO_DA_PONTA_PX;
  for (const t of soDoPopup.filter(sobrepoe).sort((a, b) => a.top - b.top)) {
    if (t.top > limite) break;
    cimaDoPopup = Math.max(cimaDoPopup, deCima(t));
    limite = Math.max(limite, t.bottom + PERTO_DA_PONTA_PX);
  }
  return { cima: Math.round(cima), baixo: Math.round(baixo), ...(cimaDoPopup > cima ? { cimaDoPopup: Math.round(cimaDoPopup) } : {}) };
}

/** A folga, em px, entre o pop-up e a ponta de cima da parte visível (e entre o alvo e a de baixo). */
export const FOLGA_PX = 12;

/**
 * O `offset` do `easeTo` (em px, a partir do centro do contentor) que põe o alvo no centro da parte visível. Com um pop-up
 * preso por cima do alvo (`popup`: a altura em px, com a seta), o alvo só desce o que falta para o pop-up caber, por
 * baixo dos selos do topo do mapa.
 */
export function deslocamentoDoAlvo(altura: number, tapado: Tapado, popup = 0): [number, number] {
  const topo = tapado.cima;
  const fundo = altura - tapado.baixo;
  let y = (topo + fundo) / 2;
  if (popup > 0) y = Math.min(Math.max(y, Math.max(topo, tapado.cimaDoPopup ?? 0) + popup + FOLGA_PX), fundo - FOLGA_PX);
  return [0, Math.round(y - altura / 2)];
}

/** O retângulo de um elemento sem a translação de uma animação (a folha sobe do fundo com `translateY`). */
function retanguloSemAnimacao(el: Element): Retangulo {
  const r = el.getBoundingClientRect();
  let dx = 0;
  let dy = 0;
  const transformacao = typeof getComputedStyle === "function" ? getComputedStyle(el).transform : "none";
  if (transformacao && transformacao !== "none" && typeof DOMMatrixReadOnly !== "undefined") {
    const m = new DOMMatrixReadOnly(transformacao);
    dx = m.m41;
    dy = m.m42;
  }
  return { top: r.top - dy, bottom: r.bottom - dy, left: r.left - dx, right: r.right - dx };
}

/**
 * O que tapa este mapa agora: os elementos com `data-tapa-mapa` e o que está fora do ecrã. No telemóvel, o painel fica por
 * baixo do mapa, e tocar numa linha dele deixa a página rolada, com só a parte de baixo do mapa à vista.
 */
export function tapadoAgora(contentor: Element): Tapado {
  const tapas = [...document.querySelectorAll('[data-tapa-mapa]:not([data-tapa-mapa="pop-up"])')].map(retanguloSemAnimacao);
  const fora = Number.POSITIVE_INFINITY;
  tapas.push({ top: -fora, bottom: 0, left: -fora, right: fora }, { top: window.innerHeight, bottom: fora, left: -fora, right: fora });
  const selos = [...document.querySelectorAll('[data-tapa-mapa="pop-up"]')].map(retanguloSemAnimacao);
  return tapadoNoMapa(contentor.getBoundingClientRect(), tapas, selos);
}
