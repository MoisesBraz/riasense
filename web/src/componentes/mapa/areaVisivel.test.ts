/** A parte visível do mapa: o centrar desconta a barra da hora, a folha do telemóvel e o que está fora do ecrã. */
import { describe, expect, it } from "vitest";
import { deslocamentoDoAlvo, FOLGA_PX, tapadoNoMapa, type Retangulo } from "./areaVisivel";

// O mapa a 1440 × 900 com o painel aberto (medido na app): de y = 80 a 884; a barra da hora por cima, de 795 a 884.
const MAPA: Retangulo = { top: 80, bottom: 884, left: 16, right: 988 };
const BARRA: Retangulo = { top: 795, bottom: 884, left: 16, right: 988 };
const INF = Number.POSITIVE_INFINITY;

describe("o que tapa o mapa", () => {
  it("no ecrã largo, a barra da hora tapa os 89 px de baixo", () => {
    expect(tapadoNoMapa(MAPA, [BARRA])).toEqual({ cima: 0, baixo: 89 });
  });

  it("no telemóvel, a barra fica por baixo do mapa e não conta", () => {
    expect(tapadoNoMapa({ top: 141, bottom: 711, left: 16, right: 374 }, [{ top: 727, bottom: 844, left: 0, right: 390 }])).toEqual({ cima: 0, baixo: 0 });
  });

  it("a folha do detalhe tapa a parte de baixo, e o que está acima do ecrã tapa a de cima", () => {
    const mapa = { top: -112, bottom: 300, left: 16, right: 374 };
    const folha = { top: 200, bottom: 711, left: 0, right: 390 };
    const acimaDoEcra = { top: -INF, bottom: 0, left: -INF, right: INF };
    expect(tapadoNoMapa(mapa, [folha, acimaDoEcra])).toEqual({ cima: 112, baixo: 100 });
  });

  it("uma sobreposição a meio do mapa não muda o centro", () => {
    expect(tapadoNoMapa(MAPA, [{ top: 300, bottom: 400, left: 100, right: 300 }])).toEqual({ cima: 0, baixo: 0 });
  });

  it("um selo no topo (a 16 px da ponta) não muda o centro: só o pop-up não o pode tapar", () => {
    // O selo do ③ «Previsão · Daqui a 3 h», medido na página: de y = 96 a 140, ao centro.
    const selo = { top: 96, bottom: 140, left: 389, right: 615 };
    expect(tapadoNoMapa(MAPA, [BARRA], [selo])).toEqual({ cima: 0, baixo: 89, cimaDoPopup: 60 });
    // Um selo a meio do mapa não conta.
    expect(tapadoNoMapa(MAPA, [BARRA], [{ ...selo, top: 300, bottom: 344 }])).toEqual({ cima: 0, baixo: 89 });
  });

  it("os selos do topo contam em pilha: no ③, o das figuras previstas fica por baixo do da «Previsão»", () => {
    // Medidos a 1440 × 900: o da «Previsão» de y = 96 a 140, e o das figuras de 148 a 192.
    const previsao = { top: 96, bottom: 140, left: 389, right: 615 };
    const figuras = { top: 148, bottom: 192, left: 200, right: 804 };
    expect(tapadoNoMapa(MAPA, [BARRA], [figuras, previsao])).toEqual({ cima: 0, baixo: 89, cimaDoPopup: 112 });
    // Um selo solto a meio do mapa, longe da pilha, continua a não contar.
    expect(tapadoNoMapa(MAPA, [BARRA], [previsao, { ...figuras, top: 300, bottom: 344 }])).toEqual({ cima: 0, baixo: 89, cimaDoPopup: 60 });
  });

  it("fica sempre à vista pelo menos um quarto do mapa", () => {
    const t = tapadoNoMapa(MAPA, [{ top: 100, bottom: 884, left: 16, right: 988 }]);
    expect(804 - t.cima - t.baixo).toBe(201);
  });
});

describe("o deslocamento do alvo", () => {
  it("sem pop-up, o alvo fica no centro da parte visível, e não no do contentor", () => {
    // A parte visível vai de 0 a 715 (no contentor): o centro é 357,5, ou seja, 44,5 px acima do centro do contentor (402).
    expect(deslocamentoDoAlvo(804, { cima: 0, baixo: 89 })).toEqual([0, -44]);
    expect(deslocamentoDoAlvo(804, { cima: 0, baixo: 0 })).toEqual([0, 0]);
  });

  it("com um pop-up que cabe por cima do centro, o alvo fica no centro", () => {
    expect(deslocamentoDoAlvo(804, { cima: 0, baixo: 89 }, 320)).toEqual([0, -44]);
  });

  it("com um pop-up alto (a RSU), o alvo só desce o que falta para o pop-up caber", () => {
    const [, y] = deslocamentoDoAlvo(804, { cima: 0, baixo: 89 }, 590);
    expect(402 + y).toBe(590 + FOLGA_PX); // o topo do pop-up fica na folga de cima
  });

  it("com o selo do ③, o pop-up abre por baixo dele: o alvo só desce com os pop-ups altos", () => {
    const tapado = { cima: 0, baixo: 89, cimaDoPopup: 60 };
    // Sem pop-up, ou com um pop-up baixo, o alvo fica no centro, como sem o selo.
    expect(deslocamentoDoAlvo(804, tapado)).toEqual([0, -44]);
    expect(deslocamentoDoAlvo(804, tapado, 200)).toEqual([0, -44]);
    // O pop-up da SC0002 (302 px, mais a seta de 20): o topo fica 12 px abaixo do selo, e o alvo desce 36,5 px.
    const [, y] = deslocamentoDoAlvo(804, tapado, 322);
    expect(402 + y - 322).toBe(60 + FOLGA_PX);
    expect(402 + y - 357.5).toBeCloseTo(36.5, 0);
  });

  it("um pop-up mais alto do que o mapa deixa o alvo no fundo da parte visível, nunca debaixo da barra", () => {
    const [, y] = deslocamentoDoAlvo(804, { cima: 0, baixo: 89 }, 2000);
    expect(402 + y).toBe(715 - FOLGA_PX);
  });

  it("a 390 px, com a página rolada, o alvo fica no centro do pedaço do mapa à vista", () => {
    // O mapa tem 412 px, dos quais os 112 de cima estão acima do ecrã e os 100 de baixo debaixo da folha: à vista, 112 a 312.
    const [, y] = deslocamentoDoAlvo(412, { cima: 112, baixo: 100 });
    expect(206 + y).toBe(212);
  });
});
