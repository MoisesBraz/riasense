# O «modo ao vivo» reproduz a semana acelerada na barra da hora, e não usa dados em tempo real

Status: proposto (17/11/2026). Complementa o ADR-0028 (a demo ao vivo). Complementado pelo ADR-0030 (o painel «agora», só com autorização do IT).

A equipa quer **demonstrar em tempo real**. Os dados ao vivo do Living Lab chegam à app «realtime» do IT por WebSocket (`denms`, `detections`, `trafficSignals`…), mas usá-los exige autorização (art. 22.º), que não foi pedida para o WebSocket, e um pipeline em fluxo que não temos. O tempo real pelos pontos de acesso dos dashboards é o ADR-0030 (pergunta 16 da #19). O que o júri precisa de ver «ao vivo» é a história: **às 20h06 de 04/11 a RSU0030 deixa de comunicar, e a RiaSense dá por isso**. Hoje isso mostra-se a mexer à mão na barra da hora, que é partilhada pelos 4 separadores (`BarraHora.tsx`).

## Decisão

1. A barra da hora ganha um botão **«▶ Reproduzir» / «❚❚ Pausar»**, que avança **1 hora por segundo** (constante na web) até ao fim do período, e pára aí.
2. Ao reproduzir a partir do fim, recomeça no início. O cursor continua a funcionar à mão (teclado e rato), e mexer-lhe não interrompe a reprodução.
3. O texto diz **«reprodução da semana de 3 a 10/11»**, e nunca «tempo real»: são dados históricos acelerados.
4. Com `prefers-reduced-motion`, o botão continua a funcionar, mas as transições de CSS ficam desligadas, como já acontece na app.

## Consequências

- Na demo: abre-se em 04/11 às 18h, carrega-se em ▶, e em 2 segundos as 4 passadeiras e a RSU0030 passam a vermelho, o painel ① mostra a falha de rede e o ② começa a preencher. A fala junta o número da #20: «com dados ao vivo, o alarme vinha cerca de 13 minutos depois da queda».
- Só muda a web, e nenhum número. Pode entrar antes da submissão, se o PO quiser.
- **Fora de âmbito:** ligar ao WebSocket do IT (precisa de autorização e de um ADR próprio) e a ① incremental (minuto a minuto) no pipeline. O ADR-0030 trata da ① sobre os dados em tempo real, só com autorização.
