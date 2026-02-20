#!/usr/bin/env bash
set -Eeuo pipefail

# 远程子节点批量更新脚本：
# - 支持免密模式（connector-nodes.list）
# - 支持密码模式（connector-nodes.auth，依赖 sshpass）
# - 主节点会把 GitHub deploy key 和更新脚本同步到每台子节点后执行更新

SCRIPT_DIR=$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)
BRANCH=${1:-main}

NODE_FILE=${CONNECTOR_NODE_FILE:-/etc/rustbot/connector-nodes.list}
NODE_AUTH_FILE=${CONNECTOR_NODE_AUTH_FILE:-/etc/rustbot/connector-nodes.auth}

SSH_OPTS=(-o ConnectTimeout=12 -o StrictHostKeyChecking=accept-new)
GITHUB_KEY_PATH=${GITHUB_DEPLOY_KEY_PATH:-/root/.ssh/rust-bot-deploy}
GITHUB_PUB_PATH="${GITHUB_KEY_PATH}.pub"

LOCAL_HELPER_SCRIPT="${SCRIPT_DIR}/rustbot-update-connector.sh"
REMOTE_HELPER_SCRIPT="/usr/local/bin/rustbot-update-connector"

trim() {
  local value="${1:-}"
  value="${value#"${value%%[![:space:]]*}"}"
  value="${value%"${value##*[![:space:]]}"}"
  printf '%s' "$value"
}

require_files() {
  # 本地前置检查：更新助手脚本 + GitHub deploy key 必须存在
  if [ ! -f "$LOCAL_HELPER_SCRIPT" ]; then
    echo "[rustbot-update-connectors] ERROR: missing helper script: $LOCAL_HELPER_SCRIPT"
    exit 1
  fi
  if [ ! -f "$GITHUB_KEY_PATH" ] || [ ! -f "$GITHUB_PUB_PATH" ]; then
    echo "[rustbot-update-connectors] ERROR: github deploy key not found: $GITHUB_KEY_PATH"
    exit 1
  fi
}

remote_prepare_cmd() {
  # 远程准备：写入 GitHub SSH 配置并设置权限
  cat <<'EOF'
mkdir -p ~/.ssh
chmod 700 ~/.ssh
touch ~/.ssh/config
chmod 600 ~/.ssh/config
if ! grep -q 'BEGIN rust-bot deploy key' ~/.ssh/config; then
cat >> ~/.ssh/config <<'INNER'
# BEGIN rust-bot deploy key
Host github.com
  HostName github.com
  User git
  IdentityFile ~/.ssh/rust-bot-deploy
  IdentitiesOnly yes
# END rust-bot deploy key
INNER
fi
ssh-keyscan -H github.com >> ~/.ssh/known_hosts 2>/dev/null || true
chmod 644 ~/.ssh/known_hosts
chmod 600 ~/.ssh/rust-bot-deploy ~/.ssh/rust-bot-deploy.pub
EOF
}

remote_finalize_helper_cmd() {
  # 修复潜在 CRLF/BOM 并赋予执行权限
  cat <<'EOF'
sed -i 's/\r$//' /usr/local/bin/rustbot-update-connector
if [ "$(xxd -l 3 -p /usr/local/bin/rustbot-update-connector 2>/dev/null)" = "efbbbf" ]; then
  tail -c +4 /usr/local/bin/rustbot-update-connector > /usr/local/bin/rustbot-update-connector.nobom
  mv /usr/local/bin/rustbot-update-connector.nobom /usr/local/bin/rustbot-update-connector
fi
chmod +x /usr/local/bin/rustbot-update-connector
EOF
}

update_node_by_key() {
  # 免密模式：直接使用 SSH key 登录目标机器
  local target="$1"
  local prepare_cmd
  local finalize_cmd

  prepare_cmd="$(remote_prepare_cmd)"
  finalize_cmd="$(remote_finalize_helper_cmd)"

  scp "${SSH_OPTS[@]}" "$GITHUB_KEY_PATH" "$target:~/.ssh/rust-bot-deploy" >/dev/null
  scp "${SSH_OPTS[@]}" "$GITHUB_PUB_PATH" "$target:~/.ssh/rust-bot-deploy.pub" >/dev/null
  scp "${SSH_OPTS[@]}" "$LOCAL_HELPER_SCRIPT" "$target:$REMOTE_HELPER_SCRIPT" >/dev/null

  ssh "${SSH_OPTS[@]}" "$target" "$prepare_cmd"
  ssh "${SSH_OPTS[@]}" "$target" "$finalize_cmd"
  ssh "${SSH_OPTS[@]}" "$target" "$REMOTE_HELPER_SCRIPT '$BRANCH'"
}

update_node_by_password() {
  # 密码模式：使用 sshpass 执行 scp/ssh
  local host="$1"
  local user="$2"
  local pass="$3"
  local target="${user}@${host}"
  local prepare_cmd
  local finalize_cmd

  prepare_cmd="$(remote_prepare_cmd)"
  finalize_cmd="$(remote_finalize_helper_cmd)"

  SSHPASS="$pass" sshpass -e scp "${SSH_OPTS[@]}" "$GITHUB_KEY_PATH" "$target:~/.ssh/rust-bot-deploy" >/dev/null
  SSHPASS="$pass" sshpass -e scp "${SSH_OPTS[@]}" "$GITHUB_PUB_PATH" "$target:~/.ssh/rust-bot-deploy.pub" >/dev/null
  SSHPASS="$pass" sshpass -e scp "${SSH_OPTS[@]}" "$LOCAL_HELPER_SCRIPT" "$target:$REMOTE_HELPER_SCRIPT" >/dev/null

  SSHPASS="$pass" sshpass -e ssh "${SSH_OPTS[@]}" "$target" "$prepare_cmd"
  SSHPASS="$pass" sshpass -e ssh "${SSH_OPTS[@]}" "$target" "$finalize_cmd"
  SSHPASS="$pass" sshpass -e ssh "${SSH_OPTS[@]}" "$target" "$REMOTE_HELPER_SCRIPT '$BRANCH'"
}

require_files

processed=0
failed=0

if [ -f "$NODE_FILE" ]; then
  # 第一阶段：处理免密节点清单
  mapfile -t key_nodes < <(grep -Ev '^[[:space:]]*(#|$)' "$NODE_FILE")
  for node in "${key_nodes[@]}"; do
    node="$(trim "$node")"
    if [ -z "$node" ]; then
      continue
    fi
    echo "[rustbot-update-connectors] syncing(key) $node"
    processed=$((processed + 1))
    if ! update_node_by_key "$node"; then
      echo "[rustbot-update-connectors] ERROR: update failed on $node"
      failed=1
      continue
    fi
    echo "[rustbot-update-connectors] done: $node"
  done
fi

if [ -f "$NODE_AUTH_FILE" ]; then
  # 第二阶段：处理账号密码节点清单
  if ! command -v sshpass >/dev/null 2>&1; then
    echo "[rustbot-update-connectors] ERROR: sshpass not installed"
    exit 1
  fi

  while IFS='|' read -r host user pass; do
    host="$(trim "${host:-}")"
    user="$(trim "${user:-}")"
    pass="$(trim "${pass:-}")"
    if [ -z "$host" ] || [ -z "$user" ] || [ -z "$pass" ]; then
      continue
    fi
    echo "[rustbot-update-connectors] syncing(pass) ${user}@${host}"
    processed=$((processed + 1))
    if ! update_node_by_password "$host" "$user" "$pass"; then
      echo "[rustbot-update-connectors] ERROR: update failed on ${user}@${host}"
      failed=1
      continue
    fi
    echo "[rustbot-update-connectors] done: ${user}@${host}"
  done < <(grep -Ev '^[[:space:]]*(#|$)' "$NODE_AUTH_FILE")
fi

if [ "$processed" -eq 0 ]; then
  echo "[rustbot-update-connectors] skip: no connector nodes configured"
  exit 0
fi

if [ "$failed" -ne 0 ]; then
  exit 1
fi

echo "[rustbot-update-connectors] all connector nodes updated"
