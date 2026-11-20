# Na vista 3D, os carros não passam por cima dos peões; a paragem é ilustrativa e a legenda di-lo

Status: aceite pelo Moisés, com a opção (d), na condição das 10h (19/11/2026; parecer do revisor na nota 14487, decisão na nota 14514): a (d) só entra se a implementação estiver pronta para revisão até às 10h de 20/11, a ≥ 30 fps com GPU, sem a fila na avenida da demo e com a frase da legenda. **Se não estiver, fica a (c)**, que é o que o `main` tem hoje: os carros passam por cima das figuras. **Altera** o ADR-0041 (ponto 3: as figuras atravessam todas ao mesmo tempo) e o ADR-0039 (o veículo anda sempre à velocidade do grupo, com o número e o anel). Tem de ser coerente com o ADR-0006 e com a ④.

## Contexto

- No !149 (ADR-0041), os carros andam sempre à velocidade do grupo e as figuras atravessam sem parar. **Na vista 3D, os carros passam por cima das pessoas.** O João viu-o e não o aceita: «os carros não podem atropelar as pessoas».
- **O ADR-0006** diz que os dados não mostram a interação entre um peão e um veículo: as coincidências ficam ao nível do acaso. A ④ mede outra coisa: se, numa passadeira, os condutores abrandam quando há mais travessias. Marca risco potencial onde não abrandam.
- **Qualquer animação sem atropelamentos mostra um comportamento que não é medido:** ou os carros param, ou os peões esperam. O revisor (nota 14366 do !149) aponta o risco: se todos os carros pararem em todas as passadeiras, o júri vê uma mensagem que não bate com a ④ nas passadeiras de risco.
- **Já há uma implementação** no ramo `feat/paragem-nas-passadeiras` (o `aa8f76b`), e foi retirada do !149 para não o atrasar. Funciona assim:
  - cada passadeira tem um ciclo: as figuras esperam no passeio cerca de 5 s e atravessam juntas;
  - enquanto atravessam, e 1,5 s antes, os carros param antes da passadeira, em fila, sem ficarem parados em cima dela;
  - aceleram e travam como carros;
  - com 56 fps no ▶ com GPU.

## Decisão

1. **Opções (o Moisés escolhe):**
   - **(a) Os carros param para os peões, como ilustração.** É a implementação do ramo. A legenda diz «Vista 3D: a paragem dos carros nas passadeiras é ilustrativa. Os dados não medem se cada condutor parou; a ④ mede se abrandam». É o pedido do João.
   - **(b) Os peões esperam por uma aberta no trânsito**, e os carros nunca param. Os carros mantêm a velocidade do grupo (ADR-0039 sem alteração). Não sugere que os condutores param. A legenda diz «a espera dos peões é ilustrativa».
   - **(c) Fica como no !149:** os carros passam por cima das figuras. É a mais fiel ao ADR-0039, e a pior à vista.
   - **(d) Os peões esperam por uma aberta e, sem ela, pedem passagem: os carros param.** É a escolha do João. Está implementada no ramo `feat/148-peoes-esperam-aberta` (`web/src/dominio/cena3d.ts`).
     - **Como funciona:** os peões esperam 10 s no passeio e atravessam se houver uma aberta. Se não houver em mais 5 s, os carros travam antes da passadeira e os peões atravessam com ela livre.
     - **A fila:** os carros só fazem fila atrás de um carro parado ou a travar. Sem isto, os grupos mais rápidos ficavam presos atrás do mais lento e não andavam à velocidade medida.
     - **Ultrapassar:** cada segmento tem uma só linha, por isso um carro mais rápido ultrapassa pelo lado: desvia-se 2,5 m para a esquerda enquanto passa o da frente, e volta. Não passa através dele.
     - **A fila mostra no máximo 4 carros por passadeira:** os grupos dão a volta ao segmento (ADR-0034), o que dá um fluxo acima do real. Com a paragem, todos os grupos de um segmento acabavam na fila (às 19h, uma fila longa atrás da SC0019, na rua e na hora da demo). À espera, só se veem os 4 primeiros carros; os outros grupos ficam escondidos enquanto esperam e reaparecem quando a fila anda. Nenhum grupo se perde, e a velocidade medida não muda.
     - **Medido com os dados de 05/11, com as acelerações do config:**
       - às 17h, cada figura anda cerca de 26 s em cada 180 s, e os carros ficam sem a velocidade do grupo (parados, a travar ou a arrancar) 23 % do tempo;
       - às 03h, são 59 s e 3 %.
     - **Comparação com a (b), só com abertas:** às 17h, cada figura andava menos de 2 s em 120 s. Na animação, os grupos dão a volta ao segmento sem parar, e o fluxo fica muito acima do real.
     - **A legenda:** «Os peões esperam por uma aberta e, sem ela, os carros param: é ilustrativo, os dados não medem se cada condutor parou (a ④ mede se abrandam)».
2. **Com a (a), a (b) ou a (d), o número e o anel de excesso só aparecem enquanto o veículo anda à velocidade do grupo.** É a velocidade medida (ADR-0039). Parado, a travar ou a arrancar, o veículo não mostra uma velocidade que não tem. Isto acrescenta ao ADR-0039, ponto 3.
3. **As quantidades, o tipo e a velocidade continuam medidos** (ADR-0041). O ciclo de espera e de travessia, e a paragem, são só a animação.
4. **Movimento reduzido:** com o tempo parado, nenhum carro fica em cima de uma passadeira com figuras. A imagem parada começa com a passadeira livre (could da nota 14366).

## Consequências

- **O que melhora:** a vista 3D deixa de mostrar atropelamentos.
- **Risco com a (a):** a imagem «os carros param sempre» pode ser lida como medida. Por isso a frase da legenda é obrigatória, e o guião do pitch não a usa como resultado.
- **Desempenho:** com a (a), 56 fps com o ▶ e GPU (eram 66). O recuo sem GPU do ADR-0041 não muda.
- **Prazo:** o código fecha às 13h30 de 20/11 (a equipa submete às 15h30). A implementação tem de estar pronta para revisão até às 10h de 20/11 (no !156, com a avenida); senão, fica a (c).
