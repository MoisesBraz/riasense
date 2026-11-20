/**
 * Mapa MapLibre sobre o PMTiles local (ADR-0014): o ficheiro é servido como estático pela web e lido com o
 * protocolo `pmtiles`, sem servidor de tiles e sem rede. Este componente só desenha: os marcadores e as ruas
 * cobertas chegam por props, calculados por funções puras (`dominio/marcadores.ts`).
 */
import type { RotuloNoMapa } from "../../dominio/aoVivo";
import { elementoIcone, Icone } from "../Icone";
import { elementoDistintivo } from "../Simbolos";
import { addProtocol, Map as MapaMapLibre, Marker, Popup, setWorkerUrl, type GeoJSONSource, type PointLike } from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
// O MapLibre 6 calcula o URL do worker a partir do seu próprio ficheiro, o que falha depois do Vite o empacotar.
// O `?url` faz o Vite servir (e copiar no build) o worker, que é autónomo, e diz-se ao MapLibre onde está.
import urlDoWorker from "maplibre-gl/dist/maplibre-gl-worker.mjs?url";
import { Protocol } from "pmtiles";
import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { API_URL, config } from "../../config";
import type { ColecaoCalor } from "../../dominio/calor";
import { textoDaVelocidade, type PontoCarro, type Veiculo3D } from "../../dominio/carros";
import type { Pessoa3D } from "../../dominio/peoes";
import { Camada3D, ID_CAMADA_3D, type Estado3D } from "./camada3d";
import { CamadaMobiliario, ID_CAMADA_MOBILIARIO } from "./camadaMobiliario";
import { deslocamentoDoAlvo, tapadoAgora } from "./areaVisivel";
import { rotuloAcessivel, type Caixa, type Marcador } from "../../dominio/marcadores";
import type { ColecoesDasPassadeiras, Mobiliario, Ponta } from "../../dominio/passadeiras";
import {
  aplicarCores,
  BRILHO_AEREA,
  CAMADA_AEREA,
  CAMADA_EDIFICIOS_ZONA,
  CAMADA_PASSADEIRAS,
  ATRIBUICAO_MAPA,
  CAMADA_PEOES,
  CAMADAS_RUAS,
  type ColecoesDaAvenida,
  type EdificiosMedidos,
  construirEstilo,
  FONTE_ROTULOS_VIVO,
  lerCores,
  OPACIDADE_EDIFICIOS,
  OPACIDADE_EDIFICIOS_AEREA,
  OPACIDADE_EDIFICIOS_AEREA_3D,
  OPACIDADE_PONTOS,
  OPACIDADE_PONTOS_3D,
  ZOOM_PASSADEIRAS,
  type Luz,
} from "./estilo";

/** O zoom a partir do qual o marcador da passadeira se prende à ponta do polígono (ADR-0038), e a distância do centro do marcador à ponta (px). */
const ZOOM_PRENDER = ZOOM_PASSADEIRAS;
const DISTANCIA_PRESO_PX = 18;
/** O pop-up preso abre esta distância acima do sensor (a seta incluída). */
const OFFSET_POPUP_PX = 20;

/**
 * A vista 3D (ADR-0037): no ecrã largo, o mapa abre ligeiramente inclinado (25°) e o botão «3D» leva a 55° e deixa rodar (máximo
 * 60°); no telemóvel, sempre de cima. Abaixo de 30 fps, abre de cima e o 3D fica só no botão.
 */
export const INCLINACAO_INICIAL = 25;
export const INCLINACAO_3D = 55;
export const INCLINACAO_MAX = 60;
/** Com o «3D», a inclinação vai até 85°, e vê-se o céu (ADR-0042, ponto 2). */
const INCLINACAO_MAX_3D = 85;
/** O zoom máximo: 21 no ecrã largo, para ver os modelos do ADR-0041 de perto; 19,5 no telemóvel (ADR-0042, ponto 6). */
const ZOOM_MAX_LARGO = 21;
const ZOOM_MAX_ESTREITO = 19.5;
const FPS_MINIMO = 30;
const AMOSTRA_FPS_MS = 3000;
/** Os modelos 3D aparecem a partir deste zoom, na vista inclinada do ecrã largo (ADR-0041, ponto 1); abaixo, ficam os pontos. */
const ZOOM_MODELOS = 17;
const INCLINACAO_MODELOS = 10;

/** Os fotogramas por segundo durante `ms`, contados com o requestAnimationFrame. */
function medirFps(ms = 2000): Promise<number> {
  return new Promise((resolver) => {
    if (typeof requestAnimationFrame !== "function") return resolver(60);
    let n = 0;
    const inicio = performance.now();
    const passo = (t: number) => {
      n++;
      if (t - inicio < ms) requestAnimationFrame(passo);
      else resolver((n * 1000) / (t - inicio));
    };
    requestAnimationFrame(passo);
  });
}

const semMovimento = () => typeof matchMedia === "function" && matchMedia("(prefers-reduced-motion: reduce)").matches;

let protocoloRegistado = false;
function registarProtocolo() {
  if (protocoloRegistado) return;
  setWorkerUrl(urlDoWorker);
  addProtocol("pmtiles", new Protocol().tile);
  protocoloRegistado = true;
}

/** URLs absolutas: os workers do MapLibre não resolvem caminhos relativos à página. */
function urlLocal(caminho: string): string {
  return `${window.location.origin}${import.meta.env.BASE_URL}${caminho}`;
}

function opcoesDoEstilo(trocosEmFalha: string[], passadeiras?: ColecoesDasPassadeiras, avenida?: ColecoesDaAvenida, edificiosMedidos?: EdificiosMedidos, realce?: Realce | null) {
  return {
    trocosEmFalha,
    realce,
    passadeiras,
    avenida,
    edificiosMedidos,
    alturaEdificio: config.mapa.edificioAlturaM,
    aerea: `pmtiles://${urlLocal("tiles/vista_aerea.pmtiles")}`,
    tiles: `pmtiles://${urlLocal(config.mapa.tiles)}`,
    glifos: urlLocal(config.mapa.glifos),
    // As ruas com sensor vêm da API (ADR-0034, ponto 2); URL absoluta, como os outros recursos do MapLibre.
    ruas: new URL(`${API_URL}/mapa/ruas-com-sensor`, window.location.origin).toString(),
  };
}

