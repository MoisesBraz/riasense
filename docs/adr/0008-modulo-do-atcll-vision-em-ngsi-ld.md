# A RiaSense é um módulo do ATCLL Vision, com saídas em NGSI-LD

O IT já tem o ATCLL Vision (tempo real, histórico e replay das verticais). A RiaSense não compete com ele: produz entidades no mesmo formato NGSI-LD dos dados de origem, para o IT as poder mostrar. Os sensores virtuais saem como entidades com `estimated: true` e um intervalo, e as falhas da ① saem como alertas para o painel de notificações. O nosso mapa serve a demo, mas o argumento de adoção é «zero apps novas para o IT».

## Consequências

- Os Parquet de `data/processed/` têm de se converter em NGSI-LD sem perda: cada linha precisa de entidade de origem (`urn:ngsi-ld:...`), instante e marca de estimado.
