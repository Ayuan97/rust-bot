import EventEmitter from 'events';
import { spawn } from 'child_process';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { SocksProxyAgent } from 'socks-proxy-agent';
import subscriptionService from './subscription.service.js';
import xrayDownloader from '../utils/xray-downloader.js';
import logger from '../utils/logger.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/**
 * 代理管理服务
 * 负责启动和管理 xray-core 代理
 */
class ProxyService extends EventEmitter {
  constructor() {
    super();
    this.xrayProcess = null;
    this.isRunning = false;
    this.proxyAgent = null;
    this.currentNode = null;
    this.configPath = path.join(__dirname, '../../data/xray-config.json');
    this.localPort = parseInt(process.env.PROXY_PORT) || 10808;

    // 重连机制相关
    this.reconnectAttempts = 0;
    this.maxReconnectAttempts = 5;
    this.reconnectDelay = 5000; // 5秒
    this.reconnectTimer = null;
    this.shouldReconnect = true; // 是否应该自动重连
  }

  /**
   * 初始化代理服务
   * @param {string} subscriptionUrl - 订阅链接
   * @param {string} preferredNode - 首选节点名称（可选）
   */
  async initialize(subscriptionUrl, preferredNode = null) {
    try {
      logger.info('🚀 初始化代理服务...');

      // 1. 下载 xray-core（如果不存在）
      logger.info('📦 检查 Xray-core...');
      await xrayDownloader.downloadXray();

      // 2. 获取订阅节点
      logger.info('🔗 获取订阅节点...');
      const nodes = await subscriptionService.fetchSubscription(subscriptionUrl);

      if (!nodes || nodes.length === 0) {
        throw new Error('订阅链接中没有可用节点');
      }

      // 3. 选择最佳节点
      this.currentNode = subscriptionService.selectBestNode(nodes, preferredNode);

      // 4. 生成 xray 配置
      logger.info('⚙️  生成 Xray 配置...');
      await this.generateXrayConfig(this.currentNode);

      // 5. 启动 xray
      logger.info('🚀 启动 Xray 代理...');
      await this.startXray();

      // 6. 创建代理 Agent
      this.proxyAgent = new SocksProxyAgent(`socks5://127.0.0.1:${this.localPort}`);

      logger.info('✅ 代理服务初始化成功！');
      logger.info(`   节点: ${this.currentNode.name}`);
      logger.info(`   类型: ${this.currentNode.type}`);
      logger.info(`   本地端口: ${this.localPort}`);

      this.emit('ready', this.currentNode);
      return true;
    } catch (error) {
      logger.error('❌ 代理服务初始化失败:', error.message);
      this.emit('error', error);
      throw error;
    }
  }

  /**
   * 生成 Xray 配置文件
   */
  async generateXrayConfig(node) {
    const config = {
      log: {
        loglevel: 'none',
      },
      inbounds: [
        {
          port: this.localPort,
          protocol: 'socks',
          settings: {
            auth: 'noauth',
            udp: true,
          },
        },
      ],
      outbounds: [
        this.generateOutbound(node),
        {
          protocol: 'freedom',
          tag: 'direct',
        },
      ],
    };

    // 确保 data 目录存在
    const dataDir = path.dirname(this.configPath);
    if (!fs.existsSync(dataDir)) {
      fs.mkdirSync(dataDir, { recursive: true });
    }

    // 写入配置文件
    fs.writeFileSync(this.configPath, JSON.stringify(config, null, 2));
    logger.info(`   配置文件: ${this.configPath}`);
  }

