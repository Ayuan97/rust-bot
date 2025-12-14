/**
 * 时间格式化工具
 * 统一处理各种时间戳格式和显示
 */

/**
 * 标准化时间戳为毫秒
 * @param {number} timestamp - 时间戳（秒或毫秒）
 * @returns {number} 毫秒时间戳
 */
export function normalizeTimestamp(timestamp) {
  if (!timestamp) return Date.now();
  // 如果小于 10000000000，认为是秒级，否则是毫秒级
  return timestamp < 10000000000 ? timestamp * 1000 : timestamp;
}

/**
 * 格式化为时分（HH:MM）
 * @param {number} timestamp - 时间戳
 * @returns {string} 格式化后的时间
 */
export function formatTime(timestamp) {
  const ms = normalizeTimestamp(timestamp);
  const date = new Date(ms);
  return date.toLocaleTimeString('zh-CN', {
    hour: '2-digit',
    minute: '2-digit'
  });
}

/**
 * 格式化为完整时间（HH:MM:SS）
 * @param {number} timestamp - 时间戳
 * @returns {string} 格式化后的时间
 */
export function formatFullTime(timestamp) {
  const ms = normalizeTimestamp(timestamp);
  const date = new Date(ms);
  return date.toLocaleTimeString('zh-CN', {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit'
  });
}

/**
 * 格式化为日期时间
 * @param {number} timestamp - 时间戳
 * @returns {string} 格式化后的日期时间
 */
export function formatDateTime(timestamp) {
  const ms = normalizeTimestamp(timestamp);
  const date = new Date(ms);
  return date.toLocaleString('zh-CN', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit'
  });
}

/**
 * 格式化为相对时间（多久之前）
 * @param {number} timestamp - 时间戳
 * @returns {string} 相对时间字符串
 */
export function formatTimeAgo(timestamp) {
  const ms = normalizeTimestamp(timestamp);
  const now = Date.now();
  const diff = now - ms;

  const seconds = Math.floor(diff / 1000);
  const minutes = Math.floor(seconds / 60);
  const hours = Math.floor(minutes / 60);
  const days = Math.floor(hours / 24);

  if (seconds < 60) return '刚刚';
  if (minutes < 60) return `${minutes}分钟前`;
  if (hours < 24) return `${hours}小时前`;
  if (days < 30) return `${days}天前`;

  return formatDateTime(timestamp);
}

/**
 * 格式化游戏内时间（浮点数小时）
 * @param {number} gameTime - 游戏时间（0-24的浮点数）
 * @returns {string} 格式化后的游戏时间（HH:MM）
 */
export function formatGameTime(gameTime) {
  if (gameTime === undefined || gameTime === null) return '--:--';
  const hours = Math.floor(gameTime);
  const minutes = Math.floor((gameTime - hours) * 60);
  return `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}`;
}

/**
 * 判断游戏内是否是白天
 * @param {number} time - 游戏时间
 * @param {number} sunrise - 日出时间（默认6）
 * @param {number} sunset - 日落时间（默认18）
 * @returns {boolean} 是否是白天
 */
export function isDaytime(time, sunrise = 6, sunset = 18) {
  if (time === undefined || time === null) return true;
  return time >= sunrise && time < sunset;
}

/**
 * 格式化持续时间（秒转为可读格式）
 * @param {number} seconds - 秒数
 * @returns {string} 可读的持续时间
 */
export function formatDuration(seconds) {
  if (!seconds || seconds < 0) return '0秒';

  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const secs = seconds % 60;

  const parts = [];
  if (hours > 0) parts.push(`${hours}小时`);
  if (minutes > 0) parts.push(`${minutes}分钟`);
  if (secs > 0 && hours === 0) parts.push(`${secs}秒`);

  return parts.join('') || '0秒';
}
