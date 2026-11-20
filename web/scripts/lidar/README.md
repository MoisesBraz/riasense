# As alturas dos edifícios pelo LiDAR da DGT (ADR-0050)

O `data/processed/edificios_alturas.geojson` (servido em `/mapa/edificios-medidos`) faz-se com o `alturas_lidar.py`, a partir do MDS e do MDT a 50 cm do LiDAR de 2024 da DGT (CC BY 4.0, «Informação geográfica cedida pela Direção-Geral do Território»). São 4 folhas de 1 × 1 km na zona da demo: a 155407, a 155408, a 156407 e a 156408. Descarregam-se com uma conta do Centro de Dados da DGT; o script `03-dados/descarregar_dgt.py` do Nextcloud fá-lo.

- **Altura de cada edifício:** o percentil 90 do MDS − MDT dentro da planta, recuada 1 m. Os edifícios com menos de 8 células ficam sem altura.
- **Edifícios:** vêm do `web/public/tiles/aveiro.pmtiles` (camada `buildings`, z15). O `id` é o mesmo das features dos tiles, que é o que a web usa para os tirar da camada dos tiles.
- **Abaixo de 2 m** (demolidos em 05/2024, por construir, ou anexos rasos), o edifício fica fora do ficheiro, e a web usa a altura de hoje.

```
uv run --no-project --with rasterio --with shapely --with numpy --with pmtiles --with mapbox-vector-tile \
  python web/scripts/lidar/alturas_lidar.py --mds …/lidar2024/MDS-*.tif --mdt …/lidar2024/MDT-*.tif \
  --edificios web/public/tiles/aveiro.pmtiles --caixa -44256 106805 -43242 107918 --ano 2024 --saida edificios_alturas.geojson
```

Os testes (`test_alturas_lidar.py`, com dados sintéticos) correm com as mesmas dependências, dentro desta pasta. Ficam fora do pytest do repositório, porque o rasterio e o shapely não são dependências da API.
