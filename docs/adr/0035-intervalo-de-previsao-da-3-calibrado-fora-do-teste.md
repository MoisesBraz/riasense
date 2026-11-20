# O intervalo de previsão da ③ calibra-se num dia antes do teste, e a cobertura mede-se sempre nas 48 h de teste

Status: proposto (18/11/2026). Complementa o ADR-0010 e o ADR-0027 (③) e segue o espírito do ADR-0005 (a ② já tem um intervalo de 80 %). Não muda nenhum número do produto: só acrescenta colunas.

## Contexto

- A ② mostra, em cada sensor virtual, um intervalo de 80 %. A ③ não: o `previsoes.parquet` do `main` só tem a previsão, a referência e o valor real (`previsao`, `referencia`, `real`). A pergunta que o júri faz a uma previsão é «com que confiança?».
- Um intervalo só serve se for **honesto**: tem de ser calculado sem olhar para as horas onde depois se mede a cobertura, e a cobertura medida tem de se dizer, seja qual for.
- A proposta vem do João (#43), a partir do protótipo do !49 (fora do `main`): quantis dos resíduos num dia de calibração anterior ao teste. Nesse protótipo a cobertura nas 48 h de teste ficou entre 76 % e 79 % nos 4 tipos. Aqui fixa-se a regra **antes de correr o código no `main`**, como no ADR-0027 e no ADR-0031, para que os números do `main` não a ajustem.
- O período de teste da ③ é o do `prever.teste_inicio` (8/11 às 11h, 48 h). O treino é tudo o que vem antes (ADR-0010).

## Decisão

1. **O método: um dia de calibração antes do teste.** Por tipo de sensor e por horizonte `h` **só os do `prever.horizontes_h`, 3 e 6 h** (ADR-0027: a 1 h, que só se avalia, não há previsões nem intervalo), e para a variante da meteorologia que a regra escolhe (ADR-0009):
   1. O **dia de calibração** são as 24 h imediatamente antes de `teste_inicio` (de 7/11 às 11h a 8/11 às 11h). **Não entra no teste**, e **não entra no treino do modelo de calibração**.
   2. O **modelo de calibração** é o mesmo LightGBM, com os mesmos parâmetros e variáveis, treinado só com as horas anteriores ao dia de calibração. Prevê as horas do dia de calibração dos **mesmos sensores que entram no `avaliacao_prever` em cada tipo**: as passadeiras sem falha, as zonas, o estacionamento e, nos segmentos, os 78 ativos (as horas em falha já estão fora, como no resto da ③).
   3. Em cada hora e sensor, o **resíduo** é `(real − previsão) / escala`, com a `escala` do sensor **no modelo de calibração**: a média do sensor medida só com dados anteriores ao dia de calibração (o dia não entra na escala). Assim um só par de quantis serve sensores de tamanhos diferentes. Os resíduos de todos os sensores do tipo juntam-se, e **q10 e q90** são os quantis 0,10 e 0,90 desse conjunto.
   4. O **intervalo** de cada previsão do modelo publicado é `p10 = max(0, previsão + q10 · escala)` e `p90 = previsão + q90 · escala`, nas unidades do sensor, com a `escala` do modelo publicado (a média no treino dele, como na ③). `p90` nunca fica abaixo de `p10`.
   5. O **modelo publicado não muda**: continua treinado com tudo o que vem antes do teste (ADR-0010 e ADR-0027), e por isso as colunas e os valores que já existem saem iguais. O dia de calibração está no treino dele (decisão do PO, 18/11), e só não está no do modelo que mede os resíduos.
2. **O nível é 80 %** (p10 e p90), como na ②. Fica no `config/riasense.yaml` (`prever.intervalo`: `nivel` e `calibracao_h`), escrito antes do primeiro resultado.
3. **O critério: a cobertura reporta-se sempre.**
   1. A **cobertura** é a fração dos pares (sensor, hora) das 48 h de teste, por tipo e horizonte, em que o valor real fica entre `p10` e `p90`. Sai em `avaliacao_prever.parquet`, nos horizontes de 3 e 6 h. A 1 h, que só se avalia, fica nula (`n_cobertura` 0).
   2. **Reporta-se sempre, mesmo se ficar fora de 70 % a 90 %.** Entre 70 % e 90 %, a app e o PPT mostram o intervalo e a cobertura. **Fora desses limites, dizem «intervalo por calibrar»**, e não se retoca: não se muda o dia de calibração, nem os quantis, nem se alarga o intervalo depois de ver a cobertura.
4. **O intervalo não muda a regra do «ganha».** A decisão do ADR-0010 e do ADR-0027 (ganhar à referência e à persistência) continua só sobre o erro da previsão.
5. **Ressalva a dizer sempre.** É uma só semana, com **um só dia de calibração** (cerca de 20 passadeiras × 24 h, 78 segmentos × 24 h, ou seja cerca de 1900 resíduos nos segmentos e algumas centenas nos outros tipos). O dia de calibração é de fim de semana (sábado 7/11 e domingo de manhã), e o teste tem 35 das 48 h em dias úteis, por isso a cobertura pode ficar abaixo do nominal. O modelo de calibração treina menos horas do que o publicado, por isso os resíduos tendem a ser um pouco maiores do que os do modelo publicado. Nada disto se corrige com os resultados à frente.
6. **Só se acrescentam colunas.** `previsoes.parquet` ganha `p10` e `p90`; `avaliacao_prever.parquet` ganha `cobertura_intervalo` e o número de pares em que se mede (`n_cobertura`); a API devolve as colunas novas. Nenhuma coluna existente muda de valor, de tipo ou de ordem (prova-se comparando os Parquet de antes e de depois), e nenhum número do relatório, do sumário ou do PPT muda.

## Consequências

- A ③ passa a dizer «com que confiança», sem ter de a ajustar ao teste. Se a cobertura ficar fora de 70 % a 90 %, isso é um resultado que se diz («intervalo por calibrar»), e não um defeito que se esconde.
- **Ordem e prazo (PO):** primeiro este ADR, num MR só com ele (ADR-0016); depois o código, noutro MR, **até 19/11 às 12h** (o MVP fecha a 19/11 às 23h59 e o congelamento é a 20/11 às 13h). Se o prazo escorregar, a #43 vai para o roadmap e a #52 passa à frente.
- **Fora de âmbito:** mostrar o intervalo na web (outra issue, depois do código, com a regra do ponto 3), a calibração por sensor, a calibração com vários dias, os intervalos condicionais à hora do dia, e a meteorologia no intervalo.
- **Riscos:** com um dia de calibração, a cobertura de um tipo pode mudar muito com poucos pares; é por isso que o critério é reportar e não ajustar.
