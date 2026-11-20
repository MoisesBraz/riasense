# Relatório de 18/11 · números

De onde vem cada número do texto entregue ([`texto.md`](texto.md)). As fontes são os Parquet e os ADR do repositório. Os valores conferiram-se com o `main` a 18/11.


| No texto | Valor | Fonte |
| --- | --- | --- |
| Janela dos dados | 3 a 10 nov 2026 (janela comum: 03/11 às 15h a 10/11 às 11h) | `config/riasense.yaml` |
| Passagens de veículos / segmentos | 1,6 milhões (1 615 571) / 542 | `data/interim/segmentos.parquet`, `sensores.parquet` |
| Travessias / passadeiras | 125 mil (124 895) / 24 | `passadeiras.parquet` |
| Visitas / zonas turísticas | 490 mil (489 540) / 11 | `visitas.parquet` |
| Eventos de estacionamento | 254 mil (254 484) | `estacionamento.parquet` |
| Sem alerta de ausência de dados | «Não temos uma maneira/alerta para quando há uma ausência de dados» | Marcos Mendes, mentor CMA/IT, 17/11, 18h44 (#19) |
| Falhas inesperadas na semana | 38, 11 de rede (2 grupos na RSU0030) | `falhas.parquet`, ADR-0025 (!81) |
| Erro mediano da ② nas passadeiras | 0,36 (0,357) contra 0,62 (0,617) da referência | `avaliacao_completar.parquet`: cenário «deixar um de fora», todos os dias, razão pela mediana (ADR-0012) contra a referência |
| ③ na hora seguinte, passadeiras | 0,42 (0,418) contra 0,62 (0,617) da referência | `avaliacao_prever.parquet` (`main`, a 1 h, 20 passadeiras, 48 h de teste) |
| ③ contra a persistência, a 1 h | 0,418 do modelo e 0,416 da persistência: «0,42 nos dois» | `avaliacao_prever.parquet` do !76 (ADR-0027); conferido pelo revisor na nota 12582 do !105 |
| 29 h nas 4 passadeiras da RSU0030 | SC0019, SC0020, SC0021 e SC0022: 116 intervalos de 15 min (03/11 às 15h a 04/11 às 19h45), antes da falha | `proteger_passadeiras.parquet`, coluna `n_intervalos` (#66) |
| Semáforos | sem contagem: «onde há semáforo, quem trava é a luz e a medida não se aplica» | OpenStreetMap, por validar com a Câmara (#67, ADR-0024: 5 passadeiras com `crossing=traffic_signals` ou `crossing:signals=yes`) |
| Pesos do risco potencial | 0,4 · 0,4 · 0,2; a fiabilidade fica fora da soma; renormalizam-se sem previsão | ADR-0013 |
| Exatidão da classificação dos veículos | cerca de 80 % | `docs/ideia-riasense.md` |

**Números do ④ que mudam depois da entrega:** o !78 (ADR-0024) deixa **0 passadeiras assinaladas** (19 de 24 sem semáforo), e o texto diz só «lê-se com reserva». O ④ das Ideias diz «Identifica passadeiras críticas», que não bate com as 0 assinaladas: o Moisés viu o aviso e manteve o texto (18/11). O ③ muda a 3 e 6 h com o !76.
