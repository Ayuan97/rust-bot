import axios from 'axios';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3000/api';

const api = axios.create({
  baseURL: API_URL,
  headers: {
    'Content-Type': 'application/json'
  }
});

/**
 * 获取代理状态
 */
export const getProxyStatus = () => api.get('/proxy/status');

/**
 * 获取节点列表
 */
export const getProxyNodes = () => api.get('/proxy/nodes');

/**
 * 保存代理配置
 * @param {Object} config - 配置对象
 * @param {string} config.subscriptionUrl - 订阅链接
 * @param {string} [config.selectedNode] - 选中的节点名称
 * @param {number} [config.proxyPort] - 代理端口
 * @param {boolean} [config.autoStart] - 是否自动启动
 */
export const saveProxyConfig = (config) => api.post('/proxy/config', config);

/**
 * 启动代理
 * @param {string} [nodeName] - 指定节点名称（可选）
 */
export const startProxy = (nodeName) => api.post('/proxy/start', { nodeName });

/**
 * 停止代理
 */
export const stopProxy = () => api.post('/proxy/stop');

/**
 * 切换节点
 * @param {string} nodeName - 节点名称
 */
export const switchProxyNode = (nodeName) => api.post('/proxy/switch', { nodeName });

/**
 * 刷新订阅（重新拉取节点列表）
 */
export const refreshProxyNodes = () => api.post('/proxy/refresh');

/**
 * 清除代理配置
 */
export const deleteProxyConfig = () => api.delete('/proxy/config');

export default {
  getProxyStatus,
  getProxyNodes,
  saveProxyConfig,
  startProxy,
  stopProxy,
  switchProxyNode,
  refreshProxyNodes,
  deleteProxyConfig
};
