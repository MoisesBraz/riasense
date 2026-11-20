/**
 * Liga os dados da API ao mapa: os marcadores do separador ativo, as ruas cobertas (perto de sensores de peões)
 * e o enquadramento da zona. Se a API falhar, o mapa continua: só ficam a faltar os pontos.
 */
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import {
  useCarros,
  useFalhas,
  useLuminosidade,
  usePassadeirasMapa,
  usePassadeirasProteger,
  usePrevisoes,
  useProximoSensor,
  useRiscoPotencial,
  useSegmentosCarros,
  useEdificiosMedidos,
  useSensores,
  useSensoresVirtuais,
  useTravessiasDaHora,
  useAvenida,
  useLugaresDaHora,
  useZonasDaHora,
  useMaximosCalor,
} from "../../api/recursos";
import type { Resultado } from "../../api/cliente";
import type { LeituraAoVivo } from "../../api/aoVivo";
import { PopupEstacaoAoVivo, PopupSensorAoVivo } from "../../paineis/PainelAoVivo";
import {
  calorAoVivo,
  marcadoresAoVivo,
  marcadoresPassadeirasAoVivo,
  pessoasAoVivo,
  pontosAoVivo,
  posicoesAoVivo,
  rotulosAoVivo,
  semModeloAoVivo,
  soPeoesAoVivo,
  veiculosAoVivo,
  type PosicaoAoVivo,
} from "../../dominio/aoVivo";
import { config } from "../../config";
import { posicoesDosCarros, type PassagemHora } from "../../dominio/carros";
import { carrosEstacionados, contornosDosLugares, type EstadoLugar } from "../../dominio/avenida";
import { criarCena } from "../../dominio/cena3d";
import { dadosDaCenaEstimada } from "../../dominio/figurasEstimadas";
import { Selo } from "../Basicos";
import { prepararPassadeiras } from "../../dominio/peoes";
import { cortesDosSegmentos } from "../../dominio/transito3d";
import { calorDosPeoes, calorDosVeiculos, estimadosDaHora } from "../../dominio/calor";
import { lerInstante } from "../../dominio/tempo";
import { emAtencao, estimadosNaHora, sitiosDoProximo } from "../../dominio/completar";
import { rotuloSensor, urn } from "../../dominio/formato";
import { luzDaHora } from "../../dominio/luminosidade";
import { colecoesDasPassadeiras, mobiliarioDasPassadeiras, pontasDasPassadeiras } from "../../dominio/passadeiras";
import { caixaDe, marcadoresDe, RAIO_FALHA_RSU, type Caixa, type Zona } from "../../dominio/marcadores";
import { previsaoPorSensor } from "../../dominio/prever";
import { camadaLigada, useEstadoDemo } from "../../estado/estado";
import { useModoAgora } from "../../estado/agora";
import { useEcraLargo } from "../../estado/useEcraLargo";
import { PopupSensor } from "../PopupSensor";
import { DetalheVigiar } from "../../paineis/PainelVigiar";
import { inicioDaHora } from "../../dominio/tempo";
import { falhaNaHora } from "../../dominio/vigiar";
import { Mapa } from "./Mapa";

const ZONA: Zona = { rsu: urn(config.zona.rsu), passadeiras: new Set(config.zona.passadeiras.map(urn)) };
const dados = <T,>(r: Resultado<T>): T[] | undefined => (r.estado === "ok" ? r.dados : undefined);
const SEM_TROCOS: string[] = [];
const nada = () => {};

/**
 * O modo «Ao vivo» (ADR-0049, ponto 4): as deteções de agora a andar, com os modelos de tipo na vista 3D, e as estações com o
 * ícone da RSU. As camadas da semana gravada saem todas. As posições calculam-se uma vez por fotograma (os pontos e os modelos
 * pedem o mesmo instante).
 */
