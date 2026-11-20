# Modelos 3D: fontes e licenças (ADR-0041)

Todos os modelos são de **Quaternius** e têm a licença **CC0 1.0** (domínio público): <https://creativecommons.org/publicdomain/zero/1.0/>. A CC0 não obriga a atribuição. Mesmo assim, registamos aqui a fonte de cada modelo.

## Como se obtiveram

Os `.glb` foram descarregados do poly.pizza, que tem cópias dos modelos da Quaternius. A página de cada modelo diz «Public Domain (CC0)» e indica a Quaternius como autor. Também confirmámos a licença na página oficial de cada pacote, a 19/11/2026 (quaternius.com, campo «License: CC0»).

Depois, no Blender 5.2, com o script `web/scripts/modelos/normalizar.py`:
- **Escala real:** as pessoas medem 1,61 a 1,80 m; os ligeiros 4,1 e 4,5 m; o camião 6,2 m.
- **Origem e orientação:** a origem fica no chão e ao centro. No glTF, o eixo +Y aponta para cima e a frente fica em +Z.
- **Cores neutras nos veículos:** a carroçaria passa a cinzento ou branco. As luzes, os vidros e os pneus ficam como estavam.
- **Animações das pessoas:** ficam só a de andar e a de estar parado.
- **Materiais das pessoas:** o original tem metallic 0,4 em todos os materiais, o que dá à pele um ar de estátua. Passou a metallic 0, com roughness de 0,55 na pele, 0,65 no cabelo e 0,7 na roupa. A pele ganhou tons naturais e variados, de claro a escuro.
- **Otimização:** cada `.glb` passou pelo `optimize-glb.mjs` (gltf-transform com meshopt e quantização). Para os ler, o three.js e o `<model-viewer>` precisam do descodificador meshopt (`meshoptimizer`, MIT).
- **Triângulos:** o camião foi reduzido de 7 474 para 4 797 (Decimate).

A CC0 permite todas estas alterações.

## Modelos

| Ficheiro | Modelo de origem | Página (cópia CC0) | Pacote oficial (licença confirmada) |
|---|---|---|---|
| `pessoa_homem_a.glb` | Man | https://poly.pizza/m/HMnuH5geEG | Animated Men Pack: https://quaternius.com/packs/animatedmen.html |
| `pessoa_homem_b.glb` | Man | https://poly.pizza/m/fjHyMd5Wxw | Animated Men Pack |
| `pessoa_homem_c.glb` | Man in Long Sleeves | https://poly.pizza/m/DLptRuewTn | Animated Men Pack |
| `pessoa_homem_d.glb` | Man in Suit | https://poly.pizza/m/mQnGoME1ez | Animated Men Pack |
| `pessoa_mulher_a.glb` | Woman | https://poly.pizza/m/AQsd9ngvKU | Animated Women Pack: https://quaternius.com/packs/animatedwomen.html |
| `pessoa_mulher_b.glb` | Woman Casual | https://poly.pizza/m/jpKRgGDxhk | Animated Women Pack |
| `pessoa_mulher_c.glb` | Woman in Dress | https://poly.pizza/m/zMyPlQXBzq | Animated Women Pack |
| `pessoa_mulher_d.glb` | Woman in Tank Top | https://poly.pizza/m/XqzeZGB7iU | Animated Women Pack |
| `veiculo_ligeiro.glb` | Car (NormalCar1) | https://poly.pizza/m/Cz6yDaUcM9 | Cars Pack: https://quaternius.com/packs/cars.html |
| `veiculo_ligeiro_b.glb` | Car (NormalCar2) | https://poly.pizza/m/unqqkULtRU | Cars Pack |
| `veiculo_camiao.glb` | Truck (`Vehicle_Truck`) | https://poly.pizza/m/cXw6oiFtZ8 | Zombie Apocalypse Kit: https://quaternius.com/packs/zombieapocalypsekit.html |

