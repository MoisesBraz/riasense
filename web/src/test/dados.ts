/** Amostra pequena dos dados reais da API (17/11/2026), para os testes não dependerem da API a correr. */
import type { AvaliacaoCompletar, AvaliacaoPrever, ProximoSensor } from "../api/recursos";
import type { Falha, HoraLuminosidade, IntervaloProteger, LinhaRisco, PassadeiraMapa, PassadeiraProteger, Previsao, Sensor, SensorVirtual } from "../api/tipos";

const U = "urn:ngsi-ld:";
const RSU30 = `${U}RoadSideUnit:0030`;

const sensor = (id: string, tipo: Sensor["tipo"], rsu: string, nome: string | null, lon: number, lat: number): Sensor => ({
  id: U + id,
  tipo,
  rsu,
  rsus: [rsu],
  nome,
  lon,
  lat,
});

export const SENSORES: Sensor[] = [
  sensor("SmartCrosswalk:0013", "passadeira", `${U}RoadSideUnit:0025`, "Rua Cap. Sousa Pizarro", -8.653297, 40.637188),
  sensor("SmartCrosswalk:0019", "passadeira", RSU30, "Avenida 25 de Abril", -8.64658, 40.63598),
  sensor("SmartCrosswalk:0020", "passadeira", RSU30, "Rua Dom Afonso V", -8.646581, 40.636104),
  sensor("SmartCrosswalk:0021", "passadeira", RSU30, "Avenida 25 de Abril", -8.646825, 40.63614),
  sensor("SmartCrosswalk:0022", "passadeira", RSU30, "Avenida de Oita", -8.646797, 40.635989),
  sensor("RoadSideUnit:0030", "estacionamento", RSU30, null, -8.646285, 40.635689),
  sensor("RoadSegment:11165", "segmento", RSU30, "Rua Dom Afonso V", -8.646533, 40.63614),
  sensor("RoadSegment:11166", "segmento", RSU30, "Rua Dom Afonso V", -8.646533, 40.63614),
  sensor("RoadSegment:10962", "segmento", RSU30, "Avenida 25 de Abril", -8.6468, 40.6359),
  sensor("TouristZone:0004", "zona", `${U}RoadSideUnit:0006`, "Av. Lourenço Peixinho", -8.652248, 40.642015),
];

const falha = (s: string, tipo_sensor: Falha["tipo_sensor"], inicio: string, fim: string, duracao_h: number, tipo: Falha["tipo"], grupo: number, rsu = RSU30, em_curso = true): Falha => ({
  sensor: U + s,
  tipo_sensor,
  rsu,
  inicio,
  fim,
  duracao_h,
  em_curso,
  tipo,
  grupo,
});

/** O incidente de rede da RSU0030 (7 falhas, grupo 3) e falhas de dispositivo, como em `/vigiar/falhas`. */
export const FALHAS: Falha[] = [
  falha("SmartCrosswalk:0019", "passadeira", "2026-11-04T20:06:29", "2026-11-10T11:00:00", 134.89, "rede", 3),
  falha("SmartCrosswalk:0020", "passadeira", "2026-11-04T20:07:25", "2026-11-10T11:00:00", 134.88, "rede", 3),
  falha("SmartCrosswalk:0021", "passadeira", "2026-11-04T20:06:25", "2026-11-10T11:00:00", 134.89, "rede", 3),
  falha("SmartCrosswalk:0022", "passadeira", "2026-11-04T20:07:25", "2026-11-10T11:00:00", 134.88, "rede", 3),
  falha("RoadSideUnit:0030", "estacionamento", "2026-11-04T20:07:23", "2026-11-10T11:00:00", 134.88, "rede", 3),
  falha("RoadSegment:11165", "segmento", "2026-11-04T20:16:30.750000", "2026-11-10T11:00:00", 134.72, "rede", 3),
  falha("RoadSegment:11166", "segmento", "2026-11-04T20:09:56.060000", "2026-11-10T11:00:00", 134.83, "rede", 3),
  falha("RoadSegment:10962", "segmento", "2026-11-05T18:31:24.860000", "2026-11-10T11:00:00", 112.48, "dispositivo", 5),
  falha("RoadSegment:10566", "segmento", "2026-11-04T12:47:11.170000", "2026-11-04T14:59:32.200000", 2.21, "dispositivo", 2, `${U}RoadSideUnit:0006`, false),
  falha("TouristZone:0006", "zona", "2026-11-09T03:28:36.943000", "2026-11-09T05:49:00.236000", 2.34, "dispositivo", 12, `${U}RoadSideUnit:0006`, false),
];

