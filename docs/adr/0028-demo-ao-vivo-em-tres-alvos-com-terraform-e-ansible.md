# A demo ao vivo corre em três sítios montados pelo mesmo código: o portátil offline, uma VM no Proxmox e a VM do IT

Status: proposto (17/11/2026). Complementa o ADR-0003 (uma instalação com `docker compose`, sem base de dados) e o ADR-0014 (mapa offline). Complementado pelo ADR-0030 (o painel «agora», só com autorização do IT). Alterado a 17/11 (!73, decisão do João): OpenTofu em vez de Terraform, pela licença aberta; os ficheiros `.tf` não mudam. Alterado a 19/11 (pedido do João, decidido pelo Moisés às 23h20: pública já, sem login; alterado a 20/11, às 00h10, pelo Moisés: o «Agora» e o «Ao vivo» também à vista no ponto 6): a VM do Proxmox fica também pública em `riasense.helpmind.pt` (pontos 6 e 7), e o CI faz o deploy nela.

A apresentação de 20/11 é presencial e a demo é o centro do pitch. Hoje a RiaSense só se instala à mão (`docker compose up` no README), e há um defeito que impede abri-la a partir de outra máquina: a web é compilada com `VITE_API_URL=http://localhost:8000`. Quem abre a demo noutro computador faz o browser procurar a API no **seu próprio** `localhost`, e a API falha. Há também três sítios diferentes onde a demo pode ter de correr, e nenhum está descrito como código.

## Decisão

1. **A web e a API passam a ter a mesma origem.** O nginx da web encaminha `/api/` para o serviço `api` do compose, e a web é compilada com `VITE_API_URL=/api`. A demo passa a abrir-se de qualquer máquina que chegue à porta da web, sem recompilar.
2. **Três alvos, o mesmo código:**

   | Alvo | Para quê | Como se monta |
   |---|---|---|
   | **Portátil de apresentação** (offline) | **Principal** no dia 20: não depende da rede do local | Ansible `site.yml` com `--connection=local` (ou o `docker compose up` de sempre) |
   | **VM no Proxmox**, acessível pela VPN da equipa e em `riasense.helpmind.pt` (ponto 6) | **Reserva ao vivo** e demo partilhada (equipa, mentores e júri) | **OpenTofu** cria a VM (cloud-init, Debian 12) e o **Ansible** instala-a |
   | **VM do IT** (se for cedida) | O caso real de adoção (ADR-0008) | Só **Ansible**; sem rede, com as imagens carregadas por `docker save`/`docker load` |

3. **OpenTofu** (`tofu`, o fork aberto do Terraform, licença MPL 2.0; `infra/terraform/`, provider `bpg/proxmox`) cria só a VM: CPU, RAM, disco, rede e chave SSH. Não instala nada. O token da API do Proxmox vem de variáveis de ambiente, e o `tfstate` fica fora do git.
4. **Ansible** (`infra/ansible/`, papel `riasense`): instala o Docker e o plugin compose, põe o repositório no commit pedido (os Parquet de `data/processed/` vêm com ele, ADR-0003), constrói ou carrega as imagens, arranca o compose e **só termina quando o `/ready` da API e a web respondem**. É idempotente: correr outra vez atualiza.
5. **Plano da apresentação:** portátil (principal) → VM do Proxmox pela VPN da equipa (reserva ao vivo) → vídeo `riasense-demo.mp4` (reserva final, já existe).
6. **A demo pública em `riasense.helpmind.pt`**, por um túnel Cloudflare (o serviço `tunnel` do compose, `cloudflared` com a versão fixada), sem login:
   - **Tudo à vista, também o «Agora» e o «Ao vivo»** (decisão do Moisés, 20/11, 00h10, que substitui a regra «só de leitura» do !210): pelo túnel passa o mesmo que pela VPN, e os únicos `POST` da API são os destes dois modos (`/agora/simulador/*` e `/ao-vivo/ligar|desligar`). Na VM do Proxmox, o Ansible liga o `agora.ativo` depois de extrair o código, porque o `config/riasense.yaml` versionado o tem desligado e o deploy contínuo (ponto 7) o repõe em cada avanço do `main`. Riscos aceites: o estado é partilhado (ADR-0049), por isso um visitante que liga o «Ao vivo», simula a falha ou repõe o simulador muda o que todos veem nesse momento, também a meio do pitch, se a reserva da apresentação (ponto 5) for esta VM; a VM abre uma ligação TCP ao IT quando alguém abre o menu do indicador, e o socket.io só abre com o «ligar» e fecha 30 s depois da última leitura. Os dados ao vivo continuam a não se gravar (ADR-0049) e ficam fora do pitch e do relatório (ADR-0055).
   - O CORS só serve a web de desenvolvimento local; em produção, a web e a API têm a mesma origem (ponto 1).
   - O token do túnel fica numa variável do GitLab (Protected + Masked, com o environment `producao` protegido) e, na VM, no `.env` só legível pelo root.
   - **Os dados:** a página mostra a semana do Living Lab que o IT cedeu para o desafio. As normas não proíbem publicar (art. 22.º: o n.º 2 trata dos direitos de autor dos elementos, e o n.º 3 até obriga a partilhar o projeto). A condição dos datasets, no README, é «Cedidos aos participantes do hackathon; uso limitado ao âmbito do desafio», e fica por confirmar com os mentores do IT se a demo pública durante a avaliação cabe nela. **Decisão do Moisés (19/11, 23h20): abre-se já, sem login, sabendo deste risco**; se os mentores não deixarem, desliga-se o túnel (tirar o token) e nada mais muda.
7. **Deploy contínuo:** em cada avanço do `main`, o job `deploy:producao` corre o Ansible na VM (ponto 4). O SSH verifica a chave do host. O OpenTofu continua manual.

## Opções consideradas

- **Só o portátil, à mão:** é o que existe. Não dá reserva ao vivo nem testa a instalação «numa VM do IT», que é o argumento de adoção.
- **Kubernetes (k3s, como o helpmind):** é demasiado para dois contentores e 44 h, e o ADR-0003 escolheu o compose.
- **Só na VPN da equipa** (o que este ADR dizia antes): obriga quem quer ver a demo a entrar na VPN. O motivo era que «os dados do Living Lab não são nossos para expor (art. 22.º)», mas o art. 22.º das normas não o diz (ver o ponto 6).
- **Pública com login** (Cloudflare Access): mais seguro, mas o júri teria de ter conta. O Moisés decidiu sem login (19/11, 23h20).

## Consequências

- **Muda o código da web** (o `nginx.conf` e o `VITE_API_URL` por omissão). Não muda nenhum número, por isso pode entrar antes da submissão do relatório, se o PO quiser.
- O `infra/README.md` passa a ter os 3 caminhos, com os comandos.
- **O CI não aplica o OpenTofu** (o runner não tem credenciais do Proxmox). Aplicar é um passo manual de quem tem acesso ao nó. O CI faz o deploy da aplicação na VM, com o Ansible (ponto 7).
- A VM do Proxmox respeita o tecto de memória do nó. A demo precisa de cerca de 1 GiB, e pede-se 2 GiB e 2 vCPU.
- **Fora de âmbito:** dados ao vivo do Living Lab (o WebSocket da app «realtime» exige uma autorização própria, que não foi pedida; o tempo real pelos pontos de acesso dos dashboards é o ADR-0030, pergunta 16 da #19) e um «modo ao vivo» que reproduza a semana acelerada. Ficam para um ADR próprio, se houver tempo.
