# A avenida da demo em 3D: asfalto com as faixas, passeios e carros estacionados nos lugares com sensor, na ocupação medida

Status: aceite pelo Moisés, na condição das 10h (19/11/2026; parecer do revisor na nota 14491, decisão na nota 14515): entra se a implementação (!156) estiver verde e pronta para revisão até às 10h de 20/11; senão, fica no roadmap. Complementa o ADR-0037 (a vista 3D), o ADR-0038 (as passadeiras com a forma real), o ADR-0041 (os peões e os veículos em 3D) e o ADR-0042 (navegar no 3D).

## Contexto

O João quer, na vista 3D, «uma avenida completa, com passeios e carros estacionados». Hoje, a rua é uma linha azul (as ruas com sensor, ADR-0034) sobre o fundo plano, e os carros andam por cima dessa linha. O agente ajudante fez o levantamento dos dados (relatório de 19/11):

- **Estrada:** o `RoadSegment` do Living Lab tem o número de faixas (`totalLaneNumber`: 1, 2 ou 3), o sentido e o limite em todos os segmentos. Os segmentos são por sentido. **Não tem largura.** O mapa base (Protomaps) não tem faixas, largura nem passeios.
- **A largura medida:** vem do comprimento das passadeiras, de passeio a passeio. Na Av. 25 de Abril dá 10,1 m (SC0019) e 9,1 m (SC0021); na Av. de Oita, 13,8 m. Bate com 2 faixas de cerca de 3 m por sentido, mais a berma.
- **Passeios:** o `Sidewalk` tem 46 polígonos, todos nas pontas das passadeiras: são os patamares, com cerca de 6,1 × 2,1 m. Não há passeios ao longo das ruas.
- **Estacionamento:** há 264 lugares (`ParkingSpot`), cada um um ponto, com o estado livre ou ocupado por evento. **A ocupação é medida lugar a lugar, em cada hora.**
  - Na zona da demo há 10 lugares da RSU0030, em fila na Av. 25 de Abril, a 5,1 m uns dos outros (estacionamento em paralelo), com uma mediana de 6 ocupados em 10.
  - Depois da falha das 20h06 de 04/11, o estado destes lugares é desconhecido.
  - Junto às SC0023 e SC0024 há mais 12 lugares, da RSU0028.
- **O eixo dos segmentos não é o centro da via** (protótipo do ajudante, 19/11):
  - nas duas avenidas, corre junto à berma sudoeste. Na SC0019, os patamares ficam a 10,8 m de um lado do eixo e a 1,6 m do outro; na SC0021, a 7,9 e 3,8 m; na SC0022, a 11,3 e 5,1 m;
  - só na R. D. Afonso V coincide;
  - os 10 lugares da RSU0030 estão em cima do eixo, ou seja, na berma.
- **Faixas por 3 m contra a largura medida:**
  - na Av. 25 de Abril, 1 + 1 faixas a 3 m dão 6 m, contra 9,1 a 10,8 m medidos: falta a faixa de estacionamento e as bermas;
  - na Av. de Oita, 3 + 3 faixas dão 18 m, contra 13,8 m medidos. Não é claro o que o `totalLaneNumber` conta.
- **Avaliado e posto de lado:** fotografias da avenida e imagens do Google. Os modelos são low poly, sem texturas, e as imagens do Google não se podem usar offline (ADR-0037).

## Decisão

