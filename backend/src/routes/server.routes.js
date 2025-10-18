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

    storage.addServer({ id, name, ip, port, playerId, playerToken });
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

    // 先断开连接
    if (rustPlusService.isConnected(serverId)) {
      await rustPlusService.disconnect(serverId);
    }

    storage.deleteServer(serverId);
    res.json({ success: true, message: '服务器删除成功' });
  } catch (error) {
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

    storage.addDevice({ serverId, entityId, name, type });
    res.json({ success: true, message: '设备添加成功' });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// 删除设备
router.delete('/:id/devices/:entityId', (req, res) => {
  try {
    const { id, entityId } = req.params;
    storage.deleteDevice(id, parseInt(entityId));
    res.json({ success: true, message: '设备删除成功' });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// 获取事件日志
router.get('/:id/events', (req, res) => {
  try {
    const limit = parseInt(req.query.limit) || 100;
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
    const players = await battlemetricsService.getTopPlayers(server.battlemetrics_id, days);

    res.json({ success: true, players });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

export default router;
