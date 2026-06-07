#!/usr/bin/env bash
set -Eeuo pipefail
trap 'echo -e "\033[1;31m[deploy-main] 第 $LINENO 行出错，已中断\033[0m" >&2' ERR

# ============================================================
# 主节点(rust-main)一键部署脚本
#   bash deploy-main.sh [install]   首次/重复部署主节点
#   bash deploy-main.sh token <id>  为子节点签发 NODE_TOKEN
#   bash deploy-main.sh allow <ip>  把某来源 IP 加入内部接口白名单并重启
#
# 关键变量可用环境变量覆盖（非交互自动化）：
#   APP_DIR REPO_URL BRANCH WEB_DIR PORT DB_HOST DB_PORT DB_USER
#   DB_PASSWORD DB_NAME FRONTEND_URL SKIP_FRONTEND
# ============================================================

APP_DIR=${APP_DIR:-/www/wwwroot/rust-bot}
REPO_URL=${REPO_URL:-https://github.com/Ayuan97/rust-bot.git}
REPO_RAW=${REPO_RAW:-https://raw.githubusercontent.com/Ayuan97/rust-bot/main}
BRANCH=${BRANCH:-main}
WEB_DIR=${WEB_DIR:-/var/www/app.rustplusplus.com}
NODE_MAJOR=20
SKIP_FRONTEND=${SKIP_FRONTEND:-false}

log()  { echo -e "\033[1;32m[deploy-main]\033[0m $*"; }
warn() { echo -e "\033[1;33m[deploy-main]\033[0m $*"; }
die()  { echo -e "\033[1;31m[deploy-main] 错误:\033[0m $*" >&2; exit 1; }

# ask VAR "提示" "默认值" [silent]：env 已给则跳过；非交互用默认；否则提示输入
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
  command -v git    >/dev/null || pkg_install git
  command -v curl   >/dev/null || pkg_install curl
  command -v rsync  >/dev/null || pkg_install rsync
  command -v openssl>/dev/null || pkg_install openssl
  if ! command -v node >/dev/null || [ "$(node -p 'process.versions.node.split(".")[0]' 2>/dev/null || echo 0)" -lt 18 ]; then
    log "安装 Node.js ${NODE_MAJOR}.x"
    if command -v apt-get >/dev/null; then
      curl -fsSL "https://deb.nodesource.com/setup_${NODE_MAJOR}.x" | bash - && apt-get install -y nodejs
    else
      curl -fsSL "https://rpm.nodesource.com/setup_${NODE_MAJOR}.x" | bash - && pkg_install nodejs
    fi
  fi
  command -v pm2 >/dev/null || npm install -g pm2
  command -v mysql >/dev/null || warn "未找到 mysql 客户端；若 DB 不在本机请先安装，否则将跳过自动建库"
}

ensure_repo() {
  local url="$REPO_URL"
  # 私有仓库：用只读 PAT 注入 https URL（token 来自环境变量/主节点 .env，绝不写进脚本本身）
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

cmd_token() {
  local nid=${1:-}
  [ -n "$nid" ] || die "用法: $0 token <nodeId>（如 node-1）"
  [[ "$nid" =~ ^[A-Za-z0-9._-]{1,64}$ ]] || die "nodeId 只能含字母/数字/点/下划线/连字符，长度1-64"
  [ -f "$APP_DIR/.env" ] || die "未找到 $APP_DIR/.env，请先部署主节点"
  log "为 $nid 签发 NODE_TOKEN（粘贴到子节点）:"
  ( cd "$APP_DIR" && node backend/scripts/issue-node-token.js "$nid" )
}

cmd_allow() {
  local ip=${1:-} env="$APP_DIR/.env"
  [ -n "$ip" ] || die "用法: $0 allow <ip>"
  [ -f "$env" ] || die "未找到 $env"
  local cur; cur=$(grep -E '^INTERNAL_ALLOWED_IPS=' "$env" | head -1 | cut -d= -f2- || true)
  case ",${cur}," in *",$ip,"*) log "$ip 已在白名单"; return 0;; esac
  local new="${cur:+$cur,}$ip"
  if grep -qE '^INTERNAL_ALLOWED_IPS=' "$env"; then
    sed -i "s|^INTERNAL_ALLOWED_IPS=.*|INTERNAL_ALLOWED_IPS=$new|" "$env"
  else
    echo "INTERNAL_ALLOWED_IPS=$new" >> "$env"
  fi
  log "白名单更新为: $new；重启 rust-main 生效"
  pm2 restart rust-main --update-env >/dev/null 2>&1 || warn "rust-main 未运行，下次启动生效"
}

cmd_provision() {
  local nid=${1:-} token master
  [ -n "$nid" ] || die "用法: $0 provision <nodeId>（如 node-1）"
  [[ "$nid" =~ ^[A-Za-z0-9._-]{1,64}$ ]] || die "nodeId 只能含字母/数字/点/下划线/连字符，长度1-64"
  [ -f "$APP_DIR/.env" ] || die "未找到 $APP_DIR/.env，请先部署主节点"
  token=$( cd "$APP_DIR" && node backend/scripts/issue-node-token.js "$nid" )
  [ -n "$token" ] || die "签发失败"
  local repotoken master
  repotoken=$(grep -E '^REPO_TOKEN=' "$APP_DIR/.env" | head -1 | cut -d= -f2- || true)
  [ -n "$repotoken" ] || warn "主节点 .env 未配置 REPO_TOKEN：私有仓库下子节点将无法拉取代码"
  # 默认用主节点公网 IP 直连(不依赖 nginx/域名)；可用 MASTER_HOST 环境变量改成域名
  master=${MASTER_HOST:-}
  [ -n "$master" ] || master=$(curl -fsS --max-time 5 https://api.ipify.org 2>/dev/null || echo "")
  [ -n "$master" ] || master="<主节点IP>"
  cat <<EOF

============================================================
 子节点 [$nid] 一键部署命令（到子节点机器粘贴执行，零交互）
------------------------------------------------------------
 方式A（已把 deploy-connector.sh 传到子节点）:
   REPO_TOKEN='$repotoken' NODE_TOKEN='$token' MASTER_HOST='$master' bash deploy-connector.sh

 方式B（一条命令；私有仓库用令牌下载脚本+拉代码）:
   curl -fsSL -H "Authorization: token $repotoken" $REPO_RAW/deploy/deploy-connector.sh | REPO_TOKEN='$repotoken' NODE_TOKEN='$token' MASTER_HOST='$master' bash
============================================================
EOF
}

cmd_install() {
  need_root
  ensure_deps
  ensure_repo

  log "收集主节点配置（直接回车用默认值）"
  ask DB_HOST     "MySQL 主机"      "127.0.0.1"
  ask DB_PORT     "MySQL 端口"      "3306"
  ask DB_USER     "MySQL 用户"      "rustapp"
  ask DB_PASSWORD "MySQL 密码"      ""           silent
  ask DB_NAME     "数据库名"        "rustplus_db"
  ask PORT        "后端端口"        "3000"
  ask FRONTEND_URL "前端地址(CORS)" "http://localhost:5173"
  ask REPO_TOKEN  "GitHub 只读令牌(私有仓库 clone 用,子节点也会用到)" "" silent

  local JWT_SECRET NODE_TOKEN_SECRET
  JWT_SECRET=$(openssl rand -hex 32)
  NODE_TOKEN_SECRET=$(openssl rand -hex 32)

  local env="$APP_DIR/.env"
  [ -f "$env" ] && { cp "$env" "$env.bak.$(date +%s)"; warn "已备份旧 .env"; }
  cat > "$env" <<EOF
NODE_ENV=production
PORT=$PORT
FRONTEND_URL=$FRONTEND_URL
TRUST_PROXY=true

DB_HOST=$DB_HOST
DB_PORT=$DB_PORT
DB_USER=$DB_USER
DB_PASSWORD=$DB_PASSWORD
DB_NAME=$DB_NAME
DB_POOL_LIMIT=30

JWT_SECRET=$JWT_SECRET
NODE_TOKEN_SECRET=$NODE_TOKEN_SECRET
# 内部接口来源限制：* = 不限(仅靠节点令牌鉴权，最省事)；要更严可改为具体 IP 列表
INTERNAL_ALLOWED_IPS=*

RUST_CONN_MODE=distributed

# GitHub 只读令牌：私有仓库 clone/更新用，provision 会注入子节点命令（.env 不进 git）
REPO_TOKEN=$REPO_TOKEN
EOF
  log ".env 已写入（密钥自动生成；REPO_TOKEN 仅存于 .env，不进版本库）"

  if command -v mysql >/dev/null; then
    local m=(mysql -h"$DB_HOST" -P"$DB_PORT" -u"$DB_USER")
    [ -n "$DB_PASSWORD" ] && m+=(-p"$DB_PASSWORD")
    local ver; ver=$("${m[@]}" -N -e "SELECT VERSION();" 2>/dev/null | head -1 || true)
    [ -n "$ver" ] || die "无法连接 MySQL，请检查 DB 配置"
    log "MySQL 版本: $ver"
    case "$ver" in 5.[0-6].*|5.[0-6]) die "需要 MySQL >= 5.7（生成列+唯一约束），当前 $ver";; esac
    "${m[@]}" -e "CREATE DATABASE IF NOT EXISTS \`$DB_NAME\` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;"
    "${m[@]}" "$DB_NAME" < "$APP_DIR/backend/sql/init.sql"
    log "数据库初始化完成"
  else
    warn "跳过自动建库，请手动执行: mysql ... \"$DB_NAME\" < backend/sql/init.sql"
  fi

  log "安装后端依赖"
  ( cd "$APP_DIR/backend" && npm ci )
  if [ "$SKIP_FRONTEND" != "true" ] && [ -d "$APP_DIR/frontend" ]; then
    log "构建并部署前端到 $WEB_DIR"
    ( cd "$APP_DIR/frontend" && npm ci && npm run build )
    mkdir -p "$WEB_DIR" && rsync -a --delete "$APP_DIR/frontend/dist/" "$WEB_DIR/"
  fi

  if pm2 describe rust-main >/dev/null 2>&1; then
    pm2 restart rust-main --update-env
  else
    pm2 start "$APP_DIR/backend/src/app.js" --name rust-main --cwd "$APP_DIR" --update-env
  fi
  pm2 save >/dev/null
  pm2 startup systemd -u root --hp /root >/dev/null 2>&1 || warn "如需开机自启，请按 'pm2 startup' 提示手动确认"

  local i ok=0
  for i in $(seq 1 20); do
    if curl -fsS "http://127.0.0.1:$PORT/api/health" >/dev/null 2>&1; then ok=1; log "健康检查 OK"; break; fi
    sleep 2
  done
  [ "$ok" = 1 ] || die "健康检查失败，请查 'pm2 logs rust-main'"

  cat <<EOF

============================================================
 主节点部署完成 ✅   ( http://<本机IP>:$PORT/api/health )
------------------------------------------------------------
 加子节点（两步搞定，每台一个唯一 nodeId）：
   1) 本机：  bash $0 provision node-1
   2) 复制输出的命令，到子节点机器粘贴执行（零交互；不用配数据库/nginx/白名单）
============================================================
EOF
}

case "${1:-install}" in
  install)   cmd_install ;;
  provision) cmd_provision "${2:-}" ;;
  token)     cmd_token "${2:-}" ;;
  allow)     cmd_allow "${2:-}" ;;
  *) die "用法: $0 [install | provision <nodeId> | token <nodeId> | allow <ip>]" ;;
esac
