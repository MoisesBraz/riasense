# O mapa offline é um ficheiro PMTiles servido pela web, sem servidor de tiles

A demo tem de funcionar sem rede (art. 22.º, n.º 6) e instalar-se com um só `docker compose` (ADR-0003). O mapa de fundo é um extrato da **Protomaps** (dados OpenStreetMap, ODbL) do município de Aveiro, num **único ficheiro `.pmtiles` versionado** em `web/public/tiles/`, que o nginx da web serve como estático e o MapLibre lê com o protocolo `pmtiles`, com glifos locais e um estilo próprio feito com os tokens claro e escuro da web (ria, quarteirões e ruas com nome). Assim o mapa não precisa de servidor de tiles nem de mais um container, e a demo nunca chama a rede.

## Opções consideradas

- **tileserver-gl com `.mbtiles`** (o que previam o `infra/README.md` e o `.env.example`): obrigava a mais um container e a mais uma porta (`TILES_PORT`) só para servir ficheiros que o nginx da web já serve.
- **Tiles de um serviço externo** (OpenStreetMap, MapTiler): precisam de rede durante a demo.

## Consequências

- A descarga precisa de rede **uma vez**: o script `web/scripts/descarregar-mapa.sh` usa o CLI oficial `pmtiles` (`pmtiles extract` sobre um build público da Protomaps, com a `--bbox` de Aveiro) e copia de `protomaps/basemaps-assets` só os intervalos de glifos precisos. O resultado fica versionado, e a demo não corre o script.
- O `.pmtiles` fica com **cerca de 25 MB no máximo**. Se passar, reduz-se a área ou o zoom máximo; acima do zoom máximo do extrato, o MapLibre amplia os vetores.
- Sem sprite: o estilo não usa ícones, e os marcadores da RiaSense são desenhados pela web. Se um dia usar ícones, o sprite também fica local e versionado.
- O mapa e o README mostram «© contribuidores do OpenStreetMap» e «Protomaps».
- O `infra/README.md` e o `.env.example` deixam de referir o `tileserver-gl` e a `TILES_PORT`.
