output "public_ip" {
  description = "Elastic IP of the instance."
  value       = aws_eip.this.public_ip
}

output "hostname" {
  description = "Auto-resolving sslip.io hostname for Caddy/Let's Encrypt (set as DOMAIN in .env)."
  value       = "annotate.${aws_eip.this.public_ip}.sslip.io"
}

output "app_url" {
  description = "Public URL once docker compose is up."
  value       = "https://annotate.${aws_eip.this.public_ip}.sslip.io"
}

output "ssh_command" {
  description = "SSH into the box."
  value       = "ssh ubuntu@${aws_eip.this.public_ip}"
}

output "next_steps" {
  value = <<-EOT
    1. Add the deploy key to GitHub:  ssh ubuntu@${aws_eip.this.public_ip} 'cat ~/.ssh/id_ed25519.pub'
       -> GitHub repo Settings > Deploy keys > Add (read-only).
    2. Allow-list this IP in MongoDB Atlas Network Access:  ${aws_eip.this.public_ip}/32
    3. Re-run ./deploy/deploy.sh — it clones the repo, renders the server .env from
       deploy/config.env, builds, and starts the stack.  (see docs/deploy-aws.md)
  EOT
}
