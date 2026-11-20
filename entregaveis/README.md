# entregaveis

PDFs finais: relatório (18/11), sumário executivo e apresentação (20/11). Cópia também no Nextcloud, em `05-entregaveis/`.

## Textos dos entregáveis (ADR-0026)

Os guiões e os textos estão aqui em Markdown, uma pasta por entregável, e mudam por MR. A versão do repositório é a que vale. No Nextcloud ficam os templates (.docx, .pptx), as capturas e os ficheiros de paginação.

| Pasta | O quê |
| --- | --- |
| `2026-11-18-relatorio/` | O relatório de 18/11, já entregue: `relatorio-riasense-2026-11-18.pdf` é o PDF entregue (2 páginas A4), `texto.md` é o que foi para o PDF, `guiao.md` tem os prazos, as regras e o que se decidiu, e `numeros.md` a fonte de cada número |
| `2026-11-20-sumario/` | O sumário executivo: `texto.md` é o que vai para o PDF; `guiao.md` tem o orçamento, a fonte de cada número e a lista de verificação |
| `2026-11-20-ppt/` | A apresentação: `guiao.md` tem os slides e a fonte dos números que só estão no PPT |

O relatório de 18/11 passou para `2026-11-18-relatorio/` depois da entrega. O Figma e a wiki (página «Relatorio-18-11») ficam como registo do que foi entregue. Quem mudar o Figma depois de 18/11 abre o MR com a mesma mudança no `texto.md`.

Os diagramas (a Figura 1 do relatório) estão em [`docs/diagramas/`](../docs/diagramas/).

## Vídeo de reserva da demo (`riasense-demo.mp4`, issues #36 e #113)

Gravação da aplicação real, para o pitch se fazer mesmo que a demo ao vivo falhe. **O vídeo de reserva é o `riasense-demo.mp4`, no tema claro**: é onde se vê o mapa passar do dia à noite (ADR-0040), e num projetor lê-se melhor. **A alternativa é o `riasense-demo-escuro.mp4`**, igual, no tema escuro (o da demo ao vivo). Duram **1 min 46 s** cada (gravados a 19/11), em 1440 × 900, MP4 H.264: o claro tem 3,2 MB e o escuro 2,9 MB. São **mudos, com legendas em pt-PT**: a voz é do apresentador.

Segue o guião da demo ([`2026-11-20-ppt/guiao.md`](2026-11-20-ppt/guiao.md), slide B4), na RSU0030 a 04/11:

| Passo | Tempo | O que se vê |
| --- | --- | --- |
| ① Vigiar | 20 s | o cursor recua às 16h e o ▶ leva-o às 20h, com o fundo do mapa a escurecer (ADR-0040); as 38 falhas; o pop-up da RSU0030 com os sensores que deixam de comunicar |
| ② Completar | 20 s | o sensor virtual da SC0020, com o intervalo de 80 %, e o erro contra a referência |
| ③ Prever | 10 s | a previsão a 3 h, com a ressalva sobre a mesma hora de ontem |
| ④ Proteger e mapa de risco potencial | 30 s | o abrandamento, o semáforo, o mapa de risco potencial e o pop-up da SC0021 (com semáforo) |
| O alerta ao vivo | 20 a 25 s | o modo «agora» (simulação com dados fictícios, ADR-0032): a falha simulada da RSU0030 e o aviso «sem comunicação» |

As legendas são as da nota 13244 da #113: só frases e números que estão na aplicação ou em `data/processed/`. Nunca se diz «este carro ia a X km/h», nem se usam os anéis de excesso como prova (ADR-0039).

Para o gerar de novo (sem rede; o Playwright usa o Chromium da cache local, `npx playwright install chromium` se faltar):

```bash
RIASENSE_CONFIG=/caminho/copia-com-agora.yaml uv run uvicorn app:app --app-dir api --port 8000 &   # a API, com agora.ativo: true
cd web && npm ci && npm run build && npx vite preview &     # a web em http://localhost:4173
npm run gravar-demo                                         # tema claro → entregaveis/riasense-demo.mp4 (precisa do ffmpeg; sem ele fica .webm)
TEMA=escuro npm run gravar-demo                             # tema escuro → entregaveis/riasense-demo-escuro.mp4 (a alternativa)
ENSAIO=1 npm run gravar-demo                                # só o ensaio da GPU (placa, decisão da app, fps e duas fotos), sem escrever o vídeo
```

**GPU (ADR-0041, ponto 8).** Os modelos 3D só aparecem com ≥ 30 fps; abaixo disso, a app recua para a vista de cima, sem eles. Por isso o script lança o Chromium com a aceleração por hardware ligada (no macOS, `--use-angle=metal`: o WebGL corre na GPU do Mac, e não no SwiftShader, o desenho por software que o Chromium do Playwright usa sem opções). Antes de gravar, confirma a placa e pára com «Sem GPU: …» se for de software. Depois lê a decisão da própria app: nos 3 s depois de o mapa carregar, a app mede os fps e deixa no mapa se recuou (`data-recuo`, #154); se recuou, o script pára. Em ambos os casos sai com o código 1 e não escreve o vídeo final. Grava-se no Mac, na sessão de quem está ao ecrã (não por SSH, nem com o ecrã bloqueado).

Para confirmar antes da gravação final, corre-se `ENSAIO=1 npm run gravar-demo` (com a API e a web a correr, como acima). O ensaio usa o mesmo Chromium e a gravação ligada, como o vídeo, mas não escreve o vídeo final. No terminal tem de aparecer:

- `placa: ANGLE (Apple, ANGLE Metal Renderer: …)`, e não `SwiftShader`;
- `a app: N fps ao abrir, não recuou: modelos 3D no mapa`;
- `fps com o ▶ e o «Trânsito»: N (mínimo 30)`, com N ≥ 30;
- `modelos 3D (.glb) servidos: 13`. Esta linha só diz que a web compilada tem os modelos: os `.glb` carregam-se mesmo quando a app recua, por isso não prova que estão no ecrã.

A prova de que os modelos estão no ecrã são a linha `a app: …` e as duas fotos que o ensaio indica, `ensaio-3d-claro.png` (o zoom de abertura do vídeo) e `ensaio-3d-claro-perto.png` (um passo mais perto). Nas fotos, o mapa tem de estar inclinado, com os edifícios em relevo, os veículos nas ruas e os peões nas passadeiras (não pontos). Com `TEMA=escuro`, as fotos são as do tema escuro. A gravação final também escreve no terminal a placa e a decisão da app.

**Antes de submeter, vejam-se os primeiros 20 s do vídeo final**: o mapa inclinado, com os edifícios, os veículos e os peões.

O modo «agora» precisa de `agora.ativo: true` na API: copia-se o `config/riasense.yaml`, liga-se na cópia e aponta-se o `RIASENSE_CONFIG` para ela (o config do repositório não muda). Com `docker compose up`, usa-se `URL_WEB=http://localhost:5173 npm run gravar-demo`. As legendas e o tempo de cada passo estão em `web/scripts/gravar-demo.mjs`, que diz no terminal o segundo em que começa cada passo; o tema é o claro por omissão e `TEMA=escuro` grava a alternativa; cada tema grava no seu ficheiro, e `SAIDA=/caminho/ensaio.mp4` grava um ensaio sem mexer nos vídeos versionados.