**Como confirmámos o pacote do camião:** a pasta oficial do pacote (Google Drive da Quaternius, que a página do pacote indica) tem em `Vehicles/glTF/` os modelos `Vehicle_Truck.gltf`, `Vehicle_Truck_Armored.gltf`, `Vehicle_Pickup.gltf`, `Vehicle_Pickup_Armored.gltf`, `Vehicle_Sports.gltf` e `Vehicle_Sports_Armored.gltf`, com a textura `Zombie_Atlas.png`. O nosso `.glb` usa essa mesma textura (`Zombie_Atlas`). O poly.pizza tem os vizinhos do mesmo pacote, também da Quaternius: «Pickup Truck», «Truck Armored» e «Pickup Truck Armored».

## Protótipos feitos por nós (mota e autocarro)

Não há uma mota CC0 com qualidade profissional. O autocarro CC0 da Quaternius (Public Transport Pack) não se conseguiu descarregar: o Google Drive respondia «Quota exceeded». Por isso, estes dois modelos foram feitos de raiz no Blender 5.2, com o script `web/scripts/modelos/modelar.py`, no mesmo estilo low poly e com o sombreado plano dos pacotes Quaternius. Não usam nenhum ficheiro de terceiros e não têm licença de terceiros: são da equipa, como o resto do código.

| Ficheiro | O que é | Tris |
|---|---|---|
| `veiculo_mota.glb` | Mota de cerca de 2,0 m, sem condutor, cinzento-escuro e prata | 1172 |
| `veiculo_autocarro.glb` | Autocarro urbano com as medidas reais: 12,0 m × 2,55 m × 3,0 m (com o ar condicionado) e rodas de 1,0 m. É branco, com os cantos boleados, janelas com pilares, 2 portas, a saia escura e as cavas a envolver as rodas | 1988 |

Se o autocarro da Quaternius ficar disponível, pode substituir o protótipo, com a fonte acrescentada aqui.

## O que dizem as páginas oficiais

O campo «License» das quatro páginas diz «CC0» e liga para a CC0 1.0. O texto de cada uma:

- **Animated Men Pack:** «This pack contains a set of 4 different human models with many animations. In FBX, OBJ and Blend formats, free to use in personal and commercial projects.»
- **Animated Women Pack:** «This pack contains a set of 4 different human models with many animations. In FBX, OBJ and Blend formats, free to use in personal and commercial projects.»
- **Cars Pack:** «This pack contains 8 different car models! All in .FBX, .OBJ and .Blend formats, free to use in both personal and commercial projects.»
- **Zombie Apocalypse Kit:** «… Plenty of environmental and vehicle models as well. In FBX, OBJ, glTF and Blend formats, free to use in personal and commercial projects.»

Cada cópia no poly.pizza: «Public Domain (CC0)», `Licence: "CC0 1.0"`.

## Nota para a legenda (ADR-0041, ponto 4)

O aspeto das pessoas é ilustrativo. O sexo, a idade e o tom de pele das figuras não vêm dos dados.

## Vista aérea (ADR-0045)

- `web/public/tiles/vista_aerea.pmtiles`: recorte da ortofoto ORTOS 2025 da DGT (folha 185-1, 25 cm), CC BY 4.0, «Ortofotos © Direção-Geral do Território». Dados de fontes abertas, usados para contexto, que carecem de validação junto das entidades responsáveis. Ver `web/scripts/orto/README.md`.

## Semáforos e sinais H7 das passadeiras

- `semaforo.glb` e `sinal_h7.glb`: modelos da equipa, feitos em Blender com `web/scripts/modelos/sinalizacao.py` (licença do repositório). As formas e as cores seguem, simplificadas, o Regulamento de Sinalização do Trânsito (Decreto Regulamentar n.º 22-A/98): o H7 «passagem para peões» e o semáforo de 3 luzes para os veículos e de 2 para os peões.
- A posição é ilustrativa: os postes ficam nas pontas reais das passadeiras (ADR-0038), mas não estão medidos. As passadeiras com semáforo vêm do OpenStreetMap (ODbL, por validar com a Câmara); as com H7 vêm do config (`mapa.sinais_h7`), a confirmar no local.
