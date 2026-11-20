/** Regras de domínio que alimentam os painéis e o mapa, com a amostra dos dados reais. */
import { describe, expect, it } from "vitest";
import type { Falha } from "../api/tipos";
import { estadoInicial, type EstadoDemo } from "../estado/estado";
import { FALHAS, LUMINOSIDADE, PREVISOES, PROTEGER, PROXIMO_SENSOR, RISCO, SENSORES, VIRTUAIS } from "../test/dados";
import { nivelDoRisco } from "./risco";
import { emAtencao, estimadosNaHora, razaoLarguraFimDeSemana, serieVirtual, sitiosDoProximo, travessiasPorHora } from "./completar";
import { comSinal, intervaloPct, numero, rotuloLista, rotuloSensor } from "./formato";
import { caixaDe, estadoDeSaude, marcadoresDe, rotuloAcessivel, type Zona } from "./marcadores";
import { previsaoPorSensor, previsaoPorVertical, sensoresDaRsu } from "./prever";
import { diasDeDados, linhasDoEfeito, resumirProteger } from "./proteger";
import { rotuloLuz } from "./luminosidade";
import { lerInstante, rotuloHora } from "./tempo";
import { falhaNaHora, incidenteDeRede, redeDesde, resumirFalhas } from "./vigiar";
import { INTERVALOS } from "../test/dados";

const U = "urn:ngsi-ld:";
const RSU30 = `${U}RoadSideUnit:0030`;
const ZONA: Zona = { rsu: RSU30, passadeiras: new Set(["0019", "0020", "0021", "0022"].map((n) => `${U}SmartCrosswalk:${n}`)) };
const h = (iso: string) => lerInstante(iso);

describe("① vigiar", () => {
  it("conta as falhas, os incidentes de rede e as de dispositivo", () => {
    expect(resumirFalhas(FALHAS)).toEqual({ total: 10, incidentesRede: 1, falhasRede: 7, dispositivo: 3 });
  });

  it("encontra o incidente de rede da RSU da zona, do primeiro ao último início", () => {
    const inc = incidenteDeRede(FALHAS, RSU30);
    expect(inc?.falhas).toHaveLength(7);
    expect(rotuloHora(inc!.primeiroInicio)).toBe("qua 04/11 · 20h");
    expect(new Date(inc!.primeiroInicio).toISOString()).toBe("2026-11-04T20:06:25.000Z");
    expect(new Date(inc!.ultimoInicio).toISOString()).toBe("2026-11-04T20:16:30.750Z");
    expect(inc?.emCurso).toBe(true);
  });

  it("a hora das 20h conta a falha que começa às 20h06; a das 19h não", () => {
    expect(falhaNaHora(FALHAS, `${U}SmartCrosswalk:0020`, h("2026-11-04T20:00"))).toBeDefined();
    expect(falhaNaHora(FALHAS, `${U}SmartCrosswalk:0020`, h("2026-11-04T19:00"))).toBeUndefined();
  });
});

describe("② completar", () => {
  it("soma os intervalos de 15 min em travessias por hora", () => {
    expect(travessiasPorHora(INTERVALOS)).toEqual([
      { t: h("2026-11-04T18:00"), valor: 39 },
      { t: h("2026-11-04T19:00"), valor: 11 },
    ]);
  });

  it("o intervalo é mais largo ao fim de semana", () => {
    expect(razaoLarguraFimDeSemana(serieVirtual(VIRTUAIS, `${U}SmartCrosswalk:0020`))).toBeGreaterThan(1);
  });

  it("diz que sensores estão a ser estimados numa hora", () => {
    expect(estimadosNaHora(VIRTUAIS, h("2026-11-04T20:00"))).toEqual(new Set([`${U}SmartCrosswalk:0020`]));
    expect(estimadosNaHora(VIRTUAIS, h("2026-11-04T19:00")).size).toBe(0);
  });
});

