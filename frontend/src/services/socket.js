import { io } from 'socket.io-client';

// 优先使用根目录 .env 里的 VITE_SOCKET_URL，留空时使用当前页面 origin。
const SOCKET_URL = import.meta.env.VITE_SOCKET_URL || '';

class SocketService {
  constructor() {
    this.socket = null;
    this.listeners = new Map();
    this.connectionListeners = new Set(); // 连接状态变化监听器
  }

  connect() {
    if (this.socket?.connected) {
      return this.socket;
    }

    // 从 localStorage 获取 JWT Token
    const token = localStorage.getItem('token');
    if (!token) {
      console.error('❌ 无法连接 Socket: 未找到认证令牌');
      return null;
    }

    this.socket = io(SOCKET_URL, {
      transports: ['websocket'],
      reconnection: true,
      reconnectionDelay: 1000,
      reconnectionAttempts: Infinity,  // 无限重连
      auth: {
        token  // 在握手时传递 Token
      }
    });

    this.socket.on('connect', () => {
      console.log('✅ WebSocket 已连接');
      this.notifyConnectionChange(true);
    });

    this.socket.on('disconnect', () => {
      console.log('❌ WebSocket 已断开');
      this.notifyConnectionChange(false);
    });

    this.socket.on('connect_error', (error) => {
      console.error('❌ WebSocket 连接错误:', error.message);

      // 如果是认证错误，清除 Token 并跳转到登录页
      if (error.message.includes('认证') || error.message.includes('令牌') || error.message.includes('授权')) {
        console.error('❌ 认证失败，请重新登录');
        localStorage.removeItem('token');
        localStorage.removeItem('user');
        window.location.href = '/login';
      }
    });

    this.socket.on('error', (error) => {
      console.error('WebSocket 错误:', error);
    });

    return this.socket;
  }

  // 通知所有连接状态监听器
  notifyConnectionChange(connected) {
    this.connectionListeners.forEach(listener => {
      try {
        listener(connected);
      } catch (e) {
        console.error('连接状态监听器错误:', e);
      }
    });
  }

  // 订阅连接状态变化
  onConnectionChange(callback) {
    this.connectionListeners.add(callback);
    // 立即通知当前状态
    if (this.socket) {
      callback(this.socket.connected);
    }
    // 返回取消订阅函数
    return () => this.connectionListeners.delete(callback);
  }

  // 获取当前连接状态
  isConnected() {
    return this.socket?.connected || false;
  }

  disconnect() {
    if (this.socket) {
      // 清理所有记录的监听器
      this.listeners.forEach((callbacks, event) => {
        callbacks.forEach(cb => this.socket.off(event, cb));
      });
      this.listeners.clear();

      // 清理连接状态监听器
      this.connectionListeners.clear();

      this.socket.disconnect();
      this.socket = null;
    }
  }

  // ========== 服务器操作 ==========

  connectToServer(serverId) {
    return new Promise((resolve, reject) => {
      if (!this.socket) {
        return reject(new Error('Socket 未连接'));
      }
      const cleanup = () => {
        this.socket?.off('server:connect:success', onSuccess);
        this.socket?.off('server:connect:error', onError);
        this.socket?.off('server:connect:queued', onQueued);
      };

      const onSuccess = (data) => {
        clearTimeout(timeout);
        cleanup();
        resolve(data);
      };

      const onError = (error) => {
        clearTimeout(timeout);
        cleanup();
        reject(error);
      };

      const onQueued = (data) => {
        clearTimeout(timeout);
        cleanup();
        const reason = data?.reason || 'SESSION_QUEUED';
        const queuePosition = data?.queuePosition;
        const message = reason === 'SESSION_CONNECTING'
          ? '连接正在建立中，请稍后再试'
          : `连接排队中${queuePosition ? `，当前排队第 ${queuePosition} 位` : ''}`;
        const queuedError = new Error(message);
        queuedError.code = reason;
        queuedError.data = data;
        reject(queuedError);
      };

      const timeout = setTimeout(() => {
        cleanup();
        reject(new Error('连接服务器超时'));
      }, 15000); // 15秒超时

      // 只发送 serverId，后端从数据库获取安全配置
      this.socket.emit('server:connect', serverId);

      this.socket.once('server:connect:success', onSuccess);
      this.socket.once('server:connect:error', onError);
      this.socket.once('server:connect:queued', onQueued);
    });
  }

