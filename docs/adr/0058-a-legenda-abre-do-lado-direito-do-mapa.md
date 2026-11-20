# A legenda abre do lado direito do mapa, com o botão logo acima do «+»

Status: proposto (20/11/2026, pedido do Elicarlos, #217). **Altera o ponto 5 do ADR-0042**: as camadas e a legenda continuam a poder estar abertas ao mesmo tempo, mas ficam em lados opostos do mapa, e já não lado a lado.

## Contexto

- Hoje, o botão da Legenda está no grupo de ferramentas da esquerda, por baixo das Camadas. Com as duas abertas, a legenda fica ao lado das camadas (ADR-0042, ponto 5), e juntas tapam meio mapa à esquerda.
- A coluna da direita só tem o zoom e o ⓘ da atribuição, por isso há espaço livre.

## Decisão

1. **O botão da Legenda passa para a coluna dos controlos da direita**, logo acima do «+» do zoom, com o mesmo estilo dos outros controlos e 44 × 44 px a 390 px.
   - **Telemóvel:** o mapa é baixo e os 3 cartões e o seu «ⓘ» ficam por cima do zoom. O botão sobe ao topo da coluna da direita, à altura das Camadas, para não tapar os cartões.
2. **A caixa da legenda abre à direita**, encostada a essa coluna, desde o topo do mapa até, no máximo, à base do zoom. O que não cabe desliza (`max-height` e `overflow-y: auto`, como as outras caixas, #211), também pelo teclado. Não tapa o zoom nem o ⓘ da atribuição.
3. **As Camadas continuam à esquerda.** No ecrã largo, as duas podem estar abertas ao mesmo tempo, agora em lados opostos. No telemóvel abre uma de cada vez, como hoje (ADR-0042, ponto 5).
4. O conteúdo da legenda não muda (ADR-0048, ponto 1).

## Consequências

- Com as duas caixas abertas, o centro do mapa fica livre.
- **Risco:** na direita também abrem o pop-up de um sensor e o painel lateral. A caixa da legenda fica por baixo deles e fecha-se no seu botão.
- **Prazo:** implementa-se na #219. O código fecha às 13h30 de 20/11.
