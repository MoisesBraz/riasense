/**
 * A camada 3D do mapa (ADR-0041, ponto 7): uma camada à medida do MapLibre desenhada com o Three.js, com os veículos medidos (com o
 * tipo medido) e os peões nas passadeiras. Os `.glb` vêm de `public/modelos/` (fontes e licenças no `LICENCAS.md` ao lado) e lêem-se
 * com o descodificador meshopt que vem com o Three.js, sem rede (ADR-0014). As posições chegam de fora a cada fotograma, do mesmo
 * relógio dos pontos; esta camada só desenha.
 */
import type { CustomLayerInterface, CustomRenderMethodInput, Map as MapaMapLibre } from "maplibre-gl";
import { MercatorCoordinate } from "maplibre-gl";
import {
  AmbientLight,
  AnimationMixer,
  Camera,
  DirectionalLight,
  InstancedMesh,
  Matrix4,
  Mesh,
  MeshStandardMaterial,
  Object3D,
  Quaternion,
  Scene,
  SkinnedMesh,
  Vector3,
  WebGLRenderer,
  type Material,
} from "three";
import { GLTFLoader, type GLTF } from "three/examples/jsm/loaders/GLTFLoader.js";
import { MeshoptDecoder } from "three/examples/jsm/libs/meshopt_decoder.module.js";
import { clone as clonarComEsqueleto } from "three/examples/jsm/utils/SkeletonUtils.js";
import type { Categoria, Veiculo3D } from "../../dominio/carros";
import type { Pessoa3D } from "../../dominio/peoes";
import type { Luz } from "./estilo";

export const ID_CAMADA_3D = "modelos-3d";

/** O modelo de cada tipo medido (ADR-0041, ponto 2): os ligeiros têm 2 variantes. */
const MODELOS_VEICULOS: Record<Categoria, string[]> = {
  A: ["veiculo_mota"],
  B: ["veiculo_ligeiro", "veiculo_ligeiro_b"],
  C: ["veiculo_camiao"],
  D: ["veiculo_autocarro"],
};
const MODELOS_PESSOAS = ["homem_a", "mulher_a", "homem_b", "mulher_b", "homem_c", "mulher_c", "homem_d", "mulher_d"].map((n) => `pessoa_${n}`);
/** Os veículos de um modelo, no máximo, por fotograma (o teto total é `carros.pontos_max`). */
const MAX_INSTANCIAS = 600;
/** Silhuetas neutras (opção a): um material único, numa cor neutra como os veículos. */
const COR_NEUTRA = 0xb9bec7;
/** As figuras estimadas (②) e previstas (③) ficam translúcidas (ADR-0041, ponto 9), como o tracejado dos estimados. */
const OPACIDADE_ESTIMADO = 0.55;

/** A versão translúcida de um material: vê-se através dela, e não esconde o que está por trás. */
function translucido<M extends Material>(m: M): M {
  const c = m.clone() as M;
  c.transparent = true;
  c.opacity = OPACIDADE_ESTIMADO;
  c.depthWrite = false;
  return c;
}
/** A intensidade da luz em cada luminosidade (ADR-0040): de noite, os modelos escurecem como os edifícios. */
const LUZ: Record<Luz, { ambiente: number; sol: number }> = {
  dia: { ambiente: 1.4, sol: 2.2 },
  crepusculo: { ambiente: 0.9, sol: 1.0 },
  noite: { ambiente: 0.55, sol: 0.35 },
};

export interface Estado3D {
  veiculos: Veiculo3D[];
  pessoas: Pessoa3D[];
  luz: Luz;
  /** O fator do passo das figuras: a animação de andar acelera na mesma proporção (ADR-0041, ponto 3). */
  aceleracaoPessoas: number;
  aspeto: "neutro" | "variado";
  /** Com `prefers-reduced-motion`, as figuras ficam paradas (na mesma quantidade). */
  parado: boolean;
}

/**
 * A base de cada modelo de pessoa: a cena original (fora da cena desenhada, na origem) com um só esqueleto animado, e as figuras que o
 * partilham. Cada figura é só uma malha com o esqueleto em modo «detached»: a animação calcula-se uma vez por modelo e não por figura
 * (com um esqueleto por figura, os peões levavam o mapa de 80 para 39 fps).
 */
