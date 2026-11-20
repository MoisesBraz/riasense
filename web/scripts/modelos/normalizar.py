"""Acerta um modelo para a vista 3D (ADR-0041) e exporta .glb.
- Escala real (altura de pessoa ou comprimento de veículo), origem no chão e ao centro, frente para -Y no Blender (= +Z no glTF), +Y para cima no glTF.
- Pessoas: ficam só as ações de andar e de estar parado; a escala vai num nó raiz (não se aplica, para não deformar a animação).
- Veículos: cores neutras (a carroçaria passa a cinzento, vidros e pneus escuros ficam), triângulos ≤ máximo.
Uso: blender -b --factory-startup -P normalizar.py -- <spec.json>   (lista de {src, out, tipo, medida_m, rot_z_graus})"""
import bpy, sys, json, math, mathutils, colorsys
spec = json.load(open(sys.argv[sys.argv.index("--") + 1:][0], encoding="utf-8"))
MAX_TRIS = 5000
def tris_e_caixa():
    dg = bpy.context.evaluated_depsgraph_get(); n = 0; pts = []
    for o in bpy.context.scene.objects:
        if o.type != "MESH" or not o.visible_get(): continue  # o importador cria uma malha escondida para a forma dos ossos
        e = o.evaluated_get(dg); m = e.to_mesh(); m.calc_loop_triangles(); n += len(m.loop_triangles)
        pts += [e.matrix_world @ v.co for v in m.vertices]; e.to_mesh_clear()
    mn = mathutils.Vector([min(p[k] for p in pts) for k in range(3)]); mx = mathutils.Vector([max(p[k] for p in pts) for k in range(3)])
    return n, mn, mx
rel = []
for s in spec:
    bpy.ops.wm.read_factory_settings(use_empty=True)
    bpy.ops.import_scene.gltf(filepath=s["src"])
    sc = bpy.context.scene
    if s["tipo"] == "pessoa":
        manter = [a for a in bpy.data.actions if any(k in a.name.lower() for k in ("walk", "idle")) and "gun" not in a.name.lower()]
        for a in list(bpy.data.actions):
            if a not in manter: bpy.data.actions.remove(a)
        walk = next(a for a in manter if "walk" in a.name.lower())
        for o in sc.objects:
            if o.type == "ARMATURE": o.animation_data_create(); o.animation_data.action = walk
        sc.frame_set(1)
        # materiais: o original traz metallic 0,4 em tudo (pele de estátua). Pele e tecido não são metal.
        for m in bpy.data.materials:
            for nd in (m.node_tree.nodes if m.use_nodes else []):
                if nd.type != "BSDF_PRINCIPLED": continue
                nd.inputs["Metallic"].default_value = 0.0
                nome = m.name.lower()
                nd.inputs["Roughness"].default_value = 0.55 if "skin" in nome else 0.4 if "eye" in nome else 0.65 if "hair" in nome else 0.7
                if "skin" in nome and s.get("pele"):
                    nd.inputs["Base Color"].default_value = (*s["pele"], 1.0)
    # nó raiz com a escala e o deslocamento
    raiz = bpy.data.objects.new(s["nome"], None); sc.collection.objects.link(raiz)
    for o in list(sc.objects):
        if o is not raiz and o.parent is None:
            mw = o.matrix_world.copy(); o.parent = raiz; o.matrix_world = mw
    raiz.rotation_euler = (0, 0, math.radians(s.get("rot_z_graus", 0)))
    bpy.context.view_layer.update()
    n, mn, mx = tris_e_caixa()
    dim = mx - mn
    atual = dim.z if s["tipo"] == "pessoa" else max(dim.x, dim.y)
    k = s["medida_m"] / atual
    raiz.scale = (k, k, k); bpy.context.view_layer.update()
    n, mn, mx = tris_e_caixa()
    raiz.location -= mathutils.Vector(((mn.x + mx.x) / 2, (mn.y + mx.y) / 2, mn.z)); bpy.context.view_layer.update()
    if s["tipo"] == "veiculo":
        feitas = set()
        for m in bpy.data.materials:
            if not m.use_nodes: continue
            for nd in m.node_tree.nodes:
                if nd.type == "TEX_IMAGE" and nd.image and nd.image.name not in feitas:
                    # atlas de textura: as cores vivas fora dos tons das luzes (laranja/vermelho) passam a cinzento claro
                    import numpy as np
                    img = nd.image; feitas.add(img.name); px = np.array(img.pixels[:]).reshape(-1, 4)
                    mx_, mn_ = px[:, :3].max(1), px[:, :3].min(1); l = (mx_ + mn_) / 2; sat = (mx_ - mn_) / np.maximum(1e-6, 1 - abs(2 * l - 1))
                    r_, g_, b_ = px[:, 0], px[:, 1], px[:, 2]
                    quente = (r_ >= g_) & (g_ >= b_) & (r_ - b_ > 0.25) & (g_ < r_ * 0.75)  # laranja/vermelho: luzes
                    alvo = (sat > 0.07) & ~quente
                    cinza = np.clip(l[alvo] * 0.35 + s.get("cinza", 0.55) * 0.65, 0, 1)
                    px[alvo, 0] = px[alvo, 1] = px[alvo, 2] = cinza
                    img.pixels[:] = px.ravel(); img.update(); img.pack(); img.name = "Atlas_" + s["nome"]
                    print("ATLAS", img.name, int(alvo.sum()), "de", len(px))
                if nd.type == "BSDF_PRINCIPLED" and not nd.inputs["Base Color"].is_linked:
                    r, g, b, a = nd.inputs["Base Color"].default_value
                    h, l, sat = colorsys.rgb_to_hls(r, g, b)
                    if sat > 0.12 and 0.08 < l < 0.85 and not any(w in m.name.lower() for w in ("headlight", "taillight", "brakelight", "lamp", "glass", "window")):
                        cinza = s.get("cinza", 0.55); nd.inputs["Base Color"].default_value = (cinza, cinza, cinza, a)
        if n > MAX_TRIS:
            for o in sc.objects:
                if o.type == "MESH":
                    d = o.modifiers.new("reduzir", "DECIMATE"); d.ratio = (MAX_TRIS - 200) / n
            bpy.context.view_layer.update()
    n2, mn, mx = tris_e_caixa()
    bpy.ops.object.select_all(action="DESELECT")
    for o in [raiz] + list(raiz.children_recursive): o.select_set(True)
    bpy.ops.export_scene.gltf(filepath=s["out"], export_format="GLB", use_selection=True, export_apply=True,
                              export_animations=s["tipo"] == "pessoa", export_cameras=False, export_lights=False,
                              export_animation_mode="ACTIONS", export_optimize_animation_size=True)
    rel.append({"nome": s["nome"], "tris_antes": n, "tris": n2, "dim_m": [round(v, 2) for v in (mx - mn)],
                "acoes": [a.name for a in bpy.data.actions] if s["tipo"] == "pessoa" else []})
json.dump(rel, open(spec[0]["out"].rsplit("/", 1)[0] + "/normalizacao.json", "w"), indent=1)
