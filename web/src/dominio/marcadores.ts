/**
 * Que marcador leva cada sensor no mapa, por separador. É uma função pura para se testar sem WebGL:
 * o componente do mapa só a desenha.
 *
 * Só há pontos com sensor (ADR-0007): as 24 passadeiras e a RSU da zona. A RSU desenha-se na posição do
 * estacionamento que a API identifica com o URN da própria RSU.
 *
 * Cores, ícones e formas fixos (ADR-0033, ponto 1): no Vigiar e no Completar, o marcador diz o estado de saúde do sensor
 * (ativo, atenção, falha de rede, falha de dispositivo, estimado). No Prever e no Proteger mostra o resultado, sem verde
 * nem vermelho (ponto 2). O ícone do tipo (passadeira, zona, RSU) vale em todos os separadores.
 */
import type { Falha, LinhaRisco, PassadeiraProteger, Sensor } from "../api/tipos";
import type { EstadoDemo, Separador } from "../estado/estado";
import { camadaLigada } from "../estado/estado";
import { rotuloSensor } from "./formato";
import { nivelDoRisco } from "./risco";
import { falhaNaHora } from "./vigiar";

/** Os dois tipos da falha inesperada (ADR-0025): vários sensores da mesma RSU juntos, ou um só sensor. */
export type TipoDaFalha = "rede" | "dispositivo";

/** Estado de saúde de um sensor (GLOSSARY: Ativo, Atenção, Falha inesperada, Estimado), com a falha em dois (ADR-0033). */
export type EstadoSensor = "ativo" | "atencao" | "falha-rede" | "falha-dispositivo" | "estimado";

export type TipoMarcador = EstadoSensor | "neutro" | "assinalada" | "risco" | "proximo" | "rsu" | "rsu-falha";

export const NOME_DO_ESTADO: Record<EstadoSensor, string> = {
  ativo: "Ativo",
  atencao: "Atenção",
  "falha-rede": "Falha de rede",
  "falha-dispositivo": "Falha de dispositivo",
  estimado: "Estimado",
};

/** O estado da falha de cada tipo. */
/** O raio do anel da falha de rede à volta da RSU, em px. */
export const RAIO_FALHA_RSU = 56;
export const ESTADO_DA_FALHA: Record<TipoDaFalha, EstadoSensor> = { rede: "falha-rede", dispositivo: "falha-dispositivo" };

/** O ícone do tipo de sensor (ADR-0033): o mesmo em todos os separadores. */
export type EspecieDoSensor = "passadeira" | "zona" | "rsu" | "segmento" | "estacionamento";

export interface Marcador {
  id: string;
  lon: number;
  lat: number;
  tipo: TipoMarcador;
  rotulo: string;
  /** Lado do rótulo: para fora da zona, para os 4 rótulos das passadeiras não se taparem. */
  lado: "esquerda" | "direita";
  daZona: boolean;
  selecionado: boolean;
  /** Halo: a falha de rede à volta da RSU, a incerteza do estimado, ou a previsão (raio ∝ √valor). */
  halo?: { tipo: "falha" | "estimado" | "previsao"; raio: number };
  /** Mapa de risco potencial: o degrau (1 a 5) e se o ponto é estimado (tracejado, confiança menor). */
  risco?: { nivel: number; estimado: boolean };
  /** Estimado fora do Vigiar e do Completar: tracejado, mas na cor do resultado e não a vermelho (ADR-0033, ponto 2). */
  tracejado?: boolean;
  /** «Onde pôr o próximo sensor»: a posição no ranking (1, 2, 3…). */
  posicao?: number;
  /** O tipo de sensor: o marcador mostra o seu ícone em todos os separadores. */
  especie?: EspecieDoSensor;
  /** O nome só aparece ao passar o rato ou ao selecionar (as passadeiras fora da zona do ① Vigiar, como na app do Living Lab). */
  nomeAPedido?: boolean;
  /** O tipo da falha de um sensor estimado: o tracejado e o halo levam a cor dessa falha (vermelho ou magenta). */
  falha?: TipoDaFalha;
}

/**
 * O que o leitor de ecrã ouve: o rótulo e o estado, por extenso, porque o marcador só o mostra pela cor e pela forma.
 * O degrau do risco potencial já mostra o número; ouve-se «risco potencial N de 5».
 */