describe("③ prever", () => {
  it("soma a previsão e a referência daqui a 3 h por vertical, e deixa a null o que não tem previsão", () => {
    const linhas = previsaoPorVertical(PREVISOES, sensoresDaRsu(SENSORES, RSU30), h("2026-11-08T08:00"), 3);
    const mob = linhas.find((l) => l.tipo === "segmento")!;
    expect(mob).toMatchObject({ naZona: 3, comPrevisao: 2, previsao: 700, referencia: 730 });
    const seg = linhas.find((l) => l.tipo === "passadeira")!;
    expect(seg).toMatchObject({ naZona: 4, comPrevisao: 0, previsao: null });
    expect(linhas.find((l) => l.tipo === "zona")?.naZona).toBe(0);
  });

  it("a hora a seguir ao fim dos dados tem previsão mas a referência só se a houver em todas as linhas", () => {
    const linhas = previsaoPorVertical(PREVISOES, sensoresDaRsu(SENSORES, RSU30), h("2026-11-10T08:00"), 3);
    expect(linhas.find((l) => l.tipo === "segmento")).toMatchObject({ previsao: 380, referencia: 400 });
  });

  it("a hora prevista é o cursor mais o horizonte (ADR-0027), e não a hora seguinte", () => {
    expect(previsaoPorSensor(PREVISOES, h("2026-11-08T08:00"), 3).size).toBe(3);
    expect(previsaoPorSensor(PREVISOES, h("2026-11-08T10:00"), 3).size).toBe(0);
  });
});

describe("④ proteger", () => {
  it("conta as que abrandam e dá a % acima do limite da zona", () => {
    const r = resumirProteger(PROTEGER, ZONA.passadeiras);
    expect(`${r.abrandam} de ${r.total}`).toBe("2 de 6");
    expect(intervaloPct(...r.acimaMovimentados!)).toBe("23–24 %");
    expect(intervaloPct(...r.acimaCalmos!)).toBe("33–37 %");
  });

  it("o gráfico mostra a zona e as assinaladas de fora; com «todas», todas", () => {
    // A SC0013 fica de fora: tem semáforo, por isso não é assinalada (ADR-0024).
    expect(linhasDoEfeito(PROTEGER, ZONA.passadeiras, false).map((p) => rotuloSensor(p.id))).toEqual(["SC0019", "SC0020", "SC0021", "SC0022"]);
    expect(linhasDoEfeito(PROTEGER, ZONA.passadeiras, true)).toHaveLength(6);
  });

  it("diz os dias de dados a partir de n_intervalos, e «antes da falha da RSU» na zona da falha", () => {
    expect(diasDeDados(610, 15)).toBe("6 dias de dados");
    expect(diasDeDados(116, 15, "RSU0030")).toBe("1 dia de dados, antes da falha da RSU0030");
    expect(diasDeDados(20, 15, null)).toBe("5 h de dados");
  });
});

describe("risco potencial", () => {
  it("passa a pontuação de 0 a 1 para 5 degraus iguais de 0,2", () => {
    expect([0, 0.19, 0.2, 0.57, 0.8, 0.99, 1].map(nivelDoRisco)).toEqual([1, 1, 2, 3, 5, 5, 5]);
  });
});

describe("luminosidade (ADR-0018)", () => {
  it("diz «às escuras» de noite, «ao crepúsculo» no crepúsculo e nada de dia ou sem dado", () => {
    expect(rotuloLuz(LUMINOSIDADE, lerInstante("2026-11-04T20:00:00"))).toBe("às escuras");
    expect(rotuloLuz(LUMINOSIDADE, lerInstante("2026-11-04T07:00:00"))).toBe("ao crepúsculo");
    expect(rotuloLuz(LUMINOSIDADE, lerInstante("2026-11-04T12:00:00"))).toBeNull();
    expect(rotuloLuz(LUMINOSIDADE, lerInstante("2026-11-05T12:00:00"))).toBeNull();
  });
});

