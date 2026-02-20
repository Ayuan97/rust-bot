import EventEmitter from 'events';
import db from '../lib/db.js';
import distributedSessionService from './distributed-session.service.js';
import logger from '../utils/logger.js';

const FORWARDED_EVENTS = [
  'rust:message',
  'team:message',
  'team:changed',
  'entity:changed',
  'clan:changed',
  'clan:message',
  'camera:subscribing',
  'camera:subscribed',
  'camera:unsubscribed',
  'camera:render',
  'camera:rays',
];

function formatDispatchError(error, fallback = 'distributed command failed') {
  if (!error) return fallback;
  if (typeof error === 'string') return error;
  if (error instanceof Error && error.message) return error.message;
  if (typeof error.message === 'string') return error.message;
  if (error.message) {
    try {
      return JSON.stringify(error.message);
    } catch {
      return String(error.message);
    }
  }
  try {
    return JSON.stringify(error);
  } catch {
    return String(error);
  }
}

class DistributedRustPlusManager extends EventEmitter {
  constructor(userId) {
    super();

    if (!userId) {
      throw new Error('userId is required');
    }

    this.userId = userId;
    this.connections = new Map(); // serverId -> connected session metadata
    this.connecting = new Set(); // serverId currently connecting
    this.serverConfigs = new Map(); // serverId -> server config cache
    this.sessionStates = new Map(); // serverId -> latest session status metadata
    this.mapCache = new Map(); // serverId -> { width, height, oceanMargin, lastUpdate }

    this.chatQueues = new Map(); // serverId -> { queue, processing, timeout }
    this.messagesSentByBot = new Map(); // serverId -> recent bot messages
    this.CHAT_MAX_LENGTH = 128;
    this.CHAT_SEND_DELAY = 2500;
    this.BOT_MESSAGE_HISTORY_LIMIT = 20;

    this._listeners = new Map();
    this._registerSessionListeners();
  }

  _registerSessionListeners() {
    const addListener = (eventName, handler) => {
      distributedSessionService.on(eventName, handler);
      this._listeners.set(eventName, handler);
    };

    addListener('session:queued', (data) => {
      if (data.userId !== this.userId) return;
      this.connecting.add(data.serverId);
      this.sessionStates.set(data.serverId, {
        sessionId: data.sessionId || null,
        nodeId: data.nodeId || null,
        status: 'QUEUED',
        queuedAt: Date.now(),
      });
    });

    addListener('session:assigned', (data) => {
      if (data.userId !== this.userId) return;
      this.connecting.add(data.serverId);
      this.sessionStates.set(data.serverId, {
        sessionId: data.sessionId,
        nodeId: data.nodeId || null,
        status: 'ASSIGNED',
        updatedAt: Date.now(),
      });
    });

    addListener('session:connecting', (data) => {
      if (data.userId !== this.userId) return;
      this.connecting.add(data.serverId);
      this.connections.delete(data.serverId);
      this.sessionStates.set(data.serverId, {
        sessionId: data.sessionId,
        nodeId: data.nodeId || null,
        status: 'CONNECTING',
        updatedAt: Date.now(),
      });
      this.emit('server:reconnecting', {
        userId: this.userId,
        serverId: data.serverId,
      });
    });

    addListener('session:connected', (data) => {
      if (data.userId !== this.userId) return;
      const previous = this.sessionStates.get(data.serverId);
      this.connecting.delete(data.serverId);
      this.connections.set(data.serverId, {
        sessionId: data.sessionId,
        nodeId: data.nodeId || null,
        connectedAt: Date.now(),
      });
      this.sessionStates.set(data.serverId, {
        sessionId: data.sessionId,
        nodeId: data.nodeId || null,
        status: 'CONNECTED',
        updatedAt: Date.now(),
      });
      if (previous?.status === 'CONNECTED' && previous?.sessionId === data.sessionId) {
        return;
      }
      this.emit('server:connected', {
        userId: this.userId,
        serverId: data.serverId,
        sessionId: data.sessionId,
        nodeId: data.nodeId,
      });

      // Warm up key runtime context after the session is truly connected.
      this.getTeamInfo(data.serverId).catch(() => {});
      this.getServerInfo(data.serverId).catch(() => {});
    });

    addListener('session:failed', (data) => {
      if (data.userId !== this.userId) return;
      this.connecting.delete(data.serverId);
      this.connections.delete(data.serverId);
      this.sessionStates.set(data.serverId, {
        sessionId: data.sessionId,
        nodeId: data.nodeId || null,
        status: 'FAILED',
        updatedAt: Date.now(),
      });
      this.emit('server:error', {
        userId: this.userId,
        serverId: data.serverId,
        error: data.error || 'connection failed',
      });
    });

    addListener('session:disconnected', (data) => {
      if (data.userId !== this.userId) return;
      this.connecting.delete(data.serverId);
      this.connections.delete(data.serverId);
      this.sessionStates.set(data.serverId, {
        sessionId: data.sessionId,
        nodeId: data.nodeId || null,
        status: 'CLOSED',
        updatedAt: Date.now(),
      });
      this.emit('server:disconnected', {
        userId: this.userId,
        serverId: data.serverId,
        sessionId: data.sessionId,
      });
    });

    for (const eventName of FORWARDED_EVENTS) {
      addListener(eventName, (data) => {
        if (data.userId !== this.userId) return;
        this.emit(eventName, data);
      });
    }
  }

