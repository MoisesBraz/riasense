# O mapa mostra e o painel resume: cada estado do sensor tem uma cor fixa, e clicar num sensor abre um pop-up

Status: proposto (17/11/2026). Pontos 1 e 2 revistos a 17/11, às 23h20: depois de ver a escala roxa, o PO decidiu manter o risco potencial do amarelo ao vermelho. Pontos 3 e 4 revistos a 18/11, só para o ① Vigiar (#102): o mapa abre sozinho. Revistos outra vez a 18/11, às 14h (#105): o detalhe volta a abrir num pop-up no mapa, e a barra lateral fica só para as listas dos chips (a barra lateral para o detalhe, que o #102 tinha posto, deixa de valer). Ponto 1 revisto a 18/11, às 22h (#125): a falha de rede e a de dispositivo têm cor e ícone diferentes, e o ícone do tipo vale em todos os separadores. Ponto 1: o anel de excesso do ADR-0039 junta-se ao mapa e não é um estado do sensor (19/11). Complementa: Ponto 1, a cor da falha de dispositivo: passa de magenta a laranja pelo ADR-0042 (aceite a 19/11); o que a distingue do âmbar dos alertas é o ícone e a forma.
- o ADR-0007 (o tracejado para o estimado e o cinzento para as ruas sem cobertura);
- o ADR-0013 (a legenda do risco potencial);
- o ADR-0015 (onde pôr o próximo sensor);
- o ADR-0030 e o ADR-0032 (o alerta «sem comunicação» do painel «agora»).

## Contexto

- O João propôs a 17/11, e o PO concordou, que a app tem texto a mais. Os painéis explicam o método e as decisões, mas quem a usa (o técnico do IT, a Câmara e o júri) olha para o mapa e não lê parágrafos.
- O levantamento do `main` (ac178c4), feito a 17/11, mostra o seguinte.
  - **Texto:**
    - o Completar tem 4 cartões e cerca de 400 palavras;
    - o Proteger e o risco têm cerca de 100 a 120 palavras cada, quase todas a explicar o método;
    - há cartões só de validação: «Erro ao deixar um sensor de fora» e «Contra a referência».
  - **Cliques:** clicar só funciona nas passadeiras, e só muda o painel da direita. Não há pop-up nem gráfico de um sensor no mapa, e clicar na RSU não faz nada.
  - **Cores: nenhum ADR fixa as cores dos estados.**
    - Um sensor ativo tem a cor do texto (preto no tema claro, cinzento-claro no escuro), e não verde.
    - O vermelho quer dizer falha, erro da app, modelo «fora» e risco alto (`--risk-4` e `--risk-5`).
    - O âmbar quer dizer falha de dispositivo, «assinalada», «por calcular» e «verificar o sensor» (o levantamento de 17/11; a falha de dispositivo deixou de ser âmbar no ponto 1, #125).
    - O «estimado» e o halo da previsão estão pintados com o azul de destaque, que o `tokens.css` reserva para a interface.
  - **Próximo sensor:** o `proximo_sensor.parquet` já tem `lon` e `lat`, mas os sítios só aparecem numa lista de texto. Tem dois rankings, um de passadeiras e outro de zonas turísticas, e cada um começa em 1.
- O PO (Moisés) decidiu a 17/11, nas perguntas Q1 a Q6. As respostas estão na #89.

## Decisão

1. **No Vigiar e no Completar, a cor diz o estado de saúde do sensor. Em todos os separadores, o traço diz se o valor é medido ou estimado.** O verde e o vermelho servem só para a saúde do sensor e para os erros, com uma exceção: a escala do risco potencial (ponto 2). Nenhum estado se distingue só pela cor: a forma também muda.

   | Estado | Quando | Marcador | Cor |
   |---|---|---|---|
   | **Ativo** | O sensor está a medir. Inclui o sossego normal (GLOSSARY), por exemplo a noite sem movimento | círculo cheio | verde (`--state-ok`) |
   | **Atenção** | «Verificar o sensor» (GLOSSARY), ou «sem comunicação» no painel «agora» (ADR-0030) antes de ser falha | círculo vazio | âmbar (`--state-warn`) |
   | **Falha de rede** | Falha inesperada de rede (GLOSSARY e ADR-0025): vários sensores da mesma RSU ficam sem comunicação ao mesmo tempo | símbolo da falha em círculo, com o ícone de sinal cortado (arcos com um traço diagonal); a RSU leva o halo | vermelho (`--state-error`) |
   | **Falha de dispositivo** | Falha inesperada de um só sensor (ADR-0025) | símbolo da falha em quadrado, com o ícone de aparelho com aviso | magenta (`--state-device`, token novo) |
   | **Estimado** | O sensor está em falha, e o sensor virtual da ② dá o valor | contorno tracejado | a cor da falha (vermelho na de rede, magenta na de dispositivo) |
   | **Sem cobertura** | A rua não tem sensor (ADR-0007) | linha | cinzento (`--nocoverage-line`) |

   - **Falha e estimado à mesma hora:** o Vigiar mostra o símbolo da falha, e o Completar mostra o contorno tracejado.
   - **Rede ou dispositivo (alterado a 18/11, #125):** distinguem-se **em cor, em ícone e em forma** (círculo na falha de rede, quadrado na de dispositivo, ambos no canto do marcador do tipo), e nunca só pela cor. Uma falha de rede pinta também a RSU de vermelho, com halo; uma falha de dispositivo marca só o sensor. O pop-up, a dica do marcador, os chips e a lista dizem o nome por extenso («Falha de rede», «Falha de dispositivo»).
   - **Cores da falha de dispositivo:** candidatos com contraste de pelo menos 3:1 contra o mapa e o cartão nos dois temas: `#a3175f` no claro (5,8:1 contra o mapa) e `#ff8fd0` no escuro (8,7:1). Validam-se com as medidas no MR da implementação. **Ressalva:** o vermelho e o magenta quase não se distinguem em luminância (1,13 a 1,21:1), por isso, para quem tem daltonismo, a diferença vive **no ícone e na forma**, que são obrigatórios; confirma-se na implementação com uma captura simulada de daltonismo.
   - **O ícone do tipo vale em todos os separadores** (Vigiar, Completar, Prever, Proteger e risco), no marcador, na legenda, no pop-up **e em cada linha do painel da direita que nomeia um sensor** (listas, rankings e gráficos: ao lado do nome, o mesmo ícone do marcador, com a cor e o símbolo do estado quando o painel mostra o estado; pedido do PO a 18/11): passadeira (peão), zona turística (edifício) e RSU (antena). **Os sensores sem marcador no mapa** (a maioria das falhas da lista do Vigiar: os segmentos, que no mapa continuam a ser linhas, ADR-0034, e os estacionamentos, que não têm posição própria, porque a RSU está na dela) **mostram nas linhas dos painéis o ícone do tipo que a legenda explica**: o segmento com um traço curto («linha») e o estacionamento com um «P». A legenda passa a ter, no grupo «Tipo», estes dois além da passadeira, da zona e da RSU. Os ícones são da família da app (grelha de 24, traço de 1,6, pontas redondas).
   - **Regras de UI e UX (WCAG 2.1):** nenhum estado só pela cor (1.4.1); contraste dos símbolos de pelo menos 3:1 contra o mapa e o cartão (1.4.11), nos dois temas; a mesma cor e o mesmo ícone no marcador, na legenda, no pop-up, nos chips, na lista e nas linhas do painel da direita; alvos de toque de pelo menos 44 px; no máximo **6 símbolos de estado** no mapa.
   - **«Verificar o sensor» na reprodução:** só fica âmbar a partir do primeiro dia da janela em que se mede a queda (para a SC0023, 07/11), para não se antecipar o que ainda não aconteceu.
   - **Painel «agora»:** o alerta «sem comunicação» é âmbar, e passa a vermelho quando o silêncio cumpre o critério da falha inesperada.
   - **Erro da app:** quando a API não responde, o aviso também é vermelho, porque é um erro.
   - **Legenda do Vigiar e do Completar:** mostra estes 6 estados, com o ícone e o nome em texto, e com o nome da coluna «Estado».
2. **No Prever, no Proteger e no risco, o marcador mostra o resultado, sem verde.** No marcador, o vermelho só aparece na escala do risco potencial. O pop-up continua a mostrar o estado de saúde, incluindo o símbolo da «Falha de rede» (círculo vermelho) ou da «Falha de dispositivo» (quadrado magenta).
   - O estimado continua a ser tracejado (ADR-0007), na cor do resultado (no risco, na cor do degrau).
   - **O risco potencial** mantém a escala quente dos Fundamentos, com 5 degraus, do amarelo-claro (baixo) ao vermelho-escuro (alto): `--risk-1` a `--risk-5`, iguais aos do `main` antes da #90. O PO decidiu-o depois de ver a escala roxa. No separador do risco, o mapa não mostra os estados de saúde. A falha só aparece no pop-up, com o símbolo e o texto da falha, por isso o vermelho do degrau não se confunde com ela: o que os distingue é a forma e o texto. **Tem de ser legível nos dois temas:** os degraus mais claros quase não se distinguem do fundo claro do mapa, e o mais escuro do fundo escuro. Por isso, cada degrau leva um contorno que o separa do fundo do mapa. A legenda do risco mantém:
     - a escala;
     - as 3 componentes e a confiança à parte (ADR-0013);
     - o tracejado do estimado;
     - o «não mede acidentes».
   - **No Prever,** «ganha» e «fora» deixam de ser verde e vermelho e ficam em texto neutro. O halo da previsão também passa a uma cor neutra.
   - **No Proteger,** a «assinalada» mantém o «!» âmbar, porque é um aviso.
   - **O azul de destaque** fica para a interface (botões, separador ativo e seleção) e para as ruas com sensor (#88).
   - **O estado de saúde** aparece sempre no pop-up (ponto 3), em todos os separadores.
3. **Clicar num sensor abre um pop-up no mapa**, preso ao marcador, em vez de mudar o painel da direita.
   - **O que mostra:**
     - o nome, o tipo e o estado, com a cor do ponto 1;
     - **um número grande:** o valor à hora escolhida, medido, ou estimado com o intervalo de 80 %;
     - **um gráfico:** o real contra o virtual, ou contra a previsão;
     - **uma linha que depende do separador:**
       - Vigiar: desde quando está em falha, e se a falha é de rede ou de dispositivo;
       - Completar: o erro esperado;
       - Prever: a previsão;
       - Proteger: o efeito na velocidade, e se a passadeira está assinalada;
       - Risco: o degrau, as 3 componentes e a % de veículos acima do limite (ADR-0013). Uma passadeira com semáforo mostra «não se aplica» e não 0, se o ADR-0024 entrar.
   - **No máximo 25 palavras de texto**, sem contar com as etiquetas obrigatórias (ponto 4).
   - **Clicar numa RSU** abre o pop-up dela, com os seus sensores e o estado de cada um.
   - **Para já, só passadeiras, RSU e zonas turísticas**, que são os que têm marcador (as zonas turísticas entram no ① Vigiar a 18/11, #105). Segmentos e estacionamento ficam para depois; os segmentos são troços e desenham-se como linhas (ADR-0034).
   - **No telemóvel**, ou em qualquer ecrã estreito, o pop-up abre como uma folha que sobe do fundo. Fecha com Esc ou com um clique fora, e usa-se pelo teclado.
   - **No ① Vigiar, o detalhe abre num pop-up no mapa, preso ao marcador** (decisão do PO a 17/11, voltou a 18/11 a pedido do João, nota 12661 do !99, #105). Clicar num sensor mostra só esse sensor e o gráfico do ponto 3; clicar na RSU mostra os sensores dela por estado. Nas passadeiras em falha, junta «Ver a estimativa →». A RSU diz no pop-up que a **posição é aproximada** (é a média dos lugares de estacionamento; os dados não trazem a posição da antena). A barra lateral abre só ao clicar num chip, com a lista dessas falhas, e clicar numa linha abre o pop-up desse sensor. No telemóvel, o pop-up abre como uma folha que sobe do fundo, e fecha com ✕, com Esc, com um clique no mapa vazio ou ao mudar de separador. Passar o rato num marcador mostra o nome e o estado. Nos outros separadores, o pop-up mantém-se.
4. **O painel da direita resume o separador.**
   - O título é a pergunta, sem fórmula por baixo.
   - Tem **2 ou 3 números grandes** e **1 gráfico ou lista**. Clicar numa linha da lista centra o mapa nesse sensor e abre o pop-up.
   - **A comparação com a referência fica à vista, como um dos números grandes** (`AGENTS.md`; ADR-0005, ADR-0010 e ADR-0027):
     - no Completar, o erro do sensor virtual contra o da referência;
     - no Prever, quanto menos erra a previsão do que a referência e do que a persistência.

     Os cartões de validação («Erro ao deixar um sensor de fora» e «Contra a referência») deixam de existir. O resto da validação (as janelas e as ressalvas) e as explicações do método ficam na wiki (Camadas-e-modelos) e no pitch.
   - Cada separador tem um botão «ⓘ», com uma nota de 40 palavras no máximo.
   - **As etiquetas que outros ADR exigem ficam com o texto exato** e não contam para os limites de 25 nem de 40 palavras:
     - «não mede acidentes» (ADR-0013);
     - «redução potencial estimada» e «hipótese» (ADR-0015);
     - «Dados recolhidos de fontes abertas…» (ADR-0017 a ADR-0019 e ADR-0022);
     - «às escuras», no pop-up da passadeira (ADR-0018);
     - «reprodução da semana» (ADR-0029);
     - a etiqueta do simulador, «Simulação com dados fictícios…», sempre visível e com teste (ADR-0032);
     - «estimado» (GLOSSARY).

     A ressalva do ADR-0006 (os resultados das passadeiras que partilham segmentos não são independentes) passa para o «ⓘ» do Proteger.
   - **No ① Vigiar, ao abrir, não há painel** (alterado a 18/11, #92). O mapa ocupa a largura, com 3 chips por cima («38 falhas», «2 falhas de rede» e «27 de dispositivo», hoje) e a barra da hora em baixo. Clicar num chip abre a barra lateral com a lista dessas falhas, e clicar numa linha abre o pop-up desse sensor. A legenda (com os 6 estados do ponto 1) e as camadas abrem fechadas. Em todos os separadores, o cabeçalho deixa de ter os textos «Zona…» e «Dados locais…». **O marcador leva o ícone do tipo** (passadeira, zona turística e RSU), na cor e no traço do estado do ponto 1: a forma do estado (círculo cheio, vazio, símbolo da falha em círculo ou quadrado, e tracejado) continua a existir. A faixa do «agora» é a do ADR-0032 (ponto 7).
   - **Não há fita dos sensores por cima do cursor da hora** (retirada a 19/11, às 18h, a pedido do João e do Moisés, #174). Tinha entrado nesse dia (#156, #101), com uma linha por passadeira da zona da demo e uma para a RSU0030 por cima do ▶. Saiu porque, por cima do ▶ e do cursor, tapava o mapa e repetia o que já se vê noutros sítios. A barra da hora do ① Vigiar fica igual à dos outros separadores (o ▶, a hora e o cursor). **A informação continua na linha do tempo do pop-up da RSU** (ponto 3): os sensores dessa RSU, ativos ou em falha, hora a hora, só até ao cursor.
5. **«Onde pôr o próximo sensor» aparece no mapa.**
   - Um botão no Completar mostra no mapa os sítios do `proximo_sensor.parquet` com **redução potencial de pelo menos 0,01** (hoje, 8). Para já, entram **só as passadeiras**, porque, fora do ① Vigiar, as zonas turísticas ainda não têm marcador (ponto 3).
   - Os sítios aparecem **numerados pela ordem** (1, 2, 3…), com um marcador próprio: um alvo neutro, nem verde nem vermelho.
   - Clicar num sítio abre o pop-up, por exemplo: «Redução potencial estimada: 0,34 (hipótese)», e a distância ao vizinho mais próximo. **O aviso da frase do local fica no pop-up** (ADR-0015, #33). Por exemplo, na SC0016, o 1.º lugar, a atividade subiu cerca de 2,7 vezes.
   - A lista do painel fica só com o número, o local e a redução.
   - Só entram os sítios que já existem, ou seja, os sensores atuais que os vizinhos explicam mal (ADR-0015). Os pontos em zonas sem sensor ficam de fora.
6. **Só muda a web.**
   - Nenhum número nem nenhum Parquet muda.
   - Se o pop-up precisar de um ponto de acesso novo na API, esse ponto só pode ler Parquet que já existam.
   - Os termos «Ativo» e «Atenção» entram no `GLOSSARY.md`, no MR da implementação.

## Consequências

- O júri vê primeiro o mapa e as cores, e tem menos para ler. As explicações continuam na wiki e no pitch, e o PO atualiza a wiki com o que sai da app.
- O relatório de 18/11 não muda. O vídeo de reserva (`web/scripts/gravar-demo.mjs`) e as capturas da wiki refazem-se depois do merge.
- **Ordem:** o !89 (#88) e o !83 entram antes, porque mexem nos mesmos ficheiros. O !90 (#87, o painel «agora») segue as cores do ponto 1.
- **18/11:** o ① Vigiar muda de pop-up para barra lateral (pontos 3 e 4), a pedido do João, no !99 (#92). O PO decidiu que a alteração entra neste ADR (#102), num MR só com o ADR (ADR-0016), e que a fita dos sensores fica para a #101.
- **18/11, 14h:** o ① Vigiar volta ao pop-up no mapa (pontos 3 e 4), a barra lateral fica para as listas dos chips, e o marcador leva o ícone do tipo (#105). O PO aprovou-o depois da entrega do relatório, num MR só com o ADR (ADR-0016). O !99 fica num só MR, sem mais âmbito.
- **19/11:** a fita dos sensores entra no ponto 4 (#156, para a #101), num MR só com o ADR (ADR-0016). A implementação vem depois, num MR próprio, até ao fecho do código, a 20/11, às 13h30.
- **19/11, 18h:** a fita dos sensores sai do ponto 4, a pedido do João e do Moisés (#174), num MR só com o ADR (ADR-0016); a remoção do código é a #175.
- **Prazo:** a implementação (#90) tem de estar no `main` antes do congelamento de sexta, 20/11, às 13h. Se não chegar a tempo, a demo fica como está.
- **Riscos:**
  - Mudam muitos testes da web (os painéis, os estados e a legenda).
  - Com menos texto na app, as ressalvas passam a depender do «ⓘ» e do pitch, e o júri pode não as ver se não as procurar.
