#!/usr/bin/env bash
set -Eeuo pipefail

SCRIPT_DIR=$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)
APP_DIR=${APP_DIR:-$(cd "$SCRIPT_DIR/.." && pwd)}
BRANCH=${1:-main}

cd "$APP_DIR"

if [ ! -d .git ]; then
  echo "[rustbot-update-connector] ERROR: $APP_DIR is not a git working tree"
  exit 1
fi

git fetch origin "$BRANCH"
if git show-ref --verify --quiet "refs/heads/$BRANCH"; then
  git checkout -f "$BRANCH"
else
  git checkout -f -B "$BRANCH" "origin/$BRANCH"
fi
git reset --hard "origin/$BRANCH"

cd "$APP_DIR/backend"
npm ci

CONNECTORS=$(pm2 jlist | node -e "const fs=require('fs');const arr=JSON.parse(fs.readFileSync(0,'utf8'));const names=arr.map(p=>p.name).filter(n=>n&&n.startsWith('rust-connector-'));process.stdout.write(names.join(' '));")

if [ -z "$CONNECTORS" ]; then
  echo "[rustbot-update-connector] WARN: no rust-connector-* process found"
else
  pm2 restart $CONNECTORS --update-env
  pm2 save >/dev/null
fi

echo "[rustbot-update-connector] ok"
