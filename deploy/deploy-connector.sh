#!/usr/bin/env bash
set -Eeuo pipefail
trap 'echo -e "\033[1;31m[deploy-connector] 第 $LINENO 行出错，已中断\033[0m" >&2' ERR

# ============================================================
# 子节点(rust-connector-*)一键部署脚本
#   把本文件传到子节点机器后执行： bash deploy-connector.sh
#
# 子节点不连数据库，只通过 HTTP 与主节点通信，因此只需要：
#   主节点地址 + NODE_TOKEN（在主节点用 deploy-main.sh token <id> 签发）+ 节点画像
#
# 关键变量可用环境变量覆盖（非交互自动化）：
#   APP_DIR REPO_URL BRANCH MASTER_HOST MASTER_PORT NODE_TOKEN
#   NODE_NAME NODE_PUBLIC_IP NODE_REGION NODE_CAPACITY NODE_MAX_PER_SERVER
# ============================================================

APP_DIR=${APP_DIR:-/www/wwwroot/rust-bot}
REPO_URL=${REPO_URL:-https://github.com/Ayuan97/rust-bot.git}
REPO_TOKEN=${REPO_TOKEN:-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}
BRANCH=${BRANCH:-main}
NODE_MAJOR=20

log()  { echo -e "\033[1;32m[deploy-connector]\033[0m $*"; }
warn() { echo -e "\033[1;33m[deploy-connector]\033[0m $*"; }
die()  { echo -e "\033[1;31m[deploy-connector] 错误:\033[0m $*" >&2; exit 1; }

ask() {
  local __var=$1 __prompt=$2 __def=${3:-} __silent=${4:-} __input
  [ -n "${!__var:-}" ] && return 0
  if [ ! -t 0 ]; then printf -v "$__var" '%s' "$__def"; return 0; fi
  if [ "$__silent" = "silent" ]; then
    read -r -s -p "$__prompt${__def:+ [默认: $__def]}: " __input; echo
  else
    read -r -p "$__prompt${__def:+ [默认: $__def]}: " __input
  fi
  printf -v "$__var" '%s' "${__input:-$__def}"
}

need_root() { [ "$(id -u)" = "0" ] || die "请用 root 运行（安装依赖 / pm2 需要）"; }

pkg_install() {
  if   command -v apt-get >/dev/null; then apt-get update -y && apt-get install -y "$@";
  elif command -v dnf     >/dev/null; then dnf install -y "$@";
  elif command -v yum     >/dev/null; then yum install -y "$@";
  else die "未识别包管理器，请手动安装: $*"; fi
}

ensure_deps() {
  command -v git  >/dev/null || pkg_install git
  command -v curl >/dev/null || pkg_install curl
  if ! command -v node >/dev/null || [ "$(node -p 'process.versions.node.split(".")[0]' 2>/dev/null || echo 0)" -lt 18 ]; then
    log "安装 Node.js ${NODE_MAJOR}.x"
    if command -v apt-get >/dev/null; then
      curl -fsSL "https://deb.nodesource.com/setup_${NODE_MAJOR}.x" | bash - && apt-get install -y nodejs
    else
      curl -fsSL "https://rpm.nodesource.com/setup_${NODE_MAJOR}.x" | bash - && pkg_install nodejs
    fi
  fi
  command -v pm2 >/dev/null || npm install -g pm2
}

ensure_repo() {
  local url="$REPO_URL"
  # 私有仓库：用只读 PAT 注入 https URL（token 来自环境变量，绝不写进脚本本身）
  [ -n "${REPO_TOKEN:-}" ] && url="https://oauth2:${REPO_TOKEN}@${REPO_URL#https://}"
  if [ -d "$APP_DIR/.git" ]; then
    log "更新已有代码: $APP_DIR ($BRANCH)"
    git -C "$APP_DIR" remote set-url origin "$url"
    git -C "$APP_DIR" fetch origin "$BRANCH"
    git -C "$APP_DIR" checkout -f "$BRANCH" 2>/dev/null || git -C "$APP_DIR" checkout -f -B "$BRANCH" "origin/$BRANCH"
    git -C "$APP_DIR" reset --hard "origin/$BRANCH"
  else
    log "克隆代码到 $APP_DIR"
    mkdir -p "$(dirname "$APP_DIR")"
    git clone -b "$BRANCH" "$url" "$APP_DIR"
  fi
}

need_root
ensure_deps
ensure_repo

log "收集子节点配置（回车用默认值；用环境变量传 NODE_TOKEN 即可完全零交互）"
ask MASTER_HOST "主节点地址(域名或IP)" "api.rustplusplus.com"
ask MASTER_PORT "主节点端口(仅IP直连时用)" "3000"
# 域名走 HTTPS(经反代,不带端口)，纯 IP 走 http:端口；CONTROL_API_URL 已给则直接用
if [ -n "${CONTROL_API_URL:-}" ]; then
  HEALTH_URL=${HEALTH_URL:-${CONTROL_API_URL%/api/internal}/api/health}
elif printf '%s' "$MASTER_HOST" | grep -qE '^[0-9.]+$'; then
  CONTROL_API_URL="http://$MASTER_HOST:$MASTER_PORT/api/internal"
  HEALTH_URL="http://$MASTER_HOST:$MASTER_PORT/api/health"
else
  CONTROL_API_URL="https://$MASTER_HOST/api/internal"
  HEALTH_URL="https://$MASTER_HOST/api/health"
fi

echo "  提示：在【主节点】执行  bash deploy/deploy-main.sh token <nodeId>  获取下面的 NODE_TOKEN"
ask NODE_TOKEN "节点令牌 NODE_TOKEN" "" silent
[ -n "$NODE_TOKEN" ] || die "必须提供 NODE_TOKEN"

ask NODE_NAME "PM2 进程名(必须 rust-connector-* )" "rust-connector-1"
case "$NODE_NAME" in rust-connector-*) ;; *) die "进程名必须以 rust-connector- 开头（否则运维脚本扫不到）";; esac

