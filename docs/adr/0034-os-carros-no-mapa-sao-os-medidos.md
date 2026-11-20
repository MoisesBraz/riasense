# Os carros no mapa são os medidos: só nas ruas com sensor, com a contagem e a velocidade de cada hora

Status: aceite pelo PO, com 3 correções do revisor e 2 ajustes (17/11/2026, notas 12078 e 12110). Ponto 1 revisto a 18/11 (#123): um sensor por segmento para a semana toda. Pontos 3, 4 e 6 alterados pelo ADR-0039 (19/11): a velocidade por grupo de veículos, o anel de excesso e as velocidades no `segmentos_hora.parquet`. Complementa o ADR-0007 (sem estimativas onde nunca houve sensor), o ADR-0029 (a reprodução da semana real), o ADR-0032 (o painel «agora» com dados fictícios) e o ADR-0033 (as cores dos estados; as ruas com sensor a azul, #88).

## Contexto

- O mapa mostra pontos (sensores, falhas, risco). Para quem não conhece o Living Lab, não se vê que por trás há 1,6 milhões de passagens de veículos em 542 segmentos, nem como o trânsito muda ao longo do dia.
- O utilizador propôs (17/11) «linhas de carros a passar». A pergunta que o júri técnico faz a seguir é: «esses carros são reais?». Carros inventados em ruas sem sensor contradiziam o ADR-0007 e a regra «sem cobertura».
- Os dados chegam: cada segmento tem a geometria (`location`, LineString, em `reference-entities/RoadSegment.csv`) e, por hora, o número de passagens e a velocidade média (`roadsegments_stats.csv`, já ingerido).

## Decisão

1. **Só segmentos com câmara ou radar** (194 segmentos). O V2X só vê os veículos ligados (mediana de 1 veículo por hora), por isso os 348 segmentos só com V2X ficam sem carros. **Um tipo de sensor por segmento, para a semana toda, nunca somados:** a câmara, salvo se tiver menos de metade das horas do radar; nesse caso, o radar (alterado a 18/11, nota 13599 do !126 e #123). A razão: nos segmentos 10084 e 11168 (Av. 25 de Abril), a câmara deixa de comunicar às 20h16 de 04/11 e o radar continua até 10/11, e a rua ficava a azul e sem carros durante 6 dias. Escolher o sensor **por hora** não serve, porque nas horas em que mediram os dois o radar conta 1,59 vezes a câmara (mediana, de 0,3 a 6,2): no 10084, das 08h às 20h de 04/11, a câmara dá 144 passagens por hora e o radar 664, e os carros saltariam quando o sensor muda (1 340 horas, em 40 segmentos). Com esta regra só mudam 8 segmentos para o radar, entre eles o 10084 e o 11168. O pop-up diz que sensor mediu (câmara ou radar). **Ressalva:** o 11167 e o 11172, que só têm V2X depois das 20h17, ficam sem carros nessas horas com qualquer regra. Assim o mesmo carro nunca conta duas vezes (165 segmentos têm mais de um tipo de sensor).
2. **«Rua com sensor» passa a incluir estes segmentos.** Os segmentos com câmara ou radar contam como ruas com sensor (azul, #88), além das ruas perto de uma passadeira. As ruas só com V2X ficam como estão hoje. A definição é a mesma no ADR-0007, no ADR-0033 («sem cobertura») e na legenda, e os carros desenham-se sobre a geometria do próprio segmento.
3. **Os carros são os medidos.** Em cada segmento, o número de pontos em movimento é proporcional às passagens medidas nessa hora pelo sensor escolhido (`carros.veiculos_por_ponto`, por exemplo 1 ponto ≈ 20 veículos). A velocidade do ponto é proporcional à velocidade média medida, acelerada pelo mesmo fator para todos. A legenda diz «cada ponto ≈ N veículos medidos nesta hora (câmara ou radar)».
4. **Pontos numa cor neutra** (ajuste do PO), sem verde nem vermelho: essas cores são só para os estados do sensor (ADR-0033, ponto 1).
5. **Segue o cursor de hora e a reprodução (▶).** Mudar a hora muda os carros. **Um segmento em falha (①) usa o estado «Falha» do ADR-0033** (vermelho) e fica sem carros. O tracejado fica só para os estimados (sensores virtuais da ②).
6. **Um Parquet novo e pequeno**, `segmentos_hora.parquet` (segmento × hora: `sensor`, `veiculos`, `vel_media_ms`), feito pelo passo `riasense carros`, e a geometria dos 194 segmentos em GeoJSON. Um endpoint da API lê-os. Nada se estima.
7. **Interruptor e acessibilidade.** Camada «Trânsito» no painel de camadas, **ligada por omissão no ① Vigiar**, onde se vê a falha da RSU0030, e desligada nos outros separadores, que o ADR-0033 quer com menos para ler. Com `prefers-reduced-motion`, os pontos ficam parados, com a mesma densidade.

## Consequências

- O júri vê o trânsito real de Aveiro a encher às 8h e a esvaziar de madrugada, e vê a falha da RSU0030 como ruas que ficam vermelhas e sem carros.
- **Nenhum número do produto muda.** É só uma vista dos dados ingeridos. A definição de «rua com sensor» muda no mapa (ponto 2), e por isso também a legenda.
- **Ordem e prazo (PO):** a implementação começa só depois de fechados os MR pendentes do João e entra depois do !94 (#90, ADR-0033), porque mexe no mapa. Se não ficar fluida até quinta, 19/11, às 20h (≥ 30 fps num portátil comum), a camada fica desligada e vai para o roadmap.
- **Riscos:** o desempenho com 194 segmentos. Por isso, a animação tem um teto de pontos.
- **Fora de âmbito:** os carros nos segmentos só com V2X e nas ruas sem sensor, as rotas, a origem-destino e a categoria do veículo.
