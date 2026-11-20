"""Protótipos low poly (estilo Quaternius: sombreado plano, cores lisas) para o ADR-0041: mota (~2,1 m) e autocarro urbano (~12 m).
Frente para -Y no Blender (= +Z no glTF), +Z para cima, origem no chão ao centro. Uso: blender -b -P modelar.py -- <saida_dir>"""
import bpy, bmesh, math, sys, os
from mathutils import Vector, Matrix

saida = sys.argv[sys.argv.index("--") + 1:][0]
MATS = {}


def mat(nome, rgb, rough=0.6, metal=0.0, emis=None):
    if nome in MATS:
        return MATS[nome]
    m = bpy.data.materials.new(nome)
    m.use_nodes = True
    p = m.node_tree.nodes["Principled BSDF"]
    p.inputs["Base Color"].default_value = (*rgb, 1)
    p.inputs["Roughness"].default_value = rough
    p.inputs["Metallic"].default_value = metal
    if emis:
        p.inputs["Emission Color"].default_value = (*emis, 1)
        p.inputs["Emission Strength"].default_value = 1.5
    MATS[nome] = m
    return m


def caixa(nome, centro, tam, m, bisel=0.0, segs=1):
    bpy.ops.mesh.primitive_cube_add(size=1, location=centro)
    o = bpy.context.object
    o.name = nome
    o.scale = tam
    bpy.ops.object.transform_apply(scale=True)
    if bisel:
        b = o.modifiers.new("b", "BEVEL")
        b.width = bisel
        b.segments = segs
        b.limit_method = "ANGLE"
    o.data.materials.append(m)
    return o


def cilindro(nome, centro, raio, comp, m, eixo="X", lados=16, bisel=0.0):
    bpy.ops.mesh.primitive_cylinder_add(vertices=lados, radius=raio, depth=comp, location=centro)
    o = bpy.context.object
    o.name = nome
    if eixo == "X":
        o.rotation_euler = (0, math.radians(90), 0)
    elif eixo == "Y":
        o.rotation_euler = (math.radians(90), 0, 0)
    bpy.ops.object.transform_apply(rotation=True)
    if bisel:
        b = o.modifiers.new("b", "BEVEL")
        b.width = bisel
        b.segments = 1
        b.limit_method = "ANGLE"
    o.data.materials.append(m)
    return o


def tubo(nome, a, b, raio, m, lados=8):
    a, b = Vector(a), Vector(b)
    d = b - a
    bpy.ops.mesh.primitive_cylinder_add(vertices=lados, radius=raio, depth=d.length, location=(a + b) / 2)
    o = bpy.context.object
    o.name = nome
    o.rotation_euler = d.to_track_quat("Z", "Y").to_euler()
    bpy.ops.object.transform_apply(rotation=True)
    o.data.materials.append(m)
    return o


def roda(prefixo, y, z, raio, largura, x=0.0, lados=18, jante=0.6):
    pneu = cilindro(prefixo + "_pneu", (x, y, z), raio, largura, mat("Pneu", (0.025, 0.025, 0.028), 0.85), lados=lados, bisel=0.02)
    cubo = cilindro(prefixo + "_jante", (x, y, z), raio * jante, largura * 1.04, mat("Jante", (0.45, 0.46, 0.48), 0.45, 0.6), lados=lados)
    return [pneu, cubo]


def juntar(nome, objs):
    bpy.ops.object.select_all(action="DESELECT")
    for o in objs:
        bpy.context.view_layer.objects.active = o
        for md in list(o.modifiers):
            bpy.ops.object.modifier_apply(modifier=md.name)
    for o in objs:
        o.select_set(True)
    bpy.context.view_layer.objects.active = objs[0]
    bpy.ops.object.join()
    o = bpy.context.object
    o.name = nome
    for p in o.data.polygons:
        p.use_smooth = False  # sombreado plano, como os pacotes Quaternius
    bm = bmesh.new()
    bm.from_mesh(o.data)
    bmesh.ops.remove_doubles(bm, verts=bm.verts, dist=1e-5)
    bm.to_mesh(o.data)
    bm.free()
    return o