  _normalizeMapPayload(mapPayload) {
    if (!mapPayload || typeof mapPayload !== 'object') {
      return mapPayload;
    }

    if (mapPayload.jpgImageBase64 && !mapPayload.jpgImage) {
      mapPayload.jpgImage = Buffer.from(mapPayload.jpgImageBase64, 'base64');
      return mapPayload;
    }

    if (mapPayload.jpgImage?.__type === 'buffer-base64' && typeof mapPayload.jpgImage.data === 'string') {
      mapPayload.jpgImage = Buffer.from(mapPayload.jpgImage.data, 'base64');
      return mapPayload;
    }

    if (typeof mapPayload.jpgImage === 'string') {
      mapPayload.jpgImage = Buffer.from(mapPayload.jpgImage, 'base64');
      return mapPayload;
    }

    if (mapPayload.jpgImage?.type === 'Buffer' && Array.isArray(mapPayload.jpgImage.data)) {
      mapPayload.jpgImage = Buffer.from(mapPayload.jpgImage.data);
      return mapPayload;
    }

    return mapPayload;
  }

  destroy() {
    for (const [eventName, handler] of this._listeners.entries()) {
      distributedSessionService.off(eventName, handler);
    }
    this._listeners.clear();

    for (const serverId of this.chatQueues.keys()) {
      const queueState = this.chatQueues.get(serverId);
      if (queueState?.timeout) clearTimeout(queueState.timeout);
    }
    this.chatQueues.clear();
    this.messagesSentByBot.clear();
    this.connections.clear();
    this.connecting.clear();
    this.serverConfigs.clear();
    this.sessionStates.clear();
    this.mapCache.clear();
    this.removeAllListeners();
  }

  async _loadServerConfig(serverId) {
    const [rows] = await db.query(
      `SELECT id, ip, port, playerId, playerToken
       FROM servers
       WHERE id = ? AND userId = ?`,
      [serverId, this.userId]
    );
    const server = rows[0];
    if (!server) {
      throw new Error('server not found or no permission');
    }
    return {
      serverId: server.id,
      ip: server.ip,
      port: server.port,
      playerId: server.playerId,
      playerToken: server.playerToken,
    };
  }

  async _ensureServerConfig(serverId, config = null) {
    if (config && config.serverId) {
      this.serverConfigs.set(serverId, config);
      return config;
    }
    const cached = this.serverConfigs.get(serverId);
    if (cached) return cached;

    const loaded = await this._loadServerConfig(serverId);
    this.serverConfigs.set(serverId, loaded);
    return loaded;
  }

  async connect(config = {}) {
    const serverId = config.serverId || config.id;
    if (!serverId) {
      throw new Error('serverId is required');
    }

    await this._ensureServerConfig(serverId, config.serverId ? config : null);
    this.connecting.add(serverId);

    const result = await distributedSessionService.openSession({
      userId: this.userId,
      serverId,
      reason: 'service_connect',
    });

    if (result.status === 'queued') {
      this.sessionStates.set(serverId, {
        sessionId: null,
        nodeId: null,
        status: 'QUEUED',
        queuedAt: Date.now(),
      });
      return {
        queued: true,
        reason: 'SESSION_QUEUED',
        serverId,
        queueId: result.queueId,
        queuePosition: result.queuePosition,
      };
    }

    if (result.status === 'connected') {
      this.connecting.delete(serverId);
      this.connections.set(serverId, {
        sessionId: result.sessionId,
        nodeId: result.nodeId || null,
        connectedAt: Date.now(),
      });
      this.sessionStates.set(serverId, {
        sessionId: result.sessionId,
        nodeId: result.nodeId || null,
        status: 'CONNECTED',
        updatedAt: Date.now(),
      });
      return {
        connected: true,
        serverId,
        sessionId: result.sessionId,
        nodeId: result.nodeId || null,
      };
    }

    this.sessionStates.set(serverId, {
      sessionId: result.sessionId || null,
      nodeId: result.nodeId || null,
      status: 'ASSIGNED',
      updatedAt: Date.now(),
    });
    return {
      connected: false,
      assigned: true,
      reason: 'SESSION_CONNECTING',
      serverId,
      sessionId: result.sessionId || null,
      nodeId: result.nodeId || null,
    };
  }