1. **Onde:** só no corredor da demo. É a Av. 25 de Abril, da SC0023 à SC0019, com uns 60 m da Av. de Oita para cada lado do cruzamento. Aparece na vista inclinada do ecrã largo, a partir do zoom 17, como os modelos (ADR-0041). Fora do corredor, o mapa fica como hoje.
2. **O asfalto e as faixas acertam-se pelas passadeiras medidas:**
   - **centro e largura:** em cada passadeira, o centro da via é o meio dos 2 patamares e a largura é a distância entre eles. Ambos são medidos. Entre passadeiras do mesmo troço interpolam-se ao longo do eixo do segmento (interpolado); depois da última passadeira, mantém-se o último valor até ao cruzamento;
   - **estacionamento:** onde há lugares com sensor, uma faixa de 2,0 m (estimada) do lado deles;
   - **faixas de rodagem:** o número e o sentido vêm do `RoadSegment`. A largura de cada faixa é o que sobra a dividir pelas faixas;
   - **linhas:** a linha do meio separa os sentidos. As linhas entre faixas só se desenham onde dão uma largura plausível (2,5 a 3,8 m). Na Av. de Oita, onde o número de faixas não bate, fica só a linha do meio, «por confirmar com o IT»;
   - **os carros em andamento** (ADR-0041) passam a andar no centro do seu sentido, deslocados do eixo do segmento pelo mesmo acerto. Hoje andam no eixo, ou seja, na berma;
   - **a «rua com sensor» no corredor:** a linha azul (ADR-0034) fica no eixo do segmento, que corre na berma. Por isso, no corredor e a partir do zoom 16, a linha sai, e o estado vê-se no próprio asfalto: o troço em falha fica com o asfalto avermelhado, na cor da falha. Fora do corredor, ou abaixo do zoom 16, a linha fica como está;
   - é desenhado como camadas do MapLibre, com cores dos tokens nas 3 paletas do ADR-0040 e sem texturas.
3. **Os passeios:**
   - os patamares das passadeiras são **medidos** (`Sidewalk`);
   - entre eles, o passeio contínuo de 2,1 m de cada lado (a largura dos patamares) é **estimado**;
   - ficam ligeiramente em relevo (cerca de 15 cm), cortados nas passadeiras e nos cruzamentos.
4. **Os carros estacionados são os medidos:**
   - em cada lugar com sensor, um carro parado se o lugar estiver ocupado nessa hora, e nada se estiver livre;
   - **«ocupado nessa hora»** é o estado do lugar a meio da hora: o último evento do sensor até às hh:30. Sem nenhum evento até lá, ou com a RSU em falha nesse instante (①), o estado é desconhecido;
   - os modelos são os ligeiros do ADR-0041, em paralelo, encostados ao passeio. A orientação vem da rua, e é estimada;
   - **lugar com estado desconhecido** (por exemplo, a fila da RSU0030 depois das 20h06): o lugar fica marcado no chão, a tracejado, sem carro. A falha da RSU vê-se também no estacionamento, e nada se inventa;
   - fora dos lugares com sensor, não há carros estacionados.
5. **A legenda diz o que é medido e o que é estimado:** «Vista 3D: a largura da via e os patamares medidos nas passadeiras, e interpolados entre elas; passeios e faixa de estacionamento estimados; carros estacionados só nos lugares com sensor, na ocupação medida».
6. **Pipeline:** um passo novo (ou uma extensão do `carros`) escreve os GeoJSON do corredor (asfalto, faixas, passeios, lugares) e a ocupação dos lugares por hora. A web lê-os pela API, como as outras camadas.
7. **Desempenho:** a mesma regra do ADR-0041 (≥ 30 fps, com o mesmo recuo). Os carros estacionados são poucos (no máximo 22) e instanciados.

## Consequências

- **O que se ganha:** o júri vê uma avenida a sério, com o trânsito, os peões e o estacionamento, e a falha da RSU0030 a apagar também a ocupação dos lugares.
- **Limites dos dados:**
  - o `totalLaneNumber` da Av. de Oita (3 + 3) não bate com a largura medida (13,8 m): ou conta as vias de viragem, ou é contado de outra forma. Fica só a linha do meio, «por confirmar com o IT»;
  - o eixo dos segmentos corre na berma, e não no meio da via. Não sabemos porquê: é como o IT os desenhou. O acerto pelas passadeiras compensa isso no corredor; fora dele, as linhas ficam como estão.
- **Honestidade:** a largura da via é medida nas passadeiras e interpolada entre elas. Os passeios contínuos e a faixa de estacionamento são estimados. A legenda di-lo. O resto é medido ou vem do Living Lab.
- **O que se pergunta ao IT:** o que conta o `totalLaneNumber` na Av. de Oita, e porque é que o eixo dos segmentos fica na berma.
- **Fora de âmbito:** o resto da cidade, árvores, candeeiros e mobiliário urbano, texturas e fotografias, e estacionamento sem sensor.
- **Prazo:** o código fecha às 13h30 de 20/11 (a equipa submete às 15h30). A implementação (!156) tem de estar verde e pronta para revisão até às 10h de 20/11; senão, fica no roadmap.
