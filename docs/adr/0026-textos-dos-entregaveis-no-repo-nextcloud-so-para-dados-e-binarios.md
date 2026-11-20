# Os textos dos entregáveis vivem no repositório; o Nextcloud fica só para os dados brutos e os binários

Status: proposto (17/11/2026).

Até 17/11, os guiões e textos dos entregáveis (relatório de 18/11, sumário executivo e PPT de 20/11) e os diagramas estavam no Nextcloud, por uma convenção herdada do RiaDock que nunca foi decidida. Nesse dia isto teve três custos:
- **Atraso na sincronização:** o relatório v2 não tinha chegado a uma das máquinas quando foi preciso revê-lo.
- **Sem histórico nem revisão:** o sumário ficou com uma contradição (na §3.3, «os carros não abrandam» na SC0013 e na SC0020, que têm semáforo e onde a medida não se aplica, #67) que nenhum MR apanhou.
- **Duas fontes da verdade:** os números do relatório viviam na §7 de um ficheiro do Nextcloud, longe do pipeline que os produz.

Na noite de 17/11, o PO tirou o guião do relatório do Nextcloud: o texto do PDF passou a estar no Figma (ficheiro «RiaSense — Protótipo», página «Relatório 18/11», que o Eduardo pagina) e o guião (textos com a contagem de caracteres, figuras, tabela de números e fontes, regras e lista de verificação) passou para a wiki, página [Relatorio-18-11](../../-/wikis/Relatorio-18-11), copiada do Figma depois de cada mudança.

O júri vê o repositório e não o Nextcloud, por isso o rasto «ADR → issue → MR» (ADR-0001, FAQ 17) não cobria os textos entregues.

## Decisão

**Relatório de 18/11 (já em curso):** o Figma é a fonte do PDF e a wiki é o guião, como o PO decidiu. Não se muda nada até à entrega. Depois de 18/11, a página da wiki passa para `entregaveis/2026-11-18-relatorio/guiao.md`, o texto final para `texto.md` e o PDF entregue para a mesma pasta; a página da wiki fica com uma linha a apontar para lá.

**Sumário executivo e PPT de 20/11:**

| No repositório (com MR e revisão) | No Nextcloud (partilha) |
|---|---|
| Os guiões e textos em Markdown do relatório, do sumário executivo e do PPT, em `entregaveis/AAAA-MM-DD-<entregável>/` | Os dados brutos do Living Lab e das fontes externas (fora do git, apontados por `RIASENSE_DATA_RAW`, regra do AGENTS.md) |
| Os diagramas como fonte HTML/SVG, em `docs/diagramas/` | Os templates oficiais (.docx, .pptx) e os ficheiros de trabalho da paginação |
| A tabela de números do relatório (a §7), em `entregaveis/2026-11-18-relatorio/numeros.md`, no mesmo repositório que os Parquet que a produzem | As exportações do Figma, as capturas e os vídeos de trabalho |

- **O texto entra por MR**, como o código. O revisor é o da tabela do CONTRIBUTING (entregáveis escritos: o revisor é o Elicarlos), e o PO faz o merge.
- **Os entregáveis finais (PDF e PPT) ficam nos dois:** em `entregaveis/` no repo, porque o júri vê o repo, e no Nextcloud, para a equipa. A paginação parte da versão aprovada no repo: o texto aprova-se no `texto.md` por MR e copia-se para o Figma, e não ao contrário.
- **Quem não usa git** pode continuar a escrever no Nextcloud. O texto entra no repo por um MR aberto por outra pessoa ou por um agente, e a versão do repo é a que vale.

## Consequências

- **Guião e texto separados:** o guião (com as notas internas para a equipa e para a paginação) e o texto entregue ficam em ficheiros diferentes da mesma pasta (`guiao.md` e `texto.md`). O júri vê os dois no repositório; as notas internas mostram rigor e não se escondem, mas o PDF parte só do `texto.md`.
- **Quando:** a mudança faz-se **depois da entrega do relatório de 18/11** (quarta, 17h, #46), para não mexer no ficheiro a meio da escrita. Entra a tempo do sumário e do PPT de sexta, 20/11.
- **Uma só versão de cada texto:** até 18/11, o Figma (texto) e a wiki (guião); depois, o repositório. Quem mudar o Figma depois de 18/11 abre o MR com a mesma mudança no `texto.md`.
- A pasta `entregaveis/` já existe no repo (README e vídeo da demo). Passa a ter uma subpasta por entregável. A `docs/diagramas/` cria-se no MR que move os diagramas.
- O `00-LEIA-ME.md` do Nextcloud e o `entregaveis/README.md` dizem onde está o quê, e cada ficheiro do Nextcloud ou página da wiki que passe para o repo fica com uma linha a apontar para lá, para não haver duas versões.
- Os números do relatório passam a poder ser verificados contra os Parquet no mesmo commit.
