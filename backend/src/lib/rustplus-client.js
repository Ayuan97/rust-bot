/**
 * 自定义 RustPlus 客户端
 * 完全替代 @liamcottle/rustplus.js，支持 SOCKS5 代理
 */

import WebSocket from 'ws';
import protobuf from 'protobufjs';
import { EventEmitter } from 'events';
import path from 'path';
import { fileURLToPath } from 'url';
import { SocksProxyAgent } from 'socks-proxy-agent';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Proto 文件路径（使用原库的 proto 文件）
const PROTO_PATH = path.resolve(__dirname, '../../node_modules/@liamcottle/rustplus.js/rustplus.proto');

// Facepunch 官方代理地址
const FACEPUNCH_PROXY = 'wss://companion-rust.facepunch.com';

class RustPlusClient extends EventEmitter {
  /**
   * @param {string} server - 服务器 IP 或域名
   * @param {number|string} port - Rust+ App 端口
   * @param {string} playerId - Steam ID
   * @param {number|string} playerToken - 玩家 Token（通常是负数）
   * @param {Object} options - 可选配置
   * @param {boolean} options.useFacepunchProxy - 是否使用 Facepunch 官方代理
   * @param {Object} options.proxy - SOCKS5 代理配置 { host, port }
   */
  constructor(server, port, playerId, playerToken, options = {}) {
    super();

    this.server = server;
    this.port = parseInt(port);
    this.playerId = playerId;
    this.playerToken = parseInt(playerToken);

    this.useFacepunchProxy = options.useFacepunchProxy || false;
    this.proxyConfig = options.proxy || null;

    this.websocket = null;
    this.AppRequest = null;
    this.AppMessage = null;

    this.seq = 0;
    this.seqCallbacks = new Map();

    this._protoLoaded = false;
  }

  /**
   * 加载 Protobuf 定义
   */
  async _loadProto() {
    if (this._protoLoaded) return;

    const root = await protobuf.load(PROTO_PATH);
    this.AppRequest = root.lookupType('rustplus.AppRequest');
    this.AppMessage = root.lookupType('rustplus.AppMessage');
    this._protoLoaded = true;
  }

  /**
   * 连接到 Rust+ 服务器
   */
  async connect() {
    // 加载 protobuf
    await this._loadProto();

    // 断开现有连接
    if (this.websocket) {
      this.disconnect();
    }

    // 构建 WebSocket 地址
    const address = this.useFacepunchProxy
      ? `${FACEPUNCH_PROXY}/game/${this.server}/${this.port}`
      : `ws://${this.server}:${this.port}`;

    // 配置 WebSocket 选项
    const wsOptions = {};

    if (this.proxyConfig) {
      const proxyUrl = `socks5://${this.proxyConfig.host}:${this.proxyConfig.port}`;
      wsOptions.agent = new SocksProxyAgent(proxyUrl);
      console.log(`🔌 通过 SOCKS5 代理连接: ${address}`);
    } else {
      console.log(`🔌 直连服务器: ${address}`);
    }

    // 触发 connecting 事件
    this.emit('connecting');

    // 创建 WebSocket 连接
    this.websocket = new WebSocket(address, wsOptions);

    // 绑定事件
    this.websocket.on('open', () => {
      this.emit('connected');
    });

    this.websocket.on('error', (e) => {
      this.emit('error', e);
    });

    this.websocket.on('message', (data) => {
      try {
        const message = this.AppMessage.decode(Buffer.isBuffer(data) ? data : Buffer.from(data));

        // 检查是否是响应消息
        if (message.response && message.response.seq && this.seqCallbacks.has(message.response.seq)) {
          const callback = this.seqCallbacks.get(message.response.seq);
          this.seqCallbacks.delete(message.response.seq);

          const result = callback(message);
          // 如果回调返回 true，不触发 message 事件
          if (result) return;
        }

        // 触发 message 事件
        this.emit('message', message);
      } catch (e) {
        this.emit('error', e);
      }
    });

    this.websocket.on('close', () => {
      this.emit('disconnected');
    });
  }

  /**
   * 断开连接
   */
  disconnect() {
    if (this.websocket) {
      this.websocket.terminate();
      this.websocket = null;
    }
  }

  /**
   * 检查是否已连接
   */
  isConnected() {
    return this.websocket && this.websocket.readyState === WebSocket.OPEN;
  }

  /**
   * 发送请求
   * @param {Object} data - 请求数据
   * @param {Function} callback - 回调函数
   */
  sendRequest(data, callback) {
    const currentSeq = ++this.seq;

    if (callback) {
      this.seqCallbacks.set(currentSeq, callback);
    }

    const request = this.AppRequest.fromObject({
      seq: currentSeq,
      playerId: this.playerId,
      playerToken: this.playerToken,
      ...data,
    });

    this.websocket.send(this.AppRequest.encode(request).finish());
    this.emit('request', request);
  }

