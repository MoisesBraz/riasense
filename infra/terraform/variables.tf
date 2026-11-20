variable "proxmox_insecure" {
  description = "Desliga a verificação TLS do Proxmox. Por omissão verifica: confiar na CA do Proxmox (ou usar ACME) é o certo; true só por escolha explícita e consciente."
  type        = bool
  default     = false
}

variable "node" {
  description = "Nome do nó do Proxmox onde fica a VM."
  type        = string
}

variable "vm_id" {
  description = "ID da VM no Proxmox. Escolher um livre (ver `qm list` no nó)."
  type        = number
}

variable "nome" {
  description = "Nome da VM."
  type        = string
  default     = "riasense-demo"
}

variable "cores" {
  description = "vCPU. A demo (API + nginx) chega com 2."
  type        = number
  default     = 2
}

variable "memoria_mib" {
  description = "RAM em MiB. Respeitar o tecto de memória do nó."
  type        = number
  default     = 2048
}

variable "disco_gib" {
  description = "Disco em GiB: Debian, Docker, imagens (~1,5 GB) e os Parquet."
  type        = number
  default     = 20
}

variable "datastore" {
  description = "Datastore dos discos da VM."
  type        = string
  default     = "local-lvm"
}

variable "datastore_imagens" {
  description = "Datastore onde fica a imagem cloud do Debian (tem de aceitar o tipo `iso`)."
  type        = string
  default     = "local"
}

variable "bridge" {
  description = "Bridge de rede da VM."
  type        = string
  default     = "vmbr0"
}

variable "ipv4" {
  description = "Endereço da VM em CIDR (ex.: 192.0.2.10/24), ou \"dhcp\"."
  type        = string
  default     = "dhcp"
}

variable "gateway" {
  description = "Gateway IPv4 quando o endereço é fixo; ignorado com dhcp."
  type        = string
  default     = null
}

variable "utilizador" {
  description = "Utilizador criado pelo cloud-init, que o Ansible usa."
  type        = string
  default     = "riasense"
}

variable "chave_ssh_publica" {
  description = "Chave SSH pública de quem corre o Ansible (o conteúdo, não o caminho)."
  type        = string
}