interface Pose {
  raiz: Object3D;
  mixer: AnimationMixer | null;
  malhas: SkinnedMesh[];
}
interface ModeloPessoa {
  /** Dois esqueletos por modelo: um a andar (a atravessar) e outro parado (à espera no passeio). */
  andar: Pose;
  parado: Pose;
  /** Cada figura tem as duas versões, e só uma está à vista. */
  figuras: Figura[];
  /** As figuras translúcidas, das passadeiras estimadas ou previstas (ADR-0041, ponto 9). */
  estimadas: Figura[];
}
interface Figura {
  raiz: Object3D;
  andar: Object3D;
  parado: Object3D;
}

const urlModelo = (nome: string) => `${import.meta.env.BASE_URL}modelos/${nome}.glb`;

/** O ângulo em torno do eixo vertical que leva a frente do modelo (+Z no glTF) ao rumo (graus a partir do norte). */
const rotacaoDoRumo = (rumo: number) => Math.PI - (rumo * Math.PI) / 180;

export class Camada3D implements CustomLayerInterface {
  readonly id = ID_CAMADA_3D;
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
  private readonly origem: MercatorCoordinate;
  private readonly escala: number;
  private readonly veiculos = new Map<string, { im: InstancedMesh; local: Matrix4 }[]>();
  /** Os mesmos modelos, translúcidos: os veículos estimados (②) e previstos (③). */
  private readonly veiculosEstimados = new Map<string, { im: InstancedMesh; local: Matrix4 }[]>();
  private readonly pessoas: ModeloPessoa[] = [];
  private readonly neutro = new MeshStandardMaterial({ color: COR_NEUTRA, roughness: 0.85, metalness: 0 });
  private readonly neutroEstimado = translucido(this.neutro);
  /** As versões translúcidas dos materiais das figuras variadas (opção b), uma por material. */
  private readonly materiaisEstimados = new Map<string, Material>();
  private ultimo = performance.now();
  private readonly auxiliar = new Matrix4();

  constructor(
    centro: [number, number],
    private readonly estado: () => Estado3D | null,
  ) {
    this.origem = MercatorCoordinate.fromLngLat(centro, 0);
    this.escala = this.origem.meterInMercatorCoordinateUnits();
    this.sol.position.set(-40, 80, 30);
    this.cena.add(this.ambiente, this.sol);
  }

  onAdd(mapa: MapaMapLibre, gl: WebGLRenderingContext | WebGL2RenderingContext) {
    this.mapa = mapa;
    this.renderer = new WebGLRenderer({ canvas: mapa.getCanvas(), context: gl, antialias: true });
    this.renderer.autoClear = false;
    const leitor = new GLTFLoader().setMeshoptDecoder(MeshoptDecoder);
    for (const nome of Object.values(MODELOS_VEICULOS).flat())
      leitor.load(urlModelo(nome), (g) => this.prepararVeiculo(nome, g), undefined, () => undefined);
    MODELOS_PESSOAS.forEach((nome, i) =>
      leitor.load(
        urlModelo(nome),
        (g) => (this.pessoas[i] = this.prepararPessoa(g)),
        undefined,
        () => undefined,
      ),
    );
  }

  onRemove() {
    this.renderer?.dispose();
    this.renderer = null;
    this.mapa = null;
  }

  /**
   * Cada malha do veículo passa a uma malha instanciada, com a transformação dentro do modelo já aplicada. Cada modelo tem duas:
   * a opaca (os medidos) e a translúcida (os estimados e os previstos, ADR-0041, ponto 9).
   */
  private prepararVeiculo(nome: string, g: GLTF) {
    g.scene.updateMatrixWorld(true);
    const malhas: { im: InstancedMesh; local: Matrix4 }[] = [];
    const estimadas: { im: InstancedMesh; local: Matrix4 }[] = [];
    g.scene.traverse((o) => {
      if (!(o instanceof Mesh)) return;
      // Sem mapa de ambiente, um material metálico fica preto: os veículos ficam foscos, como o resto do mapa.
      const material = (Array.isArray(o.material) ? o.material : [o.material]).map((x: Material) => {
        const c = x.clone();
        if (c instanceof MeshStandardMaterial) c.metalness = 0;
        return c;
      });
      for (const [lista, mats] of [
        [malhas, material],
        [estimadas, material.map(translucido)],
      ] as const) {
        const im = new InstancedMesh(o.geometry, mats.length === 1 ? mats[0] : [...mats], MAX_INSTANCIAS);
        im.count = 0;
        im.frustumCulled = false;
        // A transformação da malha dentro do modelo multiplica-se em cada instância: a geometria vem quantizada (meshopt) e não se
        // pode transformar no sítio.
        lista.push({ im, local: o.matrixWorld.clone() });
        this.cena.add(im);
      }
    });
    this.veiculos.set(nome, malhas);
    this.veiculosEstimados.set(nome, estimadas);
  }

