/**
 * 前端 FCM 状态辅助：判断是否需要先恢复凭证
 * @param {object|null|undefined} status - /pairing/status 返回的 status
 */
export function getFcmGate(status) {
  const s = status || {};
  const hasCredentials = Boolean(s.hasCredentials || s.hasStoredCredentials);
  const isListening = Boolean(s.isListening);
  const isExpired = Boolean(s.isExpired);
  const needsRestore = Boolean(
    s.needsRestore ?? (!hasCredentials || isExpired || (hasCredentials && !isListening && s.lastError))
  );
  const canConnectServer = Boolean(
    s.canConnectServer ?? (hasCredentials && !isExpired && !(s.lastError && !isListening))
  );
  const canPairServer = Boolean(
    s.canPairServer ?? (hasCredentials && !isExpired && isListening)
  );

  let restoreTitle = '请先恢复 FCM';
  let restoreDesc = s.restoreMessage || '完成 FCM 凭证配置后，才能连接服务器或进行游戏内配对。';
  let ctaLabel = '去恢复 FCM 凭证';

  if (s.restoreReason === 'expired' || isExpired) {
    restoreTitle = 'FCM 凭证已过期';
    restoreDesc = '推送凭证已失效。请先在设置中更新 FCM 凭证，再连接服务器或配对新服。';
    ctaLabel = '去更新 FCM 凭证';
  } else if (s.restoreReason === 'missing' || !hasCredentials) {
    restoreTitle = '尚未配置 FCM';
    restoreDesc = '请先完成 Edge 插件凭证配置，再进行服务器连接或配对。';
    ctaLabel = '去配置 FCM 凭证';
  } else if (s.restoreReason === 'error' || s.lastError) {
    restoreTitle = 'FCM 连接异常';
    restoreDesc = s.restoreMessage || `FCM 监听失败${s.lastError?.message ? `：${s.lastError.message}` : ''}。请先恢复凭证。`;
    ctaLabel = '去恢复 FCM 凭证';
  }

  return {
    hasCredentials,
    isListening,
    isExpired,
    needsRestore,
    canConnectServer,
    canPairServer,
    restoreReason: s.restoreReason || (isExpired ? 'expired' : !hasCredentials ? 'missing' : null),
    restoreTitle,
    restoreDesc,
    ctaLabel,
    daysUntilExpire: s.daysUntilExpire ?? null
  };
}
