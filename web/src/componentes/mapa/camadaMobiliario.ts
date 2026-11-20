/**
 * Os semáforos e os sinais H7 das passadeiras, na vista 3D: uma camada à medida do MapLibre, ao lado da dos modelos (ADR-0041),
 * mas sempre ligada na vista 3D a partir do zoom 17, com ou sem o «Trânsito». São poucos objetos parados (dois por passadeira),
 * por isso não precisam de instâncias. Os .glb vêm de `public/modelos/` (`web/scripts/modelos/sinalizacao.py`).
 */
import type { CustomLayerInterface, CustomRenderMethodInput, Map as MapaMapLibre } from "maplibre-gl";
import { MercatorCoordinate } from "maplibre-gl";
import { AmbientLight, Camera, Color, DirectionalLight, Group, Matrix4, Mesh, MeshStandardMaterial, Object3D, Scene, Vector3, WebGLRenderer } from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import type { Mobiliario } from "../../dominio/passadeiras";
import { luzesDoSemaforo } from "../../dominio/semaforo";
import type { Luz } from "./estilo";

export const ID_CAMADA_MOBILIARIO = "mobiliario-3d";

/** A luz de cada luminosidade (ADR-0040), como a dos modelos: de noite, os postes escurecem com os edifícios. */
const LUZ: Record<Luz, { ambiente: number; sol: number }> = {
  dia: { ambiente: 1.4, sol: 2.2 },
  crepusculo: { ambiente: 0.9, sol: 1.0 },
  noite: { ambiente: 0.55, sol: 0.35 },
};

const urlModelo = (nome: string) => `${import.meta.env.BASE_URL}modelos/${nome}.glb`;

/** O ângulo em torno do eixo vertical que leva a frente do modelo (+Z no glTF) ao rumo (graus a partir do norte). */
const rotacaoDoRumo = (rumo: number) => Math.PI - (rumo * Math.PI) / 180;

export class CamadaMobiliario implements CustomLayerInterface {
  readonly id = ID_CAMADA_MOBILIARIO;
  readonly type = "custom" as const;
  readonly renderingMode = "3d" as const;
  /** Desenha só quando o Mapa diz (vista inclinada, ecrã largo, zoom ≥ 17). */
  ativa = false;

  private mapa: MapaMapLibre | null = null;
  private renderer: WebGLRenderer | null = null;
  private readonly cena = new Scene();
  private readonly camara = new Camera();
  private readonly ambiente = new AmbientLight(0xffffff, 1);
  private readonly sol = new DirectionalLight(0xffffff, 2);
  private readonly grupo = new Group();
  private readonly origem: MercatorCoordinate;
  private readonly escala: number;
  private readonly modelos = new Map<Mobiliario["tipo"], Object3D>();
  private itens: Mobiliario[] = [];
  /** As lâmpadas do semáforo (`<cor>_lente_<veiculos|peoes>`), partilhadas por todos os semáforos: mudam juntos. */
  private readonly lampadas: { material: MeshStandardMaterial; cor: string; quem: "veiculos" | "peoes"; base: Color }[] = [];
  /** Com «reduzir movimento», as luzes ficam paradas (os peões a verde) e não piscam. */
  private readonly parado = typeof matchMedia === "function" && matchMedia("(prefers-reduced-motion: reduce)").matches;
  private proximaFase: ReturnType<typeof setTimeout> | null = null;

  constructor(
    centro: [number, number],
    private readonly luz: () => Luz,
  ) {
    this.origem = MercatorCoordinate.fromLngLat(centro, 0);
    this.escala = this.origem.meterInMercatorCoordinateUnits();
    this.sol.position.set(-40, 80, 30);
    this.cena.add(this.ambiente, this.sol, this.grupo);
  }

  /** Os semáforos e os sinais a desenhar; refaz o grupo (são poucos). */
  definir(itens: Mobiliario[]) {
    this.itens = itens;
    this.montar();
  }

