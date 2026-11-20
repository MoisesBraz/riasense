# Boletim de Segurança Pedonal para a Câmara: exportação local de sumário de risco e velocidade

Status: proposto (19/11/2026, pelo João). O Moisés decide. **Complementa** o ADR-0007, o ADR-0024, o ADR-0033, o ADR-0039 e o ADR-0048. Corrigido com o parecer do revisor (nota 15008) e o pedido do Moisés (nota das 17h52).

## Contexto

- A camada ④ mede o abrandamento dos veículos junto a passadeiras e gera o mapa de risco potencial (0,4 exposição + 0,4 comportamento + 0,2 previsão).
- Na avaliação do hackathon (critério «Adoção», 20 %), os técnicos municipais da CMA precisam de levar a evidência para reuniões do executivo e despachos de tráfego, sem dependerem de navegar interativamente pelo painel no dia a dia.
- O projeto corre em modo offline (ADR-0014, ADR-0028). Qualquer relatório tem de ser gerado pelo próprio navegador ou pela API local, sem dependências de serviços externos.

## Decisão

1. **Ação «Exportar boletim da Câmara»:** na página da ④ Proteger, um botão discreto gera uma página para imprimir, que o browser guarda em PDF sem rede. Só PDF, pela impressão do browser.
2. **Conteúdo estrito:**
   - **As 3 passadeiras com maior risco potencial na semana.** Regra: a média do `risco_potencial` de todas as horas da semana, por passadeira (`risco_potencial.parquet`); empate desfaz-se pelo id. Cada uma diz se tem semáforo (então o risco usa os pesos do ADR-0024) e se tem horas estimadas. Cada uma diz também quantas horas foram medidas (ressalva obrigatória do ADR-0024). Com os dados de hoje: SC0002 (0,80), SC0019 (0,78; 29 de 164 horas medidas, as outras estimadas) e SC0007 (0,75), nenhuma com semáforo.
   - **Veículos acima do limite da via na zona das passadeiras da demo** (SC0019 a SC0022, `proteger_passadeiras.parquet`): 23–24 % nos intervalos com mais travessias e 33–37 % nos com menos, sobretudo à noite (o intervalo vai do menor ao maior valor das quatro passadeiras, arredondados às unidades: 22,8–23,8 % e 33,0–36,9 % no Parquet) (a comparação não desconta a hora; `pipeline/README.md`). Diz-se «na zona», e não como quatro medidas independentes: as quatro passadeiras partilham segmentos, e um veículo conta para todas as do seu segmento. Fala-se **por passadeira ou zona, nunca por rua** (ADR-0039, ponto 4). Medido pela câmara e pelo radar (os segmentos 10084 e 11168, nas quatro passadeiras), com a ressalva do ADR-0039: «o radar e a câmara medem velocidades diferentes: o excesso não é comparável entre sensores».
   - **As passadeiras com semáforo**, fora da anomalia de abrandamento (SC0011, SC0012, SC0013, SC0020 e SC0021; ADR-0024), com a fonte: «OpenStreetMap, por validar com a Câmara» (ADR-0023 e ADR-0048, ponto 2).
3. **Avisos obrigatórios no cabeçalho do documento:** «Risco potencial estimado — não substitui registo oficial de sinistralidade (BEAV)»; «Semana de dados de 03 a 10/11/2026».
4. **Sem processamento pesado:** os números vêm dos ficheiros Parquet já calculados (`risco_potencial.parquet` e `proteger_passadeiras.parquet`).

## Consequências

- **O que se ganha:** materializa o lema «From Data to Action». O júri da Câmara vê um entregável prático pronto a usar na gestão da mobilidade e na justificação de lombas ou policiamento.
- **Custos:** uma rota ligeira na API ou componente React de formatação de texto; esforço estimado de 1 hora para o agente.
- **Prazo:** implementação até às 10h de 20/11 (para revisão antes do congelamento das 13h30).