DETECTED_IP=$(curl -fsS --max-time 5 https://api.ipify.org 2>/dev/null || curl -fsS --max-time 5 https://ifconfig.me 2>/dev/null || echo "")
ask NODE_PUBLIC_IP "本机公网 IP" "${DETECTED_IP:-127.0.0.1}"
ask NODE_REGION "区域标签" "default"
ask NODE_CAPACITY "节点容量(并发会话上限)" "120"
ask NODE_MAX_PER_SERVER "单服上限(应<=Rust的 app.maxconnectionsperip)" "4"

# 起进程前先确认能连到主节点（/api/health 不受内部白名单限制）
log "预检主节点连通性: $HEALTH_URL"
curl -fsS --max-time 8 "$HEALTH_URL" >/dev/null 2>&1 \
  || die "连不上主节点 $HEALTH_URL（检查域名解析/网络/防火墙/主节点是否运行）"
log "主节点连通 OK"

env="$APP_DIR/.env"
[ -f "$env" ] && { cp "$env" "$env.bak.$(date +%s)"; warn "已备份旧 .env"; }
cat > "$env" <<EOF
NODE_ENV=production
CONTROL_API_URL=$CONTROL_API_URL
NODE_TOKEN=$NODE_TOKEN

NODE_PUBLIC_IP=$NODE_PUBLIC_IP
NODE_REGION=$NODE_REGION
NODE_CAPACITY=$NODE_CAPACITY
NODE_MAX_PER_SERVER=$NODE_MAX_PER_SERVER
EOF
log ".env 已写入（子节点不含任何数据库凭据）"

log "安装后端依赖"
( cd "$APP_DIR/backend" && npm install )

if pm2 describe "$NODE_NAME" >/dev/null 2>&1; then
  pm2 restart "$NODE_NAME" --update-env
else
  pm2 start "$APP_DIR/backend/src/connector-node/app.js" --name "$NODE_NAME" --cwd "$APP_DIR" --update-env
fi
pm2 save >/dev/null
pm2 startup systemd -u root --hp /root >/dev/null 2>&1 || warn "如需开机自启，请按 'pm2 startup' 提示手动确认"

# 自检：看启动日志有无致命错误
sleep 5
if pm2 logs "$NODE_NAME" --lines 40 --nostream 2>/dev/null \
     | grep -qiE 'bootstrap failed|invalid node token|NODE_TOKEN 未配置|403|ECONNREFUSED'; then
  warn "启动日志疑似有错误，请检查： pm2 logs $NODE_NAME"
  warn "若为 403 / invalid token：多半是跨机来源 IP 未放行（见下方提示）"
else
  log "子节点启动正常 ✅ ($NODE_NAME)"
fi

cat <<EOF

============================================================
 子节点部署完成 ✅   进程: $NODE_NAME  ->  $CONTROL_API_URL
 查看日志:  pm2 logs $NODE_NAME
============================================================
EOF
