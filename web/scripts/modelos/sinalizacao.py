"""Os modelos da sinalização das passadeiras, para a camada 3D (ADR-0041): o semáforo e o sinal H7, em .glb leve.

Formas e cores pelo Regulamento de Sinalização do Trânsito (Decreto Regulamentar n.º 22-A/98), em versão simplificada:
- **H7 «Passagem para peões»**: placa quadrada azul de 0,60 m, com um triângulo branco e, dentro, um peão preto sobre a zebra;
  o verso é cinzento (alumínio). Poste cinzento, com a placa a 2,2 m do chão.
- **Semáforo**: poste cinzento-escuro de 3,4 m; a cabeça dos veículos (vermelho, amarelo e verde, de cima para baixo) a 2,4 m,
  virada para +Z; a cabeça dos peões (vermelho em cima, verde em baixo) a 2,1 m, virada para +X, para o outro lado da
  passadeira. Cada lente tem o seu material (`<cor>_lente_veiculos` ou `<cor>_lente_peoes`), apagado: é a camada 3D que acende
  a luz certa de cada fase (camadaMobiliario.ts).

1 unidade = 1 m; Y para cima no glTF; a frente é +Z, como nos veículos. Corre sem interface:
    blender -b --factory-startup --python-exit-code 1 -P web/scripts/modelos/sinalizacao.py -- web/public/modelos
"""

import math
import sys
from pathlib import Path

import bmesh
import bpy

DESTINO = Path(sys.argv[sys.argv.index("--") + 1]) if "--" in sys.argv else Path("web/public/modelos")

CORES = {
    "poste": (0.33, 0.35, 0.37), "caixa": (0.05, 0.05, 0.06), "verso": (0.62, 0.64, 0.66),
    "azul": (0.0, 0.25, 0.65), "branco": (0.95, 0.95, 0.95), "preto": (0.02, 0.02, 0.02),
    "vermelho": (0.75, 0.05, 0.04), "amarelo": (0.85, 0.55, 0.02), "verde": (0.05, 0.6, 0.25),
}


def limpar():
    for ob in list(bpy.data.objects):
        bpy.data.objects.remove(ob, do_unlink=True)
    for m in list(bpy.data.meshes):
        bpy.data.meshes.remove(m)
    for m in list(bpy.data.materials):
        bpy.data.materials.remove(m)


def material(nome: str, emissao: float = 0.0):
    m = bpy.data.materials.get(nome)
    if m:
        return m
    m = bpy.data.materials.new(nome)
    bsdf = next(n for n in m.node_tree.nodes if n.type == "BSDF_PRINCIPLED")
    cor = (*CORES[nome.split("_")[0]], 1.0)
    bsdf.inputs["Base Color"].default_value = cor
    bsdf.inputs["Roughness"].default_value = 0.7
    bsdf.inputs["Metallic"].default_value = 0.0
    if emissao:
        bsdf.inputs["Emission Color"].default_value = cor
        bsdf.inputs["Emission Strength"].default_value = emissao
    return m


def objeto(nome: str, bm: bmesh.types.BMesh, mat) -> bpy.types.Object:
    me = bpy.data.meshes.new(nome)
    bm.to_mesh(me)
    bm.free()
    me.materials.append(mat)
    ob = bpy.data.objects.new(nome, me)
    bpy.context.scene.collection.objects.link(ob)
    return ob


def caixa(nome, centro, tamanho, mat):
    bm = bmesh.new()
    bmesh.ops.create_cube(bm, size=1.0)
    bmesh.ops.scale(bm, vec=tamanho, verts=bm.verts)
    bmesh.ops.translate(bm, vec=centro, verts=bm.verts)
    return objeto(nome, bm, mat)


