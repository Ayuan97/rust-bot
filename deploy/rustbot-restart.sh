#!/usr/bin/env bash
set -Eeuo pipefail

# 统一重启脚本：
# - 必重启 rust-main
# - rust-main 健康后再重启本机所有 rust-connector-* 进程

SCRIPT_DIR=$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)
APP_DIR=${APP_DIR:-$(cd "$SCRIPT_DIR/.." && pwd)}
PORT=${PORT:-$(sed -n 's/^PORT=//p' "$APP_DIR/.env" 2>/dev/null | tail -1)}
PORT=${PORT:-3000}
HEALTH_URL=${RESTART_HEALTH_URL:-http://127.0.0.1:$PORT/api/health}
HEALTH_RETRIES=${RESTART_HEALTH_RETRIES:-20}
HEALTH_INTERVAL_SEC=${RESTART_HEALTH_INTERVAL_SEC:-2}
CONNECTORS=$(pm2 jlist | node -e "const fs=require('fs');const arr=JSON.parse(fs.readFileSync(0,'utf8'));const names=arr.map(p=>p.name).filter(n=>n&&n.startsWith('rust-connector-'));process.stdout.write(names.join(' '));")

pm2 restart rust-main --update-env

for i in $(seq 1 "$HEALTH_RETRIES"); do
  if curl -fsS --max-time 3 "$HEALTH_URL" >/dev/null 2>&1; then
    echo "[rustbot-restart] main health check ok (attempt ${i}/${HEALTH_RETRIES})"
    break
  fi
  if [ "$i" -eq "$HEALTH_RETRIES" ]; then
    echo "[rustbot-restart] main health check failed after ${HEALTH_RETRIES} attempts" >&2
    exit 1
  fi
  sleep "$HEALTH_INTERVAL_SEC"
done

if [ -n "$CONNECTORS" ]; then
  pm2 restart $CONNECTORS --update-env
fi

pm2 save
pm2 list

echo "[rustbot-restart] main and connectors restarted"