  /**
   * 根据节点类型生成 outbound 配置
   */
  generateOutbound(node) {
    const baseOutbound = {
      protocol: node.type,
      tag: 'proxy',
    };

    switch (node.type) {
      case 'vmess':
        return {
          ...baseOutbound,
          settings: {
            vnext: [
              {
                address: node.server,
                port: node.port,
                users: [
                  {
                    id: node.uuid,
                    alterId: node.alterId || 0,
                    security: node.cipher || 'auto',
                  },
                ],
              },
            ],
          },
          streamSettings: this.generateStreamSettings(node),
        };

      case 'vless':
        return {
          ...baseOutbound,
          settings: {
            vnext: [
              {
                address: node.server,
                port: node.port,
                users: [
                  {
                    id: node.uuid,
                    encryption: 'none',
                  },
                ],
              },
            ],
          },
          streamSettings: this.generateStreamSettings(node),
        };

      case 'trojan':
        return {
          ...baseOutbound,
          settings: {
            servers: [
              {
                address: node.server,
                port: node.port,
                password: node.password,
              },
            ],
          },
          streamSettings: {
            network: 'tcp',
            security: 'tls',
            tlsSettings: {
              serverName: node.sni || node.server,
              allowInsecure: false,
            },
          },
        };

      case 'ss':
      case 'shadowsocks':
        return {
          ...baseOutbound,
          protocol: 'shadowsocks',
          settings: {
            servers: [
              {
                address: node.server,
                port: node.port,
                method: node.cipher || node.method,
                password: node.password,
              },
            ],
          },
        };

      default:
        throw new Error(`不支持的代理类型: ${node.type}`);
    }
  }

  /**
   * 生成流设置（WebSocket, TLS 等）
   */
  generateStreamSettings(node) {
    const settings = {
      network: node.network || 'tcp',
    };

    // TLS 配置
    if (node.tls) {
      settings.security = 'tls';
      settings.tlsSettings = {
        serverName: node.sni || node.server,
        allowInsecure: false,
      };
    }

    // WebSocket 配置
    if (node.network === 'ws' && node.ws) {
      settings.wsSettings = {
        path: node.ws.path || '/',
        headers: node.ws.headers || {},
      };
    }

    return settings;
  }

  /**
   * 启动 Xray 进程
   */
  async startXray() {
    return new Promise((resolve, reject) => {
      const xrayPath = xrayDownloader.getXrayPath();

      // 启动 xray
      this.xrayProcess = spawn(xrayPath, ['run', '-c', this.configPath], {
        stdio: ['ignore', 'pipe', 'pipe'],
      });

      // 监听输出
      this.xrayProcess.stdout.on('data', (data) => {
        logger.debug(`[Xray] ${data.toString().trim()}`);
      });

      this.xrayProcess.stderr.on('data', (data) => {
        const message = data.toString().trim();

        // 检查是否启动成功
        if (message.includes('started') || message.includes('listening')) {
          this.isRunning = true;
          logger.info('✅ Xray 启动成功');
          resolve();
        }

        logger.debug(`[Xray] ${message}`);
      });

      // 监听错误
      this.xrayProcess.on('error', (error) => {
        logger.error('❌ Xray 启动失败:', error.message);
        this.isRunning = false;
        reject(error);
      });

      // 监听退出
      this.xrayProcess.on('exit', (code) => {
        this.isRunning = false;
        logger.warn(`⚠️  Xray 进程已退出 (code: ${code})`);
        this.emit('stopped', code);

        // 自动重连机制 - 仅在意外退出时重连
        // code === null 表示被 kill() 杀死（正常停止），不重连
        // code === 0 表示正常退出，不重连
        if (this.shouldReconnect && code !== 0 && code !== null) {
          this.handleReconnect();
        }
      });

      // 2 秒后如果没有错误，认为启动成功
      setTimeout(() => {
        if (this.xrayProcess && !this.xrayProcess.killed) {
          this.isRunning = true;
          logger.info('✅ Xray 启动成功');
          resolve();
        }
      }, 2000);
    });
  }

