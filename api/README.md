# api

API FastAPI fina sobre os Parquet de `data/processed/` (ADR-0003): sem base de dados e só de leitura. A documentação interativa está em `/docs`.

```bash
uv run uvicorn app:app --app-dir api --port 8000   # ou: docker compose up api
```

| Endpoint | Camada | Parquet | Filtros |
| --- | --- | --- | --- |
| `GET /health`, `GET /ready` | — | — | — |
| `GET /sensores` | sensores | `sensores` | `sensor`, `tipo` (passadeira, zona, segmento, estacionamento) |
| `GET /mapa/passadeiras` | mapa: as passadeiras com a forma real (ADR-0038) | `passadeiras.geojson` (passo `sensores`), um polígono por passadeira com `id`, `crosswalk`, `nome` e `rsu`; 503 «por calcular» sem o ficheiro | — |
| `GET /vigiar/falhas` | ① | `falhas` | `sensor`, `desde`, `ate` (uma falha entra se o período se sobrepuser) |
| `GET /completar/sensores-virtuais` | ② | `sensores_virtuais` | `sensor`, `desde`, `ate` |
| `GET /prever/previsoes` | ③, uma linha por horizonte (ADR-0027), com o intervalo `p10`–`p90` (ADR-0035) | `previsoes` | `sensor`, `desde`, `ate`, `horizonte_h` |
| `GET /proteger/passadeiras` | ④ | `proteger_passadeiras` | `sensor` |
| `GET /proteger/intervalos` | ④ | `proteger_intervalos` | `sensor`, `desde`, `ate` |
| `GET /proteger/risco-potencial` | ④, mapa de risco potencial (ADR-0013) | `risco_potencial` | `sensor`, `desde`, `ate` (por passadeira e hora) |
| `GET /completar/proximo-sensor` | ②, próximo sensor (ADR-0015) | `proximo_sensor` | `tipo` (passadeira, zona), `motivo` (`ranking`, `verificar o sensor`) |
| `GET /completar/avaliacao` | ②, avaliação | `avaliacao_completar` | `tipo` (passadeira, zona, segmento), `cenario` (`deixar_um_de_fora`, `simulacao`), `dias` (`todos`, `semana`, `fim_de_semana`) |
| `GET /prever/avaliacao` | ③, avaliação e regra (ADR-0010, ADR-0027) | `avaliacao_prever` | `tipo` (passadeira, zona, segmento, estacionamento), `horizonte_h` |
| `GET /mapa/ruas-com-sensor` | mapa, as ruas com sensor (ADR-0034, ponto 2) | `ruas_com_sensor.geojson` | — (devolve o GeoJSON) |
| `GET /mapa/segmentos-carros` | mapa, a geometria dos 194 segmentos com câmara ou radar (ADR-0034) | `segmentos_carros.geojson` | — (devolve o GeoJSON) |
| `GET /mapa/carros` | mapa, camada «Trânsito»: as passagens medidas por segmento e hora (ADR-0034), com o limite da via, as passagens acima dele e a mediana de cada grupo de ≈ 20 veículos (ADR-0039) | `segmentos_hora` | `sensor`, `desde`, `ate` (pede-se uma hora de cada vez) |
| `GET /mapa/avenida/{camada}` | vista 3D, a avenida acertada pelas passadeiras medidas (ADR-0044); `camada` é `estrada`, `faixas`, `passeios` ou `lugares` | `avenida_{camada}.geojson` (passo `avenida`), cada elemento com a `origem` (`medida`, `interpolada` ou `estimada`); 503 «por calcular» sem o ficheiro | — (devolve o GeoJSON) |
| `GET /mapa/avenida/lugares-hora` | vista 3D, o estado de cada lugar por hora: `ocupado`, `livre` ou `desconhecido` (ADR-0044) | `avenida_lugares_hora` | `sensor` (o lugar), `desde`, `ate` (pede-se uma hora de cada vez) |
| `GET /mapa/avenida/deslocamentos` | vista 3D, quanto se desloca cada segmento do corredor até ao centro da sua faixa (ADR-0044) | `avenida_deslocamentos.parquet`, em JSON compacto `{segmento: {passo, desloc_m: [...]}}`, de `passo` em `passo` metros desde o início; + é para a esquerda do sentido do segmento | — (só os 14 segmentos do corredor, sem paginação) |
| `GET /mapa/zonas-hora` | mapa, «Calor · peões»: as visitas medidas por zona turística e hora, pela hora de entrada (ADR-0047) | `zonas_hora` (passo `zonas`) | `sensor`, `desde`, `ate` (pede-se uma hora de cada vez) |
| `GET /mapa/calor/maximos` | mapa de calor, a escala fixa na semana (ADR-0047, ponto 4): o máximo por hora de cada tipo, medido ou estimado pela ② nas falhas | `proteger_intervalos` (travessias somadas por hora), `zonas_hora`, `segmentos_hora` e `sensores_virtuais`; 503 «por calcular» se faltar um | — (`{passadeiras, zonas, segmentos}`, cada um com `maximo`, `medido`, `estimado` e `unidade`) |
| `GET /contexto/luminosidade` | contexto «às escuras» (ADR-0018), fora do risco potencial | `luminosidade` | `desde`, `ate` (uma linha por hora: `elevacao_graus` e `luminosidade` = `dia`, `crepusculo` ou `noite`) |
| `GET /agora/disponivel`, `GET /agora`, `POST /agora/simulador/iniciar`, `POST /agora/simulador/falha`, `POST /agora/simulador/repor` | ①, painel «agora» (ADR-0030, ADR-0032) | `agora_base`, só para as taxas | — (ver abaixo) |
| `GET /ao-vivo/disponivel`, `POST /ao-vivo/ligar`, `GET /ao-vivo`, `POST /ao-vivo/desligar` | modo «Ao vivo» (ADR-0049) | nenhum: o socket.io público do Living Lab, só em memória | — (ver abaixo) |