/** O `el` é o botão dentro do elemento do MapLibre (que guarda as suas classes de posição). */
function preencherMarcador(el: HTMLElement, m: Marcador) {
  el.className = [
    "marcador-mapa",
    `marcador-mapa--${m.tipo}`,
    `marcador-mapa--rotulo-${m.lado}`,
    m.daZona ? "marcador-mapa--zona" : "",
    m.selecionado ? "marcador-mapa--selecionado" : "",
    m.tracejado ? "marcador-mapa--tracejado" : "",
    m.tipo === "ativo" ? "marcador-mapa--vivo" : "", // o sensor a comunicar pulsa
    m.especie ? `marcador-mapa--com-icone marcador-mapa--tipo-${m.especie}` : "",
    m.nomeAPedido ? "marcador-mapa--nome-a-pedido" : "",
    m.falha ? `marcador-mapa--falha-${m.falha}` : "",
  ].join(" ");
  el.dataset.sensor = m.id;
  el.setAttribute("aria-label", rotuloAcessivel(m));
  el.title = rotuloAcessivel(m); // dica ao passar o rato: o nome e o estado
  el.setAttribute("aria-pressed", String(m.selecionado));
  // Nós DOM e textContent (não innerHTML): o rótulo vem dos identificadores da API.
  const span = (classe: string, texto = "") => {
    const s = document.createElement("span");
    s.className = classe;
    s.textContent = texto;
    return s;
  };
  const filhos: HTMLElement[] = [];
  if (m.halo) {
    const halo = span(`marcador-mapa__halo marcador-mapa__halo--${m.halo.tipo}`);
    halo.style.setProperty("--raio", `${m.halo.raio.toFixed(0)}px`);
    filhos.push(halo);
  }
  if (m.risco) {
    // O degrau do risco: o ícone do tipo e o número, na cor do degrau (ADR-0033).
    const g = span(`degrau degrau--com-icone degrau--${m.risco.nivel} ${m.risco.estimado ? "degrau--estimado" : ""}`);
    g.appendChild(elementoIcone(m.especie ?? "passadeira", 16));
    g.appendChild(span("degrau__nivel", String(m.risco.nivel)));
    filhos.push(g);
  } else if (m.especie) {
    // O distintivo do tipo de sensor, em todos os separadores, com o estado por cima (cheio, oco, tracejado, símbolo da falha).
    filhos.push(elementoDistintivo(m.tipo, m.especie, m.falha));
  } else {
    // O alvo numerado do «próximo sensor» (ADR-0033, ponto 5): não é um sensor, não tem tipo.
    filhos.push(span(`marcador marcador--${m.tipo}`, m.tipo === "proximo" ? String(m.posicao ?? "") : ""));
  }
  filhos.push(span("marcador-mapa__rotulo", m.rotulo));
  el.replaceChildren(...filhos);
}

export type { Caixa };

const SEM_TROCOS: string[] = [];

/** A rua da pergunta por voz (ADR-0054): os seus segmentos ficam realçados, com contorno e o nome. */
export type Realce = { nome: string; segmentos: string[] };

export interface PropsMapa {
  marcadores: Marcador[];
  /** Caixas para enquadrar a zona da demo quando os sensores chegam (desktop com a RSU; telemóvel só as passadeiras). */
  enquadrar: { comRsu: Caixa; soPassadeiras: Caixa } | null;
  /** Os sítios do «próximo sensor» (ADR-0033, ponto 5): enquadram-se ao ligar; com null, o mapa volta à zona. */
  enquadrarSitios?: Caixa | null;
  tema: string;
  /** A luminosidade da hora escolhida: o fundo do mapa segue-a, com uma transição (ADR-0040). Sem dado, é dia. */
  luz?: Luz;
  /** A vista aérea da zona (ADR-0045): a ortofoto da DGT por baixo das ruas e dos marcadores. */
  vistaAerea?: boolean;
  /** O sensor com o pop-up aberto (ADR-0033, ponto 3), e se o mapa se centra nele. */
  popup: { id: string; lon: number; lat: number; centrar: boolean } | null;
  /** O conteúdo do pop-up preso ao marcador; null num ecrã estreito, onde abre uma folha fora do mapa. */
  conteudoPopup: ReactNode;
  /** «Ao vivo» (ADR-0055): os números de cada estação, desenhados a partir do zoom 17 e sem se sobreporem. */
  rotulos?: RotuloNoMapa[] | null;
  onSelecionar: (id: string) => void;
  onFecharPopup: () => void;
  /** Clique no mapa fora dos marcadores, sem pop-up aberto: no ① Vigiar fecha a barra lateral. */
  onVazio?: () => void;
  onRua: (nome: string | null) => void;
  /** Os modelos 3D ficaram à vista, ou deixaram de estar (ADR-0041): o selo das figuras estimadas e previstas segue-os. */
  onModelos?: (visiveis: boolean) => void;
  /** Os troços medidos sem dados à hora escolhida: ficam a vermelho. */
  trocosEmFalha?: string[];
  /** A rua da pergunta por voz (ADR-0054), realçada; null sem pergunta. */
  realce?: Realce | null;
  /** As passadeiras com a forma real, o asfalto e as 5 listas (ADR-0038): por cima das ruas e por baixo dos carros e dos marcadores. */
  passadeiras?: ColecoesDasPassadeiras;
  /** A avenida da demo (ADR-0044): o asfalto, as linhas, os passeios e os lugares com o estado da hora. */
  avenida?: ColecoesDaAvenida;
  /** Os edifícios da zona com a altura medida pelo LiDAR da DGT (ADR-0050). */
  edificiosMedidos?: EdificiosMedidos;
  /** A ponta de cada passadeira, a que o marcador se prende a partir do zoom 17 (ADR-0038). */
  pontas?: Record<string, Ponta>;
  /** Ecrã largo: o mapa abre inclinado e tem o botão «3D» (ADR-0037); no telemóvel, sempre de cima. */
  largo?: boolean;
  /** Mede os fotogramas por segundo depois do 1.º desenho (para o recuo abaixo de 30 fps); substitui-se nos testes. */
  medir?: (ms?: number) => Promise<number>;
  /** Onde se desenha a bússola (ADR-0042, ponto 4): por cima das camadas, fora do Mapa. Sem alvo, não há bússola. */
  alvoBussola?: HTMLElement | null;
  /** A camada «Trânsito» (ADR-0034): as posições dos carros num instante (em segundos), ou null se desligada. */
  carros?: ((segundos: number) => PontoCarro[]) | null;
  /** Os mapas de calor da hora (ADR-0047): as nuvens dos peões e dos veículos, ou null com a camada desligada. */
  calor?: { peoes: ColecaoCalor | null; veiculos: ColecaoCalor | null };
  /**
   * A vista 3D com modelos (ADR-0041): os veículos com o tipo medido e os peões nas passadeiras, num instante. Só no ecrã largo,
   * inclinado e a partir do zoom 17; aí os pontos dão lugar aos modelos, e o anel e o número da velocidade seguem os modelos.
   */
  /** Os semáforos e os sinais H7 das passadeiras, na vista 3D a partir do zoom 17 (posição ilustrativa, nas pontas). */
  mobiliario?: Mobiliario[];
  modelos?: {
    veiculos: (segundos: number) => Veiculo3D[];
    pessoas: (segundos: number) => Pessoa3D[];
    /** «Ao vivo»: as deteções sem modelo (o moliceiro), que na vista 3D continuam como ponto. */
    semModelo?: (segundos: number) => PontoCarro[];
    aceleracaoPessoas: number;
    aspeto: "neutro" | "variado";
  } | null;
}

