# A legenda só mostra o que está no mapa, o indicador «offline» fica cinzento, o tema fica no cabeçalho e a lista das falhas é paginada e filtrada

Status: aceite pelo Moisés (19/11/2026, pedido do Moisés; decisões fechadas com ele no mesmo dia, #159). **Altera os pontos 1, 2 e 4 do ADR-0033** (a legenda, as etiquetas obrigatórias e a lista das falhas); a linha de Status do ADR-0033 acrescenta-se quando o !151 e o !162, que mexem no mesmo ficheiro, entrarem. **Altera também** o sítio do aviso das fontes abertas, que os ADR-0017, 0018, 0019, 0022 e 0036 (ponto 7) pediam «na legenda» (passa à janela «Dados locais»), e o ADR-0007 (:3) e o ADR-0013 (:24), que punham as componentes do risco na legenda (ficam no painel do risco, que já as mostra). Complementa o ADR-0047 (os mapas de calor).

## Contexto

- A legenda junta aos símbolos frases explicativas: os componentes do risco, «não mede acidentes», a fonte dos semáforos, «cada ponto ≈ N veículos», o anel, a vista 3D, o fundo do mapa e as alturas. Fica comprida e repete o que o painel já diz.
- O aviso «Dados recolhidos de fontes abertas…», que os ADR-0017, 0018, 0019 e 0022 pedem, hoje não aparece em lado nenhum da app.
- O ponto do cabeçalho fica **verde** quando a API local responde. A demo corre sem rede por desenho, e o verde lê-se como «ligado».
- O botão do tema está no cabeçalho **e** na janela «Dados locais». Abaixo de 760 px, a direita do cabeçalho esconde-se, e o tema só se muda nessa janela.
- A lista das falhas (38) abre na coluna da direita, sem paginação. No telemóvel e entre 760 e 979 px faz a página crescer.

## Decisão

1. **A legenda só tem o que se vê no mapa:** cada linha é o símbolo e um nome curto (os 6 estados, os tipos, «RSU com falha de rede», os degraus do risco, «Rua com sensor», «Sem cobertura», «Trânsito», «Acima do limite», «Semáforo», «Peões 3D», «Edifícios», «Dia ou noite», «Previsão», «Próximo sensor (hipótese)» e os mapas de calor do ADR-0047, com «pouco → muito»). Saem as frases.
2. **As ressalvas obrigatórias ficam fora da legenda,** sempre visíveis onde fazem sentido:
   - «Risco potencial · não mede acidentes» e as componentes do risco (exposição, comportamento e previsão, e a confiança à parte): o painel do risco (já existem);
   - «às escuras» e «reprodução da semana»: a barra da hora (já existe);
   - «Simulação com dados fictícios…»: o painel «agora» (já existe, ADR-0032);
   - a fonte aberta dos semáforos (OpenStreetMap, por validar com a Câmara) e das alturas (OpenStreetMap, 9 m quando falta), e o que vale cada ponto do «Trânsito», cada figura 3D e cada mapa de calor: o «ⓘ» do painel;
   - **«Dados recolhidos de fontes abertas, usados só para contexto e coerência. Carecem de validação junto das entidades responsáveis»**: a janela «Dados locais», junto de «Fontes e licenças».
3. **O indicador:** o estado normal é um ponto **cinzento com a palavra «Offline»** visível (a demo corre sem rede); a carregar e «por calcular» continuam a cinzento com o seu texto; o erro continua a vermelho, «API sem resposta».
4. **O tema fica só no cabeçalho,** também no telemóvel (ao lado do ☰); sai da janela «Dados locais».
5. **A lista das falhas,** na coluna da direita:
   - **nunca passa da altura da janela**, em nenhum tamanho;
   - **é paginada pela altura disponível**: cabem as linhas que a altura deixar (num ecrã mais baixo, menos por página e mais páginas), com «1–N de M» e ‹ ›;
   - **dois filtros que se combinam:** tipo de falha (Todas, Rede, Dispositivo) e tipo de sensor (Todos, Passadeira, Segmento, Estacionamento, Zona), cada opção com a contagem; **não há opção «RSU»**, porque nenhuma falha tem esse tipo (as falhas de rede filtram-se por «Rede», e o estacionamento mede-se na própria RSU); uma opção que fica vazia com o outro filtro mostra «(0)» e fica desativada;
   - os 3 chips do mapa abrem-na já com o filtro certo; mudar de filtro volta à página 1; clicar numa linha abre o pop-up.

## Consequências

- A legenda lê-se de relance; as explicações e as ressalvas continuam na app, onde se leem com o contexto.
- Corrige-se a falta antiga do aviso das fontes abertas.
- O cinzento não pode parecer avaria: por isso a palavra «Offline» fica sempre visível.
- **Prazo:** implementa-se pelo agente Programador (#161). O código fecha às 13h30 de 20/11 (a equipa submete às 15h30).
