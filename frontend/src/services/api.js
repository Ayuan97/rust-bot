import axios from 'axios';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3000/api';

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

export const deleteDevice = (serverId, entityId) => api.delete(`/servers/${serverId}/devices/${entityId}`);

// ========== 事件日志 ==========

export const getEvents = (serverId, limit = 100) => api.get(`/servers/${serverId}/events`, { params: { limit } });

// ========== 健康检查 ==========

export const healthCheck = () => api.get('/health');

export default api;
