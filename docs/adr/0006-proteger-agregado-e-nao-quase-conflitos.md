# A camada ④ mede o abrandamento agregado, não quase-conflitos individuais

Status: em parte superseded by ADR-0024, só na definição de passadeira assinalada; o resto deste ADR continua em vigor.

A ideia inicial da ④ era detetar quase-conflitos: um veículo rápido a menos de 2 s de um peão. Os dados não o permitem. Em todas as passadeiras, as coincidências entre travessias e passagens de veículos ficam ao nível do acaso (por exemplo, 18 743 contra 18 694 com os tempos baralhados): passa um veículo a cada 3–20 s, e não se sabe se o carimbo do veículo marca a entrada ou a saída do segmento. Por isso a ④ regride a **velocidade média por passadeira e por intervalo de 15 min** sobre as **travessias**, controlando o volume de veículos, a hora e o fim de semana. Faz também um teste placebo com as travessias de uma passadeira longe. Uma passadeira é assinalada quando a velocidade não desce com mais peões.

## Consequências

- Os resultados são associações, não causalidade, e é assim que se apresentam.
- As passadeiras vizinhas partilham segmentos (SC0007–0010, SC0011–0013, SC0019–0022, SC0023/0024), por isso os seus resultados não são independentes.
