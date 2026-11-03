#!/bin/bash
#SBATCH --job-name=<job_name>
#SBATCH --account=<account_name>
#SBATCH --partition=<partition_name>
#SBATCH --nodes=1
#SBATCH --ntasks=1
#SBATCH --cpus-per-task=12
#SBATCH --mem=64G
#SBATCH --time=48:00:00
#SBATCH --gres=gpu:1         
#SBATCH --output=fastapi-%j.out
#SBATCH --error=fastapi-%j.err

module purge
module load gcc/13.3.0
module load cuda/12.6.3
module load cudnn/8.9.7.29-12-cuda

export OPENBLAS_NUM_THREADS=$SLURM_CPUS_PER_TASK 
export OMP_NUM_THREADS=$SLURM_CPUS_PER_TASK
export MKL_NUM_THREADS=$SLURM_CPUS_PER_TASK

export NVM_DIR="/home1/schellap/.nvm"
source $NVM_DIR/nvm.sh

HOSTNAME=$(hostname)
PORT=5173
MONGO_PORT=27017
PROJECT=/scratch1/schellap/annotation_tool

echo "FastAPI server starting on ${HOSTNAME}:${PORT}"
echo "GPU allocated: $CUDA_VISIBLE_DEVICES"

cleanup() {
  echo "Shutting down all services..."
  kill $FASTAPI_PID $BACKEND_PID $FRONTEND_PID $OLLAMA_PID $TUNNEL_PID 2>/dev/null
  $PROJECT/bin/mongod --shutdown --dbpath $MONGO_DATA
  echo "All services stopped."
}
trap cleanup EXIT

# ── MongoDB ───────────────────────────────────────────────────────────────────
MONGO_DATA=$PROJECT/pybackend/data/mongodb
MONGO_LOG=$PROJECT/mongodb-${SLURM_JOB_ID}.log
mkdir -p $MONGO_DATA

echo "Starting MongoDB..."
$PROJECT/bin/mongod \
  --dbpath $MONGO_DATA \
  --logpath $MONGO_LOG \
  --port $MONGO_PORT \
  --bind_ip 127.0.0.1 \
  --fork

sleep 5
if $PROJECT/bin/mongosh --port $MONGO_PORT --eval "db.runCommand({ ping: 1 })" > /dev/null 2>&1; then
  echo "MongoDB started successfully on port $MONGO_PORT"
else
  echo "ERROR: MongoDB failed to start — check $MONGO_LOG"
  exit 1
fi

# ── Ollama ────────────────────────────────────────────────────────────────────
export OLLAMA_MODELS=/scratch1/schellap/ollama_models
mkdir -p $OLLAMA_MODELS

# CUDA library paths for Ollama's runner subprocess
export LD_LIBRARY_PATH=/lib64:$CUDA_HOME/lib64:$PROJECT/bin/lib/ollama:$LD_LIBRARY_PATH

echo "Starting Ollama server..."
$PROJECT/bin/ollama serve > $PROJECT/ollama-${SLURM_JOB_ID}.log 2>&1 &
OLLAMA_PID=$!

echo "Waiting for Ollama to start..."
sleep 10

if ps -p $OLLAMA_PID > /dev/null; then
  echo "Ollama started successfully (PID: $OLLAMA_PID)"
else
  echo "ERROR: Ollama failed to start"
  $PROJECT/bin/mongod --shutdown --dbpath $MONGO_DATA
  exit 1
fi

# ── Python backend ────────────────────────────────────────────────────────────
cd $PROJECT/pybackend
source $PROJECT/pybackend/venv/bin/activate

echo "Starting FastAPI..."
PYTHONUNBUFFERED=1 python main.py > $PROJECT/fastapi-${SLURM_JOB_ID}.log 2>&1 &
FASTAPI_PID=$!

# ── Node backends ─────────────────────────────────────────────────────────────
echo "Starting Node backend..."
cd $PROJECT/backend
npm run dev > $PROJECT/backend-${SLURM_JOB_ID}.log 2>&1 &
BACKEND_PID=$!

echo "Starting Node frontend..."
cd $PROJECT/frontend
npm run dev > $PROJECT/frontend-${SLURM_JOB_ID}.log 2>&1 &
FRONTEND_PID=$!

# Wait for Vite to bind before opening the tunnel
echo "Waiting for frontend on port $PORT..."
until (echo > /dev/tcp/localhost/$PORT) 2>/dev/null; do
  if ! ps -p $FRONTEND_PID > /dev/null 2>&1; then
    echo "ERROR: Frontend process died. Check $PROJECT/frontend-${SLURM_JOB_ID}.log"
    exit 1
  fi
  sleep 1
done
echo "Frontend is up."

# ── ngrok ─────────────────────────────────────────────────────────────────────
echo "Starting localhost.run tunnel..."
ssh -R 80:localhost:$PORT \
    -o StrictHostKeyChecking=no \
    -o ServerAliveInterval=30 \
    -o ServerAliveCountMax=10 \
    ssh.localhost.run 2>&1 | tee $PROJECT/tunnel-${SLURM_JOB_ID}.log &
TUNNEL_PID=$!

sleep 5
TUNNEL_URL=$(grep -m1 "https://" $PROJECT/tunnel-${SLURM_JOB_ID}.log | awk '{print $1}')
echo "========================================"
echo "Public URL: $TUNNEL_URL"
echo "========================================"

wait