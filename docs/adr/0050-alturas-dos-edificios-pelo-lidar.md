# Na zona da demo, a altura dos edifícios é a medida pelo LiDAR da DGT; fora dela, e onde não houver dados, fica como no ADR-0037

Status: aceite pelo Moisés (19/11/2026, pedido do João; entrou no `main` com o 37d12b98). Renumerado de 0046 para 0050: o 0046 entrou primeiro no `main` (a Ridge nos segmentos), e pelo ADR-0016, ponto 4, o que entra depois é renumerado. **Altera** o ADR-0037, que deixou «alturas de outras fontes (por exemplo, o LiDAR da DGT)» fora de âmbito.

## Contexto

- Os edifícios da vista 3D vêm do OpenStreetMap (ADR-0037). Só uma pequena parte tem altura: 35 dos 382 na zona visível, cerca de 9 %. Os outros ficam com 9 m (`mapa.edificio_altura_m`), e a legenda diz «aproximada».
- **A DGT tem dados LiDAR de Portugal continental** no Centro de Dados (CDD): o voo é de 29/05/2024, com a nuvem de pontos (10 pontos/m²) e os modelos de superfície (MDS) e de terreno (MDT) em raster, a 50 cm e a 2 m. A licença é CC BY 4.0 («Acesso público sem restrições»), segundo os metadados do SNIG «Dados LiDAR de Portugal continental» e o catálogo STAC.
- **A zona da demo cabe em 4 folhas de 1 × 1 km:** a 155407, a 155408, a 156407 e a 156408. Usam-se o MDS-50cm e o MDT-50cm, com 8 ficheiros ao todo.
- A altura de um edifício é a diferença entre a superfície (o telhado, no MDS) e o terreno (no MDT), dentro da sua área.
- **Para descarregar, é preciso uma conta no CDD**, como no ortofoto do ADR-0045. É o João quem descarrega, uma vez; a demo nunca vai à rede (ADR-0014).

## Decisão

1. **Só na zona da demo:** a mesma caixa do ortofoto (cerca de 1 × 1,1 km, à volta do corredor da avenida, ADR-0044, e da Av. da Universidade).
2. **A altura medida** de cada edifício é o percentil 90 do (MDS − MDT) dentro da sua área, menos 1 m junto às bordas, para não apanhar paredes nem árvores ao lado. Usam-se o MDS e o MDT em raster; o .laz só se a DGT não tiver os rasters da zona.
3. **Fallback:** sem células suficientes (edifício pequeno ou dados em falta), fica a altura do OpenStreetMap, se existir; senão, os 9 m de hoje. Cada edifício diz de onde vem a altura: medida, OpenStreetMap ou aproximada.
4. **Na zona, nenhum edifício se desenha duas vezes.** Um passo escreve os edifícios da zona com a altura medida (e a origem). A web esconde esses mesmos edifícios na camada dos tiles, pelo id, e desenha-os no lugar deles, com o mesmo estilo (fill-extrusion, 85 % de opacidade, as paletas do ADR-0040). Assim, um edifício dos tiles com 9 m nunca fura um mais baixo medido pelo LiDAR.
   - **Contornos:** os da camada `buildings` do mapa base (PMTiles) no zoom 15, simplificados como no ADR-0037. São os mesmos dos tiles.
   - **Sem medida** (menos de 2 m, que indica um edifício demolido, por construir ou um anexo raso, ou sem células suficientes): o edifício fica na camada dos tiles, com a altura do OpenStreetMap se a tiver, ou com 9 m (ponto 3).
5. **A legenda fica só com «Edifícios»** (ADR-0048). A fonte das alturas vai para o «ⓘ» do painel: «na zona da demo, alturas medidas pelo LiDAR da DGT (2024); fora dela, do OpenStreetMap quando existem, ou 9 m (aproximada)».
6. **Atribuição:** a ficha do LiDAR não tem um texto próprio; usa-se o da DGT, «Informação geográfica cedida pela Direção-Geral do Território», com «LiDAR 2024, CC BY 4.0», na tabela «Fontes de dados e licenças» do `README.md`, no rodapé do mapa («Alturas: © DGT (LiDAR 2024)») e na janela «Dados locais», em «Fontes e licenças» (ADR-0048), com o aviso das fontes abertas do ADR-0023.

## Consequências

- **O que se ganha:** a cidade da demo fica com as alturas reais, e a palavra «aproximada» sai da zona onde o júri olha.
- **Honestidade:** o LiDAR é de outra data, não da semana dos dados. As alturas são medidas, mas não são dados dos sensores; servem só para o desenho.
- **Custos:** um passo novo; os rasters da zona (alguns MB depois do recorte); o descarregamento com conta, pelo João.
- **Prazo:** o código fecha às 13h30 de 20/11, e a equipa submete às 15h30. O agente ajudante prepara o script já, com dados de teste. Se os dados ou a decisão não chegarem a tempo, fica no roadmap.
