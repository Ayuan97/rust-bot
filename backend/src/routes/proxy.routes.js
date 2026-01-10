/**
 * 代理路由（多租户版本）
 *
 * 注意：代理服务是全局配置，所有用户共享同一个代理
 * - 查看状态：所有登录用户可访问
 * - 配置管理：仅管理员可访问
 */

import express from 'express';
import { PrismaClient } from '@prisma/client';
import { authenticate, requireAdmin } from '../middleware/auth.middleware.js';
import proxyService from '../services/proxy.service.js';
import subscriptionService from '../services/subscription.service.js';
import websocketService from '../services/websocket.service.js';
import globalServiceManager from '../services/global-manager.service.js';
import battlemetricsService from '../services/battlemetrics.service.js';
import logger from '../utils/logger.js';

const router = express.Router();
const prisma = new PrismaClient();

// 所有路由都需要认证
router.use(authenticate);

/**
 * GET /api/proxy/status
 * 获取代理状态（所有用户可访问）
 */
router.get('/status', async (req, res) => {
  try {
    const status = proxyService.getStatus();

    // 从数据库获取代理配置（全局配置）
    const proxyConfig = await prisma.proxy_config.findUnique({
      where: { id: 1 }
    });

    res.json({
      success: true,
      data: {
        ...status,
        subscriptionUrl: proxyConfig?.subscriptionUrl ? '******' : null, // 隐藏敏感信息
        hasConfig: !!proxyConfig?.subscriptionUrl,
        autoStart: proxyConfig?.autoStart ?? true,
        proxyPort: proxyConfig?.proxyPort || 10808
      }
    });
  } catch (error) {
    logger.error('获取代理状态失败:', error.message);
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * GET /api/proxy/nodes
 * 获取节点列表（所有用户可访问）
 */
router.get('/nodes', (req, res) => {
  try {
    // 从内存获取节点列表
    let nodes = subscriptionService.getNodes();

    // 如果内存中没有，返回空数组
    if (!nodes) {
      nodes = [];
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
 * 保存代理配置（仅管理员）
 */
router.post('/config', requireAdmin, async (req, res) => {
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
    logger.info(`🔗 管理员 ${req.user.username} 正在验证订阅链接...`);
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

    // 如果代理正在运行，先停止
    if (wasRunning) {
      logger.info('🔄 代理正在运行，先停止旧连接...');
      proxyService.stopXray();
    }

    // 保存配置到数据库（全局配置）
    await prisma.proxy_config.upsert({
      where: { id: 1 },
      update: {
        subscriptionUrl,
        selectedNode: selectedNode || null,
        proxyPort: proxyPort || 10808,
        autoStart: autoStart !== false,
        updatedAt: new Date()
      },
      create: {
        id: 1,
        subscriptionUrl,
        selectedNode: selectedNode || null,
        proxyPort: proxyPort || 10808,
        autoStart: autoStart !== false
      }
    });

    logger.info(`✅ 管理员 ${req.user.username} 已保存代理配置`);

    // 如果之前在运行，自动用新配置重启
    let restartResult = null;
    if (wasRunning) {
      try {
        logger.info('🚀 使用新配置重启代理...');
        await proxyService.initialize(subscriptionUrl, selectedNode);

        // 更新各服务的代理配置
        const proxyAgent = proxyService.getProxyAgent();
        const portNum = proxyPort || 10808;
        battlemetricsService.setProxyAgent(proxyAgent);
        
        // 同步到所有用户的实时服务
        globalServiceManager.refreshAllUserProxySettings();

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

    // 广播配置更新事件（发送给所有用户）
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
 * 启动代理服务（仅管理员）
 */
router.post('/start', requireAdmin, async (req, res) => {
  try {
    const { nodeName } = req.body;

    // 从数据库获取配置
    const proxyConfig = await prisma.proxy_config.findUnique({
      where: { id: 1 }
    });

    if (!proxyConfig?.subscriptionUrl) {
      return res.status(400).json({ success: false, error: '请先配置订阅链接' });
    }

    // 如果已经在运行，先停止
    if (proxyService.isRunning) {
      proxyService.stopXray();
    }

    logger.info(`🚀 管理员 ${req.user.username} 正在启动代理...`);

    // 启动代理
    await proxyService.initialize(
      proxyConfig.subscriptionUrl,
      nodeName || proxyConfig.selectedNode
    );

    // 更新各服务的代理 Agent
    const proxyAgent = proxyService.getProxyAgent();
    const portNum = proxyConfig.proxyPort || 10808;
    battlemetricsService.setProxyAgent(proxyAgent);
    
    // 同步到所有用户的实时服务
    globalServiceManager.refreshAllUserProxySettings();

    // 更新选中的节点
    if (proxyService.currentNode) {
      await prisma.proxy_config.update({
        where: { id: 1 },
        data: { selectedNode: proxyService.currentNode.name }
      });
    }

    logger.info(`✅ 代理已启动，节点: ${proxyService.currentNode?.name}`);

    // 广播状态更新（发送给所有用户）
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
 * 停止代理服务（仅管理员）
 */
router.post('/stop', requireAdmin, (req, res) => {
  try {
    logger.info(`🛑 管理员 ${req.user.username} 停止代理服务`);

    proxyService.stopXray();

    // 广播状态更新（发送给所有用户）
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
 * 切换节点（仅管理员）
 */
router.post('/switch', requireAdmin, async (req, res) => {
  try {
    const { nodeName } = req.body;

    if (!nodeName) {
      return res.status(400).json({ success: false, error: '请指定节点名称' });
    }

    if (!proxyService.isRunning) {
      return res.status(400).json({ success: false, error: '代理未运行，请先启动' });
    }

    logger.info(`🔄 管理员 ${req.user.username} 切换代理节点到: ${nodeName}`);

    // 切换代理节点
    await proxyService.switchNode(nodeName);

    // 更新各服务的代理 Agent
    const proxyAgent = proxyService.getProxyAgent();
    battlemetricsService.setProxyAgent(proxyAgent);
    
    // 同步到所有用户的实时服务
    globalServiceManager.refreshAllUserProxySettings();

    // 更新数据库中的选中节点
    await prisma.proxy_config.update({
      where: { id: 1 },
      data: { selectedNode: nodeName }
    });

    logger.info(`✅ 节点已切换到: ${nodeName}`);

    // 广播节点切换事件（发送给所有用户）
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
 * 刷新订阅（重新拉取节点列表）（仅管理员）
 */
router.post('/refresh', requireAdmin, async (req, res) => {
  try {
    // 从数据库获取配置
    const proxyConfig = await prisma.proxy_config.findUnique({
      where: { id: 1 }
    });

    if (!proxyConfig?.subscriptionUrl) {
      return res.status(400).json({ success: false, error: '请先配置订阅链接' });
    }

    logger.info(`🔄 管理员 ${req.user.username} 刷新订阅节点...`);
    const nodes = await subscriptionService.fetchSubscription(proxyConfig.subscriptionUrl);

    if (!nodes || nodes.length === 0) {
      return res.status(400).json({ success: false, error: '订阅链接中没有可用节点' });
    }

    logger.info(`✅ 已刷新，获取到 ${nodes.length} 个节点`);

    // 广播节点更新事件（发送给所有用户）
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
 * 清除代理配置（仅管理员）
 */
router.delete('/config', requireAdmin, async (req, res) => {
  try {
    logger.info(`🗑️  管理员 ${req.user.username} 清除代理配置`);

    // 先停止代理
    if (proxyService.isRunning) {
      proxyService.stopXray();
    }

    // 删除配置
    await prisma.proxy_config.deleteMany({
      where: { id: 1 }
    });

    // 广播配置清除事件（发送给所有用户）
    websocketService.broadcast('proxy:config:deleted', {});

    res.json({ success: true, message: '代理配置已清除' });
  } catch (error) {
    logger.error('清除代理配置失败:', error.message);
    res.status(500).json({ success: false, error: error.message });
  }
});

export default router;
