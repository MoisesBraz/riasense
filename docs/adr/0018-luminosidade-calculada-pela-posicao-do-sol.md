# A luminosidade de cada hora calcula-se pela posição do sol e mostra-se como contexto; o peso do escuro no risco potencial fica para um ADR próprio

Status: em parte superseded by ADR-0036, só no fator do escuro: vinha do fogos.pt, que os mentores não autorizaram, por isso cai e fica só o contexto «às escuras», como o ponto 2 já previa. Proposto a 17/11/2026.

Os atropelamentos têm o pico às 17h–19h (no distrito de Aveiro, 112 às 18h, no arquivo de 2016 a 2020), e em novembro essas horas já são de noite. A luminosidade não precisa de fonte externa: a elevação do sol calcula-se a partir da data, da hora e das coordenadas (algoritmo da NOAA, cerca de 20 linhas, sem dependências nem rede). A verificação bate com a realidade: a 07/11 o sol nasce por volta das 07:15 e põe-se por volta das 17:20, em hora local (= UTC em novembro). Cada hora fica **dia**, **crepúsculo** (sol entre 0° e −6°) ou **noite** (abaixo de −6°).

## O que o protótipo mostrou (17/11, fora do `main`)

- **Na semana dos dados, 91 das 164 horas são de noite.** Nessas horas fazem-se 22,6% das travessias.
- **Os atropelamentos concentram-se no escuro mais do que as travessias.** Nos 821 atropelamentos de novembro a fevereiro de 2026 em Portugal (fogos.pt, ADR-0017), cada um classificado com o sol do seu local e instante, **38,2% foram de noite**, contra 22,6% das travessias. Por travessia, a quota de atropelamentos é **1,69× a das travessias de noite e 0,77× de dia**, o que dá cerca de **2,2 vezes** mais de noite do que de dia (**IC 95% 1,9–2,5**, bootstrap de 2000 reamostragens).
- **Mesmo com iluminação pública, o fator fica acima de 1.** Restrito aos concelhos mais urbanos, dá **2,1** (n=401 na lista do protótipo; com outra lista de 25 concelhos, n=443, 2,08 com IC 1,70–2,52). Em Lisboa e no Porto (n=68) dá 1,7, mas com o IC de 0,98 a 2,87, por isso **não é firme**. Fora deles, 2,3. A iluminação reduz o efeito do escuro, mas não o elimina. O que se diz: «por travessia, cerca de 2 vezes mais atropelamentos no escuro do que de dia (Portugal, nov–fev 2026), também nos concelhos urbanos». O que **não** se diz: «nas passadeiras de Aveiro o escuro duplica o risco», porque as travessias são de Aveiro e os atropelamentos são do país. Os meses usados são janeiro, fevereiro e 1 a 17 de novembro de 2026; o ficheiro não tem dezembro.
- **A ④ não muda com o escuro.** Testada a interação travessias × escuro em cada passadeira, a mediana do efeito extra é −0,19 km/h por +10 travessias, ou seja, abrandam ligeiramente **mais** no escuro. Só 4 de 24 passadeiras são significativas, e com sinais diferentes. Os condutores não abrandam menos à noite: o problema do escuro está na visibilidade, não no comportamento medido.

## Decisão

1. A luminosidade calcula-se no pipeline e fica em `data/processed/luminosidade.parquet` (hora × classe e elevação).
2. Mostra-se como **contexto**: o cursor de hora do mapa e o cartão da passadeira dizem «às escuras». A frase do pitch com o fator de cerca de 2 vezes usa o fogos.pt e por isso **depende do ADR-0017 e da autorização dos organizadores**: sem ela, fica só o contexto «às escuras», que não precisa de fonte externa.
3. **Não entra como controlo da ④**, porque o protótipo não mostra efeito. Cai a regra «só se melhorar» da versão anterior deste ADR.
4. **Pôr o escuro como fator do risco potencial** (por exemplo, exposição × fator de luz) muda os pesos do ADR-0013. Fica para um ADR próprio, **depois da submissão do relatório**, com a análise de sensibilidade e um IC por bootstrap para o fator.

## Consequências

- **Aviso obrigatório, no texto, no pitch e na legenda:** «Dados recolhidos de fontes abertas, usados só para contexto e coerência. Carecem de validação junto das entidades responsáveis» (aqui, a ANEPC, para os atropelamentos). O cálculo do sol não tem fonte externa.
- Ressalvas do fator de 2,2 vezes:
  - os atropelamentos são do país inteiro e as travessias são de 24 passadeiras de Aveiro;
  - à noite circulam outros peões e outros condutores;
  - de noite há menos tráfego, por isso, por veículo, o fator pode ser ainda maior.
  É um **indício forte**, não uma medição.
- Iluminação pública: no OpenStreetMap, 23 das 24 passadeiras têm `lit=yes` na via (protótipo do ADR-0019), e a outra não tem etiqueta. O efeito do escuro que aqui se mede é o que fica **apesar** da iluminação, o que bate com o fator de cerca de 1,7–2 nos concelhos urbanos. A potência e o estado dos candeeiros pedem-se à Câmara (issue #19).
- Os parâmetros (coordenadas, limiar de −6°) ficam em `config/riasense.yaml`.
