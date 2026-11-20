# Pitch de 3 min (20/11) · a fala

**De:** João · **Versão 2** · 20/11/2026 (correções do João, verificadas contra o `main`)

A fala corre por cima da demo e da apresentação animada (`apresentacao.html`, ao lado). Os slides e os números estão no [guião](guiao.md). Cada número desta fala foi confirmado nos Parquet de `data/processed`, no `main` (tabela no fim).

São cerca de 293 palavras, perto de 2:15 a um ritmo calmo (130 palavras por minuto), mais as pausas marcadas no teleponto. O vídeo da app (slide 5) dura 1:46: avança-se quando acabar a fala dos pilares.

## A fala

**[Slide 1 · Abertura]**
Boa tarde a todos.
Imaginem uma cidade que sabe quando os seus sensores falham.
Que estima o que eles deixam de ver.
Que prevê o movimento das próximas horas.
E que protege quem atravessa a rua.

**[Slide 2 · Impacto]**
Não é preciso imaginar.
Numa só semana de dados do Living Lab, encontrámos 38 falhas inesperadas.
Uma delas deixou quatro passadeiras quase seis dias às cegas: cerca de 14 mil travessias por contar.

**[Slide 3 · O caso]**
Venham connosco até à Avenida 25 de Abril. 4 de novembro, 20h06.
Quatro passadeiras deixam de comunicar ao mesmo tempo.
Hoje, ninguém é avisado.
Com o RiaSense, seria um alerta em cerca de 13 minutos, que diria se a falha é do sensor ou da rede.

**[Slide 4 · Os quatro pilares: Vigiar · Completar · Prever · Proteger]**
Para isso, assentamos em quatro pilares.

**[Slide 5 · Os pilares, com o vídeo da app]**
Vigiar. Aprendemos o ritmo de cada sensor e damos o alerta quando deixa de comunicar fora do esperado. Aqui, foi a rede: nove sensores da mesma RSU deixaram de comunicar em dez minutos.
Completar. Usamos os sensores vizinhos para estimar o que faltou, com a margem de erro à vista.
Prever. Antecipamos o movimento daqui a 3 horas.
Proteger. Cruzamos tudo num mapa de risco potencial, por passadeira e por hora: onde há mais peões e onde os carros abrandam menos.

**[Slide 6 · Adoção e viabilidade]**
Partimos da rede que já está instalada: sem sensores novos nem base de dados.
À Câmara Municipal de Aveiro, que abre o mapa e decide onde intervir primeiro.
E ao Instituto de Telecomunicações, que receberia o alerta no ATCLL Vision, o sistema que já tem online, e saberia se tem de enviar alguém ao terreno.
Novas áreas e limiares configuram-se num ficheiro, sem programar.

**[Slide 7 · Fecho]**
Os dados já estavam em Aveiro. Só faltava dar-lhes sentido.
O RiaSense transforma o Living Lab num sistema que se vigia, se completa, prevê e protege.
*(pausa)*
Obrigado.

## O que mudou em relação ao rascunho, e porquê

| No rascunho | Na fala | Porquê |
| --- | --- | --- |
| «96 falhas inesperadas» | 38 falhas inesperadas (11 de rede, 27 de dispositivo) | O 96 era o método antigo da viabilidade, já corrigido (`docs/uso-de-ia.md`); o `falhas.parquet` tem 38 |
| «4 passadeiras onde os carros não abrandam» | cerca de 14 mil travessias por contar | Não abrandam 5 de 24, 3 delas com semáforo, onde a medida não se aplica (ADR-0024); há 0 assinaladas |
| «recuperámos dias de medições perdidas» | estimámos o que faltou, com a margem de erro à vista | As medições não voltam: estimam-se, e marcam-se como estimadas |
| «calam-se», «ficam caladas» | deixam de comunicar | O termo do João, também nos slides e na app (#208) |
| «Sem novo hardware: nem sensores, nem servidores» | sem sensores novos nem base de dados | Precisa de uma máquina; o relatório diz «sem servidor de base de dados» (ADR-0003) |
| «o IT recebe o alerta» | o IT **receberia** o alerta no ATCLL Vision | A ligação NGSI-LD está por validar com o IT (ADR-0008, ADR-0030); o guião não deixa dizer que já está instalada |
| — | alerta em cerca de 13 minutos | Cálculo sobre os dados (ADR-0030); ao vivo mostra-se com a simulação do modo «agora» |
| «passa a ser um alerta» | **seria** um alerta, que **diria** se a falha é do sensor ou da rede | Os 13 min são um cálculo sobre os dados e a ① corre em lote; o guião diz «teria dado o alarme» (ao vivo, é a simulação do modo «agora») |
| «nove sensores … ao mesmo tempo» | nove sensores … **em dez minutos** | As 4 passadeiras param no mesmo minuto (20h06–20h07), mas os 9 sensores da RSU0030 levam 10 min (o último às 20h16) |
| «as próximas horas: a 3 horas» | o movimento **daqui a 3 horas** | O modelo prevê daqui a 3 h, que é o que a app diz («Previsão daqui a 3 h») |
| «cerca de 40 % menos erro» no Completar | sai da fala (v2) | Escolha do João; o slide dos pilares continua a mostrar o número |
| «Qualquer cidade com sensores pode fazer o mesmo» | fica para o pitch de 5 min | A replicação não conta na nota da seleção; na final diz-se com «só a testámos em Aveiro» |

## A fonte de cada número

| Na fala | Valor | Fonte |
| --- | --- | --- |
| 38 falhas inesperadas | 11 de rede, 27 de dispositivo | `falhas.parquet`, coluna `tipo` |
| quase seis dias | 134,9 h, a partir de 04/11 às 20h06 | `falhas.parquet`, grupo da RSU0030 |
| nove sensores da mesma RSU, em dez minutos | 4 passadeiras, 4 segmentos e o estacionamento, das 20h06m25s às 20h16m49s (as 4 passadeiras até às 20h07m25s) | `falhas.parquet`, grupo 5 |
| cerca de 14 mil travessias | 14 086 estimadas nas SC0019 a SC0022 | `sensores_virtuais.parquet`, soma de `estimativa` com `estimado` |
| cerca de 13 minutos | ~66 travessias/h às 20h; 12,6 min de silêncio têm probabilidade < 10⁻⁶ | ADR-0030, ponto 3 |
| cerca de 40 % menos erro (só no slide 4) | 0,357 contra 0,62 da referência, nas passadeiras | `avaliacao_completar.parquet`, modelo `razao` |
| daqui a 3 horas (no slide 4: erra menos do que a referência) | horizonte principal 3 h; 0,557 contra 0,617 da referência e 0,72 da persistência | `avaliacao_prever.parquet`, `horizonte_h` 3 |
