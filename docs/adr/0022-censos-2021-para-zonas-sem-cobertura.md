# A população dos Censos 2021 assinala zonas densas sem sensor no «próximo sensor», sem estimar peões onde não há sensor

Status: proposto (17/11/2026).

O ADR-0015 só ordena locais **com** sensor, e a Câmara também quer saber onde **não** há cobertura. A BGRI 2021 do INE (população residente por subsecção, CC BY 4.0 segundo o registo INSPIRE do INE) diz onde vive muita gente. Decidimos acrescentar ao «próximo sensor» uma 2.ª lista, «zonas densas sem cobertura»: as subsecções com mais residentes a mais de 300 m de qualquer sensor do mesmo tipo. Ordenam-se pela população e não pela estimativa de peões.

## Consequências

- **Quando:** entra **depois da submissão do relatório**, como os outros: acrescenta uma 2.ª lista ao «próximo sensor» que o relatório não tem.
- **Onde se mostra:** as subsecções aparecem **só na vista do «próximo sensor»**, e **nunca no mapa de risco potencial**, que só mostra pontos com sensor (ADR-0007).
- **Alternativa: WorldPop** (população em grelha de cerca de 100 m, CC BY 4.0, estática). Usa-se se a licença ou o formato da BGRI complicarem, ou para confirmar a BGRI. Não é em tempo real nem mede quem passa: tem as mesmas ressalvas que os residentes dos Censos.
- **Aviso obrigatório, no texto, no pitch e na legenda:** «Dados recolhidos de fontes abertas, usados só para contexto e coerência. Carecem de validação junto das entidades responsáveis» (aqui, o INE). Nenhum resultado que use esta fonte se apresenta como validado.
- Não contraria o ADR-0007: não se estimam peões numa rua sem sensor. A lista diz «residentes», nunca «peões» nem «risco».
- A licença confirma-se na página de download do INE antes de usar. Se não for CC BY, aplica-se o art. 22.º, n.º 2.
- Residentes não são quem atravessa: o centro e as zonas turísticas têm mais visitantes do que residentes. A frase di-lo.
- O raio de 300 m e o número de zonas ficam no config. O recorte da BGRI para o concelho é versionado e pequeno.
