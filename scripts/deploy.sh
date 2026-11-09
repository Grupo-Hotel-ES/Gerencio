#!/usr/bin/env bash
# Atualiza a VPS com a branch publicada (padrão: develop).
# Roda na VPS. O CI envia este arquivo por SSH (`bash -s`), então a versão usada
# é sempre a do commit que disparou o deploy. Também dá para rodar à mão:
#   GERONCIO_DIR=/root/Gerencio bash scripts/deploy.sh
#
# Os arquivos fora do git (backend/.env, frontend/.env e
# backend/docker-compose.override.yml) não são tocados.
set -euo pipefail

GERONCIO_DIR="${GERONCIO_DIR:-/root/Gerencio}"
BRANCH="${BRANCH:-develop}"
WEB_ROOT="${WEB_ROOT:-/var/www/geroncio}"

log() { printf '\n==> %s\n' "$*"; }

cd "$GERONCIO_DIR"

log "Atualizando código ($BRANCH)"
git fetch --prune origin "$BRANCH"
git checkout -f -B "$BRANCH" "origin/$BRANCH"
git log -1 --oneline

log 'Backend: dependências e migrations'
cd "$GERONCIO_DIR/backend"
pnpm install --frozen-lockfile
pnpm db:deploy

log 'Backend: containers'
docker compose up -d --build --remove-orphans
docker image prune -f >/dev/null

log 'Frontend: build web'
cd "$GERONCIO_DIR/frontend"
pnpm install --frozen-lockfile
rm -rf dist
NODE_OPTIONS=--max-old-space-size=3072 pnpm exec expo export --platform web
mkdir -p "$WEB_ROOT"
rsync -a --delete dist/ "$WEB_ROOT/"

log 'Verificando as APIs'
for porta in 3002 3003 3004 3006; do
  ok=0
  for _ in $(seq 1 30); do
    if curl -fsS "http://127.0.0.1:$porta/health" >/dev/null; then ok=1; break; fi
    sleep 2
  done
  if [ "$ok" -ne 1 ]; then
    echo "API na porta $porta não respondeu ao /health" >&2
    docker compose -f "$GERONCIO_DIR/backend/docker-compose.yml" ps >&2
    exit 1
  fi
  echo "porta $porta ok"
done

log 'Deploy concluído'