describe("marcadores do mapa", () => {
  const dados = {
    sensores: SENSORES,
    falhas: FALHAS,
    estimados: estimadosNaHora(VIRTUAIS, h("2026-11-04T20:00")),
    proteger: new Map(PROTEGER.map((p) => [p.id, p])),
  };
  const estado = (mudar: Partial<EstadoDemo>): EstadoDemo => ({ ...estadoInicial(), ...mudar });
  const tipoDe = (lista: ReturnType<typeof marcadoresDe>, id: string) => lista.find((m) => m.id === U + id)?.tipo;

  it("só desenha pontos com sensor: no Prever e no Proteger, as passadeiras e a RSU da zona (sem segmentos nem zonas)", () => {
    const m = marcadoresDe(estado({ separador: "prever" }), dados, ZONA);
    expect(m.map((x) => rotuloSensor(x.id)).sort()).toEqual(["RSU0030", "SC0013", "SC0019", "SC0020", "SC0021", "SC0022"]);
  });

  it("no Vigiar, os sensores-ponto com o seu tipo: passadeiras, zonas e RSU; os segmentos são linhas, e não pontos", () => {
    const m = marcadoresDe(estado({ separador: "vigiar" }), dados, ZONA);
    const ids = m.map((x) => x.id);
    const comPosicao = (tipo: string) => dados.sensores.filter((s) => s.tipo === tipo && s.lon !== null && s.lat !== null).map((s) => s.id);
    for (const id of [...comPosicao("passadeira"), ...comPosicao("zona")]) expect(ids).toContain(id);
    expect(ids.some((id) => id.includes("RoadSegment"))).toBe(false);
    for (const id of dados.sensores.filter((s) => s.id.includes("RoadSideUnit") && s.lon !== null).map((s) => s.id))
      expect(ids).toContain(id);
    const especie = (parte: string) => m.find((x) => x.id.includes(parte))?.especie;
    expect(especie("SmartCrosswalk")).toBe("passadeira");
    expect(especie("RoadSideUnit")).toBe("rsu");
    // As zonas turísticas só têm marcador no ① Vigiar (ADR-0033, pontos 3 e 5).
    const completar = marcadoresDe(estado({ separador: "completar" }), dados, ZONA).map((x) => x.id);
    expect(completar.some((id) => id.includes("TouristZone"))).toBe(false);
    // O ícone do tipo vale em todos os separadores (ADR-0033); os segmentos são sempre linhas.
    for (const separador of ["completar", "prever", "proteger"] as const) {
      const outros = marcadoresDe(estado({ separador }), dados, ZONA);
      expect(outros.every((x) => x.especie === (x.id.includes("RoadSideUnit") ? "rsu" : "passadeira"))).toBe(true);
      expect(outros.some((x) => x.id.includes("RoadSegment"))).toBe(false);
    }
  });

  it("Vigiar: falha de rede, ativo nos outros, e a RSU com falha de rede às 20h de 04/11 (ADR-0033, ponto 1)", () => {
    const m = marcadoresDe(estado({ separador: "vigiar" }), dados, ZONA);
    expect(tipoDe(m, "SmartCrosswalk:0020")).toBe("falha-rede");
    expect(tipoDe(m, "SmartCrosswalk:0013")).toBe("ativo");
    expect(m.find((x) => x.id === RSU30)).toMatchObject({ tipo: "rsu-falha", rotulo: "RSU0030 · falha de rede", halo: { tipo: "falha" } });
  });

  it("Vigiar: a falha de um só sensor é «falha de dispositivo», e distingue-se da de rede (ADR-0033)", () => {
    // A SC0013 falha sozinha, sem as outras da RSU (a falha da fixture é a da SC0019, só para ter as datas).
    const sozinha: Falha = { ...FALHAS[0], sensor: `${U}SmartCrosswalk:0013`, tipo: "dispositivo", grupo: 99 };
    const m = marcadoresDe(estado({ separador: "vigiar" }), { ...dados, falhas: [sozinha] }, ZONA);
    expect(m.find((x) => x.id === `${U}SmartCrosswalk:0013`)).toMatchObject({ tipo: "falha-dispositivo", especie: "passadeira" });
    expect(rotuloAcessivel(m.find((x) => x.id === `${U}SmartCrosswalk:0013`)!)).toBe("SC0013 · Falha de dispositivo");
    // Uma falha de dispositivo não pinta nenhuma RSU de vermelho: só a de rede leva o halo.
    expect(m.some((x) => x.tipo === "rsu-falha" || x.halo?.tipo === "falha")).toBe(false);
  });

  it("Completar: com falha e estimado à mesma hora, mostra o estimado; sem a camada dos estimados, a falha", () => {
    const m = marcadoresDe(estado({ separador: "completar" }), dados, ZONA);
    expect(m.find((x) => x.id === `${U}SmartCrosswalk:0020`)).toMatchObject({ tipo: "estimado", rotulo: "SC0020 · estimado", falha: "rede" });
    expect(tipoDe(m, "SmartCrosswalk:0013")).toBe("ativo");
    expect(
      tipoDe(marcadoresDe(estado({ separador: "completar", camadasDesligadas: ["estimados"] }), dados, ZONA), "SmartCrosswalk:0020"),
    ).toBe("falha-rede");
  });

  it("Atenção: um «verificar o sensor» é um círculo vazio âmbar no Vigiar e no Completar, e só a partir do dia da queda", () => {
    const sc23 = `${U}SmartCrosswalk:0023`;
    expect(emAtencao(PROXIMO_SENSOR, h("2026-11-06T23:00"), h("2026-11-07T00:00")).size).toBe(0);
    expect([...emAtencao(PROXIMO_SENSOR, h("2026-11-07T00:00"), h("2026-11-07T00:00"))]).toEqual([sc23]);
    const comAtencao = { ...dados, atencao: new Set([`${U}SmartCrosswalk:0013`]) };
    expect(tipoDe(marcadoresDe(estado({ separador: "vigiar" }), comAtencao, ZONA), "SmartCrosswalk:0013")).toBe("atencao");
    expect(tipoDe(marcadoresDe(estado({ separador: "completar" }), comAtencao, ZONA), "SmartCrosswalk:0013")).toBe("atencao");
    expect(tipoDe(marcadoresDe(estado({ separador: "prever" }), comAtencao, ZONA), "SmartCrosswalk:0013")).toBe("neutro");
  });

  it("a falha ganha à atenção, e o estimado só ganha à falha no Completar", () => {
    expect(estadoDeSaude("vigiar", { falha: "rede", estimado: true, atencao: true })).toBe("falha-rede");
    expect(estadoDeSaude("vigiar", { falha: "dispositivo", estimado: true, atencao: true })).toBe("falha-dispositivo");
    expect(estadoDeSaude("completar", { falha: "rede", estimado: true, atencao: false })).toBe("estimado");
    expect(estadoDeSaude("completar", { falha: null, estimado: false, atencao: true })).toBe("atencao");
    expect(estadoDeSaude("prever", { falha: null, estimado: false, atencao: false })).toBe("ativo");
  });

  it("Prever e Proteger: marcadores neutros, sem estado de saúde (ADR-0033, ponto 2)", () => {
    for (const separador of ["prever", "proteger"] as const) {
      const tipos = new Set(marcadoresDe(estado({ separador }), dados, ZONA).map((x) => x.tipo));
      for (const saude of ["ativo", "atencao", "falha-rede", "falha-dispositivo", "estimado"]) expect(tipos.has(saude as never)).toBe(false);
    }
  });

  it("o leitor de ecrã ouve o estado por extenso", () => {
    const m = marcadoresDe(estado({ separador: "vigiar" }), dados, ZONA);
    expect(rotuloAcessivel(m.find((x) => x.id === `${U}SmartCrosswalk:0020`)!)).toBe("SC0020 · Falha de rede");
    expect(rotuloAcessivel(m.find((x) => x.id === `${U}SmartCrosswalk:0013`)!)).toBe("SC0013 · Ativo");
  });

  it("próximo sensor: só as passadeiras com redução ≥ 0,01, numeradas pela ordem, com o alvo (ADR-0033, ponto 5)", () => {
    const sitios = sitiosDoProximo(PROXIMO_SENSOR);
    expect(sitios.map((l) => [rotuloSensor(l.id), l.posicao])).toEqual([
      ["SC0016", 1],
      ["SC0024", 2],
    ]);
    const comPosicao = SENSORES.concat(
      [
        ["0016", -8.65, 40.64],
        ["0024", -8.651, 40.641],
      ].map(([n, lon, lat]) => ({ ...SENSORES[1], id: `${U}SmartCrosswalk:${n}`, lon: lon as number, lat: lat as number })),
    );
    const m = marcadoresDe(estado({ separador: "completar", proximo: true }), { ...dados, sensores: comPosicao, proximo: sitios }, ZONA);
    expect(m.map((x) => [rotuloSensor(x.id), x.tipo, x.posicao])).toEqual([
      ["SC0016", "proximo", 1],
      ["SC0024", "proximo", 2],
    ]);
    expect(rotuloAcessivel(m[0])).toBe("1.º · SC0016 · onde pôr o próximo sensor");
  });

  it("Proteger: assinaladas; no mapa de risco potencial, o estimado volta a tracejado", () => {
    expect(tipoDe(marcadoresDe(estado({ separador: "proteger" }), dados, ZONA), "SmartCrosswalk:0021")).toBe("assinalada");
    expect(tipoDe(marcadoresDe(estado({ separador: "proteger" }), dados, ZONA), "SmartCrosswalk:0013")).toBe("neutro"); // com semáforo (ADR-0024)
    const semRisco = marcadoresDe(estado({ separador: "proteger", vistaProteger: "risco" }), dados, ZONA);
    expect(semRisco.find((x) => x.id === `${U}SmartCrosswalk:0020`)).toMatchObject({
      tipo: "neutro",
      tracejado: true,
      rotulo: "SC0020 · estimado",
    });
  });

  it("mapa de risco potencial: degrau por passadeira, tracejado quando estimado", () => {
    const comRisco = { ...dados, risco: new Map(RISCO.map((r) => [r.id, r])) };
    const m = marcadoresDe(estado({ separador: "proteger", vistaProteger: "risco" }), comRisco, ZONA);
    expect(m.find((x) => x.id === `${U}SmartCrosswalk:0020`)).toMatchObject({
      tipo: "risco",
      risco: { nivel: 3, estimado: true },
      rotulo: "SC0020 · estimado",
    });
    expect(m.find((x) => x.id === `${U}SmartCrosswalk:0013`)).toMatchObject({ tipo: "risco", risco: { nivel: 5, estimado: false } });
    const semTracejado = marcadoresDe(
      estado({ separador: "proteger", vistaProteger: "risco", camadasDesligadas: ["estimados"] }),
      comRisco,
      ZONA,
    );
    expect(semTracejado.find((x) => x.id === `${U}SmartCrosswalk:0020`)?.risco?.estimado).toBe(false);
  });

  it("desligar a camada «Sensores» tira todos os pontos", () => {
    expect(marcadoresDe(estado({ camadasDesligadas: ["sensores"] }), dados, ZONA)).toHaveLength(0);
  });

  it("os rótulos das passadeiras a oeste da zona ficam à esquerda, para não se taparem", () => {
    const m = marcadoresDe(estado({}), dados, ZONA);
    expect(m.find((x) => x.id === `${U}SmartCrosswalk:0021`)?.lado).toBe("esquerda");
    expect(m.find((x) => x.id === `${U}SmartCrosswalk:0019`)?.lado).toBe("direita");
  });
});

