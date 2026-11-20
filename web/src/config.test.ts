/**
 * O `demo.json` da web espelha `config/riasense.yaml` (bloco `demo`, `periodo_dados`, `proteger` e o início da
 * janela «depois» do «verificar o sensor»).
 * Se alguém mudar a zona num sítio e não no outro, este teste falha.
 */
import { describe, expect, it } from "vitest";
// O YAML da raiz do repositório, lido como texto pelo Vite (`?raw`).
import yaml from "../../config/riasense.yaml?raw";
import bruto from "./demo.json";
import { validarConfig } from "./config";

const valor = (re: RegExp) => yaml.match(re)?.[1]?.trim();
const lista = (texto: string | undefined) => (texto ?? "").split(",").map((s) => s.trim());

describe("configuração da demo", () => {
  it("tem a mesma zona, RSU e passadeiras que config/riasense.yaml", () => {
    expect(valor(/^ {2}zona: (\S+)/m)).toBe(bruto.zona.id);
    expect(lista(valor(/^ {2}rsu: \[([^\]]+)\]/m))).toEqual([bruto.zona.rsu]);
    expect(lista(valor(/^ {2}passadeiras: \[([^\]]+)\]/m))).toEqual(bruto.zona.passadeiras);
  });

  it("tem o mesmo início do incidente e o mesmo período dos dados", () => {
    expect(valor(/incidente: \{rsu: [^,]+, inicio: "([^"]+)"\}/)).toBe(bruto.incidente_inicio);
    expect(valor(/periodo_dados: \{inicio: "([^"]+)"/)).toBe(bruto.periodo.inicio);
    expect(valor(/periodo_dados: \{inicio: "[^"]+", fim: "([^"]+)"/)).toBe(bruto.periodo.fim);
  });

  it("o «verificar o sensor» começa no 1.º dia da janela «depois» da ② (ADR-0033)", () => {
    expect(valor(/degradacao_depois: \["([^"]+)"/)).toBe(bruto.verificar_desde.slice(0, 10));
  });

  it("tem os mesmos parâmetros da ④ que o texto do painel cita", () => {
    expect(Number(valor(/^ {2}por_travessias: (\d+)/m))).toBe(bruto.proteger.por_travessias);
    expect(Number(valor(/^proteger:[\s\S]*?^ {2}intervalo_min: (\d+)/m))).toBe(bruto.proteger.intervalo_min);
  });

  it("tem o horizonte principal da ③: o 1.º de prever.horizontes_h (ADR-0027)", () => {
    expect(Number(lista(valor(/^ {2}horizontes_h: \[([^\]]+)\]/m))[0])).toBe(bruto.prever.horizonte_h);
  });

  it("tem a mesma altura dos edifícios sem altura no OpenStreetMap (ADR-0037)", () => {
    expect(Number(valor(/^mapa:[\s\S]*?^ {2}edificio_altura_m: (\d+)/m))).toBe(bruto.mapa.edificio_altura_m);
  });

  it("tem as mesmas passadeiras com o sinal H7 na vista 3D", () => {
    // Vazia até haver uma foto da equipa (ADR-0060): os H7 da Street View não entram (ADR-0023).
    expect(lista(valor(/^ {2}sinais_h7: \[([^\]]*)\]/m)).filter(Boolean)).toEqual(bruto.mapa.sinais_h7);
    expect(lista(valor(/^ {2}semaforos_ponta_oposta: \[([^\]]*)\]/m)).filter(Boolean)).toEqual(bruto.mapa.semaforos_ponta_oposta);
  });

  it("tem os mesmos parâmetros da camada «Trânsito» (ADR-0034)", () => {
    expect(Number(valor(/^ {2}veiculos_por_ponto: (\d+)/m))).toBe(bruto.carros.veiculos_por_ponto);
    expect(Number(valor(/^ {2}pontos_max: (\d+)/m))).toBe(bruto.carros.pontos_max);
    expect(Number(valor(/^carros:[\s\S]*?^ {2}aceleracao: (\d+)/m))).toBe(bruto.carros.aceleracao);
  });

  it("tem os mesmos parâmetros dos peões da vista 3D (ADR-0041)", () => {
    expect(Number(valor(/^ {2}travessias_por_figura: (\d+)/m))).toBe(bruto.pessoas.travessias_por_figura);
    expect(Number(valor(/^ {2}figuras_max: (\d+)/m))).toBe(bruto.pessoas.figuras_max);
    expect(Number(valor(/^pessoas:[\s\S]*?^ {2}aceleracao: (\d+)/m))).toBe(bruto.pessoas.aceleracao);
    expect(valor(/^ {2}aspeto: (\w+)/m)).toBe(bruto.pessoas.aspeto);
  });

  it("tem as mesmas ruas da pergunta por voz (ADR-0054)", () => {
    const ruas = [...yaml.matchAll(/^ {4}- \{nome: "([^"]+)", sentidos: \[(\[[^\]]+\](?:, \[[^\]]+\])?)\]\}/gm)].map((m) => ({
      nome: m[1],
      sentidos: [...m[2].matchAll(/\[([^\]]+)\]/g)].map((s) => lista(s[1]).map(Number)),
    }));
    expect(ruas).toEqual(bruto.voz.ruas);
  });

  it("recusa um horizonte da ③ que não é um número inteiro de horas ≥ 1", () => {
    expect(() => validarConfig({ ...bruto, prever: { horizonte_h: 0 } })).toThrow(/horizonte_h/);
    expect(() => validarConfig({ ...bruto, prever: { horizonte_h: 2.5 } })).toThrow(/horizonte_h/);
  });

  it("recusa uma configuração em que o foco não é uma passadeira da zona", () => {
    expect(() => validarConfig({ ...bruto, zona: { ...bruto.zona, foco: "SmartCrosswalk:0001" } })).toThrow(/foco/);
  });

  it("os edifícios sem altura no OpenStreetMap têm 9 m (ADR-0037)", () => {
    expect(validarConfig(bruto).mapa.edificioAlturaM).toBe(9);
  });
});
