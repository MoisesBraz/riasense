# pipeline

Ingestão e limpeza (Python + DuckDB) dos CSV de `RIASENSE_DATA_RAW`, as 4 camadas (① falhas, ② sensores virtuais, ③ previsão, ④ comportamento junto às passadeiras) e a escrita em Parquet em `data/processed/`.

`viabilidade/` tem os testes exploratórios de 17/11 que justificaram a ideia.

## Ingerir

```bash
export RIASENSE_DATA_RAW=".../03-dados/brutos"   # pasta dos 5 CSV do Living Lab
uv run riasense ingerir                          # escreve em RIASENSE_DATA_INTERIM (por omissão, data/interim/)
```

Escreve uma tabela Parquet por fonte em `data/interim/`. Estas tabelas são grandes e regeneráveis, por isso ficam fora do git. Partilham-se pelo Nextcloud, em `03-dados/processados/`.

| Tabela | CSV de origem | Colunas |
| --- | --- | --- |
| `segmentos` | `roadsegments_stats.csv` | `id`, `t`, `sensor`, `categoria`, `vel_media_ms`, `vel_max_ms`, `vel_limite_ms` (o menor valor de `maxAllowedVelocity`, porque 4 segmentos têm 2), `duracao_s`, `faixa`, `rsu` |
| `passadeiras` | `smartcrosswalk.csv` | `id`, `t`, `travessia_s`, `espera_s`, `de`, `para`, `rsu` |
| `estacionamento` | `smartparking.csv` | `id`, `t`, `estado`, `duracao_s`, `rsu`, `lon`, `lat` |
| `visitas` | `touriststats_visits.csv` | `id`, `t`, `zona`, `entrada`, `saida`, `permanencia_s`, `camara` |
| `transicoes` | `touriststats_transitions.csv` | `id`, `t`, `zona_origem`, `zona_destino`, `visita_origem`, `visita_destino` |

`id` é o URN NGSI-LD completo (ADR-0008). `t` é o `eventTimestamp` em UTC, que em novembro coincide com a hora local. O `config/riasense.yaml` usa a forma curta (`SmartCrosswalk:0019`). Para cruzar os dois, usa-se `riasense.ids.urn()`, que aceita as duas formas e devolve sempre o URN completo.

Regras de limpeza (`perfil-dos-dados.md` do Nextcloud). Os limiares estão em `config/riasense.yaml`, na secção `ingerir`.

- **Janela comum:** fica só `periodo_dados.inicio ≤ t < periodo_dados.fim`.
- **Velocidades:** estão em **m/s** e não se convertem (convenções do README principal).
- **Segmentos:** a velocidade 16383 (o marcador de inválido) passa a nula. A duração 0 ou acima de 1 h também passa a nula. A linha fica, porque conta como passagem de um veículo.
- **Passadeiras:** descartam-se as travessias acima de 60 s e as que têm `from`/`to` numa `Crosswalk` em vez de um `Sidewalk`. O `espera_s` fica nulo quando vem vazio.
- **Visitas:** a mesma visita repetida fica só na versão mais recente. A permanência 0 passa a nula, mas a visita conta.
- **Duplicados:** saem as linhas iguais em todas as colunas. O `_id` do Mongo e o `recvTime` não contam para isto.

## Sensores

```bash
uv run riasense sensores   # lê RIASENSE_DATA_RAW/reference-entities e data/interim; escreve em RIASENSE_DATA_PROCESSED
```

Usa a extensão spatial do DuckDB, que se instala sozinha na primeira corrida e precisa de rede nessa altura. As distâncias são em metros, em EPSG:3763. Escreve 3 tabelas pequenas em `data/processed/`:

| Tabela | Colunas | Conteúdo |
| --- | --- | --- |
| `sensores` | `id`, `tipo`, `rsu`, `rsus`, `nome`, `x`, `y`, `lon`, `lat` | Um sensor por passadeira, zona turística, segmento com eventos e RSU com estacionamento. No estacionamento, o `id` é o URN da RSU. `x`/`y` estão em EPSG:3763: são o meio da linha nos segmentos e o centroide nos restantes |
| `vizinhos` | `id`, `tipo`, `vizinho`, `distancia_m`, `ordem` | Os `completar.vizinhos_mesmo_tipo` (5) sensores do mesmo tipo mais próximos (ADR-0005) |
| `passadeira_segmentos` | `passadeira`, `segmento`, `distancia_m` | Os segmentos com eventos a ≤ `proteger.raio_segmentos_m` (30 m) do polígono de cada passadeira (ADR-0006) |

Além do Parquet, o passo escreve `passadeiras.geojson` (ADR-0038): o polígono de cada passadeira, em GeoJSON, a partir do `Crosswalk.csv` das entidades de referência, que o `SmartCrosswalk.csv` aponta pelo `refCrosswalk`. Cada `Feature` leva o `id` do sensor `SmartCrosswalk`, o `crosswalk`, o `nome` da rua (`roadName`, nulo se o Living Lab não o diz) e a `rsu`; a geometria é a do Living Lab, tal e qual. Nada se estima: uma passadeira sem polígono fica de fora (só tem o marcador), e sem `Crosswalk.csv` o ficheiro não existe (a API diz «por calcular»). É geometria do próprio Living Lab, não uma fonte externa.

`rsus` é a lista das RSU do sensor e `rsu` é o 1.º elemento (nulo quando a lista está vazia). Nos segmentos, o `observedBy` da referência e dos eventos vem como lista JSON. Usa-se a lista da referência ou, quando vem vazia, a lista mais frequente nos eventos que têm RSU. 391 dos 542 segmentos não têm RSU em nenhum dos dois, e 19 têm 2 RSU.

## Carros (ADR-0034)

```bash
uv run riasense carros   # lê data/interim/segmentos.parquet e RIASENSE_DATA_RAW/reference-entities; corre depois do `sensores`
```

Os carros do mapa são os medidos, só nos segmentos com câmara ou radar (o V2X só vê os veículos ligados). Cada segmento usa um só tipo de sensor para a semana toda, e os dois nunca se somam (ADR-0034, ponto 1): a câmara, salvo se mediu em menos de metade das horas em que o radar mediu; nesse caso, o radar. Com os dados da semana, 8 segmentos com câmara ficam com o radar (entre eles o 10084 e o 11168, na Av. 25 de Abril, cuja câmara deixa de comunicar às 20h16 de 04/11), e 1 só tem radar. Escreve 3 ficheiros em `data/processed/`:

| Ficheiro | Conteúdo |
| --- | --- |
| `segmentos_hora.parquet` | `id`, `t` (início da hora), `sensor` (`Camera` ou `Radar`), `veiculos` e `vel_media_ms`, nas horas com passagens, e (ADR-0039) `limite_kmh` (o limite da via), `acima_limite` (quantas passagens medidas o passam) e `velocidades_kmh`: as passagens da hora ordenam-se pela velocidade e dividem-se em tantos grupos quantos os pontos do mapa (`carros.veiculos_por_ponto`, ≈ 20 veículos cada), e cada grupo dá a mediana da sua velocidade, em km/h. Uma passagem sem velocidade conta nos `veiculos` mas não entra nos grupos. Com os dados da semana: 194 segmentos e 21 661 horas (20 390 da câmara e 1 271 do radar), 57 772 grupos, 7,3 % das passagens acima do limite |
| `segmentos_carros.geojson` | A linha de cada um dos 194 segmentos (`reference-entities/RoadSegment.csv`), com o `id` e o sensor principal |
| `ruas_com_sensor.geojson` | As «ruas com sensor» do mapa (ADR-0034, ponto 2), com a geometria real: os 198 troços com câmara ou radar, ou junto a uma passadeira (`passadeira_segmentos.parquet`), com o `motivo` |

Nada se estima. A web desenha cerca de 1 ponto por cada `carros.veiculos_por_ponto` (20) veículos medidos nessa hora, com um teto de `carros.pontos_max` (600), a andar à velocidade medida × `carros.aceleracao` (8).

## Avenida (ADR-0044)

```bash
uv run riasense avenida   # lê RIASENSE_DATA_RAW/reference-entities e smartparking.csv, data/interim/estacionamento.parquet e falhas.parquet; corre depois do `ingerir` e do `vigiar`
```

A avenida da vista 3D, no corredor da demo (bloco `avenida` do config). O eixo de cada segmento corre perto de uma berma, por isso o centro e a largura da via medem-se nas passadeiras, entre os patamares, e interpolam-se entre elas; fora delas mantêm-se. Os lugares da RSU0030 ficam numa faixa de estacionamento de 2 m, do lado sudoeste. Cada elemento leva a `origem`: `medida`, `interpolada` ou `estimada`. Escreve 6 ficheiros em `data/processed/`:

