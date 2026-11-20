# Os modelos 3D da vista 3D (ADR-0041)

Os 13 `.glb` de `web/public/modelos/` fazem-se com o Blender 5.2, em modo de fundo. As fontes e as licenças estão no `LICENCAS.md` dessa pasta.

- **`modelar.py`** faz de raiz a mota e o autocarro (são da equipa, sem ficheiros de terceiros):
  `blender -b -P modelar.py -- <pasta_de_saida>`
- **`normalizar.py`** acerta os modelos da Quaternius (CC0): escala real, origem no chão, só as animações de andar e de estar parado, pele sem metal e veículos em cinzento.
  `blender -b --factory-startup -P normalizar.py -- <spec.json>`, onde o `spec.json` é uma lista de `{src, out, nome, tipo, medida_m, rot_z_graus}`.

Depois, cada `.glb` comprime-se com o meshopt e a quantização (gltf-transform):
`npx @gltf-transform/cli meshopt <entrada.glb> <saida.glb>`.

Para os ler, o Three.js precisa do `MeshoptDecoder`, que já vem com ele (`three/examples/jsm/libs/meshopt_decoder.module.js`), sem rede.
