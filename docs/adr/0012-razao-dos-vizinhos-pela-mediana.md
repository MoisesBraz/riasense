# A variação dos vizinhos junta-se pela mediana das razões, não pela razão entre somas

O ADR-0005 fixa o modelo de razão, mas não diz como se juntam os 5 vizinhos. A viabilidade usou a razão entre somas: a soma dos vizinhos agora sobre a soma do perfil habitual deles. Com o pipeline, a SC0023 cai cerca de 90% a partir de 07/11 sem perder a comunicação e, com a soma, arrasta as vizinhas: as passadeiras dão 0,405 na simulação de 29 h (acima dos 0,40 da issue #7) e 0,490 em «deixar um sensor de fora». A viabilidade só chegou a 0,36 porque tirou a SC0023 à mão. Decidimos juntar os vizinhos pela **mediana das razões de cada vizinho** (o valor atual de cada um sobre o seu perfil habitual), que pesa todos por igual e não deixa um vizinho degradado mandar no resultado. Dá 0,36 nos dois testes, sem exclusões à mão. A escolha fez-se **depois de ver os números**. Não foi um ganho marginal: em «deixar um sensor de fora» a diferença é de 0,357 para 0,490.

**Segmentos e zonas (18/11, #51).** O argumento acima vem das passadeiras, mas a mediana aplica-se a todos os tipos. Nos segmentos e nas zonas, a razão entre somas erra cerca de 0,02 menos do que a mediana:
- nos segmentos, 0,230 contra 0,250 em «deixar um sensor de fora» e 0,313 contra 0,330 na simulação de 29 h;
- nas zonas, 0,246 contra 0,277 e 0,277 contra 0,281.

Nos segmentos, a soma também passa a verificação da forma diária (a noite fica 0,98 e 0,95 da noite real, contra 0,78 e 0,72 com a mediana). Nas zonas, nenhum dos dois acerta a noite, porque à noite as visitas são quase zero. Mesmo assim, **a mediana fica em todos os tipos**, por três razões:
- a diferença é pequena;
- um só agregado é mais simples de explicar e de manter;
- a robustez a um vizinho degradado também conta nos segmentos (o 10368, da RSU0030, falha 4 vezes na semana).

Mudar de agregado a 18/11 mexia na avaliação e nos textos da ②, a dois dias do congelamento (decisão do PO, opção (a) da #51). Os números estão em `data/processed/avaliacao_completar.parquet`, com `dias = todos`.

## Consequências

- O ADR-0005 continua ativo, e este ADR refina-o. O perfil próprio, os 5 vizinhos do mesmo tipo, o limite da razão em `completar.razao_max` e o estacionamento de fora não mudam.
- A variante com a soma continua na avaliação como `razao_soma`, em `data/processed/avaliacao_completar.parquet`, para quem quiser comparar.
- Um vizinho que se degrade sem perder a comunicação deixa de distorcer a estimativa. Mas se a maioria dos vizinhos se degradar ao mesmo tempo, a mediana também se degrada.
