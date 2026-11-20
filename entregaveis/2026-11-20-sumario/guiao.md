# Sumário executivo de 20/11 · guião

**Para:** Eduardo Câncio (paginação) · **De:** Moisés · **Revisão do texto:** Elicarlos · **Versão 3** (no repositório, #95) · 18/11/2026

O texto entregue está em [`texto.md`](texto.md). Este guião tem os prazos, o que muda face ao relatório, o orçamento, a fonte de cada número e a lista de verificação. A versão 1 era `05-entregaveis/2026-11-20-submissao/guiao-e-texto-sumario.md`, no Nextcloud. Pelo ADR-0026, a versão que vale é a do repositório, e o texto muda por MR.

O sumário executivo **usa o mesmo template** do relatório de 18/11, `05-entregaveis/templates/Sumário Executivo Template ATC Hackathon 2026.docx`, no Nextcloud. Tem as mesmas 4 secções e no máximo 2 páginas, e entrega-se em PDF. As regras do texto são as do guião do relatório, na página «Relatorio-18-11» da wiki.

## Prazos

| Quando | O quê | Quem |
| --- | --- | --- |
| Qua 18/11, 19h00 | Relatório entregue | Moisés |
| Qua 18/11 | Entram o !76 (③ a 3 e 6 h) e o !78 (④ com semáforo); atualizam-se os números e saem as marcas «a confirmar» | agente Programador |
| Qui 19/11, 23h59 | MVP completo e texto do sumário fechado, sem marcas «a confirmar» | Moisés e Elicarlos |
| Sex 20/11, 13h30 | **Fechar** o código e os textos (decisão do Moisés a 19/11); a seguir, o vídeo de reserva e a revisão final (#46), até às 15h00 | todos |
| Sex 20/11, 15h30 | Submeter, com 2 h de folga sobre o prazo oficial | Moisés |
| Sex 20/11, 17h30 | **Prazo oficial**: sumário (PDF), apresentação (PPT) e ligação do repositório | — |

## O que muda face ao relatório de 18/11

- **Ideias para a proposta de solução:** em vez de «Plano: MVP completo a 19/11…», o texto diz o que **está entregue** e qual é o **roadmap**. Está entregue o pipeline, a API e a aplicação com mapa offline, prontos a instalar numa máquina virtual do IT com `docker compose`. A instalação no IT ainda não foi feita (#73). O roadmap tem a aplicação para transportadores, o Waze for Cities, o BEAV e mais semanas de dados.
- **Descrição do desafio:** igual à do relatório, incluindo a frase revista a 17/11 («Em vez de repetir o que as aplicações de navegação já mostram…»).
- **Estratégia:** o relatório não tem números de resultados, porque iam mudar com os merges da semana. No sumário os números voltam. Com o !76 e o !78 no `main`, estão fechados e já não há marcas «a confirmar».
- **④ e semáforos (#67, ADR-0024):** o texto não diz em lado nenhum que os carros «não abrandam» numa passadeira com semáforo. Diz que, onde há semáforo, quem trava é a luz e a medida não se aplica. O «Para a Câmara» deixou de nomear a SC0013, a SC0020 e a SC0021.
- **NGSI-LD (nota 12276 do PO):** o texto diz que a RiaSense exporta os resultados em NGSI-LD, prontos a carregar no ATCLL Vision, e que falta validar a ligação com o IT. A exportação não foi validada contra um broker nem contra o esquema oficial (`api/README.md`), e a pergunta 6 da #19 continua sem resposta.
- **Figura 2:** é a mesma captura real da aplicação que está no relatório. Com o !78 no `main`, o mapa muda (o top 5 do risco passa a SC0002, SC0019, SC0007, SC0006 e SC0015), por isso a captura refaz-se antes da paginação. É um ficheiro do Nextcloud, fora deste MR.

## Orçamento

| Secção | Caracteres |
| --- | --- |
| Descrição do desafio | 686 |
| Estratégia | 1294 |
| Ideias para a proposta de solução | 2015 |
| Ferramentas de IA | 124 |
| Legendas das 2 figuras | 329 |
| **Total** | **4448** |

Os caracteres contam-se sem as marcas «a confirmar» (que já não há), por secção e sem os `**` (a contagem direta do revisor).

**Simulação das 2 páginas (17/11):** as condições foram as do template, ou seja A4, margens de 2,54 cm, corpo a 10,5 pt com espaçamento de 1,15 e 11 pt depois de cada parágrafo, e títulos a 14 pt. O corpo foi medido em Arial, que é mais larga do que a Lato do template. A Figura 1 tem 451 × 189 pt e a Figura 2 entre 230 e 280 pt de altura. Com isto, o texto ocupa entre 1308 e 1358 pt dos 1396 pt das 2 páginas. **Folga de 3 a 6 linhas:** quem acrescentar uma frase tira outra.

**Revisão de 18/11 (notas 12259 e 12276):** o texto ganhou 163 caracteres, cerca de 2 linhas. A folga estimada passa a 1 a 5 linhas. Não se acrescenta mais nada sem tirar outra frase.

**Revisão de 18/11, com o !76 e o !78 (#95):** o texto ganhou 84 caracteres, cerca de 1 linha (③ a 3 h, «17 das 19 sem semáforo», «5 passadeiras» e «onde não há semáforo»). Depois, as Ferramentas de IA passaram à frase do relatório submetido (124 caracteres, menos 472 do que antes, cerca de 5 linhas). A nota 12811 do PO acrescentou «e no estacionamento» e «nas passadeiras e nas zonas» (+48 caracteres). O orçamento total é 4041 (contagem direta, por secção), abaixo dos 4377 de antes e perto dos 4214 da v1, por isso a folga estimada sobe para cerca de 5 a 9 linhas. A paginação confirma que cabe em 2 páginas (lista de verificação).

**Revisão de 18/11, com a #117 (declaração de fontes e licenças):** a secção «Ideias» ganhou o parágrafo «Fontes e licenças» (403 caracteres, contagem direta) e passou de 1499 a 1863 (+364); a frase do IT e da Câmara encurtou de 229 para 189 caracteres (volta o «com mais peões»), e a «Estratégia» perdeu 63, de 1340 para 1277, ao tirar «outros dois segmentos ficaram calados a maior parte da semana». O orçamento total passa a 4342 (+301). Medido com as métricas do Arial (451 pt de largura útil, as condições da simulação de 17/11), o texto ganha cerca de 3 linhas (41 pt; o revisor mediu +4 na versão anterior, no Chromium), **por isso a folga está curta: quem acrescentar uma frase tira outra, e a paginação no template (lista de verificação) confirma-se antes de submeter.** Se não couber, cortam-se primeiro as outras frases e nunca o parágrafo das fontes (o PO, 18/11).

**Revisão de 18/11, com a #54 (coerência com a ANEPC):** a linha da ANEPC passa de «consultada, não usada» a «só teste de coerência temporal», e a secção «Ideias» ganha a frase do PO sobre o resultado (cerca de 270 caracteres). Para manter o tamanho cortou-se o resto, e o PO pode repor: na «Descrição», «Em vez de repetir o que as aplicações de navegação já mostram» (63; a ideia está nas 3 condições da «Estratégia»); no «Mapa de risco potencial», «porque não há acidentes georreferenciados para o validar» (56; a ideia está nos «Limites») e «a fiabilidade do dado (①) fica fora da soma» (46); na «Replicação», «e indica onde pôr o próximo» (28; está na «Adoção»). O orçamento passa a 4409 (+67), e a estimativa com as métricas do Arial dá cerca de +1 linha (14 pt) face ao `main`: **a folga continua curta**, e a paginação no template confirma-se antes de submeter.

**Revisão de 19/11, com a #190 (a DGT nas fontes):** o LiDAR (!174) e a ortofoto de 2025 (!191) da DGT entram no produto, por isso o parágrafo «Fontes e licenças» ganha «DGT (CC BY 4.0): alturas dos edifícios (LiDAR) e ortofoto de 2025, só na zona da demo.» (+87 caracteres). Decisão do Moisés: confirmar a paginação e, se passar das 2 páginas, cortar na «Adoção» o parêntese «(sensores virtuais marcados como estimados; falhas como alertas)» (−65). Simulado com as métricas do Arial nas condições de 17/11 (451 pt de largura útil, corpo a 10,5 pt e espaçamento de 1,15, 11 pt depois de cada parágrafo): com a linha, a secção «Ideias» passa de 23 para 24 linhas (+14 pt), e o total chega a 1389–1439 pt dos 1396, o que passa as 2 páginas. **Por isso cortou-se o parêntese**, e a secção volta às 23 linhas, com a mesma altura do `main`. A ideia mantém-se, porque «sensores virtuais» e «falhas» estão na frase seguinte («Para o IT»). O orçamento passa a 4431 (+22). A folga continua curta, e a paginação no template confirma-se antes de submeter.

**Revisão de 20/11, com a #208 («sem comunicação», decisão do Moisés):** na «Estratégia», «a RSU0030 calou quatro passadeiras» passa a «a RSU0030 deixou sem comunicação quatro passadeiras». A secção passa de 1277 a 1294 caracteres (+17, menos de 1 linha), e o total de 4431 a 4448. Confirmar a paginação das 2 páginas.

## Fontes e licenças (declaração pedida pelos mentores)

Os mentores autorizaram, no checkpoint de 18/11, o arquivo da ANEPC de 2016 a 2020 como teste de coerência e as fontes de licença aberta, **desde que o relatório final as declare** (#19, perguntas 7 e 8, nota 13374). O texto declara:

| No texto | O que diz | Onde está no repositório |
| --- | --- | --- |
| Living Lab (ATCLL, IT) | A semana cedida ao hackathon (3 a 10/11) | `docs/ideia-riasense.md`; o enunciado do Desafio #1 |
| OpenStreetMap (ODbL) | O mapa (extrato) e os atributos das passadeiras (tipo, semáforos); o aviso do fim do parágrafo cobre-o também (ADR-0019, o semáforo vem do OSM e muda a ④) | ADR-0014 e ADR-0019; `data/processed/passadeiras_osm.parquet` mantém a ODbL |
| ANEPC, arquivo de 2016 a 2020 | **«Só teste de coerência temporal»**, com o resultado na secção «Ideias» (a frase do PO, 18/11): o perfil por hora acompanha (Spearman 0,75 no distrito, 700 atropelamentos) mas a exposição sozinha dá um pouco mais (0,78; a diferença tem o IC todo abaixo de 0), por isso o risco potencial não acompanha melhor do que a exposição. Troca a linha «consultada, não usada» do !119 no mesmo MR do código (#54) | ADR-0017, ADR-0036 e #54; `validacao_anepc.parquet` |
| Open-Meteo (CC BY 4.0) | Chuva e temperatura testadas nas camadas ①, ③ e ④ e não usadas | ADR-0009; `config/riasense.yaml` (`usar_meteo: false`); `meteo.parquet` fica no repositório |
| DGT (CC BY 4.0) | Alturas dos edifícios (LiDAR) e ortofoto de 2025, só na zona da demo (#190) | ADR-0050 (!174) e ADR-0045 (!191); a atribuição está no README, no rodapé do mapa e nos «Dados locais» |
| Censos 2021 do INE (CC BY 4.0) | **Não se declara:** não entra no produto (o ADR-0022 não tem código nem dados) | ADR-0022; #62 |

## Números do texto e de onde vêm

Cada número vem do `main`. Os ficheiros `data/processed/*.parquet` estão no repositório. Os ficheiros `data/interim/` saem do pipeline e não vão para o git.

| No texto | Valor | Fonte |
| --- | --- | --- |
| Janela dos dados | 3 a 10 nov 2026 (janela comum de 03/11 às 15h a 10/11 às 11h) | `config/riasense.yaml`, `periodo_dados` |
| Passagens de veículos / segmentos | 1,6 milhões (1 615 571) / 542 | `data/interim/segmentos.parquet`; `sensores.parquet`, coluna `tipo` |
| Travessias / passadeiras | 125 mil (124 895) / 24 | `data/interim/passadeiras.parquet`; `sensores.parquet` |
| Visitas / zonas turísticas | 490 mil (489 540) / 11 | `data/interim/visitas.parquet`; `sensores.parquet` |
| Eventos de estacionamento | 254 mil (254 484) | `data/interim/estacionamento.parquet` |
| Sem alerta de ausência de dados | «Não temos uma maneira/alerta para quando há uma ausência de dados» | mentor CMA/IT, 17/11 (#19); wiki Relatorio-18-11 |
| ① Falhas inesperadas | 38: 11 de rede e 27 de dispositivo | `falhas.parquet`, coluna `tipo` (ADR-0025) |
| ① Dois grupos da RSU0030 | 04/11 às 20h06: 4 passadeiras, 4 segmentos e o estacionamento (9 sensores). 05/11 às 09h56: mais 2 segmentos | `falhas.parquet`, colunas `grupo`, `rsu` e `inicio` |
| ① Cerca de 135 h | 134,9 h | `falhas.parquet`, coluna `duracao_h` do grupo de 04/11 |
| ① Dois segmentos durante cerca de 135 h | 11165 e 11166: uma só falha de rede, de 134,7 e 134,8 h | `falhas.parquet`, colunas `sensor`, `tipo` e `duracao_h` |
| ② 5 vizinhos, intervalo de 80 % | 5; 0,8 | `config/riasense.yaml`, `completar.vizinhos_mesmo_tipo` e `completar.intervalo` |
| ② Erro mediano | 0,36 contra 0,62 da referência (42 % menos) | `avaliacao_completar.parquet`: passadeiras, cenário `deixar_um_de_fora`, `todos` os dias, modelo `razao` contra `referencia` |
| ③ Prevê a 3 h e ganha nos 4 tipos, por pouco nas passadeiras e no estacionamento | `ganha` é verdadeiro nos 4 tipos a 3 h. Passadeiras: 0,557 contra 0,617 da referência (−9,7 %) e 0,720 da persistência. Estacionamento: 0,235 contra 0,253 da referência (−6,9 %) e 0,293 da persistência (ADR-0027, linha 33) | `avaliacao_prever.parquet`, `horizonte_h` 3, colunas `ganha`, `erro_sem_meteo`, `erro_referencia` e `erro_persistencia` (ADR-0027, !76) |
| ③ A 1 h, copiar a última hora basta nas passadeiras e nas zonas | passadeiras: modelo 0,418 contra 0,416 da persistência; zonas: 0,368 contra 0,344. Nos segmentos (0,218 contra 0,272) e no estacionamento (0,192 contra 0,222) o modelo ganha à persistência. A 1 h só se avalia | `avaliacao_prever.parquet`, `horizonte_h` 1 (ADR-0027) |
| ④ Abrandam | 19 de 24; das 19 sem semáforo, 17 (as 2 com semáforo que abrandam são a SC0011 e a SC0012; as que não abrandam e não têm semáforo são a SC0015 e a SC0022) | `proteger_passadeiras.parquet`, colunas `abranda` e `semaforo` (ADR-0024, !78) |
| ④ Assinaladas | 0: as 3 que não abrandavam com clareza (SC0013, SC0020 e SC0021) têm semáforo | `proteger_passadeiras.parquet`, coluna `assinalada` (ADR-0024, !78) |
| ④ Cerca de 29 h nas passadeiras da RSU0030 | 116 intervalos de 15 min, antes da falha (SC0019 a SC0022) | `proteger_passadeiras.parquet`, coluna `n_intervalos` (#66) |
| ④ Semáforos | 5 passadeiras: SC0011, SC0012, SC0013, SC0020 e SC0021 | `passadeiras_osm.parquet`, coluna `semaforo` (OpenStreetMap, por validar com a Câmara; ADR-0019 e ADR-0024) |
| Ferramentas de IA | sem números: a frase é a do relatório submetido a 18/11 («Usámos a IA generativa para explorar os dados e verificar a viabilidade das camadas, sempre revisto pelos membros da equipa») | texto do relatório de 18/11, decisão do PO |
| Pesos do risco potencial | 0,4 · 0,4 · 0,2; a fiabilidade fica fora da soma. Onde há semáforo, o comportamento não entra e os pesos renormalizam-se (0,67 exposição e 0,33 previsão); a previsão é a de 3 h | `config/riasense.yaml`, `risco_potencial.pesos` (ADR-0013, ADR-0024, ADR-0027); `risco_potencial.parquet`, colunas `semaforo` e `comportamento_pct` (nulo nas 5 com semáforo) |
| Coerência com a ANEPC | Distrito de Aveiro, 700 atropelamentos de 2016 a 2020; Spearman 0,75 com o risco potencial e 0,78 com a exposição sozinha (0,754 e 0,778) | `validacao_anepc.parquet`, quadro `correlacao`, `ambito` distrito, `medida` spearman, `contra` risco e exposicao (ADR-0036); 700 em `n` |

## A confirmar

Nada. As 3 marcas fecharam-se a 18/11, com o !76 e o !78 no `main`:

| Marca | Resultado |
| --- | --- |
| ③ «ganhou nos quatro tipos» | A 3 h ganha nos 4 tipos à referência e à persistência (ADR-0027). A 1 h, nas passadeiras, o modelo (0,418) não bate a persistência (0,416), por isso a 1 h só se avalia. O !86 (#85) não muda nenhum número do produto |
| ④ «abrandam 19 de 24» | Bate: 19 de 24, e 17 das 19 sem semáforo. As assinaladas passam de 3 para 0 (ADR-0024) |
| Pesos do risco potencial | Os pesos são 0,4 · 0,4 · 0,2. Nas 5 passadeiras com semáforo, o comportamento não entra e os pesos renormalizam-se |

## O que não se diz

- Que nas passadeiras com semáforo «os condutores não abrandam». Quem trava é a luz, e a medida não se aplica (#67, ADR-0024).
- «Risco» sozinho, ou «acidentes» como medida. Diz-se sempre «risco potencial», que não mede acidentes.
- Que o IT não sabia da falha da RSU0030. Diz-se que hoje não há alerta para a ausência de dados.
- Que a RiaSense já está instalada no IT (#73) ou que o IT já vê os resultados no ATCLL Vision. Diz-se que os resultados estão prontos a carregar e que falta validar a ligação com o IT.
- «Antecipação» entre verticais, nem «metade do erro»: o erro da ② é 42 % menor, ou seja cerca de 40 % menos.

## Lista de verificação

As regras do guião do relatório (wiki Relatorio-18-11) aplicam-se todas, e mais estas:

- [x] Não sobra nenhuma marca «a confirmar» no texto (18/11).
- [ ] A secção «Ideias» diz **o que está entregue** e **o roadmap**, sem prometer o que não existe.
- [ ] Não há nenhum número que não esteja na tabela acima.
- [ ] O texto cabe em 2 páginas A4 no template, **com o parágrafo das fontes** (a folga ficou curta, ver a revisão da #117).
- [ ] O parágrafo «Fontes e licenças» diz o que o `main` tem à entrega (com a #54 no `main`: ANEPC «só teste de coerência temporal»; sem ela, «consultada, não usada»), e o aviso do ADR-0017 está no fim, para cobrir a ANEPC e o OpenStreetMap.
- [ ] A frase da ANEPC (secção «Ideias») diz o que o ADR-0036 permite: coerente, mas o risco não acompanha melhor do que a exposição; nunca «valida o risco» nem «mede acidentes».
- [ ] O PDF e a ligação do repositório (`http://<gitlab>/hackathon/riasense`) estão no formulário de submissão.
- [ ] O PDF fica em `entregaveis/2026-11-20-sumario/` e no Nextcloud (ADR-0026).
- [ ] A submissão é feita até às 15h30.
