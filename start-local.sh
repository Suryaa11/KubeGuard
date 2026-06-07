#!/bin/bash
# ============================================================
#  KubeGuard AI - Local Development Startup Script
#  Run this from the project root: bash start-local.sh
#  Services started: Frontend, Gateway, Project Service, Watcher Service, Analysis Service
#  Optional: Azure Functions when `func` is available
# ============================================================

set -e

YELLOW='\033[1;33m'
GREEN='\033[0;32m'
CYAN='\033[0;36m'
RED='\033[0;31m'
NC='\033[0m'

log() { echo -e "${CYAN}[kubeguard]${NC} $1"; }
ok() { echo -e "${GREEN}[  ok  ]${NC} $1"; }
err() { echo -e "${RED}[ fail ]${NC} $1"; }

PIDS=()
cleanup() {
  echo ""
  log "Shutting down all services..."
  for pid in "${PIDS[@]}"; do
    kill "$pid" 2>/dev/null && echo "  Stopped PID $pid"
  done
  exit 0
}
trap cleanup SIGINT SIGTERM

if [ ! -f .env ]; then
  err ".env file not found. Copy .env.example to .env and fill in your values."
  exit 1
fi

set -a
source .env
set +a

check_deps() {
  local dir=$1
  if [ ! -d "$dir/node_modules" ]; then
    log "Installing dependencies for $dir..."
    (cd "$dir" && npm install --silent)
  fi
}

check_deps frontend
log "Starting Frontend on http://localhost:5173 ..."
(cd frontend && npm run dev) &
PIDS+=($!)
ok "Frontend started (PID ${PIDS[-1]})"

check_deps gateway
log "Starting API Gateway on http://localhost:3000 ..."
(cd gateway && npm start) &
PIDS+=($!)
ok "Gateway started (PID ${PIDS[-1]})"

check_deps project-service
log "Starting Project Service on http://localhost:3001 ..."
(cd project-service && \
  PROJECT_PORT=3001 \
  MONGODB_URI=$MONGODB_URI \
  INTERNAL_SECRET=$INTERNAL_SECRET \
  ENCRYPTION_KEY=$ENCRYPTION_KEY \
  GITHUB_TOKEN=$GITHUB_TOKEN \
  GATEWAY_PUBLIC_URL=$GATEWAY_PUBLIC_URL \
  npm start) &
PIDS+=($!)
ok "Project Service started (PID ${PIDS[-1]})"

check_deps watcher-service
log "Starting Watcher Service on http://localhost:3002 ..."
(cd watcher-service && \
  WATCHER_PORT=3002 \
  MONGODB_URI=$MONGODB_URI \
  INTERNAL_SECRET=$INTERNAL_SECRET \
  PROJECT_SERVICE_URL=${PROJECT_SERVICE_URL:-http://localhost:3001} \
  ANALYSIS_SERVICE_URL=${ANALYSIS_SERVICE_URL:-http://localhost:3003} \
  npm start) &
PIDS+=($!)
ok "Watcher Service started (PID ${PIDS[-1]})"

check_deps analysis-service
log "Starting Analysis Service on http://localhost:3003 ..."
(cd analysis-service && \
  ANALYSIS_PORT=3003 \
  MONGODB_URI=$MONGODB_URI \
  INTERNAL_SECRET=$INTERNAL_SECRET \
  AI_API_URL=$AI_API_URL \
  AI_API_KEY=$AI_API_KEY \
  AI_MODEL=${AI_MODEL:-gpt-4o-mini} \
  AZURE_STORAGE_CONNECTION_STRING=$AZURE_STORAGE_CONNECTION_STRING \
  AZURE_STORAGE_CONTAINER=${AZURE_STORAGE_CONTAINER:-kubeguard-reports} \
  SERVICE_BUS_CONNECTION_STRING=$SERVICE_BUS_CONNECTION_STRING \
  SERVICE_BUS_QUEUE=${SERVICE_BUS_QUEUE:-report-ready} \
  PROJECT_SERVICE_URL=${PROJECT_SERVICE_URL:-http://localhost:3001} \
  WATCHER_SERVICE_URL=${WATCHER_SERVICE_URL:-http://localhost:3002} \
  ADMIN_EMAILS=$ADMIN_EMAILS \
  npm start) &
PIDS+=($!)
ok "Analysis Service started (PID ${PIDS[-1]})"

echo ""
echo -e "${YELLOW}============================================================${NC}"
echo -e "${YELLOW}  KubeGuard AI - running locally${NC}"
echo -e "${YELLOW}============================================================${NC}"
echo -e "  Frontend   -> ${GREEN}http://localhost:5173${NC}"
echo -e "  Gateway    -> ${GREEN}http://localhost:3000${NC}"
echo -e "  Project Svc -> ${GREEN}http://localhost:3001${NC}"
echo -e "  Watcher Svc -> ${GREEN}http://localhost:3002${NC}"
echo -e "  Analysis Svc -> ${GREEN}http://localhost:3003${NC}"
echo -e "  Health     -> ${GREEN}http://localhost:3000/health${NC}"
echo -e "${YELLOW}============================================================${NC}"
echo ""
log "Press Ctrl+C to stop all services"
echo ""

if command -v func &> /dev/null; then
  check_deps functions
  log "Starting Azure Functions on http://localhost:7071 ..."
  (cd functions && func start) &
  PIDS+=($!)
  ok "Azure Functions started (PID ${PIDS[-1]})"
else
  log "Azure Functions CLI (func) not found. Skipping. Install with: npm install -g azure-functions-core-tools@4"
fi

wait
