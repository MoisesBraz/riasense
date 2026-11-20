# Fontes externas: a meteorologia entra, o Waze é condicional, a ANEPC e o BEAV ficam fora

Status: em parte superseded by ADR-0017, só na linha da ANEPC. O Waze vai para o roadmap: a 17/11, às 22h51, o mentor do IT confirmou que os eventos do Waze da semana não foram gerados, e que só existem os CSV já cedidos (#19, pergunta 2; #13). A seleção da variante da ③ com ou sem meteorologia fez-se no período de teste (#52, 18/11, ponto «Open-Meteo»). O resto deste ADR continua em vigor.

O art. 22.º, n.º 2 exige dados originais ou com autorização expressa, e a demo tem de funcionar offline. Por isso:

- **Open-Meteo** (arquivo, CC BY 4.0): chuva e temperatura horárias entram como variáveis nas camadas ①, ③ e ④, **e só ficam onde melhorarem o resultado**. Na semana dos dados houve 3 dias secos e 5 de chuva.
  - **Como se escolheu a variante da ③ (#52, 18/11): no próprio período de teste.** A regra («melhora se baixar o erro mediano ≥ 5 % ou se mudar a decisão») compara as duas variantes nas mesmas 48 h onde depois se compara com a referência e a persistência. A cláusula «muda a decisão» escolhe, por construção, a variante que ganha no teste. Hoje não tem efeito: a meteorologia não entra em nenhum dos 12 casos (4 tipos × 1, 3 e 6 h). **Documentado, não implementado:** uma seleção fora do teste, numa validação dentro do treino (por exemplo as 24 h antes de `teste_inicio`), fica no roadmap.
- **Eventos do Waze no Living Lab** (o PDF do IT, p. 5, diz que a plataforma é enriquecida com eles): pedidos ao mentor a 17/11. Se chegassem até 19/11 às 12h, com autorização de uso, entravam por esta ordem: ① > ③ > mapa (só como contexto). **Não chegaram:** o mentor do IT confirmou a 17/11 que os eventos do Waze da semana não foram gerados (#19, pergunta 2), e vão para o roadmap (ver o Status).
- **ANEPC**: fica fora. A API do dados.gov.pt redireciona para a página inicial desde 2021 e não há histórico.
- **BEAV**: pede-se no checkpoint. Sem ele, o mapa continua a ser de risco potencial (ADR-0007).
- **Waze direto** (raspar o mapa ao vivo): rejeitado, porque viola os termos de uso e o art. 22.º.
