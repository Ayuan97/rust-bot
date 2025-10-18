import api from './api';

// 获取配对状态
export const getPairingStatus = () => api.get('/pairing/status');

// 开始 FCM 监听
export const startPairing = () => api.post('/pairing/start');

// 停止 FCM 监听
export const stopPairing = () => api.post('/pairing/stop');

// 重置 FCM 凭证
export const resetPairing = () => api.post('/pairing/reset');

// 获取 FCM 凭证
export const getCredentials = () => api.get('/pairing/credentials');

// 手动提交 FCM 凭证
export const submitCredentials = (credentials) => api.post('/pairing/credentials/manual', credentials);

// 从 rustplus CLI 加载凭证
export const loadCredentialsFromCLI = () => api.post('/pairing/credentials/load-cli');
