# Os semáforos das passadeiras da zona na vista 3D, em posições ilustrativas

Status: proposto (20/11/2026, pedido do João, para entrar antes do pitch). Complementa o ADR-0019 (os atributos das passadeiras pelo OpenStreetMap), o ADR-0024 (as passadeiras com semáforo), o ADR-0038 (as passadeiras desenhadas) e o ADR-0041 (a camada 3D com o Three.js).

## Contexto

- Na vista 3D, as passadeiras da zona aparecem desenhadas (ADR-0038), mas sem o que as torna seguras ou não: o semáforo e o sinal de passadeira. A ④ Proteger e o risco potencial usam essa diferença (ADR-0024: as 5 com semáforo saem da anomalia de abrandamento).
- O OpenStreetMap diz quais têm semáforo (SC0011, SC0012, SC0013, SC0020 e SC0021), mas os nós `highway=traffic_signals` ficam no eixo da via, e os postes não estão medidos.
- Não há modelos 3D abertos do sinal H7 português nem dos semáforos com a forma certa.

## Decisão

1. **Um modelo feito pela equipa** em Blender, pelo Regulamento de Sinalização do Trânsito, com um script que corre sem interface (`web/scripts/modelos/sinalizacao.py`): `semaforo.glb` (960 triângulos, 48 KB: um poste com um braço em arco de 4,6 m por cima das faixas, com a cabeça dos veículos e a dos peões, um material por lâmpada). A forma segue o Regulamento; não usa nem copia imagens de terceiros (nem a Street View, ADR-0023). Só cores, sem texturas. A origem e a licença ficam no `web/public/modelos/LICENCAS.md`.
2. **Só os semáforos que o OpenStreetMap conhece, na zona da demo:** a SC0020 e a SC0021 (ADR-0024; ODbL, «por validar com a Câmara»). As outras passadeiras com semáforo (SC0011 a SC0013) ficam fora da zona.
3. **Os sinais H7 ficam de fora.** A única fonte da sua presença na SC0019 e na SC0022 era uma captura da Street View, que não tem licença aberta (ADR-0023, filtro 3; o ADR-0056 foi revogado). O código já os sabe desenhar (`sinal_h7.glb`), mas a lista `mapa.sinais_h7` do config fica vazia. Só entram com uma foto tirada pela equipa (dado próprio).
4. **Onde e como:** numa só ponta de cada passadeira, no passeio, do lado de onde vem o trânsito (trânsito pela direita) e virado para ele: o da 2.ª ponta ficava na via contrária. **A posição é ilustrativa**, porque os postes não estão medidos («a confirmar no local», no config e no `LICENCAS.md`). As luzes andam em ciclo, em tempo real: os carros verde 6 s, amarelo 2 s, vermelho 6 s, amarelo 2 s; os peões só a verde com os carros a vermelho. Com «reduzir movimento», ficam parados.
5. **Quando aparecem:** como as figuras do ADR-0041, ponto 1: com o mapa inclinado (a partir de 10°, por isso também nos 25° com que o mapa abre no ecrã largo) e a partir do zoom 17, com ou sem o «Trânsito». **Entram no vídeo de reserva** das 13h30, que grava o mapa inclinado com as figuras. Mantêm os ≥ 30 fps do ADR-0041, ponto 8; no recuo para a vista de cima, não aparecem. Nenhum número muda.

## Consequências

- Mais: na vista 3D vê-se de relance que passadeiras têm semáforo e quais só têm o sinal, que é a diferença que a ④ mede.
- Menos: 48 KB de modelo; as posições não são medidas, e o texto di-lo.
- **Fora de âmbito:** as outras passadeiras da cidade, os sinais H7 sem foto da equipa, os sinais de limite de velocidade e os postes medidos.
