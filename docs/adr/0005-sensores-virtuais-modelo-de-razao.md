# Sensores virtuais com um modelo de razão, e o estacionamento fica de fora

Status: complementado pelo ADR-0031 (a validação faz-se em várias janelas e compara-se com outros modelos). Substituído em parte pelo ADR-0046 (os segmentos completam-se com a ridge; as passadeiras e as zonas turísticas continuam com a razão).

A camada ② estima um sensor em falha multiplicando o **perfil horário dele** pela **variação atual dos 5 vizinhos do mesmo tipo** face ao perfil habitual desses vizinhos (razão limitada a 3). Na simulação com 29 h de treino, este modelo empatou com a ridge e a LightGBM (erro relativo de 0,36 contra 0,37/0,38) e foi o único com forma diária plausível. A ridge linear inventava cerca de 91 travessias/h à meia-noite, e a versão logarítmica triplicava o dia. Também é o mais fácil de explicar ao júri.

O **estacionamento não é completado**. A ocupação não se correlaciona com nenhum vizinho (0,16 depois de retirar o ciclo diário), por isso qualquer estimativa seria inventada. Entra nas camadas ① e ③, e dizemo-lo abertamente.

## Consequências

- A ridge e a LightGBM ficam como comparação na avaliação. Um modelo mais complexo só substitui o de razão se ganhar no mesmo teste (deixar um sensor de fora e simulação com 29 h) **e** passar a verificação da forma diária.
- Ao fim de semana o erro sobe para cerca de 0,51, porque o treino não tinha sábados nem domingos. O mapa mostra maior incerteza nesses dias.