- **`sensor`:** a forma curta (`SmartCrosswalk:0019`) ou o URN completo.
- **Listas fechadas:** `tipo`, `motivo`, `cenario` e `dias` só aceitam os valores da tabela; outro valor dá 422. No próximo sensor, a `reducao_potencial` é uma hipótese e não uma medição (ADR-0015). O resultado vem ordenado por `tipo` e `ordem`, com os «verificar o sensor» no fim.
- **`desde` e `ate`:** ISO 8601, inclusive. Sem fuso, contam como UTC, que em novembro é a hora local. Com fuso, convertem-se para UTC.
- **Paginação:** `limite` (1 a 10 000, por omissão 1000) e `deslocamento`.
- **Resposta:** `{"dados": [...], "n", "limite", "deslocamento"}`. As datas vêm em ISO 8601, e NaN vem como `null`.
- **Erros:** uma entrada inválida dá 422. Uma camada cujo Parquet ainda não existe dá 503, com `{"estado": "por calcular", "motivo": "… corre riasense <passo>"}`.
- **CORS:** está aberto só para GET, porque os dados são públicos e o mapa corre noutra porta.

## Painel «agora» (ADR-0030 e ADR-0032)

O painel corre a ① ao vivo sobre o **simulador de dados fictícios**, porque o IT recusou o acesso em tempo real. Vem desligado (`agora.ativo: false`): com ele desligado, `GET /agora/disponivel` e `GET /agora` dão 503 com `{"estado": "desligado"}`, e a web não mostra o botão.

**Ligar o painel na demo:**
1. Em `config/riasense.yaml`, `agora.ativo: true` (e `agora.fonte: simulador`, que é o valor por omissão).
2. Correr `uv run riasense agora` uma vez, se o `data/processed/agora_base.parquet` não existir (está versionado).
3. Reiniciar a API (`docker compose up -d --build api`, ou o `uvicorn`): o config lê-se em cada pedido, mas o simulador é por processo.
4. Na web aparece o botão «Simular falha». Ao abrir o painel, o relógio começa às 19h50 de uma quarta-feira; «Cortar a RSU0030» dá o alerta «sem comunicação» (âmbar) ao fim de cerca de 8 s (cerca de 13 s se se carregar às 20h), e passa a «falha» (vermelho) quando o silêncio cumpre a falha inesperada (2 h simuladas). «Repor» volta às 19h50.

