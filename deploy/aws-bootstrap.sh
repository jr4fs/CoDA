#!/usr/bin/env bash
# One-time instance setup for the annotation tool on a fresh Ubuntu EC2 box.
# Idempotent: safe to re-run. Run as the default `ubuntu` user:
#   curl -fsSL <raw-url>/deploy/aws-bootstrap.sh | bash
# ...or after cloning:  bash deploy/aws-bootstrap.sh
set -euo pipefail

DATA_DIR="${DATA_DIR:-/mnt/appdata}"
SWAP_GB="${SWAP_GB:-4}"

echo "==> Updating apt and installing Docker Engine + Compose plugin"
if ! command -v docker >/dev/null 2>&1; then
  curl -fsSL https://get.docker.com | sh
fi
sudo usermod -aG docker "$USER" || true

echo "==> Ensuring ${SWAP_GB}G swap exists (build headroom for torch/vite on 4GB)"
if [ ! -f /swapfile ]; then
  sudo fallocate -l "${SWAP_GB}G" /swapfile || sudo dd if=/dev/zero of=/swapfile bs=1M count=$((SWAP_GB*1024))
  sudo chmod 600 /swapfile
  sudo mkswap /swapfile
  sudo swapon /swapfile
  echo '/swapfile none swap sw 0 0' | sudo tee -a /etc/fstab >/dev/null
fi

echo "==> Creating persistent data directories under ${DATA_DIR}"
sudo mkdir -p \
  "${DATA_DIR}"/shared_uploads \
  "${DATA_DIR}"/val_datasets \
  "${DATA_DIR}"/rest_datasets \
  "${DATA_DIR}"/guide_datasets \
  "${DATA_DIR}"/generated_codebooks \
  "${DATA_DIR}"/metrics
# Containers run as root and mount these; keep them writable by root + ubuntu.
sudo chown -R "$USER":"$USER" "${DATA_DIR}"

echo "==> Generating a GitHub deploy key (if absent)"
if [ ! -f "$HOME/.ssh/id_ed25519" ]; then
  ssh-keygen -t ed25519 -N "" -f "$HOME/.ssh/id_ed25519" -C "annotation-tool-deploy@$(hostname)"
fi
ssh-keyscan -t ed25519 github.com >> "$HOME/.ssh/known_hosts" 2>/dev/null || true

echo
echo "=================================================================="
echo " Bootstrap complete."
echo
echo " 1) Add this PUBLIC key as a READ-ONLY deploy key on the repo:"
echo "    GitHub -> repo Settings -> Deploy keys -> Add deploy key"
echo "    ----------------------------------------------------------"
cat "$HOME/.ssh/id_ed25519.pub"
echo "    ----------------------------------------------------------"
echo
echo " 2) Log out/in once (or run 'newgrp docker') so docker works without sudo."
echo
echo " 3) Deploy — either:"
echo "    - Recommended: run ./deploy/deploy.sh from your own machine. It renders"
echo "      the server .env from deploy/config.env (+ generated JWT secrets),"
echo "      syncs the code, and builds — you never hand-edit .env on the box."
echo "    - Or manually on this box:"
echo "        git clone git@github.com:jr4fs/annotation_tool.git"
echo "        cd annotation_tool"
echo "        cp .env.example .env    # then fill it in (see docs/deploy-aws.md)"
echo "        docker compose up -d --build"
echo "=================================================================="
