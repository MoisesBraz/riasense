# RiaSense — a ideia

Aveiro Tech City Hackathon 2026 · Desafio #1 «Smart Aveiro: From Data to Action» (Câmara Municipal de Aveiro e Instituto de Telecomunicações)

17 de novembro de 2026 · Substitui a RiaDock (cargas e descargas), arquivada em [`docs/arquivo/riadock/`](arquivo/riadock/)

> **RiaSense transforma o Living Lab num sistema que se vigia, se completa, prevê e protege.**

## 1. Porque mudámos

A RiaDock assentava em dados que não existem: o regime de cargas e descargas não está em formato digital, os lugares de estacionamento não dizem se são de cargas e descargas, as carrinhas contam como ligeiros e os camiões são só 2% do tráfego. Além disso, os picos de pesados (08h–11h) e de peões (14h–16h) quase não coincidem.

A RiaSense parte do que os sensores medem. Passa no **teste Waze**: só entra o que cumpre as três condições seguintes.

1. Usa um dado que **só o Living Lab tem**: passadeiras, classificação de veículos, sensores por lugar e permanência de peões.
2. Serve uma **decisão do IT ou da Câmara**, não a navegação de uma pessoa.
3. A Câmara **não consegue obter hoje** essa informação de outra forma.

## 2. As quatro camadas

São quatro passos do mesmo pipeline, e cada um usa a saída do anterior.

| Camada | Pergunta | Para quem | Técnica | Evidência (verificada a 17/11, 1 semana de dados) |
|---|---|---|---|---|
| **① Vigiar** | O sensor falhou ou aconteceu alguma coisa? A falha é da rede ou do dispositivo? | IT | Falhas inesperadas face ao perfil horário e agrupamento por hora de início e RSU (falha simultânea = rede) | 38 falhas inesperadas: 11 de rede, em 2 incidentes da RSU0030, e 27 de dispositivo (ADR-0025). **RSU0030, 04/11 entre as 20h06 e as 20h16:** as quatro passadeiras (SC0019–0022), o estacionamento e quatro segmentos ficam sem dados; as passadeiras e o estacionamento durante cerca de 135 h na janela comum, e dois dos segmentos (10962 e 10368) só durante cerca de um dia (22 h e 27 h). A RSU0030 não ficou toda sem comunicação: entre 20 e 26 dos seus 29 segmentos continuaram a enviar eventos |
| **② Completar** | Quanto vale o sensor que não temos? Onde pôr o próximo? | IT | Sensores virtuais: nas passadeiras e nas zonas, perfil próprio × variação atual dos vizinhos (modelo de razão); nos segmentos, uma ridge com os mesmos 5 vizinhos, a hora do dia e o fim de semana (ADR-0046); LightGBM como comparação; aprendizagem ativa para escolher o próximo sensor | Erro relativo mediano ao deixar um sensor de fora: **0,36 nas passadeiras, 0,28 nas zonas e 0,22 nos segmentos (ridge)**, contra 0,62, 0,68 e 0,43 da referência. Treinado só com 29 h: 0,36 nas passadeiras, contra 0,54 da referência (0,52 ao fim de semana). No modelo de razão, os 5 vizinhos juntam-se pela mediana (ADR-0012) |
| **③ Prever** | O que vai acontecer daqui a 3 h? | Câmara | Previsão a 3 h e 6 h (LightGBM + vizinhos; a meteorologia foi testada e não melhora); a 1 h só se avalia; correlação com atraso entre verticais | A 3 h, ganha à referência «mesma hora, dia anterior» e à persistência «o valor de há 3 h» nos 4 tipos. Erro relativo mediano nas últimas 48 h: passadeiras 0,56 contra 0,62 (referência) e 0,72 (persistência), zonas 0,47 contra 0,68 e 0,72, segmentos 0,30 contra 0,37 e 0,57, estacionamento 0,24 contra 0,25 e 0,29. **Ressalva:** a margem sobre a referência é pequena nas passadeiras (−10 %) e no estacionamento (−7 %). A 1 h, nas passadeiras e nas zonas, repetir o último valor é tão bom como o modelo (ADR-0027). O grafo entre verticais não mostrou antecipação com uma semana de dados |
| **④ Proteger** | Os carros abrandam quando há peões? Onde não abrandam? | Câmara | Regressão da velocidade sobre as travessias por intervalo de 15 min, controlando o volume de tráfego, a hora e o fim de semana; teste placebo | Abrandam em 19 de 24 passadeiras, e o placebo dá efeito nulo em 21 de 24. **Assinaladas:** nenhuma. As três sem abrandamento claro, apesar de muitas travessias (a SC0013, a SC0020 e a SC0021), têm semáforo (OpenStreetMap, por validar com a Câmara), tal como a SC0011 e a SC0012: quem trava é a luz, por isso não se assinalam (ADR-0024). A SC0011 abranda, mas no limite (IC superior −0,004 km/h). Na Av. 25 de Abril, 23–24% dos veículos passam acima do limite nos intervalos com mais peões e 33–37% nos calmos, em 29 h de dados |

