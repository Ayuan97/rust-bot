#!/usr/bin/env bash
set -Eeuo pipefail

PM2_LOG_DIR=${PM2_LOG_DIR:-/root/.pm2/logs}
NGINX_LOG_DIR=${NGINX_LOG_DIR:-/www/wwwlogs}

pm2 flush || true
find "$PM2_LOG_DIR" -type f -name '*.log' -delete || true
find "$NGINX_LOG_DIR" -type f -name '*.log' -delete || true

echo "[rustbot-clean-logs] logs cleared"
