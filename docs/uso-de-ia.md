# Uso de IA

Declaração do uso de ferramentas de IA no projeto (FAQ 17 das Normas; alimenta a secção «Ferramentas de IA» do sumário executivo). As decisões de método são da equipa, e todos os membros sabem explicar as 4 camadas, os modelos e as métricas.

## Ferramentas

| Ferramenta | Onde foi usada | Como validámos |
| --- | --- | --- |
| Assistente de programação com IA, como apoio de exploração | Discussão e escolha da ideia (17/11); scripts de viabilidade em `pipeline/viabilidade/` | Números confirmados nos dados reais (deixar um sensor de fora, placebo, falhas conhecidas). Os scripts não entram no produto: o pipeline refaz cada método e compara-se com eles |
| Assistente de programação com IA, como **agente Programador** ([ADR-0011](adr/0011-agente-programador-e-aprovacao-do-po.md)) | Implementação das issues com o label `agente`: pipeline, API, web, exportação NGSI-LD, vídeo de reserva e documentação. Trabalha a partir dos briefs do PO, uma issue de cada vez, pelo portão ADR → issue → implementação (ADR-0001) | O PO revê o diff de cada merge request e faz o merge. Ver «Como validámos» abaixo |
| Figma, com o servidor MCP do Figma | Protótipo dos ecrãs (versão 1) e paginação do relatório | Primeira versão feita com IA (17/11), a afinar pelo designer. A aplicação real passou depois a ser a referência visual |

## Como validámos

- **Revisão humana de cada alteração:** cada merge request tem a linha `IA usada em: … / validei: …`, e o PO revê o diff antes do merge (ADR-0011).
- **Critérios escritos antes de correr os modelos:** a regra da ③ e a métrica, a comparação com e sem meteorologia na ① e o limiar da lista «verificar o sensor» ficaram em commit antes de se verem os resultados. Os critérios não se ajustaram depois aos números.
- **Comparação com a referência e testes placebo:** um modelo só entra no produto se ganhar à referência «mesma hora, dia anterior» (ADR-0010), e a ④ tem um teste placebo (ADR-0006).
- **Testes automáticos:** pytest no pipeline e na API, incluindo testes `integration` sobre os dados reais, e Vitest na web.
- **Reprodução num clone limpo:** a partir de um clone novo e de um ambiente novo, o pipeline reproduz todos os Parquet versionados.

## Erros que a revisão apanhou

São erros feitos com IA, ou que ela própria levantou, e que a revisão corrigiu. Ficam aqui para o júri ver o processo.

- **Arredondamento no `task2.py` (viabilidade da ④).** O script decidia se uma passadeira abrandava a partir do intervalo de confiança já arredondado a 2 casas («−0,00» não é < 0). Por isso dava 18 de 24 passadeiras com abrandamento e 4 assinaladas. Ao reproduzir o método no pipeline, o valor exato mostrou 19 de 24 e 3 assinaladas, com a SC0011 a abrandar no limite. A evidência foi corrigida e a nota ficou em `pipeline/viabilidade/README.md`.
- **Agregação dos vizinhos na ②, escolhida depois de ver os números.** A razão entre somas da viabilidade não cumpria o critério da issue sem tirar a SC0023 à mão. Os vizinhos passaram a juntar-se pela mediana. A escolha foi feita depois de ver os resultados e está declarada no [ADR-0012](adr/0012-razao-dos-vizinhos-pela-mediana.md). A variante com a soma continua na avaliação, para comparar.
- **Número de falhas da ①.** O método da viabilidade (a média da mesma hora) dava 96 falhas, muitas delas rajadas noturnas. O pipeline (a mediana, hora a hora) dá 20, e a evidência foi corrigida.
- **«A falha de uma RSU deixa todos os sensores sem comunicação».** O glossário e o texto da ideia diziam isto, e a ① mostrou que, na RSU0030, a maior parte dos segmentos continuou a enviar eventos. O texto foi corrigido.
- **A RSU dos segmentos como texto de uma lista JSON.** Um erro na tabela de sensores foi apanhado pelo trabalho da ① e corrigido na #26, sem mudar as falhas.
- **Processo:** um push saiu com um `rebase` a meio de um conflito (MR da #15). Foi corrigido logo, e desde então confirma-se que o `rebase` terminou antes de cada push.

## Regras

- Cada merge request tem a linha `IA usada em: … / validei: …`.
- Nada gerado por IA entra sem revisão humana e sem testes ou verificação nos dados.
- O trabalho do agente Programador leva o label `agente`, e o PO revê o diff de cada MR antes do merge (ADR-0011).
- No produto, o modelo de previsão (③) só entra se ganhar à referência «mesma hora, dia anterior» (ADR-0010).