function useMapaAoVivo(leitura: LeituraAoVivo | null, aberta: string | null, comTransito: boolean) {
  const atual = leitura?.atual ?? null;
  const anterior = leitura?.anterior ?? null;
  return useMemo(() => {
    if (!atual) return null;
    const parado = typeof matchMedia === "function" && matchMedia("(prefers-reduced-motion: reduce)").matches;
    let cache: { s: number; p: PosicaoAoVivo[] } | null = null;
    const em = (s: number) => {
      if (cache?.s !== s) {
        const todas = posicoesAoVivo(anterior, atual, s * 1000, parado);
        // Sem o «Trânsito», ficam só os peões: a camada desliga os veículos ao vivo como desliga os da semana.
        cache = { s, p: comTransito ? todas : soPeoesAoVivo(todas) };
      }
      return cache.p;
    };
    return {
      marcadores: marcadoresAoVivo(atual.estacoes, aberta),
      rotulos: rotulosAoVivo(atual.estacoes),
      carros: (s: number) => pontosAoVivo(em(s)),
      modelos: {
        veiculos: (s: number) => veiculosAoVivo(em(s)),
        pessoas: (s: number) => pessoasAoVivo(em(s)),
        semModelo: (s: number) => semModeloAoVivo(em(s)),
        aceleracaoPessoas: 1, // ritmo real
        aspeto: config.pessoas.aspeto,
      },
    };
  }, [atual, anterior, aberta, comTransito]);
}

