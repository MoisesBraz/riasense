# A ③ prevê a 3 e a 6 horas e só entra onde ganha à referência e à persistência

Status: proposto (17/11/2026). Refina o ADR-0010. Complementado pelo ADR-0031 (validação em várias janelas e outros modelos). A espera pela submissão foi levantada a 18/11 (#103). Dois valores dos segmentos da tabela foram corrigidos a 18/11 (#107). A ressalva do estacionamento a 6 h entrou a 18/11 (#109).

A ③ prevê hoje a próxima hora (`prever.horizonte_h: 1`) e ganha à referência «mesma hora, dia anterior» nos 4 tipos. Mas, a 1 hora, a **persistência** («igual à hora anterior») é quase impossível de bater: empata nas passadeiras (0,418 contra 0,416) e ganha nas zonas (0,344 contra 0,368). O júri vai perguntar para que serve o modelo, se basta copiar a última hora. Para a Câmara, que planeia com antecedência, o horizonte útil também não é daqui a 60 minutos.

## Evidência (protótipo sobre o `prever.py` real, 17/11, fora do `main`)

Erro relativo mediano no teste (48 h), com os atrasos ajustados ao horizonte (nenhum usa horas ainda por medir):

| Horizonte | Tipo | Modelo | Persistência | Referência |
|---|---|---|---|---|
| 1 h | passadeira / zona / segmento / estacionamento | 0,418 / 0,368 / 0,218 / 0,192 | 0,416 / **0,344** / 0,272 / 0,222 | 0,617 / 0,677 / 0,374 / 0,253 |
| **3 h** | passadeira / zona / segmento / estacionamento | **0,557 / 0,475 / 0,295 / 0,235** | 0,720 / 0,715 / 0,571 / 0,293 | 0,617 / 0,677 / 0,374 / 0,253 |
| **6 h** | passadeira / zona / segmento / estacionamento | **0,555 / 0,505 / 0,306 / 0,228** | 1,085 / 1,287 / 0,924 / 0,410 | 0,617 / 0,677 / 0,374 / 0,253 |
| 12 h | passadeira / zona / segmento / estacionamento | 0,590 / 0,574 / 0,312 / 0,222 | 1,476 / 1,672 / 1,247 / 0,479 | 0,617 / 0,677 / 0,374 / 0,253 |

**A 3 e a 6 horas, o modelo ganha às duas comparações em todos os tipos.** A 12 horas continua a ganhar, mas nas passadeiras a margem sobre a referência (0,590 contra 0,617) já é pequena.

## Decisão

1. A ③ calcula os horizontes de **3 h e 6 h** (`prever.horizontes_h: [3, 6]`). Na demo, o principal é o de 3 h.
2. **A regra do ADR-0010 fica mais exigente:** um tipo e um horizonte só entram se ganharem à referência **e** à persistência.
3. O horizonte de 1 h fica **só na avaliação**, para mostrar que a 1 hora a persistência basta. Isto diz-se no pitch como um resultado, e não como um defeito.
4. **O risco potencial usa a previsão a 3 h:** na hora t entra a previsão feita em t para t + 3 h (em vez de t + 1 h, ADR-0013). Os pesos do ADR-0013 não mudam.

## Consequências

- O ADR-0010 (o horizonte e a 2.ª comparação) e o ADR-0013 (a previsão da componente do risco) ficam com `Status: em parte superseded by ADR-0027`, **neste MR**. Se o !62 (ADR-0024) entrar antes, a linha de Status do ADR-0013 junta os dois.
- Mudam os números do risco potencial: no !76, 1020 das 3936 linhas mudam, e a média fica igual (0,5118).
- A ③ deixa de ser, na app, «0,42 contra 0,62 a 1 h», e a Figura 1 do relatório diz «LightGBM a 1 h». Estava combinado entrar **depois da submissão** (decisão do PO na #46). A 18/11, o PO levantou a espera (nota 12567 da #46): o relatório está fechado e exportado, a demo de 20/11 corre a 3 h de qualquer maneira, e a linha de 1 h fica no `avaliacao_prever`, por isso nenhum número do texto do relatório muda.
- **Ressalvas:** é uma só semana, com 48 h de teste (a mesma janela do ADR-0010). Os atrasos mudam com o horizonte (a 3 h, o modelo usa o valor de há 3, 4 e 5 h e o de há 24 h). Com 6 h há menos horas de teste comparáveis no início da janela. **Os horizontes de 3 e 6 h foram escolhidos depois de ver o protótipo nas mesmas 48 h de teste:** a regra é anterior ao modelo, mas a escolha do horizonte não.
- **Frase para o júri:** «A 1 hora, copiar a última hora já é muito bom, e dizemo-lo. A 3 horas, o modelo erra 20 a 48 % menos do que copiar a última hora, e a 6 horas 44 a 67 % menos. É aí que a Câmara precisa de previsão.» **Ressalva a dizer:** sobre a mesma hora de ontem a margem é pequena nas passadeiras (−10 %) e no estacionamento (−7 %).
- **Ressalva da validação em 4 janelas (ADR-0031, !86):** a 6 h, no estacionamento, a referência tem erro médio mais baixo do que o LightGBM nas 4 janelas (0,247 contra 0,263), e é melhor em 3 das 4; nas 48 h oficiais o LightGBM ganha (0,228 contra 0,253). É o único tipo e horizonte em que isto acontece.