const virtual = (t: string, estimativa: number, inf: number, sup: number, fim_de_semana = false): SensorVirtual => ({
  id: `${U}SmartCrosswalk:0020`,
  tipo: "passadeira",
  grandeza: "travessias",
  t,
  estimativa,
  inf,
  sup,
  estimado: true,
  fim_de_semana,
  erro_esperado: fim_de_semana ? 0.5234 : 0.3216,
  vizinhos: ["SmartCrosswalk:0024", "SmartCrosswalk:0023", "SmartCrosswalk:0007", "SmartCrosswalk:0008", "SmartCrosswalk:0010"].map((v) => U + v),
});

/** Primeiras horas do sensor virtual da SC0020 e duas horas de sábado. */
export const VIRTUAIS: SensorVirtual[] = [
  virtual("2026-11-04T20:00:00", 2.9, 1.4, 6.6),
  virtual("2026-11-04T21:00:00", 7.1, 3.6, 15.6),
  virtual("2026-11-04T22:00:00", 0.8, 0.4, 1.8),
  virtual("2026-11-07T13:00:00", 40.2, 12.1, 96.5, true),
  virtual("2026-11-07T14:00:00", 31.0, 9.3, 74.4, true),
];

const intervalo = (t: string, travessias: number): IntervaloProteger => ({
  passadeira: `${U}SmartCrosswalk:0020`,
  t,
  travessias,
  veiculos: 400,
  vel_media_ms: 5.4,
  pct_acima_limite: 20,
});

/** Travessias medidas da SC0020 antes da falha (intervalos de 15 min). */
export const INTERVALOS: IntervaloProteger[] = [
  intervalo("2026-11-04T18:00:00", 10),
  intervalo("2026-11-04T18:15:00", 12),
  intervalo("2026-11-04T18:30:00", 8),
  intervalo("2026-11-04T18:45:00", 9),
  intervalo("2026-11-04T19:00:00", 6),
  intervalo("2026-11-04T19:15:00", 5),
];

const protegida = (id: string, efeito: number, inf: number, sup: number, abranda: boolean, assinalada: boolean, mov: number, calmos: number, n = 116, semaforo = false): PassadeiraProteger => ({
  id: U + id,
  n_intervalos: n,
  travessias_media: 10,
  efeito_kmh: efeito,
  ic_inf: inf,
  ic_sup: sup,
  abranda,
  placebo: `${U}SmartCrosswalk:0014`,
  placebo_efeito_kmh: 1.1,
  placebo_ic_inf: -0.227,
  placebo_ic_sup: 2.428,
  assinalada,
  pct_acima_limite_movimentados: mov,
  pct_acima_limite_calmos: calmos,
  semaforo,
});

export const PROTEGER: PassadeiraProteger[] = [
  protegida("SmartCrosswalk:0001", -0.825, -0.954, -0.697, true, false, 0.96, 7.5),
  protegida("SmartCrosswalk:0013", -0.0997, -0.2317, 0.0322, false, false, 0.5, 1.19, 610, true),
  protegida("SmartCrosswalk:0019", -0.2199, -0.4048, -0.035, true, false, 22.76, 36.93),
  protegida("SmartCrosswalk:0020", -0.2122, -0.4491, 0.0248, false, false, 22.98, 32.98, 116, true),
  protegida("SmartCrosswalk:0021", -0.3145, -0.6957, 0.0668, false, true, 23.55, 35.33),
  protegida("SmartCrosswalk:0022", -0.3814, -1.1611, 0.3983, false, false, 23.77, 34.05),
];

