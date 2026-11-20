# Uma issue só se trabalha depois de reservada, os números de ADR só contam no main e cada um faz push com a sua conta

Status: proposto. Complementa o ADR-0011.

A 17/11/2026, entre as 02h e as 04h, dois agentes (o agente Programador do Moisés e o agente do João) implementaram as mesmas issues (#4 a #14) ao mesmo tempo. Houve três razões. Nada no GitLab mostrava que uma issue já estava a ser feita. Os dois lados escreveram um ADR-0011 diferente. E os pushes de uma das máquinas saíam como `root`, por isso o GitLab não mostrava quem tinha feito o quê. O ADR-0011 diz quem aprova o merge, mas não diz quem pega em cada issue. Decidimos as cinco regras abaixo.

## Decisão

1. **Um só PO** (o Moisés, ADR-0011). O PO decide o que entra e é o único que faz merge.
2. **Reserva antes da branch.** Antes de criar a branch, quem vai trabalhar (pessoa ou agente) reserva a issue com `python scripts/reservar_issue.py NN`. O script recusa a issue se ela estiver atribuída a outra pessoa ou se tiver um MR aberto de outra pessoa. Se estiver livre, atribui-a a quem o corre e põe o label `dono:<pessoa>` (mais `em curso` para humanos, ou `agente` para agentes). Logo a seguir abre-se o MR em rascunho com `Closes #NN`. Uma issue reservada por outra pessoa não se toca: pede-se ao PO, no comentário da issue, que a reatribua.
3. **Os agentes só pegam em issues que o PO lhes atribui.** O label `dono:` é o da pessoa que comanda o agente. Um agente nunca escolhe issues sozinho a partir do backlog.
4. **Um número de ADR só fica reservado quando o ADR entra no `main`.** Quem precisa de um ADR novo abre primeiro um MR só com esse ADR, para o PO aprovar depressa, e só depois escreve o código que depende dele. Se dois MR propuserem o mesmo número, o que entrar depois é renumerado.
5. **Sem MR empilhados.** Cada branch parte do `main` atualizado. Se a issue B depende da A, B espera pelo merge de A.
6. **Cada pessoa e cada agente faz push com a sua própria conta.** Nunca com `root` nem com a conta de outra pessoa. O agente de uma pessoa usa um token pessoal dessa pessoa.

## Consequências

- O quadro de issues mostra, em cada issue, quem a está a fazer (`dono:joao`, `dono:moises`, `dono:elicarlos`, `dono:eduardo`). O label tem de bater com o assignee.
- O dono da **área** (a tabela de revisores do `CONTRIBUTING.md`) e o dono da **issue** podem ser pessoas diferentes. O label `dono:` diz quem executa a issue, não quem responde pela camada perante o júri.
- O GitLab CE não impõe nada disto: as regras são da equipa. O script torna a reserva num passo que os agentes conseguem cumprir e verificar.
- O trabalho duplicado de 17/11 resolve-se assim: o `main` é a verdade, os MR !43 a !50 fecham-se sem merge, e o que eles têm a mais entra em issues novas, uma a uma, se o PO as aceitar.