def exportar(o, ficheiro):
    """Origem no chão e ao centro, e exporta só este objeto."""
    vs = [o.matrix_world @ v.co for v in o.data.vertices]
    mn = Vector([min(v[k] for v in vs) for k in range(3)])
    mx = Vector([max(v[k] for v in vs) for k in range(3)])
    o.data.transform(Matrix.Translation(-Vector(((mn.x + mx.x) / 2, (mn.y + mx.y) / 2, mn.z))))
    o.location = (0, 0, 0)
    bpy.ops.object.select_all(action="DESELECT")
    o.select_set(True)
    bpy.ops.export_scene.gltf(filepath=ficheiro, export_format="GLB", use_selection=True, export_apply=True, export_animations=False)
    o.data.calc_loop_triangles()
    print("MODELO", os.path.basename(ficheiro), "tris", len(o.data.loop_triangles), "dim", [round(v, 2) for v in (mx - mn)])


# ---------------- mota (~2,1 m, frente em -Y) ----------------
bpy.ops.wm.read_factory_settings(use_empty=True)
carro = mat("Carrocaria", (0.06, 0.065, 0.07), 0.45)
tanque = mat("Deposito", (0.55, 0.56, 0.58), 0.4)
motor = mat("Motor", (0.18, 0.18, 0.19), 0.55)
banco = mat("Banco", (0.02, 0.02, 0.022), 0.8)
cromado = mat("Cromado", (0.62, 0.63, 0.65), 0.3, 0.7)
farol = mat("Farol", (0.9, 0.85, 0.7), 0.3, emis=(0.9, 0.85, 0.7))
traseira = mat("LuzTraseira", (0.6, 0.03, 0.02), 0.4, emis=(0.6, 0.03, 0.02))
R, yF, yT = 0.31, -0.72, 0.68
p = []
p += roda("frente", yF, R, R, 0.12)
p += roda("tras", yT, R, R, 0.15)
p.append(caixa("motor", (0, 0.02, 0.42), (0.30, 0.42, 0.30), motor, 0.03))
p.append(caixa("deposito", (0, -0.22, 0.80), (0.30, 0.48, 0.20), tanque, 0.06, 2))
p.append(caixa("banco", (0, 0.30, 0.80), (0.28, 0.58, 0.09), banco, 0.03))
p.append(caixa("cauda", (0, 0.62, 0.80), (0.20, 0.30, 0.10), carro, 0.03))
p.append(caixa("quadro", (0, 0.05, 0.62), (0.16, 0.95, 0.10), carro, 0.02))
p.append(tubo("braco_tras", (0, 0.05, 0.40), (0, yT, R), 0.035, carro))
for s in (-1, 1):
    p.append(tubo(f"forqueta{s}", (s * 0.075, yF, R), (s * 0.075, -0.50, 0.95), 0.025, cromado))
    p.append(tubo(f"amortecedor{s}", (s * 0.12, 0.35, 0.72), (s * 0.12, yT - 0.05, R + 0.05), 0.022, cromado))
p.append(caixa("guarda_lamas_f", (0, yF, R + 0.34), (0.13, 0.40, 0.03), carro, 0.01))
p.append(caixa("guarda_lamas_t", (0, yT - 0.05, R + 0.36), (0.17, 0.36, 0.03), carro, 0.01))
p.append(tubo("guiador", (-0.36, -0.50, 1.02), (0.36, -0.50, 1.02), 0.018, cromado))
for s in (-1, 1):
    p.append(cilindro(f"punho{s}", (s * 0.33, -0.50, 1.02), 0.024, 0.10, banco, "X", 8))
p.append(caixa("painel", (0, -0.56, 1.00), (0.20, 0.10, 0.10), carro, 0.02))
p.append(cilindro("farol", (0, -0.64, 0.92), 0.075, 0.08, farol, "Y", 12))
p.append(caixa("luz_tras", (0, 0.79, 0.83), (0.12, 0.03, 0.04), traseira))
p.append(tubo("escape", (0.17, -0.05, 0.28), (0.17, 0.72, 0.42), 0.045, cromado, 10))
for s in (-1, 1):
    p.append(caixa(f"poisa_pes{s}", (s * 0.22, 0.10, 0.34), (0.10, 0.05, 0.02), motor))
exportar(juntar("veiculo_mota", p), os.path.join(saida, "veiculo_mota.glb"))

