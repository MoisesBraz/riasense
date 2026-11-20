# RiaSense

A RiaSense acrescenta inteligência aos sensores do Aveiro Tech City Living Lab: deteta as falhas, completa o que falta, prevê o que vai acontecer daqui a 3 h e 6 h e mostra onde os peões estão menos protegidos.

## Sensores e rede

**RSU**:
Unidade junto à estrada (RoadSideUnit) que liga e agrega vários sensores de uma zona. A falha de uma RSU pode deixar sem comunicação vários dos sensores ligados a ela, mas não necessariamente todos. Na falha da RSU0030 de 04/11, ficaram sem comunicação as 4 passadeiras, o estacionamento e 4 segmentos (2 deles só durante cerca de um dia), e a maior parte dos segmentos continuou a enviar eventos.
_Avoid_: Poste, gateway

**Sensor**:
Uma entidade do Living Lab que produz eventos: um segmento viário, uma passadeira inteligente, uma zona turística ou um grupo de lugares de estacionamento de uma RSU.
_Avoid_: Dispositivo (quando se fala de dados), câmara

**Vertical**:
Uma das quatro famílias de dados do desafio: mobilidade, segurança rodoviária, turismo e utilização do espaço, e estacionamento.
_Avoid_: Domínio, camada (camada é outra coisa)

## Vigiar

**Silêncio**:
O intervalo entre dois eventos seguidos de um sensor. Um silêncio longo é sossego normal ou falha inesperada, conforme as horas que cobre.

**Falha inesperada**:
Uma falha confirmada: um período sem eventos num sensor que não se explica pelo sossego normal. Entra nas estatísticas da ①, calculadas em lote sobre a semana. Há duas regras:
- pelo menos 2 h sem eventos, em horas que costumam ter atividade;
- um silêncio longo (24 h ou mais) em que, somadas todas as horas, se esperavam pelo menos 20 eventos, mesmo num sensor que nunca tem muita atividade numa só hora.

O que «costuma ter» um sensor mede-se fora dos seus silêncios longos.
_Avoid_: Buraco, gap, sensor morto

**Ao vivo**:
O modo que mostra o que os sensores do Living Lab detetam agora, lido do socket.io público quando se clica no botão (ADR-0049). Não é a reprodução da semana acelerada, a que o ADR-0029 chama «modo ao vivo», nem o painel «agora» com dados fictícios (ADR-0032).
_Avoid_: tempo real (para a reprodução da semana)

**Pergunta por voz**:
Uma pergunta dita ao botão 🎙 do mapa (ou escrita na caixa de texto, sem voz), como «Como está a Av. 25 de Abril?» (ADR-0054). A resposta é o mapa: voa até à rua, realça-a e abre o pop-up do troço, o mesmo do clique; uma frase escrita e dita em voz alta dá o trânsito medido à hora do cursor, o sensor (com a ressalva do radar) e a comparação com a referência. A rua reconhece-se pelas palavras do nome, sem modelo de linguagem, entre as de `voz.ruas`. Desligada nos modos «agora» e «Ao vivo».
_Avoid_: assistente, chat, chatbot

**Sem comunicação**:
Um alerta rápido do painel «agora», ao vivo, que aparece em minutos para o técnico ir verificar o sensor. Um sensor, ou uma RSU com as suas passadeiras juntas, está sem comunicação quando o silêncio tem probabilidade inferior a `agora.prob_max` (10⁻⁶) de ser acaso. A probabilidade vem do modelo de Poisson, com a base da ① de cada hora que o silêncio atravessa (ADR-0030 e ADR-0032). Não é uma falha inesperada: só passa a falha se durar pelo menos 2 h e cumprir as regras dela. O painel nunca chama «falha» a um sensor sem comunicação.
_Avoid_: Calado (o termo antigo, até 20/11), Falha (para um sensor sem comunicação), offline

**Sossego normal**:
Um período sem eventos em horas que costumam ser calmas (sobretudo à noite). Não é uma falha.

**Falha de rede**:
Falha inesperada que começa ao mesmo tempo em vários sensores da mesma RSU.
_Avoid_: Apagão

**Falha de dispositivo**:
Falha inesperada que afeta um só sensor enquanto os vizinhos continuam a funcionar.

**Ativo**:
O estado de um sensor que está a medir, incluindo o sossego normal. No mapa do Vigiar e do Completar é um círculo cheio verde (ADR-0033).
_Avoid_: Ligado, OK

