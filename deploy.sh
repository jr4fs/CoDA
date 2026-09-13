#!/bin/bash
#SBATCH --job-name=at_fastapi_gpu
#SBATCH --account=swabhas_1625
#SBATCH --partition=nlp_hiprio
#SBATCH --nodes=1
#SBATCH --ntasks=1
#SBATCH --cpus-per-task=12
#SBATCH --mem=64G
#SBATCH --time=90:00:00
#SBATCH --gres=gpu:rtxa6000:4        
#SBATCH --output=fastapi-%j.out
#SBATCH --error=fastapi-%j.err

module purge
module load gcc/13.3.0
module load cuda/12.6.3
module load cudnn/8.9.7.29-12-cuda

export OPENBLAS_NUM_THREADS=$SLURM_CPUS_PER_TASK 
export OMP_NUM_THREADS=$SLURM_CPUS_PER_TASK
export MKL_NUM_THREADS=$SLURM_CPUS_PER_TASK

export NVM_DIR="$HOME/.nvm"
source $NVM_DIR/nvm.sh
nvm use 24.14.0 

NGROK_DOMAIN=pony-earshot-jogger.ngrok-free.dev
HOSTNAME=$(hostname)
PORT=5173
MONGO_PORT=27017
PROJECT=/project2/swabhas_1625/jaspreet/annotation_tool

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
export OLLAMA_MODELS=/project2/swabhas_1625/jaspreet/annotation_tool/ollama_models
mkdir -p $OLLAMA_MODELS

export LD_LIBRARY_PATH=/lib64:$CUDA_HOME/lib64:$PROJECT/bin/bin/lib/ollama:$PROJECT/bin/bin/lib/ollama/cuda_v12:$LD_LIBRARY_PATH

echo "Starting Ollama server..."
$PROJECT/bin/bin/ollama serve > $PROJECT/ollama-${SLURM_JOB_ID}.log 2>&1 &
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
echo "Starting ngrok tunnel..."
$PROJECT/bin/ngrok http \
    --domain=$NGROK_DOMAIN \
    --log=stdout \
    $PORT > $PROJECT/ngrok-${SLURM_JOB_ID}.log 2>&1 &
TUNNEL_PID=$!

sleep 5

if ps -p $TUNNEL_PID > /dev/null; then
  echo "========================================"
  echo "Public URL: https://$NGROK_DOMAIN"
  echo "========================================"
else
  echo "ERROR: ngrok failed to start — check $PROJECT/ngrok-${SLURM_JOB_ID}.log"
fi

wait
