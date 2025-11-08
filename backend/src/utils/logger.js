// 轻量级日志工具，支持 LOG_LEVEL: error | warn | info | debug（默认 info）
const levelOrder = { error: 0, warn: 1, info: 2, debug: 3 };

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

function timePrefix() {
  try {
    return new Date().toLocaleTimeString();
  } catch {
    return '';
  }
}

const logger = {
  setLevel(level) {
    if (level in levelOrder) currentLevel = level;
  },
  error(...args) {
    if (shouldLog('error')) {
      console.error(...args);
    }
  },
  warn(...args) {
    if (shouldLog('warn')) {
      console.warn(...args);
    }
  },
  info(...args) {
    if (shouldLog('info')) {
      console.log(...args);
    }
  },
  debug(...args) {
    if (shouldLog('debug')) {
      console.log(...args);
    }
  },
};

export default logger;