- **`GET /agora/disponivel`** só diz se o painel existe (`disponivel`, `fonte`, `etiqueta`). **Não cria o simulador**, por isso o relógio não anda enquanto a demo mostra os outros separadores.
- **`POST /agora/simulador/iniciar`** é o que a web chama ao abrir o painel: cria o simulador às 19h50, com a semente do config, e devolve o estado.
- **`GET /agora`** devolve `fonte` (`simulador`), `etiqueta`, `hora_simulada` (só a hora, por exemplo «19h50», sem data), `velocidade`, `leitura_ms`, `falha` (`rsu` e `ativa`), `sensores` e `rsus`. Cada sensor ou RSU traz `ultimo_dado_min`, `limite_min` (o silêncio ao fim do qual fica sem comunicação), `calado` (o alerta rápido, âmbar, «sem comunicação») e `falha` (o silêncio já dura `vigiar.falha_min_horas`: vermelho, ADR-0033).
- **`POST /agora/simulador/falha`** deixa sem comunicação as passadeiras e os segmentos da RSU de `demo.incidente`. **`POST /agora/simulador/repor`** recria o simulador: volta às 19h50, com a mesma semente e sem a falha. Os dois devolvem o estado.
- **Tudo em memória:** o simulador cria-se ao abrir o painel (ou no 1.º `GET /agora`) a partir de `agora_base.parquet`, e não grava nada em disco. Um trinco serializa os pedidos que lhe mexem. Reiniciar a API apaga o estado.
- **Outros 503:** sem `agora_base.parquet`, dá «por calcular» (`riasense agora`). Com `agora.fonte: context_broker`, dá «sem ligação», porque essa fonte precisa da autorização do IT.

## Modo «Ao vivo» (ADR-0049)

O que os sensores do Aveiro Living Lab detetam **agora**, lido do socket.io público em `ao_vivo.url` (Engine.IO 4: começa por polling e sobe para websocket; o só-websocket falha). A web nunca fala com o Living Lab: pede à API.

- **`ao_vivo.ativo: true`** (por omissão) mostra o botão na janela do indicador. `false` serve só para o esconder em caso de avaria: os 3 pontos de acesso dão 503 com `{"estado": "desligado"}`.
- **Nada liga antes do clique.** `GET /ao-vivo/disponivel` só abre e fecha uma ligação TCP ao servidor (diz `com rede` ou `sem rede`). `POST /ao-vivo/ligar` volta a ver se há rede **antes** de criar o cliente do socket.io: sem rede, devolve `sem rede` e não liga.
- **`GET /ao-vivo`**, ao ritmo de `ao_vivo.intervalo_s` (1 s), devolve `estado` (`a ligar`, `ligado`, `sem rede`, `ligação perdida`, `desligado`), `etiqueta`, `intervalo_s` e, ligado, o último retrato reduzido: `estacoes` (as RSU com `active`: `id`, `lat`, `lon`, `ativa`, `detecoes`, `ultimo_dado`) e `detecoes` (`id`, `estacao`, `lat`, `lon` ajustadas à via quando existem, `classe`, `sensor`, `velocidade` em m/s, `direcao`).
- **`POST /ao-vivo/desligar`** fecha a ligação e esquece o retrato. Se a web deixar de pedir durante `ao_vivo.inativo_s` (30 s), a ligação fecha-se sozinha. Se o servidor a fechar, não se religa: a leitura diz `ligação perdida` e a web sai do modo.
- **Nada em disco nem nos registos:** guarda-se só o último retrato, em memória; o cliente do socket.io corre sem logger. Os testes usam retratos sintéticos (`tests/test_ao_vivo.py`), sem rede.

## Exportação NGSI-LD (ADR-0008)

`uv run riasense exportar` converte os resultados da ② e da ① em NGSI-LD, para o IT os carregar no ATCLL Vision. Escreve 2 ficheiros em `data/processed/ngsi-ld/`, versionados:

- **`sensores_virtuais.jsonld`:** representação temporal, com uma entidade por sensor de origem (o mesmo URN e o mesmo tipo do Living Lab). O atributo `estimatedCount` tem uma instância por hora, com `observedAt`, `estimated: true`, o intervalo (`lowerBound`, `upperBound`), a grandeza, o fim de semana, o erro esperado e os vizinhos usados. Carrega-se com `POST /temporal/entities`.
- **`falhas.jsonld`:** uma entidade `Alert` (Smart Data Models) por falha, para o painel de notificações. `alertSource` aponta para o sensor, `validFrom` e `validTo` delimitam a falha, `subCategory` é `falhaDeRede` ou `falhaDeDispositivo` e `roadSideUnit` é a RSU, quando se conhece.

