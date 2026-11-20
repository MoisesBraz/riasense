# No mapa 3D, vê-se o céu e roda-se à volta, com a bússola, o zoom mais perto e as camadas e a legenda abertas ao mesmo tempo; a falha de dispositivo passa a laranja

Status: aceite pelo Moisés (19/11/2026, pedido do João; parecer do revisor na nota 14483, decisão na nota 14513): entra tudo, com o laranja. **Altera o ponto 1 do ADR-0037** (o máximo de 60° e a rotação só no «3D») e **o ponto 1 do ADR-0033** (a cor da falha de dispositivo, #125). Complementa o ADR-0040 (dia e noite) e o ADR-0041 (pessoas e veículos em 3D).

## Contexto

O João viu o mapa com os modelos do ADR-0041 (!149) e deixou 6 notas:

1. **O magenta da falha de dispositivo não o convence.** Pede um laranja.
   - O magenta vem do ADR-0033 (revisto a 18/11, #125), e foi implementado no `b6e76bd`.
2. **No 3D não se vê o céu e roda-se pouco.**
   - O máximo é de 60° (ADR-0037, ponto 1).
   - O estilo não tem céu (`sky`). Acima de cerca de 69°, aparece o fundo do mapa no lugar do horizonte.
   - Só se roda com o «3D» ligado, e com o botão direito do rato.
3. **Falta a seta do norte.** Depois de rodar, não se sabe para onde fica o norte. A única forma de o repor é o 2.º clique no «3D», que também baixa a inclinação.
4. **Não se abrem as camadas e a legenda ao mesmo tempo.** Hoje, abrir uma fecha a outra (`Basicos.tsx`, «só uma abre de cada vez»).
5. **O zoom devia ir mais perto.**
   - O máximo é 19,5 (`Mapa.tsx`).
   - Com os modelos do ADR-0041, um carro tem cerca de 10 px de comprimento no zoom 18. Nas capturas do !149, no zoom 21 a 22, vêem-se as rodas, as janelas e o passo das figuras.
6. **Uma rua desenhada com a estrada e o passeio.** Fica fora deste ADR (ver as Consequências).

## Decisão

1. **A falha de dispositivo passa a laranja** (o ponto 1 do ADR-0033 muda só na cor).
   - **Candidatos** para o `--state-device`: `#9a3c00` no tema claro (≥ 3,2:1 contra o fundo, a água e os quarteirões das 3 paletas do ADR-0040; o 1.º candidato, `#b34700`, ficava a 2,7:1 da noite) e `#ff9a3c` no escuro (8,6:1 e 7,7:1). Os contrastes confirmam-se com as medidas no MR.
   - **Ressalva (medida do revisor, nota 14483):** o laranja fica junto do âmbar dos alertas («assinalada», «por calcular», «verificar o sensor»). No tema claro, a relação de luminância é de 1,0:1 (o `#9a3c00` contra o `#7a5200`), e no escuro é de 1,18:1. **A diferença vive só no ícone e na forma** (o quadrado com o aparelho com aviso, obrigatórios desde o #125), e não na cor.
   - **Contraste:** ≥ 3:1 contra o mapa (as 3 paletas do ADR-0040) e contra o cartão, medido na implementação (`tokens.test.ts`).
   - O texto («Falha de dispositivo») não muda.
2. **No «3D», a inclinação vai até 85°, e vê-se o céu.**
   - O estilo ganha `sky`, com as cores do céu e do horizonte de cada paleta do ADR-0040: claro de dia, quente ao crepúsculo e escuro de noite, nos dois temas.
   - A abertura continua a 25° no ecrã largo, e o «3D» continua a levar a 55°. Com o «3D», o máximo passa de 60° a 85°.
   - O recuo abaixo de 30 fps do ADR-0037 (ponto 6) não muda.
3. **Com o «3D», roda-se à volta, 360°.** Roda-se com o botão direito do rato, com Ctrl e arrastar, e com o teclado (as setas com Shift). Sem o «3D», o norte fica sempre para cima, como hoje.
4. **A bússola**, no grupo de ferramentas da esquerda, por cima do botão das camadas, só no ecrã largo:
   - **o que mostra:** a seta do norte roda com o mapa;
   - **o que faz:** um clique repõe o norte para cima, sem mudar a inclinação nem o zoom;
   - **acessibilidade:** tem o rótulo «Norte para cima» e a dica do rumo («Rumo: 30°»). Com `prefers-reduced-motion`, a mudança é instantânea.
   - No telemóvel o mapa não roda, por isso não há bússola.
5. **As camadas e a legenda podem estar abertas ao mesmo tempo.**
   - Cada uma abre e fecha no seu botão. Com as duas abertas, a legenda fica ao lado das camadas, sem se sobreporem.
   - **Ecrã baixo:** cada painel tem a sua barra de deslocamento, como hoje.
   - **Telemóvel:** continua a abrir uma de cada vez, porque não há espaço.
6. **O zoom máximo passa de 19,5 a 21 no ecrã largo**, para se verem os modelos do ADR-0041 de perto.
   - **Telemóvel:** fica a 19,5.
   - **Mapa base:** os tiles vão até ao zoom 15 e o MapLibre amplia-os (ADR-0037, Contexto). As linhas e os rótulos continuam nítidos, por serem vetoriais.

## Consequências

- **A demo fica mais «cidade»:** pode baixar-se a câmara até perto do chão, com o céu ao fundo e os peões e os carros à frente, e voltar ao norte com um clique.
- **Honestidade:** nada muda nos dados. O céu segue a luminosidade da hora (ADR-0040), que é calculada e não medida, como já é hoje no fundo do mapa.
- **Riscos:**
  - **Visibilidade:** a 85°, os edifícios podem tapar mais. Ficam os 85 % de opacidade (ADR-0037) e o 2.º clique no «3D» para voltar aos 25°.
  - **Fps:** com mais céu e mais distância à vista, desenham-se mais tiles. Mede-se com o ▶ ligado, como no ADR-0041 (≥ 30 fps, com o mesmo recuo).
  - **Cor:** o laranja e o âmbar dos alertas aproximam-se. Ver o ponto 1.
- **Fora de âmbito, e um ADR à parte se o Moisés quiser:** a rua desenhada com a estrada e o passeio (nota 6).
  - **O que há:** o Living Lab traz os passeios junto às passadeiras como polígonos (`reference-entities/Sidewalk.csv`, `peopleCount`). As faixas e as larguras das ruas não vêm nos dados abertos que temos.
  - **O que exigiria:** desenhar as ruas inteiras com passeio, o que obriga a estimar larguras e por isso pede uma decisão própria sobre o que se diz «aproximado».
- **Desempenho:** os fps a 85°, com o ▶, medem-se com GPU, como no ADR-0041, ponto 8, na implementação (!152).
- **Prazo:** o código fecha às 13h30 de 20/11 (a equipa submete às 15h30). A implementação está no !152.
