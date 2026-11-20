/** Linhas da API (api/README.md). Os nomes das colunas são os dos Parquet de data/processed/. */

export type TipoSensor = "passadeira" | "zona" | "segmento" | "estacionamento";

export interface Sensor {
  id: string;
  tipo: TipoSensor;
  rsu: string | null;
  rsus: string[] | null;
  nome: string | null;
  lon: number | null;
  lat: number | null;
}

/** O polígono de uma passadeira, do `Crosswalk.csv` do Living Lab, ligado ao sensor (ADR-0038). */
export interface PassadeiraMapa {
  type: "Feature";
  id: string;
  /** `id` é o URN do sensor `SmartCrosswalk`; `nome` é a rua (nula se o Living Lab não a diz) e `rsu` a que observa. */
  properties: { id: string; crosswalk: string; nome: string | null; rsu: string | null };
  geometry: { type: "Polygon"; coordinates: [number, number][][] } | { type: "MultiPolygon"; coordinates: [number, number][][][] };
}

/** ① Falha inesperada. `grupo` junta as falhas do mesmo incidente; `tipo` diz se foi da rede ou do dispositivo. */
export interface Falha {
  sensor: string;
  tipo_sensor: TipoSensor;
  rsu: string | null;
  inicio: string;
  fim: string;
  duracao_h: number;
  em_curso: boolean;
  tipo: "rede" | "dispositivo";
  grupo: number;
}

/** ② Hora estimada por um sensor virtual, com o intervalo de 80 %. */
export interface SensorVirtual {
  id: string;
  tipo: TipoSensor;
  grandeza: string;
  t: string;
  estimativa: number;
  inf: number;
  sup: number;
  estimado: boolean;
  fim_de_semana: boolean;
  erro_esperado: number;
  vizinhos: string[];
}

/** ③ Previsão a `horizonte_h` horas, com a referência «mesma hora, dia anterior» e o real (nulo depois dos dados). */
export interface Previsao {
  horizonte_h: number;
  id: string;
  t: string;
  tipo: TipoSensor;
  previsao: number;
  referencia: number | null;
  real: number | null;
}

/** ④ Abrandamento por passadeira: efeito em km/h por +N travessias, com IC 95 % e placebo. */
export interface PassadeiraProteger {
  id: string;
  n_intervalos: number;
  travessias_media: number;
  efeito_kmh: number;
  ic_inf: number;
  ic_sup: number;
  abranda: boolean;
  placebo: string;
  placebo_efeito_kmh: number;
  placebo_ic_inf: number;
  placebo_ic_sup: number;
  assinalada: boolean;
  pct_acima_limite_movimentados: number;
  pct_acima_limite_calmos: number;
  /** Semáforo no OpenStreetMap (ADR-0019): o efeito calcula-se, mas não se assinala (ADR-0024). */
  semaforo: boolean;
}

/** Luminosidade de uma hora pela posição do sol (ADR-0018): contexto, fora do risco potencial. */
export interface HoraLuminosidade {
  t: string;
  elevacao_graus: number;
  luminosidade: "dia" | "crepusculo" | "noite";
}

/** ④ Intervalo de 15 min de uma passadeira: as travessias são contagens reais do sensor. */
export interface IntervaloProteger {
  passadeira: string;
  t: string;
  travessias: number;
  veiculos: number;
  vel_media_ms: number;
  pct_acima_limite: number;
}

/**
 * Mapa de risco potencial (ADR-0013), por passadeira e hora. O risco potencial e as componentes vão de 0 a 1
 * (percentis); a fiabilidade do dado (`confianca`) não entra na soma e mostra-se à parte.
 */
export interface LinhaRisco {
  id: string;
  t: string;
  risco_potencial: number;
  exposicao: number;
  exposicao_pct: number;
  comportamento_kmh: number;
  /** Nulo nas passadeiras com semáforo: o comportamento «não se aplica» e não entra na soma (ADR-0024). */
  comportamento_pct: number | null;
  previsao: number | null;
  previsao_pct: number | null;
  previsao_disponivel: boolean;
  confianca: "medido" | "estimado";
  estimado: boolean;
  assinalada: boolean;
  semaforo: boolean;
  pct_acima_limite_movimentados: number;
  lon: number | null;
  lat: number | null;
}

/** ④ O boletim de segurança pedonal para a Câmara (ADR-0052), de `/proteger/boletim`. */
export interface Boletim {
  /** As 3 passadeiras com maior risco potencial médio na semana; o empate desfaz-se pelo id. */
  top: { id: string; risco_medio: number; horas_medidas: number; horas: number; semaforo: boolean }[];
  /** A zona das passadeiras da demo: o menor e o maior das passadeiras (% de veículos acima do limite da via). */
  zona: {
    passadeiras: string[];
    com_dados: number;
    acima_limite_movimentados: [number, number];
    acima_limite_calmos: [number, number];
    /** Os segmentos medidos pelo radar que entram na zona, e em quantas passadeiras entra cada um. */
    radar: { segmento: string; passadeiras: number }[];
  };
  semaforos: string[];
}
