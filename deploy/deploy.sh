#!/usr/bin/env bash
# One command to provision + deploy + redeploy the annotation tool on AWS.
#
#   ./deploy/deploy.sh
#
# Reads deploy/config.env (your single settings file), applies the Terraform
# infra, renders the server-side container .env, syncs code to the instance, and
# rebuilds/restarts the stack. Safe to re-run — re-running IS a redeploy.
#
# First run is two-phase: it provisions the box, then (if the repo can't be
# cloned yet) prints a deploy key + the IP to allow-list in Atlas, and asks you
# to re-run. Every run after that just syncs + restarts.
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
TF_DIR="$SCRIPT_DIR/terraform"
CONFIG="$SCRIPT_DIR/config.env"
GENERATED="$SCRIPT_DIR/.generated.env"

command -v terraform >/dev/null || { echo "terraform not found (brew install hashicorp/tap/terraform)"; exit 1; }
command -v aws >/dev/null       || { echo "aws cli not found (brew install awscli)"; exit 1; }
[ -f "$CONFIG" ] || { echo "Missing $CONFIG — run: cp deploy/config.env.example deploy/config.env  then edit it."; exit 1; }

set -a; . "$CONFIG"; set +a

# ---- defaults ----
AWS_REGION="${AWS_REGION:-us-east-1}"; AWS_PROFILE="${AWS_PROFILE:-default}"
export AWS_PROFILE AWS_DEFAULT_REGION="$AWS_REGION"
INSTANCE_TYPE="${INSTANCE_TYPE:-t3.medium}"
PUBLIC_KEY_PATH="${PUBLIC_KEY_PATH:-~/.ssh/id_ed25519.pub}"
ENABLE_BEDROCK="${ENABLE_BEDROCK:-false}"
GIT_REPO="${GIT_REPO:-git@github.com:jr4fs/annotation_tool.git}"
GIT_BRANCH="${GIT_BRANCH:-deploy-single-vm}"

# ---- SSH CIDR auto-detect ----
if [ "${SSH_CIDR:-auto}" = "auto" ]; then
  SSH_CIDR="$(curl -fsS https://checkip.amazonaws.com | tr -d '\n')/32"
  echo "==> SSH_CIDR auto-detected: $SSH_CIDR"
fi

# ---- persistent JWT secrets (generated once, reused across redeploys) ----
if [ ! -f "$GENERATED" ]; then
  echo "==> generating persistent JWT secrets -> deploy/.generated.env"
  { echo "JWT_SECRET=$(openssl rand -hex 32)"
    echo "JWT_REFRESH_SECRET=$(openssl rand -hex 32)"; } > "$GENERATED"
fi
. "$GENERATED"

# ---- Terraform: render tfvars + apply ----
cat > "$TF_DIR/terraform.tfvars" <<EOF
region          = "$AWS_REGION"
ssh_cidr        = "$SSH_CIDR"
public_key_path = "$PUBLIC_KEY_PATH"
instance_type   = "$INSTANCE_TYPE"
enable_bedrock  = $ENABLE_BEDROCK
EOF

echo "==> terraform apply"
terraform -chdir="$TF_DIR" init -input=false >/dev/null
terraform -chdir="$TF_DIR" apply -input=false -auto-approve

EIP="$(terraform -chdir="$TF_DIR" output -raw public_ip)"
DOMAIN="${DOMAIN:-annotate.${EIP}.sslip.io}"
SSH="ssh -o StrictHostKeyChecking=accept-new -o ConnectTimeout=10 ubuntu@$EIP"
echo "==> Elastic IP: $EIP    DOMAIN: $DOMAIN"

# ---- wait for first-boot bootstrap ----
echo "==> waiting for cloud-init (Docker/swap/data-dirs)"
i=0; until $SSH 'cloud-init status 2>/dev/null | grep -q done'; do
  i=$((i+1)); [ $i -ge 40 ] && { echo "   cloud-init still not done; continuing"; break; }; sleep 10
done

# ---- ensure repo present (needs the deploy key on first run) ----
if ! $SSH 'test -d annotation_tool/.git'; then
  echo "==> cloning repo on the instance"
  if ! $SSH "git clone $GIT_REPO annotation_tool" 2>/dev/null; then
    echo
    echo "!! Clone failed — the instance needs read access. Do these two things, then re-run this script:"
    echo
    echo "   1) Add this READ-ONLY deploy key: GitHub -> repo Settings -> Deploy keys -> Add key"
    $SSH 'cat ~/.ssh/id_ed25519.pub'
    echo
    echo "   2) Allow-list this IP in MongoDB Atlas -> Network Access:  $EIP/32"
    exit 1
  fi
fi

