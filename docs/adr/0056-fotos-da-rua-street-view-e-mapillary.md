# A camada «Fotos da rua»: abrir a Street View e a Mapillary no sítio do clique, fora da RiaSense

Status: **revogado** pelo Moisés (19/11/2026, 22h45), a pedido do João (nota 15732): a camada sai do projeto. Abrir sites de terceiros a partir da demo não acrescenta à RiaSense e o resultado ficou fraco. Antes: aceite pelo Moisés (19/11/2026, pedido do João; entrou no `main` com o 561811e). **Abria uma exceção ao filtro 3 do ADR-0023, que fecha com a revogação** (fontes com licença aberta e que funcionem sem rede), decidida pelo Moisés, como a do ADR-0049 para o «Ao vivo». Complementa o ADR-0014 (o mapa sem rede), o ADR-0023 (as fontes abertas), o ADR-0045 (a vista aérea) e o ADR-0050 (as alturas dos edifícios).

## Contexto

- O João quer ver **as fachadas reais** dos edifícios e da rua. A ortofoto (ADR-0045) e o LiDAR (ADR-0050) só veem de cima.
- O João não quer **cores pintadas** nos edifícios 3D. Medir a cor do telhado na ortofoto e pintar o edifício inteiro com ela (no MapLibre, um `fill-extrusion` tem uma só cor) seria inventar as fachadas.
- **Street View** (Google) e **Mapillary** têm fotografias ao nível da rua. Embutir qualquer delas pede uma chave de API (Google) ou um token (Mapillary), e as condições não deixam guardar as imagens. **Abrir um link** para o sítio não pede chave: a página «Maps URLs» da Google (developers.google.com/maps/documentation/urls) documenta a forma `api=1&map_action=pano&viewpoint=lat,lng` e diz que estes links não precisam de chave da API.
- **Licenças:** a Street View não tem licença aberta (por isso é uma exceção ao ADR-0023). As fotografias da Mapillary têm a licença CC BY-SA 4.0, e a atribuição de cada foto fica no site da Mapillary, porque a RiaSense não as mostra.
- A demo corre sem rede (art. 22.º, n.º 6; ADR-0014).

## Decisão

1. **Uma camada «Fotos da rua»** nas «Camadas», desligada por omissão, em todos os separadores.
2. **Com ela ligada, um clique no mapa** (fora dos marcadores e dos popups) abre um pequeno popup nesse ponto, com dois links que abrem num separador novo: «Street View» (`https://www.google.com/maps/@?api=1&map_action=pano&viewpoint={lat},{lon}`) e «Mapillary» (`https://www.mapillary.com/app/?lat={lat}&lng={lon}&z=17&focus=photo`). O resto do clique continua igual: no asfalto da avenida ou numa rua com sensor, abrem o troço e o popup; numa rua sem sensor, o painel da rua e o popup, porque a Street View está nas ruas. Na zona da demo quase tudo é asfalto ou rua com sensor: só no sítio vazio, a camada quase nunca abria (visto pelo João a 19/11). O popup fica por cima dos marcadores. O cursor passa a «crosshair».
3. **Nada embutido, nenhuma chave nem token, nada guardado.** A RiaSense não descarrega nem mostra as imagens: só abre o link.
   - **Privacidade:** a Google e a Mapillary desfocam as caras e as matrículas. A Mapillary diz que falha 1 em cada 1000, mas o número é dela, e ninguém o verificou. O clique envia as coordenadas do ponto à Google ou à Mapillary, a partir do browser de quem clica. O link vai com `noreferrer`, por isso o endereço da RiaSense não segue. O Moisés aceitou estes riscos (19/11).
   - **Fontes:** a janela «Dados locais» (ADR-0048, ponto 2) lista «Fotos da rua: Google Street View e Mapillary (CC BY-SA 4.0), abrem fora da RiaSense e precisam de Internet».
4. **Sem Internet**, os links ficam desativados, e o popup diz «Sem Internet: as fotos da rua não abrem». A demo continua toda offline. Esta é a única camada que precisa de rede, e só quando se clica (o «Ao vivo» do ADR-0049 também precisa, mas é um modo, não uma camada). «Sem Internet» lê-se no `navigator.onLine`, que só vê se há uma interface de rede: numa rede sem saída para a Internet, os links ficam ativos e o separador novo abre com um erro, o que a frase «precisam de Internet» já diz.
5. **Honestidade:** o popup diz «Fotografias de terceiros, abrem fora da RiaSense e precisam de Internet; não são dados da demo». As fotografias não têm data da semana dos dados, e o que lá aparece (carros, pessoas) não entra em nenhum número.
6. **Os edifícios 3D mantêm as cores da paleta** (ADR-0037, ADR-0040). Não se pintam com cores medidas nem inventadas.

## Consequências

- Vê-se a rua real a partir de qualquer ponto do mapa, sem custos, sem chaves e sem quebrar o modo offline.
- **Fora de âmbito:** embutir as imagens na página, guardar fotografias e pintar os edifícios.
- **Prazo:** implementa-se pelo agente do João (o agente ajudante, revisto por ele). Se não estiver pronta para revisão até às 10h de 20/11, fica no roadmap.
