#!/usr/bin/env bash
# EC2 first-boot provisioning (runs as root via cloud-init). Installs Docker +
# Compose, adds swap for build headroom, creates the persistent data dirs, and
# generates a GitHub deploy key for the 'ubuntu' user. The repo clone + .env +
# `docker compose up` remain manual (private repo + secrets) — see docs/deploy-aws.md.
set -euxo pipefail

# Docker Engine + Compose plugin
curl -fsSL https://get.docker.com | sh
usermod -aG docker ubuntu

# 4G swap (keeps the SPA/torch build from OOM-ing on a 4GB box)
if [ ! -f /swapfile ]; then
  fallocate -l 4G /swapfile || dd if=/dev/zero of=/swapfile bs=1M count=4096
  chmod 600 /swapfile
  mkswap /swapfile
  swapon /swapfile
  echo '/swapfile none swap sw 0 0' >> /etc/fstab
fi

# Persistent data root (mounted into both containers at /app/<dir>)
mkdir -p /mnt/appdata/{shared_uploads,val_datasets,rest_datasets,guide_datasets,generated_codebooks,metrics}
chown -R ubuntu:ubuntu /mnt/appdata

# Deploy key for the private repo (public half printed by the terraform output)
sudo -u ubuntu bash -c '
  [ -f ~/.ssh/id_ed25519 ] || ssh-keygen -t ed25519 -N "" -f ~/.ssh/id_ed25519 -C annotation-tool-deploy
  ssh-keyscan -t ed25519 github.com >> ~/.ssh/known_hosts 2>/dev/null || true
'
