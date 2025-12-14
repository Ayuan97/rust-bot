import express from 'express';
import proxyService from '../services/proxy.service.js';
import subscriptionService from '../services/subscription.service.js';
import configStorage from '../models/config.model.js';
import websocketService from '../services/websocket.service.js';
import battlemetricsService from '../services/battlemetrics.service.js';
import rustPlusService from '../services/rustplus.service.js';
import logger from '../utils/logger.js';

const router = express.Router();

/**
 * GET /api/proxy/status
 * 获取代理状态
 */
router.get('/status', (req, res) => {
  try {
    const status = proxyService.getStatus();
    const config = configStorage.getProxyConfig();

    res.json({
      success: true,
      data: {
        ...status,
        subscriptionUrl: config?.subscriptionUrl ? '******' : null, // 隐藏敏感信息
        hasConfig: !!config?.subscriptionUrl,
        autoStart: config?.autoStart ?? true,
        proxyPort: config?.proxyPort || 10808
      }
    });
  } catch (error) {
    logger.error('获取代理状态失败:', error.message);
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * GET /api/proxy/nodes
 * 获取节点列表
 */
router.get('/nodes', (req, res) => {
  try {
    // 优先从内存获取（最新）
    let nodes = subscriptionService.getNodes();

    // 如果内存中没有，从数据库加载
    if (!nodes || nodes.length === 0) {
      const config = configStorage.getProxyConfig();
      nodes = config?.nodes || [];
    }

    // 获取当前选中的节点
    const currentNode = proxyService.currentNode;

    res.json({
      success: true,
      data: {
        nodes: nodes.map(node => ({
          name: node.name,
          type: node.type,
          server: node.server,
          port: node.port,
          isActive: currentNode?.name === node.name
        })),
        currentNode: currentNode?.name || null
      }
    });
  } catch (error) {
    logger.error('获取节点列表失败:', error.message);
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * POST /api/proxy/config
 * 保存代理配置
 */
router.post('/config', async (req, res) => {
  try {
    const { subscriptionUrl, selectedNode, proxyPort, autoStart } = req.body;

    if (!subscriptionUrl) {
      return res.status(400).json({ success: false, error: '订阅链接不能为空' });
    }

    // 验证订阅链接格式
    try {
      new URL(subscriptionUrl);
    } catch {
      return res.status(400).json({ success: false, error: '订阅链接格式无效' });
    }

    // 尝试获取节点列表（验证订阅链接有效性）
    logger.info('🔗 验证订阅链接...');
    let nodes;
    try {
      nodes = await subscriptionService.fetchSubscription(subscriptionUrl);
      if (!nodes || nodes.length === 0) {
        return res.status(400).json({ success: false, error: '订阅链接中没有可用节点' });
      }
    } catch (fetchError) {
      return res.status(400).json({
        success: false,
        error: `获取订阅失败: ${fetchError.message}`
      });
    }

    // 记录代理是否正在运行（用于自动重启）
    const wasRunning = proxyService.isRunning;

    // 获取 FCM 服务
    const fcmService = (await import('../services/fcm.service.js')).default;
    const fcmWasListening = fcmService.isListening;

    // 如果代理正在运行，先停止 FCM 和代理
    if (wasRunning) {
      logger.info('🔄 代理正在运行，先停止旧连接...');

      // 先停止 FCM 监听（避免连接循环）
      if (fcmWasListening) {
        logger.info('🔄 暂停 FCM 监听...');
        fcmService.stopListening();
      }

      proxyService.stopXray();
    }

    // 保存配置
    configStorage.saveProxyConfig({
      subscriptionUrl,
      selectedNode: selectedNode || null,
      proxyPort: proxyPort || 10808,
      autoStart: autoStart !== false,
      nodes
    });

    logger.info('✅ 代理配置已保存');

    // 如果之前在运行，自动用新配置重启
    let restartResult = null;
    if (wasRunning) {
      try {
        logger.info('🚀 使用新配置重启代理...');
        await proxyService.initialize(subscriptionUrl, selectedNode);

        // 更新各服务的代理配置
        const proxyAgent = proxyService.getProxyAgent();
        const portNum = proxyPort || 10808;
        fcmService.setProxyAgent(proxyAgent);
        fcmService.setProxyConfig({ host: '127.0.0.1', port: portNum });
        battlemetricsService.setProxyAgent(proxyAgent);
        rustPlusService.setProxyConfig({ host: '127.0.0.1', port: portNum });

        // 如果 FCM 之前在监听，延迟重新启动
        if (fcmWasListening && fcmService.credentials) {
          logger.info('🔄 代理重启完成，重新启动 FCM 监听...');
          setTimeout(async () => {
            try {
              await fcmService.startListening();
              logger.info('✅ FCM 监听已恢复');
            } catch (error) {
              logger.error('❌ FCM 监听恢复失败:', error.message);
            }
          }, 1000);
        }

        restartResult = {
          restarted: true,
          node: proxyService.currentNode ? {
            name: proxyService.currentNode.name,
            type: proxyService.currentNode.type
          } : null
        };
        logger.info('✅ 代理已使用新配置重启');
      } catch (restartError) {
        logger.error('❌ 重启代理失败:', restartError.message);
        restartResult = {
          restarted: false,
          error: restartError.message
        };
      }
    }

    // 广播配置更新事件
    websocketService.broadcast('proxy:config:updated', {
      hasConfig: true,
      nodeCount: nodes.length
    });

    // 如果重启了，广播状态更新
    if (restartResult?.restarted) {
      websocketService.broadcast('proxy:status', {
        isRunning: true,
        node: restartResult.node
      });
    }

    res.json({
      success: true,
      message: wasRunning
        ? (restartResult?.restarted ? '配置已保存，代理已重启' : `配置已保存，但重启失败: ${restartResult?.error}`)
        : '配置已保存',
      data: {
        nodeCount: nodes.length,
        nodes: nodes.map(n => ({ name: n.name, type: n.type })),
        wasRunning,
        restartResult
      }
    });
  } catch (error) {
    logger.error('保存代理配置失败:', error.message);
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * POST /api/proxy/start
 * 启动代理服务
 */
router.post('/start', async (req, res) => {
  try {
    const { nodeName } = req.body;
    const config = configStorage.getProxyConfig();

    if (!config?.subscriptionUrl) {
      return res.status(400).json({ success: false, error: '请先配置订阅链接' });
    }

    // 如果已经在运行，先停止
    if (proxyService.isRunning) {
      proxyService.stopXray();
    }

    // 启动代理
    await proxyService.initialize(
      config.subscriptionUrl,
      nodeName || config.selectedNode
    );

    // 更新各服务的代理 Agent
    const proxyAgent = proxyService.getProxyAgent();
    const portNum = config.proxyPort || 10808;
    const fcmService = (await import('../services/fcm.service.js')).default;
    fcmService.setProxyAgent(proxyAgent);
    fcmService.setProxyConfig({ host: '127.0.0.1', port: portNum });
    battlemetricsService.setProxyAgent(proxyAgent);
    rustPlusService.setProxyConfig({ host: '127.0.0.1', port: portNum });

    // 更新选中的节点
    if (proxyService.currentNode) {
      configStorage.updateSelectedNode(proxyService.currentNode.name);
    }

    // 更新节点缓存
    const nodes = subscriptionService.getNodes();
    if (nodes && nodes.length > 0) {
      configStorage.updateProxyNodes(nodes);
    }

    // 广播状态更新
    websocketService.broadcast('proxy:status', {
      isRunning: true,
      node: proxyService.currentNode ? {
        name: proxyService.currentNode.name,
        type: proxyService.currentNode.type
      } : null
    });

    res.json({
      success: true,
      message: '代理已启动',
      data: proxyService.getStatus()
    });
  } catch (error) {
    logger.error('启动代理失败:', error.message);

    // 广播错误
    websocketService.broadcast('proxy:error', {
      message: error.message
    });

    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * POST /api/proxy/stop
 * 停止代理服务
 */
router.post('/stop', (req, res) => {
  try {
    proxyService.stopXray();

    // 广播状态更新
    websocketService.broadcast('proxy:status', {
      isRunning: false,
      node: null
    });

    res.json({ success: true, message: '代理已停止' });
  } catch (error) {
    logger.error('停止代理失败:', error.message);
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * POST /api/proxy/switch
 * 切换节点
 */
router.post('/switch', async (req, res) => {
  try {
    const { nodeName } = req.body;

    if (!nodeName) {
      return res.status(400).json({ success: false, error: '请指定节点名称' });
    }

    if (!proxyService.isRunning) {
      return res.status(400).json({ success: false, error: '代理未运行，请先启动' });
    }

    // 切换节点前，先停止 FCM 监听（避免连接循环）
    const fcmService = (await import('../services/fcm.service.js')).default;
    const wasListening = fcmService.isListening;
    if (wasListening) {
      logger.info('🔄 切换节点前暂停 FCM 监听...');
      fcmService.stopListening();
    }

    // 切换代理节点
    await proxyService.switchNode(nodeName);

    // 更新各服务的代理 Agent
    const proxyAgent = proxyService.getProxyAgent();
    const config = configStorage.getProxyConfig();
    const portNum = config?.proxyPort || 10808;
    fcmService.setProxyAgent(proxyAgent);
    battlemetricsService.setProxyAgent(proxyAgent);
    rustPlusService.setProxyConfig({ host: '127.0.0.1', port: portNum });

    // 如果之前在监听，重新启动 FCM
    if (wasListening && fcmService.credentials) {
      logger.info('🔄 代理切换完成，重新启动 FCM 监听...');
      // 延迟一点启动，确保代理完全就绪
      setTimeout(async () => {
        try {
          await fcmService.startListening();
          logger.info('✅ FCM 监听已恢复');
        } catch (error) {
          logger.error('❌ FCM 监听恢复失败:', error.message);
        }
      }, 1000);
    }

    // 更新数据库中的选中节点
    configStorage.updateSelectedNode(nodeName);

    // 广播节点切换事件
    websocketService.broadcast('proxy:node:changed', {
      nodeName: proxyService.currentNode?.name,
      nodeType: proxyService.currentNode?.type
    });

    res.json({
      success: true,
      message: `已切换到节点: ${nodeName}`,
      data: {
        currentNode: proxyService.currentNode?.name
      }
    });
  } catch (error) {
    logger.error('切换节点失败:', error.message);
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * POST /api/proxy/refresh
 * 刷新订阅（重新拉取节点列表）
 */
router.post('/refresh', async (req, res) => {
  try {
    const config = configStorage.getProxyConfig();

    if (!config?.subscriptionUrl) {
      return res.status(400).json({ success: false, error: '请先配置订阅链接' });
    }

    logger.info('🔄 刷新订阅节点...');
    const nodes = await subscriptionService.fetchSubscription(config.subscriptionUrl);

    if (!nodes || nodes.length === 0) {
      return res.status(400).json({ success: false, error: '订阅链接中没有可用节点' });
    }

    // 更新数据库中的节点缓存
    configStorage.updateProxyNodes(nodes);

    // 广播节点更新事件
    websocketService.broadcast('proxy:nodes:updated', {
      nodeCount: nodes.length
    });

    res.json({
      success: true,
      message: `已刷新，获取到 ${nodes.length} 个节点`,
      data: {
        nodes: nodes.map(n => ({ name: n.name, type: n.type }))
      }
    });
  } catch (error) {
    logger.error('刷新订阅失败:', error.message);
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * DELETE /api/proxy/config
 * 清除代理配置
 */
router.delete('/config', (req, res) => {
  try {
    // 先停止代理
    if (proxyService.isRunning) {
      proxyService.stopXray();
    }

    // 删除配置
    configStorage.deleteProxyConfig();

    // 广播配置清除事件
    websocketService.broadcast('proxy:config:deleted', {});

    res.json({ success: true, message: '代理配置已清除' });
  } catch (error) {
    logger.error('清除代理配置失败:', error.message);
    res.status(500).json({ success: false, error: error.message });
  }
});

export default router;
