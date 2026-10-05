# Deploying the Annotation Tool to AWS — complete guide

From zero to a live, credentialed HTTPS app on one AWS EC2 VM. LLM inference via
**OpenRouter**, embeddings via the **OpenAI API** (switchable to Bedrock or local).

> For local development see [local-dev.md](./local-dev.md); to run the same stack
> in Docker on your machine see [deploy-docker.md](./deploy-docker.md).

You edit **one file** (`deploy/config.env`) and run **one script**
(`./deploy/deploy.sh`). The script provisions the infra (Terraform), syncs the
code, renders the server `.env`, and rebuilds/restarts. Re-running it is a redeploy.

```
Browser ──HTTPS──▶ Caddy ──/api/*──▶ Node BFF ──ML──▶ Python ML service
   (sslip.io / your domain)   │                │
                        Mongo Atlas   OpenRouter + OpenAI
```

---

## 0. Install local tools (one time)
On your machine (macOS shown; use apt/choco elsewhere):
```bash
brew install git awscli hashicorp/tap/terraform
# an SSH key, if you don't have one:
ls ~/.ssh/id_ed25519.pub || ssh-keygen -t ed25519
```
Docker is **not** needed locally — it only runs on the server.

## 1. AWS account + credentials
1. Create an AWS account. **New accounts start on the "Free plan", which blocks
   anything bigger than a micro instance — upgrade to the "Paid plan"** in the
   Billing console (your signup credits still apply and cover the t3.medium).
2. IAM → **Users → Create user** (e.g. `Deployer`) → attach **AdministratorAccess**
   (tighten later) → **Security credentials → Create access key → CLI**.
3. Configure the CLI locally (do this in your own terminal so the secret isn't logged):
   ```bash
   aws configure          # paste key id + secret, region us-east-1, output json
   aws sts get-caller-identity   # verify
   ```

## 2. MongoDB Atlas (free)
1. Create a free **M0** cluster at https://cloud.mongodb.com.
2. **Database Access** → add a DB user (username + password) with read/write.
3. **Connect → Drivers** → copy the SRV string
   (`mongodb+srv://USER:PASSWORD@cluster0.xxxxx.mongodb.net/...`); put the real
   password in it.
4. **Network Access** → you'll allow-list the server's IP after step 4 (the deploy
   script prints it). For now you can add `0.0.0.0/0` temporarily to avoid a round trip.

## 3. Fill in the single config file
```bash
cp deploy/config.env.example deploy/config.env
$EDITOR deploy/config.env
```
Set: `DB_CONN_STRING`, `OPENROUTER_API_KEY`, `OPENAI_API_KEY`, `ACME_EMAIL`, and
(optionally) `ADMIN_EMAIL`/`ADMIN_PASSWORD` for your first login. Leave `DOMAIN`
blank to get a free `annotate.<ip>.sslip.io` hostname. Leave `SSH_CIDR=auto`.
JWT secrets are generated for you — don't set them. `config.env` is git-ignored.

## 4. Deploy
```bash
./deploy/deploy.sh
```
**First run is two-phase** (the private repo needs a deploy key):
1. It provisions the EC2 box + Elastic IP, then fails the clone and prints:
   - a **deploy key** → add it at **GitHub → repo Settings → Deploy keys → Add key**
     (leave write access OFF), and
   - the **Elastic IP** → add `>IP</32` to **Atlas → Network Access** (if you didn't use 0.0.0.0/0).
2. Re-run `./deploy/deploy.sh`. It clones, syncs the `.env`, builds (~10–15 min the
   first time), runs the DB index setup, creates your admin user, waits for the TLS
   cert, and prints your URL.

Done — open the printed `https://…` URL and log in.

---

## Redeploying (after code or config changes)
```bash
git push                 # if you changed code
$EDITOR deploy/config.env   # if you changed settings
./deploy/deploy.sh          # syncs latest code + .env, rebuilds, restarts
```
The script is idempotent: unchanged infra is a no-op, and it always pulls the
branch fresh and `docker compose up -d --build`.

## Adding more user accounts
```bash
ssh ubuntu@<ip> "cd annotation_tool && docker compose exec -T node \
  npx tsx scripts/createUser.ts 'Name' 'email@x.org' 'password'"
```

## Switching providers (edit config.env, re-run deploy.sh)
- **Bedrock embeddings** (no keys — uses the instance IAM role):
  `ENABLE_BEDROCK=true`, `EMBEDDINGS_PROVIDER=bedrock`,
  `BEDROCK_EMBEDDING_MODEL=amazon.titan-embed-text-v2:0`. Also request model access
  in the Bedrock console once.
- **Local embeddings** (in-process mpnet, needs the 4 GB box): `EMBEDDINGS_PROVIDER=local`.
- **Local LLM**: `LLM_PROVIDER=ollama` (needs a reachable Ollama server).

## Operations
- **Logs:** `ssh ubuntu@<ip> "cd annotation_tool && docker compose logs -f"`
- **Durability:** enable EBS snapshots of the root volume (uploads live in
  `/mnt/appdata`; the DB is in Atlas with its own backups).
- **Cost:** t3.medium ≈ $30/mo + EBS, covered by the signup credits for months.
  OpenRouter + OpenAI are pay-per-use (embeddings are pennies).
- **Rotate secrets:** change them in `deploy/config.env` (and Atlas/OpenAI consoles)
  and re-run `deploy.sh`.

## Tear down (stops all charges)
```bash
cd deploy/terraform && terraform destroy
```
Destroys the instance, Elastic IP, security group, IAM role, key pair.
**Uploads on the box are lost** — snapshot `/mnt/appdata` first if you need them.
Atlas (separate) is deleted from the Atlas console.

---

### What the one file / one script replace
`deploy/config.env` is the single source of truth. `deploy/deploy.sh` fans it out to:
- `deploy/terraform/terraform.tfvars` (infra), applied via Terraform;
- the server-side `/app/.env` consumed by `docker-compose.yml`;
- `deploy/.generated.env` (auto JWT secrets, stable across redeploys);
- the first-user creation and one-time DB index setup.

You never hand-edit the server, tfvars, or the container `.env` directly.
