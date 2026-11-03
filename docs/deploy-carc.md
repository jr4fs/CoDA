# Running CoDA on CARC

This branch's CARC deployment runs directly in a Slurm GPU job. It uses a local
MongoDB instance and Ollama, then starts the Python, Node, and Vite development
servers and exposes Vite through ngrok. The AWS Terraform and Docker guide
describes a separate deployment; do not use `deploy/deploy.sh` for CARC.

## Prepare the cluster checkout

Use `carc-dashboard` and install the Python and Node dependencies using your
CARC environment. Copy `.env.example` to a repo-root `.env`, then set
`LLM_PROVIDER=ollama`, `EMBEDDINGS_PROVIDER=local`, and
`DB_CONN_STRING=mongodb://localhost:27017`. Keep API keys out of `.env` unless
you intentionally use an external provider. Verify the installed Ollama model
tag matches the model selected in the app; this deployment defaults to
`qwen:32b`.

The job expects `mongod`, `mongosh`, `ollama`, and `ngrok` binaries under the
project's `bin/`, plus a Python virtual environment at `pybackend/venv/` and
Node.js available through nvm. Set up the ngrok domain and authentication for
the CARC account before submitting the job.

## Submit the job

`deploy.sh` is the current site-specific Slurm script. Before submitting it,
review its `#SBATCH` account, partition, GPU, memory, and time settings, plus
`PROJECT`, `OLLAMA_MODELS`, `NVM_DIR`, module versions, and `NGROK_DOMAIN`.
These values reflect one CARC installation and must match your allocation and
checkout. `example_slurm_batch.sh` is an older example with different paths and
a different tunnel service; use `deploy.sh` as the reference for this branch.

```bash
sbatch deploy.sh
squeue -u "$USER"
```

The job starts MongoDB on loopback port 27017, Ollama on its default local
port, FastAPI and Node, then waits for Vite on port 5173 before starting the
ngrok tunnel. Inspect the Slurm output and service logs in `PROJECT` if startup
fails. The job's exit trap stops all five processes and MongoDB. Data in the
project's MongoDB and Ollama directories persists across jobs.

The public ngrok URL provides access to the running development server. Use
the app's authentication controls and a restricted tunnel when handling
sensitive data. Do not assume the AWS deployment's Caddy, Atlas, or OpenRouter
settings apply to this job.