export function rotuloAcessivel(m: Marcador): string {
  if (m.risco) return `${m.rotulo} · risco potencial ${m.risco.nivel} de 5`;
  if (m.tipo === "proximo") return `${m.posicao}.º · ${m.rotulo} · onde pôr o próximo sensor`;
  if (m.tipo === "ativo" || m.tipo === "atencao" || m.tipo === "falha-rede" || m.tipo === "falha-dispositivo") {
    return `${m.rotulo} · ${NOME_DO_ESTADO[m.tipo]}`;
  }
  if (m.tipo === "estimado") return m.falha ? `${m.rotulo} · em ${NOME_DO_ESTADO[ESTADO_DA_FALHA[m.falha]].toLowerCase()}` : m.rotulo;
  return m.rotulo;
}

export interface DadosMarcadores {
  sensores: Sensor[];
  falhas?: Falha[];
  estimados?: Set<string>;
  previsoes?: Map<string, number>;
  proteger?: Map<string, PassadeiraProteger>;
  /** Risco potencial da hora do cursor, por passadeira. */
  risco?: Map<string, LinhaRisco>;
  /** Sensores em «verificar o sensor» a esta hora (só a partir do dia em que se mede a queda). */
  atencao?: Set<string>;
  /** «Onde pôr o próximo sensor» ligado: os sítios, já pela ordem (só passadeiras com redução ≥ 0,01). */
  proximo?: { id: string; posicao: number }[];
}

export interface Zona {
  rsu: string;
  passadeiras: Set<string>;
}

/** Caixa [[oeste, sul], [este, norte]] para o mapa enquadrar. */
export type Caixa = [[number, number], [number, number]];

/** A caixa que contém todos os pontos com posição, ou null se não houver nenhum. */
export function caixaDe(pontos: { lon: number | null; lat: number | null }[]): Caixa | null {
  const com = pontos.filter((p) => p.lon !== null && p.lat !== null);
  if (com.length === 0) return null;
  const lons = com.map((p) => p.lon as number);
  const lats = com.map((p) => p.lat as number);
  return [
    [Math.min(...lons), Math.min(...lats)],
    [Math.max(...lons), Math.max(...lats)],
  ];
}

function centroDaZona(sensores: Sensor[], zona: Zona): number | null {
  const lons = sensores.filter((s) => zona.passadeiras.has(s.id) && s.lon !== null).map((s) => s.lon as number);
  return lons.length ? lons.reduce((a, b) => a + b, 0) / lons.length : null;
}

/**
 * O estado de saúde de um sensor à hora do cursor. Com falha e estimado à mesma hora, o Completar mostra o estimado
 * (o sensor virtual dá o valor) e os outros separadores mostram a falha (ADR-0033, ponto 1).
 */
export function estadoDeSaude(separador: Separador, s: { falha: TipoDaFalha | null; estimado: boolean; atencao: boolean }): EstadoSensor {
  if (separador === "completar" && s.estimado) return "estimado";
  if (s.falha) return ESTADO_DA_FALHA[s.falha];
  if (s.estimado) return "estimado";
  return s.atencao ? "atencao" : "ativo";
}

function marcadorDaPassadeira(
  s: Sensor,
  estado: EstadoDemo,
  dados: DadosMarcadores,
): Pick<Marcador, "tipo" | "rotulo" | "halo" | "risco" | "tracejado" | "falha"> {
  const rotulo = rotuloSensor(s.id);
  const lig = (c: Parameters<typeof camadaLigada>[1]) => camadaLigada(estado, c);
  const estimado = dados.estimados?.has(s.id) ?? false;
  switch (estado.separador) {
    case "vigiar":
    case "completar": {
      const daFalha = dados.falhas ? falhaNaHora(dados.falhas, s.id, estado.hora) : undefined;
      const saude = estadoDeSaude(estado.separador, {
        falha: lig("falhas") && daFalha ? daFalha.tipo : null,
        estimado: estado.separador === "completar" && lig("estimados") && estimado,
        atencao: dados.atencao?.has(s.id) ?? false,
      });
      if (saude === "estimado") {
        // O tracejado leva a cor da falha que se estima (ADR-0033); sem o registo da falha, fica o vermelho da falha de rede.
        return { tipo: "estimado", rotulo: `${rotulo} · estimado`, halo: { tipo: "estimado", raio: 22 }, falha: daFalha?.tipo ?? "rede" };
      }
      return { tipo: saude, rotulo };
    }
    case "prever": {
      const valor = dados.previsoes?.get(s.id);
      if (lig("previsao") && valor !== undefined) {
        return { tipo: "neutro", rotulo, halo: { tipo: "previsao", raio: 12 + 3 * Math.sqrt(Math.max(valor, 0)) } };
      }
      return { tipo: "neutro", rotulo };
    }
    case "proteger": {
      if (estado.vistaProteger === "risco") {
        const linha = dados.risco?.get(s.id);
        if (lig("risco") && linha) {
          const tracejado = lig("estimados") && linha.estimado;
          return {
            tipo: "risco",
            rotulo: tracejado ? `${rotulo} · estimado` : rotulo,
            risco: { nivel: nivelDoRisco(linha.risco_potencial), estimado: tracejado },
          };
        }
        if (lig("estimados") && estimado) return { tipo: "neutro", rotulo: `${rotulo} · estimado`, tracejado: true };
        return { tipo: "neutro", rotulo };
      }
      if (lig("assinaladas") && dados.proteger?.get(s.id)?.assinalada) return { tipo: "assinalada", rotulo: `${rotulo} · assinalada` };
      return { tipo: "neutro", rotulo };
    }
  }
}

