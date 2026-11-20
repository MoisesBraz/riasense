# web

Mapa com 4 separadores (Vigiar → Completar → Prever → Proteger) em React + TypeScript + Vite + MapLibre GL, com temas escuro e claro, para 1440 px e 390 px. A demo segue a Av. 25 de Abril / Av. de Oita (RSU0030) e conta a falha de rede de 04/11 às 20h06.

```bash
npm ci
npm run dev      # http://localhost:5173 (precisa da API em VITE_API_URL, por omissão http://localhost:8000)
npm test         # Vitest + Testing Library
npm run build    # tsc + vite build para dist/
```

## Como funciona

- **Só dados reais da API** (`VITE_API_URL`, ver `api/README.md`). Um 503 da API («por calcular») e um endpoint que ainda não existe aparecem como «por calcular»; uma falha de ligação aparece como erro, com «Tentar de novo». Nunca se mostram valores de exemplo.
- **Estado único** (`src/estado/estado.tsx`): o separador, a hora do cursor, a passadeira em foco e as camadas são partilhados. Trocar de separador mantém a zona e a hora.
- **Zona da demo** em `src/demo.json`, que espelha o bloco `demo` de `config/riasense.yaml` (o teste `src/config.test.ts` falha se divergirem). As posições dos sensores vêm sempre de `/sensores`. Para outra zona troca-se o JSON e o YAML, não o código.
- **Tokens** (cores, espaço, raios e tipo, claro e escuro) num só ficheiro: `src/styles/tokens.css`. O estilo do mapa lê as mesmas variáveis.
- **Gráficos** em SVG próprio (`src/componentes/graficos/`), sem biblioteca.
- **Ruas «com sensor» e «sem cobertura»:** uma rua conta como coberta se passar a menos de `mapa.cobertura_m` (40 m) de um sensor de peões (passadeira ou zona turística). As outras ficam a cinzento (ADR-0007). Clicar numa rua cinzenta mostra o estado «sem cobertura».
- **Mapa de risco potencial** (vista do Proteger, ADR-0013): a API dá uma pontuação de 0 a 1 por passadeira e hora; o mapa mostra-a em 5 degraus iguais de 0,2 (1 = menor, 5 = maior), tracejados quando a exposição é estimada. Diz sempre «risco potencial» e «não mede acidentes».

## Mapa offline (ADR-0014)

O mapa de fundo é um único ficheiro PMTiles, servido como estático pelo Vite e pelo nginx; o MapLibre lê-o com o protocolo `pmtiles`. A demo não faz nenhum pedido à Internet.

| Ficheiro | Tamanho | Origem |
| --- | --- | --- |
| `public/tiles/aveiro.pmtiles` | 5,7 MB | Extrato da Protomaps (build 20261116, esquema v4), município de Aveiro (`-8.77,40.54,-8.52,40.73`), zoom 0 a 15 |
| `public/fonts/Noto Sans {Regular,Medium,Italic}/` | 0,8 MB | Glifos de `protomaps/basemaps-assets` (intervalos 0-255, 256-511 e 8192-8447), licença OFL (`public/fonts/OFL.txt`) |

Para os gerar de novo (precisa de rede uma vez; não instala nada no sistema):

```bash
web/scripts/descarregar-mapa.sh                      # a partir da raiz do repositório
BUILD=20261116 MAXZOOM=14 web/scripts/descarregar-mapa.sh
```

O script descarrega o CLI oficial `pmtiles` (protomaps/go-pmtiles) para uma pasta temporária, corre `pmtiles extract` sobre um build público da Protomaps e falha se o ficheiro passar de 25 MB.

**Atribuição:** © contribuidores do OpenStreetMap (ODbL) · Protomaps. Aparece no canto do mapa e no painel «Dados locais».