describe("formato pt-PT", () => {
  it("usa vírgula decimal e o sinal de menos tipográfico", () => {
    expect(numero(0.357, 2)).toBe("0,36");
    expect(comSinal(-0.13, 2)).toBe("−0,13");
    expect(comSinal(0.02, 2)).toBe("+0,02");
  });

  it("encurta listas seguidas de sensores", () => {
    expect(rotuloLista(["SmartCrosswalk:0019", "SmartCrosswalk:0020", "SmartCrosswalk:0021", "SmartCrosswalk:0022"])).toBe("SC0019–0022");
    expect(rotuloLista(["RoadSegment:11165", "RoadSegment:11166"])).toBe("11165 e 11166");
  });
});

describe("redeDesde: o pop-up da RSU e o cartão do incidente dizem a mesma hora", () => {
  const RSU = "urn:ngsi-ld:RoadSideUnit:0030";
  it("é o início do grupo de rede em curso, mesmo que a API devolva primeiro uma falha mais tardia", () => {
    const desde = redeDesde([...FALHAS].reverse(), RSU, lerInstante("2026-11-04T20:00:00"));
    expect(desde).toBe(incidenteDeRede(FALHAS, RSU)?.primeiroInicio);
    expect(desde).toBe(lerInstante("2026-11-04T20:06:25"));
  });

  it("é null quando a RSU não está em falha de rede a essa hora", () => {
    expect(redeDesde(FALHAS, RSU, lerInstante("2026-11-04T18:00:00"))).toBeNull();
  });
});

describe("caixaDe (o mapa enquadra os sítios do próximo sensor)", () => {
  it("contém todos os pontos com posição e ignora os outros", () => {
    expect(
      caixaDe([
        { lon: 1, lat: 5 },
        { lon: 3, lat: 2 },
        { lon: null, lat: null },
      ]),
    ).toEqual([
      [1, 2],
      [3, 5],
    ]);
    expect(caixaDe([{ lon: null, lat: null }])).toBeNull();
  });
});
