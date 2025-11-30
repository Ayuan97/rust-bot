import EventEmitter from 'events';
import axios from 'axios';
import yaml from 'js-yaml';
import logger from '../utils/logger.js';

/**
 * 订阅解析服务
 * 支持 Clash YAML 格式和 Base64 编码的订阅链接
 */
class SubscriptionService extends EventEmitter {
  constructor() {
    super();
    this.nodes = [];
    this.subscriptionUrl = null;
  }

  /**
   * 从订阅链接获取节点列表
   * @param {string} subscriptionUrl - 订阅链接
   * @returns {Promise<Array>} 节点列表
   */
  async fetchSubscription(subscriptionUrl) {
    try {
      logger.info('🔗 正在获取订阅链接...');
      logger.info(`   URL: ${subscriptionUrl.substring(0, 50)}...`);

      // 获取订阅内容
      const response = await axios.get(subscriptionUrl, {
        headers: {
          'User-Agent': 'ClashX/1.96.0',
        },
        timeout: 30000,
      });

      const content = response.data;

      // 尝试解析为 YAML (Clash 格式)
      if (typeof content === 'string' && (content.includes('proxies:') || content.includes('Proxy:'))) {
        logger.info('📋 检测到 Clash YAML 格式');
        return this.parseClashYaml(content);
      }

      // 尝试解析为 Base64 (V2Ray/SS 格式)
      if (typeof content === 'string' && this.isBase64(content)) {
        logger.info('📋 检测到 Base64 编码格式');
        return this.parseBase64Subscription(content);
      }

      // 如果是对象，可能已经是 JSON 格式
      if (typeof content === 'object' && content.proxies) {
        logger.info('📋 检测到 JSON 格式');
        return this.normalizeProxies(content.proxies);
      }

      throw new Error('无法识别的订阅格式');
    } catch (error) {
      logger.error('❌ 获取订阅失败:', error.message);
      throw error;
    }
  }

  /**
   * 解析 Clash YAML 格式订阅
   */
  parseClashYaml(yamlContent) {
    try {
      const config = yaml.load(yamlContent);

      if (!config.proxies && !config.Proxy) {
        throw new Error('YAML 中未找到 proxies 字段');
      }

      const proxies = config.proxies || config.Proxy;
      const nodes = this.normalizeProxies(proxies);

      logger.info(`✅ 成功解析 ${nodes.length} 个节点`);
      this.nodes = nodes;
      return nodes;
    } catch (error) {
      logger.error('❌ 解析 Clash YAML 失败:', error.message);
      throw error;
    }
  }

  /**
   * 解析 Base64 编码订阅 (V2Ray/SS 格式)
   */
  parseBase64Subscription(base64Content) {
    try {
      const decoded = Buffer.from(base64Content.trim(), 'base64').toString('utf-8');
      const lines = decoded.split('\n').filter(line => line.trim());

      const nodes = [];
      for (const line of lines) {
        try {
          const node = this.parseProxyUri(line.trim());
          if (node) {
            nodes.push(node);
          }
        } catch (err) {
          logger.debug(`⚠️  跳过无效节点: ${line.substring(0, 30)}...`);
        }
      }

      logger.info(`✅ 成功解析 ${nodes.length} 个节点`);
      this.nodes = nodes;
      return nodes;
    } catch (error) {
      logger.error('❌ 解析 Base64 订阅失败:', error.message);
      throw error;
    }
  }

  /**
   * 解析代理 URI (vmess://, ss://, trojan://, etc.)
   */
  parseProxyUri(uri) {
    if (uri.startsWith('vmess://')) {
      return this.parseVmessUri(uri);
    } else if (uri.startsWith('ss://')) {
      return this.parseShadowsocksUri(uri);
    } else if (uri.startsWith('trojan://')) {
      return this.parseTrojanUri(uri);
    } else if (uri.startsWith('vless://')) {
      return this.parseVlessUri(uri);
    }
    return null;
  }

