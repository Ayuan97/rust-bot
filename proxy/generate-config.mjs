#!/usr/bin/env node
/**
 * 生成 Mihomo(Clash.Meta)运行配置。
 *
 * 设计：把每个机场「订阅」作为 proxy-provider 拉取，合并进一个 url-test 组(AUTO)。
 * AUTO 自动挑健康+最快的节点，失败自动切换;Mihomo 本地只开 127.0.0.1 的 SOCKS,
 * 仅供 rust-bot 连接器在「直连失败回退」时使用。rust-bot 只把被封的服务器连接发到这个 SOCKS。
 *
 * 订阅来源(优先级)：
 *   1) 环境变量 PROXY_SUBSCRIPTIONS：逗号分隔的订阅 URL
 *   2) 同目录 subscriptions.json：[{ "name": "...", "url": "..." }, ...]
 *
 * 用法：node proxy/generate-config.mjs [输出路径]
 * 默认输出：proxy/runtime/config.yaml(JSON 即合法 YAML,Mihomo 可直接加载)
 */

import { writeFileSync, readFileSync, existsSync, mkdirSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));

const SOCKS_PORT = Number(process.env.PROXY_SOCKS_PORT || 7899);
const CONTROLLER = process.env.PROXY_CONTROLLER || '127.0.0.1:9899';
// 部分机场网关只认特定 User-Agent,固定一个被接受的值,确保拉取成功
const UA = process.env.PROXY_SUB_UA || 'clash-verge/v1.7.1';
const OUT = process.argv[2] || join(__dirname, 'runtime', 'config.yaml');

function loadSubscriptions() {
  if (process.env.PROXY_SUBSCRIPTIONS) {
    return process.env.PROXY_SUBSCRIPTIONS.split(',')
      .map((u, i) => ({ name: `sub${i + 1}`, url: u.trim() }))
      .filter((s) => s.url);
  }
  const file = join(__dirname, 'subscriptions.json');
  if (existsSync(file)) {
    try {
      const arr = JSON.parse(readFileSync(file, 'utf8'));
      return (Array.isArray(arr) ? arr : []).filter((s) => s && s.url);
    } catch (e) {
      console.error('[proxy] subscriptions.json 解析失败:', e.message);
      return [];
    }
  }
  return [];
}

const subs = loadSubscriptions();
if (subs.length === 0) {
  console.error('[proxy] 未配置任何订阅(PROXY_SUBSCRIPTIONS 或 subscriptions.json),跳过生成');
  process.exit(2);
}

const healthCheck = {
  enable: true,
  url: 'http://www.gstatic.com/generate_204',
  interval: 300,
};

const providers = {};
subs.forEach((s, i) => {
  const name = (s.name || `sub${i + 1}`).replace(/[^a-zA-Z0-9_-]/g, '_');
  providers[name] = {
    type: 'http',
    url: s.url,
    interval: 3600,
    header: { 'User-Agent': [UA] },
    'health-check': healthCheck,
  };
});

// 订阅网关域名走直连：订阅更新不经代理(否则会走进代理栈，且节点 IP 易触发机场风控)
const subHosts = [...new Set(
  subs.map((s) => { try { return new URL(s.url).hostname; } catch { return null; } }).filter(Boolean)
)];

const config = {
  'mixed-port': SOCKS_PORT,
  'bind-address': '127.0.0.1',
  'allow-lan': false,
  ipv6: false,
  mode: 'rule',
  'log-level': 'warning',
  'external-controller': CONTROLLER,
  'proxy-providers': providers,
  'proxy-groups': [
    {
      name: 'AUTO',
      type: 'url-test',
      use: Object.keys(providers),
      url: healthCheck.url,
      interval: 300,
      tolerance: 50,
    },
  ],
  // 订阅网关直连;其余(rust-bot 发来的被封服务器连接)整体走 AUTO 选优节点
  rules: [
    ...subHosts.map((h) => `DOMAIN-SUFFIX,${h},DIRECT`),
    'MATCH,AUTO',
  ],
};

mkdirSync(dirname(OUT), { recursive: true });
// JSON 是合法的 YAML 子集,Mihomo 直接可加载,无需引入 YAML 序列化依赖
writeFileSync(OUT, JSON.stringify(config, null, 2));
console.log(`[proxy] 已生成 Mihomo 配置: ${OUT}(订阅 ${subs.length} 个,SOCKS 127.0.0.1:${SOCKS_PORT})`);
