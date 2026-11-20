# Triagem de avarias da Camada ①: formato de ordem de intervenção técnica para o IT

Status: proposto (19/11/2026, pelo João). O Moisés decide. Corrigido com os 2 should do revisor (nota 15009), como pediu o Moisés (nota das 17h52). **Complementa** o ADR-0008, o ADR-0025 e o ADR-0048.

## Contexto

- A camada ① deteta 38 falhas inesperadas na semana (11 de rede em 2 incidentes da RSU0030, e 27 de dispositivo).
- O mentor CMA/IT confirmou a 17/11 que a plataforma do Living Lab *não tem hoje alertas automáticos de quebra de dados* (#19, pergunta 1).
- O ADR-0008 definiu que o RiaSense atua como módulo do ATCLL Vision em NGSI-LD, e a lista das falhas da ① (ADR-0048) tem filtros, paginação e o pop-up, mas não diz por onde começar. O operador do IT precisa de saber que equipa despachar para o terreno.

## Decisão

1. **Uma sugestão de intervenção, não um diagnóstico.** A ① só sabe que um sensor, ou vários da mesma RSU, deixaram de enviar dados: não sabe se a RSU usa fibra, nem se o problema é a alimentação ou a lente. Por isso o texto diz sempre «Sugestão»:
   - **Falha de rede**: vários sensores da mesma RSU ficam sem comunicação ao mesmo tempo (por exemplo, a RSU0030). «Sugestão: começar pela ligação da RSU.»
   - **Falha de dispositivo**: um sensor deixa de comunicar sozinho, enquanto os outros da RSU continuam (passadeiras, segmentos, estacionamento ou zonas turísticas). «Sugestão: começar pelo próprio sensor.»
   - **Onde aparece:** no pop-up do sensor (ADR-0033, ponto 3). Cada linha da lista tem altura fixa e uma só linha (ADR-0048), por isso a linha leva só a ordem (1.º, 2.º…), não o texto.
   - **A regra da ordem:** primeiro as falhas em curso no fim dos dados (13 das 38), depois as de rede (deixam vários sensores sem comunicação de uma vez), e por fim as outras; dentro de cada grupo, pela que começou primeiro, e o empate desfaz-se pelo id do sensor. É uma ordem sugerida, não uma prioridade medida.
   - **A lista ordena-se por esta regra** (deixa de ser pelo início). **O número é a posição entre as 38 e não muda com os filtros**: com o filtro «dispositivo» aparecem, por exemplo, o 1.º, o 2.º, o 10.º…, para que o IT fale sempre da mesma falha pelo mesmo número (decisão do Moisés, 19/11).
   - **Que falha mostra o pop-up:** o clique numa falha da lista leva o cursor da hora ao início dessa falha, e o pop-up mostra essa falha, com a sugestão e o botão. Abrir o pop-up pelo mapa mostra a falha da hora escolhida; se essa hora não tiver falha, não há sugestão nem botão (decisão do Moisés, 19/11). Se a hora tiver duas falhas do mesmo sensor (uma acaba no instante em que começa a seguinte, como no 10962, onde passa de rede a dispositivo), o pop-up mostra a que começou mais tarde. O clique na lista passa ao pop-up a própria falha, e não só a hora.
2. **Copiar o alerta NGSI-LD:** um botão no pop-up copia a entidade `Alert` que já existe em `data/processed/ngsi-ld/falhas.jsonld` (ADR-0008), sem formato novo. A web ainda não lê esse ficheiro: chega por uma rota da API que devolve o `Alert`. Um sensor pode ter várias falhas, por isso escolhe-se o `Alert` pelo sensor e pelo início (`alertSource`, `validFrom`), com o instante completo, frações de segundo incluídas (26 das 38 falham se se comparar só até ao segundo); no estacionamento, o `alertSource` é a RSU.
3. **Fidelidade:** os dados são exatamente os de `falhas.parquet`, sem simulações fictícias fora do ADR-0032.

## Consequências

- **O que se ganha:** resposta direta à dor assumida pelo mentor do IT. Diz ao IT por onde começar; é uma sugestão, e não está medido que poupe deslocações.
- **Custos:** alteração mínima na apresentação da tabela existente e botão que copia o `Alert` existente.
- **Prazo:** pronto até às 10h de 20/11.
