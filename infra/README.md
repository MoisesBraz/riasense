# infra

O `compose.yaml` (API + web) está na raiz do repositório. Sem base de dados: a API lê Parquet (ADR-0003). Sem servidor de tiles: o mapa offline é um ficheiro PMTiles servido pelo nginx da web (ADR-0014, ver `web/README.md`).

A web chama a API **na mesma origem**, em `/api/`, e o nginx da web encaminha esses pedidos para o serviço `api` (ADR-0028). Por isso a demo abre-se de qualquer máquina que chegue à porta da web, sem recompilar.

## A demo ao vivo: três alvos, o mesmo código (ADR-0028)

| Alvo | Para quê | Como |
|---|---|---|
| Portátil de apresentação | **Principal** no dia 20, offline | `docker compose up -d --build` na raiz (ou o Ansible com `ansible_connection=local`, num Linux) |
| VM no Proxmox, pela VPN da equipa | **Reserva ao vivo** e demo partilhada | `terraform/` (OpenTofu) cria a VM e `ansible/` instala a RiaSense |
| VM do IT (se for cedida) | O caso real de adoção | Só o `ansible/`, com `riasense_modo=imagens` se não tiver rede |

Se tudo falhar, há o vídeo de reserva: `entregaveis/riasense-demo.mp4`.

O painel «agora» (o simulador de dados fictícios do ADR-0032, com o «Cortar a RSU0030») **vem desligado**. Sem `agora.ativo: true`, a web não mostra o botão «Simular falha». A pasta `config/` é montada no contentor (ver `compose.yaml`) e lê-se em cada pedido, mas o simulador é por processo:
- **No portátil** (`docker compose` na raiz): ponha `agora.ativo: true` em `config/riasense.yaml` **antes** do `docker compose up`.
- **Nas VM (Proxmox e IT):** o Ansible leva o código por `git archive` do commit (`riasense_ref`), por isso uma mudança no config que não está num commit **não chega à VM**. Ou se edita `/opt/riasense/config/riasense.yaml` na própria VM (`agora.ativo: true`) e se corre `docker compose restart api` em `/opt/riasense` (serve também no modo `imagens`), ou se faz commit num ramo e se passa `-e riasense_ref=<ramo>`. Se o Ansible instalar outro commit, o ficheiro do commit volta a substituir o editado (com o mesmo commit, o código não se extrai outra vez).

### 1. Criar a VM no Proxmox (OpenTofu)

Usa-se o [OpenTofu](https://opentofu.org) (`tofu`, licença MPL 2.0, Linux Foundation), o fork aberto do Terraform. Os ficheiros `.tf` são os mesmos; o Terraform ≥ 1.5 também os lê, mas o `.terraform.lock.hcl` é do registo do OpenTofu.

Precisa de um token da API do Proxmox com permissão para criar VMs no nó do Proxmox, e de um ID de VM livre (`qm list`). Antes de escolher a RAM, ver o tecto de memória do nó.

```bash
cd infra/terraform
cp terraform.tfvars.exemplo terraform.tfvars        # vm_id, node, ipv4, gateway, chave SSH pública
export PROXMOX_VE_ENDPOINT=https://<proxmox>:8006/
export PROXMOX_VE_API_TOKEN='<utilizador>@<realm>!<token>=<segredo>'
# O OpenTofu verifica o certificado do Proxmox. Com o certificado autoassinado do Proxmox, o certo é confiar na CA do Proxmox
# (ou pôr um certificado ACME no nó). Só em último caso, e sabendo o que se faz: export TF_VAR_proxmox_insecure=true
tofu init
tofu plan
tofu apply
```

O `terraform.tfvars` e o `tfstate` ficam fora do git (`.gitignore`). O OpenTofu só cria a VM (Debian 12 cloud, com cloud-init); não instala nada.

### 2. Instalar ou atualizar a RiaSense (Ansible)

Corre num Linux (no Windows, no WSL), na pasta `infra/ansible`. O código vai do teu clone para a VM como arquivo do commit pedido: a VM não precisa de credenciais do GitLab.

```bash
cd infra/ansible
cp inventario.exemplo.ini inventario.ini           # endereço e utilizador da VM
ansible-playbook -i inventario.ini site.yml -l proxmox
ansible-playbook -i inventario.ini site.yml -l proxmox -e riasense_ref=<commit|branch|tag>
```

O playbook instala o Docker, põe o código no commit pedido, faz `docker compose up` e **só termina quando `/api/ready` e a web respondem**. Correr outra vez atualiza.

> No WSL com o repositório em `/mnt/c`, o Ansible ignora o `ansible.cfg` (pasta com permissões de escrita para todos). Por isso os comandos passam o `-i` à mão. Se precisares dos papéis, define `ANSIBLE_ROLES_PATH=roles`.

### 3. VM sem rede (por exemplo, a do IT)

As imagens fazem-se numa máquina com rede, e o Ansible carrega-as:

```bash
# O nome do projeto fixa o nome das imagens (riasense-api, riasense-web), seja qual for a pasta do clone,
# e a plataforma garante imagens amd64 mesmo num Mac com Apple Silicon (as VM do IT e do Proxmox são amd64).
COMPOSE_PROJECT_NAME=riasense DOCKER_DEFAULT_PLATFORM=linux/amd64 docker compose build
docker save riasense-api riasense-web | gzip > infra/ansible/imagens/riasense-imagens.tar.gz
ansible-playbook -i inventario.ini site.yml -l it -e riasense_modo=imagens
```

Com `riasense_instalar_docker=false`, o Ansible não instala o Docker: a VM já o tem de ter.

## Verificação

- `tofu validate` e `tofu fmt -check` (OpenTofu 1.13, com `tofu init -backend=false`) e `ansible-lint site.yml` passam sem avisos (perfil `production`).
- Teste da origem única: `docker compose up -d --build` e `curl http://localhost:5173/api/ready` → `{"estado":"pronta"}`.