  disconnectFromServer(serverId) {
    return new Promise((resolve, reject) => {
      if (!this.socket) {
        return reject(new Error('Socket 未连接'));
      }
      const timeout = setTimeout(() => {
        this.socket?.off('server:disconnect:success');
        this.socket?.off('server:disconnect:error');
        reject(new Error('断开服务器超时'));
      }, 10000);

      this.socket.emit('server:disconnect', serverId);

      this.socket.once('server:disconnect:success', (data) => {
        clearTimeout(timeout);
        resolve(data);
      });
      this.socket.once('server:disconnect:error', (error) => {
        clearTimeout(timeout);
        reject(error);
      });
    });
  }

  getServerInfo(serverId) {
    return new Promise((resolve, reject) => {
      if (!this.socket) {
        return reject(new Error('Socket 未连接'));
      }
      const timeout = setTimeout(() => {
        this.socket?.off('server:info:success');
        this.socket?.off('server:info:error');
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
      if (!this.socket) {
        return reject(new Error('Socket 未连接'));
      }
      const timeout = setTimeout(() => {
        this.socket?.off('message:send:success');
        this.socket?.off('message:send:error');
        reject(new Error('发送消息超时'));
      }, 10000);

      this.socket.emit('message:send', { serverId, message });

      this.socket.once('message:send:success', (data) => {
        clearTimeout(timeout);
        resolve(data);
      });
      this.socket.once('message:send:error', (error) => {
        clearTimeout(timeout);
        reject(error);
      });
    });
  }

  getChatHistory(serverId) {
    return new Promise((resolve, reject) => {
      if (!this.socket) {
        return reject(new Error('Socket 未连接'));
      }
      const timeout = setTimeout(() => {
        this.socket?.off('chat:history:success');
        this.socket?.off('chat:history:error');
        reject(new Error('获取聊天历史超时'));
      }, 15000);

      this.socket.emit('chat:history', { serverId });

      this.socket.once('chat:history:success', (data) => {
        clearTimeout(timeout);
        resolve(data.messages);
      });
      this.socket.once('chat:history:error', (error) => {
        clearTimeout(timeout);
        reject(error);
      });
    });
  }

  // ========== 设备操作 ==========

  controlDevice(serverId, entityId, value) {
    return new Promise((resolve, reject) => {
      if (!this.socket) {
        return reject(new Error('Socket 未连接'));
      }
      const timeout = setTimeout(() => {
        this.socket?.off('device:control:success');
        this.socket?.off('device:control:error');
        reject(new Error('控制设备超时'));
      }, 10000);

      this.socket.emit('device:control', { serverId, entityId, value });

      this.socket.once('device:control:success', (data) => {
        clearTimeout(timeout);
        resolve(data);
      });
      this.socket.once('device:control:error', (error) => {
        clearTimeout(timeout);
        reject(error);
      });
    });
  }

  getDeviceInfo(serverId, entityId) {
    return new Promise((resolve, reject) => {
      if (!this.socket) {
        return reject(new Error('Socket 未连接'));
      }
      const timeout = setTimeout(() => {
        this.socket?.off('device:info:success');
        this.socket?.off('device:info:error');
        reject(new Error('获取设备信息超时'));
      }, 10000);

      this.socket.emit('device:info', { serverId, entityId });

      this.socket.once('device:info:success', (data) => {
        clearTimeout(timeout);
        resolve(data.info);
      });
      this.socket.once('device:info:error', (error) => {
        clearTimeout(timeout);
        reject(error);
      });
    });
  }

  // ========== 队伍操作 ==========

  getTeamInfo(serverId) {
    return new Promise((resolve, reject) => {
      if (!this.socket) {
        return reject(new Error('Socket 未连接'));
      }
      const timeout = setTimeout(() => {
        this.socket?.off('team:info:success');
        this.socket?.off('team:info:error');
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
      if (!this.socket) {
        return reject(new Error('Socket 未连接'));
      }
      const timeout = setTimeout(() => {
        this.socket?.off('map:info:success');
        this.socket?.off('map:info:error');
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
      if (!this.socket) {
        return reject(new Error('Socket 未连接'));
      }
      const timeout = setTimeout(() => {
        this.socket?.off('map:get:success');
        this.socket?.off('map:get:error');
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
      if (!this.socket) {
        return reject(new Error('Socket 未连接'));
      }
      const timeout = setTimeout(() => {
        this.socket?.off('time:get:success');
        this.socket?.off('time:get:error');
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