def cilindro(nome, centro, raio, altura, mat, segmentos=10, eixo="Z"):
    bm = bmesh.new()
    bmesh.ops.create_cone(bm, cap_ends=True, segments=segmentos, radius1=raio, radius2=raio, depth=altura)
    if eixo == "Y":  # deitado, a apontar para a frente (Y do Blender = -Z do glTF... ver `frente`)
        bmesh.ops.rotate(bm, verts=bm.verts, cent=(0, 0, 0), matrix=__import__("mathutils").Matrix.Rotation(math.pi / 2, 3, "X"))
    if eixo == "X":
        bmesh.ops.rotate(bm, verts=bm.verts, cent=(0, 0, 0), matrix=__import__("mathutils").Matrix.Rotation(math.pi / 2, 3, "Y"))
    bmesh.ops.translate(bm, vec=centro, verts=bm.verts)
    return objeto(nome, bm, mat)


def tubo(nome, p0, p1, raio, mat, segmentos=10):
    """Um cilindro do ponto p0 ao ponto p1 (para o poste e o braço em arco)."""
    from mathutils import Vector
    a, b = Vector(p0), Vector(p1)
    eixo = b - a
    bm = bmesh.new()
    bmesh.ops.create_cone(bm, cap_ends=True, segments=segmentos, radius1=raio, radius2=raio, depth=eixo.length)
    bmesh.ops.rotate(bm, verts=bm.verts, cent=(0, 0, 0), matrix=eixo.to_track_quat("Z", "Y").to_matrix())
    bmesh.ops.translate(bm, vec=(a + b) / 2, verts=bm.verts)
    return objeto(nome, bm, mat)


def poligono(nome, pontos_xz, y, mat):
    """Uma face plana no plano XZ do Blender (vertical), à profundidade y; os pontos em (x, z)."""
    bm = bmesh.new()
    vs = [bm.verts.new((x, y, z)) for x, z in pontos_xz]
    bm.faces.new(vs)
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    return objeto(nome, bm, mat)


def juntar(nome: str) -> bpy.types.Object:
    obs = [o for o in bpy.data.objects if o.type == "MESH"]
    with bpy.context.temp_override(active_object=obs[0], selected_editable_objects=obs, object=obs[0], selected_objects=obs):
        bpy.ops.object.join()
    ob = obs[0]
    ob.name = nome
    return ob


def exportar(nome: str):
    DESTINO.mkdir(parents=True, exist_ok=True)
    caminho = DESTINO / f"{nome}.glb"
    bpy.ops.export_scene.gltf(filepath=str(caminho), export_format="GLB", use_selection=False, export_apply=True,
                              export_yup=True, export_materials="EXPORT")
    return caminho


# No Blender, Z é para cima e a frente do glTF (+Z) é -Y: com export_yup, (x, y, z) do Blender passa a (x, z, -y).
FRENTE = -1.0  # y do Blender para a frente


