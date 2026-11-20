# A ② e a ③ validam-se em várias janelas, com as variáveis retiradas uma a uma e com outros modelos, pela regra fixada antes

Status: proposto (17/11/2026). Complementa o ADR-0005 (②), o ADR-0010 e o ADR-0027 (③). Não muda nenhum número do produto, a não ser pela regra do ponto 5, e mesmo aí só com a aprovação do PO. Resultado da corrida de 18/11 e decisão do PO nas Consequências (#109). Duas correções de redação a 18/11 (#112). **Alterado no ponto 5 pelo ADR-0046** (19/11): nos segmentos da ②, a condição da noite passa a ser a média da noite em eventos/h, até 1,5 vezes a real, nos dois testes do ADR-0005.

## Contexto

- A ② e a ③ foram validadas num só período de teste: as 48 h a partir de 8/11 às 11h, com treino nas cerca de 116 h anteriores. A ② tem também a simulação da falha da RSU0030 (29 h de treino, 135 h de teste).
- Comparámos poucos modelos. Na ② usámos o modelo de razão, a ridge e o LightGBM, e na ③ o LightGBM, a referência e a persistência. **Nunca testámos o SVM (SVR)**, e o júri pode perguntar porquê.
- Não medimos quanto vale cada variável da ③, nem se 5 vizinhos é a escolha certa na ②.
- **Com poucos dados, testar muitos modelos é barato, mas arriscado.** Num só período de teste, algum ganha por sorte. Por isso a lista, os parâmetros e a regra ficam escritos aqui, antes do primeiro resultado (como no ADR-0010).

## Decisão

1. **Quatro janelas de teste**, cada uma com um dia inteiro (00h–24h): sexta 6/11, sábado 7/11, domingo 8/11 e segunda 9/11. Cada janela treina com todas as horas da janela comum anteriores ao dia de teste (de 57 h a 129 h). O período oficial de 48 h continua a dar os números publicados.
2. **Os mesmos testes para todos.** Em cada janela, todos os modelos se medem nas mesmas horas e nos mesmos sensores. Os modelos que não aceitam valores em falta treinam só com as linhas completas. A métrica é a de sempre: o erro relativo mediano entre sensores (`erro_relativo`), separado em dias úteis e fim de semana.
3. **Candidatos, com parâmetros fixos e sem afinação** (scikit-learn, já nas dependências). Ficam na secção `validacao` do `config/riasense.yaml`:
   - **SVR:** núcleo RBF, C = 1, ε = 0,1, γ = «scale», com as variáveis e o alvo padronizados pela média e pelo desvio do treino;
   - **random forest:** 300 árvores, pelo menos 5 linhas por folha, semente 42;
   - **k-NN:** 10 vizinhos, pesados pela distância, com as variáveis padronizadas;
   - **regressão de Poisson:** α = 10⁻⁴.

   A hora entra em 24 indicadoras nos modelos lineares (Poisson e ridge), como seno e cosseno no SVR e no k-NN, e como número nas árvores.
   - **Na ②**, os candidatos usam as mesmas variáveis da ridge e do LightGBM (o valor atual dos 5 vizinhos, a hora e o fim de semana), em «deixar um de fora» e na simulação da falha da RSU0030. Comparam-se com o modelo de razão, a ridge, o LightGBM e a referência.
   - **Na ③**, usam as variáveis do LightGBM (`prever.atrasos_h`, `prever.atrasos_vizinhos_h`, a hora e o fim de semana), nos horizontes que estiverem no `main`. Comparam-se com o LightGBM, a referência e a persistência.
4. **As variáveis e os vizinhos.** Isto serve só para informar: muda o que se diz ao júri, e não o produto (para mudar o produto é preciso outro ADR).
   - **Na ③**, retira-se ao LightGBM sem meteorologia um grupo de cada vez, em cada horizonte, e mede-se quanto o erro sobe em cada janela. Os grupos, com os nomes das colunas do `prever.py`:
     1. os atrasos curtos do próprio sensor (as `atraso_*`, sem a de 24 h);
     2. a `atraso_24h` e a `vizinhos_24h`;
     3. os vizinhos curtos (as `vizinhos_*`, sem a de 24 h);
     4. a `hora` e o `fim_de_semana`.

     Junta-se a importância das variáveis do LightGBM (o ganho), em média nas 4 janelas.
   - **Na ②**, o modelo de razão corre com 3, 5 e 8 vizinhos.
5. **A regra para trocar de modelo.** Aplica-se **a cada tipo de sensor e, na ③, a cada horizonte**, em separado, com todos os dias (`dias = todos`). Se houver troca, é só nesse tipo e nesse horizonte. Na ②, o modelo atual é a razão e os candidatos são os quatro do ponto 3, a ridge e o LightGBM (como o ADR-0005 permitia). Na ③, o modelo atual é o LightGBM sem meteorologia. Um candidato só passa se cumprir **todas** as condições:
   1. o erro médio nas 4 janelas é pelo menos 5 % menor do que o do modelo atual;
   2. é melhor do que o modelo atual em pelo menos 3 das 4 janelas;
   3. **na ②**, não erra mais do que a razão na simulação da falha da RSU0030 (29 h de treino, ADR-0005). E, em cada janela, a sua fração da noite (`noite`, a mediana entre sensores) não passa do maior entre a do real (`noite_real`) e a da razão, no mesmo tipo;
   4. **na ③**, ganha à referência e à persistência no erro médio das 4 janelas (ADR-0010 e ADR-0027).

   Se passarem vários, fica o de menor erro médio. Se a diferença entre eles for inferior a 5 %, fica o mais simples, por esta ordem: razão, Poisson, ridge, k-NN, SVR, random forest, LightGBM. Um candidato que passe é **proposto** ao PO, e a troca faz-se noutro MR, com os números antes e depois. Se nenhum passar, os modelos atuais ficam.
6. **Publica-se tudo:** todos os modelos, janelas, tipos e variantes, e não só o vencedor. Fica em `data/processed/avaliacao_modelos.parquet` e em `avaliacao_variaveis.parquet`. Os resultados vão para a wiki (perguntas do júri e limites conhecidos), e não para a web.

## Consequências

- Responde com números a «porque não o SVM?», a «as variáveis fazem sentido?» e a «os resultados aguentam noutros dias?».
- **Limites conhecidos, a dizer sempre:**
  - as 4 janelas são da mesma semana e não são independentes;
  - há um só fim de semana;
  - com 7 modelos × 4 janelas × vários tipos, algum ganha por acaso, e é por isso que a regra pede 5 % e 3 janelas em 4;
  - os candidatos correm sem afinação, por isso podem perder só por isso. Afiná-los pedia um período de validação separado, que uma semana não dá;
  - o treino não é igual para todos. Os candidatos usam só as linhas completas: por causa da `atraso_24h`, na janela de 6/11 treinam com 33 h, enquanto o LightGBM, que aceita valores em falta, treina com 57 h;
  - na janela de 7/11 o treino não tem nenhuma hora de fim de semana (o `fim_de_semana` é constante), e na de 8/11 só tem o sábado;
  - os sensores que a RSU0030 deixou sem comunicação (desde 4/11 às 20h06) não têm horas de teste em nenhuma janela, por isso ficam de fora, como já acontece na ③.
- **Prazo:** a implementação (#85) começa quando a fila de MR esvaziar, antes do painel «agora» (ADR-0030), e acaba até quinta, 19/11, às 20h. Se não acabar a tempo, o júri ouve os limites conhecidos e a pergunta fica em aberto.
- O termo «janela de teste» entra no `GLOSSARY.md`.
- **Resultado da corrida de 18/11 (!86, #85), com o `main` e o !76 (③ a 1, 3 e 6 h).** Só um candidato passa a regra: **o k-NN nos segmentos a 3 h** (erro médio 0,286 contra 0,304 do LightGBM, 6 % abaixo, melhor em 3 das 4 janelas; o SVR também passa, mas a diferença para o k-NN é inferior a 5 %, por isso fica o mais simples). Na ② nenhum candidato passa: os que ganham à razão falham a condição da noite. **Decisão do PO (18/11): não se troca.** Passa a regra, o ganho é pequeno e só numa célula (segmentos a 3 h), e trocar o modelo de produção a dois dias do congelamento de 20/11 acrescenta risco e manutenção, por isso mantém-se o LightGBM por estabilidade. A troca vai para o roadmap, e far-se-ia noutro MR, com os números antes e depois (ponto 5).
- A mesma corrida mostrou que, a 6 h, no estacionamento, a referência tem erro médio mais baixo do que o LightGBM nas 4 janelas (0,247 contra 0,263); fica nas ressalvas do ADR-0027.
