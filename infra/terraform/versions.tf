# O OpenTofu (`tofu`) só cria a VM da demo no Proxmox (ADR-0028). A instalação é do Ansible.
terraform {
  required_version = ">= 1.5"
  required_providers {
    proxmox = {
      source  = "bpg/proxmox"
      version = ">= 0.122.0, < 1.0.0"
    }
  }
}

# Credenciais por variáveis de ambiente, nunca no repositório:
#   PROXMOX_VE_ENDPOINT=https://<proxmox>:8006/   PROXMOX_VE_API_TOKEN='utilizador@<realm>!token=segredo'
provider "proxmox" {
  insecure = var.proxmox_insecure
  ssh {
    agent    = false
    username = "root"
  }
}
