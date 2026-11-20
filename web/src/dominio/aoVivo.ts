/**
 * O modo «Ao vivo» (ADR-0049) no mapa: as deteções de agora como pontos que andam do retrato anterior para o último durante
 * 1 s, e, na vista 3D, com os modelos de tipo que já existem (ADR-0041). As estações com o ícone da RSU.
 */
import type { DetecaoAoVivo, EstacaoAoVivo, RetratoAoVivo, SensorAoVivo } from "../api/aoVivo";
import type { Sensor } from "../api/tipos";
import { calorDosPeoes, calorDosVeiculos, type ColecaoCalor, type MaximosCalor } from "./calor";
import type { Categoria, PontoCarro, SegmentoCarros, Veiculo3D } from "./carros";
import { rotuloSensor } from "./formato";
import { rotuloHora } from "./tempo";
import type { Marcador } from "./marcadores";
import { nivelDoRisco } from "./risco";
import type { Pessoa3D } from "./peoes";


/** O modelo 3D de cada `classification` (ADR-0041: A mota, B ligeiro, C camião, D autocarro). As outras ficam só como ponto. */
const CATEGORIA_3D: Record<string, Categoria> = {
  motorcycle: "A",
  cyclist: "A",
  lightVruVehicle: "A", // trotinete e afins: o modelo mais próximo é o da bicicleta (ADR-0055)
  passengerCar: "B",
  lightTruck: "C",
  heavyTruck: "C",
  truck: "C",
  bus: "D",
};

const ePeao = (classe: string) => classe === "pedestrian";

/** Um número estável a partir do id: o mesmo peão ou carro fica sempre com o mesmo modelo. */
function semente(id: string): number {
  let h = 0;
  for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) | 0;
  return Math.abs(h);
}

/** O rumo de `a` para `b`, em graus a partir do norte (aproximação plana, chega para 1 s de movimento). */
function rumoEntre(a: [number, number], b: [number, number]): number {
  const dx = (b[0] - a[0]) * Math.cos((a[1] * Math.PI) / 180);
  const dy = b[1] - a[1];
  return ((Math.atan2(dx, dy) * 180) / Math.PI + 360) % 360;
}

export interface PosicaoAoVivo {
  d: DetecaoAoVivo;
  coord: [number, number];
  rumo: number;
}

/**
 * Onde está cada deteção do último retrato no instante `ms` (o relógio do `performance.now()`): a meio caminho entre a
 * posição anterior e a nova durante o intervalo das leituras (1 s); uma deteção nova aparece logo no sítio. Com `parado`
 * (prefers-reduced-motion), salta para a nova.
 */
export function posicoesAoVivo(anterior: RetratoAoVivo | null, atual: RetratoAoVivo, ms: number, parado = false): PosicaoAoVivo[] {
  const f = parado ? 1 : Math.min(1, Math.max(0, (ms - atual.chegada) / atual.intervalo_ms));
  const antes = new Map((anterior?.detecoes ?? []).map((d) => [d.id, d]));
  return atual.detecoes.map((d) => {
    const fim: [number, number] = [d.lon, d.lat];
    const a = antes.get(d.id);
    const inicio: [number, number] = a ? [a.lon, a.lat] : fim;
    const coord: [number, number] = [inicio[0] + (fim[0] - inicio[0]) * f, inicio[1] + (fim[1] - inicio[1]) * f];
    const anda = inicio[0] !== fim[0] || inicio[1] !== fim[1];
    return { d, coord, rumo: d.direcao ?? (anda ? rumoEntre(inicio, fim) : 0) };
  });
}

/** A velocidade em km/h, para o número junto ao ponto (ADR-0039); parado ou sem velocidade, sem número (ADR-0055). */
const kmhDe = (d: DetecaoAoVivo): number | null =>
  !d.parado && d.velocidade !== null && d.velocidade * 3.6 >= 1 ? Math.round(d.velocidade * 3.6) : null;

/**
 * Os pontos do «Ao vivo» (ADR-0055): os peões numa camada própria, por cima; os veículos na cor neutra, com o número da
 * velocidade só nos que circulam; os parados mais discretos. Todos levam `vivo`: só se veem a partir do zoom 16.
 */
export function pontosAoVivo(posicoes: PosicaoAoVivo[]): PontoCarro[] {
  return posicoes.map(({ d, coord }) =>
    ePeao(d.classe)
      ? { coord, kmh: null, acima: false, peao: true, vivo: true }
      : { coord, kmh: kmhDe(d), acima: d.acima === true, vivo: true, ...(d.parado ? { parado: true } : {}) },
  );
}

