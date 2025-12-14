import express from 'express';
import storage from '../models/storage.model.js';
import rustPlusService from '../services/rustplus.service.js';
import battlemetricsService from '../services/battlemetrics.service.js';

const router = express.Router();

// 获取所有服务器
router.get('/', (req, res) => {
  try {
    const servers = storage.getAllServers();
    const serversWithStatus = servers.map(server => ({
      ...server,
      connected: rustPlusService.isConnected(server.id)
    }));
    res.json({ success: true, servers: serversWithStatus });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// 获取单个服务器
router.get('/:id', (req, res) => {
  try {
    const server = storage.getServer(req.params.id);
    if (!server) {
      return res.status(404).json({ success: false, error: '服务器不存在' });
    }
    res.json({
      success: true,
      server: {
        ...server,
        connected: rustPlusService.isConnected(server.id)
      }
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// 添加服务器
router.post('/', async (req, res) => {
  try {
    const { id, name, ip, port, playerId, playerToken } = req.body;

    if (!id || !name || !ip || !port || !playerId || !playerToken) {
      return res.status(400).json({ success: false, error: '缺少必要参数' });
    }

    // 类型验证
    if (typeof id !== 'string' || typeof name !== 'string') {
      return res.status(400).json({ success: false, error: 'id 和 name 必须是字符串' });
    }

    // 长度限制
    if (id.length > 100) {
      return res.status(400).json({ success: false, error: 'id 长度不能超过 100 字符' });
    }
    if (name.length > 200) {
      return res.status(400).json({ success: false, error: 'name 长度不能超过 200 字符' });
    }
    if (ip.length > 255) {
      return res.status(400).json({ success: false, error: 'ip 长度不能超过 255 字符' });
    }
    if (String(playerId).length > 50) {
      return res.status(400).json({ success: false, error: 'playerId 长度不能超过 50 字符' });
    }
    if (String(playerToken).length > 100) {
      return res.status(400).json({ success: false, error: 'playerToken 长度不能超过 100 字符' });
    }

    if (typeof ip !== 'string' || !/^[\d.]+$|^[a-zA-Z0-9.-]+$/.test(ip)) {
      return res.status(400).json({ success: false, error: 'ip 格式无效' });
    }
    const portNum = parseInt(port);
    if (isNaN(portNum) || portNum < 1 || portNum > 65535) {
      return res.status(400).json({ success: false, error: 'port 必须是 1-65535 之间的数字' });
    }

    storage.addServer({ id, name, ip, port: String(portNum), playerId, playerToken });
    res.json({ success: true, message: '服务器添加成功' });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// 更新服务器
router.put('/:id', (req, res) => {
  try {
    const { name, ip, port, playerId, playerToken } = req.body;
    const updates = {};

    if (name) updates.name = name;
    if (ip) updates.ip = ip;
    if (port) updates.port = port;
    if (playerId) updates.player_id = playerId;
    if (playerToken) updates.player_token = playerToken;

    storage.updateServer(req.params.id, updates);
    res.json({ success: true, message: '服务器更新成功' });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// 删除服务器
router.delete('/:id', async (req, res) => {
  try {
    const serverId = req.params.id;
    console.log(`🗑️ 删除服务器请求: ${serverId}`);

    // 先检查服务器是否存在
    const server = storage.getServer(serverId);
    if (!server) {
      console.log(`❌ 服务器不存在: ${serverId}`);
      return res.status(404).json({
        success: false,
        error: '服务器不存在'
      });
    }

    // 先断开连接（如果已连接）
    if (rustPlusService.isConnected(serverId)) {
      console.log(`   - 服务器已连接，正在断开...`);
      try {
        // 断开连接并清理配置
        await rustPlusService.disconnect(serverId);
        console.log(`   - 断开成功`);
      } catch (disconnectError) {
        console.error(`❌ 断开连接失败:`, disconnectError);
        // 继续删除，即使断开失败
      }
    } else {
      // 即使未连接，也要清理服务器配置
      console.log(`   - 服务器未连接，清理配置...`);
      await rustPlusService.disconnect(serverId);
    }

    // 从数据库删除
    console.log(`   - 正在从数据库删除...`);
    const result = storage.deleteServer(serverId);
    console.log(`   - 删除结果:`, result);

    if (result.changes === 0) {
      console.log(`⚠️ 没有删除任何记录`);
      return res.status(404).json({
        success: false,
        error: '删除失败，服务器可能已被删除'
      });
    }

    console.log(`✅ 服务器删除成功: ${serverId}`);
    res.json({ success: true, message: '服务器删除成功' });
  } catch (error) {
    console.error(`❌ 删除服务器失败:`, error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// 获取服务器设备列表
router.get('/:id/devices', (req, res) => {
  try {
    const devices = storage.getDevicesByServer(req.params.id);
    res.json({ success: true, devices });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// 添加设备
router.post('/:id/devices', (req, res) => {
  try {
    const { entityId, name, type } = req.body;
    const serverId = req.params.id;

    if (!entityId || !name) {
      return res.status(400).json({ success: false, error: '缺少必要参数' });
    }

    // 长度限制
    if (name.length > 100) {
      return res.status(400).json({ success: false, error: '设备名称长度不能超过 100 字符' });
    }
    if (type && type.length > 50) {
      return res.status(400).json({ success: false, error: '设备类型长度不能超过 50 字符' });
    }

    // entityId 类型验证
    const entityIdNum = parseInt(entityId);
    if (isNaN(entityIdNum) || entityIdNum < 0) {
      return res.status(400).json({ success: false, error: 'entityId 必须是非负整数' });
    }

    storage.addDevice({ serverId, entityId: entityIdNum, name, type });
    res.json({ success: true, message: '设备添加成功' });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// 删除设备
router.delete('/:id/devices/:entityId', (req, res) => {
  try {
    const { id, entityId } = req.params;
    const entityIdNum = parseInt(entityId);

    if (isNaN(entityIdNum) || entityIdNum < 0) {
      return res.status(400).json({ success: false, error: 'entityId 必须是非负整数' });
    }

    storage.deleteDevice(id, entityIdNum);
    res.json({ success: true, message: '设备删除成功' });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// 获取事件日志
router.get('/:id/events', (req, res) => {
  try {
    const limit = parseInt(req.query.limit) || 100;

    // 验证 limit 范围
    if (limit < 1 || limit > 1000) {
      return res.status(400).json({ success: false, error: 'limit 必须在 1-1000 之间' });
    }

    const events = storage.getEventLogs(req.params.id, limit);
    res.json({ success: true, events });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// 获取 Battlemetrics 详细信息
router.get('/:id/battlemetrics', async (req, res) => {
  try {
    const server = storage.getServer(req.params.id);
    if (!server) {
      return res.status(404).json({ success: false, error: '服务器不存在' });
    }

    let battlemetricsId = server.battlemetrics_id;

    // 如果没有保存的 Battlemetrics ID，尝试查找
    if (!battlemetricsId) {
      battlemetricsId = await battlemetricsService.searchServerByAddress(server.ip, server.port);
      
      if (battlemetricsId) {
        // 保存找到的 ID
        storage.updateServer(req.params.id, { battlemetrics_id: battlemetricsId });
      } else {
        return res.status(404).json({ 
          success: false, 
          error: '未找到 Battlemetrics 信息' 
        });
      }
    }

    // 获取详细信息
    const bmInfo = await battlemetricsService.getServerInfo(battlemetricsId);
    
    if (!bmInfo) {
      return res.status(500).json({ 
        success: false, 
        error: '获取 Battlemetrics 信息失败' 
      });
    }

    res.json({ success: true, data: bmInfo });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// 获取服务器玩家排行
router.get('/:id/battlemetrics/top-players', async (req, res) => {
  try {
    const server = storage.getServer(req.params.id);
    if (!server || !server.battlemetrics_id) {
      return res.status(404).json({ success: false, error: '服务器不存在或未关联 Battlemetrics' });
    }

    const days = parseInt(req.query.days) || 30;

    // 验证 days 范围
    if (days < 1 || days > 365) {
      return res.status(400).json({ success: false, error: 'days 必须在 1-365 之间' });
    }

    const players = await battlemetricsService.getTopPlayers(server.battlemetrics_id, days);

    res.json({ success: true, players });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * 获取 Rust+ 连接设置
 */
router.get('/settings/connection', (req, res) => {
  try {
    res.json({
      success: true,
      settings: {
        useFacepunchProxy: rustPlusService.useFacepunchProxy,
        description: rustPlusService.useFacepunchProxy
          ? '通过 Facepunch 官方代理 (wss://companion-rust.facepunch.com)'
          : '直连游戏服务器 (ws://IP:PORT)'
      }
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * 设置 Rust+ 连接模式
 * @body {boolean} useFacepunchProxy - 是否使用 Facepunch 代理
 */
router.post('/settings/connection', (req, res) => {
  try {
    const { useFacepunchProxy } = req.body;

    if (typeof useFacepunchProxy !== 'boolean') {
      return res.status(400).json({ success: false, error: 'useFacepunchProxy 必须是布尔值' });
    }

    rustPlusService.setUseFacepunchProxy(useFacepunchProxy);

    res.json({
      success: true,
      message: useFacepunchProxy
        ? '已切换到 Facepunch 代理模式（需要重新连接服务器生效）'
        : '已切换到直连模式（需要重新连接服务器生效）',
      settings: {
        useFacepunchProxy: rustPlusService.useFacepunchProxy
      }
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

export default router;