| Ficheiro | Conteúdo |
| --- | --- |
| `avenida_estrada.geojson` | O asfalto de cada cadeia e das junções, com o centro e a largura medidos em cada passadeira (com os dados da semana: 10,6, 8,8, 9,9, 13,7 e 6,3 m) |
| `avenida_faixas.geojson` | As linhas: as bermas, o eixo e, se cada faixa ficar entre 2,5 e 3,8 m, as linhas entre faixas. A Av. de Oita fica com as faixas por confirmar com o IT |
| `avenida_passeios.geojson` | Os patamares medidos e os passeios contínuos estimados, que param junto às passadeiras |
| `avenida_lugares.geojson` | Os 10 lugares da RSU0030, ao centro da faixa de estacionamento. O 0335 fica onde foi medido, a 5,1 m dela, com a posição «por confirmar» |
| `avenida_deslocamentos.parquet` | `segmento`, `d` (metros desde o início, de `passo_m` em `passo_m`) e `desloc_m`: quanto se desloca o carro até ao centro da sua faixa (+ é para a esquerda do sentido do segmento) |
| `avenida_lugares_hora.parquet` | `lugar`, `t` e `estado` (`ocupado`, `livre` ou `desconhecido`): o último estado antes da meia hora; `desconhecido` sem eventos ainda ou com a RSU em falha (`falhas.parquet`). Com os dados da semana, 29 das 164 horas têm dados: a RSU0030 deixa de comunicar às 20h07 de 04/11 |
## Zonas (ADR-0047)

```bash
uv run riasense zonas   # lê data/interim/visitas.parquet; corre depois do `ingerir`
```

As visitas medidas por zona turística e hora, para o mapa de calor dos peões. Escreve `zonas_hora.parquet` em `data/processed/`, com `id` (a zona), `t` (o início da hora) e `visitas`: as visitas que entraram nessa hora, só na janela `periodo_dados`. Como no `segmentos_hora.parquet`, só há linha nas horas com visitas. Nada se estima: nas horas de falha, o mapa usa a ② (`sensores_virtuais.parquet`).

## Proteger

```bash
uv run riasense proteger   # lê data/interim (segmentos, passadeiras) e data/processed (sensores, passadeira_segmentos, falhas, passadeiras_osm)
```

Para cada passadeira, regride a velocidade média dos veículos nos segmentos de `passadeira_segmentos`, por intervalo de 15 min, sobre o número de travessias. Controla o volume de veículos, a hora (uma dummy por hora) e o fim de semana (ADR-0006). Os erros-padrão são robustos (Newey-West, 4 desfasamentos), porque intervalos seguidos se parecem. Os desfasamentos contam linhas e não intervalos de 15 min, e como saem os intervalos com poucos veículos há buracos na série (1,4 % de mediana; 5,3 % na SC0005). Medido a 18/11, contá-los no tempo, com a série na grelha de 15 min e os buracos a zero, ou com 8 e 16 desfasamentos, não muda nenhuma passadeira de «abranda» nem de «assinalada» (o limite superior do IC muda 0,13 km/h no máximo). Só com 32 desfasamentos mudam a SC0020 e a SC0021, que têm 116 intervalos (cerca de 1 dia). O **placebo** repete a regressão com as travessias da passadeira mais distante. Uma passadeira é **assinalada** quando o IC 95% não fica todo abaixo de 0 e as travessias médias estão na metade de cima, **exceto se tiver semáforo** (`passadeiras_osm.parquet`): aí quem para o carro é a luz, o efeito calcula-se na mesma, mas não se assinala (ADR-0024). Os resultados são associações, não causalidade. O método é o de `viabilidade/task2.py`, com a mesma seleção de segmentos: os conjuntos a ≤ 30 m coincidem nas 24 passadeiras. Ficam de fora os intervalos com menos de `min_veiculos_intervalo` veículos e os que tocam uma falha da passadeira, ou do seu placebo, na `falhas.parquet` da ①, porque sem travessias os zeros seriam falsos. Hoje são as 4 passadeiras da RSU0030, de 04/11 às 20h00 até ao fim. A ④ corre por isso depois de `riasense vigiar`. Os parâmetros estão em `config/riasense.yaml`, na secção `proteger`.

| Tabela | Colunas | Conteúdo |
| --- | --- | --- |
| `proteger_passadeiras` | `id`, `n_intervalos`, `travessias_media`, `efeito_kmh`, `ic_inf`, `ic_sup`, `abranda`, `placebo`, `placebo_efeito_kmh`, `placebo_ic_inf`, `placebo_ic_sup`, `assinalada`, `pct_acima_limite_movimentados`, `pct_acima_limite_calmos`, `semaforo` | Uma linha por passadeira. Assinaladas: nenhuma (antes do ADR-0024 eram a SC0013, a SC0020 e a SC0021, que têm semáforo). Os efeitos estão em km/h por +10 travessias no intervalo e os IC são a 95%. `placebo` é o URN da passadeira usada no placebo. As percentagens de veículos acima de `vel_limite_ms` são a média por intervalo nos intervalos movimentados (travessias ≥ quartil de cima) e calmos (≤ quartil de baixo) |
| `proteger_intervalos` | `passadeira`, `t`, `travessias`, `veiculos`, `vel_media_ms`, `pct_acima_limite` | Os intervalos de 15 min usados na regressão, para o mapa de risco potencial. As velocidades estão em m/s |

Pontos de atenção:
- A **SC0011** fica no limite: o limite superior do IC é −0,004 km/h. O `task2.py` assinalava-a porque comparava o IC arredondado a 2 casas («-0.00» é −0,0, que não é < 0). Com o valor exato, abranda.
- O IC do placebo não contém 0 em 3 passadeiras: na SC0005 o efeito é negativo, e na SC0023 e na SC0024, que partilham segmentos, é positivo. Nas outras 21 contém 0.
- Na **SC0005**, o «abrandamento» do placebo (−0,84 km/h, com as travessias da SC0014) é maior do que o efeito das travessias da própria passadeira (−0,51 km/h). O efeito desta passadeira deve apresentar-se com cautela.
- Nos intervalos calmos há mais veículos acima do limite do que nos movimentados. A comparação não desconta a hora: os intervalos calmos são sobretudo à noite.

## OpenStreetMap

```bash
uv run riasense osm   # lê data/processed/sensores.parquet e pede ao Overpass; precisa de rede e corre uma vez
```

Escreve `data/processed/passadeiras_osm.parquet` (ADR-0019), uma linha por passadeira com sensor. Emparelha cada uma com a travessia OSM mais próxima (`highway=crossing` ou com `crossing=*`, sem as passagens de nível) a ≤ `raio_max_m` (25 m); acima disso fica sem atributos. A via é a via com trânsito mais próxima da travessia (0 m quando a travessia é um nó dela), e no empate fica a de classe mais importante. As distâncias são em metros, em EPSG:3763. A cópia fica versionada: o resto do pipeline e a demo nunca chamam a rede.

| Colunas | Conteúdo |
| --- | --- |
| `id`, `osm_passadeira`, `distancia_m` | Passadeira, nó OSM emparelhado e distância |
| `tipo_passadeira`, `semaforo`, `crossing_signals`, `button_operated` | O `crossing` do nó; `semaforo` é `crossing=traffic_signals` ou `crossing:signals=yes` (decisão do utilizador, 17/11); as outras duas guardam as etiquetas `crossing:signals` e `button_operated` |
| `osm_via`, `via_nome`, `via_classe`, `maxspeed`, `faixas`, `lit` | A via; `faixas` fica nula quando o `lanes` não é um número |
| `dist_escola_m`, `dist_paragem_m` | Distância à escola (`amenity=school`, ao centro) e à paragem (`highway=bus_stop`) mais próximas |
| `fonte`, `licenca` | «OpenStreetMap (Overpass, base de …); fonte aberta, por validar com a Câmara Municipal de Aveiro» e «ODbL 1.0 · © contribuidores do OpenStreetMap» |