/** As deteções de veículos sem modelo 3D (o moliceiro, por exemplo): na vista 3D ficam como ponto. */
export function semModeloAoVivo(posicoes: PosicaoAoVivo[]): PontoCarro[] {
  return posicoes
    .filter(({ d }) => !ePeao(d.classe) && !CATEGORIA_3D[d.classe])
    .map(({ d, coord }) => ({ coord, kmh: kmhDe(d), acima: d.acima === true, vivo: true, semModelo: true }));
}

/** Os veículos com modelo 3D (os tipos de `CATEGORIA_3D`). */
export function veiculosAoVivo(posicoes: PosicaoAoVivo[]): Veiculo3D[] {
  const veiculos: Veiculo3D[] = [];
  for (const { d, coord, rumo } of posicoes) {
    const categoria = CATEGORIA_3D[d.classe];
    if (categoria) veiculos.push({ coord, rumo, categoria, kmh: kmhDe(d), acima: d.acima === true, variante: semente(d.id) % 2, vivo: true });
  }
  return veiculos;
}

/** Os peões, com as figuras 3D. */
export function pessoasAoVivo(posicoes: PosicaoAoVivo[]): Pessoa3D[] {
  return posicoes.filter(({ d }) => ePeao(d.classe)).map(({ d, coord, rumo }) => ({ coord, rumo, indice: semente(d.id), andar: true }));
}

/** Um texto preso a um ponto do mapa (a camada de símbolos trata das colisões). */
export interface RotuloNoMapa {
  lon: number;
  lat: number;
  texto: string;
}

/** «1 veículo», «12 veículos», «1 peão», «3 peões». */
export const veiculosPorExtenso = (n: number) => `${n} ${n === 1 ? "veículo" : "veículos"}`;
export const peoesPorExtenso = (n: number) => `${n} ${n === 1 ? "peão" : "peões"}`;

/** Os números de uma estação ativa (ADR-0055): «12 veículos · 3 peões». Sem nada agora, nada (não polui o mapa). */
function contagemDaEstacao(e: EstacaoAoVivo): string | undefined {
  if (!e.ativa || e.veiculos === undefined || e.peoes === undefined || e.veiculos + e.peoes === 0) return undefined;
  return `${veiculosPorExtenso(e.veiculos)} · ${peoesPorExtenso(e.peoes)}`;
}

/** Os números das estações por baixo do ícone (ADR-0055): o mapa só os desenha a partir do zoom 17, e sem se sobreporem. */
export function rotulosAoVivo(estacoes: EstacaoAoVivo[]): RotuloNoMapa[] {
  return estacoes.flatMap((e) => {
    const texto = contagemDaEstacao(e);
    return texto ? [{ lon: e.lon, lat: e.lat, texto }] : [];
  });
}

/**
 * As estações no mapa, só com o ícone da RSU (ADR-0055): as ativas no estado «Ativo», as inativas a cinzento. O nome (o id do
 * Living Lab) só aparece ao passar o rato: são 52, por toda a cidade. Os números de cada uma estão no pop-up, ao clicar.
 */
export function marcadoresAoVivo(estacoes: EstacaoAoVivo[], aberta: string | null = null): Marcador[] {
  return estacoes.map((e) => ({
    id: `ao-vivo:${e.id}`,
    lon: e.lon,
    lat: e.lat,
    tipo: e.ativa ? "ativo" : "neutro",
    rotulo: e.ativa ? e.id : `${e.id} · inativa`,
    lado: "direita",
    daZona: false,
    selecionado: `ao-vivo:${e.id}` === aberta,
    especie: "rsu",
    nomeAPedido: true,
  }));
}

export interface ResumoAoVivo {
  ativas: number;
  total: number;
  peoes: number;
  veiculos: number;
}

export function resumoAoVivo(r: RetratoAoVivo): ResumoAoVivo {
  const peoes = r.detecoes.filter((d) => ePeao(d.classe)).length;
  return { ativas: r.estacoes.filter((e) => e.ativa).length, total: r.estacoes.length, peoes, veiculos: r.detecoes.length - peoes };
}

/** O último dado de uma estação: «há 2 s», «há 3 min», ou «sem deteções agora». */
export function ultimoDado(e: EstacaoAoVivo, recebido: number | null): string {
  if (!e.ativa) return "inativa";
  if (e.ultimo_dado === null || recebido === null) return "sem deteções agora";
  const s = Math.max(0, Math.round((recebido - e.ultimo_dado) / 1000));
  return s < 60 ? `há ${s} s` : `há ${Math.floor(s / 60)} min`;
}

/**
 * As passadeiras no «Ao vivo» (ADR-0055, ponto 6): o ícone da passadeira com o degrau do risco potencial ao vivo (1 a 5, nos
 * degraus da semana gravada), quando a janela já tem número. Clicar abre o pop-up com o agora, o esperado e o risco.
 */
