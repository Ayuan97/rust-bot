/**
 * FCM 凭证健康状态分析
 * 用于 status 接口、连接/配对前置校验
 */

/**
 * 解析凭证对象（兼容 JSON 字符串）
 * @param {unknown} raw
 * @returns {object|null}
 */
export function parseFcmCredentials(raw) {
  if (!raw) return null;
  if (typeof raw === 'object') return raw;
  if (typeof raw === 'string') {
    try {
      return JSON.parse(raw);
    } catch {
      return null;
    }
  }
  return null;
}

/**
 * 从数据库凭证 + 运行时 FCM 服务计算健康状态
 * @param {unknown} rawCredentials - servers.fcmCredentials
 * @param {{ isListening?: boolean, lastError?: { message?: string, timestamp?: number }|null }|null} fcmService
 */
export function analyzeFcmHealth(rawCredentials, fcmService = null) {
  const creds = parseFcmCredentials(rawCredentials);
  const hasCredentials = Boolean(creds && (creds.gcm || creds.gcm_android_id));
  const isListening = Boolean(fcmService?.isListening);
  const lastError = fcmService?.lastError || fcmService?.getStatus?.()?.lastError || null;

  let isExpired = false;
  let daysUntilExpire = null;
  let expiresAt = null;

  const expireRaw = creds?.companion?.expire_date ?? creds?.expire_date ?? null;
  if (expireRaw !== null && expireRaw !== undefined && expireRaw !== '') {
    const expireTs = Number(expireRaw);
    if (Number.isFinite(expireTs) && expireTs > 0) {
      // Facepunch companion 多为秒级时间戳
      const expireMs = expireTs > 1e12 ? expireTs : expireTs * 1000;
      const expireTime = new Date(expireMs);
      if (!Number.isNaN(expireTime.getTime())) {
        expiresAt = expireTime.toISOString();
        isExpired = Date.now() > expireTime.getTime();
        if (!isExpired) {
          daysUntilExpire = Math.ceil((expireTime.getTime() - Date.now()) / (1000 * 60 * 60 * 24));
        } else {
          daysUntilExpire = 0;
        }
      }
    }
  }

  // 需要先恢复 FCM，才能继续连接服务器 / 游戏内配对
  // - 无凭证
  // - 凭证已过期
  // - 有凭证但监听失败且存在最近错误（多半是凭证被吊销）
  let needsRestore = false;
  let restoreReason = null;
  let restoreMessage = null;

  if (!hasCredentials) {
    needsRestore = true;
    restoreReason = 'missing';
    restoreMessage = '尚未配置 FCM 凭证，请先完成凭证配置';
  } else if (isExpired) {
    needsRestore = true;
    restoreReason = 'expired';
    restoreMessage = 'FCM 凭证已过期，请先更新凭证后再连接服务器或配对';
  } else if (!isListening && lastError?.message) {
    needsRestore = true;
    restoreReason = 'error';
    restoreMessage = `FCM 连接失败（${lastError.message}），请先恢复 FCM 凭证`;
  }

  // 允许连接服务器：凭证存在且未过期，且不存在致命 FCM 错误
  const canConnectServer = hasCredentials && !isExpired && !(lastError?.message && !isListening);
  // 允许游戏内配对：必须正在监听且未过期
  const canPairServer = hasCredentials && !isExpired && isListening;

  return {
    hasCredentials,
    hasStoredCredentials: hasCredentials,
    isListening,
    isExpired,
    daysUntilExpire,
    expiresAt,
    lastError: lastError
      ? {
          message: lastError.message || String(lastError),
          timestamp: lastError.timestamp || null
        }
      : null,
    needsRestore,
    restoreReason,
    restoreMessage,
    canConnectServer,
    canPairServer
  };
}

/**
 * 从数据库加载用户 FCM 凭证并分析健康状态
 * @param {import('mysql2/promise').Pool|object} db
 * @param {string} userId
 * @param {object|null} fcmService
 */
export async function getUserFcmHealth(db, userId, fcmService = null) {
  const [servers] = await db.query(
    `SELECT fcmCredentials FROM servers
     WHERE userId = ? AND fcmCredentials IS NOT NULL
     LIMIT 1`,
    [userId]
  );
  const raw = servers[0]?.fcmCredentials || null;
  return analyzeFcmHealth(raw, fcmService);
}
