#!/usr/bin/env bash
set -Eeuo pipefail
trap 'echo -e "\033[1;31m[deploy-main] 第 $LINENO 行出错，已中断\033[0m" >&2' ERR

# ============================================================
# 主节点(rust-main) 全新服务器一键部署
#   全新机器一条命令（私有仓库用内置令牌）:
#     curl -fsSL -H "Authorization: token <PAT>" \
#       https://raw.githubusercontent.com/Ayuan97/rust-bot/main/deploy/deploy-main.sh \
#       | DOMAIN=rustplusplus.com bash
#   或本地已有脚本: DOMAIN=rustplusplus.com bash deploy-main.sh
#
# 自动完成：装 MariaDB/Node/PM2/Nginx → 建库建用户 → 拉代码 → 写.env(随机密钥)
#           → 建表 → 装依赖 → 构建前端 → 配 Nginx+SSL → pm2 起 rust-main → 健康检查
#
# 子命令：
#   bash deploy-main.sh provision <id>  生成子节点一键命令
#   bash deploy-main.sh token <id>      仅签发子节点令牌
#   bash deploy-main.sh allow <ip>      放行内部接口来源 IP
# ============================================================

APP_DIR=${APP_DIR:-/www/wwwroot/rust-bot}
REPO_URL=${REPO_URL:-https://github.com/Ayuan97/rust-bot.git}
REPO_RAW=${REPO_RAW:-https://raw.githubusercontent.com/Ayuan97/rust-bot/main}
REPO_TOKEN=${REPO_TOKEN:-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}
BRANCH=${BRANCH:-main}
NODE_MAJOR=20

DOMAIN=${DOMAIN:-rustplusplus.com}
PORT=${PORT:-3000}
DB_HOST=${DB_HOST:-127.0.0.1}
DB_PORT=${DB_PORT:-3306}
DB_USER=${DB_USER:-rustapp}
DB_NAME=${DB_NAME:-rustplus_db}
WEB_DIR=${WEB_DIR:-/var/www/rustbot}

log()  { echo -e "\033[1;32m[deploy-main]\033[0m $*"; }
warn() { echo -e "\033[1;33m[deploy-main]\033[0m $*"; }
die()  { echo -e "\033[1;31m[deploy-main] 错误:\033[0m $*" >&2; exit 1; }

need_root() { [ "$(id -u)" = "0" ] || die "请用 root 运行"; }

pkg_install() {
  if   command -v apt-get >/dev/null; then DEBIAN_FRONTEND=noninteractive apt-get install -y "$@";
  elif command -v dnf     >/dev/null; then dnf install -y "$@";
  elif command -v yum     >/dev/null; then yum install -y "$@";
  else die "未识别包管理器，请手动安装: $*"; fi
}
pkg_refresh() {
  if command -v apt-get >/dev/null; then apt-get update -y || true; fi
}

ensure_deps() {
  log "安装系统依赖（首次会比较久）"
  pkg_refresh
  command -v git     >/dev/null || pkg_install git
  command -v curl    >/dev/null || pkg_install curl
  command -v rsync   >/dev/null || pkg_install rsync
  command -v openssl >/dev/null || pkg_install openssl
  # 原生 npm 模块(bcrypt 等)可能需要编译工具
  if command -v apt-get >/dev/null; then pkg_install build-essential python3 || true; else pkg_install gcc gcc-c++ make python3 || true; fi

  if ! command -v node >/dev/null || [ "$(node -p 'process.versions.node.split(".")[0]' 2>/dev/null || echo 0)" -lt 18 ]; then
    log "安装 Node.js ${NODE_MAJOR}.x"
    if command -v apt-get >/dev/null; then
      curl -fsSL "https://deb.nodesource.com/setup_${NODE_MAJOR}.x" | bash - && pkg_install nodejs
    else
      curl -fsSL "https://rpm.nodesource.com/setup_${NODE_MAJOR}.x" | bash - && pkg_install nodejs
    fi
  fi
  command -v pm2 >/dev/null || npm install -g pm2

  # 数据库（MariaDB，兼容 MySQL 协议）
  if ! command -v mariadbd >/dev/null && ! command -v mysqld >/dev/null && ! command -v mysql >/dev/null; then
    log "安装 MariaDB 服务端"
    pkg_install mariadb-server
  fi
  systemctl enable --now mariadb >/dev/null 2>&1 || systemctl enable --now mysql >/dev/null 2>&1 \
    || service mariadb start >/dev/null 2>&1 || service mysql start >/dev/null 2>&1 || true

  # 反代 + 证书（仅当配置了 DOMAIN 才真正用到）
  if [ -n "$DOMAIN" ]; then
    command -v nginx   >/dev/null || pkg_install nginx
    command -v certbot >/dev/null || pkg_install certbot python3-certbot-nginx || warn "certbot 安装失败，稍后可手动配 SSL"
  fi
}

# 以本机 root 身份连 MariaDB（全新安装默认 unix_socket 认证）
mysql_root() {
  if mysql -uroot -e "SELECT 1" >/dev/null 2>&1; then mysql -uroot "$@";
  else mysql "$@"; fi
}

setup_mysql() {
  log "配置数据库（建库 + 建用户）"
  # 重复部署时复用已有密码，避免每次改密导致 .env 不一致
  if [ -f "$APP_DIR/.env" ]; then
    DB_PASSWORD=$(grep -E '^DB_PASSWORD=' "$APP_DIR/.env" | head -1 | cut -d= -f2- || true)
  fi
  [ -n "${DB_PASSWORD:-}" ] || DB_PASSWORD=$(openssl rand -hex 16)

  mysql_root <<SQL || die "数据库初始化失败（检查 MariaDB 是否启动）"
CREATE DATABASE IF NOT EXISTS \`$DB_NAME\` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
CREATE USER IF NOT EXISTS '$DB_USER'@'localhost' IDENTIFIED BY '$DB_PASSWORD';
ALTER USER '$DB_USER'@'localhost' IDENTIFIED BY '$DB_PASSWORD';
GRANT ALL PRIVILEGES ON \`$DB_NAME\`.* TO '$DB_USER'@'localhost';
FLUSH PRIVILEGES;
SQL
  log "数据库就绪: $DB_NAME / 用户 $DB_USER@localhost"
}

ensure_repo() {
  local url="$REPO_URL"
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

setup_nginx() {
  [ -n "$DOMAIN" ] || { warn "未提供 DOMAIN，跳过 Nginx/SSL（前端已构建到 $WEB_DIR，可稍后自行配反代）"; return 0; }
  command -v nginx >/dev/null || { warn "nginx 未安装，跳过"; return 0; }
  log "配置 Nginx: $DOMAIN -> 前端($WEB_DIR) + /api 反代 127.0.0.1:$PORT"

  local block
  block=$(cat <<NGINX
server {
    listen 80;
    server_name $DOMAIN;

    root $WEB_DIR;
    index index.html;
    location / { try_files \$uri \$uri/ /index.html; }

    location /api/ {
        proxy_pass http://127.0.0.1:$PORT;
        proxy_http_version 1.1;
        proxy_set_header Host \$host;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto \$scheme;
        proxy_set_header Upgrade \$http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_read_timeout 86400;
    }
    location /socket.io/ {
        proxy_pass http://127.0.0.1:$PORT;
        proxy_http_version 1.1;
        proxy_set_header Host \$host;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header Upgrade \$http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_read_timeout 86400;
    }
}
NGINX
)
  if [ -d /etc/nginx/sites-enabled ]; then
    echo "$block" > /etc/nginx/sites-available/rustbot
    ln -sf /etc/nginx/sites-available/rustbot /etc/nginx/sites-enabled/rustbot
    rm -f /etc/nginx/sites-enabled/default
  else
    mkdir -p /etc/nginx/conf.d
    echo "$block" > /etc/nginx/conf.d/rustbot.conf
  fi
  nginx -t && { systemctl reload nginx 2>/dev/null || systemctl restart nginx 2>/dev/null || service nginx restart; }

  # 自动签发 SSL（域名需已解析到本机且 80 端口可达）
  if command -v certbot >/dev/null; then
    certbot --nginx -d "$DOMAIN" --non-interactive --agree-tos -m "admin@$DOMAIN" --redirect \
      || warn "certbot 失败（多半是域名解析未生效或 80 端口被挡）；HTTP 已可用，稍后重跑: certbot --nginx -d $DOMAIN"
  fi
}

open_firewall() {
  if command -v ufw >/dev/null && ufw status 2>/dev/null | grep -qi active; then
    ufw allow 80,443/tcp >/dev/null 2>&1 || true
    ufw allow ${PORT}/tcp >/dev/null 2>&1 || true
    log "ufw 已放行 80/443/$PORT"
  fi
  warn "若用云服务器，记得在云控制台安全组放行 80/443，以及给子节点放行 $PORT"
}

cmd_install() {
  need_root
  [ -n "$DOMAIN" ] || warn "未设置 DOMAIN：将只起后端+子节点功能，前端面板需要域名才能用 (DOMAIN=xxx 重跑可补)"
  ensure_deps
  setup_mysql
  ensure_repo

  local JWT_SECRET NODE_TOKEN_SECRET env="$APP_DIR/.env"
  JWT_SECRET=$(openssl rand -hex 32)
  NODE_TOKEN_SECRET=$(openssl rand -hex 32)
  # 复用已有密钥（重复部署不让 token/JWT 失效）
  if [ -f "$env" ]; then
    local ov
    ov=$(grep -E '^JWT_SECRET=' "$env" | cut -d= -f2- || true); [ -n "$ov" ] && JWT_SECRET=$ov
    ov=$(grep -E '^NODE_TOKEN_SECRET=' "$env" | cut -d= -f2- || true); [ -n "$ov" ] && NODE_TOKEN_SECRET=$ov
    cp "$env" "$env.bak.$(date +%s)"
  fi
  cat > "$env" <<EOF
NODE_ENV=production
PORT=$PORT
FRONTEND_URL=${DOMAIN:+https://$DOMAIN}
TRUST_PROXY=true

DB_HOST=$DB_HOST
DB_PORT=$DB_PORT
DB_USER=$DB_USER
DB_PASSWORD=$DB_PASSWORD
DB_NAME=$DB_NAME
DB_POOL_LIMIT=30

JWT_SECRET=$JWT_SECRET
NODE_TOKEN_SECRET=$NODE_TOKEN_SECRET
INTERNAL_ALLOWED_IPS=*

RUST_CONN_MODE=distributed

REPO_TOKEN=$REPO_TOKEN
EOF
  log ".env 已写入"

  log "导入数据库结构"
  mysql -u"$DB_USER" -p"$DB_PASSWORD" "$DB_NAME" < "$APP_DIR/backend/sql/init.sql"

  log "安装后端依赖"
  ( cd "$APP_DIR/backend" && npm install )

  if [ -d "$APP_DIR/frontend" ]; then
    log "构建前端 -> $WEB_DIR"
    ( cd "$APP_DIR/frontend" && npm install && npm run build )
    mkdir -p "$WEB_DIR" && rsync -a --delete "$APP_DIR/frontend/dist/" "$WEB_DIR/"
  fi

  setup_nginx
  open_firewall

  if pm2 describe rust-main >/dev/null 2>&1; then
    pm2 restart rust-main --update-env
  else
    pm2 start "$APP_DIR/backend/src/app.js" --name rust-main --cwd "$APP_DIR" --update-env
  fi
  pm2 save >/dev/null
  pm2 startup systemd -u root --hp /root >/dev/null 2>&1 || true

  local i ok=0
  for i in $(seq 1 20); do
    if curl -fsS "http://127.0.0.1:$PORT/api/health" >/dev/null 2>&1; then ok=1; break; fi
    sleep 2
  done
  [ "$ok" = 1 ] && log "后端健康检查 OK" || warn "后端健康检查未通过，查 'pm2 logs rust-main'"

  cat <<EOF

============================================================
 主节点部署完成 ✅
   后端:  http://127.0.0.1:$PORT/api/health
   面板:  ${DOMAIN:+https://$DOMAIN}${DOMAIN:-（未配域名，前端暂不可访问）}
------------------------------------------------------------
 加子节点（两步）：
   1) 本机:  bash $APP_DIR/deploy/deploy-main.sh provision node-1
   2) 复制输出命令，到子节点机器粘贴执行（零交互）
============================================================
EOF
}

cmd_provision() {
  local nid=${1:-} master
  [ -n "$nid" ] || die "用法: $0 provision <nodeId>（如 node-1）"
  [[ "$nid" =~ ^[A-Za-z0-9._-]{1,64}$ ]] || die "nodeId 只能含字母/数字/点/下划线/连字符，长度1-64"
  [ -f "$APP_DIR/.env" ] || die "未找到 $APP_DIR/.env，请先部署主节点"
  local token; token=$( cd "$APP_DIR" && node backend/scripts/issue-node-token.js "$nid" )
  [ -n "$token" ] || die "签发失败"
  master=${MASTER_HOST:-}
  [ -n "$master" ] || master=$(curl -fsS --max-time 5 https://api.ipify.org 2>/dev/null || echo "")
  [ -n "$master" ] || master="<主节点IP>"
  cat <<EOF

============================================================
 子节点 [$nid] 一键部署命令（到子节点机器粘贴执行，零交互）
------------------------------------------------------------
 curl -fsSL -H "Authorization: token $REPO_TOKEN" $REPO_RAW/deploy/deploy-connector.sh | NODE_TOKEN='$token' MASTER_HOST='$master' bash
============================================================
EOF
}

cmd_token() {
  local nid=${1:-}
  [ -n "$nid" ] || die "用法: $0 token <nodeId>"
  [[ "$nid" =~ ^[A-Za-z0-9._-]{1,64}$ ]] || die "nodeId 格式非法"
  [ -f "$APP_DIR/.env" ] || die "未找到 .env，请先部署主节点"
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
  else echo "INTERNAL_ALLOWED_IPS=$new" >> "$env"; fi
  log "白名单更新为: $new"
  pm2 restart rust-main --update-env >/dev/null 2>&1 || true
}

case "${1:-install}" in
  install)   cmd_install ;;
  provision) cmd_provision "${2:-}" ;;
  token)     cmd_token "${2:-}" ;;
  allow)     cmd_allow "${2:-}" ;;
  *) die "用法: $0 [install | provision <nodeId> | token <nodeId> | allow <ip>]" ;;
esac
