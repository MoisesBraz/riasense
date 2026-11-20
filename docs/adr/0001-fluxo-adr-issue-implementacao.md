# Fluxo obrigatório: ADR → issue → implementação

Nenhum código entra sem uma issue, e nenhuma issue existe sem um ADR de origem em `docs/adr/`. Uma issue pode apontar para um ADR que já exista. Se a decisão por trás dela ainda não estiver registada, escreve-se primeiro o ADR, que entra por MR como o resto. Assim, num hackathon de 4 dias em que a ideia já mudou uma vez, qualquer pessoa (e o júri) consegue seguir cada linha de código até à decisão que a justifica.

## Consequências

- O template de issue tem o campo obrigatório **ADR de origem**, e o MR confirma-o na definição de feito.
- Uma correção pequena (gralha, bug óbvio) usa o ADR da funcionalidade que corrige, sem precisar de um ADR novo.
- Quando uma decisão muda, o ADR antigo passa a `superseded by ADR-NNNN`. Nunca se apaga.
