import axios from 'axios';

// Docker 部署时使用相对路径（通过 nginx 代理），本地开发时使用环境变量
const API_URL = import.meta.env.VITE_API_URL || '/api';

const api = axios.create({
  baseURL: API_URL,
  headers: {
    'Content-Type': 'application/json'
  }
});

// 请求拦截器 - 自动添加 JWT Token
api.interceptors.request.use(
  (config) => {
    const token = localStorage.getItem('token');
    if (token) {
      config.headers.Authorization = `Bearer ${token}`;
    }
    return config;
  },
  (error) => {
    return Promise.reject(error);
  }
);

// 响应拦截器 - 处理 401 未授权
api.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response?.status === 401) {
      // Token 过期或无效，清除本地存储并跳转到登录页
      localStorage.removeItem('token');
      localStorage.removeItem('user');
      window.location.href = '/login';
    }
    return Promise.reject(error);
  }
);


// ========== 服务器管理 ==========

export const getServers = () => api.get('/servers');

export const getServer = (id) => api.get(`/servers/${id}`);

export const connectServer = (id) => api.post(`/servers/${id}/connect`);

export const addServer = (server) => api.post('/servers', server);

export const updateServer = (id, updates) => api.put(`/servers/${id}`, updates);

export const deleteServer = (id) => api.delete(`/servers/${id}`);

// ========== 实时 Rust+ 数据 ==========

export const getTeamInfo = (serverId) => api.get(`/servers/${serverId}/team`);

export const getTeamDetailed = (serverId) => api.get(`/servers/${serverId}/team-detailed`);

export const getTeamChat = (serverId) => api.get(`/servers/${serverId}/chat`);

export const sendTeamMessage = (serverId, message) => api.post(`/servers/${serverId}/chat`, { message });

export const getMapInfo = (serverId) => api.get(`/servers/${serverId}/map-info`);

// ========== 扩展队友列表 ==========

export const getExtendedTeammates = (serverId) => api.get(`/servers/${serverId}/extended-teammates`);

export const deleteExtendedTeammate = (serverId, steamId) => api.delete(`/servers/${serverId}/extended-teammates/${steamId}`);

export const updateTeammateNotes = (serverId, steamId, notes) => api.put(`/servers/${serverId}/extended-teammates/${steamId}`, { notes });

export const refreshPlayerData = (serverId) => api.post(`/servers/${serverId}/refresh-player-data`);

// ========== 玩家统计 ==========

export const getPlayerStats = (serverId, steamId) => api.get(`/servers/${serverId}/player-stats/${steamId}`);

// ========== 设备管理 ==========

export const getDevices = (serverId) => api.get(`/servers/${serverId}/devices`);

export const addDevice = (serverId, device) => api.post(`/servers/${serverId}/devices`, device);

export const updateDevice = (serverId, entityId, updates) => api.put(`/servers/${serverId}/devices/${entityId}`, updates);

export const deleteDevice = (serverId, entityId) => api.delete(`/servers/${serverId}/devices/${entityId}`);

export const getDeviceStatus = (serverId, entityId) => api.get(`/servers/${serverId}/devices/${entityId}/status`);

export const checkDeviceReachability = (serverId, removeUnreachable = false) =>
  api.post(`/servers/${serverId}/devices/check-reachability`, { removeUnreachable });

// ========== 事件日志 ==========

export const getEvents = (serverId, limit = 100) => api.get(`/servers/${serverId}/events`, { params: { limit } });

// ========== 事件预测 ==========

export const getPredictions = (serverId) => api.get(`/predictions/${serverId}`);

export const getPredictionPatterns = (serverId) => api.get(`/predictions/${serverId}/patterns`);

export const resetPredictionPatterns = (serverId) => api.post(`/predictions/${serverId}/patterns/reset`);

export const getActiveTimers = (serverId) => api.get(`/servers/${serverId}/timers`);

// ========== Battlemetrics ==========

export const getBattlemetricsInfo = (serverId) => api.get(`/servers/${serverId}/battlemetrics`);

export const getTopPlayers = (serverId, days = 30) => api.get(`/servers/${serverId}/battlemetrics/top-players`, { params: { days } });

// ========== 健康检查 ==========

export const healthCheck = () => api.get('/health');

// ========== 玩家追踪 ==========

export const getTrackedPlayers = () => api.get('/tracking');

export const addTrackedPlayer = (data) => api.post('/tracking', data);

export const updateTrackedPlayer = (steamId, data) => api.put(`/tracking/${steamId}`, data);

export const deleteTrackedPlayer = (steamId) => api.delete(`/tracking/${steamId}`);

export const getPlayerHistory = (steamId, limit = 50) => api.get(`/tracking/${steamId}/history`, { params: { limit } });

export const getTrackedPlayerProfile = (steamId) => api.get(`/tracking/${steamId}/profile`);

export const getTrackingGroups = () => api.get('/tracking/groups');

export const previewPlayer = (steamId) => api.get(`/tracking/preview/${steamId}`);

export default api;
