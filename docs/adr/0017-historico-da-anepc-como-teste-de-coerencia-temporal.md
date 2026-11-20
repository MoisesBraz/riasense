# As ocorrências da ANEPC entram só como teste de coerência temporal do risco potencial, não como entrada nem como validação por passadeira

Status: em parte superseded by ADR-0036, só na fonte: o fogos.pt (2021 a 2026) sai, porque os mentores só autorizaram o arquivo de 2016 a 2020 (#19, pergunta 7). Proposto a 17/11/2026 e emendado a 18/11/2026: os números do fogos.pt abaixo ficam como história e não se usam, e o que se diz sobre a ANEPC é o que a regra do ADR-0036 permitir.

O ADR-0009 deixou a ANEPC de fora porque a API do dados.gov.pt não tem histórico. Há duas fontes com histórico:

- **Fora desde 18/11 (ADR-0036): a API do fogos.pt**, não autorizada (exportações de 17/11/2026, de 2021 a 2026, com 194 350 ocorrências rodoviárias). O ano de 2026 coincide com a época dos dados do Living Lab. No país há 3016 atropelamentos; no distrito de Aveiro, 173; no concelho, 13 atropelamentos e 240 ocorrências rodoviárias. Na semana de 03 a 10/11 há 5 colisões no concelho e nenhum atropelamento.
- **Fonte (a única, desde 18/11): o arquivo [centraldedados/protecao_civil](https://github.com/centraldedados/protecao_civil)**, com 910 782 ocorrências de 2016 a 05/07/2020, raspadas do prociv.pt. Tem 700 atropelamentos no distrito.

**A validação por passadeira não se pode fazer.** Em 2016–2020, as coordenadas são o centroide da freguesia (751 acidentes caem em só 95 pontos). Em 2026 são mais precisas (240 ocorrências em 210 pontos), mas há geocodificações erradas: uma ocorrência na «Av. Lourenço Peixinho» cai a cerca de 3 km dela. (A contagem por passadeira, com 6 anos de dados, está mais abaixo.)

**A coerência temporal funciona.** Por hora do dia, os atropelamentos acompanham o risco potencial médio dessa hora:

| Fonte (hora local) | Âmbito | Atropelamentos | Spearman com o risco potencial | Spearman com a exposição | Diferença [IC 95%] |
|---|---|---|---|---|---|
| fogos.pt 2021–2026 | Concelho de Aveiro | 167 | 0,781 | 0,793 | [−0,050; +0,053] |
| fogos.pt 2021–2026 | Distrito de Aveiro | 1 355 | 0,777 | 0,787 | [−0,043; +0,016] |
| fogos.pt 2021–2026 | Portugal | 21 513 | 0,803 | 0,832 | **[−0,049; −0,012]** |
| fogos.pt 2026 | Distrito de Aveiro | 173 | 0,765 [0,649; 0,837] | 0,736 [0,623; 0,817] | +0,029 [−0,018; +0,066] |
| 2016–2020 (centraldedados) | Distrito de Aveiro | 700 | 0,76 | — | — |

As exportações do fogos.pt de 2017 a 2020 não têm ocorrências rodoviárias (nesses anos o fogos.pt só tinha incêndios), por isso a série útil vai de 2021 a 2026. O IC vem de um bootstrap de 2000 reamostragens (semente 42). O `dateTime` está em UTC e converte-se para a hora de Lisboa. **No país, a exposição sozinha acompanha as horas dos atropelamentos significativamente melhor do que o risco potencial**: o comportamento e a previsão não acrescentam nada à hora do dia.

*(Os números do fogos.pt desta secção e da tabela são história: só vale a linha 2016–2020.)*

**Por passadeira, não dá:** no arquivo de 2016 a 2020 as coordenadas são o centroide da freguesia (751 acidentes em 95 pontos). *(História, não se usa: o fogos.pt tinha em Aveiro só 424 das 1 788 ocorrências rodoviárias com coordenada própria, e 15 a ≤ 100 m das 24 passadeiras, com Spearman de −0,36.)*

Uma 1.ª versão deste ADR usava a hora UTC e dava 0,82, um valor errado: o perfil do risco é em hora local.

Decidimos usar estas ocorrências **só como teste de coerência temporal**, apresentado na avaliação e no pitch, com um intervalo de confiança por bootstrap. **Nunca entram na soma do risco potencial nem nos modelos.**

## Consequências

- **O ADR-0007 mantém-se**, também na razão do nome: continua a não haver validação por passadeira, e por isso o mapa continua a ser de risco **potencial**.
- **Autorização (18/11):** os mentores autorizaram o arquivo de 2016 a 2020 como teste de coerência, desde que o relatório final o declare (#19, pergunta 7, nota 13374). **O fogos.pt não foi autorizado e sai**, e com ele a frase do escuro do ADR-0018. A declaração está no sumário e no PPT (#117).
- **Aviso obrigatório, no texto, no pitch e na legenda:** «Dados recolhidos de fontes abertas, usados só para contexto e coerência. Carecem de validação junto das entidades responsáveis» (aqui, a ANEPC). Nenhum resultado que use esta fonte se apresenta como validado.
- Supersede a linha «ANEPC: fica fora» do ADR-0009, que fica com `Status: em parte superseded by ADR-0017` (neste MR). O resto do ADR-0009 mantém-se.
- O texto diz só o que a regra do ADR-0036 (ponto 5) permitir sobre os atropelamentos de 2016 a 2020, nunca «validado com acidentes». O ADR-0007 continua em vigor: o risco potencial não mede acidentes.
- Ressalvas obrigatórias (as do ADR-0036, ponto 8, sobre o arquivo de 2016 a 2020):
  - quase tudo segue a atividade da cidade ao longo do dia;
  - é um perfil **temporal**, nunca por passadeira: as coordenadas são centroides;
  - a hora do ficheiro assume-se local, os dados acabam a 05/07/2020 e a fonte não declara licença;
  - o que se diz do risco contra a exposição é o que o ADR-0036 (ponto 5.3) permitir, e **não se diz** que as componentes de comportamento e de previsão acrescentam alguma coisa.
- **Contraexemplo (era do fogos.pt, cai com ele):** o atropelamento de 12/01/2026 às 07:33 está a 8 m da SC0004 (N235), que tem um dos riscos potenciais mais baixos (0,27). O risco potencial mede a exposição medida, e não o perigo da via.
- Licença: nem o fogos.pt nem o arquivo de 2016–2020 declaram uma licença aberta para os dados. O art. 22.º, n.º 2 do regulamento pede dados originais ou com autorização expressa. No checkpoint de 18/11 só o arquivo de 2016–2020 foi autorizado (issue #19, pergunta 7), e o fogos.pt fica fora.
- Os CSV ficam fora do git, apontados por variável de ambiente, como os do Living Lab. Só o resultado agregado (perfil horário e correlações) é versionado.
- Ficam fora: a camada do ArcGIS «Ocorrências Históricas da ANEPC» (conta pessoal, sem licença, quase só setembro de 2026) e a PORDATA (totais anuais, sem hora nem local). A PORDATA pode ser citada no pitch como enquadramento.
- Implementação: issue #54, com a regra e os critérios do ADR-0036.
