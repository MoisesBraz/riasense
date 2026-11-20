/** Um hook por endpoint da API (api/README.md), com os filtros que a demo usa. */
import { config } from "../config";
import { useEffect, useState } from "react";
import { API_URL } from "../config";
import type { Deslocamentos, EstadoLugar, LugarGeo } from "../dominio/avenida";
import type { EdificiosMedidos } from "../componentes/mapa/estilo";
import type { MaximosCalor } from "../dominio/calor";
import { prepararSegmentos, type PassagemHora, type SegmentoCarros } from "../dominio/carros";
import { urn } from "../dominio/formato";
import { isoParaApi } from "../dominio/tempo";
import type {
  Boletim,
  Falha,
  HoraLuminosidade,
  PassadeiraMapa,
  IntervaloProteger,
  LinhaRisco,
  PassadeiraProteger,
  Previsao,
  Sensor,
  SensorVirtual,
} from "./tipos";
import { useRecurso } from "./useRecurso";

export const useSensores = () => useRecurso<Sensor>("/sensores");
export const useFalhas = () => useRecurso<Falha>("/vigiar/falhas");
export const useSensoresVirtuais = () => useRecurso<SensorVirtual>("/completar/sensores-virtuais");
export const usePassadeirasProteger = () => useRecurso<PassadeiraProteger>("/proteger/passadeiras");
export const useBoletim = () => useRecurso<Boletim>("/proteger/boletim");
/** Risco potencial de uma hora (as 24 passadeiras): pede-se hora a hora, e não a semana toda (3 936 linhas). */
export const useRiscoPotencial = (hora: number) =>
  useRecurso<LinhaRisco>("/proteger/risco-potencial", { desde: isoParaApi(hora), ate: isoParaApi(hora) });

/** As passagens medidas numa hora, por segmento com câmara ou radar (ADR-0034): pedem-se hora a hora. */
export const useCarros = (hora: number) =>
  useRecurso<PassagemHora>("/mapa/carros", { desde: isoParaApi(hora), ate: isoParaApi(hora) });

/**
 * A geometria dos 194 segmentos com câmara ou radar (`/mapa/segmentos-carros`), já com os comprimentos. É um GeoJSON e
 * não uma tabela: pede-se uma vez por sessão; sem a API ou sem `riasense carros`, fica vazia e não há carros.
 */
let pedidoSegmentos: Promise<SegmentoCarros[]> | null = null;
export function useSegmentosCarros(): SegmentoCarros[] {
  const [segmentos, setSegmentos] = useState<SegmentoCarros[]>([]);
  useEffect(() => {
    let ativo = true;
    pedidoSegmentos ??= fetch(`${API_URL}/mapa/segmentos-carros`)
      .then((r) => (r.ok ? r.json() : { features: [] }))
      .then(prepararSegmentos)
      .catch(() => {
        pedidoSegmentos = null; // tenta de novo na próxima montagem
        return [];
      });
    pedidoSegmentos.then((s) => ativo && setSegmentos(s));
    return () => {
      ativo = false;
    };
  }, []);
  return segmentos;
}

/**
 * A avenida da demo (ADR-0044): o asfalto, as linhas, os passeios e os lugares com sensor (GeoJSON), e o desvio dos carros para
 * o centro do seu sentido. Pedem-se uma vez por sessão; sem a API ou sem `riasense avenida`, ficam nulos e o mapa fica como antes.
 */
export interface Avenida {
  estrada: ColecaoGeo;
  faixas: ColecaoGeo;
  passeios: ColecaoGeo;
  lugares: { type: "FeatureCollection"; features: LugarGeo[] };
  deslocamentos: Deslocamentos;
}
type ColecaoGeo = { type: "FeatureCollection"; features: unknown[] };
let pedidoAvenida: Promise<Avenida | null> | null = null;
export function useAvenida(): Avenida | null {
  const [avenida, setAvenida] = useState<Avenida | null>(null);
  useEffect(() => {
    let ativo = true;
    const json = (caminho: string) => fetch(`${API_URL}${caminho}`).then((r) => (r.ok ? r.json() : Promise.reject(new Error(caminho))));
    pedidoAvenida ??= Promise.all([
      json("/mapa/avenida/estrada"),
      json("/mapa/avenida/faixas"),
      json("/mapa/avenida/passeios"),
      json("/mapa/avenida/lugares"),
      json("/mapa/avenida/deslocamentos"),
    ])
      .then(([estrada, faixas, passeios, lugares, deslocamentos]) => ({ estrada, faixas, passeios, lugares, deslocamentos }))
      .catch(() => {
        pedidoAvenida = null; // tenta de novo na próxima montagem
        return null;
      });
    pedidoAvenida.then((a) => ativo && setAvenida(a));
    return () => {
      ativo = false;
    };
  }, []);
  return avenida;
}

/** O estado de cada lugar com sensor do corredor numa hora (ADR-0044): ocupado, livre ou desconhecido. */
export const useLugaresDaHora = (hora: number) =>
  useRecurso<{ lugar: string; t: string; estado: EstadoLugar }>("/mapa/avenida/lugares-hora", { desde: isoParaApi(hora), ate: isoParaApi(hora) });

