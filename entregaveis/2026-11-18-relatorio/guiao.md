# Relatório de 18/11 · guião

Notas internas do relatório entregue a 18/11: prazos, a figura, as regras do texto, o que se decidiu e o estado. O texto que foi para o PDF está em [`texto.md`](texto.md), e a fonte de cada número em [`numeros.md`](numeros.md). Issue: #18 · Dono: Moisés · Revisão do texto: Elicarlos · Paginação: Eduardo.

## Prazos

| Quando | O quê | Quem |
| --- | --- | --- |
| Ter 17/11, noite | Texto revisto | Elicarlos |
| Qua 18/11, 12h00 | Paginação final (2 páginas A4) | Eduardo |
| Qua 18/11, 15h00 | Revisão final do PDF | Moisés e Elicarlos |
| Qua 18/11, 17h00 | Submissão (com 2 h de folga) | Moisés |
| Qua 18/11, 19h00 | **Prazo oficial** | — |
| Sex 20/11, 17h30 | Sumário executivo, PPT e link do repositório | Equipa |


### Figura 1 — os quatro pilares

- **Fonte:** `04-design/diagramas/riasense-4-pilares.html` (versão de 18/11, com o ③ a 3 h e a caixa do IT «proposta: no painel que o IT já usa»), na versão do relatório `04-design/diagramas/riasense-4-pilares-relatorio-v3.html` e `.png` (3000×1260), no Nextcloud. Passa para `docs/diagramas/` na #106 (ADR-0026).
- **No Figma:** ocupa a largura toda da coluna (451 × 189), no topo da página 2.
- **Legenda:** Figura 1 — Os quatro pilares sobre o Living Lab de Aveiro. A azul, o que distingue a RiaSense.
- **Incoerências conhecidas** (vistas a 18/11, decisão do Moisés: manter): a figura diz ③ a 3 h, e o texto fala da hora seguinte (0,42 contra 0,62) e de 3 e 6 h «a validar»; a legenda repete a legenda que a figura já tem lá dentro; a caixa do IT dá como existente um painel que o texto dá «a validar com o IT».


## Regras do texto

- Só os factos de [`numeros.md`](numeros.md).
- A ressalva dos dados curtos (29 h nas passadeiras da RSU0030) fica em «Replicação e limites». Onde há semáforo, a medida da ④ não se aplica.
- Dizemos que hoje não há alerta para a ausência de dados (mentores). Não dizemos que o IT não sabia da falha da RSU0030.
- Usa-se o vocabulário do `GLOSSARY.md`: «sensor virtual», «falha de rede», «risco potencial» (nunca «risco» sozinho nem «acidentes» como medida), «referência» (a mesma hora do dia anterior) e «persistência» (repetir a última hora).
- A RiaSense **recomenda**; não fiscaliza nem decide pela Câmara.
- Não se referem outros trabalhos da equipa.


## Decisões da revisão

- **Waze (17/11, Moisés):** o mentor CMA/IT disse que estes dados estão fora do âmbito do desafio. O Waze fica no roadmap (ADR-0009), e a #13 fecha-se quando o André Oliveira confirmar.
- **Estratégia sem números (17/11, proposta do João)**, mas a 18/11 entrou «0,42 nos dois» na ③ e a ① leva as durações da regra (ADR-0025).
- **Descrição (17/11, proposta do João):** «Em vez de replicar o que as aplicações de navegação já mostram…».
- **Ferramentas de IA (17/11 e 18/11, Moisés):** frase curta mantida, «sempre revisto» mantido.
- **Subtítulo (18/11, Moisés):** «- Sumário Executivo» mantido.
- **③ (18/11, Moisés):** frase nova sobre a persistência («O modelo tem de ganhar também à persistência…»), com a Estratégia a ficar com 1800 caracteres.
- **Figura 1 (18/11, Moisés):** trocada pelo diagrama novo (③ a 3 h, caixa do IT «proposta: no painel que o IT já usa»). Incoerências conhecidas acima.
- **«Semáforo» nas passadeiras (17/11, Moisés):** a regra do ADR-0024 conta 5 passadeiras com semáforo (`crossing=traffic_signals` ou `crossing:signals=yes`), com a SC0021. O `button_operated=yes` também aparece na SC0012, na SC0013, na SC0020 e na SC0021 (a SC0011 tem `no`), por isso não separa tipos.
- **Espera do !76 levantada (18/11, Moisés):** o ③ a 3 e 6 h entra no `main` depois da entrega (ADR-0027, nota 12567 da #46).


## Estado da entrega

- [x] 2 páginas A4 (PDF exportado do Figma a 18/11, 13h50, 595×842 cada)
- [x] Subtítulo «Desafio #1 Smart Aveiro: From Data to Action - Sumário Executivo»
- [x] PDF no Nextcloud (`05-entregaveis/2026-11-18-relatorio/relatorio-riasense-2026-11-18-A4-entrega.pdf`; o PDF entregue foi enviado pelo Moisés, **confirmar que é este**)
- [x] Entregue a 18/11 (comunicado pelo Moisés)
- [ ] PDF em `entregaveis/` no repositório
- [ ] Decidir se as incoerências da Figura 1 e do ④ se corrigem no sumário executivo de 20/11 (#95, !97)
