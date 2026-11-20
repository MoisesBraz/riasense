# Na vista 3D, os peões e os veículos são modelos 3D, na quantidade medida e com o tipo de veículo medido

Status: aceite pelo Moisés (19/11/2026, pedido do João; pareceres do revisor nas notas 14181, 14284 e 14289): entra no plano, com as figuras da opção (a). **Altera o ponto 1 do ADR-0039**: os grupos de veículos formam-se primeiro pela categoria e só depois pela velocidade. Complementa o ADR-0034 (os carros são os medidos), o ADR-0037 (a vista 3D), o ADR-0038 (as passadeiras com a forma real) e o ADR-0040 (dia e noite). Alterado a 20/11 pelo Moisés (ponto 9, #209): as figuras também no ② e no ③, com os dados estimados e previstos, translúcidas e com selo.

## Contexto

- Na camada «Trânsito» (ADR-0034), cada grupo de cerca de 20 veículos medidos é um ponto neutro. Na vista inclinada (ADR-0037), um ponto parece um marcador, e não um veículo.
- **Os dados trazem o tipo de cada veículo medido** (`vehicleCategory`, já ingerido como `categoria`):
  - **A** motociclos;
  - **B** ligeiros;
  - **C** camiões (mercadorias);
  - **D** autocarros.

  A câmara vê as 4 categorias: 796 547 passagens de ligeiros, 31 383 de camiões, 11 300 de autocarros e 9 191 de motociclos. O radar só distingue A e B: 685 435 ligeiros e 74 537 motociclos. O V2X fica de fora, como no ADR-0034.
- **Os dados trazem as travessias de cada passadeira, por hora.** Não dizem quem atravessa: nem o sexo, nem a idade, nem o tom de pele.
  - Por passadeira e por hora, a mediana é de 21 travessias, o p90 de 92, o p99 de 422 e o máximo da semana de 650.
- **Às 20h de 04/11** (a demo) há 146 segmentos com 7 148 veículos medidos (357 grupos) e 22 passadeiras com 877 travessias. Só ficam vazios os troços em falha e as 4 passadeiras da RSU0030.
- **Os modelos já estão escolhidos e verificados**, à espera desta decisão. São 13 `.glb`, com 1,2 MB no total:
  - pessoas: 8 figuras dos pacotes «Animated Men» e «Animated Women» da Quaternius (CC0), com as animações de andar e de estar parado;
  - veículos: 2 ligeiros do «Cars Pack» e 1 camião do «Zombie Apocalypse Kit», todos da Quaternius (CC0);
  - autocarro e mota: modelados pela equipa no Blender, no mesmo estilo, porque não havia um CC0 profissional disponível.

  A fonte e a licença de cada modelo estão no `LICENCAS.md` que vai com os ficheiros. Todos têm escala real, a origem no chão, ≤ 5 000 triângulos e compressão meshopt.

## Decisão

1. **Onde aparecem:** na vista inclinada do ecrã largo (os 25° com que o mapa abre e os 55° do botão «3D», ADR-0037), a partir do zoom 17. Abaixo do zoom 17, na vista de cima e no telemóvel (que é sempre de cima) ficam os pontos do ADR-0034.
2. **Os veículos têm o tipo medido, e os totais mantêm-se.**
   - Em cada hora, o número de grupos de cada categoria é o total dessa categoria em todos os segmentos da zona a dividir por `carros.veiculos_por_ponto`, repartido pelos segmentos pelo método dos maiores restos, no passo `carros`. Assim, o resultado não muda ao deslizar o mapa, fica no Parquet, e as categorias raras não desaparecem: na semana, ficam 560 grupos de autocarros contra 563 esperados, onde arredondar segmento a segmento deixava 42 a 61.
   - Dentro de cada segmento e categoria, as passagens ordenam-se pela velocidade e dividem-se pelos grupos dessa categoria. Cada grupo leva a mediana da velocidade e o anel de excesso do ADR-0039.
   - Nos segmentos com radar, que só distingue A e B, há apenas ligeiros e motas.
   - O passo `carros` passa a escrever, em `segmentos_hora.parquet`, as passagens de cada categoria e as velocidades dos grupos por categoria. Nada se estima.
3. **Os peões seguem o mesmo modelo dos carros.**
   - As figuras da hora aparecem todas ao mesmo tempo na passadeira e atravessam de um passeio ao outro, a uma velocidade de passo de 1,3 m/s × um fator de aceleração. A animação de andar acelera na mesma proporção.
   - **O fator dos peões fixa-se na implementação, depois de se ver no ecrã**, e não é o `carros.aceleracao` à partida. O `carros.aceleracao` passa de 8 a 3 (decisão do Moisés, 19/11, pedido do João): com 8, uma figura atravessava os 10,3 m da mediana em cerca de 1 s, o que parecia uma corrida.
   - 1 figura vale cerca de `pessoas.travessias_por_figura` (10) travessias, com um máximo de `pessoas.figuras_max` (12) por passadeira. Assim, o p90 (92) dá 9 figuras e o p99 fica no teto. A legenda diz: «cada figura ≈ 10 travessias medidas nesta hora, até 12 por passadeira» (acima de 120 travessias numa hora, 6 % das horas com travessias, cada figura vale mais de 10).
   - Uma passadeira em falha à hora escolhida (①) fica sem figuras. Não há peões nos passeios nem em ruas sem sensor.
4. **O aspeto das figuras: opção (a)** (decisão do Moisés, 19/11). A (b) fica registada, e troca-se sem mexer no resto se o Moisés o pedir.
   - **(a) Silhuetas neutras, todas iguais**, numa cor neutra como os veículos. Não sugerem quem atravessa, e não há nada a explicar. Usa os mesmos modelos com um material neutro único. É a recomendação do revisor.
   - **(b) Figuras variadas** (homens e mulheres, com tons de pele diferentes), com uma mistura equilibrada e fixa (semente), que não depende do sítio nem da hora, e com a legenda «o aspeto das figuras é ilustrativo». Nunca se diz que o mapa mostra quem atravessa. É o pedido do João.
5. **Os veículos têm cores neutras.** A única cor de estado é o anel de excesso (ADR-0039). A velocidade em número continua junto ao modelo, a partir do zoom 17 (ADR-0039, ponto 3).
6. **A luz dos modelos segue a do mapa** (ADR-0040): de noite, os modelos escurecem como os edifícios.
7. **Como se desenha:** uma camada à medida do MapLibre com o Three.js, que usa o mesmo relógio da animação dos pontos e instâncias por modelo. Os `.glb` carregam-se com o descodificador meshopt local, sem rede (ADR-0014). Com `prefers-reduced-motion`, os modelos ficam parados, na mesma quantidade.
8. **Desempenho (decisão do Moisés, 19/11):** ≥ 30 fps **com GPU** (aceleração por hardware ligada, como num portátil comum e no da demo), com o ▶ e o «Trânsito» ligados; medido: 66 fps. **Sem GPU** (no Chromium sem GPU dá 6 fps), o recuo põe a vista de cima e ficam os pontos, também quando se carrega no «3D». O vídeo de reserva grava-se com a GPU ligada.

9. **No ② Completar e no ③ Prever, as figuras também andam, com os dados desses separadores** (decisão do Moisés, 20/11, 01h; #209). Na vista 3D, a partir do zoom 17, com o ▶ como no ①:
   - **No ②**, os peões e os carros seguem as contagens dos sensores virtuais (`sensores_virtuais.parquet`) nas horas em que o sensor esteve em falha: as passadeiras (a razão) e os segmentos (a ridge, ADR-0046). Nas outras horas, seguem as contagens medidas. O estacionamento não se completa (ADR-0005).
   - **No ③**, seguem as contagens previstas daqui a 3 h (`previsoes.parquet`, ADR-0027) para as passadeiras e os segmentos, à hora t + 3 h que a app mostra. Só há previsões nas 48 h do teste (de 08/11 às 08h a 10/11 às 10h): fora delas, o ③ fica sem figuras.
   - **As estimadas e as previstas distinguem-se das medidas:** as figuras ficam **translúcidas**, e o mapa mostra um selo, «Estimado (sensor virtual)» no ② e «Previsto daqui a 3 h» no ③. É a mesma lógica do tracejado dos estimados (ADR-0007).
   - **Nada se estima onde a ② e a ③ não têm valor**: sem estimativa nem previsão nesse sítio e a essa hora, não há figuras (ADR-0007).
   - **Os carros nos segmentos contam todos os sensores** (câmara, radar e V2X somados, `completar.py` e `prever.py`), ao contrário do ADR-0034 («nunca somados»). Em média, dão 1,67 vezes os carros do ①. **Decisão do Moisés (20/11): os carros ficam, com o aviso** no selo, «soma de todos os sensores: mais carros do que no ①». Corrigir a ② e a ③ para um só sensor mexia nos números da ③ do pitch.
   - **Os Parquet só têm o total**, sem o tipo nem a velocidade: os carros estimados e previstos usam todos o modelo do ligeiro, sem anel de excesso nem número de velocidade (ADR-0039). Os grupos repartem-se pela zona com os maiores restos, como no ponto 2, para os segmentos com poucos carros não ficarem vazios.
   - O resto deste ADR mantém-se: as cores neutras, a luz e os ≥ 30 fps com GPU.
   - **Prazo:** se a implementação não estiver aceite até às 11h de 20/11, fica de fora (decisão do Moisés).

## Consequências

- O júri vê a cidade a funcionar com os números reais: ligeiros, camiões, autocarros e motas nas ruas, e pessoas a atravessar nas passadeiras. Às 20h06 de 04/11, quando a RSU0030 deixa de comunicar, os troços em falha ficam sem carros e as 4 passadeiras da RSU0030 ficam sem peões.
- **Honestidade:** o tipo de veículo e as quantidades são medidos. O aspeto das pessoas não é medido: com a opção (b), a legenda di-lo; com a (a), não sugere nada.
- **Custo:**
  - o Three.js é uma dependência nova (cerca de 170 kB comprimidos no bundle), e há um 2.º ciclo de desenho;
  - os modelos somam 1,2 MB.
- **Fora de âmbito:**
  - modelos fotorrealistas pesados e animações de cada veículo (portas, luzes);
  - a cor real de cada veículo;
  - peões fora das passadeiras;
  - o sexo, a idade ou o tom de pele de quem atravessa (os dados não os têm).
- **Prazo:** a #136 (vista 3D) e a #137 (velocidade por grupo) já fecharam. Implementa-se só se o Moisés aceitar este ADR, pelo agente do João e pelo agente ajudante. O código fecha às 13h30 de 20/11 e a equipa submete às 15h30 (o prazo oficial é às 17h30; decisão do Moisés, 19/11). Se não estiver no `main`, pronto e a ≥ 30 fps com GPU até às 13h30 de 20/11 (para se regravar o vídeo de reserva), fica no roadmap.