  async disconnect(serverId) {
    await distributedSessionService.closeSession({
      userId: this.userId,
      serverId,
      reason: 'manual_disconnect',
    });

    this.connecting.delete(serverId);
    this.connections.delete(serverId);
    this.sessionStates.delete(serverId);
    this.mapCache.delete(serverId);

    const queueState = this.chatQueues.get(serverId);
    if (queueState?.timeout) clearTimeout(queueState.timeout);
    this.chatQueues.delete(serverId);
    this.messagesSentByBot.delete(serverId);
  }

  async disconnectAll() {
    const activeSessions = await distributedSessionService.getUserActiveSessions(this.userId);
    for (const session of activeSessions) {
      try {
        await this.disconnect(session.serverId);
      } catch (error) {
        logger.warn(
          `[distributed-rustplus] user=${this.userId} disconnect server=${session.serverId} failed: ${error.message}`
        );
      }
    }
  }

  async _dispatch(serverId, action, payload = {}, timeoutMs) {
    await this._ensureServerConfig(serverId);

    let response = await distributedSessionService.dispatchCommand({
      userId: this.userId,
      serverId,
      action,
      payload,
      timeoutMs,
    });

    if (response.status === 'missing_session') {
      await this.connect({ serverId });
      response = await distributedSessionService.dispatchCommand({
        userId: this.userId,
        serverId,
        action,
        payload,
        timeoutMs,
      });
    }

    if (response.status === 'queued') {
      const error = new Error('服务器未连接');
      error.code = response.reason || 'SESSION_QUEUED';
      throw error;
    }

    if (response.status !== 'success') {
      throw new Error(formatDispatchError(response.error));
    }

    return response.result;
  }

  async getServerInfo(serverId) {
    const info = await this._dispatch(serverId, 'getServerInfo', {});
    if (info && info.mapSize) {
      this.mapCache.set(serverId, {
        width: info.mapSize,
        height: info.mapSize,
        oceanMargin: this.mapCache.get(serverId)?.oceanMargin || 0,
        lastUpdate: Date.now(),
      });
    }
    return info;
  }

  async getMap(serverId) {
    const map = this._normalizeMapPayload(await this._dispatch(serverId, 'getMap', {}));
    if (map) {
      const cached = this.mapCache.get(serverId) || {};
      this.mapCache.set(serverId, {
        width: cached.width || map.size || 4500,
        height: cached.height || map.size || 4500,
        oceanMargin:
          typeof map.oceanMargin === 'number'
            ? map.oceanMargin
            : (cached.oceanMargin || 0),
        lastUpdate: Date.now(),
      });
    }
    return map;
  }

  getMapSize(serverId) {
    const cached = this.mapCache.get(serverId);
    return cached?.width || 4500;
  }

  getMapOceanMargin(serverId) {
    return this.mapCache.get(serverId)?.oceanMargin || 0;
  }

  getPlayerId(serverId) {
    return this.serverConfigs.get(serverId)?.playerId || null;
  }

  async getMapMarkers(serverId) {
    return this._dispatch(serverId, 'getMapMarkers', {});
  }

  async getTeamInfo(serverId) {
    return this._dispatch(serverId, 'getTeamInfo', {});
  }

  async getTeamChat(serverId) {
    const result = await this._dispatch(serverId, 'getTeamChat', {});
    return result?.messages || result || [];
  }

  async getEntityInfo(serverId, entityId) {
    return this._dispatch(serverId, 'getEntityInfo', { entityId });
  }

  async getTime(serverId) {
    return this._dispatch(serverId, 'getTime', {});
  }

