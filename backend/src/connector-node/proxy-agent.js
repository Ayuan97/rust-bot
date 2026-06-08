/**
 * 连接器侧代理引擎助手：根据控制平面下发的订阅，重新生成 Mihomo 配置并让 Mihomo 热重载。
 *
 * Mihomo 二进制/进程由 deploy/setup-proxy.sh 一次性安装并 PM2 托管(rust-proxy);
 * 本模块只负责"订阅变化时更新配置 + 触发重载",不负责安装。
 */

import { execFile } from 'child_process';
import { promisify } from 'util';
import path from 'path';

const execFileP = promisify(execFile);

const CONTROLLER = process.env.PROXY_CONTROLLER || '127.0.0.1:9899';
const CONFIG_PATH = process.env.PROXY_CONFIG_PATH || path.resolve(process.cwd(), 'proxy', 'runtime', 'config.yaml');
const GENERATOR = path.resolve(process.cwd(), 'proxy', 'generate-config.mjs');
const SETUP_SCRIPT = path.resolve(process.cwd(), 'deploy', 'setup-proxy.sh');
const SOCKS_PORT = String(process.env.PROXY_SOCKS_PORT || 7899);

async function mihomoUp() {
  try {
    const r = await fetch(`http://${CONTROLLER}/version`, { signal: AbortSignal.timeout(3000) });
    return r.ok;
  } catch {
    return false;
  }
}

/** 订阅指纹：用于判断是否有变化,避免无谓重载 */
export function subsKey(subs = []) {
  return subs.map((s) => `${s.name || ''}|${s.url}`).join(';');
}

/**
 * 用项目内生成器产出 Mihomo 配置并热重载。失败抛错,由调用方记录(不影响连接器主流程)。
 * @param {{name?:string,url:string}[]} subs
 */
export async function regenerateAndReload(subs = []) {
  const urls = subs.map((s) => s.url).filter(Boolean).join(',');
  if (!urls) throw new Error('no subscriptions');

  // 复用项目内生成器(订阅 → proxy-providers + url-test + 订阅网关 DIRECT 规则)
  await execFileP(process.execPath, [GENERATOR, CONFIG_PATH], {
    cwd: process.cwd(),
    env: {
      ...process.env,
      PROXY_SUBSCRIPTIONS: urls,
      PROXY_SOCKS_PORT: SOCKS_PORT,
      PROXY_CONTROLLER: CONTROLLER,
    },
    timeout: 20000,
  });

  // 让 Mihomo 从新配置热重载(会重新拉取 providers)
  const res = await fetch(`http://${CONTROLLER}/configs?force=true`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ path: CONFIG_PATH }),
    signal: AbortSignal.timeout(8000),
  });
  if (!res.ok) {
    throw new Error(`mihomo reload HTTP ${res.status}`);
  }
}

/**
 * 应用订阅，让"后台加订阅即生效"无需任何 SSH：
 *   Mihomo 已在跑 → 重生成配置 + 热重载;未跑 → 一次性安装并启动(setup-proxy.sh)。
 * 失败抛错,由调用方记录(不影响连接器主流程)。
 * @param {{name?:string,url:string}[]} subs
 */
export async function applyProxy(subs = []) {
  const urls = subs.map((s) => s.url).filter(Boolean).join(',');
  if (!urls) throw new Error('no subscriptions');

  if (await mihomoUp()) {
    await regenerateAndReload(subs);
    return;
  }

  // 首次：装 Mihomo 二进制 + 生成配置 + PM2 启动(下载可能较慢,给足超时)
  await execFileP('bash', [SETUP_SCRIPT], {
    cwd: process.cwd(),
    env: {
      ...process.env,
      APP_DIR: process.cwd(),
      PROXY_SUBSCRIPTIONS: urls,
      PROXY_SOCKS_PORT: SOCKS_PORT,
      PROXY_CONTROLLER: CONTROLLER,
    },
    timeout: 200000,
  });
}
