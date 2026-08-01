#!/usr/bin/env bash
set -Eeuo pipefail

# 子节点更新脚本（在 connector 节点执行）：
# 1) 拉取指定分支
# 2) 安装后端依赖
# 3) 仅重启 rust-connector-* 进程，不动主节点

SCRIPT_DIR=$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)
APP_DIR=${APP_DIR:-/www/wwwroot/rust-bot}
BRANCH=${1:-main}

cd "$APP_DIR"

# 防止在错误目录执行
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

# 自动发现本机全部 connector 进程名
CONNECTORS=$(pm2 jlist | node -e "const fs=require('fs');const arr=JSON.parse(fs.readFileSync(0,'utf8'));const names=arr.map(p=>p.name).filter(n=>n&&n.startsWith('rust-connector-'));process.stdout.write(names.join(' '));")

if [ -z "$CONNECTORS" ]; then
  echo "[rustbot-update-connector] WARN: no rust-connector-* process found"
else
  pm2 restart $CONNECTORS --update-env
  pm2 save >/dev/null
fi

echo "[rustbot-update-connector] ok"