  /**
   * 解析 VMess URI
   */
  parseVmessUri(uri) {
    try {
      const base64Data = uri.replace('vmess://', '');
      const config = JSON.parse(Buffer.from(base64Data, 'base64').toString('utf-8'));

      return {
        name: config.ps || config.remark || 'VMess节点',
        type: 'vmess',
        server: config.add,
        port: parseInt(config.port),
        uuid: config.id,
        alterId: parseInt(config.aid || 0),
        cipher: config.scy || 'auto',
        network: config.net || 'tcp',
        tls: config.tls === 'tls',
        ws: config.net === 'ws' ? { path: config.path, headers: { Host: config.host } } : undefined,
      };
    } catch (error) {
      logger.debug('解析 VMess 失败:', error.message);
      return null;
    }
  }

  /**
   * 解析 Shadowsocks URI
   */
  parseShadowsocksUri(uri) {
    try {
      // ss://method:password@server:port#name
      const url = new URL(uri);
      const auth = Buffer.from(url.username, 'base64').toString('utf-8');
      const [method, password] = auth.split(':');

      return {
        name: decodeURIComponent(url.hash.substring(1)) || 'SS节点',
        type: 'ss',
        server: url.hostname,
        port: parseInt(url.port),
        cipher: method,
        password: password,
      };
    } catch (error) {
      logger.debug('解析 Shadowsocks 失败:', error.message);
      return null;
    }
  }

  /**
   * 解析 Trojan URI
   */
  parseTrojanUri(uri) {
    try {
      // trojan://password@server:port#name
      const url = new URL(uri);

      return {
        name: decodeURIComponent(url.hash.substring(1)) || 'Trojan节点',
        type: 'trojan',
        server: url.hostname,
        port: parseInt(url.port),
        password: url.username,
        sni: url.searchParams.get('sni') || url.hostname,
      };
    } catch (error) {
      logger.debug('解析 Trojan 失败:', error.message);
      return null;
    }
  }

  /**
   * 解析 VLESS URI
   */
  parseVlessUri(uri) {
    try {
      const url = new URL(uri);

      return {
        name: decodeURIComponent(url.hash.substring(1)) || 'VLESS节点',
        type: 'vless',
        server: url.hostname,
        port: parseInt(url.port),
        uuid: url.username,
        network: url.searchParams.get('type') || 'tcp',
        tls: url.searchParams.get('security') === 'tls',
      };
    } catch (error) {
      logger.debug('解析 VLESS 失败:', error.message);
      return null;
    }
  }

  /**
   * 标准化代理节点格式
   */
  normalizeProxies(proxies) {
    return proxies
      .filter(proxy => {
        // 过滤掉非代理节点（如 DIRECT, REJECT）
        const validTypes = ['vmess', 'vless', 'trojan', 'ss', 'ssr', 'socks5', 'http'];
        return validTypes.includes(proxy.type?.toLowerCase());
      })
      .map(proxy => ({
        name: proxy.name || '未命名节点',
        type: proxy.type.toLowerCase(),
        server: proxy.server,
        port: proxy.port,
        ...proxy, // 保留其他字段
      }));
  }

  /**
   * 检查是否为 Base64 编码
   */
  isBase64(str) {
    try {
      return Buffer.from(str, 'base64').toString('base64') === str;
    } catch {
      return false;
    }
  }

  /**
   * 选择最佳节点（目前简单选择第一个可用节点）
   * 未来可以实现延迟测试
   */
  selectBestNode(nodes, preferredName = null) {
    if (!nodes || nodes.length === 0) {
      throw new Error('没有可用节点');
    }

    // 如果指定了节点名称，优先使用
    if (preferredName) {
      const found = nodes.find(node => node.name.includes(preferredName));
      if (found) {
        logger.info(`✅ 使用指定节点: ${found.name}`);
        return found;
      }
      logger.warn(`⚠️  未找到节点 "${preferredName}"，使用第一个可用节点`);
    }

    // 优先选择支持的协议
    const preferredTypes = ['vmess', 'vless', 'trojan', 'ss'];
    for (const type of preferredTypes) {
      const node = nodes.find(n => n.type === type);
      if (node) {
        logger.info(`✅ 自动选择节点: ${node.name} (${node.type})`);
        return node;
      }
    }

    // 否则返回第一个
    logger.info(`✅ 使用第一个节点: ${nodes[0].name}`);
    return nodes[0];
  }

  /**
   * 获取当前节点列表
   */
  getNodes() {
    return this.nodes;
  }
}

export default new SubscriptionService();