def h7():
    """Sinal H7: poste, placa azul de 0,60 m com triângulo branco, peão e zebra a preto; verso cinzento."""
    limpar()
    poste, azul, branco, preto, verso = (material(n) for n in ("poste", "azul", "branco", "preto", "verso"))
    cilindro("poste", (0, 0, 1.4), 0.03, 2.8, poste, segmentos=8)
    base, lado, esp = 2.2, 0.60, 0.02
    zc = base + lado / 2
    y_placa = FRENTE * 0.045  # à frente do poste (raio 0,03 m), com a abraçadeira entre os dois
    caixa("verso", (0, y_placa, zc), (lado, esp, lado), verso)               # a placa (atrás da face azul)
    caixa("abracadeira", (0, FRENTE * 0.032, zc), (0.08, 0.008, 0.36), verso)
    y_azul = y_placa + FRENTE * (esp / 2 + 0.002)
    poligono("azul", [(-lado / 2, zc - lado / 2), (lado / 2, zc - lado / 2), (lado / 2, zc + lado / 2), (-lado / 2, zc + lado / 2)], y_azul, azul)
    y_br = y_azul + FRENTE * 0.002
    t = 0.25  # metade da base do triângulo
    poligono("triangulo", [(-t, zc - 0.20), (t, zc - 0.20), (0, zc + 0.24)], y_br, branco)
    y_pr = y_br + FRENTE * 0.002
    # a zebra: 3 faixas pretas no fundo do triângulo
    for i, x in enumerate((-0.12, 0.0, 0.12)):
        poligono(f"zebra{i}", [(x - 0.035, zc - 0.17), (x + 0.035, zc - 0.17), (x + 0.025, zc - 0.13), (x - 0.025, zc - 0.13)], y_pr, preto)
    # o peão a andar (silhueta simplificada): cabeça, tronco, pernas e braço, à escala k à volta de (0, zc)
    k = 1.25
    def ped(pts):
        return [(x * k, zc + (z - zc) * k) for x, z in pts]
    cab = [(0.015 + 0.03 * math.cos(a), zc + 0.12 + 0.03 * math.sin(a)) for a in [i * math.pi / 5 for i in range(10)]]
    poligono("cabeca", ped(cab), y_pr, preto)
    poligono("tronco", ped([(-0.016, zc - 0.01), (0.034, zc - 0.01), (0.044, zc + 0.085), (-0.004, zc + 0.085)]), y_pr, preto)
    poligono("perna_a", ped([(-0.016, zc - 0.01), (0.01, zc - 0.01), (-0.04, zc - 0.115), (-0.07, zc - 0.115)]), y_pr, preto)
    poligono("perna_b", ped([(0.01, zc - 0.01), (0.034, zc - 0.01), (0.09, zc - 0.115), (0.062, zc - 0.115)]), y_pr, preto)
    poligono("braco", ped([(0.03, zc + 0.075), (0.048, zc + 0.062), (0.095, zc - 0.002), (0.078, zc - 0.01)]), y_pr, preto)
    juntar("sinal_h7")
    return exportar("sinal_h7")


def cabeca(prefixo, centro, cores, virada, emissao):
    """Uma cabeça de semáforo: caixa preta, lentes com pala, virada para a frente (-Y do Blender) ou para +X."""
    cx, cy, cz = centro
    grupo = "peoes" if "peoes" in prefixo else "veiculos"  # as cabeças dos carros partilham as lâmpadas: acendem juntas
    n = len(cores)
    alto = 0.30 * n
    if virada == "frente":
        caixa(f"{prefixo}_caixa", centro, (0.30, 0.22, alto), material("caixa"))
        caixa(f"{prefixo}_placa", (cx, cy + 0.12, cz), (0.48, 0.02, alto + 0.16), material("caixa"))
        for i, cor in enumerate(cores):
            z = cz + alto / 2 - 0.15 - i * 0.30
            cilindro(f"{prefixo}_lente{i}", (cx, cy + FRENTE * 0.115, z), 0.10, 0.015, material(f"{cor}_lente_{grupo}", emissao), segmentos=16, eixo="Y")
            caixa(f"{prefixo}_pala{i}", (cx, cy + FRENTE * 0.20, z + 0.105), (0.24, 0.16, 0.012), material("caixa"))
    else:  # para o lado: +X («x») ou -X («-x»)
        sx = -1.0 if virada == "-x" else 1.0
        caixa(f"{prefixo}_caixa", centro, (0.22, 0.30, alto), material("caixa"))
        for i, cor in enumerate(cores):
            z = cz + alto / 2 - 0.15 - i * 0.30
            cilindro(f"{prefixo}_lente{i}", (cx + sx * 0.115, cy, z), 0.10, 0.015, material(f"{cor}_lente_{grupo}", emissao), segmentos=16, eixo="X")
            caixa(f"{prefixo}_pala{i}", (cx + sx * 0.20, cy, z + 0.105), (0.16, 0.24, 0.012), material("caixa"))


