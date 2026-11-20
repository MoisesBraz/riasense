# Um agente de IA executa as issues e o PO aprova cada merge

A 17/11/2026 decidimos que as issues passam a ser executadas por um agente de IA, o **agente Programador**. O agente é comandado por um PO humano (Moisés), que escreve os briefs, revê o diff de cada merge request e faz o merge. Com o agente a escrever código de todas as camadas, a aprovação pelo revisor de cada área, pedida no `CONTRIBUTING.md`, deixava de ter um dono claro. Assim há um só ponto de aprovação, e a trilha «quem decidiu (o ADR), quem escreveu (o agente), quem aprovou (o PO)» fica visível no GitLab, como pede a FAQ 17.

## Consequências

- O agente abre os MR (não em rascunho), com `Closes #NN`, o ADR de origem e a linha de uso de IA. O agente não faz merge.
- O PO revê o diff e faz o merge com squash. Esta aprovação substitui a do revisor indicado na issue.
- O dono da issue continua responsável pela camada perante o júri e tem de a saber explicar. Pode comentar o MR, mas o comentário não bloqueia o merge: o revisor do `CONTRIBUTING.md` passa a consultivo.
- O label `agente` marca o trabalho do agente, e cada issue que ele executa leva o comentário «executada pelo agente Programador (ADR-0011)». O label `em curso` fica só para o trabalho dos humanos, e `em revisão` marca o MR aberto.