# ---------------- autocarro urbano (~12 m, frente em -Y) ----------------
bpy.ops.wm.read_factory_settings(use_empty=True)
MATS.clear()
corpo = mat("Carrocaria", (0.78, 0.79, 0.80), 0.5)
vidro = mat("Vidro", (0.03, 0.035, 0.04), 0.15)
faixa = mat("Faixa", (0.22, 0.23, 0.25), 0.55)
para = mat("ParaChoques", (0.10, 0.10, 0.11), 0.6)
porta = mat("Porta", (0.05, 0.055, 0.06), 0.2)
farol = mat("Farol", (0.95, 0.92, 0.8), 0.3, emis=(0.95, 0.92, 0.8))
traseira = mat("LuzTraseira", (0.6, 0.03, 0.02), 0.4, emis=(0.6, 0.03, 0.02))
letreiro = mat("Letreiro", (0.9, 0.55, 0.05), 0.4, emis=(0.9, 0.55, 0.05))
# Medidas de um autocarro urbano real: 12,0 m x 2,55 m x 3,0 m (com o ar condicionado), rodas de 1,0 m de diâmetro.
L, Wd, H, chao = 12.0, 2.55, 2.85, 0.30
Rr, eixos = 0.50, (-L / 2 + 2.7, L / 2 - 3.2)
saia = mat("Saia", (0.16, 0.165, 0.18), 0.6)
p = [caixa("corpo", (0, 0, chao + (H - chao) / 2), (Wd, L, H - chao), corpo, 0.16, 3)]  # cantos boleados
bpy.context.view_layer.objects.active = p[0]
bpy.ops.object.modifier_apply(modifier="b")
for yc in eixos:  # cavas a envolver as rodas
    cava = cilindro("cava", (0, yc, Rr), Rr + 0.08, Wd + 0.4, corpo, "X", 24)
    bo = p[0].modifiers.new("cava", "BOOLEAN")
    bo.object = cava
    bo.operation = "DIFFERENCE"
    bo.solver = "EXACT"
    bpy.context.view_layer.objects.active = p[0]
    bpy.ops.object.modifier_apply(modifier="cava")
    bpy.data.objects.remove(cava)
    p.append(cilindro(f"interior_cava{yc:.1f}", (0, yc, Rr), Rr + 0.06, Wd - 0.12, saia, "X", 24))  # fundo escuro da cava
zj0, zj1 = 1.20, 2.42  # banda de janelas
for s in (-1, 1):
    x = s * (Wd / 2 + 0.006)
    p.append(caixa(f"janelas{s}", (x, 0.25, (zj0 + zj1) / 2), (0.01, L - 1.5, zj1 - zj0), vidro))
    for y in (-3.4, -1.0, 1.4, 3.8):  # pilares entre janelas
        p.append(caixa(f"pilar{s}{y}", (s * (Wd / 2 + 0.020), y, (zj0 + zj1) / 2), (0.01, 0.12, zj1 - zj0), corpo))
    p.append(caixa(f"saia{s}", (s * (Wd / 2 + 0.006), 0, chao + 0.22), (0.01, L - 0.4, 0.40), saia))
p.append(caixa("para_brisas", (0, -L / 2 - 0.006, 1.72), (Wd - 0.30, 0.01, 1.50), vidro))
p.append(caixa("letreiro", (0, -L / 2 - 0.006, 2.62), (Wd - 0.70, 0.01, 0.20), letreiro))
p.append(caixa("vidro_tras", (0, L / 2 + 0.006, 1.95), (Wd - 0.50, 0.01, 0.75), vidro))
for y in (-L / 2 + 1.05, -0.2):  # duas portas do lado direito (+X)
    p.append(caixa(f"porta{y:.1f}", (Wd / 2 + 0.035, y, chao + 1.12), (0.01, 1.25, 2.20), porta))
p.append(caixa("pc_frente", (0, -L / 2 - 0.04, chao + 0.22), (Wd - 0.10, 0.10, 0.36), para, 0.03))
p.append(caixa("pc_tras", (0, L / 2 + 0.04, chao + 0.22), (Wd - 0.10, 0.10, 0.36), para, 0.03))
for s in (-1, 1):
    p.append(caixa(f"farol{s}", (s * 0.92, -L / 2 - 0.012, chao + 0.58), (0.42, 0.01, 0.14), farol))
    p.append(caixa(f"luz_tras{s}", (s * 1.02, L / 2 + 0.012, chao + 0.85), (0.18, 0.01, 0.42), traseira))
    p.append(caixa(f"espelho{s}", (s * (Wd / 2 + 0.16), -L / 2 + 0.20, 2.15), (0.05, 0.10, 0.32), para))
p.append(caixa("ar_condicionado", (0, 1.2, H + 0.075), (1.6, 3.0, 0.15), corpo, 0.04))
for y in eixos:
    for s in (-1, 1):
        p += roda(f"r{y:.1f}{s}", y, Rr, Rr, 0.30, x=s * (Wd / 2 - 0.18), lados=22, jante=0.58)
exportar(juntar("veiculo_autocarro", p), os.path.join(saida, "veiculo_autocarro.glb"))