  /** A posição no mapa em metros à volta da origem: x para este, z para sul (o Y do Three.js é a vertical). */
  private local([lon, lat]: [number, number]): Vector3 {
    const m = MercatorCoordinate.fromLngLat([lon, lat], 0);
    return new Vector3((m.x - this.origem.x) / this.escala, 0, (m.y - this.origem.y) / this.escala);
  }

  private desenharVeiculos(veiculos: Veiculo3D[]) {
    const porModelo = new Map<string, Matrix4[]>();
    const eixo = new Vector3(0, 1, 0);
    const um = new Vector3(1, 1, 1);
    for (const v of veiculos) {
      const opcoes = MODELOS_VEICULOS[v.categoria];
      const nome = opcoes[v.variante % opcoes.length];
      const k = v.escala ?? 1;
      if (k <= 0) continue;
      const m = new Matrix4().compose(this.local(v.coord), new Quaternion().setFromAxisAngle(eixo, rotacaoDoRumo(v.rumo)), um.clone().setScalar(k));
      const chave = v.estimado ? `${nome}|estimado` : nome;
      porModelo.set(chave, [...(porModelo.get(chave) ?? []), m]);
    }
    for (const [modelos, sufixo] of [
      [this.veiculos, ""],
      [this.veiculosEstimados, "|estimado"],
    ] as const) {
      for (const [nome, malhas] of modelos) {
        const matrizes = (porModelo.get(nome + sufixo) ?? []).slice(0, MAX_INSTANCIAS);
        for (const { im, local } of malhas) {
          matrizes.forEach((m, i) => im.setMatrixAt(i, this.auxiliar.multiplyMatrices(m, local)));
          im.count = matrizes.length;
          im.instanceMatrix.needsUpdate = true;
        }
      }
    }
  }

  private prepararPessoa(g: GLTF): ModeloPessoa {
    const pose = (raiz: Object3D, nome: RegExp): Pose => {
      const clip = g.animations.find((a) => nome.test(a.name)) ?? g.animations[0];
      const mixer = clip ? new AnimationMixer(raiz) : null;
      if (mixer && clip) mixer.clipAction(clip).play();
      const malhas: SkinnedMesh[] = [];
      raiz.traverse((o) => {
        if (o instanceof SkinnedMesh) malhas.push(o);
      });
      raiz.updateMatrixWorld(true);
      return { raiz, mixer, malhas };
    };
    return { andar: pose(g.scene, /walk/i), parado: pose(clonarComEsqueleto(g.scene), /idle/i), figuras: [], estimadas: [] };
  }

  /** O material de uma figura: neutro (opção a) ou o do modelo (opção b), translúcido se ela for estimada ou prevista. */
  private materialDaFigura(m: SkinnedMesh, aspeto: Estado3D["aspeto"], estimada: boolean): Material | Material[] {
    if (aspeto === "neutro") return estimada ? this.neutroEstimado : this.neutro;
    if (!estimada) return m.material;
    const um = (x: Material) => {
      const ja = this.materiaisEstimados.get(x.uuid);
      if (ja) return ja;
      const t = translucido(x);
      this.materiaisEstimados.set(x.uuid, t);
      return t;
    };
    return Array.isArray(m.material) ? m.material.map(um) : um(m.material);
  }

