#!/usr/bin/env bash
set -Eeuo pipefail

# 统一重启脚本：
# - 必重启 rust-main
# - 自动识别并重启本机所有 rust-connector-* 进程

CONNECTORS=$(pm2 jlist | node -e "const fs=require('fs');const arr=JSON.parse(fs.readFileSync(0,'utf8'));const names=arr.map(p=>p.name).filter(n=>n&&n.startsWith('rust-connector-'));process.stdout.write(names.join(' '));")

if [ -n "$CONNECTORS" ]; then
  pm2 restart rust-main $CONNECTORS --update-env
else
  pm2 restart rust-main --update-env
fi

pm2 save
pm2 list

echo "[rustbot-restart] main and connectors restarted"