# ---- render + sync the server-side container .env ----
TMP_ENV="$(mktemp)"
cat > "$TMP_ENV" <<EOF
DOMAIN=$DOMAIN
ACME_EMAIL=${ACME_EMAIL:-internal@localhost}
DATA_DIR=/mnt/appdata
DB_CONN_STRING=$DB_CONN_STRING
DB_NAME=${DB_NAME:-annotationTool}
USER_DETAILS_COLLECTION_NAME=UserDetails
TASKS_COLLECTION_NAME=TaskDetails
ANNOTATION_COLLECTION_NAME=AnnotationDetails
JWT_SECRET=$JWT_SECRET
JWT_REFRESH_SECRET=$JWT_REFRESH_SECRET
ALLOW_SIGNUP=${ALLOW_SIGNUP:-false}
ADMIN_EMAIL=${ADMIN_EMAIL:-}
LLM_PROVIDER=${LLM_PROVIDER:-openrouter}
OPENROUTER_API_KEY=${OPENROUTER_API_KEY:-}
OPENROUTER_APP_NAME=Annotation Tool
OPENROUTER_SITE_URL=https://$DOMAIN
EMBEDDINGS_PROVIDER=${EMBEDDINGS_PROVIDER:-openai}
OPENAI_API_KEY=${OPENAI_API_KEY:-}
OPENAI_EMBEDDING_MODEL=${OPENAI_EMBEDDING_MODEL:-text-embedding-3-small}
BEDROCK_EMBEDDING_MODEL=${BEDROCK_EMBEDDING_MODEL:-amazon.titan-embed-text-v2:0}
BEDROCK_REGION=$AWS_REGION
APP_MODE=${APP_MODE:-DEFAULT}
MAX_CONCURRENT_SAMPLING=${MAX_CONCURRENT_SAMPLING:-1}
SAMPLING_CANDIDATE_CAP=${SAMPLING_CANDIDATE_CAP:-}
VITE_APP_MODE=${VITE_APP_MODE:-}
DEFAULT_COVERAGE_SAMPLES=${DEFAULT_COVERAGE_SAMPLES:-15}
VITE_DEFAULT_COVERAGE_SAMPLES=${VITE_DEFAULT_COVERAGE_SAMPLES:-15}
AWS_REGION=$AWS_REGION
# Ship container logs to CloudWatch; compose reads COMPOSE_FILE so every command includes the override.
COMPOSE_FILE=docker-compose.yml:deploy/docker-compose.awslogs.yml
EOF
scp -q -o StrictHostKeyChecking=accept-new "$TMP_ENV" "ubuntu@$EIP:annotation_tool/.env"
rm -f "$TMP_ENV"
echo "==> .env synced to instance"

# ---- sync code + rebuild + restart ----
echo "==> syncing code + docker compose up --build (first build ~10-15 min)"
$SSH "cd annotation_tool \
  && git fetch -q origin && git checkout -q $GIT_BRANCH && git reset --hard -q origin/$GIT_BRANCH \
  && docker compose up -d --build"

# ---- one-time Atlas index setup ----
if ! $SSH 'test -f ~/.annotation-db-setup-done'; then
  echo "==> creating Atlas collections + indexes (one-time)"
  $SSH "cd annotation_tool \
    && docker run --rm -v \$PWD:/repo -w /repo -e MONGODB_URI='$DB_CONN_STRING' -e DB_NAME='${DB_NAME:-annotationTool}' \
         python:3.11-slim bash -c 'pip install -q pymongo && python setup_repo.py' \
    && sudo rm -rf pybackend/venv \
    && touch ~/.annotation-db-setup-done"
fi

# ---- first admin user ----
if [ -n "${ADMIN_EMAIL:-}" ] && [ -n "${ADMIN_PASSWORD:-}" ]; then
  echo "==> ensuring admin user: $ADMIN_EMAIL"
  $SSH "cd annotation_tool && docker compose exec -T node npx tsx scripts/createUser.ts '${ADMIN_NAME:-admin}' '$ADMIN_EMAIL' '$ADMIN_PASSWORD'" \
    || echo "   (user may already exist — ok)"
fi

# ---- health check ----
echo "==> waiting for HTTPS (Let's Encrypt cert issuance)"
i=0; until curl -fsS "https://$DOMAIN/health" >/dev/null 2>&1; do
  i=$((i+1)); [ $i -ge 30 ] && { echo "   health not green yet — cert may still be issuing; check: docker compose logs -f caddy"; break; }; sleep 10
done

echo
echo "======================================================"
echo "  Deployed:  https://$DOMAIN"
echo "  SSH:       ssh ubuntu@$EIP"
echo "  Logs:      $SSH 'cd annotation_tool && docker compose logs -f'"
echo "======================================================"