  /** As malhas de uma pose ligadas ao esqueleto partilhado dela. */
  private malhasDaPose(pose: Pose, aspeto: Estado3D["aspeto"], estimada: boolean): Object3D {
    const grupo = new Object3D();
    for (const m of pose.malhas) {
      const f = new SkinnedMesh(m.geometry, this.materialDaFigura(m, aspeto, estimada));
      f.bindMode = "detached";
      f.bind(m.skeleton, m.bindMatrix);
      f.frustumCulled = false;
      grupo.add(f);
    }
    return grupo;
  }

  /** Uma figura nova: a versão a andar e a parada, num grupo que se põe no sítio. */
  private novaFigura(modelo: ModeloPessoa, aspeto: Estado3D["aspeto"], estimada: boolean): Figura {
    const raiz = new Object3D();
    const andar = this.malhasDaPose(modelo.andar, aspeto, estimada);
    const parado = this.malhasDaPose(modelo.parado, aspeto, estimada);
    raiz.add(andar, parado);
    this.cena.add(raiz);
    return { raiz, andar, parado };
  }

  private desenharPessoas(pessoas: Pessoa3D[], e: Estado3D, dt: number) {
    const usadas = this.pessoas.map(() => 0);
    const usadasEstimadas = this.pessoas.map(() => 0);
    const eixo = new Vector3(0, 1, 0);
    for (const p of pessoas) {
      const i = p.indice % MODELOS_PESSOAS.length;
      const modelo = this.pessoas[i];
      if (!modelo) continue;
      // As estimadas e as previstas vêm de outra reserva de figuras, translúcidas (ADR-0041, ponto 9).
      const [reserva, contagem] = p.estimado ? [modelo.estimadas, usadasEstimadas] : [modelo.figuras, usadas];
      const figura = reserva[contagem[i]] ?? reserva[reserva.push(this.novaFigura(modelo, e.aspeto, p.estimado === true)) - 1];
      contagem[i]++;
      figura.raiz.visible = true;
      figura.andar.visible = p.andar;
      figura.parado.visible = !p.andar;
      figura.raiz.position.copy(this.local(p.coord));
      figura.raiz.quaternion.setFromAxisAngle(eixo, rotacaoDoRumo(p.rumo));
    }
    // Uma animação por modelo, partilhada pelas suas figuras: os ossos ficam na origem, fora da cena desenhada.
    this.pessoas.forEach((m, i) => {
      if (!m) return;
      m.figuras.slice(usadas[i]).forEach((f) => (f.raiz.visible = false));
      m.estimadas.slice(usadasEstimadas[i]).forEach((f) => (f.raiz.visible = false));
      if (usadas[i] + usadasEstimadas[i] > 0) {
        m.andar.mixer?.update(e.parado ? 0 : dt * e.aceleracaoPessoas);
        m.andar.raiz.updateMatrixWorld(true);
        m.parado.mixer?.update(e.parado ? 0 : dt);
        m.parado.raiz.updateMatrixWorld(true);
      }
    });
  }

  render(_gl: WebGLRenderingContext | WebGL2RenderingContext, opcoes: CustomRenderMethodInput) {
    const agora = performance.now();
    const dt = Math.min(0.1, (agora - this.ultimo) / 1000);
    this.ultimo = agora;
    const e = this.estado();
    if (!this.renderer || !this.mapa || !this.ativa || !e) return;
    this.ambiente.intensity = LUZ[e.luz].ambiente;
    this.sol.intensity = LUZ[e.luz].sol;
    this.desenharVeiculos(e.veiculos);
    this.desenharPessoas(e.pessoas, e, dt);
    // A matriz do MapLibre (Mercator) vezes a da cena: origem no centro da zona, metros, com o Y do Three.js para cima.
    const transformacao = new Matrix4()
      .makeTranslation(this.origem.x, this.origem.y, this.origem.z)
      .scale(new Vector3(this.escala, -this.escala, this.escala))
      .multiply(new Matrix4().makeRotationAxis(new Vector3(1, 0, 0), Math.PI / 2));
    this.camara.projectionMatrix = new Matrix4().fromArray(opcoes.defaultProjectionData.mainMatrix as unknown as number[]).multiply(transformacao);
    this.renderer.resetState();
    this.renderer.render(this.cena, this.camara);
  }
}