export function Mapa({
  marcadores,
  enquadrar,
  enquadrarSitios = null,
  tema,
  luz = "dia",
  vistaAerea = false,
  popup,
  conteudoPopup,
  rotulos = null,
  onSelecionar,
  onFecharPopup,
  onRua,
  onVazio,
  onModelos,
  trocosEmFalha = SEM_TROCOS,
  realce = null,
  passadeiras,
  avenida,
  edificiosMedidos,
  pontas,
  carros = null,
  calor,
  modelos = null,
  mobiliario,
  largo = false,
  medir = medirFps,
  alvoBussola = null,
}: PropsMapa) {
  // O rumo do mapa, para a bússola: 0° com o norte para cima.
  const [rumo, setRumo] = useState(0);
  const contentor = useRef<HTMLDivElement>(null);
  const mapa = useRef<MapaMapLibre | null>(null);
  const instancias = useRef(new Map<string, { marcador: Marker; el: HTMLButtonElement }>());
  const callbacks = useRef({ onSelecionar, onRua, onFecharPopup, onVazio, onModelos });
  callbacks.current = { onSelecionar, onRua, onFecharPopup, onVazio, onModelos };
  // A vista 3D (ADR-0037): o botão «3D» e o recuo para a vista de cima se o mapa não chegar aos 30 fps.
  const [tresD, setTresD] = useState(false);
  const [semInclinacao, setSemInclinacao] = useState(false);
  const inclinacaoBase = largo && !semInclinacao ? INCLINACAO_INICIAL : 0;
  const luzAtual = useRef<Luz>(luz);
  luzAtual.current = luz;
  const passadeirasAtuais = useRef(passadeiras);
  passadeirasAtuais.current = passadeiras;
  const avenidaAtual = useRef(avenida);
  avenidaAtual.current = avenida;
  const trocosAtuais = useRef(trocosEmFalha);
  trocosAtuais.current = trocosEmFalha;
  const edificiosAtuais = useRef(edificiosMedidos);
  edificiosAtuais.current = edificiosMedidos;
  // A partir do zoom 17 o marcador da passadeira prende-se a uma ponta do polígono, para a passadeira ficar à vista (ADR-0038).
  const [zoomAlto, setZoomAlto] = useState(false);
  const janela = useRef<Popup | null>(null);
  const [noPopup] = useState(() => document.createElement("div"));
  const enquadrado = useRef(false);
  // O 1.º carregamento do estilo. Não serve o isStyleLoaded(): com os carros a mudar a fonte a cada fotograma, fica falso.
  // Os carros só começam depois dele, senão o MapLibre nunca chega a dar o «load».
  const carregado = useRef(false);
  // O estilo lido (o «style.load»). Chega para trocar o tema e a paleta da hora, que só mexem no estilo. O «load» só vem num
  // desenho com tudo carregado, e o mapa pode parar de desenhar antes disso (por exemplo, sem os carros e as ruas da API).
  // Nesse caso, o tema ficava à espera de um «load» que não vinha.
  const estiloPronto = useRef(false);
  // A camada 3D (ADR-0041): o que desenha vem do mesmo fotograma dos pontos; a camada só lê.
  const camada3d = useRef<Camada3D | null>(null);
  const estado3d = useRef<Estado3D | null>(null);
  const modelosAtuais = useRef(modelos);
  const mobiliarioAtual = useRef(mobiliario);
  mobiliarioAtual.current = mobiliario;
  const camadaMobiliario = useRef<CamadaMobiliario | null>(null);
  modelosAtuais.current = modelos;
  // Ao ligar ou desligar os modelos (o «Trânsito», a troca de separador), decide-se logo se a camada 3D desenha, sem esperar
  // que o mapa se mexa: no ② e no ③ as figuras também andam (ADR-0041, ponto 9).
  const verCamadaRef = useRef<(() => void) | null>(null);
  const comModelos = modelos !== null;
  useEffect(() => verCamadaRef.current?.(), [comModelos]);
  const largoAtual = useRef(largo);
  largoAtual.current = largo;
  // Abaixo dos 30 fps, os modelos ficam desligados, também com o «3D» (ADR-0041, ponto 8): só os edifícios ficam no botão.
  const semModelos = useRef(false);

  useEffect(() => {
    registarProtocolo();
    const m = new MapaMapLibre({
      container: contentor.current as HTMLDivElement,
      style: construirEstilo(lerCores(undefined, luz), opcoesDoEstilo([])),
      center: config.mapa.centro,
      zoom: config.mapa.zoom,
      minZoom: 11,
      maxZoom: largo ? ZOOM_MAX_LARGO : ZOOM_MAX_ESTREITO,
      pitch: largo ? INCLINACAO_INICIAL : 0,
      // No telemóvel, sempre de cima: sem inclinação nenhuma, nem com 2 dedos (não há botão para voltar).
      maxPitch: largo ? INCLINACAO_MAX : 0,
      touchPitch: largo,
      // A atribuição é obrigatória (ODbL, DGT) e compacta: aberta ao carregar, recolhe para o ⓘ ao mexer no mapa.
      // A da vista aérea junta-se sozinha, pela fonte, quando a camada está ligada (ADR-0045, ponto 4).
      attributionControl: { compact: true, customAttribution: ATRIBUICAO_MAPA },
      // O ⓘ da atribuição em português (o MapLibre diz «Toggle attribution»).
      locale: { "AttributionControl.ToggleAttribution": "Atribuição" },
      dragRotate: false,
      // Com o «3D», arrastar com o botão direito (ou com Ctrl) roda e inclina (até ao céu, ADR-0042). Sem isto, só rodava:
      // o rato nunca passava dos 55° do botão, e o céu, que só se vê acima de ~70°, não aparecia. Fora do 3D o arrasto está desligado.
      pitchWithRotate: true,
    });
    // Depois de o estilo carregar, mede-se o desempenho com a vista inclinada, numa amostra de 3 s: abaixo de 30 fps, o mapa fica de
    // cima (ADR-0037, ponto 6). Não se espera pelo «idle»: com os carros a andar, o mapa nunca fica parado e o «idle» não chega.
    if (largo)
      m.once("load", () => {
        void medir(AMOSTRA_FPS_MS).then((fps) => {
          // A decisão fica no contentor (`data-recuo`, `data-fps`) para o `gravar-demo` a ler e não gravar sem os modelos:
          // os .glb carregam-se mesmo quando o mapa recua, por isso só a app sabe se eles ficam no ecrã.
          if (contentor.current) {
            contentor.current.dataset.recuo = fps < FPS_MINIMO ? "sim" : "nao";
            // Arredonda-se para baixo: entre 29,5 e 30 fps a app recua, e o número não pode dizer «30».
            contentor.current.dataset.fps = String(Math.floor(fps));
          }
          if (fps < FPS_MINIMO && mapa.current) {
            semModelos.current = true;
            setSemInclinacao(true);
          }
        });
      });
    m.touchZoomRotate.disableRotation();
    m.on("rotate", () => setRumo(m.getBearing()));
    m.on("zoom", () => {
      contentor.current?.classList.toggle("mapa--longe", m.getZoom() < 16);
      setZoomAlto(m.getZoom() >= ZOOM_PRENDER);
    });
    m.on("click", (e) => {
      // Clicar fora de um marcador e do pop-up fecha-o (num marcador, o próprio marcador trata do clique).
      const alvo = e.originalEvent.target as Element | null;
      const caixa: [PointLike, PointLike] = [
        [e.point.x - 6, e.point.y - 6],
        [e.point.x + 6, e.point.y + 6],
      ];
      // Uma passadeira desenhada abre o pop-up do seu sensor, como o marcador (ADR-0038); fica por cima das ruas.
      const passadeira =
        alvo?.closest(".marcador-mapa, .maplibregl-popup") || !m.getLayer(CAMADA_PASSADEIRAS)
          ? undefined
          : m.queryRenderedFeatures(e.point, { layers: [CAMADA_PASSADEIRAS] })[0];
      if (passadeira?.properties?.id) {
        callbacks.current.onSelecionar(passadeira.properties.id as string);
        return;
      }
      const rua = alvo?.closest(".marcador-mapa, .maplibregl-popup") ? undefined : m.queryRenderedFeatures(caixa, { layers: [...CAMADAS_RUAS] })[0];
      // Um troço medido abre o seu pop-up, como um sensor (sem fechar a lista aberta).
      if (rua?.layer.id.startsWith("ruas-com-sensor") && rua.properties?.id) {
        callbacks.current.onSelecionar(rua.properties.id as string);
        return;
      }
      // No corredor da avenida, a linha sai a partir do zoom 16 e o troço clica-se no asfalto (ADR-0044): abre o troço em falha,
      // se houver, senão o 1.º do troço desenhado. O MapLibre devolve as listas das propriedades como texto JSON.
      const asfalto =
        alvo?.closest(".marcador-mapa, .maplibregl-popup") || !m.getLayer("avenida-asfalto")
          ? undefined
          : m.queryRenderedFeatures(e.point, { layers: ["avenida-asfalto"] })[0];
      if (asfalto?.properties?.segmentos) {
        const bruto = asfalto.properties.segmentos as string | string[];
        const segmentos: string[] = typeof bruto === "string" ? JSON.parse(bruto) : bruto;
        const id = segmentos.find((x) => trocosAtuais.current.includes(x)) ?? segmentos[0];
        if (id) {
          callbacks.current.onSelecionar(id);
          return;
        }
      }
      if (janela.current && !alvo?.closest(".marcador-mapa, .maplibregl-popup")) callbacks.current.onFecharPopup();
      else if (!alvo?.closest(".marcador-mapa")) callbacks.current.onVazio?.();
      // Uma rua sem cobertura abre o painel da rua.
      if (rua?.layer.id === "ruas-sem-cobertura") callbacks.current.onRua((rua.properties?.name as string | undefined) ?? null);
    });
    // Ao passar o rato num carro, a velocidade do seu grupo, sempre (ADR-0039, ponto 3): «47 km/h», e se passa o limite.
    const dica = new Popup({ closeButton: false, closeOnClick: false, focusAfterOpen: false, offset: 10, className: "dica-carro" });
    m.on("mousemove", (e) => {
      const caixa: [PointLike, PointLike] = [
        [e.point.x - 6, e.point.y - 6],
        [e.point.x + 6, e.point.y + 6],
      ];
      const carro = m.getLayer("carros") ? m.queryRenderedFeatures(caixa, { layers: ["carros"] })[0] : undefined;
      const kmh = carro?.properties?.kmh as number | undefined;
      if (carro && kmh !== undefined && carro.geometry.type === "Point") {
        dica.setLngLat(carro.geometry.coordinates as [number, number]).setText(textoDaVelocidade(kmh, carro.properties?.acima === true)).addTo(m);
      } else dica.remove();
    });
    // Ao sair do mapa ou ao clicar, a dica sai: não fica por cima do pop-up nem de outra parte do ecrã.
    m.on("mouseout", () => dica.remove());
    m.on("click", () => dica.remove());
    for (const camada of ["ruas-com-sensor", "ruas-com-sensor-corredor"]) {
      m.on("mouseenter", camada, () => (m.getCanvas().style.cursor = "pointer"));
      m.on("mouseleave", camada, () => (m.getCanvas().style.cursor = ""));
    }
    m.on("mouseenter", CAMADA_PASSADEIRAS, () => (m.getCanvas().style.cursor = "pointer"));
    m.on("mouseenter", "avenida-asfalto", () => (m.getCanvas().style.cursor = "pointer"));
    m.on("mouseleave", "avenida-asfalto", () => (m.getCanvas().style.cursor = ""));
    m.on("mouseleave", CAMADA_PASSADEIRAS, () => (m.getCanvas().style.cursor = ""));
    m.once("load", () => (carregado.current = true));
    m.once("style.load", () => (estiloPronto.current = true));
    // A camada 3D entra depois do estilo e volta a entrar depois de cada setStyle (que só conhece as camadas do estilo).
    const camada = new Camada3D(config.mapa.centro, () => estado3d.current);
    camada3d.current = camada;
    // Os semáforos e os sinais H7 (vista 3D): sempre que a vista é a dos modelos, com ou sem o «Trânsito».
    const mobiliario = new CamadaMobiliario(config.mapa.centro, () => luzAtual.current);
    mobiliario.definir(mobiliarioAtual.current ?? []);
    camadaMobiliario.current = mobiliario;
    const verCamada = () => {
      // Como a camada 3D: só entra quando o estilo já tem as camadas dos carros. Antes disso, o addLayer apanhava o estilo a
      // meio de carregar, a camada ficava duas vezes («already exists») e o estilo rebentava («Style is not done loading»).
      if (!m.getLayer(ID_CAMADA_MOBILIARIO) && m.getLayer("carros-excesso-contorno")) m.addLayer(mobiliario, "carros-excesso-contorno");
      const comMobiliario = largoAtual.current && !semModelos.current && m.getPitch() >= INCLINACAO_MODELOS && m.getZoom() >= ZOOM_MODELOS;
      if (comMobiliario !== mobiliario.ativa) {
        mobiliario.ativa = comMobiliario;
        m.triggerRepaint();
      }
      if (!m.getLayer(ID_CAMADA_3D) && m.getLayer("carros")) m.addLayer(camada, "carros-excesso-contorno");
      const ativa =
        largoAtual.current &&
        !semModelos.current &&
        modelosAtuais.current !== null &&
        m.getPitch() >= INCLINACAO_MODELOS &&
        m.getZoom() >= ZOOM_MODELOS;
      if (ativa !== camada.ativa) {
        camada.ativa = ativa;
        callbacks.current.onModelos?.(ativa);
        // Com os modelos, o ponto neutro sai; o anel de excesso e o número ficam, à volta de cada modelo (ADR-0041, ponto 5).
        if (m.getLayer("carros")) {
          // Sem os modelos, volta a opacidade do estilo: a do «Ao vivo» depende do zoom e dos parados (ADR-0055).
          for (const camadaDePontos of ["carros", CAMADA_PEOES])
            if (m.getLayer(camadaDePontos)) {
              m.setPaintProperty(camadaDePontos, "circle-opacity", ativa ? OPACIDADE_PONTOS_3D : OPACIDADE_PONTOS);
              m.setPaintProperty(camadaDePontos, "circle-stroke-opacity", ativa ? OPACIDADE_PONTOS_3D : OPACIDADE_PONTOS);
            }
        }
        m.triggerRepaint();
      }
    };
    m.on("styledata", () => {
      camada.ativa = false; // o setStyle repõe a opacidade dos pontos: decide-se outra vez
      verCamada();
    });
    m.on("move", verCamada);
    verCamadaRef.current = verCamada;
    mapa.current = m;
    // A barra lateral abre e fecha: o mapa muda de largura sem a janela mudar, e o MapLibre tem de saber.
    const observador = typeof ResizeObserver === "undefined" ? null : new ResizeObserver(() => m.resize());
    observador?.observe(contentor.current as HTMLDivElement);
    // Só em desenvolvimento: permite inspecionar a câmara no browser (verificação visual com o Playwright).
    if (import.meta.env.DEV) (window as unknown as { __mapa?: MapaMapLibre }).__mapa = m;
    const marcadores = instancias.current;
    return () => {
      observador?.disconnect();
      marcadores.clear();
      m.remove();
      mapa.current = null;
    };
  }, []);

  // «Ao vivo» (ADR-0055): os números das estações. Depois de um setStyle a fonte volta vazia, por isso repõe-se no «styledata».
  useEffect(() => {
    const m = mapa.current;
    if (!m) return;
    const dados = {
      type: "FeatureCollection" as const,
      features: (rotulos ?? []).map((r) => ({
        type: "Feature" as const,
        properties: { texto: r.texto },
        geometry: { type: "Point" as const, coordinates: [r.lon, r.lat] },
      })),
    };
    const aplicar = () => (m.getSource(FONTE_ROTULOS_VIVO) as GeoJSONSource | undefined)?.setData(dados);
    aplicar();
    m.on("styledata", aplicar);
    return () => {
      m.off("styledata", aplicar);
    };
  }, [rotulos]);

  // Tema e ruas cobertas: o estilo reconstrói-se e o MapLibre aplica só as diferenças.
  useEffect(() => {
    const m = mapa.current;
    if (!m) return;
    const aplicar = () => m.setStyle(construirEstilo(lerCores(undefined, luzAtual.current), opcoesDoEstilo(trocosEmFalha, passadeirasAtuais.current, avenidaAtual.current, edificiosAtuais.current, realce)));
    // Antes de o estilo ser lido não há diferenças a aplicar: espera-se por ele, para não reconstruir tudo. Não se espera pelo
    // «load», que pode não chegar.
    if (estiloPronto.current) aplicar();
    else m.once("style.load", aplicar);
    return () => {
      m.off("style.load", aplicar);
    };
  }, [tema, trocosEmFalha, passadeiras, avenida, edificiosMedidos, realce]);

  // Os mapas de calor (ADR-0047): as nuvens da hora vão para as fontes; depois de um setStyle as fontes voltam vazias, e repõem-se.
  const peoesCalor = calor?.peoes ?? null;
  const veiculosCalor = calor?.veiculos ?? null;
  useEffect(() => {
    const m = mapa.current;
    if (!m) return;
    const vazia = { type: "FeatureCollection" as const, features: [] };
    const pintar = () => {
      (m.getSource("calor-peoes") as GeoJSONSource | undefined)?.setData(peoesCalor ?? vazia);
      (m.getSource("calor-veiculos") as GeoJSONSource | undefined)?.setData(veiculosCalor ?? vazia);
    };
    if (carregado.current) pintar();
    else m.once("load", pintar);
    m.on("styledata", pintar);
    return () => {
      m.off("load", pintar);
      m.off("styledata", pintar);
    };
  }, [peoesCalor, veiculosCalor]);

  // Os carros (ADR-0034): a fonte «carros» recebe as posições a cada fotograma; com movimento reduzido, ficam parados.
  // Depois de um setStyle (tema, troços) a fonte volta vazia, por isso repinta-se também no «styledata».
  useEffect(() => {
    const m = mapa.current;
    if (!m) return;
    const parado = typeof matchMedia === "function" && matchMedia("(prefers-reduced-motion: reduce)").matches;
    const pintar = (ms: number) => {
      const fonte = m.getSource("carros") as GeoJSONSource | undefined;
      const segundos = ms / 1000;
      const mod = modelosAtuais.current;
      let pontos: { coord: [number, number]; kmh: number | null; acima: boolean; peao?: boolean; vivo?: boolean; parado?: boolean; semModelo?: boolean }[];
      if (camada3d.current?.ativa && mod && carros) {
        const veiculos = mod.veiculos(segundos);
        estado3d.current = {
          veiculos,
          pessoas: mod.pessoas(segundos),
          luz: luzAtual.current,
          aceleracaoPessoas: mod.aceleracaoPessoas,
          aspeto: mod.aspeto,
          parado,
        };
        // Os sem modelo (o moliceiro) continuam como ponto, por cima dos modelos.
        pontos = [...veiculos, ...(mod.semModelo?.(segundos) ?? [])];
      } else {
        estado3d.current = null;
        pontos = carros ? carros(segundos) : [];
      }
      fonte?.setData({
        type: "FeatureCollection",
        // A velocidade do grupo e o excesso vão nas propriedades: o anel e o número desenham-se a partir delas (ADR-0039).
        features: pontos.map((c) => ({
          type: "Feature",
          // No «Ao vivo», os peões levam `peao` e outra cor (ADR-0049).
          properties: {
            acima: c.acima,
            ...(c.kmh === null ? {} : { kmh: c.kmh }),
            ...(c.peao ? { peao: true } : {}),
            ...(c.vivo ? { vivo: true } : {}),
            ...(c.parado ? { parado: true } : {}),
            ...(c.semModelo ? { semModelo: true } : {}),
          },
          geometry: { type: "Point", coordinates: c.coord },
        })),
      });
    };
    let id = 0;
    const fotograma = (ms: number) => {
      pintar(ms);
      id = requestAnimationFrame(fotograma);
    };
    const umaVez = () => pintar(0);
    const iniciar = () => {
      if (carros && !parado) id = requestAnimationFrame(fotograma);
      else umaVez();
      m.on("styledata", umaVez);
    };
    if (carregado.current) iniciar();
    else m.once("load", iniciar);
    return () => {
      cancelAnimationFrame(id);
      m.off("load", iniciar);
      m.off("styledata", umaVez);
    };
  }, [carros]);

  // A luminosidade da hora (ADR-0040): troca-se a paleta do fundo, da água, dos quarteirões, das ruas sem cobertura e dos
  // rótulos, e o MapLibre faz a transição de 600 ms (nenhuma com `prefers-reduced-motion`). Os estados e as ruas com sensor ficam.
  useEffect(() => {
    const m = mapa.current;
    if (!m) return;
    const aplicar = () => aplicarCores(m, lerCores(undefined, luz));
    // O `isStyleLoaded()` fica falso com os carros a mudar a fonte a cada fotograma: depois de o estilo ser lido, a paleta
    // troca-se logo. Espera-se pelo «style.load», e não pelo «load», que pode não chegar.
    if (estiloPronto.current) aplicar();
    else m.once("style.load", aplicar);
    return () => {
      m.off("style.load", aplicar);
    };
  }, [luz]);

  // Enquadra uma caixa com folga para as sobreposições (camadas e legenda em cima, cursor de tempo em baixo) e para os
  // rótulos: de lado, cabe um rótulo inteiro («SC0021 · estimado» ≈ 130 px). No telemóvel o mapa é pequeno e o cursor
  // de tempo está fora dele. Sem caixa, enquadra a zona da demo.
  // Com a caixa dos sítios, a folga em cima e em baixo conta-se a partir da parte visível (sem a barra da hora por
  // baixo, ou a folha no telemóvel), com o mesmo tanto dos dois lados: os sítios ficam no centro do que se vê.
  const enquadrarCaixa = useCallback(
    (caixa: Caixa | null, duration: number) => {
      const m = mapa.current;
      if (!m || !enquadrar) return;
      const pequeno = (contentor.current?.clientWidth ?? 0) < 600;
      let padding = pequeno ? { top: 56, bottom: 30, left: 135, right: 135 } : { top: 140, bottom: 150, left: 140, right: 140 };
      if (caixa && contentor.current) {
        const tapado = tapadoAgora(contentor.current);
        const folga = pequeno ? 56 : 110;
        padding = { ...padding, top: folga + tapado.cima, bottom: folga + tapado.baixo };
      }
      const zona = pequeno ? enquadrar.soPassadeiras : enquadrar.comRsu;
      m.fitBounds(caixa ?? zona, { padding, maxZoom: pequeno ? 17.7 : 18.3, duration });
    },
    [enquadrar],
  );

  useEffect(() => {
    if (!mapa.current || !enquadrar || enquadrado.current) return;
    enquadrarCaixa(null, 0);
    enquadrado.current = true;
  }, [enquadrar, enquadrarCaixa]);

  const comSitios = useRef(false);
  useEffect(() => {
    if (!enquadrado.current || (!enquadrarSitios && !comSitios.current)) return;
    const suave = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches ? 0 : 600;
    enquadrarCaixa(enquadrarSitios, suave);
    comSitios.current = enquadrarSitios !== null;
  }, [enquadrarSitios, enquadrarCaixa]);

  useEffect(() => {
    const m = mapa.current;
    if (!m) return;
    const vivos = instancias.current;
    const ids = new Set(marcadores.map((x) => x.id));
    for (const [id, { marcador }] of vivos) {
      if (!ids.has(id)) {
        marcador.remove();
        vivos.delete(id);
      }
    }
    for (const x of marcadores) {
      let inst = vivos.get(x.id);
      if (!inst) {
        const el = document.createElement("button");
        el.type = "button";
        el.addEventListener("click", (e) => {
          e.stopPropagation();
          callbacks.current.onSelecionar(x.id);
        });
        const contentorDoMarcador = document.createElement("div");
        contentorDoMarcador.appendChild(el);
        inst = { el, marcador: new Marker({ element: contentorDoMarcador, anchor: "center" }).setLngLat([x.lon, x.lat]).addTo(m) };
        vivos.set(x.id, inst);
      }
      preencherMarcador(inst.el, x);
      inst.marcador.getElement().style.zIndex = x.daZona ? "2" : "1";
    }
  }, [marcadores]);

  // A partir do zoom 17 o marcador da passadeira prende-se a uma ponta do polígono, no passeio, 18 px para fora dela (o marcador
  // de 28 px, ao centro, tapava cerca de três quartos da passadeira). Abaixo, volta ao centro: só se vê o marcador.
  useEffect(() => {
    for (const x of marcadores) {
      const inst = instancias.current.get(x.id);
      const ponta = pontas?.[x.id];
      if (!inst) continue;
      if (zoomAlto && ponta) {
        // Este e norte para o ecrã: o norte é para cima, ou seja, y negativo.
        inst.marcador.setLngLat([ponta.lon, ponta.lat]).setOffset([ponta.saida[0] * DISTANCIA_PRESO_PX, -ponta.saida[1] * DISTANCIA_PRESO_PX]);
      } else {
        inst.marcador.setLngLat([x.lon, x.lat]).setOffset([0, 0]);
      }
    }
  }, [marcadores, pontas, zoomAlto]);

  // A inclinação segue o ecrã, o botão «3D» e o recuo: 55° com rotação no 3D; senão 25° (ou de cima), com o norte para cima.
  // Com `prefers-reduced-motion`, sem animação de câmara (ADR-0037, ponto 5).
  const primeiraInclinacao = useRef(true);
  useEffect(() => {
    const m = mapa.current;
    if (!m) return;
    // Ao passar de ecrã largo a estreito (ou ao contrário), a inclinação permitida acompanha: no estreito, nenhuma.
    m.setMaxPitch(largo ? (tresD ? INCLINACAO_MAX_3D : INCLINACAO_MAX) : 0);
    m.setMaxZoom(largo ? ZOOM_MAX_LARGO : ZOOM_MAX_ESTREITO);
    if (largo) m.touchPitch.enable();
    else m.touchPitch.disable();
    const emTresD = tresD && largo;
    // Com o «3D», roda-se 360° com o rato e com Shift e as setas (ADR-0042, ponto 3); sem ele, o norte fica para cima.
    if (emTresD) {
      m.dragRotate.enable();
      m.keyboard?.enableRotation();
    } else {
      m.dragRotate.disable();
      m.keyboard?.disableRotation();
    }
    if (primeiraInclinacao.current) {
      primeiraInclinacao.current = false;
      if (!emTresD && inclinacaoBase === (largo ? INCLINACAO_INICIAL : 0)) return; // o mapa já abriu assim
    }
    const camara = emTresD ? { pitch: INCLINACAO_3D } : { pitch: inclinacaoBase, bearing: 0 };
    m.easeTo({ ...camara, duration: semMovimento() ? 0 : 600 });
  }, [tresD, largo, inclinacaoBase]);

  // A vista aérea (ADR-0045): liga-se e escurece com a hora; depois de um setStyle volta escondida, e repõe-se.
  useEffect(() => {
    const m = mapa.current;
    if (!m) return;
    const aplicar = () => {
      if (!m.getLayer(CAMADA_AEREA)) return;
      m.setLayoutProperty(CAMADA_AEREA, "visibility", vistaAerea ? "visible" : "none");
      m.setPaintProperty(CAMADA_AEREA, "raster-brightness-max", BRILHO_AEREA[luz]);
      // Com a fotografia, os edifícios da zona ficam quase transparentes, para se verem os telhados reais (sem os pintar). Só dentro
      // do recorte: são os edifícios medidos pelo LiDAR (ADR-0050), que estão na caixa da fotografia;
      // os dos tiles, fora dela, ficam como estão. Na vista 3D ficam quase sólidos: inclinados, a 0,3 pareciam fantasmas,
      // e de lado já não tapam os telhados.
      const opacidade = !vistaAerea ? OPACIDADE_EDIFICIOS : tresD && largo ? OPACIDADE_EDIFICIOS_AEREA_3D : OPACIDADE_EDIFICIOS_AEREA;
      if (m.getLayer(CAMADA_EDIFICIOS_ZONA)) m.setPaintProperty(CAMADA_EDIFICIOS_ZONA, "fill-extrusion-opacity", opacidade);
    };
    if (estiloPronto.current) aplicar();
    else m.once("style.load", aplicar);
    m.on("styledata", aplicar);
    return () => {
      m.off("style.load", aplicar);
      m.off("styledata", aplicar);
    };
  }, [vistaAerea, luz, tresD, largo]);

  // Os semáforos e os sinais mudam com os dados das passadeiras (chegam depois do mapa).
  useEffect(() => {
    camadaMobiliario.current?.definir(mobiliario ?? []);
    mapa.current?.triggerRepaint();
  }, [mobiliario]);

  // Pop-up preso ao marcador: o MapLibre posiciona-o e o React desenha o conteúdo dentro dele (portal).
  const id = popup?.id;
  const lon = popup?.lon;
  const lat = popup?.lat;
  const centrar = popup?.centrar;
  const preso = conteudoPopup !== null && conteudoPopup !== undefined;
  useEffect(() => {
    const m = mapa.current;
    if (!m) return;
    if (id === undefined || lon === undefined || lat === undefined) {
      const aberta = janela.current;
      janela.current = null;
      aberta?.remove();
      return;
    }
    // O alvo vai para o centro da parte visível do mapa, sem a barra da hora nem a folha do telemóvel. Com o pop-up
    // preso, o sensor só desce o que falta para o pop-up, que abre por cima dele, caber no mapa.
    const mover = (popup: number) => {
      const caixa = contentor.current?.getBoundingClientRect();
      const altura = caixa?.height || m.getContainer().clientHeight;
      const offset = deslocamentoDoAlvo(altura, contentor.current ? tapadoAgora(contentor.current) : { cima: 0, baixo: 0 }, popup);
      m.easeTo({ center: [lon, lat], offset, duration: 400 });
    };
    if (!preso) {
      if (centrar) mover(0);
      const aberta = janela.current;
      janela.current = null;
      aberta?.remove();
      return;
    }
    let p = janela.current;
    if (!p) {
      p = new Popup({
        closeButton: false,
        closeOnClick: false,
        closeOnMove: false,
        focusAfterOpen: false,
        maxWidth: "460px",
        offset: OFFSET_POPUP_PX,
        anchor: "bottom",
        className: "popup-mapa",
      });
      p.setDOMContent(noPopup);
      janela.current = p;
    }
    p.setLngLat([lon, lat]);
    if (!p.isOpen()) p.addTo(m);
    // O conteúdo chega aos poucos (a lista dos sensores da RSU, a linha do tempo): enquanto o pop-up cresce, nos 2 s depois de
    // abrir, o alvo volta a descer o que for preciso para ele caber.
    const el = p.getElement();
    let altura = -1;
    const ajustar = () => {
      const h = el?.offsetHeight ?? 0;
      if (Math.abs(h - altura) < 8) return;
      altura = h;
      mover(h + OFFSET_POPUP_PX);
    };
    ajustar();
    const observador = el && typeof ResizeObserver !== "undefined" ? new ResizeObserver(ajustar) : null;
    if (observador && el) observador.observe(el);
    const fim = setTimeout(() => observador?.disconnect(), 2000);
    // Se a pessoa mexer no mapa nesse tempo, o mapa fica onde ela o pôs.
    const parar = () => observador?.disconnect();
    const gestos = ["dragstart", "wheel", "touchstart"] as const;
    for (const g of gestos) m.once(g, parar);
    return () => {
      observador?.disconnect();
      clearTimeout(fim);
      for (const g of gestos) m.off(g, parar);
    };
  }, [id, lon, lat, centrar, preso, noPopup]);

  const graus = Math.round(((rumo % 360) + 360) % 360);
  const bussola = (
    <button
      type="button"
      className="ferramenta bussola"
      aria-label="Norte para cima"
      title={`Norte para cima (rumo: ${graus}°)`}
      onClick={() => mapa.current?.easeTo({ bearing: 0, duration: semMovimento() ? 0 : 400 })}
    >
      <span className="bussola__agulha" style={{ transform: `rotate(${-rumo}deg)` }}>
        <Icone nome="norte" />
      </span>
    </button>
  );

  return (
    <>
      {preso && createPortal(conteudoPopup, noPopup)}
      {largo && alvoBussola && createPortal(bussola, alvoBussola)}
      <div ref={contentor} className="mapa" aria-label="Mapa da zona" role="region" />
      <div className="zoom sobreposto" role="group" aria-label="Zoom">
        <button type="button" className="ferramenta" aria-label="Aproximar" title="Aproximar" onClick={() => mapa.current?.zoomIn()}>
          <Icone nome="mais" />
        </button>
        <button type="button" className="ferramenta" aria-label="Afastar" title="Afastar" onClick={() => mapa.current?.zoomOut()}>
          <Icone nome="menos" />
        </button>
        {largo && (
          <button
            type="button"
            className="ferramenta ferramenta--3d"
            aria-pressed={tresD}
            aria-label="Vista 3D"
            title={tresD ? "Voltar à vista inclinada, com o norte para cima" : "Vista 3D: inclinar a 55°. Para rodar e inclinar até ao céu, arrastar com o botão direito (ou Ctrl + arrastar)"}
            onClick={() => setTresD(!tresD)}
          >
            3D
          </button>
        )}
      </div>
    </>
  );
}