  onAdd(mapa: MapaMapLibre, gl: WebGLRenderingContext | WebGL2RenderingContext) {
    this.mapa = mapa;
    this.renderer = new WebGLRenderer({ canvas: mapa.getCanvas(), context: gl, antialias: true });
    this.renderer.autoClear = false;
    const leitor = new GLTFLoader();
    for (const tipo of ["semaforo", "peoes", "sinal_h7"] as const)
      leitor.load(
        urlModelo(tipo),
        (g) => {
          if (tipo !== "sinal_h7") this.guardarLampadas(g.scene);
          this.modelos.set(tipo, g.scene);
          this.montar();
          this.mapa?.triggerRepaint();
        },
        undefined,
        () => undefined,
      );
  }

  onRemove() {
    if (this.proximaFase) clearTimeout(this.proximaFase);
    this.renderer?.dispose();
    this.renderer = null;
    this.mapa = null;
  }

  private local([lon, lat]: [number, number]): Vector3 {
    const m = MercatorCoordinate.fromLngLat([lon, lat], 0);
    return new Vector3((m.x - this.origem.x) / this.escala, 0, (m.y - this.origem.y) / this.escala);
  }

  private guardarLampadas(cena: Object3D) {
    cena.traverse((o) => {
      if (!(o instanceof Mesh)) return;
      for (const m of Array.isArray(o.material) ? o.material : [o.material]) {
        const nome = /^(vermelho|amarelo|verde)_lente_(veiculos|peoes)$/.exec(m.name);
        if (nome && m instanceof MeshStandardMaterial && !this.lampadas.some((l) => l.material === m))
          this.lampadas.push({ material: m, cor: nome[1], quem: nome[2] as "veiculos" | "peoes", base: m.color.clone() });
      }
    });
  }

  /** Acende a luz certa de cada cabeça e apaga as outras (escuras, sem emissão); devolve quantos segundos faltam para mudar. */
  private acender(): number {
    const luzes = luzesDoSemaforo(performance.now() / 1000, this.parado);
    for (const l of this.lampadas) {
      const acesa = (l.quem === "veiculos" ? luzes.carros : luzes.peoes) === l.cor;
      l.material.color.copy(l.base).multiplyScalar(acesa ? 1 : 0.12);
      l.material.emissive.copy(acesa ? l.base : new Color(0x000000));
      l.material.emissiveIntensity = acesa ? 2.2 : 0;
    }
    return luzes.faltaS;
  }

  private montar() {
    this.grupo.clear();
    for (const item of this.itens) {
      const modelo = this.modelos.get(item.tipo);
      if (!modelo) continue;
      const o = modelo.clone();
      o.position.copy(this.local(item.coord));
      o.rotation.y = rotacaoDoRumo(item.rumo);
      this.grupo.add(o);
    }
  }

  render(_gl: WebGLRenderingContext | WebGL2RenderingContext, opcoes: CustomRenderMethodInput) {
    if (!this.renderer || !this.mapa || !this.ativa || this.grupo.children.length === 0) return;
    const l = LUZ[this.luz()];
    this.ambiente.intensity = l.ambiente;
    this.sol.intensity = l.sol;
    // A matriz do MapLibre (Mercator) vezes a da cena: origem no centro da zona, metros, com o Y do Three.js para cima.
    const transformacao = new Matrix4()
      .makeTranslation(this.origem.x, this.origem.y, this.origem.z)
      .scale(new Vector3(this.escala, -this.escala, this.escala))
      .multiply(new Matrix4().makeRotationAxis(new Vector3(1, 0, 0), Math.PI / 2));
    this.camara.projectionMatrix = new Matrix4().fromArray(opcoes.defaultProjectionData.mainMatrix as unknown as number[]).multiply(transformacao);
    const falta = this.acender();
    this.renderer.resetState();
    this.renderer.render(this.cena, this.camara);
    // Só se volta a desenhar quando a luz muda (não a cada fotograma): o mapa pode estar parado.
    if (this.proximaFase) clearTimeout(this.proximaFase);
    this.proximaFase = Number.isFinite(falta) ? setTimeout(() => this.mapa?.triggerRepaint(), falta * 1000 + 30) : null;
  }
}
