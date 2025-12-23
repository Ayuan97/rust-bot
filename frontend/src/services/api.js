import axios from 'axios';

// Docker 部署时使用相对路径（通过 nginx 代理），本地开发时使用环境变量
const API_URL = import.meta.env.VITE_API_URL || '/api';

const api = axios.create({
  baseURL: API_URL,
  headers: {
    'Content-Type': 'application/json'
  }
});

// ========== 服务器管理 ==========

export const getServers = () => api.get('/servers');

export const getServer = (id) => api.get(`/servers/${id}`);

export const addServer = (server) => api.post('/servers', server);

export const updateServer = (id, updates) => api.put(`/servers/${id}`, updates);

export const deleteServer = (id) => api.delete(`/servers/${id}`);

// ========== 设备管理 ==========

export const getDevices = (serverId) => api.get(`/servers/${serverId}/devices`);

export const addDevice = (serverId, device) => api.post(`/servers/${serverId}/devices`, device);

export const updateDevice = (serverId, entityId, updates) => api.put(`/servers/${serverId}/devices/${entityId}`, updates);

export const deleteDevice = (serverId, entityId) => api.delete(`/servers/${serverId}/devices/${entityId}`);

export const getDeviceStatus = (serverId, entityId) => api.get(`/servers/${serverId}/devices/${entityId}/status`);

// ========== 事件日志 ==========

export const getEvents = (serverId, limit = 100) => api.get(`/servers/${serverId}/events`, { params: { limit } });

// ========== Battlemetrics ==========

export const getBattlemetricsInfo = (serverId) => api.get(`/servers/${serverId}/battlemetrics`);

export const getTopPlayers = (serverId, days = 30) => api.get(`/servers/${serverId}/battlemetrics/top-players`, { params: { days } });

// ========== 健康检查 ==========

export const healthCheck = () => api.get('/health');

export default api;
