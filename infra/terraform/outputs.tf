output "ipv4" {
  description = "Endereço configurado da VM (com dhcp, ver no router ou na consola do Proxmox)."
  value       = var.ipv4
}

output "utilizador" {
  value = var.utilizador
}
