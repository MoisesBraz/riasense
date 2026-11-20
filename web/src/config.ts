/**
 * Configuração da web, validada na fronteira (convenções do README: «sensores, zonas e limiares vivem em config/»).
 *
 * A zona da demo vem de `src/demo.json`, que espelha o bloco `demo` de `config/riasense.yaml` (e o horizonte da ③)
 * (o teste `config.test.ts` falha se os dois divergirem). A posição dos sensores vem sempre de `/sensores`.
 * Porquê um JSON e não a leitura direta do YAML: a imagem Docker da web só vê a pasta `web/`, e o JSON
 * evita uma dependência de YAML no browser. Para replicar noutra zona troca-se o JSON, não o código.
 */
import bruto from "./demo.json";
import { lerInstante } from "./dominio/tempo";
import type { RuaVoz } from "./dominio/voz";

export interface ConfigDemo {
  zona: { id: string; nome: string; rsu: string; passadeiras: string[]; foco: string };
  incidenteInicio: number;
  /** 1.º dia da janela em que se mede a queda do «verificar o sensor»: só daí em diante fica «Atenção» (ADR-0033). */
  verificarDesde: number;
  periodo: { inicio: number; fim: number };
  proteger: { porTravessias: number; intervaloMin: number };
  /** O horizonte principal da ③ (o 1.º de `prever.horizontes_h`, ADR-0027): a previsão é para daqui a tantas horas. */
  prever: { horizonteH: number };
  mapa: {
    tiles: string;
    glifos: string;
    centro: [number, number];
    zoom: number;
    coberturaM: number;
    /** A altura dos edifícios sem altura no OpenStreetMap (ADR-0037): cerca de 3 pisos, e a legenda diz «aproximada». */
    edificioAlturaM: number;
    /** As passadeiras com o sinal H7 nas pontas, na vista 3D (URN): ilustrativo, sem posição medida (config `mapa.sinais_h7`). */
    sinaisH7: string[];
    /** As passadeiras com o semáforo de braço na ponta oeste e o poste de peões na este (config `mapa.semaforos_ponta_oposta`). */
    semaforosPontaOposta: string[];
  };
  /** A camada «Trânsito» (ADR-0034): pontos por veículos medidos, o teto de pontos e a aceleração da velocidade. */
  carros: { veiculosPorPonto: number; pontosMax: number; aceleracao: number };
  /** Os peões da vista 3D (ADR-0041): travessias por figura, o teto por passadeira, o fator do passo e o aspeto das figuras. */
  pessoas: { travessiasPorFigura: number; figurasMax: number; aceleracao: number; aspeto: "neutro" | "variado" };
  /** A pergunta por voz (ADR-0054): as ruas da zona da demo, com os URN dos seus segmentos por sentido. */
  voz: { ruas: RuaVoz[] };
}

const ID_SENSOR = /^[A-Za-z]+:[A-Za-z0-9]+$/;

function exigir(condicao: unknown, campo: string): asserts condicao {
  if (!condicao) throw new Error(`demo.json inválido: ${campo}`);
}

export function validarConfig(c: typeof bruto): ConfigDemo {
  const z = c.zona;
  exigir(ID_SENSOR.test(z.rsu), "zona.rsu");
  exigir(z.passadeiras.length > 0 && z.passadeiras.every((p) => ID_SENSOR.test(p)), "zona.passadeiras");
  exigir(z.passadeiras.includes(z.foco), "zona.foco tem de ser uma das passadeiras");
  const periodo = { inicio: lerInstante(c.periodo.inicio), fim: lerInstante(c.periodo.fim) };
  exigir(periodo.inicio < periodo.fim, "periodo");
  const incidenteInicio = lerInstante(c.incidente_inicio);
  exigir(incidenteInicio >= periodo.inicio && incidenteInicio <= periodo.fim, "incidente_inicio fora do período");
  const verificarDesde = lerInstante(c.verificar_desde);
  exigir(verificarDesde >= periodo.inicio && verificarDesde <= periodo.fim, "verificar_desde fora do período");
  exigir(c.mapa.centro.length === 2 && c.mapa.cobertura_m > 0 && c.mapa.edificio_altura_m > 0, "mapa");
  exigir(Number.isInteger(c.prever.horizonte_h) && c.prever.horizonte_h >= 1, "prever.horizonte_h");
  exigir(c.carros.veiculos_por_ponto > 0 && c.carros.pontos_max > 0 && c.carros.aceleracao > 0, "carros");
  const p = c.pessoas;
  exigir(p.travessias_por_figura > 0 && p.figuras_max > 0 && p.aceleracao > 0, "pessoas");
  exigir(p.aspeto === "neutro" || p.aspeto === "variado", "pessoas.aspeto");
  exigir(c.voz.ruas.length > 0 && c.voz.ruas.every((r) => r.nome && [1, 2].includes(r.sentidos.length) && r.sentidos.every((s) => s.length > 0)), "voz.ruas");
  return {
    zona: z,
    incidenteInicio,
    verificarDesde,
    periodo,
    proteger: { porTravessias: c.proteger.por_travessias, intervaloMin: c.proteger.intervalo_min },
    prever: { horizonteH: c.prever.horizonte_h },
    mapa: {
      tiles: c.mapa.tiles,
      glifos: c.mapa.glifos,
      centro: [c.mapa.centro[0], c.mapa.centro[1]],
      zoom: c.mapa.zoom,
      coberturaM: c.mapa.cobertura_m,
      edificioAlturaM: c.mapa.edificio_altura_m,
      sinaisH7: c.mapa.sinais_h7.map((id) => `urn:ngsi-ld:${id}`),
      semaforosPontaOposta: (c.mapa.semaforos_ponta_oposta ?? []).map((id: string) => `urn:ngsi-ld:${id}`),
    },
    carros: { veiculosPorPonto: c.carros.veiculos_por_ponto, pontosMax: c.carros.pontos_max, aceleracao: c.carros.aceleracao },
    pessoas: { travessiasPorFigura: p.travessias_por_figura, figurasMax: p.figuras_max, aceleracao: p.aceleracao, aspeto: p.aspeto },
    voz: {
      ruas: c.voz.ruas.map((r) => {
        const sentidos = r.sentidos.map((s) => s.map((n) => `urn:ngsi-ld:RoadSegment:${n}`));
        return { nome: r.nome, sentidos, segmentos: sentidos.flat() };
      }),
    },
  };
}

export const config: ConfigDemo = validarConfig(bruto);

/** A API (FastAPI) que serve os Parquet. No `docker compose` é a porta 8000 da máquina. */
export const API_URL: string = (import.meta.env.VITE_API_URL || "http://localhost:8000").replace(/\/$/, "");