# O braço em arco: o poste sobe até ARCO_Z, curva num quarto de círculo de raio ARCO_R para -X (por cima da via) e segue a
# direito até -BRACO_X, à altura ARCO_Z + ARCO_R; a cabeça de cima fica pendurada perto da ponta, por cima das faixas.
ARCO_Z, ARCO_R, BRACO_X, CABECA_X = 4.4, 1.0, 4.6, 3.8


def semaforo():
    """Semáforo de braço em arco: o poste com a cabeça baixa dos veículos (para a frente) e a dos peões (para -X, o outro lado
    da passadeira), e o braço em arco por cima da via (-X) com outra cabeça dos veículos pendurada, como os da Av. 25 de Abril."""
    limpar()
    poste = material("poste")
    tubo("poste", (0, 0, 0), (0, 0, ARCO_Z), 0.07, poste)
    # o arco, em segmentos, e o braço a direito
    n = 8
    pts = [(-ARCO_R + ARCO_R * math.cos(math.pi / 2 * k / n), 0, ARCO_Z + ARCO_R * math.sin(math.pi / 2 * k / n)) for k in range(n + 1)]
    for k in range(n):
        tubo(f"arco{k}", pts[k], pts[k + 1], 0.06, poste, segmentos=8)
    topo = ARCO_Z + ARCO_R
    tubo("braco", pts[-1], (-BRACO_X, 0, topo), 0.05, poste, segmentos=8)
    # a cabeça pendurada no braço, virada para os carros que vêm
    alto_cabeca = 0.90
    cz = topo - 0.12 - alto_cabeca / 2
    caixa("suporte_braco", (-CABECA_X, 0, topo - 0.06), (0.05, 0.05, 0.12), poste)
    cabeca("braco_veiculos", (-CABECA_X, FRENTE * 0.0, cz), ["vermelho", "amarelo", "verde"], "frente", 0.0)
    # cabeça baixa dos veículos no poste, à frente dele
    cabeca("veiculos", (0, FRENTE * 0.17, 2.4 + 0.45), ["vermelho", "amarelo", "verde"], "frente", 0.0)
    caixa("suporte_v", (0, FRENTE * 0.07, 2.85), (0.06, 0.12, 0.06), poste)
    # cabeça dos peões, mais baixa, para o outro lado da passadeira (-X)
    cabeca("peoes", (-0.17, 0, 2.1 + 0.30), ["vermelho", "verde"], "-x", 0.0)
    caixa("suporte_p", (-0.07, 0, 2.4), (0.12, 0.06, 0.06), poste)
    juntar("semaforo")
    return exportar("semaforo")


def peoes():
    """Poste de peões: um poste curto (2,6 m) só com a cabeça dos peões (vermelho em cima, verde em baixo), virada para -X, o
    outro lado da passadeira. Usa as lâmpadas `*_lente_peoes`, por isso acende no mesmo ciclo do semáforo."""
    limpar()
    poste = material("poste")
    tubo("poste", (0, 0, 0), (0, 0, 2.6), 0.05, poste)
    cabeca("peoes", (-0.17, 0, 2.1 + 0.30), ["vermelho", "verde"], "-x", 0.0)
    caixa("suporte_p", (-0.07, 0, 2.4), (0.12, 0.06, 0.06), poste)
    juntar("peoes")
    return exportar("peoes")


if __name__ == "__main__":
    for f in (h7, semaforo, peoes):
        c = f()
        ob = next(o for o in bpy.data.objects if o.type == "MESH")
        tris = sum(len(p.vertices) - 2 for p in ob.data.polygons)
        print(f"@@JSON@@ {{\"modelo\": \"{c.name}\", \"kb\": {c.stat().st_size / 1024:.1f}, \"tris\": {tris}, "
              f"\"dimensoes\": [{ob.dimensions.x:.2f}, {ob.dimensions.y:.2f}, {ob.dimensions.z:.2f}], \"materiais\": {len(ob.data.materials)}}}")