export function marcadoresDe(estado: EstadoDemo, dados: DadosMarcadores, zona: Zona): Marcador[] {
  if (!camadaLigada(estado, "sensores")) return [];
  const centro = centroDaZona(dados.sensores, zona);
  const lado = (s: Sensor): Marcador["lado"] =>
    zona.passadeiras.has(s.id) && centro !== null && (s.lon as number) < centro ? "esquerda" : "direita";
  const comPosicao = (s: Sensor) => s.lon !== null && s.lat !== null;
  const selecionado = (id: string) => id === (estado.popup?.id ?? estado.foco);

  // «Onde pôr o próximo sensor» (ADR-0033, ponto 5): só os sítios, numerados, com um alvo neutro.
  if (estado.separador === "completar" && dados.proximo) {
    const porId = new Map(dados.sensores.map((s) => [s.id, s]));
    return dados.proximo.flatMap(({ id, posicao }) => {
      const s = porId.get(id);
      if (!s || !comPosicao(s)) return [];
      const m: Marcador = {
        id,
        lon: s.lon as number,
        lat: s.lat as number,
        tipo: "proximo",
        rotulo: rotuloSensor(id),
        lado: lado(s),
        daZona: true,
        selecionado: selecionado(id),
        posicao,
      };
      return [m];
    });
  }

  // No ① Vigiar e no ② Completar, todos os sensores com posição: as passadeiras e as zonas turísticas.
  const saude = estado.separador === "vigiar" || estado.separador === "completar";
  // Cada ponto mostra o ícone do tipo, em todos os separadores. Os segmentos são troços de rua: aparecem como linhas, e não pontos.
  const vigiar = estado.separador === "vigiar";
  const especie = (s: Sensor): EspecieDoSensor => (s.tipo === "zona" ? "zona" : "passadeira");
  const passadeiras: Marcador[] = dados.sensores
    .filter((s) => (s.tipo === "passadeira" || (vigiar && s.tipo === "zona")) && comPosicao(s))
    .map((s) => ({
      id: s.id,
      lon: s.lon as number,
      lat: s.lat as number,
      lado: lado(s),
      daZona: zona.passadeiras.has(s.id),
      selecionado: selecionado(s.id),
      especie: especie(s),
      nomeAPedido: vigiar,
      ...marcadorDaPassadeira(s, estado, dados),
    }));

  // As RSU: no Vigiar e no Completar, todas as que têm posição (a do estacionamento); nos outros, só a da zona.
  const rsus = dados.sensores.filter((s) => s.id.includes("RoadSideUnit") && comPosicao(s) && (saude || s.id === zona.rsu));
  const vistas = new Set<string>();
  const marcadoresRsu: Marcador[] = rsus.flatMap((rsu) => {
    if (vistas.has(rsu.id)) return [];
    vistas.add(rsu.id);
    const rsuEmFalha =
      saude &&
      camadaLigada(estado, "falhas") &&
      (dados.falhas ?? []).some((f) => f.rsu === rsu.id && f.tipo === "rede" && falhaNaHora([f], f.sensor, estado.hora));
    return [
      {
        id: rsu.id,
        lon: rsu.lon as number,
        lat: rsu.lat as number,
        tipo: rsuEmFalha ? "rsu-falha" : "rsu",
        rotulo: rsuEmFalha ? `${rotuloSensor(rsu.id)} · falha de rede` : rotuloSensor(rsu.id),
        lado: "direita",
        daZona: rsu.id === zona.rsu,
        selecionado: selecionado(rsu.id),
        halo: rsuEmFalha ? { tipo: "falha", raio: RAIO_FALHA_RSU } : undefined,
        especie: "rsu" as const,
        nomeAPedido: vigiar,
      },
    ];
  });
  return [...passadeiras, ...marcadoresRsu];
}