  /**
   * 停止 Xray
   */
  stopXray() {
    if (this.xrayProcess) {
      logger.info('🛑 停止 Xray 代理...');

      // 禁用自动重连
      this.shouldReconnect = false;

      // 清除重连定时器
      if (this.reconnectTimer) {
        clearTimeout(this.reconnectTimer);
        this.reconnectTimer = null;
      }

      this.xrayProcess.kill();
      this.xrayProcess = null;
      this.isRunning = false;
      this.proxyAgent = null;
      this.reconnectAttempts = 0;

      logger.info('✅ Xray 已停止');
    }
  }

  /**
   * 处理自动重连
   */
  handleReconnect() {
    // 检查重连次数
    if (this.reconnectAttempts >= this.maxReconnectAttempts) {
      logger.error('❌ Xray 重连次数已达上限，停止重连');
      logger.error('   请检查节点配置或网络连接');
      this.emit('reconnect:failed', {
        attempts: this.reconnectAttempts,
        maxAttempts: this.maxReconnectAttempts
      });
      return;
    }

    this.reconnectAttempts++;
    const delay = this.reconnectDelay * this.reconnectAttempts; // 递增延迟

    logger.warn(`🔄 Xray 将在 ${delay / 1000} 秒后尝试重连 (${this.reconnectAttempts}/${this.maxReconnectAttempts})`);

    // 清除之前的定时器
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
    }

    // 延迟重连
    this.reconnectTimer = setTimeout(async () => {
      try {
        logger.info(`🔄 尝试重连 Xray (第 ${this.reconnectAttempts} 次)...`);
        await this.startXray();

        // 重连成功，重置计数器
        this.reconnectAttempts = 0;
        logger.info('✅ Xray 重连成功！');
        this.emit('reconnect:success', { attempts: this.reconnectAttempts });
      } catch (error) {
        logger.error('❌ Xray 重连失败:', error.message);
        this.emit('reconnect:error', { error, attempts: this.reconnectAttempts });

        // 继续重连
        this.handleReconnect();
      }
    }, delay);
  }

  /**
   * 启用自动重连
   */
  enableReconnect() {
    this.shouldReconnect = true;
    this.reconnectAttempts = 0;
    logger.info('✅ 已启用 Xray 自动重连');
  }

  /**
   * 禁用自动重连
   */
  disableReconnect() {
    this.shouldReconnect = false;
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    logger.info('⏸️  已禁用 Xray 自动重连');
  }

  /**
   * 获取代理 Agent（用于 axios 和其他 HTTP 请求）
   */
  getProxyAgent() {
    return this.proxyAgent;
  }

  /**
   * 获取 SOCKS5 代理地址
   */
  getProxyUrl() {
    return `socks5://127.0.0.1:${this.localPort}`;
  }

  /**
   * 获取代理状态
   */
  getStatus() {
    return {
      isRunning: this.isRunning,
      node: this.currentNode ? {
        name: this.currentNode.name,
        type: this.currentNode.type,
        server: this.currentNode.server,
      } : null,
      localPort: this.localPort,
      proxyUrl: this.isRunning ? this.getProxyUrl() : null,
    };
  }

  /**
   * 切换节点
   */
  async switchNode(nodeName) {
    logger.info(`🔄 切换节点: ${nodeName}`);

    const nodes = subscriptionService.getNodes();
    const newNode = subscriptionService.selectBestNode(nodes, nodeName);

    if (!newNode) {
      throw new Error(`节点不存在: ${nodeName}`);
    }

    // 停止当前代理（stopXray 内部会禁用重连）
    this.stopXray();

    // 更新节点
    this.currentNode = newNode;

    // 重新生成配置并启动
    await this.generateXrayConfig(newNode);

    // 重新启用重连机制
    this.shouldReconnect = true;

    await this.startXray();

    // 重建代理 Agent
    this.proxyAgent = new SocksProxyAgent(`socks5://127.0.0.1:${this.localPort}`);

    logger.info(`✅ 已切换到节点: ${newNode.name}`);
    this.emit('node:changed', newNode);
  }
}

export default new ProxyService();
