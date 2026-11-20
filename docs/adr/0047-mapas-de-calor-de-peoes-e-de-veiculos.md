# Duas camadas de mapa de calor, de peões e de veículos, pela hora escolhida e só onde há sensor

Status: aceite pelo Moisés (19/11/2026, pedido do Moisés; decisões fechadas com ele no mesmo dia, #158). Complementa o ADR-0007 (sem estimativas onde nunca houve sensor), o ADR-0033 (as cores dos estados e as camadas), o ADR-0034 (os carros medidos) e o ADR-0040 (dia e noite).

## Contexto

- O mapa mostra o estado de cada sensor (ADR-0033) e os carros medidos (ADR-0034), mas não mostra **onde há mais movimento** numa hora.
- **Há série medida hora a hora:** as travessias das 24 passadeiras (`proteger_intervalos.parquet`, `GET /proteger/intervalos`, já com o `useTravessiasDaHora`) e os veículos dos segmentos com câmara ou radar (`segmentos_hora.parquet`, `GET /mapa/carros`). As coordenadas vêm de `/sensores` e das geometrias que já existem.
- **As zonas turísticas não têm série medida por hora** nos dados processados: só os estimados (`sensores_virtuais.parquet`), as previsões do teste e um perfil típico. As visitas reais por hora estão nos dados intermédios, fora do repositório.
- Nas horas de falha, a ② dá o valor estimado (`sensores_virtuais.parquet`), também nos segmentos desde a #29.

## Decisão

1. **Duas camadas nas «Camadas», desligadas por omissão:** «Calor · peões» e «Calor · veículos». **São exclusivas** (revisto a 19/11): ligar uma desliga a outra, porque têm a mesma rampa (ponto 5) e, juntas, não se distinguiam. Cada uma pode estar ligada com o «Trânsito».
2. **Seguem a hora do cursor** (e o ▶), com os dados do dataset. Para as passadeiras e os segmentos lê-se o que as rotas acima já servem. **Para as zonas turísticas há um passo novo no pipeline** (decisão do Moisés, Q15): `zonas_hora.parquet`, com as visitas medidas por zona e por hora, calculado a partir dos dados brutos (`data/interim/visitas`), sem estimar nada; e uma rota que só o lê. É a exceção ao ponto 6 do ADR-0033 (só ler Parquet que já existam).
3. **Só onde há sensor** (ADR-0007), **num mapa de calor que soma os sensores próximos** (revisto a 19/11, pedido do João; substitui as «nuvens sem soma»). Com uma nuvem por sensor, o mapa mostrava cada ponto e não **onde há mais movimento na cidade**, e de longe não se via. Agora usa-se o «heatmap» do MapLibre:
   - **Soma:** os sensores próximos somam-se (os dois sentidos da mesma rua; a SC0019 a SC0022), e as zonas com mais movimento ficam com a cor mais forte.
   - **Raio e intensidade em pixels**, que crescem com o zoom, para se ver também com a cidade inteira à vista. De perto, a mancha continua centrada no sensor.
   - **Rampa:** começa transparente. Um sensor fraco e isolado quase não pinta.
   - **Raiz quadrada da intensidade:** a medida tem cauda longa (nos segmentos, a mediana é 3 % do máximo da semana).
   - **Peões:** as 24 passadeiras, com as travessias da hora, no ponto da passadeira, e **as zonas turísticas**, com as visitas da hora (`zonas_hora.parquet`), no ponto da zona.
   - **Veículos:** uma mancha **no meio de cada segmento** com câmara ou radar, com os veículos medidos nessa hora (o sensor do ADR-0034, ponto 1).
   - **Nas horas de falha** entra o valor estimado da ② (na mesma medida que o medido: razão mediana de 1,0 nas passadeiras e nos segmentos), e o «ⓘ» do painel diz «inclui estimados». Onde nem a ② tem valor, não há nuvem.
4. **A escala é fixa na semana** (cada sensor pesa a sua medida a dividir pelo máximo do tipo; a soma de vários perto uns dos outros pode saturar) (o máximo inclui os estimados), para se poder comparar entre horas. As visitas das zonas contam-se pela hora de entrada. **Cada tipo normaliza-se primeiro pelo seu máximo da semana** (passadeiras, zonas e segmentos à parte). Os peões (passadeiras e zonas) ficam na mesma camada e **somam-se** já normalizados; os veículos ficam noutra camada e não se somam com os peões, e o «ⓘ» do painel diz «intensidade relativa a cada tipo de sensor» e «as manchas somam os sensores próximos; a cor é relativa e não é a medida de um só sensor» (a legenda só tem o nome, ADR-0048).
5. **Cores** (revisto a 19/11, pedido do João): a **rampa clássica dos mapas de calor**, de pouco para muito: transparente, azul, ciano, verde, amarelo, laranja e vermelho. É a mesma para os peões e para os veículos, e a legenda mostra-a com «pouco → muito». Substitui o violeta e o azul-petróleo, que se liam como uma só cor.
   - **Choca com as cores dos estados** (o verde, o vermelho e o âmbar, ADR-0033). Para não se confundirem: as manchas ficam por baixo dos marcadores, das ruas com sensor, das passadeiras e dos carros, e os estados leem-se também pelo ícone, pela forma e pelo halo. As camadas de calor estão desligadas por omissão. Sobre o calor, o contraste das cores de estado não está garantido, como na vista aérea (ADR-0045, ponto 7).
   - Leem-se nos 2 temas × 3 paletas do ADR-0040.
6. **Separadores:** em todos menos no mapa de risco potencial (que já tem a sua escala).
7. **Legenda** (ADR-0048): o símbolo e o nome de cada camada («Calor · peões», «Calor · veículos») e «pouco → muito». Mais nada.
8. **Desempenho:** ≥ 30 fps com GPU, com o ▶, o «Trânsito» e uma das camadas de calor ligada (ADR-0041, ponto 8).

## Consequências

- Vê-se onde e quando há mais gente a atravessar e mais carros, ao lado das passadeiras da ④.
- **Honestidade:** é a medida dos sensores, não uma estimativa da cidade; as zonas sem sensor ficam sem cor.
  Com a soma e o raio em pixels, uma mancha pode juntar vários sensores e, com pouco zoom, cobrir ruas sem sensor à volta. Por isso, o «ⓘ» do painel diz «as manchas somam os sensores próximos; a cor é relativa e não é a medida de um só sensor».
- **Fora de âmbito:** o estacionamento (sem série medida por hora), a interpolação entre sensores e os peões fora das passadeiras e das zonas.
- **Prazo:** implementa-se pelo agente do João (#160). O código fecha às 13h30 de 20/11 (a equipa submete às 15h30); se não estiver pronto para revisão até às 10h de 20/11, fica no roadmap.
