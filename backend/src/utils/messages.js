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
 * 格式化时长（毫秒 → 天时分秒）
 * @param {number} milliseconds - 毫秒数
 * @param {object} options - 选项
 * @param {boolean} options.showSeconds - 是否显示秒（默认 false）
 * @returns {string} 格式化的时长字符串
 */
export function formatDuration(milliseconds, options = {}) {
  const { showSeconds = false } = options;

  if (!milliseconds || milliseconds <= 0) {
    return '不到1分钟';
  }

  const days = Math.floor(milliseconds / (24 * 60 * 60 * 1000));
  const hours = Math.floor((milliseconds % (24 * 60 * 60 * 1000)) / (60 * 60 * 1000));
  const minutes = Math.floor((milliseconds % (60 * 60 * 1000)) / (60 * 1000));
  const seconds = Math.floor((milliseconds % (60 * 1000)) / 1000);

  const parts = [];

  if (days > 0) {
    parts.push(`${days}天`);
  }
  if (hours > 0) {
    parts.push(`${hours}小时`);
  }
  if (minutes > 0) {
    parts.push(`${minutes}分钟`);
  }
  if (showSeconds && seconds > 0) {
    parts.push(`${seconds}秒`);
  }

  // 如果所有都是0（时间太短不足1分钟）
  if (parts.length === 0) {
    return '不到1分钟';
  }

  return parts.join('');
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

export default { notify, cmd, cmdConfig, allCommands, formatDuration };
