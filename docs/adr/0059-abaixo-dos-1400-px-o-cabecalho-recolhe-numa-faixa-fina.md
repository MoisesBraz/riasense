# Abaixo dos 1400 px, o cabeçalho recolhe numa faixa fina com o separador ativo e o «Offline»

Status: proposto (20/11/2026, pedido do Elicarlos, #218). **Altera o ponto 3 do ADR-0048** só no sítio: entre os 760 e os 1399 px, o indicador «Offline» passa para a faixa recolhida e continua sempre visível.

## Contexto

- Nos portáteis do júri (1280 a 1366 px de largura), o cabeçalho, com os separadores ① a ④ e os botões, tira altura ao mapa.
- O ADR-0048 (ponto 3) quer a palavra «Offline» sempre visível, para o cinzento não parecer avaria.

## Decisão

1. **Entre os 760 e os 1399 px, o cabeçalho fica recolhido** numa faixa de 44 px de altura, que mostra o separador ativo (o número e o nome), o ☰ e o indicador do estado dos dados em qualquer estado («Offline», «Ao vivo», «API sem resposta» ou «por calcular»; ADR-0048, ponto 3, e ADR-0049, ponto 3). O «Simular falha» (ADR-0032, ponto 7) e o tema só aparecem com o cabeçalho expandido.
2. **Expande** com o rato por cima (`:hover`), com o foco do teclado (`:focus-within`) e, em ecrãs tácteis, com um toque na faixa. **Abre por cima do mapa, sem o mexer.** **Recolhe** quando o rato sai, quando o foco sai, com um toque fora ou com o Esc, sem tirar o rato nem o foco (WCAG 1.4.13).
3. **A transição é curta**, e é instantânea com `prefers-reduced-motion`.
4. **A partir dos 1400 px**, o cabeçalho fica como está. **Abaixo dos 760 px**, mantém-se o comportamento móvel que já existe.

## Consequências

- O mapa ganha altura nas larguras de portátil, e quem chega lá vê sempre em que separador está e que a demo corre sem rede.
- **Risco:** um clique num separador ou no «Simular falha» obriga a expandir primeiro, o que dá um passo a mais. O `:hover` e o Tab expandem sem clique. O vídeo grava-se a 1440 px e não muda.
- Aberto, o cabeçalho tapa o topo do mapa (os selos e o topo do pop-up) enquanto o rato lá estiver; o Esc fecha-o.
- **Prazo:** implementa-se na #220. O código fecha às 13h30 de 20/11.