**Resultado (base OSM de 17/11/2026):** as 24 emparelham, com mediana de 3,2 m e máximo de 20,3 m (SC0018). A SC0023 e a SC0024 ficam no mesmo nó. **Com semáforo:** SC0011, SC0012, SC0013, SC0020 e SC0021. Quatro têm `button_operated=yes`; a SC0011 tem `no`. A SC0021 tem `crossing:signals=yes` sem `crossing=traffic_signals`, e conta como semáforo (decisão do utilizador, 17/11). Tudo a confirmar com a Câmara (pergunta 12 da #19). Vias: 13 residenciais, 7 terciárias e 4 secundárias. `lit=yes` em 22, `no` na SC0017 e sem etiqueta na SC0016. Licença: ODbL 1.0, «© contribuidores do OpenStreetMap».

## Meteorologia

```bash
uv run riasense meteo   # descarrega o arquivo Open-Meteo: é o único passo que precisa de rede
```

Escreve `data/processed/meteo.parquet`, com `t`, `chuva_mm` e `temperatura_c`. É uma série horária de 03 a 10/11 em GMT (= hora local em novembro), para as coordenadas de `fontes_externas.meteo`. A cópia fica versionada: o resto do pipeline e a demo nunca chamam a rede. Na semana dos dados houve 3 dias secos, 5 com chuva e 34,2 mm a 9/11. Fonte: «Weather data by Open-Meteo.com», CC BY 4.0.

A meteorologia só entra numa camada se melhorar o resultado (ADR-0009):

- **④ Proteger:** quando a série existe, `riasense proteger` escreve `meteo_proteger.parquet`. Para cada passadeira, tem o efeito, o IC, `abranda`, `assinalada` e o R² ajustado com e sem chuva e temperatura como controlos. Resultado: o R² ajustado sobe em média +0,007 (no máximo +0,03, na SC0014) e o efeito muda 0,01 km/h na mediana. Nenhuma passadeira muda de «abranda» nem de «assinalada». Como não melhora, fica de fora: `proteger.usar_meteo: false`.
- **① Vigiar:** fica para a #25.
- **③ Prever:** fica para a #9.

## Vigiar

```bash
uv run riasense vigiar   # lê RIASENSE_DATA_INTERIM e data/processed/sensores.parquet; escreve em RIASENSE_DATA_PROCESSED
```

Corre depois de `ingerir` e de `sensores` e não precisa de `RIASENSE_DATA_RAW`. Escreve `data/processed/falhas.parquet`, com uma linha por falha inesperada de um sensor. Cada linha tem a entidade de origem e o instante, por isso pode virar um alerta NGSI-LD (ADR-0008).

| Coluna | Conteúdo |
| --- | --- |
| `sensor` | URN do sensor. No estacionamento é o URN da RSU, como em `sensores.parquet` |
| `tipo_sensor` | `passadeira`, `zona`, `estacionamento` ou `segmento` |
| `rsu` | URN da RSU. Numa falha de rede é a RSU comum. Numa falha de dispositivo é a RSU do sensor: a 1.ª, num segmento com 2, ou nula se não tiver |
| `inicio` | Último evento antes do silêncio, ou `periodo_dados.inicio`. É o instante do alerta |
| `fim` | Primeiro evento depois do silêncio, ou `periodo_dados.fim` se o sensor não voltou |
| `duracao_h` | `fim − inicio`, em horas |
| `em_curso` | `true` quando o sensor continuava sem comunicação no fim dos dados. Nesse caso, o `fim` é o fim da janela e não o regresso do sensor |
| `horas_inesperadas` | Parte da duração em horas que costumam ter atividade. É sempre ≥ `falha_min_horas` |
| `eventos_esperados` | Eventos que a mediana dos outros dias previa nessas horas |
| `tipo` | `rede` ou `dispositivo` |
| `grupo` | Número comum às falhas de uma mesma falha de rede. Cada falha de dispositivo tem o seu |

A regra segue o GLOSSARY. Os limiares estão em `config/riasense.yaml`, na secção `vigiar`.

1. **Silêncio:** intervalo entre 2 eventos seguidos de um sensor, com pelo menos `falha_min_horas` (2 h). O início e o fim da janela comum contam como eventos.
2. **Horas com atividade:** para cada hora do silêncio, calcula-se a mediana dos eventos na mesma hora dos outros dias, sem as horas do próprio silêncio. A hora tem atividade quando a mediana chega a `esperado_min_eventos_hora` (10).
3. **Falha inesperada:** o silêncio cobre pelo menos `falha_min_horas` de horas com atividade. As outras horas são **sossego normal**: uma noite sem eventos não chega a falha. O `inicio` fica no último evento, mesmo que seja de noite, porque é o último instante em que se sabe que o sensor funcionava.
4. **Rede ou dispositivo:** em cada RSU, as falhas que começam até `agrupar_inicio_min` (15) minutos depois da primeira formam um grupo. O grupo conta a partir da primeira, e não em cadeia. Um grupo com 2 ou mais sensores é uma **falha de rede**. Uma falha sozinha é **de dispositivo**. Um segmento com 2 RSU entra no agrupamento das duas.

Decisões, tomadas com os dados de 03 a 10/11. Partem de `viabilidade/gapsC.py` e `gapsC2.py`, mas mudam o método:

- **Mediana e não média.** O estacionamento da RSU0022 e a zona turística 0001 têm rajadas de centenas de eventos numa só noite. Com a média, as outras noites, calmas, passavam a falhas: seriam 67 falhas em vez de 20, 11 delas a começar entre as 0h e as 6h.
- **As horas da própria falha não contam para o habitual.** Na falha da RSU0030, as passadeiras só têm eventos nas primeiras 29 h da semana. Se as horas sem comunicação contassem, a mediana seria 0 em quase todas as horas e a falha passaria por sossego.
- **O limiar aplica-se hora a hora, e não à soma do silêncio.** Com a soma, várias horas de noite com poucos eventos esperados chegavam a falha. Foi o que aconteceu no estudo de viabilidade com a passadeira SC0001, sem eventos a 07/11 das 0h35 às 7h27: 27 eventos esperados em 7 h de noite.
- **Os segmentos são todos vigiados.** Só cerca de 120 dos 542 chegam a 10 eventos por hora em alguma hora do dia. Os outros, sobretudo os V2X, têm poucos eventos e nunca dão falha, sem ser preciso um filtro à parte.

Limites: com uma só semana de dados, os dias úteis e o fim de semana partilham o mesmo perfil. Um domingo calmo pode por isso parecer falha (por exemplo, o estacionamento da RSU0001, de 08/11 às 7h00 até às 9h25). Um sensor sem RSU conhecida nunca dá falha de rede.

### Com e sem meteorologia (ADR-0009)

**Variante «com».** Nas horas com chuva ≥ `vigiar.chuva_min_mm` (`meteo.parquet`), o esperado de cada sensor multiplica-se pelo **fator de chuva** do seu tipo de sensor. O fator é a mediana, entre os sensores do tipo, da razão entre os eventos nessas horas e o esperado nessas horas. Fora dos silêncios. Só entra a chuva: a temperatura varia sobretudo com o ciclo diário, que o perfil por hora já desconta.

**Critério, escrito antes de correr a comparação.** A meteorologia entra na ① (`vigiar.usar_meteo: true`) só se se cumprirem as três condições:

1. A falha de rede da RSU0030 de 04/11 mantém-se: de rede, com SC0019–0022.
2. O conjunto de falhas muda, e cada falha que desaparece tem pelo menos metade das suas horas inesperadas com chuva. São falsas falhas explicadas pela chuva.
3. Não aparece nenhuma falha nova fora das horas de chuva.

Se o conjunto de falhas não mudar, a meteorologia não entra, porque não melhora. A comparação fica em `data/processed/meteo_vigiar.parquet`.

**Resultado (03 a 10/11): a meteorologia não entra (`vigiar.usar_meteo: false`).**

- Houve 29 horas com chuva ≥ 0,5 mm.
- Os fatores de chuva confirmam que a chuva baixa a atividade: 0,62 nas zonas turísticas, 0,73 nas passadeiras, 0,88 nos segmentos e 0,99 no estacionamento.
- Mesmo assim, o conjunto de falhas **não muda**: as mesmas falhas (20 na corrida original; 38 depois do ADR-0025, verificado a 17/11), sem nenhuma a desaparecer, a aparecer ou a mudar de tipo. Só baixam algumas horas inesperadas, por exemplo na SC0022 (de 86,9 h para 83,9 h).
- A falha da RSU0030 continua de rede (condição 1). Falha a condição 2, porque nada muda, e por isso não melhora.
- `falhas.parquet` fica igual.

## Agora (ADR-0030 e ADR-0032)

```bash
uv run riasense agora   # lê data/interim, sensores e passadeira_segmentos; escreve agora_base.parquet
```

Calcula as **taxas do painel «agora»**: os eventos por hora das 24 passadeiras e dos 98 segmentos junto a elas (`passadeira_segmentos.parquet`), em dias úteis e ao fim de semana. É a **base da ① do ADR-0025**: a mediana da mesma hora noutros dias, sem os silêncios longos do sensor (≥ `vigiar.silencio_longo_h`). Sem ela, as passadeiras da RSU0030, sem comunicação desde 04/11, teriam taxas quase nulas. Uma hora sem nenhum dia desse tipo usa o outro tipo. Não muda nenhum número do produto.

| Tabela | Colunas | Conteúdo |
| --- | --- | --- |
| `agora_base` | `id`, `tipo`, `rsus`, `passadeiras`, `dia_util`, `hora`, `taxa_h`, `n_dias` | Uma linha por sensor, tipo de dia e hora. `passadeiras` são as passadeiras junto ao segmento, ou a própria. `n_dias` conta os dias que entram na mediana |

**A regra «sem comunicação»** (GLOSSARY) corre na API, no módulo `riasense.agora`. Um silêncio fica sem comunicação quando a probabilidade de 0 eventos, e^(−eventos esperados), fica abaixo de `agora.prob_max` (10⁻⁶). Os eventos esperados somam a taxa de cada hora que o silêncio atravessa. A regra aplica-se a cada sensor e a cada RSU, com as suas passadeiras juntas. Às 20h de uma quarta-feira:
- a RSU0030 fica sem comunicação aos **12,6 min**, o número da #20;
- a SC0019, a SC0021 e a SC0022 ficam sem comunicação, cada uma sozinha, entre 33 e 44 min;
- a SC0020, de pouco movimento, só ao fim de cerca de 11 h. O ADR-0030 dizia 6,9 h, com a taxa das 20h a durar todo o silêncio.

**O simulador** (ADR-0032) sorteia os eventos de cada sensor por um processo de Poisson, com estas taxas e um gerador por sensor (`agora.simulador.semente`). A mesma semente dá sempre a mesma sequência, seja qual for a altura dos pedidos. Nunca copia linhas dos CSV.
- Começa às 19h50 de uma quarta-feira, depois de sortear 3 h para cada sensor ter um último dado. Anda a ×60 (`agora.simulador.velocidade`).
- O relógio mostra só a hora.

## Completar

```bash
uv run riasense completar   # lê RIASENSE_DATA_INTERIM e data/processed/sensores.parquet; escreve em RIASENSE_DATA_PROCESSED
```

**O modelo (ADR-0005), numa frase:** o sensor virtual de um sensor em falha é o perfil horário dele multiplicado pela mediana, entre os 5 vizinhos do mesmo tipo com dados, da razão entre o valor atual de cada vizinho e o perfil habitual desse vizinho, com a razão limitada a `completar.razao_max` (3). A mediana, e não a razão entre somas da viabilidade, está no ADR-0012. O estacionamento não se completa.

**O método por tipo (ADR-0046):** o método escolhe-se por tipo em `completar.metodo`. As passadeiras e as zonas turísticas usam o modelo de razão. Os segmentos usam a ridge da comparação: os mesmos 5 vizinhos, a hora do dia e o fim de semana, treinada nas horas fora da falha. Um tipo completável sem método no config é um erro.

Conta-se por hora o que cada sensor mede: as travessias nas passadeiras, as visitas (pela hora de entrada) nas zonas turísticas e os veículos nos segmentos. Um sensor só é completado, ou serve de vizinho, se tiver em média pelo menos `completar.ativo_min_eventos_h` (1) eventos/h. Isto deixa de fora os sensores sem comunicação (em falha) e cerca de 400 segmentos quase sem eventos. Os vizinhos seguem a regra de `vizinhos.parquet`, mas calculam-se outra vez a partir de `sensores.parquet`: um vizinho sem comunicação durante a falha dá lugar ao seguinte. Na demo, as 4 passadeiras da RSU0030 são vizinhas umas das outras.

Escreve 2 tabelas pequenas em `data/processed/`:

| Tabela | Colunas | Conteúdo |
| --- | --- | --- |
| `sensores_virtuais` | `id`, `tipo`, `grandeza`, `t`, `estimativa`, `inf`, `sup`, `estimado`, `fim_de_semana`, `erro_esperado`, `vizinhos` | Uma linha por sensor e por hora preenchida (`t` é o início da hora). `inf`–`sup` é o intervalo de `completar.intervalo` (80%). `estimado` é sempre verdadeiro (ADR-0008). `erro_esperado` é o erro mediano do método do tipo na simulação, num dia útil ou num fim de semana. `vizinhos` são os URN usados |
| `avaliacao_completar` | `cenario`, `tipo`, `modelo`, `dias`, `n_sensores`, `erro_mediano`, `erro_ponderado`, `ganha_referencia`, `cobertura`, `noite`, `noite_real`, `noite_media`, `noite_media_real`, `treino_h`, `teste_h` | As métricas de cada modelo por cenário, tipo e dias (`todos`, `semana`, `fim_de_semana`) |

**Avaliação.** São os dois cenários do ADR-0005, e o sensor avaliado nunca entra nas previsões do teste:

- `deixar_um_de_fora`: treina até `completar.avaliacao.deixar_um_de_fora_corte` (08/11 às 11h00, 116 h) e testa as 48 h seguintes.
- `simulacao`: treina só com as `simulacao_treino_h` (29) horas antes de `demo.incidente` e testa até ao fim dos dados (135 h). É a situação real da RSU0030.

O erro relativo de um sensor é o erro absoluto médio a dividir pela média observada no teste. `erro_mediano` é a mediana entre os sensores e `erro_ponderado` junta todas as horas de todos os sensores. Os modelos são:

- `razao`: o modelo de razão, que dá as passadeiras e as zonas turísticas.
- `razao_soma`: a razão entre somas da viabilidade (`viabilidade/task1.py`).
- `referencia`: a referência, «mesma hora, dia anterior».
- `ridge`: dá os segmentos (ADR-0046) e é comparação nos outros tipos.
- `lightgbm`: só serve de comparação.

As outras colunas:

- `ganha_referencia` conta os sensores em que o modelo erra menos do que a referência.
- `cobertura` é a fração das horas que cai no intervalo de 80% do método do tipo. Só aparece na linha desse método. Para cada sensor, o intervalo é calibrado nos outros sensores.
- `noite` e `noite_real` dão a forma diária: a média nas `completar.horas_noite` a dividir pela média de todas as horas (a mediana entre sensores).
- `noite_media` e `noite_media_real` são a média por hora nas `completar.horas_noite`, com os sensores do tipo todos juntos. É a regra do ADR-0046: um método novo não pode passar de `completar.avaliacao.noite_max_vezes_real` (1,5) vezes a real, nos dois testes.

Resultados com os dados de 03 a 10/11 (erro relativo mediano). O método é a razão nas passadeiras e nas zonas, e a ridge nos segmentos:

| Cenário | Tipo | Sensores | Método | Referência | Método, fim de semana | Referência, fim de semana |
| --- | --- | ---: | ---: | ---: | ---: | ---: |
| simulação 29 h | passadeiras | 20 | 0,36 | 0,54 | 0,52 | 0,94 |
| simulação 29 h | zonas turísticas | 11 | 0,28 | 0,43 | 0,29 | 0,48 |
| simulação 29 h | segmentos (ridge) | 143 | 0,27 | 0,38 | 0,31 | 0,49 |
| deixar um de fora | passadeiras | 20 | 0,36 | 0,62 | 0,49 | 0,74 |
| deixar um de fora | zonas turísticas | 11 | 0,28 | 0,68 | 0,29 | 0,58 |
| deixar um de fora | segmentos (ridge) | 142 | 0,22 | 0,43 | 0,23 | 0,42 |

**Segmentos: a ridge (ADR-0046).** Nos segmentos, a ridge erra menos do que o modelo de razão nos dois testes: 0,27 contra 0,33 na simulação, e 0,22 contra 0,25 em «deixar um de fora». A 17/11, os segmentos tinham ficado com a razão, porque a fração da noite da ridge (`noite`) fica 1,3 a 1,5 vezes acima da real. O ADR-0046 mede a noite em veículos por hora, com os segmentos todos juntos (`noite_media`). Por essa medida, a ridge dá 5,4 contra 4,7 reais em «deixar um de fora» e 8,0 contra 6,8 na simulação, cerca de 1,2 vezes a real. A razão fica abaixo, com 3,4 e 5,5. O limite é 1,5 vezes. Nas passadeiras, a ridge perde nos dois testes. Nas zonas, perde num deles. Por isso, esses tipos ficam com a razão. A razão entre somas passa a forma diária (0,95 e 0,98) e erra cerca de 0,02 menos do que a mediana do modelo de razão. Mesmo assim, a mediana fica nas passadeiras e nas zonas, por simplicidade e porque não deixa um vizinho degradado mandar na estimativa (ADR-0012).

**As horas sem dados a partir da 1.ª falha saem do treino.** Quando um sensor deixa de comunicar e não volta, a ① parte o silêncio em várias falhas. Antes, as horas sem dados entre as falhas e depois da última entravam no treino a zero, e a estimativa aprendia esses zeros. Agora, as horas abaixo de `ativo_min_eventos_h`, a partir da 1.ª falha do sensor, saem do treino nos dois métodos. As horas sem comunicação antes da 1.ª falha ficam, porque podem ser noites normais.

- **O que muda:** só 4 segmentos. As passadeiras, as zonas e a avaliação ficam iguais.
- **Os 3 segmentos sem comunicação.** Média das estimativas nas horas da falha, em veículos/h:

  | Segmento | Razão (antes da regra das horas sem dados) | Ridge, sem a regra | Ridge, com a regra (hoje) | O que o sensor media antes, nas mesmas horas do dia |
  | --- | --- | --- | --- | --- |
  | 10368 | 34,7 | 13,5 | **42,5** | 44,2 |
  | 10366 | 14,6 | 5,2 | **12,7** | 31,5 |
  | 11169 | 16,5 | 6,6 | **9,6** | 20,8 |

- **Contra a razão que estava no `main`, só o 10368 melhora. O 10366 e o 11169 pioram:** a ridge fica mais longe do que o sensor media do que a razão ficava (12,7 contra 14,6, e 9,6 contra 16,5). A regra das horas sem dados reduz a perda, mas não a anula. Nos outros segmentos, a ridge erra menos (ADR-0046).
- **Ressalva:** o 10366 e o 11169 continuam subestimados. Deixam de comunicar na noite de 4 para 5/11, 12 h antes da 1.ª falha, e essas horas ficam no treino, porque a ① não as distingue de uma noite calma. Recuar a regra até ao início do silêncio dava 16,5 e 17,4, mas também tirava do treino as noites normais de outros 3 segmentos.
- **A regra também apanha sensores que recuperam.** Num sensor que volta a medir depois da 1.ª falha, as horas sem dados normais depois dela (as noites) também saem do treino (`preencher`, em `completar.py`). Hoje isso só acontece no 10566: tem uma falha e 106 h com dados depois dela, e saem-lhe 34 h sem dados do treino. A estimativa dele nas 3 h da falha passa de 9,3 para 9,4 veículos/h.

**Intervalo.** Os limites são os quantis de 10% e 90% do erro relativo à estimativa, (real − estimativa) / (estimativa + `piso_eventos_h`). Calculam-se na simulação, com os resíduos do método do tipo (os da própria ridge nos segmentos), por tipo e à parte para os dias úteis e o fim de semana. À noite (estimativa ≈ 0) o intervalo fica perto de [0; 1]. Como o treino de 29 h não tem sábados nem domingos, o intervalo do fim de semana é cerca de 2 vezes mais largo.

**Que falhas se preenchem.** Por agora, só a da demo: as passadeiras de `demo.passadeiras` (SC0019–0022), de `demo.incidente.inicio` ao fim dos dados. Não se preenchem todos os sensores da RSU, porque a ① mostrou que a maior parte dos segmentos da RSU0030 continuou a enviar eventos. Quando a ① escrever as falhas, `completar.preencher_falhas(ctx, [(sensor, inicio, fim), ...])` preenche-as todas: o treino de cada sensor são as horas fora da falha, os outros sensores em falha à mesma hora não servem de vizinhos, e o estacionamento fica de fora.

**LightGBM no macOS.** Precisa da libomp (`brew install libomp`). Sem ela, a comparação fica só com a ridge e o comando mostra um aviso.

## Prever

```bash
uv run riasense prever   # lê data/interim e data/processed (sensores, vizinhos, meteo, falhas); escreve em data/processed
```

A LightGBM precisa da OpenMP. No macOS sem a `libomp` instalada, serve a que vem com o scikit-learn: `export DYLD_FALLBACK_LIBRARY_PATH="$(ls -d $PWD/.venv/lib/python3.*/site-packages/sklearn/.dylibs)"` antes de correr. Os testes que usam a LightGBM fazem skip quando ela não carrega (no Linux, falta a `libgomp1`).

A ③ prevê o valor de cada sensor daqui a **3 h e 6 h** (`prever.horizontes_h`, ADR-0027) e só entra no produto nos tipos e horizontes em que ganha à **referência** «mesma hora, dia anterior» (ADR-0010) **e** à **persistência**, «o valor de há h horas» (ADR-0027). A 1 h (`prever.horizontes_avaliacao_h`) avalia-se, mas nunca dá previsões: a 1 hora, a persistência basta. Os critérios abaixo foram fixados a 17/11, **antes de correr qualquer modelo** (1.º commit da branch `feat/9-prever`), e não se mudam depois de ver os resultados. Os parâmetros estão em `config/riasense.yaml`, na secção `prever`.

**O que se prevê.** Uma série por hora e por sensor, em 4 tipos:

| Tipo (vertical) | Valor da hora | Sensores |
| --- | --- | --- |
| `passadeira` (segurança rodoviária) | travessias/h | as 24 |
| `zona` (turismo) | visitas/h, pela hora de entrada | as 11 |
| `segmento` (mobilidade) | veículos/h | só os ativos: média no treino ≥ `segmento_min_veiculos_hora` (20) |
| `estacionamento` | ocupação: fração dos lugares da RSU ocupados a meio da hora (o último estado de cada lugar, como em `viabilidade/seriesA.py`) | as 10 RSU |

No estacionamento usa-se a ocupação e não os eventos/h: é o que a Câmara quer saber (quantos lugares vão estar ocupados), e os eventos medem só a rotação. As horas sem eventos contam como 0.

**Período de teste.** De `prever.teste_inicio` (domingo, 08/11, 11h00) ao fim da janela (terça, 10/11, 11h00): as últimas 48 h, o mesmo corte de `viabilidade/seriesA.py`. O modelo treina só com as horas anteriores.

**Referência.** O valor do mesmo sensor 24 h antes.

**Persistência** (ADR-0027). O valor do mesmo sensor há h horas, o último que se conhece quando se prevê a h horas.

**Modelo.** Um LightGBM por tipo, que junta todos os sensores do tipo. A série de cada sensor divide-se pela sua média no treino, para um só modelo servir sensores de tamanhos diferentes; a previsão volta a multiplicar-se por essa média e não desce abaixo de 0. Há um modelo por horizonte h. As variáveis derivam de h (`prever.com_horizonte`), para só usar horas já medidas: os valores do próprio sensor há h, h+1, h+2 e 24 horas, a média dos vizinhos de `vizinhos.parquet` há h e 24 horas, a hora do dia e o fim de semana. A 3 h, o modelo não vê a hora anterior. Os parâmetros estão fixos em `prever.lightgbm`, com semente 42 e sem afinação: com uma semana de dados não há horas para um período de validação.

**Variante com meteorologia.** Junta a chuva e a temperatura (`meteo_variaveis`, de `meteo.parquet`) da última hora conhecida, a hora anterior à prevista. Não se usa a meteorologia da própria hora prevista: seria informação do futuro, e na prática exigiria uma previsão meteorológica.

**Métrica.** O **erro relativo** de cada sensor no teste: o erro absoluto médio a dividir pela média real do sensor no teste, como na ② e em `seriesA.py`. Por tipo, agrega-se pela **mediana** entre sensores, que não se deixa levar por um sensor com média quase nula. Ficam de fora do agregado os sensores com média real 0 no teste. O modelo e a referência medem-se nas mesmas horas.

**Ganhar.** Num tipo e num horizonte, o modelo ganha se o seu erro relativo mediano for **menor** do que o da referência **e** do que o da persistência (ADR-0027), nas mesmas horas. Conta a variante escolhida (com ou sem meteorologia, ver abaixo). Os tipos e horizontes de `horizontes_h` que ganham saem com previsões em `previsoes.parquet`. Os que perdem ficam só com o grafo «o que antecipa o quê».

**A meteorologia melhora.** Num tipo, a meteorologia melhora se (a) o erro relativo mediano com ela for pelo menos `meteo_melhoria_min` (5%) menor do que sem ela, ou (b) mudar a decisão: o tipo ganha com meteorologia e perde sem ela. É o critério da ④: só fica se mudar uma decisão ou melhorar a métrica de forma material (ADR-0009). Se não melhorar, usa-se a variante sem meteorologia. **Ressalva:** esta escolha faz-se no próprio teste, onde depois se compara com a referência, e a cláusula (b) escolhe por construção a variante que ganha no teste. Hoje não tem efeito, porque a meteorologia não entra em nenhum dos 12 casos; uma seleção fora do teste (numa validação dentro do treino) fica no roadmap (ADR-0009).

**Falhas.** As horas em que um sensor está em falha não entram no treino nem no teste, e nelas o sensor não conta como vizinho. Enquanto a ① não estiver no `main`, sai só a RSU de `demo.incidente` (RSU0030: as passadeiras SC0019–0022 e o estacionamento), da hora do início da falha (04/11, 20h00) até ao fim dos dados. Quando a ① entrar, usa-se `falhas.parquet`.

*Nota de 17/11, depois do critério:* a ① entrou no `main` durante esta issue. Como o critério manda, o `prever` usa `falhas.parquet`: de cada falha inesperada (20 nessa altura; 38 depois do ADR-0025), incluindo a falha de rede da RSU0030, saem as horas inteiras que a falha toca. O filtro dos segmentos ativos conta só as horas sem falha.

**Grafo «o que antecipa o quê».** Calcula-se sempre: é barato e é a saída dos tipos que perdem. Cada vertical agrega-se por hora como a média, entre os sensores do tipo, do valor a dividir pela média do sensor; assim, um sensor em falha não faz descer a vertical. Retira-se o perfil típico de cada hora, em separado para os dias úteis e o fim de semana, para o ciclo diário não parecer antecipação. Depois, para cada par ordenado (origem, destino) e cada atraso de 0 a `antecipacao_atraso_max_h` (6) h, calcula-se a correlação de Pearson entre a origem na hora h e o destino na hora h + atraso, em toda a janela. Em cada par, o atraso de 1 a 6 h com a maior correlação em valor absoluto marca a aresta do grafo.

**Resultado da regra** (corrida de 17/11, em `avaliacao_prever.parquet`). Os erros são relativos, medianos por tipo, nas 48 h de teste, com a variante sem meteorologia (a meteorologia não melhora em nenhum caso):

| h | Tipo | Sensores | Referência | Persistência | Modelo | Ganha às duas |
| --- | --- | --- | --- | --- | --- | --- |
| 1 (só avaliação) | `passadeira` | 20 | 0,617 | **0,416** | 0,418 | não |
| 1 (só avaliação) | `zona` | 11 | 0,677 | **0,344** | 0,368 | não |
| 1 (só avaliação) | `segmento` | 78 | 0,374 | 0,272 | **0,218** | sim |
| 1 (só avaliação) | `estacionamento` | 9 | 0,253 | 0,222 | **0,192** | sim |
| **3** | `passadeira` | 20 | 0,617 | 0,720 | **0,557** | **sim** |
| **3** | `zona` | 11 | 0,677 | 0,715 | **0,475** | **sim** |
| **3** | `segmento` | 78 | 0,374 | 0,571 | **0,295** | **sim** |
| **3** | `estacionamento` | 9 | 0,253 | 0,293 | **0,235** | **sim** |
| 6 | `passadeira` | 20 | 0,617 | 1,085 | **0,555** | sim |
| 6 | `zona` | 11 | 0,677 | 1,287 | **0,505** | sim |
| 6 | `segmento` | 78 | 0,374 | 0,924 | **0,306** | sim |
| 6 | `estacionamento` | 9 | 0,253 | 0,410 | **0,228** | sim |

**Decisão:** a 3 h e a 6 h, o modelo ganha à referência e à persistência nos 4 tipos, por isso os 4 entram com previsões em `previsoes.parquet`. A 1 h, nas passadeiras e nas zonas, repetir o último valor é tão bom como o modelo: é o resultado que o ADR-0027 manda dizer, e por isso a 1 h fica só na avaliação. A meteorologia não muda nenhuma decisão e não melhora a métrica de forma material em nenhum tipo: fica de fora da ③ e as previsões usam a variante sem ela (ADR-0009). Faltam 4 passadeiras e 1 RSU de estacionamento, as da RSU0030, em falha durante todo o teste, e há 78 segmentos ativos em 542. Antes de a ① entrar, com só a falha da demo, as 4 decisões eram as mesmas: no estacionamento, o erro era 0,277 na referência e 0,221 no modelo. O grafo «o que antecipa o quê» também sai, mas não mostra antecipação clara (ver abaixo).

| Tabela | Colunas | Conteúdo |
| --- | --- | --- |
| `previsoes` | `horizonte_h`, `id`, `t`, `tipo`, `previsao`, `referencia`, `real`, `p10`, `p90` | Só os tipos e horizontes de `horizontes_h` que ganham. Tem uma linha por sensor e hora prevista do teste e mais as horas a seguir ao fim dos dados (até h horas depois, com `real` nulo): é o «daqui a 3 h» da demo. `t` é o início da hora prevista, e as unidades são as do tipo (tabela do início). A RSU em falha não tem linhas |
| `avaliacao_prever` | `horizonte_h`, `tipo`, `n_sensores`, `n_horas_teste`, `erro_referencia`, `erro_persistencia`, `erro_sem_meteo`, `erro_com_meteo`, `meteo_melhora`, `ganha`, `sensores_ganha`, `cobertura_intervalo`, `n_cobertura` | Uma linha por horizonte (1, 3 e 6 h) e por tipo, com os erros relativos medianos. `sensores_ganha` conta os sensores em que a variante escolhida erra menos do que a referência e a persistência. `cobertura_intervalo` é a fração dos `n_cobertura` pares (sensor, hora) do teste com o valor real entre `p10` e `p90` |
| `antecipacao` | `origem`, `destino`, `atraso_h`, `correlacao`, `n_horas`, `aresta` | Uma linha por par ordenado de verticais (pelo nome do tipo) e por atraso de 0 a 6 h. `aresta` marca, em cada par, o atraso de 1 a 6 h com maior correlação em valor absoluto |

**O intervalo de previsão (ADR-0035).** `p10` e `p90` são os quantis 0,10 e 0,90 (nível 80 %, `prever.intervalo.nivel`) dos resíduos de um **modelo de calibração**, por tipo e horizonte, somados à previsão (nas unidades do sensor, nunca abaixo de 0). O modelo de calibração é o mesmo LightGBM da variante escolhida, treinado só com as horas anteriores ao **dia de calibração**, as 24 h antes de `teste_inicio` (`prever.intervalo.calibracao_h`, de 7/11 às 11h a 8/11 às 11h), e prevê esse dia. Os sensores são os do `avaliacao_prever` em cada tipo (passadeiras sem falha, zonas, estacionamento e, nos segmentos, os 78 ativos). O resíduo é `(real − previsão) / escala`, com a **escala do modelo de calibração** (a média de cada sensor medida só com dados anteriores ao dia de calibração), para um só par de quantis servir sensores de tamanhos diferentes; `p10` e `p90` somam `q · escala` do modelo publicado à previsão. O intervalo existe a 3 e 6 h (`prever.horizontes_h`): a 1 h, que só se avalia, não há previsões nem intervalo, e a cobertura fica nula. **O dia de calibração não entra no teste, nem no treino nem na escala do modelo de calibração; o modelo publicado não muda** (continua treinado até ao teste), por isso a previsão, a referência, o erro e a decisão «ganha» saem iguais. O intervalo não entra na regra do «ganha». A cobertura mede-se nas 48 h de teste e **reporta-se sempre**, com os limites fixados antes do resultado: fora de 70 % a 90 %, a app e o PPT dizem «intervalo por calibrar», e não se retoca.

**Resultado da cobertura** (corrida de 18/11, `avaliacao_prever.parquet`; pares (sensor, hora) das 48 h de teste, fora dos limites de 70 % a 90 % a negrito):

| Tipo | 3 h | 6 h |
| --- | --- | --- |
| passadeira | 73,2 % (960) | 72,0 % (960) |
| zona | **64,4 %** (519) | **48,7 %** (519) |
| segmento | 77,7 % (3757) | 78,5 % (3754) |
| estacionamento | 83,6 % (371) | 80,5 % (365) |

**As zonas ficam fora dos limites a 3 h e a 6 h: o intervalo das zonas é «por calibrar».** Não se retocou nada. A largura mediana do intervalo das passadeiras é cerca de 2,7 vezes a previsão (as contagens são ruidosas). **Ressalva (ADR-0035):** é uma só semana e um só dia de calibração (24 h por tipo, de fim de semana: sábado 7/11 e domingo de manhã; cerca de 1900 resíduos nos segmentos e algumas centenas nos outros tipos), e o teste tem também um dia útil (35 das 48 h são de dias úteis), por isso a cobertura pode ficar abaixo do nominal. Os quantis vêm de um modelo com menos horas de treino do que o publicado.

Pontos de atenção:
- **A margem sobre a referência é pequena nas passadeiras e no estacionamento.** A 3 h, o modelo erra 10 % menos do que «a mesma hora de ontem» nas passadeiras (0,557 contra 0,617) e 7 % menos no estacionamento (0,235 contra 0,253). Nas zonas e nos segmentos, a margem é maior (30 % e 21 %). É esta a ressalva a dizer (ADR-0027).
- **O teste é curto:** vai de domingo às 11h a terça às 11h. Na segunda-feira, a referência é o domingo, o que a prejudica. O erro da referência bate com o da viabilidade (0,62 nas passadeiras e 0,68 nas zonas, em `seriesA.py`).
- **As falhas vêm da ①.** Uma falha que a ① não deteta, como um sensor que conta a menos sem perder a comunicação, entra como dado normal.
- **O «daqui a 3 h» usa o modelo avaliado.** O modelo não volta a treinar com as 48 h de teste: assim, a previsão mostrada vem do modelo com o erro medido acima.
- **Há 4 empates na ocupação.** Em 4 casos, um lugar tem dois estados no mesmo segundo: sai um carro e entra outro. Fica o estado que começa (`occupied`, sempre com duração 0). Sem este desempate, a ocupação mudava de uma corrida para a outra.
- **O grafo não mostra antecipação clara.** Passadeiras e zonas movem-se juntas: a correlação sem atraso (0,79) é maior do que com qualquer atraso, nos dois sentidos (0,70 e 0,72 a 1 h). Por isso, nenhuma delas antecipa a outra. Nos outros pares, as correlações ficam entre −0,01 e 0,43. A maior é a do estacionamento para os segmentos a 5 h (0,43, contra 0,24 sem atraso), mas no sentido contrário também chega a 0,42 a 4 h: por ser quase simétrico, aponta para um padrão comum e não para uma vertical que antecipa a outra. Com 164 horas e séries com memória, estas correlações são fracas e não se devem apresentar como antecipação.

## Validação em várias janelas (ADR-0031)

`riasense validar` corre a ② e a ③ em **4 janelas de teste** (um dia inteiro cada: 6, 7, 8 e 9/11, com treino nas horas anteriores), com outros modelos (SVR, random forest, k-NN e regressão de Poisson, ao lado do modelo atual, da referência e da persistência), com as variáveis da ③ retiradas por grupos e com a ② a 3, 5 e 8 vizinhos. **Não muda nenhum número do produto**: só escreve os dois Parquet novos. Os parâmetros e a regra estão na secção `validacao` do `config/riasense.yaml`, escrita antes do primeiro resultado.

```bash
RIASENSE_DATA_INTERIM=data/interim uv run riasense validar   # lê data/interim e data/processed; cerca de 2,5 min
```

Precisa do LightGBM (OpenMP): sem ele pára com um erro, porque o LightGBM é o modelo atual da ③ e um candidato da ②. A corrida é reprodutível: duas corridas dão ficheiros iguais byte a byte (a random forest corre num só fio).

| Tabela | Conteúdo |
| --- | --- |
| `avaliacao_modelos` | `camada` (`completar` ou `prever`), `cenario` (`janela` ou `simulacao`, a da falha da RSU0030 na ②), `janela`, `fim_de_semana`, `horizonte_h`, `tipo`, `modelo`, `papel` (`atual`, `candidato`, `referencia`, `persistencia` ou `comparacao`), `dias`, `n_sensores`, `n_horas`, `treino_h`, `erro_mediano`, `noite` e `noite_real` (só na ②). Tem 525 linhas |
| `avaliacao_variaveis` | `camada`, `analise` (`retirar_grupo`, `ganho` ou `vizinhos`), `cenario`, `janela`, `horizonte_h`, `tipo`, `modelo`, `variante` (o grupo retirado, a variável ou os vizinhos), `n_sensores`, `erro_mediano`, `erro_base`, `subida` (o erro sobe quanto, em fração) e `ganho` (a importância da variável no LightGBM). Tem 621 linhas |

**Como se lê.** A ③ valida-se nos 3 horizontes do `main` (ADR-0027): **1 h** (só avaliação), **3 h** e **6 h**. Os grupos de variáveis acompanham o horizonte: na config, `{h}`, `{h+1}` e `{h+2}` dão os atrasos curtos do próprio sensor (a 1 h, `atraso_1h` a `atraso_3h`; a 3 h, `atraso_3h` a `atraso_5h`). O erro é o erro relativo mediano entre sensores, **em média nas 4 janelas** (`dias = todos`), e não o das 48 h do período oficial, que continua a dar os números publicados.

**A regra do ADR-0031**, por tipo e, na ③, por horizonte: um candidato só passa se o erro médio for pelo menos 5 % menor do que o do modelo atual **e** se for melhor em pelo menos 3 das 4 janelas; na ② tem ainda de não errar mais do que a razão na simulação e de a fração da noite não passar da do real nem da da razão; na ③ tem de ganhar à referência e à persistência. Se passarem vários, fica o de menor erro, e se a diferença for inferior a 5 %, o mais simples. Quem passa é **proposto**, e a troca faz-se à parte.

**Resultado (corrida de 18/11, dados de 03 a 10/11):**
- **Um candidato passa: o k-NN nos segmentos a 3 h.** Erro médio 0,286 contra 0,304 do LightGBM (6 % abaixo, em 3 das 4 janelas; ganha à referência, 0,354, e à persistência, 0,541). O SVR (0,289, 4 de 4) também passa, mas a diferença para o k-NN é inferior a 5 %, por isso fica o mais simples. **Não se troca nada:** o ganho é só numa célula (segmentos a 3 h) e o ADR-0031 pede uma proposta à parte, com aprovação. Mantém-se o LightGBM, por estabilidade, e a troca vai para o roadmap.
- **Na ② nenhum passa.** Nos segmentos, a ridge, o random forest, o LightGBM e o k-NN ficam 8 a 15 % abaixo da razão (em 4 das 4 janelas), e nas zonas a ridge fica 12 % abaixo (4 de 4). Mas todos falham a condição da noite, que pede que a fração da noite não passe da do real nem da da razão **em cada janela**: nos segmentos, a ridge e o random forest falham em 4 das 4 janelas, o LightGBM em 2 e o k-NN em 1; nas zonas, a ridge falha em 3 das 4. Nas zonas a ridge também erra mais do que a razão na simulação da falha (0,294 contra 0,281). A razão fica.
- **A 1 h a persistência basta** (ADR-0027): nas passadeiras erra 0,420 contra 0,518 do LightGBM, e nas zonas 0,339 contra 0,328 (empata). A 3 e 6 h o LightGBM ganha à persistência nos 4 tipos.
- **Ressalva: o estacionamento a 6 h.** A referência «mesma hora, dia anterior» (0,247) erra menos do que o LightGBM (0,263) em média nas 4 janelas, e é melhor em 3 das 4. Nas 48 h do período oficial o LightGBM ganha (0,228 contra 0,253). É o único caso em que a referência ganha ao LightGBM em média: nos outros tipos e horizontes o LightGBM tem o erro médio mais baixo, embora a referência o bata numa das 4 janelas nas passadeiras, nos segmentos e nas zonas a 6 h, e em 2 das 4 no estacionamento a 3 h.
- **Variáveis da ③** (subida média do erro ao retirar o grupo): a 1 h, os atrasos curtos pesam muito (de 18 % nos segmentos a 57 % no estacionamento); a 3 h, os atrasos curtos pesam 4 a 13 % e a hora e o fim de semana 1 a 10 %; a 6 h pesam sobretudo o dia anterior (11 a 12 % nas passadeiras, zonas e estacionamento) e a hora (10 % nos segmentos). A 1 h, retirar o dia anterior melhora o erro nas passadeiras (−14 %), nos segmentos (−11 %) e nas zonas (−5 %).
- **Vizinhos da ②** (erro médio nas 4 janelas e na simulação da falha da RSU0030, 3 / 5 / 8): passadeiras 0,443 / 0,393 / 0,413, segmentos 0,307 / 0,290 / 0,276, zonas 0,277 / 0,285 / 0,285. Só informa: o produto fica nos 5.

**Limites** (ADR-0031): as 4 janelas são da mesma semana e não são independentes; há um só fim de semana; os candidatos correm sem afinação; os candidatos treinam só com linhas completas (na janela de 6/11, 33 h contra 57 h do LightGBM); e com 7 modelos × 4 janelas × vários tipos algum ganha por acaso, por isso a regra pede 5 % e 3 janelas em 4.

## Próximo sensor

```bash
uv run riasense proximo   # lê data/interim e avaliacao_completar.parquet (②); escreve data/processed/proximo_sensor.parquet
```

O comando ordena, por tipo, as passadeiras e as zonas turísticas com sensor e sem falha pelo erro do seu sensor virtual em «deixar um sensor de fora». Os primeiros são os locais que os 5 vizinhos explicam pior (ADR-0015). Os segmentos ficam de fora.

**Redução potencial estimada** = erro do local − mediana do tipo, e 0 quando o erro já está abaixo da mediana. **É uma hipótese, não uma medição:** assume que um 2.º sensor perto deixaria o local tão bem estimado como o sensor típico. Só se valida instalando o sensor.

**Verificar o sensor.** Um sensor cuja média diária de 07 a 09/11 cai mais de `completar.degradacao_max` (50%) face a 04 a 06/11, **relativamente à mediana do seu tipo**, sai do ranking. A comparação é relativa porque o fim de semana e a chuva de 09/11 (34 mm) baixam todos os sensores do tipo. A frase diz só que o sensor se degradou sem perder a comunicação: pode ser avaria ou uma mudança real, como obras.

| Coluna | Conteúdo |
| --- | --- |
| `id`, `tipo`, `x`, `y`, `lon`, `lat` | O sensor e a posição (de `sensores.parquet`) |
| `ordem` | Lugar no ranking do tipo (nulo em «verificar o sensor») |
| `motivo` | `ranking` ou `verificar o sensor` |
| `erro`, `mediana_tipo` | Erro relativo do sensor virtual em «deixar um de fora» e mediana do tipo |
| `reducao_potencial` | Redução potencial estimada (nula em «verificar o sensor») |
| `vizinho_m` | Distância ao sensor mais próximo do mesmo tipo (m) |
| `queda_diaria` | Queda da média diária relativa ao tipo |
| `frase` | A frase do local para o mapa (pt-PT). Nas zonas, refere a distância só se o vizinho mais próximo estiver acima da mediana do tipo. Avisa quando a atividade **subiu** ≥ `completar.subida_min` (2) vezes face ao tipo: o local fica no ranking, mas o erro pode vir dessa mudança. Isto acontece na SC0016, 2,7 vezes, e na SC0015, 2,1 vezes |

**Resultado (03 a 10/11):**
- **Passadeiras:** SC0016 (erro 0,70, redução potencial estimada 0,34), SC0024 (0,64; 0,28), SC0014 (0,58; 0,23), SC0015 e SC0008. A mediana é 0,36.
- **Zonas:** TZ0011 Estação (0,44; 0,16, com o vizinho a 510 m), TZ0008, TZ0009, TZ0010 e TZ0002. A mediana é 0,28.
- **Verificar o sensor:** a SC0023, com uma queda de 85% face às outras passadeiras.

## Luminosidade

```bash
uv run riasense luminosidade   # sem rede: só a janela dos dados, o fuso e as coordenadas do config
```

Escreve `data/processed/luminosidade.parquet` (ADR-0018), uma linha por hora: `t` (início da hora, em hora local sem fuso, como o resto do pipeline), `elevacao_graus` e `luminosidade`. A elevação do sol calcula-se com as fórmulas da NOAA («General Solar Position Calculations»), no meio de cada hora (`minuto_da_hora: 30`), em `luminosidade.latitude` e `luminosidade.longitude`. A hora local converte-se para UTC pelo `fuso_horario`. É **dia** com o sol acima do horizonte, **crepúsculo** entre 0° e `crepusculo_graus` (−6°) e **noite** abaixo disso.

É só **contexto**. O cursor de hora e o cartão da passadeira dizem «às escuras» (`/contexto/luminosidade`). O escuro não entra no risco potencial, porque isso pede um ADR próprio, nem é controlo da ④, porque o protótipo não mostrou efeito (ADR-0018, pontos 3 e 4). A frase com o fator de cerca de 2 vezes de atropelamentos no escuro **cai**: vinha do fogos.pt, que os mentores não autorizaram (ADR-0036).

**Resultado (03 a 10/11):** 91 horas de noite, 7 de crepúsculo e 66 de dia, em 164. A 07/11, o sol nasce por volta das 07h16 e põe-se por volta das 17h20, com a elevação máxima de 33,3° às 12h18 UTC. A falha da demo (04/11, 20h06) começa às escuras. Nas horas de noite fazem-se 23,4% das travessias das 24 passadeiras. O protótipo do ADR-0018 dizia 22,6%: o número de horas de noite é o mesmo, por isso a diferença deve estar nas travessias que contou.

## Risco potencial

```bash
uv run riasense risco   # lê data/interim/passadeiras e os Parquet da ①, ②, ③ e ④; escreve risco_potencial.parquet
```

O mapa de risco potencial é a vista final da ④ (ADR-0007) e calcula-se **por passadeira e por hora**, nas 24 passadeiras (ADR-0013). **Não mede acidentes.**

**risco potencial = 0,4 · exposição + 0,4 · comportamento + 0,2 · previsão** (`risco_potencial.pesos`), com cada componente em percentil de 0 a 1:

- **Exposição:** as travessias na hora, em percentil sobre todos os pares (passadeira, hora) da semana. Na falha (`falhas.parquet`), vale o sensor virtual da ② (`estimado`, `confianca = estimado`). Sem sensor virtual, fica `sem dados` e o risco potencial fica nulo: não se inventa.
- **Comportamento:** o `efeito_kmh` da ④, em percentil entre as passadeiras **sem semáforo** (quanto menos abranda, maior), fixo na semana. Nas 5 com semáforo (`semaforo`), «não se aplica»: `comportamento_pct` fica nulo e os pesos renormalizam-se para 0,67 · exposição + 0,33 · previsão, ou só a exposição sem previsão (ADR-0024). As passadeiras **assinaladas** vêm marcadas (`assinalada`), sem peso. A % acima do limite nos intervalos movimentados vai para o cartão, fora da soma.
- **Previsão:** as travessias que a ③ prevê para daqui a 3 h (o 1.º de `prever.horizontes_h`, ADR-0027): na hora t entra a previsão feita em t para t + 3 h, com o mesmo percentil global da exposição.
- **Sem previsão nessa hora** (fora das 48 h de teste da ③ e nas passadeiras da demo, que estavam em falha): os pesos da exposição e do comportamento renormalizam-se para 0,5 / 0,5 e `previsao_disponivel` é falso. A legenda diz «previsão: por testar».
- **Hora a hora:** A regra «sem previsão numérica» aplica-se **hora a hora**: a ③ só tem previsões fora da amostra nas 48 h de teste e nas passadeiras sem falha (1 020 de 3 936 horas, de 08/11 às 08h a 10/11 às 10h); nas outras, os pesos renormalizam-se para 0,5/0,5 e `previsao_disponivel` é falso. Nas 1 020 horas com previsão, os dois regimes diferem 0,033 em mediana (correlação 0,973), por isso o risco potencial é comparável entre horas.
- **Fiabilidade (①):** fica fora da soma e vai para `confianca` (`medido`, `estimado` ou `sem dados`).

| Tabela | Conteúdo |
| --- | --- |
| `risco_potencial` | `id`, `t`, `risco_potencial`, as componentes (`exposicao`, `exposicao_pct`, `comportamento_kmh`, `comportamento_pct`, `previsao`, `previsao_pct`, `previsao_disponivel`), `confianca`, `estimado`, `assinalada`, `semaforo`, `pct_acima_limite_movimentados`, `lon` e `lat`. Tem 24 passadeiras × 164 horas |
| `risco_sensibilidade` | Pesos da exposição e do comportamento de 0,3 a 0,5, de 0,1 em 0,1 (a previsão é o resto). Para cada combinação, dá a correlação de Spearman entre a ordenação das passadeiras (risco potencial médio na semana) e a da base |

**Resultado (03 a 10/11):**
- **Maior risco potencial médio:** SC0002 (0,79), SC0019 (0,78), SC0007 (0,75), SC0006 (0,71) e SC0015 (0,67). Antes do ADR-0024, as 3 primeiras eram a SC0013, a SC0011 e a SC0012, que têm semáforo: era um artefacto da métrica. A Spearman com a ordenação antiga é 0,796. **Ressalva:** a SC0019 tem só cerca de 29 h de dados.
- **Sensibilidade:** a ordenação quase não muda com os pesos. A correlação de Spearman mínima é 0,984, em 9 combinações.
- **Confiança:** 540 horas `estimado` (SC0019–0022 desde 04/11 às 20h) e nenhuma `sem dados`. A previsão existe em 980 das 3 936 horas.

## Coerência temporal com a ANEPC (ADR-0036)

```bash
export RIASENSE_DATA_ANEPC=/caminho/para/anepc   # por omissão, data/external/anepc/ (fora do git)
uv run riasense anepc   # lê data/processed/risco_potencial.parquet; descarrega o que falta (com rede); escreve validacao_anepc.parquet
```

Um **teste de coerência**, e não uma validação: as horas em que o risco potencial é mais alto são as horas em que há mais atropelamentos? A fonte é só o arquivo público da ANEPC de 2016 a 05/07/2020 ([centraldedados/protecao_civil](https://github.com/centraldedados/protecao_civil), raspado do prociv.pt). **Não tem licença declarada** (o `datapackage.json` do repositório diz PDDL-1.0, mas a fonte não declara nenhuma); usa-se com a autorização dos mentores do checkpoint de 18/11 (pergunta 7) e declara-se no relatório. O fogos.pt, que o ADR-0017 propunha, não foi autorizado e não se usa.

- **Os CSV.** Os 5 ficheiros (cerca de 218 MB) descarregam-se do commit fixado em `fontes_externas.anepc`, e o SHA-256 de cada um, também no config, verifica-se na descarga e em **cada corrida**. Ficam fora do git. Se um não bater, o comando recusa-se a correr e diz qual.
- **O que se conta.** `Natureza` = «Atropelamento rodoviário» (o ferroviário fica fora), sem duplicados de `Numero`, em 3 âmbitos: concelho de Aveiro (91), distrito (700) e Portugal (10 329, só referência). Os ficheiros têm 2 formatos de data (dd/mm/aaaa em 2016 a 2018 e ISO em 2019 e 2020, mas 6 dos 904 atropelamentos de 2020 vêm em dd/mm/aaaa); lêem-se os dois, e as linhas de data ilegível descartam-se e contam-se (a corrida de 18/11 não teve nenhuma).
- **A medida.** As 24 contagens por hora do dia contra o perfil horário do risco potencial (a média por hora do dia de `risco_potencial` nas 24 passadeiras e na semana) e contra o da exposição sozinha (`exposicao_pct`). Pearson e Spearman, com **IC de 95 %** por bootstrap dos atropelamentos (2000 reamostragens, semente 42), e a diferença risco − exposição com o IC das mesmas reamostragens.
- **A regra de leitura (ADR-0036, ponto 5).** «Coerente» se, no distrito, o Spearman do risco for ≥ 0,5 e o limite inferior do IC > 0. «O risco acrescenta à exposição» só se o IC da diferença ficar todo acima de 0; se não, diz-se que **o risco potencial não acompanha os atropelamentos melhor do que a exposição sozinha**. O concelho (91) sai sempre, com o IC, mas não sustenta a frase.

`validacao_anepc.parquet` tem dois quadros (coluna `quadro`): `perfil` (por `ambito` e `hora` do dia: `atropelamentos`, `risco_potencial` e `exposicao_pct` médios) e `correlacao` (por `ambito`, `medida` e `contra`: `valor`, `ic_inf`, `ic_sup`, e `leitura` no âmbito da leitura). A coluna `n` é o número de atropelamentos do âmbito. Só se versiona este agregado.

**Resultado (corrida de 18/11).** Spearman com o risco potencial, IC de 95 % entre parênteses:

| Âmbito | Atropelamentos | Risco | Exposição sozinha | Risco − exposição |
| --- | --- | --- | --- | --- |
| Concelho de Aveiro | 91 | 0,664 (0,439 a 0,722) | 0,692 (0,462 a 0,744) | −0,028 (−0,052 a +0,006) |
| **Distrito de Aveiro** | 700 | **0,754 (0,684 a 0,780)** | 0,778 (0,707 a 0,804) | −0,024 (−0,039 a −0,009) |
| Portugal (referência) | 10 329 | 0,783 (0,759 a 0,793) | 0,817 (0,797 a 0,826) | −0,035 (−0,041 a −0,028) |

- **É coerente** (no distrito, 0,754 ≥ 0,5 e o limite inferior do IC é 0,684): as horas de maior risco potencial acompanham as horas dos atropelamentos de 2016 a 2020. O pico é às 17h–19h (75, 112 e 86 no distrito).
- **O risco não acompanha melhor do que a exposição sozinha**: o IC da diferença fica abaixo de 0 no distrito e no país, ou seja, a exposição sozinha acompanha ligeiramente melhor (0,78 contra 0,75 no distrito). Não se diz que o comportamento ou a previsão acrescentam alguma coisa. No concelho, o IC inclui 0.
- **Ressalvas** (ADR-0036, ponto 8): as épocas diferem (atropelamentos de 2016 a 2020, todas as estações; risco de uma semana de novembro de 2026); quase tudo segue a atividade da cidade ao longo do dia, por isso uma boa correlação por hora **não mostra** que o risco potencial encontre os sítios perigosos; são 24 pontos vizinhos e o IC só mede a incerteza das contagens, não a do perfil do risco; a hora do ficheiro assume-se local e as coordenadas são centroides, por isso não há validação por passadeira.
- **Aviso, em tudo o que usar este resultado:** «Dados recolhidos de fontes abertas, usados só para contexto e coerência. Carecem de validação junto das entidades responsáveis.»