const previsao = (id: string, t: string, tipo: Previsao["tipo"], p: number, ref: number | null, real: number | null): Previsao => ({
  horizonte_h: 3,
  id: U + id,
  t,
  tipo,
  previsao: p,
  referencia: ref,
  real,
});

/** Período de teste da ③ (08/11 às 11h a 10/11 às 11h): só dois segmentos da RSU0030 e uma passadeira de fora. */
export const PREVISOES: Previsao[] = [
  previsao("RoadSegment:11165", "2026-11-08T11:00:00", "segmento", 400, 450, 420),
  previsao("RoadSegment:10962", "2026-11-08T11:00:00", "segmento", 300, 280, 310),
  previsao("SmartCrosswalk:0013", "2026-11-08T11:00:00", "passadeira", 28, 25, 17),
  previsao("RoadSegment:11165", "2026-11-10T11:00:00", "segmento", 380, 400, null),
];

const risco = (id: string, r: number, expPct: number, compPct: number | null, estimado: boolean, assinalada: boolean): LinhaRisco => ({
  id: U + id,
  t: "2026-11-04T20:00:00",
  risco_potencial: r,
  exposicao: estimado ? 2.86 : 40,
  exposicao_pct: expPct,
  comportamento_kmh: -0.21,
  comportamento_pct: compPct,
  previsao: null,
  previsao_pct: null,
  previsao_disponivel: false,
  confianca: estimado ? "estimado" : "medido",
  estimado,
  assinalada,
  semaforo: compPct === null,
  pct_acima_limite_movimentados: 22.98,
  lon: null,
  lat: null,
});

/** Risco potencial às 20h de 04/11 (as passadeiras da zona já estão estimadas pela ②; a 0013 e a 0020 têm semáforo). */
export const RISCO: LinhaRisco[] = [
  risco("SmartCrosswalk:0013", 0.84, 0.84, null, false, false),
  risco("SmartCrosswalk:0019", 0.75, 0.6, 0.9, true, false),
  risco("SmartCrosswalk:0020", 0.57, 0.57, null, true, false),
  risco("SmartCrosswalk:0021", 0.49, 0.2, 0.78, true, true),
  risco("SmartCrosswalk:0022", 0.19, 0.1, 0.28, true, false),
];

/** Luminosidade (ADR-0018): a falha da demo começa às escuras, às 20h de 04/11. */
export const LUMINOSIDADE: HoraLuminosidade[] = [
  { t: "2026-11-04T07:00:00", elevacao_graus: -0.9, luminosidade: "crepusculo" },
  { t: "2026-11-04T12:00:00", elevacao_graus: 33.5, luminosidade: "dia" },
  { t: "2026-11-04T20:00:00", elevacao_graus: -28.1, luminosidade: "noite" },
];

