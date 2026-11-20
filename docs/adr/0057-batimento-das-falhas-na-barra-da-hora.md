# O batimento das falhas na barra da hora: um eletrocardiograma da semana, com um pico por cada hora em que começam falhas

Status: proposto (20/11/2026, pedido do João, que aprovou as capturas). **Altera o ADR-0033, ponto 4** (a barra da hora do ① igual à dos outros separadores, depois de se tirar a fita dos sensores a 19/11, #174), só no ① Vigiar. Complementa o ADR-0033, ponto 1 (as cores e os símbolos dos estados), e o ADR-0048 (a lista das falhas).

## Contexto

- A barra da hora mostra a semana de 3 a 10/11 e o cursor, mas não mostra **quando** aconteceram as falhas. Para as ver, é preciso abrir a lista das falhas ou andar com o cursor.
- As 38 falhas inesperadas da semana começam em 29 horas diferentes. Há duas falhas de rede da RSU0030, com 11 sensores ao todo (04/11 às 20h06, com 9, e 05/11 às 9h56, com 2); as outras 27 são de dispositivo, cada uma numa hora diferente.
- **A fita dos sensores foi tirada a 19/11** (#174): tapava o mapa, com uma linha por sensor. O batimento é diferente: uma só linha, dentro da faixa da barra, sem tapar o mapa.
- O João quer que a semana se leia de relance, como um eletrocardiograma: uma linha plana com um batimento quando alguma coisa deixa de comunicar.

## Decisão

1. **Só no ① Vigiar**, que é o separador das falhas; nos outros, a barra fica como está (ADR-0033, ponto 4). **Por baixo da linha da hora, uma linha plana com um batimento por cada hora em que começam falhas inesperadas** (onda P, pico e onda T). As falhas agrupam-se pela hora de início: 29 batimentos para as 38 falhas.
2. **A altura do pico** cresce com o número de sensores em falha nessa hora. **A forma e a cor** seguem o ADR-0033, ponto 1 («nunca só pela cor»), com as cores do ADR-0042: o pico da falha de rede **sobe**, a vermelho (`--state-error`); o da falha de dispositivo **desce**, a laranja (`--state-device`), como as ondas negativas de um eletrocardiograma (decisão do Moisés, 20/11, nota 16474). A linha de base fica a meio da faixa. Sem símbolos no pico (o João). Sem transparência: pelo menos 3:1 de contraste com o fundo da barra nos 2 temas. O tipo também está na dica, no `aria-label` de cada batimento e na lista das falhas.
3. **Só até à hora do cursor**, como a linha do tempo do pop-up da RSU (ADR-0033, ponto 4): os batimentos vão aparecendo com o ▶ e nunca mostram o futuro.
4. **Cada batimento é um botão:** uma dica diz a hora, o número de sensores e o tipo (por exemplo, «04/11 20h06 · 9 sensores em falha (rede, RSU0030)»), e o clique leva o cursor a essa hora. Para os leitores de ecrã, a escala desenhada é decorativa (`aria-hidden`), e cada batimento tem um `aria-label`; fica fora da ordem do Tab (`tabIndex -1`), porque a lista das falhas (ADR-0048) já dá o mesmo acesso pelo teclado. Com cerca de 6 px por hora a 1440 px, os batimentos não cabem em alvos de 44 px; a lista é a alternativa equivalente (WCAG 2.5.8). Os traços têm pelo menos 3:1 de contraste com o fundo.
5. **Sem dados novos:** usa as falhas que o `GET /vigiar/falhas` já devolve. Nenhum número muda.
6. **A faixa da barra** passa de 40 para 58 px.

## Consequências

- Mais: a semana lê-se num segundo, e o caso da RSU0030 salta à vista antes de se carregar no ▶.
- Menos: no telemóvel (390 px), a barra fica 18 px mais alta e os batimentos ficam mais juntos; no ecrã largo não muda, porque o rótulo da hora já é mais alto do que a faixa.
- **Fora de âmbito:** os batimentos do «Agora» e do «Ao vivo», e as falhas esperadas (sem atividade a essa hora).
