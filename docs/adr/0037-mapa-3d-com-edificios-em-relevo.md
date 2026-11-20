# O mapa tem uma vista 3D, com os edifícios em relevo; as alturas que o OpenStreetMap não tem dizem-se aproximadas

Status: proposto (18/11/2026, pedido do João; decisões fechadas com o João no mesmo dia). Complementa o ADR-0014 (o mapa offline em PMTiles) e o ADR-0033 (o mapa mostra e o painel resume).

## Contexto

- O mapa é visto de cima, sem inclinação nem rotação (`pitchWithRotate: false`). Para quem não conhece Aveiro, a zona da demo (Av. 25 de Abril / Av. de Oita) é um conjunto de linhas e quarteirões planos.
- Os tiles já trazem os edifícios (`buildings`), mas **só 35 dos 382 edifícios** da zona visível têm altura (`height`, do OpenStreetMap, mediana de 11 m e máximo de 26 m). Os outros não têm altura nenhuma: cerca de 79 % dos edifícios na vista da demo (zoom 17,6) e 89 % a zoom 16.
- Os tiles vão até ao zoom 15. Acima disso, o MapLibre amplia o zoom 15, e é isso que já se vê hoje no zoom 17,6 da demo.
- Os marcadores são HTML por cima do mapa, e as ruas com sensor e os carros (ADR-0034) são camadas desenhadas no chão.
- **Avaliámos e não usamos:**
  - **O `scene.glb` do Nextcloud** (`03-dados/`): foi exportado com o Three.js e tem 9 386 malhas, sem texturas nem georreferência (está em metros locais, sem dizer onde fica o (0,0)). Os edifícios têm 10 m por omissão. É, no essencial, o mesmo OSM dos tiles.
  - **As Photorealistic 3D Tiles da Google:** a política do Map Tiles API proíbe o uso offline, a cache e a exportação («Offline uses … are not permitted»; «you must not pre-fetch, index, store, or cache any Content»), obriga a uma chave de API e ao logótipo da Google, e o MapLibre não desenha 3D Tiles.
- **Há fotografia aérea aberta:** os ortofotos da DGT têm 25 cm de resolução (2021 e 2025, Portugal continental), por WMTS e WMS de acesso gratuito. Os ficheiros do Centro de Dados da DGT têm a licença CC BY 4.0, com a menção «Direção-Geral do Território». Para os serviços WMTS e WMS e para a cache offline, a licença não está confirmada.

## Decisão

1. **No ecrã largo, o mapa abre ligeiramente inclinado (25°)**, com os edifícios já em relevo. O botão «3D», junto ao zoom, leva a 55° e deixa rodar o mapa (o máximo é 60°). Um 2.º clique volta aos 25°, com o norte para cima. No telemóvel, a vista é sempre de cima, porque os gestos de inclinar e rodar chocam com o deslizar da página.
2. **Edifícios em relevo** (`fill-extrusion`), com a camada `buildings` dos mesmos tiles. Não há dados novos nem rede.
   - Se o OpenStreetMap tiver a altura, usa-se essa altura.
   - Se não tiver, usa-se `mapa.edificio_altura_m` (9 m, cerca de 3 pisos), e a legenda diz «Alturas do OpenStreetMap quando existem; nas outras, 9 m (aproximada)».
3. **As cores vêm dos tokens do mapa** (`--map-block`, com o topo mais claro), nas paletas de dia, crepúsculo e noite do ADR-0040, nos dois temas. Os edifícios ficam com 85 % de opacidade, para não esconderem por inteiro uma rua com sensor nem um carro que passe por trás deles.
4. **Os marcadores, as ruas com sensor, os troços em falha e os carros** continuam iguais e por cima dos edifícios. Os marcadores HTML ficam sempre à vista, de frente para o ecrã.
5. **Movimento reduzido:** com `prefers-reduced-motion`, a mudança entre 2D e 3D é instantânea, sem animação de câmara.
6. **Desempenho:** a vista 3D tem de manter ≥ 30 fps com os carros ligados, num portátil comum (a mesma regra do ADR-0034). Se não manter, o mapa abre de cima e o 3D fica só no botão.
7. **Os edifícios em relevo são cinzentos**, sem imagens reais: não há fotografias de fachadas abertas, e a vista aérea fica de fora (ver «Fora de âmbito»).

## Consequências

- O júri vê a zona como uma cidade, e a falha da RSU0030 vê-se nas ruas entre os prédios.
- **Honestidade:** a maioria das alturas é aproximada (cerca de 79 % na vista da demo e 89 % a zoom 16). A legenda di-lo, e o pitch não pode usar os edifícios como dado.
- **Risco:** com a câmara inclinada, um prédio alto pode tapar um troço ou um carro. Por isso há os 85 % de opacidade, o limite de 60° e o botão para voltar à vista de cima.
- **Fora de âmbito:** o relevo do terreno (Aveiro é plano), modelos 3D detalhados, fachadas com fotografia, as 3D Tiles da Google, o `scene.glb` e alturas de outras fontes (por exemplo, o LiDAR da DGT).
- **Vista aérea (ortofoto da DGT): fica para depois** (decisão do PO, 19/11), só com a licença dos serviços e da cache confirmada e a zona da demo guardada offline. Uma camada que só funcione com rede contraria o ADR-0014 (a demo nunca chama a rede) e o filtro 3 do ADR-0023.
- **Prazo:** entra no plano (decisão do PO, 19/11): implementa-se a #136, depois do !134 (ícones) no `main`. O mapa abre a 25° no ecrã largo e volta à vista de cima se não houver 30 fps (ponto 6).
