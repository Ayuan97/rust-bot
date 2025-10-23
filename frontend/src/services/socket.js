import { io } from 'socket.io-client';

const SOCKET_URL = import.meta.env.VITE_SOCKET_URL || 'http://localhost:3000';

class SocketService {
  constructor() {
    this.socket = null;
    this.listeners = new Map();
  }

  connect() {
    if (this.socket?.connected) {
      return this.socket;
    }

    this.socket = io(SOCKET_URL, {
      transports: ['websocket'],
      reconnection: true,
      reconnectionDelay: 1000,
      reconnectionAttempts: 5
    });

    this.socket.on('connect', () => {
      console.log('✅ WebSocket 已连接');
    });

    this.socket.on('disconnect', () => {
      console.log('❌ WebSocket 已断开');
    });

    this.socket.on('error', (error) => {
      console.error('WebSocket 错误:', error);
    });

    return this.socket;
  }

  disconnect() {
    if (this.socket) {
      this.socket.disconnect();
      this.socket = null;
    }
  }

  // ========== 服务器操作 ==========

  connectToServer(config) {
    return new Promise((resolve, reject) => {
      this.socket.emit('server:connect', config);

      this.socket.once('server:connect:success', resolve);
      this.socket.once('server:connect:error', reject);
    });
  }

  disconnectFromServer(serverId) {
    return new Promise((resolve, reject) => {
      this.socket.emit('server:disconnect', serverId);

      this.socket.once('server:disconnect:success', resolve);
      this.socket.once('server:disconnect:error', reject);
    });
  }

  getServerInfo(serverId) {
    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        this.socket.off('server:info:success');
        this.socket.off('server:info:error');
        reject(new Error('获取服务器信息超时'));
      }, 10000); // 10秒超时

      this.socket.emit('server:info', serverId);

      this.socket.once('server:info:success', (data) => {
        clearTimeout(timeout);
        resolve(data.info);
      });
      this.socket.once('server:info:error', (error) => {
        clearTimeout(timeout);
        reject(error);
      });
    });
  }

  // ========== 消息操作 ==========

  sendMessage(serverId, message) {
    return new Promise((resolve, reject) => {
      this.socket.emit('message:send', { serverId, message });

      this.socket.once('message:send:success', resolve);
      this.socket.once('message:send:error', reject);
    });
  }

  // ========== 设备操作 ==========

  controlDevice(serverId, entityId, value) {
    return new Promise((resolve, reject) => {
      this.socket.emit('device:control', { serverId, entityId, value });

      this.socket.once('device:control:success', resolve);
      this.socket.once('device:control:error', reject);
    });
  }

  getDeviceInfo(serverId, entityId) {
    return new Promise((resolve, reject) => {
      this.socket.emit('device:info', { serverId, entityId });

      this.socket.once('device:info:success', (data) => resolve(data.info));
      this.socket.once('device:info:error', reject);
    });
  }

  // ========== 队伍操作 ==========

  getTeamInfo(serverId) {
    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        this.socket.off('team:info:success');
        this.socket.off('team:info:error');
        reject(new Error('获取队伍信息超时'));
      }, 10000);

      this.socket.emit('team:info', serverId);

      this.socket.once('team:info:success', (data) => {
        clearTimeout(timeout);
        resolve(data.teamInfo);
      });
      this.socket.once('team:info:error', (error) => {
        clearTimeout(timeout);
        reject(error);
      });
    });
  }

  // ========== 地图操作 ==========

  getMapInfo(serverId) {
    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        this.socket.off('map:info:success');
        this.socket.off('map:info:error');
        reject(new Error('获取地图信息超时'));
      }, 10000);

      this.socket.emit('map:info', serverId);

      this.socket.once('map:info:success', (data) => {
        clearTimeout(timeout);
        resolve(data.mapInfo);
      });
      this.socket.once('map:info:error', (error) => {
        clearTimeout(timeout);
        reject(error);
      });
    });
  }

  getMap(serverId) {
    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        this.socket.off('map:get:success');
        this.socket.off('map:get:error');
        reject(new Error('获取地图超时'));
      }, 15000); // 地图数据可能较大，15秒超时

      this.socket.emit('map:get', serverId);

      this.socket.once('map:get:success', (data) => {
        clearTimeout(timeout);
        resolve(data.map);
      });
      this.socket.once('map:get:error', (error) => {
        clearTimeout(timeout);
        reject(error);
      });
    });
  }

  // ========== 时间操作 ==========

  getTime(serverId) {
    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        this.socket.off('time:get:success');
        this.socket.off('time:get:error');
        reject(new Error('获取时间信息超时'));
      }, 10000);

      this.socket.emit('time:get', serverId);

      this.socket.once('time:get:success', (data) => {
        clearTimeout(timeout);
        resolve(data.time);
      });
      this.socket.once('time:get:error', (error) => {
        clearTimeout(timeout);
        reject(error);
      });
    });
  }

  // ========== 事件监听 ==========

  on(event, callback) {
    if (!this.socket) {
      console.warn('Socket 未连接');
      return;
    }

    this.socket.on(event, callback);

    // 记录监听器以便后续清理
    if (!this.listeners.has(event)) {
      this.listeners.set(event, []);
    }
    this.listeners.get(event).push(callback);
  }

  off(event, callback) {
    if (!this.socket) return;

    this.socket.off(event, callback);

    // 从记录中移除
    if (this.listeners.has(event)) {
      const callbacks = this.listeners.get(event);
      const index = callbacks.indexOf(callback);
      if (index > -1) {
        callbacks.splice(index, 1);
      }
    }
  }

  removeAllListeners(event) {
    if (!this.socket) return;

    this.socket.removeAllListeners(event);
    this.listeners.delete(event);
  }
}

export default new SocketService();