  async setEntityValue(serverId, entityId, value) {
    return this._dispatch(serverId, 'setEntityValue', { entityId, value });
  }

  async turnSmartSwitchOn(serverId, entityId) {
    return this._dispatch(serverId, 'turnSmartSwitchOn', { entityId });
  }

  async turnSmartSwitchOff(serverId, entityId) {
    return this._dispatch(serverId, 'turnSmartSwitchOff', { entityId });
  }

  async promoteToLeader(serverId, steamId) {
    return this._dispatch(serverId, 'promoteToLeader', { steamId });
  }

  async subscribeCamera(serverId, cameraId) {
    return this._dispatch(serverId, 'subscribeCamera', { cameraId });
  }

  async unsubscribeCamera(serverId, cameraId) {
    return this._dispatch(serverId, 'unsubscribeCamera', { cameraId });
  }

  async cameraMove(serverId, cameraId, buttons, x, y) {
    return this._dispatch(serverId, 'cameraMove', { cameraId, buttons, x, y });
  }

  async cameraZoom(serverId, cameraId) {
    return this._dispatch(serverId, 'cameraZoom', { cameraId });
  }

  async cameraShoot(serverId, cameraId) {
    return this._dispatch(serverId, 'cameraShoot', { cameraId });
  }

  async cameraReload(serverId, cameraId) {
    return this._dispatch(serverId, 'cameraReload', { cameraId });
  }

  splitMessage(message) {
    if (!message) return [];
    if (message.length <= this.CHAT_MAX_LENGTH) return [message];

    const regex = new RegExp(`.{1,${this.CHAT_MAX_LENGTH}}(\\s|$)`, 'g');
    const matches = message.match(regex);
    if (matches) {
      return matches.map((entry) => entry.trim()).filter((entry) => entry.length > 0);
    }

    const chunks = [];
    for (let i = 0; i < message.length; i += this.CHAT_MAX_LENGTH) {
      chunks.push(message.slice(i, i + this.CHAT_MAX_LENGTH));
    }
    return chunks;
  }

  recordBotMessage(serverId, message) {
    if (!this.messagesSentByBot.has(serverId)) {
      this.messagesSentByBot.set(serverId, []);
    }
    const history = this.messagesSentByBot.get(serverId);
    history.unshift(message);
    if (history.length > this.BOT_MESSAGE_HISTORY_LIMIT) {
      history.pop();
    }
  }

  isBotMessage(serverId, message) {
    const history = this.messagesSentByBot.get(serverId);
    if (!history) return false;
    const index = history.indexOf(message);
    if (index === -1) return false;
    history.splice(index, 1);
    return true;
  }

  async processChatQueue(serverId) {
    const queueState = this.chatQueues.get(serverId);
    if (!queueState || queueState.processing || queueState.queue.length === 0) {
      return;
    }

    queueState.processing = true;
    const item = queueState.queue.shift();

    try {
      await this._dispatch(serverId, 'sendTeamMessage', { message: item.message });
      if (item.isBot) {
        this.recordBotMessage(serverId, item.message);
      }
    } catch (error) {
      logger.debug(
        `[distributed-rustplus] user=${this.userId} sendTeamMessage failed server=${serverId}: ${error.message}`
      );
    }

    queueState.processing = false;

    if (queueState.queue.length > 0) {
      queueState.timeout = setTimeout(() => {
        this.processChatQueue(serverId);
      }, this.CHAT_SEND_DELAY);
    }
  }

  async sendTeamMessage(serverId, message, options = {}) {
    const { isBot = false } = options;
    const chunks = this.splitMessage(message);
    if (!this.chatQueues.has(serverId)) {
      this.chatQueues.set(serverId, {
        queue: [],
        processing: false,
        timeout: null,
      });
    }

    const queueState = this.chatQueues.get(serverId);
    for (const chunk of chunks) {
      queueState.queue.push({ message: chunk, isBot });
    }
    this.processChatQueue(serverId);

    return {
      success: true,
      message,
      splitCount: chunks.length,
    };
  }

  getConnectedServers() {
    return Array.from(this.connections.keys());
  }

  isConnected(serverId) {
    return this.connections.has(serverId);
  }

  getStats() {
    return {
      userId: this.userId,
      totalServers: this.serverConfigs.size,
      connectedServers: this.connections.size,
      connectingServers: this.connecting.size,
      reconnectingServers: 0,
      activeCameras: 0,
    };
  }
}

export default DistributedRustPlusManager;
