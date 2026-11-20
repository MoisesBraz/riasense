# Sumário executivo de 20/11 · texto

Este é o texto que vai para o PDF, no template oficial (no máximo 2 páginas). O guião está em [`guiao.md`](guiao.md), com as fontes de cada número, o orçamento de caracteres e a lista de verificação. Os números são os do `main` com o !76 e o !78; já não há marcas «a confirmar».

**Equipa Helpmind**

**Desafio #1 Smart Aveiro: From Data to Action - Sumário Executivo**

## Descrição do desafio

O Desafio #1, da Câmara Municipal de Aveiro e do Instituto de Telecomunicações, pede que os dados do Living Lab (ATCLL) passem do registo à ação, cruzando mobilidade, segurança rodoviária, turismo e estacionamento. Trabalhamos sobre a semana real cedida (3 a 10 de novembro): 1,6 milhões de passagens de veículos em 542 segmentos de estrada, 125 mil travessias em 24 passadeiras, 490 mil visitas a 11 zonas turísticas e 254 mil eventos de estacionamento. Procurámos o que só os sensores do Living Lab revelam e que decisões do IT ou da Câmara isso pode apoiar. Hoje, um sensor que deixa de enviar dados não gera alerta (mentores CMA/IT). A zona piloto é a Av. 25 de Abril / Av. de Oita.

## Estratégia

Só entra o que cumpre três condições: usa um dado exclusivo do Living Lab, serve uma decisão do IT ou da Câmara e a Câmara não o obtém hoje de outra forma. Daí saem quatro camadas, cada uma sobre a saída da anterior. ① Vigiar (IT) compara cada sensor com o seu perfil horário e distingue as falhas de rede (várias a cair juntas na mesma RSU) das de dispositivo: são 38 falhas inesperadas, 11 delas de rede, em dois grupos da RSU0030. A 4 de novembro, às 20h06, a RSU0030 deixou sem comunicação quatro passadeiras, o estacionamento e dois segmentos durante cerca de 135 h. ② Completar (IT) estima o que um sensor em falha mediria (perfil próprio × variação dos 5 vizinhos, com intervalo de 80 %): o erro mediano é 0,36 nas passadeiras, contra 0,62 da referência «mesma hora, dia anterior». ③ Prever (Câmara) prevê a 3 h e só entra se ganhar à referência e à persistência: ganhou nos quatro tipos de sensor, por pouco nas passadeiras e no estacionamento; a 1 h, copiar a última hora basta nas passadeiras e nas zonas. ④ Proteger (Câmara) regride a velocidade sobre as travessias, com teste placebo: abrandam 19 de 24 passadeiras, 17 das 19 sem semáforo. Onde há semáforo (5 passadeiras), quem trava é a luz e a medida não se aplica; as quatro passadeiras da RSU0030 só têm cerca de 29 h de dados.

## Ideias para a proposta de solução

Mapa de risco potencial. É o ecrã final da ④: soma ponderada e transparente da exposição de peões (0,4, com os estimados pela ②), do comportamento dos condutores (0,4, onde não há semáforo) e da previsão (0,2), com as componentes sempre à vista. É «potencial» e só mostra pontos com sensor. O perfil por hora do risco potencial acompanha o dos atropelamentos do distrito de Aveiro (2016–2020, 700 ocorrências; Spearman 0,75), mas a exposição de peões sozinha dá um pouco mais (0,78): o risco potencial não acompanha melhor do que a exposição. Adoção. A RiaSense exporta os resultados em NGSI-LD, com os mesmos identificadores dos sensores do Living Lab, prontos a carregar no ATCLL Vision; falta validar a ligação com o IT. Para o IT: falhas com a causa, sensores virtuais e onde pôr o próximo sensor. Para a Câmara: o mapa de risco potencial e, nas passadeiras sem semáforo, se os carros abrandam com mais peões. Está entregue: pipeline, API e aplicação com mapa offline, sem base de dados, pronta a instalar numa máquina virtual do IT com docker compose. Replicação. Sensores, zona, limiares, pesos e fontes estão em configuração; noutra cidade, a ② dá cobertura estimada onde há poucos sensores. Limites. Há só uma semana de dados; a ④ mostra associações, não causalidade; faltam acidentes oficiais (BEAV). Roadmap: uma aplicação para transportadores, em que a Câmara influencia percurso, horário e estacionamento; alertas em tempo real com o Waze for Cities; validação do mapa com o BEAV; mais semanas de dados. Fontes e licenças. Living Lab (ATCLL, IT): a semana cedida ao hackathon. OpenStreetMap (ODbL, © contribuidores do OpenStreetMap): o mapa e os atributos das passadeiras. ANEPC, arquivo público de 2016 a 2020: só teste de coerência temporal. Open-Meteo (CC BY 4.0): testada e não usada. DGT (CC BY 4.0): alturas dos edifícios (LiDAR) e ortofoto de 2025, só na zona da demo. Dados recolhidos de fontes abertas, usados só para contexto e coerência. Carecem de validação junto das entidades responsáveis.

## Ferramentas de IA

Usámos a IA generativa para explorar os dados e verificar a viabilidade das camadas, sempre revisto pelos membros da equipa.

## Figuras e legendas

Figura 1 — As quatro camadas: os dados do Living Lab alimentam ① Vigiar, ② Completar, ③ Prever e ④ Proteger, que terminam no mapa de risco potencial e em saídas NGSI-LD para o ATCLL Vision.

Figura 2 — A aplicação RiaSense: mapa de risco potencial na Av. 25 de Abril, com os estimados a tracejado e as ruas sem sensor a cinzento.
