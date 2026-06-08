#!/usr/bin/env bash
set -Eeuo pipefail
trap 'echo -e "\033[1;31m[setup-proxy] 第 $LINENO 行出错\033[0m" >&2' ERR

# ============================================================
# 在【子节点(connector)】上安装/更新 Mihomo 代理引擎,并由项目内生成器产出配置,
# PM2 托管为 rust-proxy。仅在子节点出口 IP 被目标服封锁、需要"换出口"时启用。
#
# 订阅来源(generate-config.mjs 决定):
#   - 子节点 .env 的 PROXY_SUBSCRIPTIONS(逗号分隔 URL)  或
#   - proxy/subscriptions.json
#
# 用法:  bash deploy/setup-proxy.sh        (由 deploy-connector.sh 可选调用,也可单独跑)
# ============================================================

APP_DIR=${APP_DIR:-/www/wwwroot/rust-bot}
PROXY_DIR="$APP_DIR/proxy"
RUNTIME="$PROXY_DIR/runtime"
MIHOMO_VERSION=${MIHOMO_VERSION:-v1.19.27}
SOCKS_PORT=${PROXY_SOCKS_PORT:-7899}
CONTROLLER=${PROXY_CONTROLLER:-127.0.0.1:9899}
PM2_NAME=${PROXY_PM2_NAME:-rust-proxy}

log(){ echo -e "\033[1;32m[setup-proxy]\033[0m $*"; }
die(){ echo -e "\033[1;31m[setup-proxy] 错误:\033[0m $*" >&2; exit 1; }

# 读取子节点 .env(为了拿到 PROXY_SUBSCRIPTIONS 等)
[ -f "$APP_DIR/.env" ] && set -a && . "$APP_DIR/.env" && set +a || true

mkdir -p "$RUNTIME"
BIN="$PROXY_DIR/mihomo"

# 1) 下载 Mihomo 二进制(固定版本,放项目目录内)
if [ ! -x "$BIN" ] || ! "$BIN" -v 2>/dev/null | grep -q "$MIHOMO_VERSION"; then
  log "下载 Mihomo $MIHOMO_VERSION"
  URL="https://github.com/MetaCubeX/mihomo/releases/download/${MIHOMO_VERSION}/mihomo-linux-amd64-compatible-${MIHOMO_VERSION}.gz"
  curl -fsSL --max-time 120 -o "$BIN.gz" "$URL" \
    || curl -fsSL --max-time 120 -o "$BIN.gz" "https://mirror.ghproxy.com/${URL}" \
    || die "下载 Mihomo 失败"
  gunzip -f "$BIN.gz" && chmod +x "$BIN"
fi
"$BIN" -v | head -1

# 2) 用项目内生成器产出配置(订阅 → proxy-providers + url-test 自动选优/故障切换)
log "生成 Mihomo 配置"
( cd "$APP_DIR" && PROXY_SOCKS_PORT="$SOCKS_PORT" PROXY_CONTROLLER="$CONTROLLER" node proxy/generate-config.mjs "$RUNTIME/config.yaml" ) \
  || die "生成配置失败(检查 PROXY_SUBSCRIPTIONS 或 proxy/subscriptions.json)"

# 3) PM2 托管
if pm2 describe "$PM2_NAME" >/dev/null 2>&1; then
  pm2 restart "$PM2_NAME" --update-env
else
  pm2 start "$BIN" --name "$PM2_NAME" --interpreter none -- -d "$RUNTIME" -f "$RUNTIME/config.yaml"
fi
pm2 save >/dev/null 2>&1 || true

# 4) 健康检查:控制 API + SOCKS
sleep 4
curl -fsS --max-time 5 "http://${CONTROLLER}/version" >/dev/null 2>&1 \
  || die "Mihomo 启动异常,查看: pm2 logs $PM2_NAME"
log "Mihomo 就绪 ✅  SOCKS=socks5://127.0.0.1:${SOCKS_PORT}  控制API=http://${CONTROLLER}  PM2=$PM2_NAME"

cat <<EOF
------------------------------------------------------------
 下一步:在子节点 .env 设置并重启连接器(若 deploy-connector 未自动写入)
   PROXY_ENABLED=1
   PROXY_SOCKS=socks5://127.0.0.1:${SOCKS_PORT}
 然后:  pm2 restart rust-connector-1 --update-env
------------------------------------------------------------
EOF
