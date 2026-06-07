/**
 * 为子节点签发内部认证令牌（节点 JWT）。
 *
 * 用法（在项目根或 backend 目录均可）：
 *   node backend/scripts/issue-node-token.js <nodeId>
 *   npm --prefix backend run issue-node-token -- <nodeId>
 *
 * 需先在根目录 .env 配置 NODE_TOKEN_SECRET（与主节点一致）。
 * 把输出的令牌配到对应子节点机器的 NODE_TOKEN 环境变量。
 * 令牌的 nodeId 即该子节点的唯一身份，子节点无法用它冒充其它 nodeId。
 */

import '../src/utils/load-env.js';
import { signNodeToken } from '../src/utils/node-auth.js';

const nodeId = process.argv[2];

if (!nodeId) {
  console.error('用法: node backend/scripts/issue-node-token.js <nodeId>');
  process.exit(1);
}

try {
  const token = signNodeToken(nodeId);
  console.log(token);
} catch (error) {
  console.error(`签发失败: ${error.message}`);
  process.exit(1);
}
