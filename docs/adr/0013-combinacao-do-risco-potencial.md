# O risco potencial é uma soma pesada de 3 componentes normalizadas por percentil, e a fiabilidade mostra-se à parte

Status: em parte superseded by ADR-0024 (o comportamento das passadeiras com semáforo) e by ADR-0027 (o horizonte da previsão, t + 3 h); o resto deste ADR continua em vigor.

O ADR-0007 diz o que o mapa de risco potencial junta, mas não como. Decidimos (PO, 17/11/2026) que o risco potencial se calcula **por passadeira e por hora**, só nas 24 passadeiras. São os pontos com sensor que medem as travessias e o comportamento dos condutores; as zonas turísticas não têm a componente de comportamento. O cursor de hora do mapa escolhe a hora da exposição e da previsão:

**risco potencial = 0,4 · exposição + 0,4 · comportamento + 0,2 · previsão**

Cada componente é normalizada de 0 a 1 por percentil (ver as componentes), e os pesos ficam em `config/riasense.yaml`. O percentil põe componentes com unidades diferentes (travessias, km/h) na mesma escala, sem depender de valores extremos. A exposição e o comportamento pesam mais porque são medidos. A previsão é uma estimativa da próxima hora e só existe se a ③ ganhar à referência (ADR-0010).

A **fiabilidade do dado** (①) **não entra na soma**. Mostra-se como confiança, com opacidade ou tracejado, e na legenda. Se entrasse na soma, um ponto com falha pareceria mais ou menos arriscado só por causa do sensor.

## Componentes

- **Exposição:** as travessias na hora, medidas ou, quando a passadeira está em falha, estimadas pela ② e marcadas «estimado» (tracejado). O percentil calcula-se sobre **todos os pares (passadeira, hora) da semana**, e não entre as passadeiras da mesma hora. Se fosse por hora, uma passadeira com 2 travessias às 3h teria percentil alto.
- **Previsão:** as travessias previstas pela ③ para a hora seguinte, com o mesmo percentil global sobre os pares (passadeira, hora).
- **Comportamento:** o efeito da ④ (`efeito_kmh`) de cada passadeira, em percentil **entre as passadeiras**: quanto menos abranda, maior. Fica fixo ao longo da semana. As passadeiras **assinaladas** levam uma marca na legenda, sem peso. A % de veículos acima do limite aparece no cartão do ponto, mas **não entra na soma**.

## Consequências

- **Sem previsão numérica:** se a ③ ficar só com o grafo «o que antecipa o quê» (ADR-0010), os pesos restantes renormalizam-se para 0,5 · exposição + 0,5 · comportamento. A legenda diz «previsão: por testar», e nunca se inventam valores para a ③.
- **Interpretação (#11, 17/11):** A regra «sem previsão numérica» aplica-se **hora a hora**: a ③ só tem previsões fora da amostra nas 48 h de teste e nas passadeiras sem falha (980 de 3 936 horas); nas outras, os pesos renormalizam-se para 0,5/0,5 e `previsao_disponivel` é falso. Nas 980 horas com previsão, os dois regimes diferem 0,029 em mediana (correlação 0,986), por isso o risco potencial é comparável entre horas.
- **Análise de sensibilidade:** faz-se com pesos entre 0,3 e 0,5 e reporta-se a correlação de Spearman entre as ordenações das passadeiras. É um critério de aceitação da implementação (#11). Se a ordenação mudar muito, isso diz-se na apresentação.
- **Legenda:** mostra sempre as 3 componentes e a confiança. O texto diz «risco potencial» e «não mede acidentes».
- **O que não muda:** só há pontos com sensor; as ruas sem sensor ficam a cinzento, «sem cobertura» (ADR-0007).
