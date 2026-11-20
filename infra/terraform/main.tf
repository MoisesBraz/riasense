# VM da demo ao vivo no Proxmox (ADR-0028): Debian 12 cloud, cloud-init com utilizador e chave SSH.
# Depois de `tofu apply`, o `infra/ansible` instala a RiaSense nesta VM.

resource "proxmox_download_file" "debian12" {
  content_type = "iso"
  datastore_id = var.datastore_imagens
  node_name    = var.node
  url          = "https://cloud.debian.org/images/cloud/bookworm/latest/debian-12-genericcloud-amd64.qcow2"
  file_name    = "debian-12-genericcloud-amd64.img"
  overwrite    = false
}

resource "proxmox_virtual_environment_vm" "demo" {
  name        = var.nome
  description = "RiaSense: demo ao vivo (ADR-0028). Gerida por OpenTofu: não editar à mão."
  tags        = ["riasense", "hackathon"]
  node_name   = var.node
  vm_id       = var.vm_id
  on_boot     = true

  # A imagem cloud não traz o qemu-guest-agent: ligado, o OpenTofu ficava à espera do IP. O Ansible instala-o.
  agent {
    enabled = false
  }

  scsi_hardware = "virtio-scsi-single"
  boot_order    = ["scsi0", "net0"]

  cpu {
    cores = var.cores
    type  = "host"
  }

  memory {
    dedicated = var.memoria_mib
  }

  disk {
    datastore_id = var.datastore
    file_id      = proxmox_download_file.debian12.id
    interface    = "scsi0"
    discard      = "on"
    size         = var.disco_gib
  }

  network_device {
    bridge = var.bridge
  }

  operating_system {
    type = "l26"
  }

  initialization {
    datastore_id = var.datastore
    ip_config {
      ipv4 {
        address = var.ipv4
        gateway = var.ipv4 == "dhcp" ? null : var.gateway
      }
    }
    user_account {
      username = var.utilizador
      keys     = [trimspace(var.chave_ssh_publica)]
    }
  }
}
