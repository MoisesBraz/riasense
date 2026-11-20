# Cada carro do mapa mostra a velocidade medida, com um anel vermelho néon só acima do limite da via

Status: proposto (18/11/2026, pedido do João; decisões fechadas com o João no mesmo dia). **Altera os pontos 3, 4 e 6 do ADR-0034 e acrescenta ao ponto 1 do ADR-0033 o anel de excesso:**
- **ADR-0034, ponto 3:** a velocidade de cada ponto passa a ser a mediana do seu grupo de veículos, e não a média do segmento.
- **ADR-0034, ponto 4:** os pontos continuam neutros, mas os que estão acima do limite levam um anel vermelho néon.
- **ADR-0034, ponto 6:** o `segmentos_hora.parquet` ganha as velocidades dos grupos e o limite da via.
- **ADR-0033, ponto 1:** junta-se aos estados o anel de excesso, que não é um estado do sensor.
- **O ponto 1 deste ADR é alterado pelo ADR-0041:** os grupos de veículos formam-se primeiro pela categoria (motociclo, ligeiro, camião, autocarro) e só depois pela velocidade, com os totais de cada categoria mantidos por hora.

## Contexto

- Na camada «Trânsito» (ADR-0034), cada ponto vale cerca de 20 veículos medidos nessa hora, e todos os pontos de um segmento andam à mesma velocidade, que é a média da hora.
- **Os dados têm a velocidade de cada veículo e o limite da via.** Cada passagem medida pela câmara ou pelo radar traz a `vel_media_ms` do veículo e a `vel_limite_ms` do segmento. O limite é um só por segmento: 50 km/h em 175 segmentos, 40 km/h em 3 e 30 km/h em 16.
- **Há excesso medido:** 4,6 % das passagens medidas pela câmara e 11,8 % das medidas pelo radar estão acima do limite.
- **Mas o excesso depende do sensor.** O 10084 e o 11168 (Av. 25 de Abril, limite de 30 km/h, a rua da RSU0030) passam a usar o radar a semana toda (ADR-0034, ponto 1). Nas 30 horas em que os dois sensores mediram, o radar dá 38,9 % e 36,9 % de passagens acima do limite, e a câmara 10,0 % e 9,3 % (medianas de 25,2 e 24,5 km/h no radar, contra 12,4 e 10,7 na câmara). Nos 51 segmentos com os dois sensores na mesma hora, a diferença é menor: o radar dá mais 1,0 km/h de mediana, e 9,6 % contra 6,4 % acima do limite. Na rua da demo, os anéis vêm por isso em boa parte do sensor, e não só de quem conduz.
- A ④ (Proteger) já estuda a velocidade junto às passadeiras. O mapa ainda não a mostra.
- **O conflito com outras decisões:**
  - o ADR-0034 (ponto 4) diz «sem verde nem vermelho: essas cores são só para os estados do sensor»;
  - o ADR-0033 usa o verde para «Ativo» e o vermelho para «Falha»;
  - o ponto 1 do ADR-0033 divide a «Falha» em duas cores: a de rede (vermelho) e a de dispositivo (magenta, `--state-device`).

## Decisão

1. **Cada ponto é um grupo de veículos medidos, não um carro inventado.**
   - Em cada segmento e em cada hora, as passagens medidas ordenam-se pela velocidade e dividem-se em tantos grupos quantos os pontos (cerca de 20 veículos cada, `carros.veiculos_por_ponto`).
   - O ponto leva a **mediana da velocidade do seu grupo**, e anda a essa velocidade (× `carros.aceleracao`).
   - Assim, um segmento com alguns carros depressa mostra alguns pontos mais rápidos, e não uma média única.
2. **O anel só aparece acima do limite:** um anel **vermelho néon** (token novo `--speed-excess`, mais saturado do que o vermelho da «Falha», com um contorno fino na cor do fundo) à volta do ponto, quando a velocidade do grupo passa o limite da via. No limite ou abaixo dele, não há anel. O ponto mantém a cor neutra do ADR-0034.
   - Não há verde: o verde continua a ser só o «Ativo» dos sensores (ADR-0033).
   - O anel é um contorno e não um ícone preenchido, por isso não se confunde com o marcador de um sensor em falha.
3. **A velocidade escreve-se em km/h junto ao ponto**, por exemplo «47», a partir do zoom 17 (com menos zoom ficavam demasiados números), e sempre ao passar o rato. Assim o excesso não se vê só pela cor (WCAG 1.4.1).
4. **A legenda diz:** «Anel vermelho: acima do limite da via. Velocidade medida, mediana de cerca de 20 veículos». O pop-up do troço diz o limite da via, a percentagem de veículos acima dele nessa hora e o sensor («pela câmara» ou «pelo radar»). Num troço medido pelo radar, acrescenta: «o radar e a câmara medem velocidades diferentes: o excesso não é comparável entre sensores». Sem passagens numa hora, o pop-up diz o sensor do troço, e nunca «nem pelo radar». **A legenda e o pitch não dão percentagens de excesso por rua nem usam os anéis da Av. 25 de Abril como prova de excesso** (decisão do PO, 19/11).
5. **Os dados:** o passo `carros` passa a escrever, em `segmentos_hora.parquet`, a lista das velocidades dos grupos (`velocidades_kmh`) e o limite (`limite_kmh`). A API devolve-os em `GET /mapa/carros`. Nada se estima.
6. **O que nunca se diz:** «este carro ia a X km/h». Cada ponto é um grupo de cerca de 20 veículos. Também não há matrículas, identificação nem tempo real (os dados são da semana de 3 a 10/11).

## Consequências

- O júri vê onde e a que horas se anda acima do limite, ao lado das passadeiras da ④, e a história liga o trânsito à segurança dos peões.
- **Cores:** fica um só sinal, o excesso. O vermelho néon tem de se distinguir do vermelho da «Falha» (e do magenta da falha de dispositivo do ADR-0033), nos 2 temas × 3 paletas do ADR-0040 (6 fundos), com contraste ≥ 3:1 medido no contorno do anel, também na noite em cinzento médio do tema claro. A legenda mostra o anel ao lado dos estados.
- **Risco:** o mapa pode parecer fiscalização. Por isso o texto diz «medido, por grupos de cerca de 20 veículos» e nunca identifica ninguém.
- **Fora de âmbito:** a velocidade ao segundo, o percurso de cada veículo e o V2X (que fica de fora, como no ADR-0034).
- **Prazo:** entra no plano (decisão do PO, 19/11): implementa-se a #137, depois do !134 (ícones) no `main`. Depende do !103 (a camada dos carros e o passo `carros`), já no `main`.
- O PO aceita o anel vermelho néon: distingue-se da «Falha» por ser um contorno com a velocidade em número (WCAG 1.4.1). O contraste ≥ 3:1 mede-se na implementação, nos 2 temas × 3 paletas.
