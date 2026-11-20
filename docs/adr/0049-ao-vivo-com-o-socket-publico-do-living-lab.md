# Um modo «Ao vivo» mostra o que os sensores do Living Lab detetam agora, a partir do socket.io público, por trás de um botão

Status: aceite pelo Moisés (19/11/2026, grilling do Moisés, #163). **Pontos 4 e 6 e o «Fora de âmbito» alterados pelo ADR-0055** (19/11: todas as camadas, o esperado e o risco potencial ao vivo). **Altera** o ADR-0030 (pontos 1 e 4 e o «Fora de âmbito»: passa a haver uma fonte ao vivo, sem autorização do IT, mas só o socket público), o ADR-0028 (o WebSocket do IT precisava de autorização) e o ADR-0029 (que chama «modo ao vivo» à reprodução da semana: o «Ao vivo» deste ADR é outra coisa, e o GLOSSARY distingue-os), e abre uma exceção ao filtro 3 do ADR-0023 para este socket. Complementa o ADR-0032 (o simulador continua), o ADR-0014 (a demo offline continua igual sem rede) e o ADR-0048 (o indicador «Offline»).

## Contexto

- A 17/11, o IT recusou dar-nos acesso a uma API de tempo real (#19, Q16: «Não podemos facultar esse acesso… podem iterar sobre os dados que têm»). Por isso o «agora» é um simulador com dados fictícios (ADR-0032).
- O Living Lab tem um **socket.io público**, sem autenticação, em `https://api.aveiro-living-lab.it.pt` (Engine.IO 4; o só-websocket falha, o polling com upgrade funciona). O Moisés decidiu (19/11) que ler o que é público não é o acesso que o IT recusou (o IT não nos deu uma API), e que **não se pede autorização**.
- **O art. 22.º, n.º 2 das normas** pede que os elementos do projeto sejam originais ou tenham autorização expressa dos autores, e o filtro 3 do ADR-0023 pede licença aberta ou autorização. A decisão do Moisés lê-o assim: os dados ao vivo **não são um elemento do projeto**: não se copiam, não se guardam e não entram no repositório, no relatório nem no pitch; só se leem e se mostram, quando alguém clica no botão, a partir de uma fonte que o próprio IT publica sem restrições. Por isso fica fora do filtro 3, que continua a valer para tudo o que entra no projeto.
- **O que se viu (19/11, 16h26, cerca de 1 min, só leitura):** um só evento, `data`, cerca de 6 vezes por segundo, com o retrato completo do momento: 53 estações (52 RSU, com ids `p1` a `p81` e posição; 25 ativas), cada uma com a lista de **deteções** atuais (posição, velocidade, direção, `classification` e `sensor`). Num retrato: 374 ligeiros, 141 peões, 21 carrinhas, 5 ciclistas, 5 moliceiros, 3 autocarros e 3 motas; 533 por câmara e 20 por radar. Sem imagens nem dados pessoais (só nomes de ícones). Os ids não coincidem com os do dataset (RSU0030, SC00NN): ligam-se só pela posição.

## Decisão

1. **Quem liga é a nossa API (FastAPI)**, com um cliente socket.io: recebe o `data` e passa à web **1 vez por segundo** o último retrato (só as estações e deteções que interessam ao mapa). A web continua a falar só com a nossa API.
2. **Desligado por omissão:** a ligação **só abre quando se clica no botão** e fecha ao sair. Sem Internet (vê-se antes de ligar), a API diz «sem rede» e o botão fica desligado; a demo offline é igual (ADR-0014). O URL e o intervalo de 1 s ficam no `config/riasense.yaml` (secção `ao_vivo`).
3. **O botão** «Ver ao vivo (Living Lab)» fica **dentro da janela do indicador «Offline»** (ADR-0048), e não no ecrã principal. No modo, o indicador passa a «Ao vivo», com um ponto **azul a pulsar** (nem verde nem vermelho, que são estados); com `prefers-reduced-motion`, não pulsa.
4. **No mapa:** os peões e os veículos detetados agora, como pontos que se movem, com os ícones de tipo que já existem, de **todas as estações que caem na vista**. As camadas da semana gravada (② ③ ④, risco, calor, Trânsito e a barra da hora) ficam escondidas enquanto se está ao vivo. Uma janela pequena diz «N de M estações ativas» e o último dado de cada estação.
5. **«Voltar aos dados da semana»** sai do modo e volta à hora onde se estava. Se a ligação cair, sai sozinho, com o aviso «Ligação perdida».
6. **Honestidade:** uma etiqueta sempre visível no modo, «Ao vivo · dados públicos do Aveiro Living Lab (IT), não validados. A análise usa os dados da semana». **Nada se grava em disco**: os dados ficam só na memória e desaparecem ao sair. Não se tiram números do «Ao vivo» para o pitch nem para o relatório.
7. **Na apresentação:** é um **extra**, mostrado só se houver tempo e rede na sala; não entra no guião cronometrado nem no Figma.
8. **Testes** só com **retratos sintéticos** com a mesma forma do evento `data` (ids, posições e deteções inventados), sem rede no CI. **Nenhum dado real do socket entra no git** (ADR-0030, ponto 6), e as deteções não se escrevem nos registos da API.

## Consequências

- O júri pode ver o Living Lab a funcionar agora, ao lado da análise da semana, sem a demo depender da rede.
- **Risco:** o socket pode mudar ou desaparecer sem aviso (não é uma API oficial); por isso fica atrás de um botão e cai para o modo da semana.
- **Fora de âmbito:** ligar as deteções aos ids do dataset, aplicar a regra «sem comunicação» do ADR-0030 aos dados ao vivo, guardar histórico e o estacionamento ao vivo (roadmap).
- **Prazo:** implementa-se pelo agente Programador (#164). Pronto para revisão até às 10h de 20/11, senão fica no roadmap; o código fecha às 13h30.
