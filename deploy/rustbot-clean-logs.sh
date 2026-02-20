#!/usr/bin/env bash
set -Eeuo pipefail

# 日志清理脚本：
# - 清空 PM2 缓冲日志
# - 删除 PM2 与 Nginx 历史日志文件

PM2_LOG_DIR=${PM2_LOG_DIR:-/root/.pm2/logs}
NGINX_LOG_DIR=${NGINX_LOG_DIR:-/www/wwwlogs}

pm2 flush || true
find "$PM2_LOG_DIR" -type f -name '*.log' -delete || true
find "$NGINX_LOG_DIR" -type f -name '*.log' -delete || true

echo "[rustbot-clean-logs] logs cleared"
