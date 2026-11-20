# O mapa fica de dia ou de noite consoante a hora escolhida, pela luminosidade já calculada

Status: proposto (18/11/2026, pedido do João; decisões fechadas com o João no mesmo dia). Complementa o ADR-0018 (a luminosidade calculada pela posição do sol, só como contexto) e o ADR-0033 (as cores dos estados).

## Contexto

- O `luminosidade.parquet` (ADR-0018) já diz, para cada hora da semana, se é **dia** (66 horas), **crepúsculo** (7) ou **noite** (91), e a elevação do sol.
- Hoje, a luminosidade só aparece no cursor de hora e no cartão da passadeira («às escuras»). O mapa tem as mesmas cores às 14h e às 20h.
- O momento da demo, 04/11 às 20h06, é de noite, e o pico dos atropelamentos (17h–19h) cai em horas de noite em novembro (ADR-0018).
- O tema claro ou escuro é uma escolha de quem usa a página, e muda os painéis e o mapa. Não diz nada sobre a hora.

## Decisão

1. **O fundo do mapa segue a luminosidade da hora escolhida:** a paleta de dia, a de noite e uma intermédia no crepúsculo. Mudam o fundo, a água, os quarteirões, os edifícios (ADR-0037), as ruas sem cobertura e os rótulos. Não há cálculo novo: lê-se a classe da hora em `GET /contexto/luminosidade`.
2. **O que não muda:** os painéis, os cartões e a barra seguem o tema de quem usa a página. As cores dos estados, as ruas com sensor, os troços em falha, as passadeiras e os carros também ficam iguais (ADR-0033 e ADR-0034). Medem-se nos 2 temas × 3 paletas (6 fundos), com contraste ≥ 3:1 (WCAG 1.4.11).
3. **Nos dois temas.** **No tema claro, a noite é um cinzento médio** (luminância ≥ 0,43, por exemplo `#adb1b8`, de 0,438; decisão do PO, 19/11), e não escuro: um fundo de noite tão escuro como o do tema escuro deixava as cores dos estados a 2,4 a 2,8:1 e os carros a 1,05:1. Com o cinzento médio, ficam a 3:1 ou mais, e o crepúsculo fica entre o dia e a noite. O mapa não usa de noite as cores do tema escuro, para a legenda e os painéis continuarem a ter as mesmas cores do marcador. No tema escuro, a noite é um tom mais escura e mais azulada do que o dia. Os tokens novos são `--map-*-noite` e `--map-*-crepusculo`, em `tokens.css`.
4. **Sem céu** (decisão do PO, 19/11): no MapLibre o céu só aparece acima de cerca de 69°, e o ADR-0037 fixa o máximo em 60°. A hora vê-se no fundo, na água, nos quarteirões, nos edifícios e na luz, e no ícone de sol, crepúsculo ou lua do cursor. Na vista 3D, a luz dos edifícios segue a elevação do sol: mais forte de dia e quase nenhuma de noite.
5. **A mudança faz uma transição de 600 ms,** que acompanha o ▶ da reprodução. Com `prefers-reduced-motion`, é instantânea.
6. **Diz-se no ecrã:** o cursor de hora já diz «às escuras», e passa a ter também o ícone de sol, de crepúsculo ou de lua. A legenda diz «Fundo do mapa: dia, crepúsculo ou noite, pela posição do sol».
7. **Continua a ser só contexto** (ADR-0018). Não entra no risco potencial nem em nenhum número.

## Consequências

- Na demo, o mapa abre de noite (às 20h de 04/11, já é noite desde as 18h). **Para ver a passagem do dia para a noite, recua-se o cursor para as 16h e carrega-se no ▶;** o guião da demo fá-lo antes da falha das 20h06. Assim, a frase «a maioria das travessias de risco é às escuras» passa a ver-se no mapa.
- **Risco:** confundir a noite do mapa com o tema escuro. Por isso, o ícone e a frase ficam no cursor de hora, e a legenda explica-o.
- **Risco de contraste:** os marcadores, os carros, as listas da passadeira (ADR-0038) e o anel de excesso (ADR-0039) têm de se ler nos 2 temas × 3 paletas, por isso as cores medem-se contra os 6 fundos.
- **Fora de âmbito:** a iluminação pública, as luzes dos edifícios e a meteorologia (nuvens e chuva), que o ADR-0009 já tirou.
- **A demo continua a abrir às 20h de 04/11, e por isso o mapa abre de noite.** É o contexto «às escuras» da falha da RSU0030. O ▶ a partir das 20h não mostra a passagem (a noite dura até às 08h de 05/11).
- **Prazo:** entra no plano (decisão do PO, 19/11): implementa-se a #135, depois do !134 (ícones) no `main`.
