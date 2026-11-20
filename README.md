# RiaSense

> «RiaSense transforma o Living Lab num sistema que se vigia, se completa, prevê e protege.»

Aveiro Tech City Hackathon 2026 · Desafio #1 «Smart Aveiro: From Data to Action» (Câmara Municipal de Aveiro e Instituto de Telecomunicações).

## A RiaSense em quatro camadas

| Camada | O que faz | Para quem |
| --- | --- | --- |
| **① Vigiar** | Deteta falhas dos sensores e distingue as falhas de rede das falhas de dispositivo | IT |
| **② Completar** | Sensores virtuais: estima peões e tráfego onde o sensor falhou ou não existe, e indica onde pôr o próximo | IT |
| **③ Prever** | Prevê o que vai acontecer daqui a 3 h nas 4 verticais (e a 6 h). O grafo entre verticais não mostrou antecipação com uma semana de dados | Câmara |
| **④ Proteger** | Mostra se os carros abrandam quando há peões. Termina no **mapa de risco potencial** | Câmara |

Os dados são do Living Lab de Aveiro (ATCLL): tráfego, passadeiras, afluência pedonal e estacionamento. A RiaSense funciona como módulo do ATCLL Vision: as saídas seguem o formato NGSI-LD dos dados de origem.

A ideia completa, com a evidência, a demo, os critérios e os limites, está em **[docs/ideia-riasense.md](docs/ideia-riasense.md)**. A ideia anterior (RiaDock, cargas e descargas) está arquivada em [docs/arquivo/riadock/](docs/arquivo/riadock/).

## A RiaSense em números

São os números de [docs/ideia-riasense.md](docs/ideia-riasense.md), de uma semana de dados (03 a 10/11/2026).

- **① Vigiar:** 38 falhas inesperadas: 11 de rede, em 2 incidentes da RSU0030, e 27 de dispositivo. A 04/11, entre as 20h06 e as 20h16, a RSU0030 deixou sem comunicação as quatro passadeiras, o estacionamento e quatro segmentos (dois deles só durante cerca de um dia). As passadeiras e o estacionamento ficam sem comunicação cerca de 135 h. Desde o ADR-0025, a base do «normal» de cada sensor não conta os silêncios longos, e um sensor de pouco movimento que fica sem comunicação de vez também é falha.
- **② Completar:** erro relativo mediano do sensor virtual ao deixar um sensor de fora: 0,36 nas passadeiras, 0,28 nas zonas e 0,25 nos segmentos, contra 0,62, 0,68 e 0,43 da referência «mesma hora, dia anterior».
- **③ Prever:** a 3 h, ganha à referência «mesma hora de ontem» e à persistência nos 4 tipos de sensor, por exemplo 0,56 contra 0,62 e 0,72 nas passadeiras. A margem sobre a referência é pequena nas passadeiras (−10 %) e no estacionamento (−7 %). A 1 h, repetir o último valor basta, por isso a 1 h fica só na avaliação (ADR-0027).
- **④ Proteger:** os carros abrandam em 19 de 24 passadeiras. Nenhuma fica assinalada. Das cinco sem abrandamento claro, três (a SC0013, a SC0020 e a SC0021) têm semáforo (OpenStreetMap, por validar com a Câmara), tal como a SC0011 e a SC0012: aí quem trava é a luz, o abrandamento não se mede da mesma forma e não se assinalam (ADR-0024). As outras duas, a SC0015 e a SC0022, não têm semáforo, mas têm poucas travessias para ficarem assinaladas. Na Av. 25 de Abril, cerca de 1 em cada 4 veículos passa acima do limite nos intervalos com mais peões (23–24%), e 1 em cada 3 nos mais calmos (33–37%), em 29 h de dados (de 03/11 às 15h até à falha, a 04/11 às 20h).
- **Mapa de risco potencial:** só pontos com sensor e não mede acidentes.

## Estado

Versão para a submissão de 20/11/2026. Corre sobre os dados reais:

- **Pipeline das 4 camadas** (`riasense ingerir` … `exportar`, ver [pipeline/README.md](pipeline/README.md)), com os resultados versionados em `data/processed/`.
- **Mapa de risco potencial** por passadeira e hora (ADR-0013) e o ranking de **onde pôr o próximo sensor** (ADR-0015).
- **API** FastAPI só de leitura ([api/README.md](api/README.md)) e **web** com os 4 separadores e o mapa offline em PMTiles ([web/README.md](web/README.md), ADR-0014).
- **Exportação NGSI-LD** para o ATCLL Vision, em `data/processed/ngsi-ld/` (ADR-0008).
- **Vídeo de reserva da demo:** [entregaveis/riasense-demo.mp4](entregaveis/riasense-demo.mp4).

O que fica para depois:
- **Roadmap:** o roadmap de [docs/ideia-riasense.md](docs/ideia-riasense.md) (Waze for Cities, BEAV, mais semanas de dados).
- **Sensores virtuais:** só se preenche a falha da demo. Preencher todas as falhas detetadas pela ① fica no roadmap.
- **Fuso horário:** o código trata a hora UTC como hora local (ver «Outra cidade»).
- **Testes:** correm-se à mão (ver «Convenções e testes»).

## Os dados desta cópia

Esta cópia **não inclui a pasta `data/`**. Os dados do Living Lab de Aveiro (ATCLL, Instituto de Telecomunicações) foram cedidos só aos participantes do hackathon, com «uso limitado ao âmbito do desafio», e por isso não se publicam aqui, nem os CSV brutos nem os resultados que deles derivam (`data/processed/`).

- **De onde vêm:** os cinco CSV do Living Lab e a pasta `reference-entities/` (a semana de 3 a 10 de novembro de 2026) são os que o desafio cedeu aos participantes; quem os quiser tem de os pedir a quem os cede (a Câmara Municipal de Aveiro e o Instituto de Telecomunicações). O OpenStreetMap e a DGT (alturas dos edifícios) são fontes abertas (ver «Fontes de dados e licenças»).
- **Como se regeneram:** com os CSV numa pasta apontada por `RIASENSE_DATA_RAW`, corre-se o pipeline pela ordem de «Recalcular os resultados (pipeline)», de `riasense ingerir` a `riasense exportar` (detalhes em [pipeline/README.md](pipeline/README.md)). Escreve os Parquet em `data/processed/`.
- **O que isto muda:** o «Arranque rápido» (demo só com os resultados) e os testes que leem `data/processed/` pressupõem esses ficheiros. Sem eles, a API arranca mas `/ready` falha e a web fica sem dados, até se regenerarem.

## Arranque rápido

### Demo, só com os resultados (o caso da VM do IT)

Precisa só de **Docker com `docker compose`**. Não precisa dos dados brutos nem de Python: a API lê os Parquet versionados em `data/processed/` (ADR-0003).

```bash
git clone http://<gitlab>/hackathon/riasense.git && cd riasense
cp .env.example .env              # portas: API_PORT (8000) e WEB_PORT (5173)
docker compose up -d --build      # API em :8000 (/health, /ready, /docs) e web em :5173
curl http://localhost:8000/ready  # {"estado":"pronta"}
```