**Mapa de risco potencial.** É o ecrã final da ④, não uma camada à parte. Junta a exposição (peões, incluindo os estimados pela ②), o comportamento (a ④) e a previsão (a ③), com pesos 0,4 / 0,4 / 0,2. Nas horas sem previsão, os pesos renormalizam-se para 0,5 / 0,5. A fiabilidade do dado (a ①) **não entra na soma**: mostra-se à parte, como confiança (ADR-0013). Só mostra pontos com sensor. Os pontos preenchidos aparecem tracejados com a etiqueta «estimado», e as ruas sem sensor ficam a cinzento com «sem cobertura». A legenda mostra sempre as componentes. Chama-se «risco **potencial**» porque não há acidentes georreferenciados para o validar.

**O que não se faz, e porquê:**
- **Estacionamento:** não se completa, porque não se correlaciona com nenhum sensor vizinho (0,16 depois de retirar o ciclo diário). Entra na ① e na ③.
- **Quase-conflitos individuais (veículo × peão):** os relógios dos sensores não ligam um carro a uma travessia, porque as coincidências ficam ao nível do acaso.

## 3. A demo: um sítio e uma história

**Zona: Av. 25 de Abril / Av. de Oita (RSU0030).** O mapa tem 4 separadores e segue sempre o mesmo fio:

1. **Vigiar:** a 4/11, às 20h06, quatro passadeiras deixam de contar. O RiaSense deteta a falha e mostra que foi a rede, não o sensor.
2. **Completar:** preenche as cerca de 135 h (quase 6 dias) de travessias, com intervalo de confiança.
3. **Prever:** mostra o que vai acontecer daqui a 3 h.
4. **Proteger:** aqui, 1 em cada 4 veículos passa acima do limite (1 dia de dados, 29 h). Se abrandam com peões fica por confirmar: só há 1 dia de dados antes da falha, e das cinco sem abrandamento claro, três (SC0013, SC0020 e SC0021) têm semáforo (OpenStreetMap, por validar com a Câmara) e duas (SC0015 e SC0022) têm poucas travessias para ficarem assinaladas.

**Gancho do pitch:** «A 4 de novembro, às 20h06, quatro passadeiras da Av. 25 de Abril deixaram de contar peões. Os dados que recebemos têm um buraco de quase 6 dias. O RiaSense detetou-o sozinho, percebeu que era uma falha de rede e preencheu-o.» Não afirmamos que o IT não deu pela falha: não sabemos o que a monitorização interna deles mostra.

**Alternativa**, se a zona falhar: Universidade/Santiago (SC0001–0004) ou RSU0038 (SC0005–0006), as que têm menor erro na ②.

## 4. Como responde aos critérios

| Critério | Final | Resposta |
|---|---|---|
| Enquadramento | 20% | As 4 verticais cruzadas; ML validado em dados reais; «segura» e «acessível», palavras da ficha |
| Adoção | 20% | **Um uso para cada desafiador:** ① e ② para o IT, ③ e ④ para a Câmara. Funciona como módulo do ATCLL Vision, com saídas em NGSI-LD (sensores virtuais com `estimated: true`, alertas no painel de notificações), sem ser mais uma app |
| Viabilidade | 20% | Resultados pré-calculados, uma só instalação com `docker compose`, sem PostGIS; poupa hardware e diz onde investir |
| Replicação | 20% | Uma cidade com poucos sensores fica com cobertura estimada; zonas, sensores e limiares em `config/` |
| Apresentação e documentação | 20% | Um sítio, uma história, quatro verbos |