A conversão é **sem perda**: `riasense.exportar.importar_*` reconstrói os Parquet a partir do JSON-LD, e `tests/test_exportar.py` compara-os com os versionados. As horas vão em UTC com «Z», com a fração de segundo quando existe.

**Como carregar no Context Broker.**
- **Sensores virtuais:** a entidade tem **o mesmo URN** do sensor real, para preservar a origem. Por isso, o `estimatedCount` carrega-se como **acrescentar atributos** (`POST /entities/{id}/attrs`, ou a variante temporal `POST /temporal/entities/{id}/attrs`), **nunca como criar entidade**. Um `POST /entities` daria conflito ou sobreporia a entidade real.
- **Falhas:** os `Alert` carregam-se como entidades novas (`POST /entities`).
- O endpoint exato depende da versão do broker do IT: está **a confirmar com o IT** (pergunta para a #19).

**Validação.** Os testes verificam só a **estrutura** das entidades: `id` em URN, `@context`, Property com `value`, Relationship com `object` em URN e `observedAt` em ISO 8601 com Z. Não houve validação contra um broker NGSI-LD nem contra o esquema oficial.

Exemplo de um sensor virtual (SC0019, 1.ª hora da falha da RSU0030):

```json
{
  "id": "urn:ngsi-ld:SmartCrosswalk:0019",
  "type": "SmartCrosswalk",
  "@context": [
    "https://uri.etsi.org/ngsi-ld/v1/ngsi-ld-core-context.jsonld"
  ],
  "riasenseType": {
    "type": "Property",
    "value": "passadeira"
  },
  "estimatedCount": [
    {
      "type": "Property",
      "value": 28.571428571428573,
      "observedAt": "2026-11-04T20:00:00Z",
      "estimated": {
        "type": "Property",
        "value": true
      },
      "lowerBound": {
        "type": "Property",
        "value": 14.545233082706757
      },
      "upperBound": {
        "type": "Property",
        "value": 62.377650572424116
      },
      "quantity": {
        "type": "Property",
        "value": "travessias"
      },
      "weekend": {
        "type": "Property",
        "value": false
      },
      "expectedError": {
        "type": "Property",
        "value": 0.3216004246866879
      },
      "neighbours": {
        "type": "Property",
        "value": [
          "urn:ngsi-ld:SmartCrosswalk:0024",
          "urn:ngsi-ld:SmartCrosswalk:0023",
          "urn:ngsi-ld:SmartCrosswalk:0007",
          "urn:ngsi-ld:SmartCrosswalk:0008",
          "urn:ngsi-ld:SmartCrosswalk:0010"
        ]
      }
    }
  ]
}
```

Exemplo de uma falha (a falha de rede da RSU0030, na SC0019):

```json
{
  "id": "urn:ngsi-ld:Alert:riasense:SmartCrosswalk:0019:2026-11-04T20:06:29Z",
  "type": "Alert",
  "@context": [
    "https://uri.etsi.org/ngsi-ld/v1/ngsi-ld-core-context.jsonld"
  ],
  "category": {
    "type": "Property",
    "value": "riasense"
  },
  "subCategory": {
    "type": "Property",
    "value": "falhaDeRede"
  },
  "description": {
    "type": "Property",
    "value": "Falha inesperada (de rede) no sensor"
  },
  "alertSource": {
    "type": "Relationship",
    "object": "urn:ngsi-ld:SmartCrosswalk:0019"
  },
  "dateIssued": {
    "type": "Property",
    "value": "2026-11-04T20:06:29Z"
  },
  "validFrom": {
    "type": "Property",
    "value": "2026-11-04T20:06:29Z"
  },
  "validTo": {
    "type": "Property",
    "value": "2026-11-10T11:00:00Z"
  },
  "sensorKind": {
    "type": "Property",
    "value": "passadeira"
  },
  "durationHours": {
    "type": "Property",
    "value": 134.89
  },
  "ongoing": {
    "type": "Property",
    "value": true
  },
  "unexpectedHours": {
    "type": "Property",
    "value": 80.89
  },
  "expectedEvents": {
    "type": "Property",
    "value": 7894.3
  },
  "group": {
    "type": "Property",
    "value": 3
  },
  "roadSideUnit": {
    "type": "Relationship",
    "object": "urn:ngsi-ld:RoadSideUnit:0030"
  }
}
```
