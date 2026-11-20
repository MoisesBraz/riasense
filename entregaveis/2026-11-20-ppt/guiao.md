# Apresentação (PPT) de 20/11 · guião slide a slide

**Para:** Eduardo Câncio (estilo sobre o template oficial) · **De:** Moisés · **Versão 3** (no repositório, #95) · 18/11/2026

A versão 1 era `05-entregaveis/2026-11-20-submissao/guiao-ppt.md`, no Nextcloud. Pelo ADR-0026, a versão que vale é a do repositório, e o texto muda por MR.

O template é `05-entregaveis/templates/Template - ATC Hackathon 2026.pptx`, no Nextcloud. O estilo é do Eduardo: cores `#121417` e `#D9DCE1`, o azul `#2B5BFF` só como acento, e a fonte Lato. **O conteúdo e os números são os deste ficheiro.** As imagens são as capturas **reais** da aplicação, em `04-design/exportacoes/2026-11-17-web-real/` no Nextcloud, e não os ecrãs do Figma.

Regras dos slides:
- O título é a conclusão.
- Cada slide tem no máximo 3 linhas de texto.
- A demo é o centro.

**Os números:** cada número está na tabela do guião do sumário, [`../2026-11-20-sumario/guiao.md`](../2026-11-20-sumario/guiao.md), com a fonte no `main`. Quando um número mudar, muda-se lá primeiro. A tabela do fim deste guião tem só os números que aparecem apenas aqui.

Frase do projeto, para a capa e o fecho: **«RiaSense transforma o Living Lab num sistema que se vigia, se completa, prevê e protege.»**

## Detalhe das camadas e de apoio (a demo e as perguntas)

O pitch de 5 minutos tem 8 slides, na ordem dos critérios da final (secção «Pitch de 5 minutos (final)», mais abaixo). Esta tabela é o **detalhe** dos 10 slides do guião anterior (a numeração é a de então): os slides 2 a 7 dizem o que se mostra e se diz na demo e nos slides B2 a B4, e o slide 11 é o das fontes e licenças.

| # | Título (a conclusão) | Conteúdo | Imagem | Tempo (ver B1 a B8) |
| --- | --- | --- | --- | --- |
| 1 | RiaSense | A frase do projeto. «Equipa Helpmind · Desafio #1 Smart Aveiro: From Data to Action» | — | — |
| 2 | A 4 de novembro, às 20h06, quatro passadeiras deixaram de contar peões | Av. 25 de Abril, quase 6 dias (cerca de 135 h) sem dados. A RiaSense detetou-o sozinha, percebeu que era uma falha de rede e preencheu os dados em falta. Diz-se «a RiaSense teria dado o alarme em cerca de 13 minutos»: é o que os dados permitem detetar, porque a ① de hoje corre em lote (#20). Diz-se também «hoje não há alerta de ausência de dados» (mentores CMA/IT). **Não** se diz que o IT não sabia desta falha | `desktop-escuro-01-vigiar-1440.png` (recorte) | — |
| 3 | ① Vigiar: a falha foi da rede, não do sensor | 38 falhas inesperadas: 11 de rede, em 2 grupos da RSU0030, e 27 de dispositivo. A 4/11, a RSU0030 deixou sem comunicação 4 passadeiras, o estacionamento e 4 segmentos; a 5/11, mais 2 segmentos | `desktop-escuro-01-vigiar-1440.png` | — |
| 4 | ② Completar: cerca de 40 % menos erro do que a referência, com os mesmos sensores | Sensor virtual com intervalo de 80 %. Erro nas passadeiras: 0,36 contra 0,62 da referência «mesma hora, dia anterior», ou seja cerca de 40 % menos. Preenche as 135 h: ficaram por contar cerca de 14 mil travessias, que se estimam com incerteza e se marcam como estimadas (#20) | `desktop-escuro-02-completar-1440.png` | — |
| 5 | ③ Prever: a 3 h ganha à referência e à persistência, e a 1 h dizemos que, nas passadeiras e nas zonas, copiar a última hora basta | A 3 h ganha nos 4 tipos de sensor (passadeiras 0,56 contra 0,62 da referência e 0,72 da persistência). A 1 h, nas passadeiras a persistência empata (0,418 contra 0,416) e nas zonas ganha (0,344 contra 0,368), por isso a 1 h só se avalia. A regra foi escrita antes do modelo. Não há antecipação entre verticais | `desktop-escuro-03-prever-com-dados-1440.png` | — |
| 6 | ④ Proteger: abrandam em 19 de 24 passadeiras, e dizemos onde a medida não se aplica | Abrandam 19 de 24 (17 das 19 sem semáforo). Nas 5 com semáforo (OSM, por validar), quem trava é a luz e a medida não se aplica, por isso nenhuma fica assinalada. Na Av. 25 de Abril há 29 h de dados, antes da falha: 23 a 24 % acima do limite nos intervalos movimentados e 33 a 37 % nos calmos. É associação e não causalidade, com teste placebo | `desktop-escuro-04-proteger-1440.png` | — |
| 7 | Mapa de risco potencial: onde os peões estão menos protegidos | Exposição, comportamento e previsão a 3 h (0,4 / 0,4 / 0,2), com as componentes sempre à vista. Só pontos com sensor; os estimados a tracejado. **Não mede acidentes**. A captura é nova, depois do !78: nas passadeiras com semáforo, o comportamento aparece «não se aplica». O top mostra-se com os dias de dados de cada passadeira | `desktop-claro-05-mapa-risco-potencial-1440.png` | — |
| 8 | Fácil de instalar, de manter e de replicar | Complementa o ATCLL Vision: entrega alertas e sensores virtuais no formato que o IT já usa (NGSI-LD, com os mesmos identificadores dos sensores do Living Lab; falta validar a ligação com o IT). Instala-se depressa e com poucos recursos: sem sensores novos e sem base de dados. O IT e a Câmara mantêm-na por configuração. Para o IT: falhas, sensores virtuais e onde pôr o próximo sensor. Para a Câmara: o mapa | diagrama das 4 camadas (Figura 1 do relatório) | — |
| 9 | Noutra cidade, só muda a configuração | Zona, sensores, limiares, pesos e fontes em `config/riasense.yaml`. Uma cidade com poucos sensores fica com cobertura estimada | tabela de chaves do config (README, «Outra cidade») | — |
| 10 | Roadmap e fecho | Aplicação para transportadores (a ideia da RiaDock, apoiada nestes dados) · Waze for Cities · BEAV para validar o mapa · mais semanas de dados. A frase do projeto | — | — |
| 11 | Cada fonte, com a sua licença e o seu uso | Living Lab (ATCLL, IT), cedido ao hackathon · OpenStreetMap (ODbL, © contribuidores do OpenStreetMap), o mapa e os atributos das passadeiras · ANEPC 2016–2020, só teste de coerência temporal · Open-Meteo (CC BY 4.0), testada e não usada · DGT (CC BY 4.0), alturas dos edifícios (LiDAR) e ortofoto de 2025, só na zona da demo. «Dados recolhidos de fontes abertas, usados só para contexto e coerência. Carecem de validação junto das entidades responsáveis» | — | — |

O slide 11 é a declaração de fontes e licenças que os mentores pediram (#19, perguntas 7 e 8; #117). Fica no fim do ficheiro entregue e **não conta para os 5 minutos**. É a mesma declaração do parágrafo «Fontes e licenças» do sumário, com o aviso no fim a cobrir a ANEPC e o OpenStreetMap. A ANEPC passou a «só teste de coerência temporal» com o MR da #54 (ADR-0036); o resultado está no slide de reserva R4.

## Os dois pitches e os critérios (normas de participação, art. 15.º a 18.º)

| | Pitch de 3 min (seleção dos finalistas) | Pitch de 5 min (final) |
| --- | --- | --- |
| Quando | 20/11, entre as 16h30 e as 17h30 (3 min + 1 min de perguntas) | 20/11, entre as 18h00 e as 19h30 (5 min + 3 min de perguntas) |
| Quem passa | Até 6 equipas por desafio | Vence uma equipa por desafio |
| Critérios | 4 de 25 %: enquadramento e resposta ao desafio; facilidade de adoção pelos desafiadores; viabilidade e sustentabilidade; apresentação. **Sem** replicação | 6 critérios: enquadramento e resposta ao desafio, adoção, viabilidade e replicação noutros territórios (20 % cada), apresentação (10 %) e documentação dos entregáveis (10 %) |
| Por isso | **Mostra o impacto** (o antes e o depois) e a demo, e fecha com a adoção | Acrescenta a replicação (noutra cidade só muda a configuração) |

Os slides de fontes e licenças e as reservas servem os dois pitches. A versão de 5 minutos é a tabela «Pitch de 5 minutos (final)», e a de 3 minutos é esta (os textos estão também no Figma, página «Apresentação 20/11», coluna A):

## Pitch de 3 minutos (seleção): 4 slides

O pitch segue **a ordem dos 4 critérios da avaliação intermédia** (art. 16.º, 25 % cada): **1. Enquadramento e resposta ao desafio** (A1 o impacto, A2 a demo, A3 a simulação ao vivo); **2. Facilidade de adoção pelos desafiadores** e **3. Viabilidade e gestão futura (sustentabilidade)**, condensados num só slide (A4); **4. Apresentação da solução**, que se cumpre com o fio e o ritmo (uma pergunta e uma ação por ecrã, a demo no centro e a frase do projeto no fecho), e não com um slide à parte.

| # | Título (a conclusão) | Conteúdo | Tempo | Critério |
| --- | --- | --- | --- | --- |
| A1 | Quase 6 dias sem dados | **Hoje:** sem alerta para a ausência de dados (mentores CMA/IT); 4 passadeiras da Av. 25 de Abril, quase 6 dias sem dados (4/11, 20h06); cerca de 14 mil travessias por contar. **Com a RiaSense:** ao vivo, o alerta chegaria em cerca de 13 minutos, a dizer se foi a rede ou o sensor (cálculo sobre os dados, #20: 66 travessias por hora às 20h, e um silêncio de 12,6 min tem probabilidade inferior a 10⁻⁶ de ser acaso; a ① de hoje corre em lote, e na demo o painel «agora» usa uma simulação); as 14 mil travessias estimadas, com incerteza, marcadas «estimado»; um mapa de onde intervir primeiro (risco potencial; não mede acidentes) | 0:00 a 0:25 | 1. Enquadramento e resposta (25 %) |
| A2 | Do alerta ao mapa: a RSU0030, a 4 de novembro | **Demo ao vivo** (plano B: o vídeo de reserva): ① Vigiar, a falha de rede (15 s); ② Completar, o estimado a tracejado, 0,36 contra 0,62 (20 s); ④ Proteger e mapa de risco potencial, 19 de 24 abrandam e onde a medida não se aplica (25 s), com 10 s de folga para as passagens. O ③ Prever fica para a versão de 5 min | 0:25 a 1:35 | 1. Enquadramento e resposta (25 %), com a demo |
| A3 | O alerta, ao vivo (simulação) | **A plataforma a simular o alerta:** o modo «agora» corre o relógio a ×60 e, ao carregar em «Simular falha» e depois em «Cortar a RSU0030», o aviso «sem comunicação» surge em poucos segundos, que a ×60 são 8 a 13 minutos simulados, conforme a hora (o simulador arranca às 19h50; no ensaio, 8,2 s às 19h50 e 13,2 s às 20h: são notas para quem apresenta, e não se dizem em palco, ADR-0032 ponto 5). Com a etiqueta «Simulação com dados fictícios…» sempre visível: é como funcionaria ligada ao Living Lab, porque o IT não pôde dar acesso em tempo real (ADR-0030, ADR-0032) | 1:35 a 2:15 | 1. Enquadramento e resposta (25 %), com a demo |
| A4 | Fácil de adotar, fácil de manter | **Para o IT:** as falhas com a causa e os sensores virtuais, no ATCLL Vision (NGSI-LD, a validar com o IT), e onde pôr o próximo sensor. **Para a Câmara:** o mapa de risco potencial, para decidir onde intervir primeiro. **Sustentável:** poucos recursos, sem sensores novos nem base de dados, e mantém-se por configuração; o código e a documentação ficam com a CMA e o IT (regras do hackathon: a propriedade intelectual fica com os desafiadores, com acesso livre e partilha). Não se fala de Parquet, LightGBM nem Docker. Fecha com a frase do projeto | 2:15 a 3:00 | 2. Adoção pelos desafiadores (25 %) e 3. viabilidade e sustentabilidade (25 %), condensados |

**Perguntas (1 min):** as reservas e o slide de fontes e licenças; se perguntarem o que pedimos, são 3 coisas: validar a ligação NGSI-LD ao ATCLL Vision, ligar a dados ao vivo (hoje, uma simulação) e acidentes oficiais (BEAV) para validar o mapa; as respostas sobre os semáforos e o intervalo de previsão estão na wiki, página «Pitch e perguntas do júri». O guião de falas está na wiki, página «Pitch e perguntas do júri».

## Pitch de 5 minutos (final): 8 slides, na ordem dos 6 critérios (art. 18.º)

A final avalia 6 critérios, e o pitch segue **esta ordem**: **1. enquadramento e resposta ao desafio** (20 %); **2. facilidade de adoção pelos desafiadores** (20 %); **3. viabilidade e gestão futura, a sustentabilidade** (20 %); **4. possibilidade de replicação noutros territórios** (20 %); **5. apresentação da solução** (10 %); **6. documentação, os entregáveis** (10 %). Os textos estão também no Figma, página «Apresentação 20/11», coluna B.

| # | Título | Conteúdo | Tempo | Critério |
| --- | --- | --- | --- | --- |
| B1 | RiaSense | A frase do projeto. «Equipa Helpmind · Desafio #1 Smart Aveiro: From Data to Action» | 0:00 a 0:10 | 5. Apresentação |
| B2 | A 4 de novembro, às 20h06, quatro passadeiras deixaram de contar peões | O slide 2 do detalhe: quase 6 dias (cerca de 135 h) sem dados; hoje não há alerta (mentores CMA/IT); ao vivo, a RiaSense teria dado o alarme em cerca de 13 minutos (cálculo sobre os dados; a ① de hoje corre em lote); preenche o que falta | 0:10 a 0:35 | 1. Enquadramento |
| B3 | Quatro camadas, cada uma sobre a anterior | 4 números: 38 falhas (11 de rede); 0,36 contra 0,62 da referência; ③ a 3 h, 0,56 contra 0,62 e 0,72; 19 de 24 abrandam (nas 5 com semáforo, a medida não se aplica) | 0:35 a 1:05 | 1. Enquadramento |
| B4 | Demo: da falha da RSU0030 ao mapa de risco potencial | **Demo ao vivo** (plano B: o vídeo de reserva): Vigiar (20 s), Completar (20 s), Prever a 3 h (10 s), Proteger e mapa de risco potencial (30 s) e o alerta ao vivo, a simulação do modo «agora» (30 s), com 10 s de folga para as passagens. Detalhe nos slides 3 a 7 acima | 1:05 a 3:05 | 1. Enquadramento |
| B5 | Fácil de adotar pelo IT e pela Câmara | **Para o IT:** as falhas com a causa e os sensores virtuais, no ATCLL Vision (NGSI-LD, a validar com o IT), e onde pôr o próximo sensor. **Para a Câmara:** o mapa de risco potencial. Sem sensores novos: trabalha sobre os dados que o Living Lab já recolhe | 3:05 a 3:35 | 2. Adoção |
| B6 | Fácil de manter | Instala-se depressa e com poucos recursos, sem base de dados; o IT mantém-na por configuração (zonas, limiares e pesos); o código e a documentação ficam com a CMA e o IT (regras do hackathon: a propriedade intelectual fica com os desafiadores, com acesso livre e partilha) | 3:35 a 4:00 | 3. Viabilidade e sustentabilidade |
| B7 | Noutra cidade, só muda a configuração | Zona, sensores, limiares, pesos e fontes em `config/riasense.yaml`; uma cidade com poucos sensores fica com cobertura estimada. Só testada em Aveiro, com uma semana de dados | 4:00 a 4:25 | 4. Replicação |
| B8 | Tudo documentado, e o que vem a seguir | Relatório, sumário executivo, README e ADR no repositório; cada número tem a sua fonte nos dados e nos ADR. Roadmap: aplicação para transportadores, Waze for Cities, BEAV para validar o mapa, mais semanas de dados. A frase do projeto | 4:25 a 5:00 | 5. Apresentação e 6. Documentação (10 % cada) |
| B9 | Fontes e licenças (apoio, fora do tempo) | O slide 11 do detalhe: Living Lab, OpenStreetMap, ANEPC 2016–2020 (só teste de coerência temporal), Open-Meteo (testada e não usada), DGT (LiDAR e ortofoto, na zona da demo), com o aviso do ADR-0017 | — | Apoio às perguntas (3 min) |

**Perguntas (3 min):** as reservas R1 a R6 e o slide B9.

## Slides de reserva (para as perguntas)

| # | Título | Conteúdo |
| --- | --- | --- |
| R1 | A previsão contra a persistência | Erro relativo mediano nas passadeiras, zonas, segmentos e estacionamento. **A 3 h:** modelo 0,56 / 0,47 / 0,30 / 0,24; persistência 0,72 / 0,72 / 0,57 / 0,29; referência 0,62 / 0,68 / 0,37 / 0,25. **A 1 h:** modelo 0,42 / 0,37 / 0,22 / 0,19; persistência 0,42 / 0,34 / 0,27 / 0,22. «A 1 h empata nas passadeiras e fica atrás nas zonas; a 3 h ganha nos 4 tipos» |
| R2 | Porque a mediana dos vizinhos (ADR-0012) | A soma dos vizinhos dá 0,49 nas passadeiras, por causa da SC0023, que cai 85 % sem perder a comunicação. A mediana dá 0,36. Foi escolhida depois de ver os números, e a escolha ficou registada |
| R3 | Onde pôr o próximo sensor (hipótese) | Passadeiras: SC0016, SC0024 e SC0014. Zonas: TZ0011. A redução é potencial e só se valida instalando o sensor. «Verificar o sensor»: SC0023 |
| R4 | A coerência do risco potencial com os atropelamentos de 2016 a 2020 (ANEPC) | «O perfil por hora do risco potencial acompanha o dos atropelamentos do distrito de Aveiro (2016–2020, 700 ocorrências; Spearman 0,75), mas a exposição de peões sozinha dá um pouco mais (0,78): o risco potencial não acompanha melhor do que a exposição.» Gráfico: as 24 horas do dia, com os atropelamentos do distrito e o risco potencial médio (`validacao_anepc.parquet`, quadro `perfil`, `ambito` distrito); pico às 17h–19h (75, 112 e 86). **A diferença (risco − exposição):** −0,02 (IC de −0,04 a −0,01), ou seja, a exposição sozinha acompanha um pouco melhor. O concelho (91) dá 0,66, com um IC largo (0,44 a 0,72), e não sustenta a frase. Portugal (10 329), só como referência: 0,78 com o risco e 0,82 com a exposição. **Ressalvas:** épocas diferentes (2016 a 05/07/2020 contra uma semana de novembro de 2026); quase tudo segue a atividade da cidade; são 24 pontos vizinhos, e o IC só mede a incerteza das contagens, e não a do risco, que vem de uma semana; a hora do ficheiro assume-se local; em novembro, o pico das 18h também tem a ver com o escuro; é um perfil por hora e não por passadeira (as coordenadas são centroides); a fonte não declara licença. **Aviso:** «Dados recolhidos de fontes abertas, usados só para contexto e coerência. Carecem de validação junto das entidades responsáveis» |
| R5 | Onde há semáforo a medida da ④ não se aplica, e há 0 passadeiras assinaladas | Abrandam 19 de 24 passadeiras (17 das 19 sem semáforo). Nas 5 com semáforo (OpenStreetMap, por validar com a Câmara), quem trava é a luz, por isso a medida não se aplica e nenhuma fica assinalada. Topo do risco potencial: SC0002, SC0019, SC0007, SC0006 e SC0015; a SC0019 tem só cerca de 29 h de dados, e o topo mostra-se sempre com os dias de dados de cada passadeira. As 3 passadeiras que antes saíam assinaladas (SC0013, SC0020 e SC0021) têm semáforo. O risco potencial não mede acidentes (ADR-0007; os semáforos são do ADR-0024) |
| R6 | O intervalo de previsão: cobertura medida, e onde não está calibrado | Intervalo de 80 % (p10 a p90) a 3 e 6 h, calibrado num dia antes do teste (ADR-0035). Cobertura a 3 h: passadeiras 73 %, segmentos 78 %, estacionamento 84 %. Zonas turísticas: 64 % a 3 h e 49 % a 6 h, por isso o intervalo das zonas está por calibrar. É um só dia de calibração, de fim de semana, e o teste tem 35 h de dias úteis |

## Números que só estão no PPT

| No slide | Valor | Fonte |
| --- | --- | --- |
| 2 · cerca de 13 minutos | As 4 passadeiras da RSU0030 juntas fazem cerca de 66 travessias/h às 20h de um dia útil; um silêncio de 12,6 min tem probabilidade inferior a 10⁻⁶ de ser acaso | ADR-0030 (o «sem comunicação» por RSU); wiki, página «Pitch e perguntas do júri» |
| 3 · o segundo grupo de rede | 05/11 às 09h56: os segmentos 10366 e 11169 | `falhas.parquet`, coluna `grupo` |
| 4 · cerca de 14 mil travessias | 14 086, nas 4 passadeiras da RSU0030, em 135 h | `sensores_virtuais.parquet`: soma de `estimativa` nas linhas `estimado` das passadeiras |
| 5 e R1 · modelo e referência | A 3 h: 0,557 / 0,475 / 0,295 / 0,235 (0,56 / 0,47 / 0,30 / 0,24; a zona é 0,47499). A 1 h: 0,418 / 0,368 / 0,218 / 0,192. Referência: 0,617 / 0,677 / 0,374 / 0,253 | `avaliacao_prever.parquet`, colunas `erro_sem_meteo` e `erro_referencia`, `horizonte_h` 3 e 1 (ADR-0027, !76) |
| 5 e R1 · persistência | A 3 h: 0,720 / 0,715 / 0,571 / 0,293 (0,72 / 0,72 / 0,57 / 0,29). A 1 h: 0,416 / 0,344 / 0,272 / 0,222 (0,42 / 0,34 / 0,27 / 0,22) | `avaliacao_prever.parquet`, coluna `erro_persistencia` (ADR-0027, !76) |
| 6 · acima do limite | 23 a 24 % nos intervalos movimentados e 33 a 37 % nos calmos (SC0019 a SC0022) | `proteger_passadeiras.parquet`, colunas `pct_acima_limite_movimentados` e `pct_acima_limite_calmos` (22,8 a 23,8 % e 33,0 a 36,9 %) |
| R2 · soma e mediana | 0,49 e 0,36 | `avaliacao_completar.parquet`, modelos `razao_soma` e `razao` (passadeiras, `deixar_um_de_fora`, todos os dias) |
| R2 · SC0023 cai 85 % | 0,854 | `proximo_sensor.parquet`, coluna `queda_diaria` |
| R3 · onde pôr o próximo sensor | SC0016, SC0024 e SC0014; TZ0011; «verificar o sensor»: SC0023 | `proximo_sensor.parquet`, colunas `tipo`, `ordem` e `motivo` |
| R6 · cobertura do intervalo | A 3 h: passadeiras 73,2 %, segmentos 77,7 %, estacionamento 83,6 %; zonas turísticas 64,4 % a 3 h e 48,7 % a 6 h | `avaliacao_prever.parquet`, coluna `cobertura_intervalo`, `horizonte_h` 3 e 6 (ADR-0035) |
| R4 · Spearman e atropelamentos | Distrito: 700 atropelamentos, Spearman 0,754 com o risco (IC 0,684 a 0,780) e 0,778 com a exposição (0,707 a 0,804); diferença −0,024 (−0,039 a −0,009). Concelho: 91, 0,664 (0,439 a 0,722). Portugal: 10 329, 0,783 com o risco e 0,817 com a exposição | `validacao_anepc.parquet`, quadro `correlacao` (ADR-0036) |

## Notas

- **Plano B da demo:** o vídeo de reserva `riasense-demo.mp4` (88 s) fica no portátil de apresentação, além do Nextcloud e de `entregaveis/`. A demo ao vivo corre sem rede: **liga-se antes o painel «agora» (`agora.ativo: true` em `config/riasense.yaml`; o `docker compose up -d` arranca com ele desligado e, sem isso, não aparece o botão «Simular falha» e o A3 falha)**, depois `docker compose up -d` e `http://localhost:5173`. O A3 (a simulação do alerta) tem o mesmo plano B: o vídeo de reserva é regravado com o modo «agora» a simular a falha (#113).
- **O que não se diz:**
  - que nas passadeiras com semáforo «os condutores não abrandam», porque quem trava é a luz (#67, ADR-0024);
  - que as passadeiras com poucos dados têm a mesma solidez que as outras: a SC0013 tem cerca de 6 dias de dados (610 intervalos), e as 4 da RSU0030 têm cerca de 29 h;
  - «risco» sozinho, ou «acidentes» como medida;
  - que o IT não sabia da falha;
  - que a RiaSense já está instalada no IT (#73) ou que o IT já vê os resultados no ATCLL Vision: falta validar a ligação NGSI-LD (#19, pergunta 6);
  - «antecipação» entre verticais;
  - «metade do erro»: são cerca de 40 % menos;
  - que os atropelamentos «validam» o risco potencial, ou que o risco acompanha melhor do que a exposição sozinha: é só um teste de coerência temporal, e a exposição dá um pouco mais (ADR-0036).
- **Ensaiar 2 vezes**, cronometrando os pitches de 3 min e de 5 min (#20).
