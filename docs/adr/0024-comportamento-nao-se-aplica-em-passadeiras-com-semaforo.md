# Nas passadeiras com semáforo, o comportamento da ④ «não se aplica» e o risco potencial renormaliza os pesos

Status: proposto (17/11/2026). Altera o ADR-0013, que fica com `Status: em parte superseded by ADR-0024` (neste MR), e depende do atributo `semaforo` (ADR-0019, ou do Living Lab, pergunta 12 da #19).

A ④ mede se a velocidade desce quando há mais travessias, ou seja, se o condutor cede a passagem. Numa passadeira com semáforo, quem para o carro é a luz, que segue o ciclo e não o número de peões. Os dados vão no mesmo sentido. As 4 com `crossing=traffic_signals` ficam entre as 4 que menos abrandam (de −0,10 a −0,21 km/h por +10 travessias, contra uma mediana de −0,61 nas outras). **Ressalva:** a SC0020 (−0,212) e a 5.ª, a SC0019 (−0,220), distam só 0,008 km/h e têm ambas cerca de 29 h de dados (#66), e a probabilidade «1 em 10 626» foi calculada depois de ver os dados. O argumento que sustenta a decisão é o **mecanismo**: num semáforo, quem para o carro é a luz e não o número de peões. A 5.ª passadeira com semáforo, a SC0021, entra pela etiqueta do OSM e não pelo padrão dos dados: tem −0,31 km/h e é a 8.ª que menos abranda. Pelo percentil do comportamento (40% no ADR-0013), essas passadeiras ocupam o top 3 do risco potencial. É um artefacto da métrica, não um risco maior (issue #67).

## Decisão

Opção (a) da #67:
0. **`semaforo = true`** quando a passadeira tem, no OpenStreetMap (ADR-0019), `crossing=traffic_signals` **ou** `crossing:signals=yes` (decisão do utilizador, 17/11). Dá **5 passadeiras: SC0011, SC0012, SC0013, SC0020 e SC0021**. Quatro têm `button_operated=yes` (semáforo de botão) e a SC0011 tem `no`; a regra não distingue as duas. Tudo por validar com a Câmara (pergunta 12 da #19).
1. Nas passadeiras com `semaforo = true`, o comportamento fica **«não se aplica»**, e não 0 nem o percentil.
2. O percentil do comportamento calcula-se **só entre as passadeiras sem semáforo**.
3. Nas passadeiras com semáforo, os pesos que sobram renormalizam-se como no ADR-0013 sem previsão: 0,4/0,2 → 0,67 exposição e 0,33 previsão quando há previsão, e 1,0 exposição quando não há.
4. A ④ continua a calcular o efeito em todas, mas nas que têm semáforo **não assinala**: o estado passa a «com semáforo: não se mede da mesma forma».

## Opções rejeitadas (números na #67)

- **(b) Percentil por grupo:** entre só 5 passadeiras, o percentil só pode valer 0,2, 0,4, 0,6, 0,8 ou 1. Uma passadeira com semáforo volta ao topo só por ser «a pior das 5», e o artefacto mantém-se em ponto pequeno.
- **(c) Tirar o comportamento a todas:** deita fora a única medida de comportamento por causa de 5 passadeiras. O mapa passava a ser só peões (Spearman 0,73 com o atual).

## Consequências

- **Muda a definição de passadeira assinalada** (ADR-0006 e GLOSSARY): o ADR-0006 fica com `Status: em parte superseded by ADR-0024` (neste MR), e o GLOSSARY ganha o estado «com semáforo: o abrandamento não se mede da mesma forma», com a implementação.
- O top 5 do risco potencial passa de 0013, 0011, 0012, 0002, 0019 para **SC0002 (0,79), SC0019 (0,78), SC0007 (0,75), SC0006 (0,71) e SC0015 (0,67)**, com Spearman 0,796 com a ordenação atual (pipeline do !78 sobre o main com o !76, ou seja, com a previsão a 3 h do ADR-0027). **Ressalva obrigatória:** a SC0019 (Av. 25 de Abril) tem só cerca de 29 h de dados (#66); a SC0021 desce para 15.º. Troca-se um artefacto por uma estimativa frágil, por isso o top mostra-se sempre com os dias de dados de cada passadeira (o cartão do !68) e liga-se à regra de amostra mínima (critério 3 da #66, ADR próprio depois da submissão).
- **Muda um número do pitch** (o relatório já não o leva, #18): com o ponto 4, as passadeiras assinaladas passam de 3 para **0**: as 3 sem abrandamento claro (SC0013, SC0020 e SC0021) têm todas semáforo.
- A legenda e o cartão dizem «com semáforo: o abrandamento não se mede da mesma forma», e a componente aparece a cinzento.
- A análise de sensibilidade do ADR-0013 refaz-se com esta regra: o Spearman mínimo passa de 0,985 para 0,984.
- **Aviso obrigatório:** se o atributo vier do OpenStreetMap, é uma fonte aberta que carece de validação junto da Câmara Municipal de Aveiro. Uma etiqueta errada muda a ④ e o risco. Se vier do `trafficSignals` do Living Lab, fica validado pela entidade.
- Entra quando estiver pronto (nota 11759 da #46). A figura do relatório segue a decisão pendente da wiki Relatorio-18-11.