/** Ranking do próximo sensor (ADR-0015), como em `/completar/proximo-sensor`. */
export const PROXIMO_SENSOR: ProximoSensor[] = [
  { id: `${U}SmartCrosswalk:0016`, tipo: "passadeira", ordem: 1, motivo: "ranking", erro: 0.701, mediana_tipo: 0.357, reducao_potencial: 0.344, vizinho_m: 120.7, queda_diaria: -1.7, frase: "Os 5 vizinhos explicam mal este local: erro 0,70 contra 0,36 da mediana das passadeiras; vizinho mais próximo a 121 m. Redução potencial estimada: 0,34 (hipótese: com um 2.º sensor perto, ficaria como o sensor típico; só se valida instalando-o). Atenção: a atividade subiu 2,7 vezes face às outras passadeiras entre 07 e 09/11; o erro pode vir dessa mudança do próprio sensor.", lon: null, lat: null },
  { id: `${U}SmartCrosswalk:0024`, tipo: "passadeira", ordem: 2, motivo: "ranking", erro: 0.64, mediana_tipo: 0.357, reducao_potencial: 0.282, vizinho_m: 10.3, queda_diaria: 0.08, frase: "Os 5 vizinhos explicam mal este local: erro 0,64 contra 0,36.", lon: null, lat: null },
  { id: `${U}TouristZone:0011`, tipo: "zona", ordem: 1, motivo: "ranking", erro: 0.441, mediana_tipo: 0.277, reducao_potencial: 0.164, vizinho_m: 509.8, queda_diaria: 0.11, frase: "Nas zonas, o erro sobe com a distância aos vizinhos.", lon: null, lat: null },
  { id: `${U}SmartCrosswalk:0023`, tipo: "passadeira", ordem: null, motivo: "verificar o sensor", erro: 5.8, mediana_tipo: 0.357, reducao_potencial: null, vizinho_m: 10.3, queda_diaria: 0.85, frase: "Verificar o sensor: a média diária caiu 85% sem o sensor se calar.", lon: null, lat: null },
];

export const AVALIACAO_COMPLETAR: AvaliacaoCompletar[] = [
  { cenario: "deixar_um_de_fora", tipo: "passadeira", modelo: "razao", dias: "todos", erro_mediano: 0.357, n_sensores: 20 },
  { cenario: "deixar_um_de_fora", tipo: "passadeira", modelo: "referencia", dias: "todos", erro_mediano: 0.617, n_sensores: 20 },
];

/** `avaliacao_prever` (ADR-0027): um tipo por horizonte, com a referência e a persistência. */
export const AVALIACAO_PREVER: AvaliacaoPrever[] = [
  // A 1 h só se avalia (ADR-0027, ponto 3): a persistência ganha nas passadeiras, e o painel não a mostra.
  { horizonte_h: 1, tipo: "passadeira", n_sensores: 20, erro_referencia: 0.617, erro_persistencia: 0.416, erro_sem_meteo: 0.418, erro_com_meteo: 0.462, meteo_melhora: false, ganha: false, sensores_ganha: 12 },
  { horizonte_h: 3, tipo: "passadeira", n_sensores: 20, erro_referencia: 0.617, erro_persistencia: 0.72, erro_sem_meteo: 0.557, erro_com_meteo: 0.568, meteo_melhora: false, ganha: true, sensores_ganha: 18 },
  { horizonte_h: 6, tipo: "zona", n_sensores: 11, erro_referencia: 0.677, erro_persistencia: 1.287, erro_sem_meteo: 0.505, erro_com_meteo: 0.524, meteo_melhora: false, ganha: true, sensores_ganha: 10 },
];

/** Os polígonos de duas passadeiras da RSU0030, como em `GET /mapa/passadeiras` (ADR-0038): 10 m de travessia por 3 m. */
const poligono = (lon: number, lat: number): [number, number][] => {
  const [dx, dy] = [5 / 84_400, 1.5 / 110_574];
  return [[lon - dx, lat - dy], [lon + dx, lat - dy], [lon + dx, lat + dy], [lon - dx, lat + dy], [lon - dx, lat - dy]];
};
export const PASSADEIRAS_MAPA: PassadeiraMapa[] = ["0019", "0020"].map((n, i) => ({
  type: "Feature",
  id: `${U}SmartCrosswalk:${n}`,
  properties: { id: `${U}SmartCrosswalk:${n}`, crosswalk: `${U}Crosswalk:${n}`, nome: i ? "Rua Dom Afonso V" : "Avenida 25 de Abril", rsu: RSU30 },
  geometry: { type: "Polygon", coordinates: [poligono(-8.64658 - i * 0.0001, 40.63598 + i * 0.0001)] },
}));
