# A previsão (③) só entra na demo se ganhar à referência

Status: em parte superseded by ADR-0027, no horizonte (3 e 6 h) e na 2.ª comparação (a persistência). Complementado pelo ADR-0031 (validação em várias janelas e outros modelos). O resto deste ADR continua em vigor.

A ③ prevê a próxima hora. Com só 7 dias de dados, um modelo pode parecer bom sem o ser. Por isso só entra no produto se ganhar à referência **«mesma hora, dia anterior»** no período de teste. Se não ganhar, a ③ fica reduzida ao grafo «que vertical antecipa as outras» (correlação com atraso), que é estatística e não promete previsão. Esta regra é fixada antes de o modelo existir, para não ser ajustada aos resultados.