- **Painel «agora» (opcional):** vem desligado. Para a demo com o simulador de dados fictícios (ADR-0032), ponha `agora.ativo: true` em `config/riasense.yaml` **antes** do `docker compose up` (a pasta `config/` vai montada no contentor). A web mostra então o botão «Simular falha». Os passos e o que faz estão em [api/README.md](api/README.md#painel-agora-issue-87-adr-0030-e-adr-0032).

- **Sem rede na VM:** o `docker compose up --build` precisa de rede para descarregar as imagens base e as dependências. Numa VM sem rede, construa as imagens noutra máquina (`docker compose build`), copie-as com `docker save` / `docker load` e corra `docker compose up -d`. Depois disso, a demo não usa a rede.
- **Testado** a 17/11 com um clone limpo: as imagens constroem-se em cerca de 40 s, `/ready` responde «pronta», `/vigiar/falhas` e `/proteger/risco-potencial` devolvem dados e a web responde 200.

### Recalcular os resultados (pipeline)

Requisitos:
- **Python 3.11 ou mais recente** e **[uv](https://docs.astral.sh/uv/)**.
- **OpenMP**, de que a LightGBM precisa (só para a ③ e para a comparação da ②): `libgomp1` em Debian/Ubuntu (`apt-get install libgomp1`) ou `libomp` em macOS (`brew install libomp`). Sem OpenMP, o `riasense prever` termina com uma mensagem que diz o que instalar (saída 1). A comparação da ② fica só com a ridge.
- **Extensão `spatial` do DuckDB:** o `riasense sensores` instala-a sozinha da primeira vez, **com rede**. Numa VM sem rede, instale-a antes com rede (`uv run python -c "import duckdb; duckdb.sql('INSTALL spatial')"`) ou copie `~/.duckdb/extensions/` de uma máquina onde já esteja.
- **Os CSV do Living Lab** (cerca de 4 GB) numa pasta, apontada por `RIASENSE_DATA_RAW`. Não estão no git.
- **Os CSV da ANEPC de 2016 a 2020** (cerca de 218 MB, opcionais): só para o `riasense anepc`, o teste de coerência do risco potencial (ADR-0036), que os descarrega com rede se faltarem, em `RIASENSE_DATA_ANEPC` (por omissão `data/external/anepc/`), e verifica o SHA-256 de cada um. O resultado, `data/processed/validacao_anepc.parquet`, já está no git. Não estão no git.

```bash
uv sync --frozen                  # ambiente Python com as versões do uv.lock
export RIASENSE_DATA_RAW=/caminho/para/03-dados/brutos   # os 5 CSV e reference-entities/
# a ordem importa: cada passo lê o que o anterior escreveu
for passo in ingerir sensores carros zonas vigiar avenida completar proximo prever proteger risco luminosidade exportar; do
  uv run riasense $passo || break
done
uv run pytest                     # testes; os marcados `integration` precisam de RIASENSE_DATA_RAW
```

- O `riasense meteo` (Open-Meteo) e o `riasense osm` (OpenStreetMap) são os únicos passos que precisam de rede. Os resultados já estão versionados em `data/processed/meteo.parquet` e `data/processed/passadeiras_osm.parquet`, por isso só se correm para outro período ou outra cidade.
- As tabelas intermédias (cerca de 64 MB) ficam em `data/interim/` (`RIASENSE_DATA_INTERIM`), fora do git. Os resultados ficam em `data/processed/` (`RIASENSE_DATA_PROCESSED`).
- O `riasense carros` vem depois do `sensores`, porque lê o `passadeira_segmentos.parquet`. Sem ele não há `ruas_com_sensor.geojson`, e o mapa fica sem nenhuma rua com sensor (ADR-0034).
- O que cada passo faz e escreve está em [pipeline/README.md](pipeline/README.md).
- **Testado** a 17/11 num clone limpo, com `uv sync --frozen` num ambiente novo, os 9 passos correm em cerca de 1 min e reproduzem **todos** os Parquet versionados de `data/processed/`. Ficam iguais, com diferenças ≤ 5e-14 (ruído de vírgula flutuante). Sem OpenMP, o `riasense prever` falha e, por isso, o `risco` também; os outros passos correm.

Sem Docker: `uv run uvicorn app:app --app-dir api` para a API e `cd web && npm ci && npm run dev` para a web (Node 24). Os parâmetros vêm de `config/riasense.yaml` (ou de `RIASENSE_CONFIG`).

## Outra cidade

A RiaSense lê exportações de entidades **NGSI-LD** como as do ATCLL. O código não muda: muda-se o `config/riasense.yaml` e aponta-se `RIASENSE_DATA_RAW` para os dados da outra cidade.

- **Formato dos dados:** os 5 CSV de eventos (`roadsegments_stats`, `smartcrosswalk`, `smartparking`, `touriststats_visits` e `touriststats_transitions`) e `reference-entities/` (`SmartCrosswalk`, `TouristZone` e `RoadSegment`), no formato da exportação MongoDB do ATCLL. As colunas e as regras de limpeza estão em [pipeline/README.md](pipeline/README.md), na secção «Ingerir». Um tipo de sensor que não exista na outra cidade sai de `vigiar.tipos_sensor` e de `completar.completaveis`.

O que mudar no `config/riasense.yaml`:

| Chave | O que é | Mudar para |
| --- | --- | --- |
| `cidade`, `fuso_horario` | Nome e fuso. O `fuso_horario` é validado à leitura do config: tem de ser um nome de fuso, como `Europe/Lisbon` | Os da cidade. **Atenção:** o código lê os instantes em UTC e trata-os como hora local, o que está certo em Aveiro em novembro (UTC+0). Noutro fuso, ou com hora de verão, é preciso converter as horas no código |
| `periodo_dados` | Janela comum a todos os ficheiros | O período dos dados |
| `unidades_velocidade` | Unidade das velocidades. É validada à leitura do config: só `m/s` é suportado, e outro valor dá erro | `m/s`, como no ATCLL. Com outra unidade, é preciso converter na ingestão |
| `demo` | Zona, RSU, passadeiras e falha da demo | Uma zona e uma falha conhecida da cidade |
| `ingerir` | Limiares de limpeza (marcador de velocidade inválida, durações) | Os do sensor da cidade |
| `completar.avaliacao`, `completar.degradacao_antes` / `_depois`, `prever.teste_inicio` | Datas dos cortes de treino e teste | Datas dentro do novo `periodo_dados` |
| `proteger.raio_segmentos_m` | Segmentos junto a cada passadeira | Ajustar à malha urbana |
| `fontes_externas.meteo` | Coordenadas do Open-Meteo | As da cidade. Depois, `uv run riasense meteo` (com rede) |
| `luminosidade` | Coordenadas para a posição do sol e limiar do crepúsculo (−6°) | As da cidade. Depois, `uv run riasense luminosidade` (sem rede) |
| `fontes_externas.osm` | Overpass do OpenStreetMap: margem à volta das passadeiras e distância máxima de emparelhamento | Mantém-se. Depois de `riasense sensores`, `uv run riasense osm` (com rede) |

Os outros limiares (`vigiar`, `completar`, `prever`, `proteger` e `risco_potencial`) são escolhas de método documentadas nos ADR. Pode mantê-los. Se mudarem, mudam com um ADR novo (ADR-0001).

As frases do «próximo sensor» leem as datas de `completar.degradacao_antes` e `_depois`.

## Convenções e testes

- **Velocidades** em **m/s** em todos os `sensorType`, câmaras incluídas (km/h = ×3,6).
- **Parâmetros** (zona da demo, limiares, fontes) em `config/riasense.yaml`, nunca escritos no código: é isso que permite replicar noutra zona ou cidade. Sensores, zonas e limiares vivem em `config/`.
- **Distâncias em metros**, em EPSG:3763: `ST_Transform(geom, 'EPSG:4326', 'EPSG:3763')` na extensão `spatial` do DuckDB.
- **SQL parametrizado** (`?` ou `$nome` no DuckDB), nunca construído com f-strings a partir de entradas, e validação de entradas nas fronteiras (API, leitura de CSV, configuração).
- **Corridas reprodutíveis:** semente fixa nos modelos e versões fixas das dependências (`uv.lock`, `web/package-lock.json`).
- **Sem segredos no git:** só o `.env.example` é versionado. Os dados brutos ficam fora, em `RIASENSE_DATA_RAW`.
- **Vocabulário:** os termos de [GLOSSARY.md](GLOSSARY.md). Qualquer resultado mostrado compara-se com a **referência** (ADR-0005, ADR-0010) e escreve-se «risco potencial», nunca «risco» sozinho (ADR-0007).

Os testes correm-se à mão:

```bash
uv sync --frozen                  # ambiente Python, com as versões do uv.lock
uv run pytest                     # Python; os marcados `integration` precisam de RIASENSE_DATA_RAW
cd web && npm ci                  # dependências da web
npx vitest run                    # web: Vitest com Testing Library
npx tsc -b                        # web: verificação de tipos
```

Os testes que leem `data/processed/` saltam se a pasta não existir (ver «Os dados desta cópia»). Cada teste verifica um comportamento, e o nome diz qual.

## Estrutura

| Pasta | Conteúdo |
| --- | --- |
| `pipeline/` | Ingestão e limpeza (Python + DuckDB), as 4 camadas (scikit-learn/LightGBM) e a escrita em Parquet; `viabilidade/` tem os testes de 17/11 |
| `api/` | API FastAPI sobre os Parquet |
| `web/` | Mapa com 4 separadores (React + TypeScript + Vite + MapLibre) e o mapa offline em PMTiles ([web/README.md](web/README.md)) |
| `config/` | Sensores, zona da demo, limiares, pesos e fontes, em YAML (replicação noutra cidade) |
| `infra/` | Notas de instalação (o `compose.yaml` está na raiz) |
| `data/` | `processed/`: os resultados das camadas (Parquet pequenos e NGSI-LD), versionados para a demo offline. `interim/`: as tabelas limpas, fora do git |
| `docs/` | A ideia, os ADR (`docs/adr/`), o uso de IA e o arquivo da RiaDock |
| `tests/` | Testes do pipeline e da API (pytest; os `integration` leem os dados reais) |
| `entregaveis/` | PDFs finais (relatório, sumário executivo, apresentação) e o vídeo de reserva da demo |

Os dados brutos (cerca de 4 GB) **não** estão no git: ver `RIASENSE_DATA_RAW` em `.env.example`.

## Ligações

- Living Lab: <https://aveiro-living-lab.it.pt>
- Convenções e testes: [abaixo](#convenções-e-testes) · Decisões: [docs/adr/](docs/adr/) · Vocabulário: [GLOSSARY.md](GLOSSARY.md)

## Fontes de dados e licenças

| Fonte | Uso | Licença ou condição |
| --- | --- | --- |
| Aveiro Tech City Living Lab (ATCLL), Instituto de Telecomunicações: exportação de 03/11 a 10/11/2026 (roadsegments_stats, smartcrosswalk, smartparking, touriststats_visits, touriststats_transitions, reference-entities) | Todas as camadas | Cedidos aos participantes do hackathon; uso limitado ao âmbito do desafio |
| Open-Meteo (arquivo histórico): chuva e temperatura horárias | Testada nas camadas ①, ③ e ④; não entra em nenhuma, porque não melhora o resultado | CC BY 4.0, «Weather data by Open-Meteo.com» |
| OpenStreetMap, via Overpass (`data/processed/passadeiras_osm.parquet`, ADR-0019): tipo de passadeira, semáforo, via, escola e paragem das 24 passadeiras | O `semaforo` entra na ④ e no risco potencial (ADR-0024); o resto é contexto. Fonte aberta, por validar com a Câmara | ODbL 1.0, «© contribuidores do OpenStreetMap» |
| OpenStreetMap, via extrato offline da Protomaps (`web/public/tiles/aveiro.pmtiles`, ADR-0014) | Mapa de fundo | ODbL 1.0, «© contribuidores do OpenStreetMap» · Protomaps; glifos Noto Sans sob OFL |
| Direção-Geral do Território (DGT): LiDAR 2024, MDS e MDT a 50 cm (folhas 155407, 155408, 156407 e 156408; `data/processed/edificios_alturas.geojson`, ADR-0050) | Só as alturas dos edifícios da zona da demo | CC BY 4.0, «Informação geográfica cedida pela Direção-Geral do Território» |
| Direção-Geral do Território (DGT): ortofoto ORTOS 2025, a 25 cm (`web/public/tiles/vista_aerea.pmtiles`, ADR-0045) | Só a vista aérea da zona da demo, desligada por omissão | CC BY 4.0, «Ortofotos © Direção-Geral do Território» (ver `web/public/modelos/LICENCAS.md`) |

**Propriedade intelectual.** Segundo o art. 22.º, n.º 3 das Normas de Participação, a propriedade intelectual passa para as entidades desafiadoras, com uso livre sem fins comerciais e obrigação de partilha. A licença MIT deste repositório aplica-se sem prejuízo dessa regra.

## Uso de IA

As ferramentas de IA usadas e a forma como foram validadas estão em [docs/uso-de-ia.md](docs/uso-de-ia.md).

## Licença

[MIT](LICENSE)
