# Os atributos de cada passadeira e da via vêm do OpenStreetMap; o semáforo separa as passadeiras onde a ④ se aplica

Status: proposto (17/11/2026). A contagem dos semáforos foi corrigida a 18/11 (#107): são 5 (ADR-0024).

A ④ diz **que** os carros abrandam pouco nalgumas passadeiras, mas não diz **porquê**. O OpenStreetMap (ODbL, já usado no mapa, ADR-0014) tem, no centro de Aveiro, cerca de 1000 passadeiras com o tipo (`crossing`) e as vias com a classe, o `maxspeed`, as faixas e o `lit`.

## O que o protótipo mostrou (17/11, fora do `main`)

- **As 24 passadeiras do Living Lab emparelham** com um nó OSM a ≤ 25 m (mediana de cerca de 3 m).
- **4 têm `crossing=traffic_signals`:** a SC0011, a SC0012, a SC0013 e a SC0020. A SC0021 tem `crossing:signals=yes` sem `crossing=traffic_signals` e conta também (decisão do utilizador, 17/11; ADR-0024), por isso o `semaforo` marca **5**. As 4 com `crossing=traffic_signals` ficam entre as 4 que menos abrandam (de −0,10 a −0,21 km/h por +10 travessias, contra uma mediana de −0,61 nas outras). **Ressalva:** a SC0020 (−0,212) e a 5.ª, a SC0019 (−0,220), distam só 0,008 km/h e têm ambas cerca de 29 h de dados (#66), e a probabilidade «1 em 10 626» foi calculada depois de ver os dados. O argumento que sustenta a decisão é o **mecanismo**: num semáforo, quem para o carro é a luz e não o número de peões, por isso a métrica da ④ (a velocidade desce com mais travessias) **não se aplica**. E, pelo peso do comportamento no ADR-0013, essas passadeiras ficam no topo do risco potencial (issue #67).
- Classe da via: 13 residenciais, 7 terciárias, 4 secundárias. As secundárias abrandam todas (mediana −0,68).
- A distância à escola e à paragem não se relaciona com o efeito (Spearman −0,14 e −0,09).
- `lit=yes` aparece em 23 das 24 vias.

## Decisão

1. Extrair **uma vez, com rede**, para cada passadeira com sensor: o tipo de passadeira e o **semáforo**, a classe da via, o `maxspeed`, as faixas, o `lit`, e a distância à escola e à paragem mais próximas. O resultado fica num Parquet versionado (`passadeiras_osm.parquet`), e a demo continua offline.
2. O **semáforo é um atributo de cálculo**, e não só de explicação: a ④ e o risco potencial têm de tratar à parte as passadeiras com semáforo. **Como** tratá-las decide o **ADR-0024** (!62), depois da submissão (issue #67).
3. Os outros atributos servem para o cartão e para a frase da ④ («via residencial, 2 faixas, sem semáforo»), e para uma tabela descritiva.

## Consequências

- **Aviso obrigatório, no texto, no pitch e na legenda:** «Dados recolhidos de fontes abertas, usados só para contexto e coerência. Carecem de validação junto das entidades responsáveis» (aqui, a Câmara Municipal de Aveiro, que gere a sinalização e os limites de velocidade). A lista das passadeiras com semáforo confirma-se com a Câmara, porque uma etiqueta errada no OSM muda a ④.
- Com 24 passadeiras, a tabela por classe de via é descritiva e di-lo.
- **Licença:** o `passadeiras_osm.parquet` é uma base derivada do OSM e mantém a **ODbL** (partilha nas mesmas condições) e a atribuição «© contribuidores do OpenStreetMap», tal como o extrato do mapa (ADR-0014), embora o repositório seja MIT. O README dos dados di-lo. A atribuição aparece no cartão, como no mapa.
- Se a mais próxima estiver a mais de 25 m, a passadeira fica sem atributos. Hoje não acontece em nenhuma.
