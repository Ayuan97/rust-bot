/**
 * 时间解析工具
 * 参考 rustplusplus 的 timer.js 实现
 */

/**
 * 解析时间字符串为秒数
 * 支持格式: 5m, 1h, 30s, 1h30m, 2d3h15m30s
 * @param {string} str - 时间字符串
 * @returns {number|null} - 秒数，解析失败返回 null
 */
export function parseTimeString(str) {
  if (!str || typeof str !== 'string') return null;

  const matches = str.toLowerCase().match(/\d+[dhms]/g);
  if (!matches || matches.length === 0) return null;

  let totalSeconds = 0;
  for (const match of matches) {
    const value = parseInt(match.slice(0, -1), 10);
    const unit = match[match.length - 1];
    switch (unit) {
      case 'd': totalSeconds += value * 86400; break;  // 天
      case 'h': totalSeconds += value * 3600; break;   // 小时
      case 'm': totalSeconds += value * 60; break;     // 分钟
      case 's': totalSeconds += value; break;          // 秒
    }
  }

  return totalSeconds > 0 ? totalSeconds : null;
}

/**
 * 秒数转换为可读格式
 * @param {number} seconds - 秒数
 * @param {boolean} short - 是否使用短格式
 * @returns {string} - 格式化的时间字符串
 */
export function formatSeconds(seconds, short = true) {
  if (!seconds || seconds <= 0) return short ? '0秒' : '0 秒';

  const days = Math.floor(seconds / 86400);
  const hours = Math.floor((seconds % 86400) / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const secs = Math.floor(seconds % 60);

  const parts = [];
  if (days > 0) parts.push(short ? `${days}天` : `${days} 天`);
  if (hours > 0) parts.push(short ? `${hours}小时` : `${hours} 小时`);
  if (minutes > 0) parts.push(short ? `${minutes}分钟` : `${minutes} 分钟`);
  if (secs > 0 && !days && !hours) parts.push(short ? `${secs}秒` : `${secs} 秒`);

  return parts.join(short ? '' : ' ') || (short ? '0秒' : '0 秒');
}

/**
 * 毫秒数转换为可读格式
 * @param {number} ms - 毫秒数
 * @param {boolean} short - 是否使用短格式
 * @returns {string} - 格式化的时间字符串
 */
export function formatMilliseconds(ms, short = true) {
  return formatSeconds(Math.floor(ms / 1000), short);
}

/**
 * 计算距离某个时间戳过去了多久
 * @param {number} timestamp - 时间戳（毫秒或秒）
 * @returns {string} - 格式化的时间字符串
 */
export function timeSince(timestamp) {
  // 如果时间戳是秒级的，转换为毫秒
  if (timestamp < 1e12) {
    timestamp *= 1000;
  }
  const diff = Date.now() - timestamp;
  return formatMilliseconds(diff);
}