**Atenção**:
O estado de um sensor a acompanhar antes de ser falha: está na lista «verificar o sensor», ou está sem comunicação no painel «agora» (ADR-0030). No mapa é um círculo vazio âmbar (ADR-0033).
_Avoid_: Aviso, alerta, avariado

## Completar

**Sensor virtual**:
A estimativa da RiaSense para o valor de um sensor que falhou ou que nunca existiu, sempre acompanhada de um intervalo e marcada como estimada.
_Avoid_: Sensor sintético, dado inventado, interpolação

**Vizinho**:
Um sensor do mesmo tipo, próximo, cuja variação atual serve para estimar um sensor virtual.

**Estimado**:
A marca de um valor que vem de um sensor virtual, e não de uma medição. No mapa aparece a tracejado; no NGSI-LD vai com `estimated: true`.
_Avoid_: Simulado, previsto (previsto é da ③)

**Redução potencial estimada**:
Quanto baixaria o erro do sensor virtual de um local se tivesse um 2.º sensor perto: o erro do local menos a mediana do tipo (ADR-0015). É uma hipótese, que só se valida instalando o sensor.
_Avoid_: Redução de erro (sem qualificativo)

**Verificar o sensor**:
A lista dos sensores cuja média diária caiu muito mais do que a dos outros do mesmo tipo, sem se calarem. Saem do ranking do próximo sensor, porque pode ser uma avaria ou uma mudança real, como obras.
_Avoid_: Avariado

## Prever e proteger

**Referência**:
A previsão ingénua «mesma hora, dia anterior», que qualquer modelo tem de superar para entrar no produto.
_Avoid_: Baseline (em texto para o júri)

**Persistência**:
A previsão «o mesmo valor da hora anterior». Não é a referência da regra (ADR-0010), mas serve para dizer de onde vem a vitória da ③.

**Janela de teste**:
Um dia inteiro (das 00h às 24h) em que se medem os modelos da ② e da ③. Treina-se com todas as horas dos dados anteriores a esse dia. A validação usa 4 janelas: 6, 7, 8 e 9/11 (ADR-0031). Os números publicados continuam a vir do período de teste oficial de 48 h.

**Intervalo de previsão** (③):
O intervalo `p10`–`p90` de 80 % à volta de uma previsão da ③ (ADR-0035). Vem dos quantis dos resíduos de um modelo de calibração num dia antes do teste. A **cobertura** é a fração dos valores reais do teste que cai dentro dele, e reporta-se sempre; fora de 70 % a 90 %, o intervalo é «por calibrar».
_Avoid_: Margem de erro, barra de erro, garantia

**Abrandamento**:
A descida da velocidade média dos veículos junto a uma passadeira quando o número de travessias sobe, descontados o volume de tráfego e a hora.

**Passadeira assinalada**:
Passadeira onde não há abrandamento estatisticamente claro, apesar de muitas travessias. As passadeiras com semáforo não se assinalam (ADR-0024).

**Com semáforo** (estado da ④):
Passadeira com semáforo no OpenStreetMap (`crossing=traffic_signals` ou `crossing:signals=yes`, ADR-0019). Na zona são 5: 4 com botão para os peões (`button_operated=yes`) e a SC0011 sem (`button_operated=no`). Não se distinguem tipos de semáforo. Quem para o carro é a luz, e não o número de peões: com semáforo, o abrandamento não se mede da mesma forma. A ④ calcula o efeito, mas não assinala a passadeira, e no risco potencial o comportamento «não se aplica» (ADR-0024). É uma fonte aberta, a confirmar com a Câmara Municipal de Aveiro.

**Risco potencial**:
A soma pesada da exposição pedonal, do comportamento dos condutores e da previsão num ponto com sensor, por hora (ADR-0013). A confiança do dado mostra-se à parte. Não é uma medida de acidentes.
_Avoid_: Risco (sem qualificativo), perigosidade, sinistralidade

**Confiança do dado**:
De onde vem o valor de um ponto numa hora: medido, estimado (sensor virtual) ou sem dados. Vem da ① e não entra na soma do risco potencial (ADR-0013).
_Avoid_: Fiabilidade como peso

**Quase-conflito**:
Um veículo rápido a passar muito perto, no tempo, de um peão a atravessar. Com estes dados **não se consegue medir** (ADR-0006); o termo só aparece para explicar porque não se usa.
_Avoid_: Quase-acidente
