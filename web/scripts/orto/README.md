# A vista aérea da zona da demo (ADR-0045)

O `web/public/tiles/vista_aerea.pmtiles` (2,8 MB, tiles WebP 256 × 256 dos zooms 14 a 19) faz-se com o `vista_aerea.py`, a partir da ortofoto da DGT de 2025.

- **Ficheiro:** `ortos2025_cog_25cm_rgbi_jpg_185-1_v01.tif`, ORTOS 2025 da DGT, a 25 cm, em EPSG:3763, de -48000 105000 a -40000 110000. Tem 5 bandas, e usam-se as 3 primeiras (RGB). O João descarregou-o à mão no Centro de Dados da DGT (https://cdd.dgterritorio.gov.pt) a 19/11/2026, porque o download por script dava 403.
- **Licença e atribuição:** CC BY 4.0, «Ortofotos © Direção-Geral do Território». São dados de fontes abertas, usados para contexto, que carecem de validação junto das entidades responsáveis (ADR-0023).
- **Recorte:** a caixa da zona da demo, a mesma do ADR-0050, `-44256 106805 -43242 107918` (EPSG:3763). Fora dela, os tiles ficam transparentes, e o fundo vetorial continua por baixo.
- **Não é da semana dos dados:** os carros e as pessoas da fotografia não são dados.

```
uv run --no-project --with rasterio --with numpy --with pillow --with pmtiles --with pyproj \
  python web/scripts/orto/vista_aerea.py --ortofoto …/ortos2025/ortos2025_cog_25cm_rgbi_jpg_185-1_v01.tif \
  --caixa -44256 106805 -43242 107918 --saida web/public/tiles/vista_aerea.pmtiles
```

Demora cerca de 1 minuto. Contagem de tiles por zoom: 14: 2, 15: 6, 16: 12, 17: 30, 18: 110, 19: 378.

Os testes (`test_vista_aerea.py`, com uma ortofoto sintética) correm dentro desta pasta, com as mesmas dependências e o `pytest`. Ficam fora do pytest do repositório, porque o rasterio não é dependência da API.
