# Resultados pré-calculados em Parquet, sem base de dados

Status: aceite. Complementado pelo ADR-0030 (17/11/2026): o painel «agora» lê dados em tempo real só em memória, sem base de dados, e só com autorização do IT.

O pipeline (Python + DuckDB) calcula as 4 camadas offline e escreve os resultados em Parquet em `data/processed/`. A API (FastAPI) só os lê. Não usamos PostGIS nem pgRouting. Os dados são uma cópia estática de 7 dias (não há tempo real), a rota saiu com a RiaDock, e a demo tem de funcionar offline (art. 22.º, n.º 6). Menos peças significa menos falhas a 20/11 e uma instalação com um só `docker compose` nas máquinas virtuais do IT. As operações espaciais usam a extensão spatial do DuckDB (metros em EPSG:3763).

## Opções consideradas

- **PostgreSQL + PostGIS + pgRouting** (a stack da RiaDock): só se justificava com dados ao vivo ou com rotas. Volta a fazer sentido se a RiaSense passar a ler a API do Living Lab em tempo real.
