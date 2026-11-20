# As passadeiras desenham-se no mapa com a forma real, a partir das entidades de referência do Living Lab

Status: proposto (18/11/2026, pedido do João; decisões fechadas com o João no mesmo dia). Complementa o ADR-0033 (o marcador com o ícone do tipo) e o ADR-0034 (as ruas com sensor com a geometria real).

## Contexto

- Hoje, uma passadeira é só o seu marcador: um ícone num ponto. Não se vê onde a passadeira atravessa a rua, nem para que lado.
- **Os dados já têm a forma real.** As entidades de referência do Living Lab (`reference-entities/`) trazem:
  - `Crosswalk.csv`, com as 24 passadeiras desenhadas como polígonos (a zona listada onde se atravessa);
  - `SmartCrosswalk.csv`, com o polígono que cada sensor observa e o `refCrosswalk`, que liga o sensor à sua passadeira;
  - `Sidewalk.csv`, com os passeios de um lado e do outro (`refSidewalks`).
- Estes dados são do próprio Living Lab, e não uma fonte externa. Por isso não levam o aviso «por validar junto das entidades».

## Decisão

1. **O pipeline escreve `passadeiras.geojson`**, no passo `sensores`, a partir do `Crosswalk.csv`. Cada polígono leva o `id` do `SmartCrosswalk` que o observa (pelo `refCrosswalk`), o nome da rua (`roadName`) e a RSU. Nada se estima: se uma passadeira não tiver polígono, fica só com o marcador.
2. **A API serve-o em `GET /mapa/passadeiras`**, como as ruas com sensor (ADR-0034), só a ler o ficheiro.
3. **O mapa desenha-as como uma passadeira:**
   - **O asfalto:** o polígono da passadeira leva o seu próprio «asfalto», num cinzento escuro (token novo `--crosswalk-asfalto`), e as listas brancas ficam por cima. As ruas do mapa são linhas mais estreitas do que a passadeira e não há asfalto: sem isto, as listas brancas ficam a 1,27:1 do fundo no tema claro. O contraste das listas contra o asfalto é de pelo menos 3:1 (WCAG 1.4.11), nos 2 temas × 3 paletas do ADR-0040, e mede-se na implementação.
   - **As listas** são estilizadas, em número fixo por passadeira (5), paralelas ao lado curto do retângulo mínimo do polígono (o lado longo, de 10,3 m de mediana, é o da travessia).
   - **A camada:** por cima das ruas com sensor e dos troços em falha, e por baixo dos carros e dos marcadores. Um troço em falha fica interrompido em cada passadeira.
   - **O zoom:** a passadeira desenha-se a partir do 17 (a 16 mede cerca de 11 × 6 px e ficava tapada pelo marcador). **A partir do zoom 17, o marcador prende-se a uma ponta do polígono (no passeio)**, para a passadeira ficar à vista: no zoom da demo (17,6), a passadeira mede cerca de 34 × 19 px, e o marcador de 28 px, ao centro, tapava-a em cerca de três quartos. Abaixo do 17, vê-se só o marcador.
4. **O estado continua no marcador** (ADR-0033). A passadeira desenhada não muda de cor com o estado. Clicar nela abre o mesmo pop-up do marcador.
5. **Todas as 24**, em todos os separadores, porque fazem parte do mapa. Não são uma camada a ligar e desligar.

## Consequências

- Vê-se onde está cada passadeira e para que lado se atravessa (a partir do zoom 17), e na vista 3D (ADR-0037) as passadeiras ficam no chão, entre os edifícios.
- Não muda nenhum número: é a geometria que já vem com os dados.
- **Fora de âmbito:** as passadeiras sem sensor que só estão no OpenStreetMap (o ADR-0019 usa-o só para os atributos das 24) e os passeios (`Sidewalk.csv`), que ficam para depois, se fizerem falta.
- **Prazo:** entra no plano (decisão do PO, 19/11): implementa-se a #134, depois do !134 (ícones) no `main`.
