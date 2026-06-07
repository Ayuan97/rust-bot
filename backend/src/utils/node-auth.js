/**
 * 子节点（connector-node）内部认证
 *
 * 控制平面 /api/internal 不再使用“全节点共享的静态 token”，
 * 改为给每个子节点签发绑定 nodeId 的 JWT：
 *   - 主节点用 NODE_TOKEN_SECRET 签发与验签；
 *   - 子节点只持有签好的 NODE_TOKEN，无 secret 无法伪造其它 nodeId；
 *   - 所有内部接口以“验签得到的 nodeId”为准，忽略请求体里自报的 nodeId。
 *
 * 这样既消除了“持有共享 token 即可冒充任意节点拉取他人 playerToken / 劫持会话”
 * 的越权面，也让节点身份不可抵赖。
 */

import jwt from 'jsonwebtoken';

const NODE_TOKEN_AUDIENCE = 'rustbot-connector';

function getSecret() {
  const secret = process.env.NODE_TOKEN_SECRET;
  if (!secret) {
    throw new Error('NODE_TOKEN_SECRET 未配置');
  }
  return secret;
}

/**
 * 为指定 nodeId 签发长期节点令牌（由 scripts/issue-node-token.js 调用）。
 * @param {string} nodeId
 * @returns {string} JWT
 */
export function signNodeToken(nodeId) {
  if (!nodeId || typeof nodeId !== 'string') {
    throw new Error('nodeId 必须是非空字符串');
  }
  if (!/^[A-Za-z0-9._-]{1,64}$/.test(nodeId)) {
    throw new Error('nodeId 只能包含字母/数字/点/下划线/连字符，长度 1-64');
  }
  return jwt.sign({ typ: 'node' }, getSecret(), {
    subject: nodeId,
    audience: NODE_TOKEN_AUDIENCE,
    algorithm: 'HS256',
  });
}

/**
 * 验签节点令牌，成功返回 nodeId，失败抛错。
 * @param {string} token
 * @returns {string} nodeId
 */
export function verifyNodeToken(token) {
  if (!token) {
    throw new Error('缺少节点令牌');
  }
  const decoded = jwt.verify(token, getSecret(), {
    audience: NODE_TOKEN_AUDIENCE,
    algorithms: ['HS256'],
  });
  const nodeId = decoded.sub;
  if (!nodeId || typeof nodeId !== 'string' || !/^[A-Za-z0-9._-]{1,64}$/.test(nodeId)) {
    throw new Error('节点令牌缺少有效的 nodeId');
  }
  return nodeId;
}

/** 去掉 IPv4-mapped IPv6 前缀（如 ::ffff:127.0.0.1 -> 127.0.0.1） */
function normalizeIp(ip) {
  if (!ip) return '';
  return String(ip).replace(/^::ffff:/i, '').trim();
}

/**
 * 解析内部接口允许的来源 IP。
 * - 未配置时默认仅本机（127.0.0.1, ::1）——内部接口默认锁内网（fail-closed）；
 * - 配置为 "*" 表示不做 IP 限制（仅依赖节点令牌）；
 * - 跨机子节点需把其出口 IP 显式加入 INTERNAL_ALLOWED_IPS。
 */
export function parseAllowedInternalIps() {
  const raw = (process.env.INTERNAL_ALLOWED_IPS || '127.0.0.1,::1').trim();
  if (raw === '*') return '*';
  return raw
    .split(',')
    .map((item) => normalizeIp(item))
    .filter(Boolean);
}

/**
 * 判断某来源 IP 是否被允许访问 /api/internal。
 * @param {string} ip
 * @returns {boolean}
 */
export function isAllowedInternalIp(ip) {
  const allow = parseAllowedInternalIps();
  if (allow === '*') return true;
  return allow.includes(normalizeIp(ip));
}
