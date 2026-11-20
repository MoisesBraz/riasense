# Relatório de 18/11 · texto

Este é o texto que foi para o PDF entregue a 18/11, igual ao que estava no Figma nesse momento (ficheiro «RiaSense — Protótipo», página «Relatório 18/11»), em 2 páginas A4 no template oficial. A partir daqui, a versão do repositório é a que vale (ADR-0026). O guião está em [`guiao.md`](guiao.md) e a tabela de números, com a fonte de cada um, em [`numeros.md`](numeros.md).

**Equipa Helpmind**

**Desafio #1 Smart Aveiro: From Data to Action - Sumário Executivo**

## Descrição do desafio

O Desafio #1, da Câmara Municipal de Aveiro (CMA) e do Instituto de Telecomunicações (IT), propõe transformar os dados do Living Lab de Aveiro em apoio direto à decisão, cruzando mobilidade, segurança rodoviária, turismo e estacionamento. A semana de 3 a 10 de novembro soma cerca de 1,6 milhões de passagens de veículos (542 segmentos), 125 mil travessias de peões (24 passadeiras), 490 mil visitas a 11 zonas turísticas e 254 mil eventos de estacionamento.

Os dados dizem o que acontece na cidade, mas não avisam quando deixam de o fazer. Como referiu um mentor da CMA/IT, “não há alerta para a ausência de dados”. A 4 de novembro, quatro passadeiras da Avenida 25 de Abril pararam de registar travessias e ficaram quase seis dias sem dados.

Em vez de replicar o que as aplicações de navegação já mostram, a proposta procura o que só estes sensores revelam: padrões de utilização, riscos de segurança, comportamento do tráfego e falhas de monitorização. O objetivo é transformar estes sinais em decisões para o IT e a CMA.

## Estratégia

A RiaSense transforma o Living Lab num sistema que se vigia, se completa, prevê e protege, em quatro camadas incrementais (Figura 1), centradas na zona piloto da Avenida 25 de Abril / Avenida de Oita.

① Vigiar aprende o ritmo horário de cada sensor e assinala falha quando o silêncio dura, pelo menos, duas horas em períodos de atividade habitual ou um dia inteiro num sensor de pouco movimento. Se vários sensores da mesma RSU deixarem de comunicar em simultâneo, identifica-se falha de rede; se for isolado, falha de dispositivo. Assim, a noite calma não gera alarmes e o IT sabe se deve verificar a rede ou o sensor.

② Completar cria um sensor virtual, combinando o perfil habitual do sensor em falha com a variação atual na mediana dos cinco vizinhos mais próximos do mesmo tipo. Cada valor inclui intervalo de incerteza e é marcado como estimado, nunca como medido. Os vizinhos captam as dinâmicas e horas de ponta comuns; modelos mais complexos não apresentaram menor erro.

③ Prever utiliza árvores de decisão, com o histórico do sensor e dos vizinhos, para antecipar a atividade de veículos, peões, visitantes e estacionamento. O modelo só é adotado onde ganha à referência, o valor observado à mesma hora no dia anterior. O modelo tem de ganhar também à persistência (repetir a última hora). Na hora seguinte não ganha nas passadeiras (0,42 nos dois); por isso validamos também a 3 e 6 h.

④ Proteger avalia se os automóveis abrandam quando há mais peões, através de regressões com controlo numa passadeira distante. Como não há acidentes georreferenciados, medimos o comportamento dos condutores; o controlo separa o efeito dos peões do ritmo geral do trânsito. Nas passadeiras com semáforo (OpenStreetMap, a confirmar com a Câmara), quem trava é a luz, e o resultado da ④ lê-se com reserva.

*Figura 1 — Os quatro pilares sobre o Living Lab de Aveiro. A azul, o que distingue a RiaSense.* A figura está em [`docs/diagramas/`](../../docs/diagramas/).

## Ideias para a proposta de solução

A RiaSense concretiza-se em quatro módulos, com saídas em NGSI-LD prontas a carregar no ATCLL Vision (a validar com o IT) e uma aplicação web de demonstração:

① Vigiar: alertas em NGSI-LD para o IT; na semana, 38 falhas inesperadas, 11 de rede.

② Completar: sensores virtuais com erro mediano de 0,36 nas passadeiras (referência: 0,62); indica onde a rede estima pior, para escolher o próximo sensor (redução potencial estimada, hipótese).

③ Prever: ganha à referência nos quatro tipos de sensor na hora seguinte (0,42 contra 0,62 nas passadeiras), para a gestão preventiva da circulação e a priorização de intervenções.

④ Proteger e Mapa de Risco Potencial: Ferramenta de apoio à decisão autárquica que combina exposição pedonal, velocidade dos condutores e previsão de tráfego. Identifica passadeiras críticas onde o tráfego não abranda perante peões, dando à autarquia evidência objetiva para intervir com medidas de acalmia (como lombas, passadeiras sobreelevadas ou limites de 30 km/h). A confiança dos dados é apresentada separadamente e os pesos são renormalizados quando a previsão não passa a validação.

Adoção e viabilidade: o motor (Python, DuckDB, LightGBM) gera resultados pré-calculados em Parquet, sem servidor de base de dados, e pode correr offline em Docker Compose numa VM.

Replicação e limites: zonas, limiares e pesos estão em configuração (YAML), e o pipeline replica-se noutra cidade. Limites: só uma semana de dados (29 horas nas quatro passadeiras da RSU0030 antes da falha), associações e não causas, veículos classificados com cerca de 80 % de exatidão.

Riscos e plano até 20/11: ensaio da demonstração offline; ③ a 3 e 6 h a validar até dia 20; MVP a 19/11 e código congelado a 20/11, às 13 h.

Fontes e licenças: dados do Living Lab (ATCLL, IT), cedidos ao hackathon; OpenStreetMap (ODbL), mapa e atributos das passadeiras; Open-Meteo (CC BY 4.0), testada e não usada.

## Ferramentas de IA

Usámos a IA generativa para explorar os dados e verificar a viabilidade das camadas, sempre revisto pelos membros da equipa.
