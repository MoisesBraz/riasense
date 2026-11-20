# Os segmentos completam-se com a ridge, e as passadeiras e as zonas turísticas ficam com a razão

Status: aceite pelo PO (19/11/2026, #157, para a #32), com o limite de 1,5 vezes a real para a média da noite. Substitui em parte o ADR-0005: o modelo dos segmentos. **Altera o ponto 5 do ADR-0031 (a condição da noite)**: nos segmentos, a fração da noite em cada uma das 4 janelas dá lugar à média da noite em eventos/h, nos dois testes do ADR-0005, até 1,5 vezes a real.

## Contexto

- **A regra do ADR-0005:** a ② usa o modelo de razão, ou seja, o perfil horário do sensor vezes a variação dos 5 vizinhos. Um modelo mais complexo só o substitui se ganhar nos mesmos testes (deixar um de fora e a simulação com 29 h) **e** passar a verificação da forma diária.
- **A ridge ganha à razão só nos segmentos, e nos dois testes.** Os números são os da avaliação do `main` (`avaliacao_completar.parquet`, todos os dias):

  | Segmentos | Razão | Ridge |
  | --- | --- | --- |
  | Deixar um de fora (142 segmentos): erro mediano | 0,25 | 0,22 |
  | Deixar um de fora: ganha à referência | 138 | 141 |
  | Simulação com 29 h (143 segmentos): erro mediano | 0,33 | 0,27 |
  | Simulação: ganha à referência | 104 | 129 |

- **Pela regra antiga (ADR-0031, ponto 5.3), a ridge não passa nos segmentos.** Essa regra pede que, em cada uma das 4 janelas, a fração da noite (`noite`, a mediana entre sensores) não passe da do real nem da da razão. A ridge falha em 4 das 4 janelas (`pipeline/README.md`, corrida de 18/11), e por isso a razão ficou. Com todos os dias, a fração da noite dos segmentos é esta:

  | Segmentos: fração da noite | Ridge | Real | Razão |
  | --- | --- | --- | --- |
  | Deixar um de fora | 0,10 | 0,06 | 0,05 |
  | Simulação com 29 h | 0,14 | 0,11 | 0,08 |

  No «deixar um de fora», a ridge fica 1,7 vezes acima da real.
- **Pela medida nova, a forma da noite passa.** Entre a 1h e as 5h, com os segmentos todos juntos, a ridge estima em média 5,4 veículos/h, contra 4,7 reais, no «deixar um de fora». Na simulação, estima 8,0 contra 6,8. Fica cerca de 1,2 vezes acima da real. A razão fica abaixo, com 3,4 e 5,5. A ridge não repete o problema do ADR-0005, em que inventava cerca de 91 travessias/h à meia-noite nas passadeiras.
  - **De onde vêm:** das colunas `noite_media` e `noite_media_real` da implementação (a #32), que ainda não estão no `avaliacao_completar.parquet` do `main`. Saem de `riasense completar` no ramo da #32, com os dados brutos.
- **Porque se escolhe a medida nova.** As duas são legítimas, mas medem coisas diferentes:
  - **a fração da noite** é a parte do dia que cai à noite, e por isso pesa também o dia: um modelo que estime bem a noite e um pouco abaixo de dia fica com a fração alta;
  - **a média da noite em eventos/h** mede diretamente o defeito que o ADR-0005 quis evitar, que era inventar movimento à noite.

  As duas também agregam de forma diferente: a fração é a mediana entre sensores, e a média junta os segmentos todos. Nos segmentos, a ridge erra menos nos dois testes e fica perto da real à noite em veículos/h, embora a fração fique acima.
- **Nas passadeiras e nas zonas turísticas, a ridge não passa:**
  - **passadeiras:** perde nos dois testes (0,47 contra 0,36 e 0,37 contra 0,36) e estima a noite 1,5 a 2,4 vezes acima da real;
  - **zonas turísticas:** ganha num teste e perde no outro (0,26 contra 0,28 e 0,29 contra 0,28), e estima a noite 1,5 a 2,0 vezes acima da real.

## Decisão

1. **O método escolhe-se por tipo**, em `completar.metodo`: `passadeira: razao`, `zona: razao`, `segmento: ridge`. Se um tipo completável não tiver método no config, o pipeline pára com um erro.
2. **A ridge dos segmentos é a mesma da comparação.** Usa os mesmos 5 vizinhos do mesmo tipo, a hora do dia e o fim de semana, com `RidgeCV` e alfas de 10⁻² a 10⁴ (`completar.comparacao`). Treina-se nas horas fora da falha, como a razão, e a estimativa nunca fica abaixo de 0.
3. **O intervalo de 80 % vem dos resíduos da própria ridge**, na simulação com 29 h. Calcula-se à parte para os dias úteis e para o fim de semana, como o da razão. Na avaliação, a cobertura passa a ser a do método de cada tipo.
4. **O erro esperado** de cada hora estimada é o erro mediano do método do tipo, na simulação.
5. **A avaliação mantém todos os modelos**, para a comparação se poder repetir. A forma da noite passa a medir-se também em eventos por hora, com os sensores do tipo todos juntos (colunas `noite_media` e `noite_media_real`). **A regra do ADR-0005 ganha um limite:** a média da noite de um modelo novo não pode passar de 1,5 vezes a real, nos dois testes. Esta condição substitui, para este fim, a da fração da noite do ADR-0031 (ponto 5.3).
   - **O limite de 1,5 fixou-se depois de ver a avaliação.** É diferente da regra do ADR-0031, que se escreveu antes do primeiro resultado para nenhum modelo ganhar por sorte. Fica entre a ridge nos segmentos (cerca de 1,2) e as passadeiras e as zonas turísticas (1,5 a 2,4). É uma decisão do PO, e nenhum número do pitch muda (ver as Consequências).
6. **O resto não muda:**
   - a razão nas passadeiras e nas zonas turísticas;
   - a escolha dos vizinhos;
   - o estacionamento, que continua sem ser completado (ADR-0005);
   - o «onde pôr o próximo sensor», que continua a usar o erro da razão;
   - o mapa de risco potencial, que só usa as passadeiras.

## Consequências

- **Nenhum número do pitch, do sumário ou do relatório muda.** Os números da ② são das passadeiras, que continuam com a razão, e o risco potencial só usa as passadeiras.
- **Mudam os dados dos segmentos:**
  - no `sensores_virtuais.parquet`, as horas estimadas dos segmentos em falha, com o intervalo e o erro esperado;
  - na avaliação, as linhas dos segmentos.

  Estes dados regeneram-se a partir dos dados brutos, num commit de dados à parte. A avaliação só se regenera com a LightGBM a correr (libomp), para não perder as linhas dela.
- **A ridge é mais difícil de explicar ao júri do que a razão.** No pitch, a ② continua a explicar-se pela razão, com as passadeiras. O texto do painel da ② continua certo para os dois métodos: diz que o sensor virtual estima o sensor em falha a partir dos vizinhos do mesmo tipo.
- **Prazo:** a implementação (#32) entra antes do fecho do código, a 20/11, às 13h30. Se não chegar a tempo, os segmentos ficam com a razão.
