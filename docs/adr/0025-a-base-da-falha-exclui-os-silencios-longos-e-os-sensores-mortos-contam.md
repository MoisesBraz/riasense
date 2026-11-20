# A base da ① exclui todos os silêncios longos do sensor, e um silêncio de 24 h com 20 eventos esperados é falha

Status: proposto (17/11/2026). Refina o critério da ① (GLOSSARY, «falha inesperada»). Responde às issues #50 e #44.

Hoje uma hora conta como esperada quando a mediana da mesma hora noutros dias chega a 10 eventos (`esperado_min_eventos_hora`), e só o silêncio avaliado fica fora dessa mediana. Isto falha em dois casos, que se veem nos segmentos da RSU0030:
- **Base circular:** um sensor que fica sem comunicação várias vezes (o segmento 10368 tem 4 silêncios longos entre 04 e 09/11) tem a mediana puxada para baixo pelos **outros** silêncios, e as horas sem comunicação passam a «sossego normal».
- **Sensores de pouco movimento:** um sensor que fica sem comunicação de vez e nunca teve 10 eventos/h numa hora (os segmentos 10576, 11163, 11164 e 10364) nunca dá falha, mesmo com mais de 100 h sem comunicação com cerca de 70–120 eventos esperados (P(0) ≈ e^-70).

## Decisão

1. **A base exclui todos os silêncios longos** (≥ 24 h) do próprio sensor, e não só o silêncio avaliado.
2. **Um silêncio longo** (≥ `vigiar.silencio_longo_h`, 24 h) **é falha** se o total esperado em todas as horas, sem o limiar por hora, chegar a `vigiar.total_esperado_min` (20 eventos; P(0) = e^-20). O critério hora a hora (≥ 2 h em horas com mediana ≥ 10) continua igual para os silêncios curtos.

## Evidência (protótipo sobre o `vigiar.py` real, 17/11, fora do `main`)

| | Falhas | De rede | Novas |
|---|---|---|---|
| Atual | 20 | 7 | — |
| Só a regra 1 | 33 | 11 | 13 silêncios em 5 segmentos da RSU0030 |
| **Regras 1 e 2** | **38** | **11** | + os 4 segmentos mortos da RSU0030 (10576, 11163, 11164, 10364) |

- **Não se perde nenhuma falha atual.** **Todas as novas são da RSU0030.** Noutra RSU não aparece nenhuma, e só 1 das 18 começa de madrugada (o 11169 às 05:53).
- **Para a demo, a história fica mais forte:** a RSU0030 não caiu só uma vez a 04/11. Depois disso, os seus segmentos vão ficando sem comunicação aos bocados durante dias. As 4 falhas de rede novas são segmentos que caem com as passadeiras a 04/11 e a 05/11.

## Consequências

- Mudam os números do relatório e da demo (20 → 38 falhas, 7 → 11 de rede). Por isso entra **depois da submissão** (decisão do PO na #46). Os textos (README, wiki, ideia, sumário, PPT) atualizam-se na **#50**, depois do merge (a #35 já fechou com o !67).
- **O GLOSSARY muda:** «falha inesperada» passa a ter duas regras, a atual para os silêncios curtos e o silêncio longo (≥ 24 h) com o total esperado ≥ 20, sem limiar por hora (AGENTS.md, Vocabulário).
- A ② e a ③ usam a lista das falhas (as horas em falha não entram no treino e definem o que se completa). Têm de se reavaliar depois da mudança, e os números delas podem mexer um pouco. Se mexerem, a ③ volta a ter de ganhar à referência para entrar na demo (ADR-0010).
- Os novos parâmetros ficam no config. Os testes acrescentam os dois casos (base circular e sensor morto) com dados sintéticos.
- Ligação com a #44, a proposta do «total esperado ≥ 20» para todos os silêncios: aqui só se aplica aos longos, para não trazer de volta as noites calmas (a SC0001 tem 44 esperados em 6,9 h noturnas).
