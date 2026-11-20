# A vista aérea da zona da demo: os ortofotos da DGT, guardados no projeto e só para essa zona

Status: aceite pelo Moisés, desligada por omissão (19/11/2026, pedido do João: «porque não temos o mapa em vista satélite?»; parecer do revisor na nota 14495, decisão na nota 14516). **A licença dos serviços e da cache dos ortofotos ainda não está confirmada junto da DGT.** Usa-se só o ficheiro descarregável, com a licença que a página dele indica. **Retoma** a «vista aérea» que o ADR-0037 deixou para depois (decisão do PO, 19/11), com as condições que lá ficaram: a licença confirmada e a zona guardada offline.

## Contexto

- O mapa é vetorial (PMTiles, ADR-0014), e a demo nunca chama a rede. Os edifícios estão em relevo e são cinzentos (ADR-0037).
- **As imagens do Google não servem:** a política proíbe o uso offline e a cache (ADR-0037).
- **A DGT tem ortofotos de Portugal continental com 25 cm** (2021 e 2025):
  - os ficheiros do Centro de Dados da DGT têm a licença CC BY 4.0, com a menção «Direção-Geral do Território»;
  - por WMS/WMTS a licença não está confirmada, nem a cache local.
- A zona da demo é pequena: cerca de 600 × 600 m à volta do cruzamento da Av. 25 de Abril com a Av. de Oita, e uns 400 m da Av. da Universidade. A 25 cm, um recorte dessa área ocupa poucos MB em WebP.

## Decisão

1. **Fonte:** o ficheiro do ortofoto da DGT (o mais recente, de 2025, se cobrir a zona), descarregado do Centro de Dados com a licença CC BY 4.0. **Não se usa o WMS nem o WMTS.** Se a licença do ficheiro não estiver clara na página da DGT, este ADR fica parado e diz-se ao Moisés.
2. **Só a zona da demo:** um recorte, convertido em tiles raster (WebP) dentro do mesmo PMTiles ou noutro, servido pela web como hoje. Sem rede na demo.
3. **Como se liga:** uma camada «Vista aérea» na lista das camadas, desligada por omissão. Liga-se por baixo das ruas com sensor, das passadeiras, da avenida (ADR-0044) e dos modelos. O fundo vetorial continua por baixo, fora do recorte.
4. **Atribuição:** «Ortofotos © Direção-Geral do Território (CC BY 4.0)», junto à do OpenStreetMap, sempre que a camada está ligada. Também no `LICENCAS` dos dados e no sumário, se lá aparecer uma captura. Leva o aviso das fontes abertas do ADR-0023: «dados de fontes abertas, usados para contexto, que carecem de validação junto das entidades responsáveis». O ficheiro exato (o URL, o ano, a resolução e a caixa do recorte) fica escrito na implementação.
5. **Com a luz da hora (ADR-0040):** de noite, a fotografia escurece com uma camada por cima, para não parecer dia.
6. **Honestidade:** a legenda diz «fotografia aérea da DGT de <ano>: não é da semana dos dados». Carros e pessoas na fotografia não são dados.
7. **Contraste:** sobre a fotografia (telhados, copas, asfalto), **o contraste das cores de estado não está garantido**. Os ≥ 3:1 do ADR-0033 e do ADR-0040 foram medidos contra as paletas planas. É por isso que a camada fica desligada por omissão, e os estados leem-se também pelo ícone e pela forma.

## Consequências

- **O que se ganha:** quem não conhece Aveiro reconhece o sítio, com as copas, as marcações da estrada e o estacionamento reais.
- **Custos:**
  - mais alguns MB no projeto;
  - a fotografia não bate com a hora escolhida (luz, sombras, carros fotografados), e a legenda di-lo;
  - com a avenida do ADR-0044 por cima, as faixas desenhadas e as fotografadas podem não coincidir ao centímetro.
- **Prazo:** o código fecha às 13h30 de 20/11 (a equipa submete às 15h30). O agente ajudante está a preparar os dados (o recorte e os tiles); a camada é pequena.
