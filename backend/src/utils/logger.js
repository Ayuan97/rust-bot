// 轻量级日志工具，支持 LOG_LEVEL: error | warn | info | debug（默认 info）
const levelOrder = { error: 0, warn: 1, info: 2, debug: 3 };

// 服务器名称缓存（serverId -> shortName）
const serverNames = new Map();

function resolveLevel() {
  const env = (process.env.LOG_LEVEL || 'info').toString().toLowerCase();
  if (env in levelOrder) return env;
  // 兼容数字级别
  const asNum = Number(env);
  if (!Number.isNaN(asNum)) {
    if (asNum <= 0) return 'error';
    if (asNum === 1) return 'warn';
    if (asNum === 2) return 'info';
    return 'debug';
  }
  return 'info';
}

let currentLevel = resolveLevel();

function shouldLog(targetLevel) {
  return levelOrder[targetLevel] <= levelOrder[currentLevel];
}

/**
 * 获取时间前缀 [HH:MM:SS]
 */
function timePrefix() {
  const now = new Date();
  const h = String(now.getHours()).padStart(2, '0');
  const m = String(now.getMinutes()).padStart(2, '0');
  const s = String(now.getSeconds()).padStart(2, '0');
  return `[${h}:${m}:${s}]`;
}

/**
 * 获取简短服务器名称（最多8个字符）
 */
function getShortServerName(serverId) {
  if (!serverId) return '';
  const name = serverNames.get(serverId);
  if (!name) return '';
  // 截取前8个字符
  return name.length > 8 ? name.substring(0, 8) : name;
}

/**
 * 设置服务器名称
 */
function setServerName(serverId, name) {
  if (serverId && name) {
    serverNames.set(serverId, name);
  }
}

/**
 * 移除服务器名称
 */
function removeServerName(serverId) {
  serverNames.delete(serverId);
}

/**
 * 格式化日志消息
 * @param {string} message - 日志消息
 * @param {string} serverId - 服务器ID（可选）
 * @returns {string} 格式化后的消息
 */
function formatLog(message, serverId = null) {
  const time = timePrefix();
  if (serverId) {
    const serverName = getShortServerName(serverId);
    if (serverName) {
      return `${time} [${serverName}] ${message}`;
    }
  }
  return `${time} ${message}`;
}

const logger = {
  setLevel(level) {
    if (level in levelOrder) currentLevel = level;
  },

  // 设置服务器名称（供 rustplus.service 调用）
  setServerName,
  removeServerName,
  getShortServerName,

  error(...args) {
    if (shouldLog('error')) {
      console.error(timePrefix(), ...args);
    }
  },
  warn(...args) {
    if (shouldLog('warn')) {
      console.warn(timePrefix(), ...args);
    }
  },
  info(...args) {
    if (shouldLog('info')) {
      console.log(timePrefix(), ...args);
    }
  },
  debug(...args) {
    if (shouldLog('debug')) {
      console.log(timePrefix(), ...args);
    }
  },

  /**
   * 带服务器名称的日志输出
   * @param {string} serverId - 服务器ID
   * @param {string} message - 日志消息
   */
  server(serverId, message) {
    if (shouldLog('info')) {
      console.log(formatLog(message, serverId));
    }
  },

  /**
   * 纯格式化（供外部使用）
   */
  format: formatLog,
  timePrefix,
};

export default logger;
