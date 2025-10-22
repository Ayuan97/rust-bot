/**
 * 简单的消息模板工具
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// 加载配置
let config = {};
try {
  const data = fs.readFileSync(path.join(__dirname, '../../config/messages.json'), 'utf8');
  config = JSON.parse(data);
  console.log('✅ 消息模板已加载');
} catch (e) {
  console.error('❌ 加载消息模板失败:', e.message);
}

/**
 * 替换消息中的变量
 */
function format(template, vars = {}) {
  if (!template) return '';
  let msg = template;
  for (const [key, val] of Object.entries(vars)) {
    msg = msg.replace(new RegExp(`\\{${key}\\}`, 'g'), val);
  }
  return msg;
}

/**
 * 获取通知消息
 */
export function notify(type, vars) {
  return format(config.notifications?.[type] || '', vars);
}

/**
 * 获取命令响应
 */
export function cmd(command, type = 'msg', vars = {}) {
  const cmdConfig = config.commands?.[command];
  if (!cmdConfig) return null;
  return format(cmdConfig[type] || '', vars);
}

/**
 * 获取命令配置
 */
export function cmdConfig(command) {
  return config.commands?.[command] || null;
}

/**
 * 获取所有命令
 */
export function allCommands() {
  const cmds = config.commands || {};
  return Object.entries(cmds)
    .filter(([name]) => !['unknown', 'error'].includes(name))
    .map(([name, cfg]) => ({ name, desc: cfg.desc }));
}

export default { notify, cmd, cmdConfig, allCommands };