/** Travessias reais de uma passadeira, por intervalo de 15 min: a parte medida da série da ②. */
export const useIntervalos = (sensor: string) =>
  useRecurso<IntervaloProteger>("/proteger/intervalos", { sensor: urn(sensor) });

/** As travessias medidas de todas as passadeiras numa hora (os 4 intervalos de 15 min), para os peões da vista 3D (ADR-0041). */
export const useTravessiasDaHora = (hora: number) =>
  useRecurso<IntervaloProteger>("/proteger/intervalos", { desde: isoParaApi(hora), ate: isoParaApi(hora + 45 * 60_000) });

/** As 164 horas da semana, com dia, crepúsculo ou noite (ADR-0018): poucas linhas, pedem-se todas. */
export const useLuminosidade = () => useRecurso<HoraLuminosidade>("/contexto/luminosidade");
/** As passadeiras com a forma real (ADR-0038): um polígono por passadeira, para o mapa. */
export const usePassadeirasMapa = () => useRecurso<PassadeiraMapa>("/mapa/passadeiras");

/**
 * A ③ no horizonte principal (ADR-0027): são poucas linhas (o período de teste e as horas a seguir) e o mapa
 * precisa de todas as passadeiras. Os outros horizontes ficam na avaliação.
 */
export const usePrevisoes = () => useRecurso<Previsao>("/prever/previsoes", { horizonte_h: config.prever.horizonteH });

/** Endpoints que a API pode ainda não ter: nesse caso o cliente devolve «por calcular». */
export const useAvaliacaoCompletar = () => useRecurso<AvaliacaoCompletar>("/completar/avaliacao");
export const useAvaliacaoPrever = () => useRecurso<AvaliacaoPrever>("/prever/avaliacao");
export const useProximoSensor = () => useRecurso<ProximoSensor>("/completar/proximo-sensor");

/** `avaliacao_completar.parquet` */
export interface AvaliacaoCompletar {
  cenario: string; // deixar_um_de_fora | simulacao
  tipo: string;
  modelo: string; // razao | referencia | ridge | lightgbm | razao_soma
  dias: string; // todos | semana | fim_de_semana
  erro_mediano: number;
  n_sensores: number;
}

/** `avaliacao_prever.parquet` */
export interface AvaliacaoPrever {
  horizonte_h: number;
  tipo: string;
  n_sensores: number;
  erro_referencia: number;
  erro_persistencia: number; // o valor de há horizonte_h horas (ADR-0027)
  erro_sem_meteo: number;
  erro_com_meteo: number;
  meteo_melhora: boolean;
  ganha: boolean;
  sensores_ganha: number;
}

/** Ranking «onde pôr o próximo sensor» */
export interface ProximoSensor {
  id: string;
  tipo: string;
  ordem: number | null; // null na lista «verificar o sensor»
  motivo: string; // ranking | verificar o sensor
  erro: number | null;
  mediana_tipo: number | null;
  reducao_potencial: number | null;
  vizinho_m: number | null;
  queda_diaria: number | null;
  frase: string;
  lon: number | null;
  lat: number | null;
}

/**
 * Os edifícios da zona da demo com a altura medida pelo LiDAR da DGT (ADR-0050). Pede-se uma vez por sessão; sem a API, fica nulo
 * e o mapa fica com as alturas de hoje.
 */
let pedidoEdificios: Promise<EdificiosMedidos | null> | null = null;
export function useEdificiosMedidos(): EdificiosMedidos | null {
  const [edificios, setEdificios] = useState<EdificiosMedidos | null>(null);
  useEffect(() => {
    let ativo = true;
    pedidoEdificios ??= fetch(`${API_URL}/mapa/edificios-medidos`)
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(String(r.status)))))
      .then((geo: { type: "FeatureCollection"; features: { properties: { id: number } }[] }) => ({ geo, ids: geo.features.map((f) => f.properties.id) }))
      .catch(() => {
        pedidoEdificios = null;
        return null;
      });
    pedidoEdificios.then((e) => ativo && setEdificios(e));
    return () => {
      ativo = false;
    };
  }, []);
  return edificios;
}

/** As visitas medidas por zona turística numa hora (ADR-0047): pedem-se hora a hora. */
export const useZonasDaHora = (hora: number) =>
  useRecurso<{ id: string; t: string; visitas: number }>("/mapa/zonas-hora", { desde: isoParaApi(hora), ate: isoParaApi(hora) });

/** Os máximos da semana de cada tipo, para a escala fixa dos mapas de calor (ADR-0047, ponto 4). Pedem-se uma vez. */
let pedidoMaximos: Promise<MaximosCalor | null> | null = null;
export function useMaximosCalor(): MaximosCalor | null {
  const [maximos, setMaximos] = useState<MaximosCalor | null>(null);
  useEffect(() => {
    let ativo = true;
    pedidoMaximos ??= fetch(`${API_URL}/mapa/calor/maximos`)
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(String(r.status)))))
      .catch(() => {
        pedidoMaximos = null;
        return null;
      });
    pedidoMaximos.then((m) => ativo && setMaximos(m));
    return () => {
      ativo = false;
    };
  }, []);
  return maximos;
}