export function MapaDaDemo({
  tema,
  aoVivo = null,
  alvoBussola = null,
}: {
  tema: string;
  aoVivo?: LeituraAoVivo | null;
  alvoBussola?: HTMLElement | null;
}) {
  const { estado, despachar } = useEstadoDemo();
  const sensores = dados(useSensores().resultado);
  const emAoVivo = aoVivo !== null;
  // «Ao vivo» (ADR-0055): a estação com o pop-up aberto. Os números de cada estação só aparecem aí, ao clicar.
  const [vivoAberto, setVivoAberto] = useState<string | null>(null);
  useEffect(() => {
    if (!emAoVivo) setVivoAberto(null);
  }, [emAoVivo]);
  const vivo = useMapaAoVivo(aoVivo, vivoAberto, camadaLigada(estado, "transito"));
  // O pop-up do «Ao vivo»: uma estação do Living Lab (o marcador da RSU), ou um sensor do dataset (uma passadeira, pelo marcador
  // ou pelo polígono; um segmento, pela rua com sensor), com o agora, o esperado e o risco (ADR-0055).
  const estacaoAberta = vivoAberto ? aoVivo?.atual?.estacoes.find((e) => `ao-vivo:${e.id}` === vivoAberto) ?? null : null;
  const sensorAberto = vivoAberto && !estacaoAberta ? (sensores ?? []).find((s) => s.id === vivoAberto) ?? null : null;
  const posicaoAberta = estacaoAberta ?? (sensorAberto?.lon != null && sensorAberto.lat != null ? { lon: sensorAberto.lon, lat: sensorAberto.lat } : null);
  const popupVivo = vivoAberto && posicaoAberta ? { id: vivoAberto, lon: posicaoAberta.lon, lat: posicaoAberta.lat, centrar: false } : null;
  const fecharVivo = useCallback(() => setVivoAberto(null), []);
  const conteudoVivo = estacaoAberta ? (
    <PopupEstacaoAoVivo estacao={estacaoAberta} recebido={aoVivo?.atual?.recebido ?? null} onFechar={fecharVivo} />
  ) : sensorAberto ? (
    <PopupSensorAoVivo id={sensorAberto.id} sensor={aoVivo?.atual?.sensores?.find((s) => s.id === sensorAberto.id) ?? null} onFechar={fecharVivo} />
  ) : null;
  const passadeirasVivas = useMemo(
    () => (aoVivo?.atual && sensores ? marcadoresPassadeirasAoVivo(aoVivo.atual.sensores ?? [], sensores, vivoAberto) : []),
    [aoVivo?.atual, sensores, vivoAberto],
  );
  const falhas = dados(useFalhas().resultado);
  const agora = useModoAgora();
  const emAgora = agora !== null;
  // No Vigiar e no Completar, os troços (segmentos) sem dados à hora escolhida ficam a vermelho na rua. No modo «agora»
  // não: a hora é a simulada, e a semana gravada não passa ao mapa (ADR-0032, ponto 7).
  const saude = (estado.separador === "vigiar" || estado.separador === "completar") && !emAgora;
  const trocosEmFalha = useMemo(
    () =>
      saude && falhas
        ? [...new Set(falhas.filter((f) => f.tipo_sensor === "segmento" && falhaNaHora([f], f.sensor, estado.hora)).map((f) => f.sensor))]
        : [],
    [saude, falhas, estado.hora],
  );
  // A camada «Trânsito» (ADR-0034): no ① Vigiar, fora do modo «agora» (que não tem a hora gravada), com a camada
  // ligada. Os segmentos em falha a esta hora ficam vermelhos e sem carros. No ② e no ③, só a vista 3D tem figuras, com as
  // estimativas e as previsões (ADR-0041, ponto 9).
  const figurasEstimadas = estado.separador === "completar" || estado.separador === "prever";
  const comCarros = (estado.separador === "vigiar" || figurasEstimadas) && camadaLigada(estado, "transito");
  const segmentosCarros = useSegmentosCarros();
  const passagens = dados(useCarros(estado.hora).resultado);
  const virtuais = dados(useSensoresVirtuais().resultado);
  const previsoes = dados(usePrevisoes().resultado);
  const proteger = dados(usePassadeirasProteger().resultado);
  const proximo = dados(useProximoSensor().resultado);
  // O fundo do mapa segue a luminosidade da hora escolhida (ADR-0040): sem dado, dia.
  const luminosidade = dados(useLuminosidade().resultado);
  // As passadeiras com a forma real (ADR-0038): o asfalto, as 5 listas e a ponta de cada uma; sem a API, só os marcadores.
  const poligonos = dados(usePassadeirasMapa().resultado);
  // Os edifícios da zona com a altura medida pelo LiDAR da DGT (ADR-0050); sem a API, ficam as alturas de hoje.
  const edificiosMedidos = useEdificiosMedidos() ?? undefined;
  const passadeirasDesenhadas = useMemo(() => (poligonos ? colecoesDasPassadeiras(poligonos) : undefined), [poligonos]);
  // Os semáforos (OpenStreetMap, ADR-0019) e os sinais H7 (config) nas pontas das passadeiras, para a vista 3D.
  const mobiliario = useMemo(
    // Só na zona da demo, como os H7: das passadeiras com semáforo no OSM, as da zona (SC0020 e SC0021).
    () =>
      mobiliarioDasPassadeiras(
        poligonos ?? [],
        new Set((proteger ?? []).filter((p) => p.semaforo && ZONA.passadeiras.has(p.id)).map((p) => p.id)),
        new Set(config.mapa.sinaisH7),
        new Set(config.mapa.semaforosPontaOposta),
      ),
    [poligonos, proteger],
  );
  // A avenida da demo (ADR-0044): o asfalto, as linhas, os passeios e os lugares com o estado da hora; sem a API, nada muda.
  const avenidaApi = useAvenida();
  const lugaresHora = dados(useLugaresDaHora(estado.hora).resultado);
  const ultimosLugares = useRef(lugaresHora);
  if (lugaresHora) ultimosLugares.current = lugaresHora;
  const estadosLugares = useMemo(
    () => new Map<string, EstadoLugar>((lugaresHora ?? ultimosLugares.current ?? []).map((x) => [x.lugar, x.estado])),
    [lugaresHora],
  );
  const avenida = useMemo(
    () =>
      avenidaApi
        ? {
            // O asfalto de um troço do corredor em falha fica avermelhado (ADR-0044): a linha da rua com sensor está na berma.
            estrada: {
              ...avenidaApi.estrada,
              features: (avenidaApi.estrada.features as { properties?: { segmentos?: string[] } }[]).map((f) => ({
                ...f,
                properties: { ...f.properties, emFalha: (f.properties?.segmentos ?? []).some((s) => trocosEmFalha.includes(s)) },
              })),
            },
            corredor: (avenidaApi.estrada.features as { properties?: { segmentos?: string[] } }[]).flatMap((f) => f.properties?.segmentos ?? []),
            faixas: avenidaApi.faixas,
            passeios: avenidaApi.passeios,
            lugares: contornosDosLugares(avenidaApi.lugares.features, estadosLugares),
          }
        : undefined,
    [avenidaApi, estadosLugares, trocosEmFalha],
  );
  const estacionados = useMemo(
    () => (avenidaApi ? carrosEstacionados(avenidaApi.lugares.features, estadosLugares) : []),
    [avenidaApi, estadosLugares],
  );
  const pontas = useMemo(() => (poligonos ? pontasDasPassadeiras(poligonos) : undefined), [poligonos]);
  // O risco potencial pede-se hora a hora; fora do mapa de risco fica presa a uma hora, para não pedir a cada passo do cursor.
  const vistaDeRisco = estado.separador === "proteger" && estado.vistaProteger === "risco";
  const risco = dados(useRiscoPotencial(vistaDeRisco ? estado.hora : inicioDaHora(config.incidenteInicio)).resultado);

  // Caixa da zona: as passadeiras e a RSU no desktop; só as passadeiras no telemóvel, onde o mapa é pequeno.
  const enquadrar = useMemo(() => {
    const caixa = (incluirRsu: boolean) =>
      caixaDe((sensores ?? []).filter((s) => ZONA.passadeiras.has(s.id) || (incluirRsu && s.id === ZONA.rsu)));
    const comRsu = caixa(true);
    const soPassadeiras = caixa(false);
    return comRsu && soPassadeiras ? { comRsu, soPassadeiras } : null;
  }, [sensores]);

  const estimados = useMemo(() => (virtuais ? estimadosNaHora(virtuais, estado.hora) : undefined), [virtuais, estado.hora]);
  const porSensor = useMemo(() => (previsoes ? previsaoPorSensor(previsoes, estado.hora, config.prever.horizonteH) : undefined), [previsoes, estado.hora]);
  const porPassadeira = useMemo(() => (proteger ? new Map(proteger.map((p) => [p.id, p])) : undefined), [proteger]);
  const atencao = useMemo(() => (proximo ? emAtencao(proximo, estado.hora, config.verificarDesde) : undefined), [proximo, estado.hora]);
  const sitios = useMemo(() => (proximo && estado.proximo ? sitiosDoProximo(proximo) : undefined), [proximo, estado.proximo]);
  // Com o «próximo sensor» ligado, o mapa enquadra os sítios todos (ADR-0033, ponto 5); ao desligar, volta à zona.
  const caixaDosSitios = useMemo(
    () => (sitios && sensores ? caixaDe(sensores.filter((s) => sitios.some((x) => x.id === s.id))) : null),
    [sitios, sensores],
  );
  // «Ao vivo» (ADR-0055): ao entrar, o mapa enquadra as estações ativas da 1.ª leitura, uma só vez. As ativas mudam de uma
  // leitura para outra (24, 25…): se a caixa as seguisse, quem aproximou o mapa era puxado para trás. Ao sair, a caixa apaga-se
  // e o mapa volta à zona da demo.
  const [caixaDoAoVivo, setCaixaDoAoVivo] = useState<Caixa | null>(null);
  const estacoesAoVivo = aoVivo?.atual?.estacoes;
  useEffect(() => {
    if (!emAoVivo) setCaixaDoAoVivo(null);
    else if (estacoesAoVivo) setCaixaDoAoVivo((c) => c ?? caixaDe(estacoesAoVivo.filter((e) => e.ativa)));
  }, [emAoVivo, estacoesAoVivo]);
  const riscoPorPassadeira = useMemo(
    () => (risco && vistaDeRisco ? new Map(risco.map((r) => [r.id, r])) : undefined),
    [risco, vistaDeRisco],
  );

  const simulado = agora?.leitura.estado === "ok" ? agora.leitura.dados : null;
  // Enquanto a hora nova carrega (a cada passo do ▶), ficam as passagens da hora anterior: os carros não piscam.
  const ultimasPassagens = useRef<PassagemHora[] | undefined>(undefined);
  if (passagens) ultimasPassagens.current = passagens;
  const passagensVistas = passagens ?? ultimasPassagens.current;
  const carros = useMemo(() => {
    if (!comCarros || agora || segmentosCarros.length === 0) return null;
    // No ② e no ③ não há pontos fora da vista 3D: os pontos do «Trânsito» são só os medidos (ADR-0034).
    if (figurasEstimadas) return () => [];
    if (!passagensVistas) return null;
    const emFalha = new Set(trocosEmFalha);
    return (segundos: number) => posicoesDosCarros(segmentosCarros, passagensVistas, emFalha, segundos, config.carros);
  }, [comCarros, agora, figurasEstimadas, passagensVistas, segmentosCarros, trocosEmFalha]);
  // A vista 3D com modelos (ADR-0041): os mesmos grupos medidos, agora com o tipo, e os peões nas passadeiras desta hora.
  const intervalos = dados(useTravessiasDaHora(estado.hora).resultado);
  const ultimosIntervalos = useRef(intervalos);
  if (intervalos) ultimosIntervalos.current = intervalos;
  const intervalosVistos = intervalos ?? ultimosIntervalos.current;
  const passadeiras3d = useMemo(() => prepararPassadeiras(poligonos ?? []), [poligonos]);
  const cortes = useMemo(() => cortesDosSegmentos(segmentosCarros, passadeiras3d), [segmentosCarros, passadeiras3d]);
  const cena3d = useMemo(() => {
    if (!carros || (!passagensVistas && !figurasEstimadas)) return null;
    const travessias = new Map<string, number>();
    for (const x of intervalosVistos ?? []) travessias.set(x.passadeira, (travessias.get(x.passadeira) ?? 0) + x.travessias);
    // Uma passadeira em falha à hora escolhida (①) fica sem figuras.
    const passadeirasEmFalha = new Set(
      (falhas ?? []).filter((f) => f.tipo_sensor === "passadeira" && falhaNaHora([f], f.sensor, estado.hora)).map((f) => f.sensor),
    );
    const medido = { passagens: passagensVistas ?? [], emFalha: new Set(trocosEmFalha), travessias, passadeirasEmFalha };
    // No ② os sensores em falha andam com os sensores virtuais desta hora; no ③, tudo anda com a previsão a t + 3 h, e só onde
    // ela existe (ADR-0041, ponto 9). As estimadas e as previstas ficam translúcidas.
    const dados = figurasEstimadas
      ? dadosDaCenaEstimada(
          estado.separador as "completar" | "prever",
          medido,
          estado.separador === "completar" ? estimadosDaHora(virtuais ?? [], estado.hora, lerInstante) : (porSensor ?? new Map()),
          new Set(segmentosCarros.map((x) => x.id)),
          new Set(passadeiras3d.map((x) => x.id)),
          config.carros.veiculosPorPonto,
        )
      : { ...medido, estimadas: new Set<string>(), comEstimados: false };
    // Os peões esperam por uma aberta; sem ela, pedem passagem e os carros param (ADR-0043, 3.ª saída).
    const cena = criarCena(
      segmentosCarros,
      dados.passagens,
      dados.emFalha,
      passadeiras3d,
      dados.travessias,
      dados.passadeirasEmFalha,
      cortes,
      config.carros,
      config.pessoas,
      avenidaApi?.deslocamentos,
      undefined,
      dados.estimadas,
    );
    // Os estacionados são os medidos nesta hora (ADR-0044). No ③ ficam de fora: o ponto 9 do ADR-0041 só fala das passadeiras e
    // dos segmentos (o `previsoes.parquet` tem o estacionamento, mas só o total do sensor, e não os lugares).
    const parados = estado.separador === "prever" ? [] : estacionados;
    return {
      modelos: {
        // Os carros em andamento e os estacionados (ADR-0044: só nos lugares ocupados nesta hora, parados e sem velocidade).
        veiculos: (segundos: number) => [...cena(segundos).veiculos, ...parados],
        pessoas: (segundos: number) => cena(segundos).pessoas,
        aceleracaoPessoas: config.pessoas.aceleracao,
        aspeto: config.pessoas.aspeto,
      },
      comEstimados: dados.comEstimados,
    };
  }, [
    carros,
    passagensVistas,
    figurasEstimadas,
    segmentosCarros,
    trocosEmFalha,
    intervalosVistos,
    falhas,
    estado.hora,
    estado.separador,
    virtuais,
    porSensor,
    passadeiras3d,
    cortes,
    avenidaApi,
    estacionados,
  ]);
  const modelos = cena3d?.modelos ?? null;
  // O selo das figuras estimadas e previstas só aparece com os modelos à vista (ecrã largo, inclinado, zoom ≥ 17).
  const [modelosVisiveis, setModelosVisiveis] = useState(false);
  const seloDasFiguras = figurasEstimadas && modelosVisiveis && cena3d?.comEstimados === true;
  // Os mapas de calor (ADR-0047): as nuvens da hora, só com a camada ligada e fora do mapa de risco.
  const comCalorPeoes = camadaLigada(estado, "calorPeoes") && !vistaDeRisco;
  const comCalorVeiculos = camadaLigada(estado, "calorVeiculos") && !vistaDeRisco;
  const zonasHora = dados(useZonasDaHora(estado.hora).resultado);
  const maximosCalor = useMaximosCalor();
  const calor = useMemo(() => {
    if (emAoVivo || !maximosCalor || (!comCalorPeoes && !comCalorVeiculos)) return undefined;
    const estimados = estimadosDaHora(virtuais ?? [], estado.hora, lerInstante);
    const ponto = (s: { lon: number | null; lat: number | null }) => [s.lon as number, s.lat as number] as [number, number];
    const comPonto = (tipo: string) => (sensores ?? []).filter((s) => s.tipo === tipo && s.lon !== null && s.lat !== null);
    const somaTravessias = new Map<string, number>();
    for (const x of intervalosVistos ?? []) somaTravessias.set(x.passadeira, (somaTravessias.get(x.passadeira) ?? 0) + x.travessias);
    return {
      peoes: comCalorPeoes
        ? calorDosPeoes(
            comPonto("passadeira").map((s) => ({ id: s.id, coord: ponto(s) })),
            comPonto("zona").map((s) => ({ id: s.id, coord: ponto(s) })),
            somaTravessias,
            new Map((zonasHora ?? []).map((z) => [z.id, z.visitas])),
            estimados,
            maximosCalor,
          )
        : null,
      veiculos: comCalorVeiculos
        ? calorDosVeiculos(segmentosCarros, new Map((passagensVistas ?? []).map((p) => [p.id, p.veiculos])), estimados, maximosCalor)
        : null,
    };
  }, [emAoVivo, maximosCalor, comCalorPeoes, comCalorVeiculos, virtuais, estado.hora, sensores, intervalosVistos, zonasHora, segmentosCarros, passagensVistas]);
  // O calor ao vivo (ADR-0055, ponto 3): o «por hora» de agora de cada sensor, na escala da semana. Muda a cada leitura (1 s).
  const sensoresVivos = aoVivo?.atual?.sensores;
  const calorVivo = useMemo(() => {
    if (!emAoVivo || !sensoresVivos || !maximosCalor || (!comCalorPeoes && !comCalorVeiculos)) return undefined;
    return calorAoVivo(sensoresVivos, sensores ?? [], segmentosCarros, maximosCalor, { peoes: comCalorPeoes, veiculos: comCalorVeiculos });
  }, [emAoVivo, sensoresVivos, sensores, segmentosCarros, maximosCalor, comCalorPeoes, comCalorVeiculos]);
  const marcadoresGravados = useMemo(
    () =>
      sensores
        ? marcadoresDe(
            estado,
            {
              sensores,
              falhas,
              estimados,
              previsoes: porSensor,
              proteger: porPassadeira,
              risco: riscoPorPassadeira,
              atencao,
              proximo: sitios,
            },
            ZONA,
          )
        : [],
    [sensores, falhas, estimados, porSensor, porPassadeira, riscoPorPassadeira, atencao, sitios, estado],
  );
  // No modo «agora», o estado vem do simulador: a comunicar (verde), sem comunicação (âmbar) ou falha de rede (vermelho; é a RSU que deixa de comunicar).
  const marcadores = useMemo(() => {
    if (!simulado) return marcadoresGravados;
    const porId = new Map<string, { calado: boolean; falha?: boolean }>([...simulado.sensores, ...simulado.rsus].map((x) => [x.id, x]));
    // Uma passadeira de uma RSU sem comunicação mostra o alerta da RSU: as 4 juntas deixam de comunicar antes de cada uma sozinha.
    const daRsuCalada = new Map<string, { falha?: boolean }>(
      simulado.rsus.filter((r) => r.calado).flatMap((r) => r.passadeiras.map((p) => [p, r] as const)),
    );
    return marcadoresGravados.map((m) => {
      const x = porId.get(m.id);
      if (!x) return m;
      if (m.tipo === "rsu" || m.tipo === "rsu-falha") {
        // A RSU sem comunicação é um alerta (rótulo «sem comunicação», ADR-0032, ponto 7); só a falha inesperada a pinta de vermelho (ADR-0033), com o anel.
        // O anel da falha gravada à hora do cursor não passa ao modo «agora».
        const nome = rotuloSensor(m.id);
        const rotulo = x.falha ? `${nome} · falha de rede` : x.calado ? `${nome} · sem comunicação` : nome;
        const halo = x.falha ? { tipo: "falha" as const, raio: RAIO_FALHA_RSU } : undefined;
        return { ...m, tipo: x.falha ? ("rsu-falha" as const) : ("rsu" as const), rotulo, halo };
      }
      const rsu = daRsuCalada.get(m.id);
      const falha = x.falha || rsu?.falha;
      const calado = x.calado || rsu !== undefined;
      return {
        ...m,
        tipo: falha ? ("falha-rede" as const) : calado ? ("atencao" as const) : ("ativo" as const),
        halo: undefined,
        tracejado: false,
      };
    });
  }, [simulado, marcadoresGravados]);

  // Pop-up (ADR-0033, ponto 3): preso ao marcador num ecrã largo; numa folha que sobe do fundo num ecrã estreito.
  const largo = useEcraLargo();
  const idPopup = estado.popup?.id;
  const fechar = useCallback(() => despachar({ tipo: "popup", sensor: null }), [despachar]);
  const sensorDoPopup = sensores?.find((s) => s.id === idPopup && s.lon !== null && s.lat !== null);
  // Um troço sem marcador prende o pop-up à ponta do seu segmento: é o que a pergunta por voz abre (ADR-0054).
  const trocoDoPopup = sensorDoPopup ? undefined : segmentosCarros.find((s) => s.id === idPopup);
  // A rua da pergunta por voz (ADR-0054): realçada, com o pop-up do troço aberto, o mesmo do clique (ADR-0039, ponto 4).
  const nomeRua = estado.ruaVoz?.nome ?? null;
  const realce = useMemo(() => {
    const rua = config.voz.ruas.find((r) => r.nome === nomeRua);
    return rua ? { nome: rua.nome, segmentos: rua.segmentos } : null;
  }, [nomeRua]);
  const posicao = sensorDoPopup
    ? { lon: sensorDoPopup.lon as number, lat: sensorDoPopup.lat as number }
    : trocoDoPopup
      ? { lon: trocoDoPopup.linha[0][0], lat: trocoDoPopup.linha[0][1] }
      : null;
  const popup = estado.popup && posicao ? { id: estado.popup.id, ...posicao, centrar: estado.popup.centrar } : null;
  // No ① Vigiar, o pop-up mostra só o sensor clicado e a sua linha do tempo. O troço da voz abre-o em qualquer separador.
  const naBarra = estado.separador === "vigiar" || (realce !== null && idPopup?.includes("RoadSegment"));
  const conteudo = popup ? (
    naBarra ? (
      <DetalheVigiar id={popup.id} onFechar={fechar} />
    ) : (
      <PopupSensor id={popup.id} onFechar={fechar} />
    )
  ) : null;

  // Esc fecha o pop-up e devolve o foco a quem o abriu (a linha da lista, o marcador) ou, sem isso, ao marcador.
  // Guarda-se antes de o pop-up receber o foco: os efeitos de layout correm antes dos efeitos do pop-up.
  const abridor = useRef<HTMLElement | null>(null);
  useLayoutEffect(() => {
    if (idPopup)
      abridor.current =
        document.activeElement instanceof HTMLElement && document.activeElement !== document.body ? document.activeElement : null;
  }, [idPopup]);
  useEffect(() => {
    if (!idPopup) return;
    const tecla = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      e.preventDefault();
      const quem = abridor.current?.isConnected ? abridor.current : null;
      fechar();
      (quem ?? document.querySelector<HTMLElement>(`[data-sensor="${CSS.escape(idPopup)}"]`))?.focus();
    };
    document.addEventListener("keydown", tecla);
    return () => document.removeEventListener("keydown", tecla);
  }, [idPopup, fechar]);

  return (
    <>
      <Mapa
        vistaAerea={!emAoVivo && camadaLigada(estado, "aerea")}
        marcadores={emAoVivo ? [...(vivo?.marcadores ?? []), ...passadeirasVivas] : marcadores}
        enquadrar={enquadrar}
        enquadrarSitios={emAoVivo ? caixaDoAoVivo : caixaDosSitios}
        tema={tema}
        luz={luminosidade && !emAoVivo ? luzDaHora(luminosidade, estado.hora) : undefined}
        passadeiras={passadeirasDesenhadas}
        avenida={avenida}
        edificiosMedidos={edificiosMedidos}
        pontas={pontas}
        popup={emAoVivo ? popupVivo : popup}
        conteudoPopup={largo ? (emAoVivo ? conteudoVivo : conteudo) : null}
        rotulos={emAoVivo ? (vivo?.rotulos ?? null) : null}
        largo={largo}
        alvoBussola={alvoBussola}
        onSelecionar={emAoVivo ? setVivoAberto : (id) => despachar({ tipo: "popup", sensor: id })}
        onFecharPopup={emAoVivo ? fecharVivo : fechar}
        onRua={emAoVivo ? nada : (nome) => despachar({ tipo: "rua", rua: { nome } })}
        onVazio={() => {
          if (!emAoVivo && naBarra && (estado.popup || estado.filtroVigiar)) {
            despachar({ tipo: "popup", sensor: null });
            despachar({ tipo: "filtro-vigiar", filtro: null });
          }
        }}
        trocosEmFalha={emAoVivo ? SEM_TROCOS : trocosEmFalha}
        realce={emAoVivo ? null : realce}
        carros={emAoVivo ? (vivo?.carros ?? null) : carros}
        mobiliario={emAoVivo ? undefined : mobiliario}
        modelos={emAoVivo ? (vivo?.modelos ?? null) : modelos}
        calor={emAoVivo ? calorVivo : calor}
        onModelos={setModelosVisiveis}
      />
      {seloDasFiguras && (
        // O pop-up preso abre por baixo deste selo, e não por cima dele: o aviso fica sempre à vista.
        <div
          className={`chip-mapa chip-mapa--figuras sobreposto ${estado.separador === "prever" ? "chip-mapa--segundo" : ""}`}
          role="note"
          data-tapa-mapa="pop-up"
        >
          <Selo>{estado.separador === "prever" ? `Previsto daqui a ${config.prever.horizonteH} h` : "Estimado (sensor virtual)"}</Selo>
          <span>soma de todos os sensores: mais carros do que no ①</span>
        </div>
      )}
      {!largo && (emAoVivo ? conteudoVivo : conteudo) && (
        <div className="folha">
          <button type="button" className="folha__fundo" aria-label="Fechar o pop-up" tabIndex={-1} onClick={emAoVivo ? fecharVivo : fechar} />
          <div className="folha__corpo" data-tapa-mapa="">
            {emAoVivo ? conteudoVivo : conteudo}
          </div>
        </div>
      )}
    </>
  );
}