export function marcadoresPassadeirasAoVivo(vivos: SensorAoVivo[], posicoes: Sensor[], aberta: string | null = null): Marcador[] {
  const porId = new Map(posicoes.map((p) => [p.id, p]));
  return vivos.flatMap((s) => {
    const p = porId.get(s.id);
    if (s.tipo !== "passadeira" || !p || p.lon === null || p.lat === null) return [];
    const marcador: Marcador = {
      id: s.id,
      lon: p.lon,
      lat: p.lat,
      tipo: "ativo",
      rotulo: rotuloSensor(s.id),
      lado: "direita",
      daZona: false,
      selecionado: s.id === aberta,
      especie: "passadeira",
      nomeAPedido: true,
      ...(s.risco && s.coberto !== false ? { risco: { nivel: nivelDoRisco(s.risco.valor), estimado: false } } : {}),
    };
    return [marcador];
  });
}

/** «12», «3,5», «—»: o número de um sensor ao vivo, sem casas a mais. */
export const numeroAoVivo = (x: number | null | undefined): string =>
  x === null || x === undefined ? "—" : x >= 10 ? String(Math.round(x)) : x.toFixed(1).replace(".", ",").replace(",0", "");

const DIA_EN = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

/**
 * A hora da semana gravada com o mesmo dia da semana e a mesma hora que `agora` em Lisboa (ADR-0055, ponto 4): no «Ao vivo», a
 * ② e a ③ mostram essa hora. A semana gravada está em UTC, que em novembro é a hora de Lisboa. Se a hora não existir na semana
 * (faltam 4 h à terça-feira), fica a mais próxima do mesmo dia.
 */
export function horaDaSemanaGravada(agora: Date, horas: number[]): number | null {
  const partes = new Intl.DateTimeFormat("en-GB", { timeZone: "Europe/Lisbon", weekday: "short", hour: "2-digit", hourCycle: "h23" }).formatToParts(agora);
  const dia = DIA_EN.indexOf(partes.find((p) => p.type === "weekday")?.value ?? "");
  const hora = Number(partes.find((p) => p.type === "hour")?.value);
  const doDia = horas.filter((h) => new Date(h).getUTCDay() === dia);
  if (doDia.length === 0) return horas[0] ?? null;
  return doDia.reduce((melhor, h) =>
    Math.abs(new Date(h).getUTCHours() - hora) < Math.abs(new Date(melhor).getUTCHours() - hora) ? h : melhor,
  );
}

/** «semana gravada · qui 05/11 às 23h»: a etiqueta da ② e da ③ no «Ao vivo», para não se confundirem com o ao vivo. */
export const etiquetaSemanaGravada = (hora: number): string => `semana gravada · ${rotuloHora(hora).replace(" · ", " às ")}`;

/** Sem o «Trânsito» (ADR-0034), o mapa ao vivo fica só com os peões: os veículos saem (os pontos, os modelos 3D e os sem modelo). */
export const soPeoesAoVivo = (posicoes: PosicaoAoVivo[]): PosicaoAoVivo[] => posicoes.filter(({ d }) => ePeao(d.classe));

/** O «por hora» de agora dos sensores de um tipo que uma fonte viva vê (sem cobertura não há valor, e não é zero: ADR-0007). */
function porHoraAoVivo(vivos: SensorAoVivo[], tipo: SensorAoVivo["tipo"]): Map<string, number> {
  return new Map(vivos.filter((s) => s.tipo === tipo && s.coberto !== false && s.por_hora !== null).map((s) => [s.id, s.por_hora as number]));
}

/**
 * O calor ao vivo (ADR-0055, ponto 3): as nuvens do ADR-0047, com a mesma rampa, a mesma soma e a escala (os máximos) da
 * semana, mas com o «por hora» da janela móvel de agora. Os peões só nas passadeiras, porque as zonas turísticas não têm contagem
 * ao vivo; onde não há valor, não há nuvem. Não há estimados da ②.
 */
export function calorAoVivo(
  vivos: SensorAoVivo[],
  posicoes: Sensor[],
  segmentos: SegmentoCarros[],
  maximos: MaximosCalor,
  ligadas: { peoes: boolean; veiculos: boolean },
): { peoes: ColecaoCalor | null; veiculos: ColecaoCalor | null } {
  const semEstimados = new Map<string, number>();
  const passadeiras = posicoes.flatMap((p) =>
    p.tipo === "passadeira" && p.lon !== null && p.lat !== null ? [{ id: p.id, coord: [p.lon, p.lat] as [number, number] }] : [],
  );
  return {
    peoes: ligadas.peoes ? calorDosPeoes(passadeiras, [], porHoraAoVivo(vivos, "passadeira"), new Map(), semEstimados, maximos) : null,
    veiculos: ligadas.veiculos ? calorDosVeiculos(segmentos, porHoraAoVivo(vivos, "segmento"), semEstimados, maximos) : null,
  };
}
