#!/usr/bin/env bash
set -Eeuo pipefail

# 主节点一键更新脚本：
# 1) 拉取指定分支代码
# 2) 更新后端依赖 + 构建前端
# 3) 重启主节点与本机子节点
# 4) 健康检查
# 5) 可选扇出更新远程子节点

SCRIPT_DIR=$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)
APP_DIR=${APP_DIR:-$(cd "$SCRIPT_DIR/.." && pwd)}
WEB_DIR=${WEB_DIR:-/var/www/app.rustplusplus.com}

BRANCH=${1:-main}
REQUIRED_FILE=backend/src/connector-node/app.js
HEALTH_URL=${HEALTH_URL:-https://api.rustplusplus.com/api/health}
HEALTH_RETRIES=${HEALTH_RETRIES:-20}
HEALTH_INTERVAL_SEC=${HEALTH_INTERVAL_SEC:-2}
FANOUT_CONNECTOR_UPDATES=${FANOUT_CONNECTOR_UPDATES:-true}
FANOUT_CONNECTOR_STRICT=${FANOUT_CONNECTOR_STRICT:-false}

cd "$APP_DIR"

# 防止在错误目录执行，必须是 git 工作树
if [ ! -d .git ]; then
  echo "[rustbot-update] ERROR: $APP_DIR is not a git working tree"
  exit 1
fi

echo "[rustbot-update] fetching branch: $BRANCH"
git fetch origin "$BRANCH"

if ! git cat-file -e "origin/$BRANCH:$REQUIRED_FILE" 2>/dev/null; then
  echo "[rustbot-update] ERROR: origin/$BRANCH missing $REQUIRED_FILE"
  echo "[rustbot-update] current production mode requires distributed connector code"
  exit 1
fi

if git show-ref --verify --quiet "refs/heads/$BRANCH"; then
  git checkout -f "$BRANCH"
else
  git checkout -f -B "$BRANCH" "origin/$BRANCH"
fi
git reset --hard "origin/$BRANCH"

echo "[rustbot-update] install backend deps"
cd "$APP_DIR/backend"
npm ci

echo "[rustbot-update] build frontend"
cd "$APP_DIR/frontend"
npm ci
npm run build

mkdir -p "$WEB_DIR"
rsync -a --delete dist/ "$WEB_DIR/"

# 重启前先清日志，方便后续排障
"$SCRIPT_DIR/rustbot-clean-logs.sh"
"$SCRIPT_DIR/rustbot-restart.sh"

# 主节点健康检查，避免发布后静默失败
for i in $(seq 1 "$HEALTH_RETRIES"); do
  if curl -fsS "$HEALTH_URL" >/dev/null; then
    echo "[rustbot-update] health check ok (attempt ${i}/${HEALTH_RETRIES})"
    break
  fi
  sleep "$HEALTH_INTERVAL_SEC"
  if [ "$i" -eq "$HEALTH_RETRIES" ]; then
    echo "[rustbot-update] health check failed after ${HEALTH_RETRIES} attempts"
    exit 1
  fi
done

# 可选：从主节点自动触发远程子节点更新
if [ "$FANOUT_CONNECTOR_UPDATES" = "true" ]; then
  if "$SCRIPT_DIR/rustbot-update-connectors.sh" "$BRANCH"; then
    echo "[rustbot-update] connector fanout update done"
  else
    if [ "$FANOUT_CONNECTOR_STRICT" = "true" ]; then
      echo "[rustbot-update] connector fanout update failed (strict mode)"
      exit 1
    fi
    echo "[rustbot-update] WARN: connector fanout update failed (ignored)"
  fi
fi
