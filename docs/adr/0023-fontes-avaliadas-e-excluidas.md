# Fontes avaliadas e excluídas: só entram dados que acrescentem ao Living Lab, para a mesma semana ou estáticos, e com uso permitido

Status: proposto (17/11/2026).

A 17/11 avaliámos várias fontes externas para complementar os sensores. Uma fonte só entra se passar 4 filtros:
1. **cobre a semana dos dados** (03 a 10/11/2026) **ou é estática**;
2. **acrescenta** algo que os sensores não dão (locais sem sensor, causas, contexto);
3. **tem uso permitido** (licença aberta ou autorização, art. 22.º, n.º 2) e funciona **offline** na demo;
4. **não enfraquece o argumento central**: a RiaSense usa dados que só o Living Lab tem (o «teste Waze»).

## Excluídas

| Fonte | Filtro que falha | Motivo |
|---|---|---|
| TomTom Traffic, HERE Traffic | 1, 3, 4 | No plano gratuito só há tempo real (o histórico é pago). Os termos proíbem guardar e redistribuir. Dão o que os segmentos do Living Lab já dão. |
| Google «Popular times» e «Movimento em direto» | 1, 3 | Sem API. Raspar viola os termos (como o Waze direto, que o ADR-0009 já rejeitou). |
| Meta Data for Good, mapas de movimento | 1, 3 | Descontinuados ou com acesso por acordo. Não cobrem a semana. |
| GDELT | 2 | Notícias geolocalizadas ao nível da cidade, com muito ruído. |
| Eventos e calendário anotados à mão (proposta do MR !57, fechado) | 2 | Com 7 dias de dados, um evento acontece uma vez: não se aprende o seu efeito, e explicar uma ou outra anomalia não compensa o trabalho manual de recolher e citar cada evento. Se a Câmara der a lista (pergunta 10 da #19), usa-se só para comentar anomalias na avaliação. |
| ArcGIS «Ocorrências Históricas da ANEPC» | 1, 3 | Conta pessoal, sem licença. Quase só setembro de 2026. Fica fora (ADR-0017); o ADR-0036 só usa o arquivo de 2016 a 2020. |
| PORDATA, feridos e mortos | 2 | Totais anuais por município, sem hora, local nem peões. Pode citar-se no pitch como **enquadramento**, nunca como dado do modelo. |
| GTFS e horários da AveiroBus e da CP | 3 | Não encontrámos um GTFS aberto da rede urbana de Aveiro (no dados.gov.pt só há o de Águeda). Pede-se no checkpoint (issue #19). Se chegar com autorização, serve só para explicar anomalias, não como variável de treino. |

## Catálogos (não são fontes)

O dados.gov.pt / open-data.pt e o Mobility Database servem para **procurar** fontes. Cada fonte que lá se encontre passa pelos 4 filtros.

## Consequências

- As fontes que passaram estão nos ADR 0017 e 0036 (ANEPC, só o arquivo de 2016 a 2020; o fogos.pt sai), 0018 (luminosidade, sem fonte externa), 0019 (OSM), 0020 (obras, pedido à Câmara) e 0022 (Censos / WorldPop). A proposta dos eventos (MR !57, fechado) consta desta lista. As outras fontes (Open-Meteo, Waze, BEAV) estão no **ADR-0009**: os dois ADR juntos são a lista completa.
- **Ordem:** entra depois dos 0017, 0018, 0019, 0020 e 0022. Se algum for rejeitado ou mudar, a lista das fontes que passaram muda com ele.
- Uma fonte nova proposta depois disto passa pelos mesmos filtros e entra com um ADR próprio.