  /**
   * 发送请求（Promise 版本）
   * @param {Object} data - 请求数据
   * @param {number} timeoutMs - 超时时间（毫秒）
   */
  sendRequestAsync(data, timeoutMs = 10000) {
    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        reject(new Error('Timeout reached while waiting for response'));
      }, timeoutMs);

      this.sendRequest(data, (message) => {
        clearTimeout(timeout);

        if (message.response.error) {
          reject(message.response.error);
        } else {
          resolve(message.response);
        }

        return true; // 不触发 message 事件
      });
    });
  }

  // ========== 便捷方法 ==========

  /**
   * 获取服务器信息
   */
  getInfo(callback) {
    this.sendRequest({ getInfo: {} }, callback);
  }

  /**
   * 获取时间
   */
  getTime(callback) {
    this.sendRequest({ getTime: {} }, callback);
  }

  /**
   * 获取地图
   */
  getMap(callback) {
    this.sendRequest({ getMap: {} }, callback);
  }

  /**
   * 获取地图标记
   */
  getMapMarkers(callback) {
    this.sendRequest({ getMapMarkers: {} }, callback);
  }

  /**
   * 获取队伍信息
   */
  getTeamInfo(callback) {
    this.sendRequest({ getTeamInfo: {} }, callback);
  }

  /**
   * 发送队伍消息
   */
  sendTeamMessage(message, callback) {
    this.sendRequest({ sendTeamMessage: { message } }, callback);
  }

  /**
   * 获取实体信息
   */
  getEntityInfo(entityId, callback) {
    this.sendRequest({ entityId, getEntityInfo: {} }, callback);
  }

  /**
   * 设置实体值
   */
  setEntityValue(entityId, value, callback) {
    this.sendRequest({
      entityId,
      setEntityValue: { value },
    }, callback);
  }

  /**
   * 打开智能开关
   */
  turnSmartSwitchOn(entityId, callback) {
    this.setEntityValue(entityId, true, callback);
  }

  /**
   * 关闭智能开关
   */
  turnSmartSwitchOff(entityId, callback) {
    this.setEntityValue(entityId, false, callback);
  }

  /**
   * 移交队长
   */
  promoteToLeader(steamId, callback) {
    this.sendRequest({ promoteToLeader: { steamId: BigInt(steamId) } }, callback);
  }

  /**
   * 订阅摄像头
   */
  subscribeToCamera(cameraId, callback) {
    this.sendRequest({ cameraSubscribe: { cameraId } }, callback);
  }

  /**
   * 取消订阅摄像头
   */
  unsubscribeFromCamera(callback) {
    this.sendRequest({ cameraUnsubscribe: {} }, callback);
  }

  /**
   * 发送摄像头输入
   */
  sendCameraInput(buttons, x, y, callback) {
    this.sendRequest({
      cameraInput: {
        buttons,
        mouseDelta: { x, y },
      },
    }, callback);
  }

  /**
   * 获取摄像头控制器（兼容原库）
   */
  getCamera(identifier) {
    return new Camera(this, identifier);
  }
}

/**
 * 摄像头控制器
 */
class Camera extends EventEmitter {
  constructor(rustplus, identifier) {
    super();
    this.rustplus = rustplus;
    this.identifier = identifier;
    this.subscribed = false;
  }

  async subscribe() {
    return new Promise((resolve, reject) => {
      this.emit('subscribing');

      this.rustplus.subscribeToCamera(this.identifier, (message) => {
        if (message.response.error) {
          reject(message.response.error);
          return true;
        }

        this.subscribed = true;
        this.cameraInfo = message.response.cameraSubscribeInfo;
        this.emit('subscribed');
        resolve(this.cameraInfo);
        return true;
      });

      // 监听摄像头帧
      this._onCameraRays = (message) => {
        if (message.broadcast && message.broadcast.cameraRays) {
          this.emit('render', message.broadcast.cameraRays);
        }
      };
      this.rustplus.on('message', this._onCameraRays);
    });
  }

  async unsubscribe() {
    return new Promise((resolve, reject) => {
      if (this._onCameraRays) {
        this.rustplus.off('message', this._onCameraRays);
      }

      this.rustplus.unsubscribeFromCamera((message) => {
        if (message.response.error) {
          reject(message.response.error);
          return true;
        }

        this.subscribed = false;
        this.emit('unsubscribed');
        resolve();
        return true;
      });
    });
  }

  async move(buttons, x, y) {
    return new Promise((resolve) => {
      this.rustplus.sendCameraInput(buttons, x, y, () => {
        resolve();
        return true;
      });
    });
  }

  // 摄像头控制按钮
  static get Buttons() {
    return {
      NONE: 0,
      FORWARD: 1,
      BACKWARD: 2,
      LEFT: 4,
      RIGHT: 8,
      JUMP: 16,
      DUCK: 32,
      SPRINT: 64,
      USE: 128,
      FIRE_PRIMARY: 256,
      FIRE_SECONDARY: 512,
      RELOAD: 1024,
    };
  }
}

// 导出
export default RustPlusClient;
export { RustPlusClient, Camera };