## 5. Dados

| Fonte | Uso | Estado |
|---|---|---|
| Living Lab (IT): roadsegments, smartcrosswalk, smartparking, touriststats, reference-entities, de 03 a 10/11/2026 | Todas as camadas | Em uso. **Todas as velocidades estão em m/s**, incluindo as das câmaras, ao contrário do que diz `perfil-dos-dados.md` |
| Open-Meteo (CC BY 4.0), chuva e temperatura horárias | Testada nas camadas ①, ③ e ④ | Testada nas camadas ①, ③ e ④: não melhora o resultado e não entra. A série fica em `data/processed/meteo.parquet`. A semana teve 3 dias secos e 5 de chuva; a 9/11 caíram 34 mm |
| Eventos do Waze no Living Lab (o PDF do IT, p. 5, diz que a plataforma é «enriquecida» com eles) | ① > ③ > mapa (só contexto) | **Não há eventos do Waze da semana** (mentor do IT, 17/11, pergunta 2): só existem os CSV já cedidos. Ficam no roadmap, com o Waze for Cities. São reportes de condutores, não acidentes oficiais |
| BEAV (PSP/GNR) | Validação do mapa de risco | A pedir no checkpoint; esperamos um «não» |
| ANEPC | — | Fora: a API do dados.gov.pt está morta desde 2021 e não há histórico |

## 6. Equipa e stack

| Pessoa | ML | Engenharia |
|---|---|---|
| Moisés | ① Vigiar | Pipeline, API, docker |
| João | ② Completar + ③ Prever | Avaliação dos modelos |
| Elicarlos | ④ Proteger | Web (mapa com 4 separadores) |
| Eduardo | — | Design, slides, vídeo de reserva |

**Stack:** Python, DuckDB/Polars, scikit-learn/LightGBM + SHAP, resultados em Parquet, FastAPI (Rust só opcional na API), React + MapLibre. Ficam de fora o PostGIS e o pgRouting.

## 7. Roadmap (slide)

- App para transportadores de mercadorias, em que a Câmara influencia percurso, horário e estacionamento. É a ideia RiaDock, agora apoiada nos dados da RiaSense.
- Waze for Cities: alertas em tempo real na ① e validação contínua do mapa. É gratuito, mas exige a adesão da Câmara.
- BEAV para validar o mapa de risco; ocorrências da ANEPC, se houver API.
- Mais semanas de dados: previsão com sazonalidade e ML mais rico.

## 8. Perguntas para o checkpoint de 18/11

1. Como detetam hoje as falhas das RSU? **Respondida a 17/11** (mentor CMA/IT): «Não temos uma maneira/alerta para quando há uma ausência de dados.» A ① responde a esta falta.
2. Podemos ter os eventos do Waze de 03 a 10/11, e em que condições de uso? **Respondida a 17/11:** não existem eventos do Waze da semana, só os CSV já cedidos.
3. Há acidentes georreferenciados (BEAV) de Aveiro, mesmo agregados?
4. Aveiro é parceira do Waze for Cities? A ANEPC tem uma API atual?
5. Há dados dos sensores ambientais do Living Lab?

## 9. Limites a dizer em voz alta

Há só uma semana de dados, e o teste da ② caiu entre domingo e terça. A falha de rede da RSU0030 deixou sem comunicação as quatro passadeiras, o estacionamento e quatro segmentos (dois deles só durante cerca de um dia), e não a RSU inteira. Dura cerca de 135 h na janela comum. A ③ a 3 h ganha à referência e à persistência, mas a margem sobre a referência é pequena nas passadeiras e no estacionamento; a 1 h, a persistência basta. A ④ mostra associações, não causalidade, e as passadeiras vizinhas partilham segmentos. A SC0011 abranda só no limite (IC superior −0,004 km/h). A SC0005 lê-se com cautela: o efeito do placebo (−0,84 km/h) é maior do que o efeito próprio (−0,51 km/h). A ② ao fim de semana tem mais incerteza. O mapa mede risco **potencial**, não acidentes. A classificação dos veículos tem cerca de 80% de exatidão.

Os scripts e resultados da verificação estão em [`pipeline/viabilidade/`](../pipeline/viabilidade/).
