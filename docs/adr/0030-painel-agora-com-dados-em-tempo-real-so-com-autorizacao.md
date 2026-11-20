# O painel «agora» corre a ① sobre os dados em tempo real do Living Lab, só com autorização do IT

Status: aceite (17/11/2026); o IT recusou a autorização a 17/11, às 21h36 (#19, pergunta 16), por isso o painel com dados reais fica no roadmap. Em parte superseded by ADR-0032 (pontos 1 e 8): na demo, o painel corre sobre um simulador com dados fictícios, e a falha da RSU0030 também se simula. Complementa o ADR-0003 (resultados pré-calculados, sem base de dados), o ADR-0028 (dados ao vivo fora de âmbito) e o ADR-0029 (o «modo ao vivo» é uma reprodução da semana).

## Contexto

- Os 5 CSV do desafio são uma cópia, de 3 a 10/11, da plataforma do IT (`aveiro-living-lab.it.pt`), que trabalha em tempo real. O PDF do desafio (§4) descreve dashboards com uma vista «tempo real».
- O mentor CMA/IT respondeu a 17/11 (#19): «Não temos uma maneira/alerta para quando há uma ausência de dados.» A ① responde a esta falta. Com os dados desta semana, a #20 mostra que o alarme da RSU0030 viria cerca de 13 minutos depois da queda.
- O site do ATCLL Vision lê pontos de acesso JSON sem autenticação: `/api/crosswalks`, `/api/mobility/streets`, `/api/parking/occupancy` e `/api/tourism`. Foram vistos a 17/11 com um só pedido a cada um. Não estão documentados, não têm termos de uso, e alguns pedidos demoram 7 a 31 s. O acesso oficial é o Context Broker do IT, com token.
- O art. 22.º, n.º 2 das normas pede autorização expressa, e o ADR-0023 só aceita fontes com uso permitido.

## Decisão

1. **Só com a autorização escrita do IT.** O Moisés pediu-a ao mentor André Oliveira a 17/11; é a pergunta 16 da #19. Sem ela, o painel não entra na demo e fica no roadmap.
2. **Um painel «agora» opcional**, ao lado da demo. Para cada uma das 24 passadeiras e para os segmentos junto a elas, mostra «último dado há X min».
3. **«Sem comunicação» é uma regra nova**, que vive ao lado da falha inesperada da ① (pelo menos 2 h, no pipeline em lote) e não a substitui. Um sensor fica sem comunicação quando o silêncio, à hora atual, tem probabilidade inferior a `agora.prob_max` (10⁻⁶ por omissão) de ser acaso. A probabilidade vem do modelo de Poisson, com a taxa esperada desse sensor a essa hora, tirada do perfil horário da semana de 3 a 10/11.
   - **Por passadeira**, às 20h de um dia útil, o limite fica entre 33 e 44 min nas passadeiras movimentadas. Nas de pouco movimento é muito maior: na SC0020 chega a 6,9 h, também às 20h.
   - **Por RSU**, as passadeiras juntam-se e o limite desce: as 4 da RSU0030 juntas dão cerca de 13 min, que é o número da #20. O painel mostra os dois níveis.
   - O termo «sem comunicação» (o nome mudou a 20/11, por decisão do Moisés) entra no `GLOSSARY.md`, e o `agora.prob_max` entra no `config/riasense.yaml`.

   O estacionamento e as zonas turísticas ficam de fora.
4. **Um adaptador de fonte.** Começa pelos pontos de acesso que o IT autorizar, os do site ou o Context Broker com token. Trocar de fonte não muda o resto do código.
5. **Leitura a cada 60 s (`agora.intervalo_s`), só em memória.** Nada se grava em disco nem em base de dados, por isso o ADR-0003 continua válido. Reiniciar o serviço apaga o estado.
6. **Um interruptor desligado por omissão** (`agora.ativo: false` no `config/riasense.yaml`). O desenvolvimento e os testes usam **respostas sintéticas**, com valores inventados e a forma dos pontos de acesso vista a 17/11. Nunca são linhas copiadas dos CSV. Ficam versionadas em `tests/fixtures/`. Nunca leem a API do IT. As respostas reais só se recebem depois da autorização, e nunca entram no git.
7. **A demo offline não muda** (ADR-0028). Sem rede, ou sem resposta dentro do limite de tempo, o painel diz «sem ligação ao Living Lab» e o resto da app continua igual.
8. **O texto diz «agora»**, com a hora do último dado. A história da RSU0030 continua na reprodução da semana (ADR-0029).

## Consequências

- Prova ao vivo a falta que o mentor descreveu, sem mudar nenhum número do relatório nem da semana gravada.
- **Prazo:** a implementação vai de quarta, 18/11, depois das 17h (quando a fila de MR esvaziar), até quinta, 19/11, às 20h. Se a autorização não chegar até lá, o interruptor fica desligado e o painel vai para o roadmap.
- **Riscos:** os pontos de acesso podem mudar ou demorar. Por isso há o adaptador, um limite de tempo por pedido e a mensagem «sem ligação».
- **Fora de âmbito:** a ②, a ③ e a ④ ao vivo, o histórico, e o WebSocket C-ITS da app «realtime» (`detections`, `denms`, `trafficSignals`…).
- O ADR-0028 e o ADR-0029 citavam a «pergunta 13 da #19» como a autorização do WebSocket. A 13 é sobre os `denms` e os `srems`, e o WebSocket nunca chegou a ser perguntado. Os dois ADR passam a dizer isso, e remetem o tempo real pelos dashboards para a pergunta 16 e para este ADR.
