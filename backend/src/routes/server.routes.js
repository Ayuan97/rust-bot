/**
 * 服务器路由（多租户版本）
 * 所有操作都需要认证并与用户 ID 关联
 */

import express from 'express';
import { PrismaClient } from '@prisma/client';
import { authenticate } from '../middleware/auth.middleware.js';
import rustPlusService from '../services/rustplus.service.js';
import battlemetricsService from '../services/battlemetrics.service.js';

const router = express.Router();
const prisma = new PrismaClient();

// 所有路由都需要认证
router.use(authenticate);

// ============================================================
// 服务器管理
// ============================================================

/**
 * GET /api/servers
 * 获取当前用户的所有服务器
 */
router.get('/', async (req, res) => {
  try {
    const servers = await prisma.server.findMany({
      where: {
        userId: req.user.id
      },
      orderBy: {
        createdAt: 'desc'
      }
    });

    // 添加连接状态
    const serversWithStatus = servers.map(server => ({
      id: server.id,
      name: server.name,
      ip: server.ip,
      port: server.port,
      playerId: server.playerId,
      playerToken: server.playerToken,
      battlemetricsId: server.battlemetricsId,
      img: server.img,
      logo: server.logo,
      url: server.url,
      description: server.description,
      isActive: server.isActive,
      createdAt: server.createdAt,
      connected: rustPlusService.isConnected(server.id)
    }));

    res.json({ success: true, servers: serversWithStatus });
  } catch (error) {
    console.error('获取服务器列表失败:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * GET /api/servers/:id
 * 获取单个服务器详情
 */
router.get('/:id', async (req, res) => {
  try {
    const server = await prisma.server.findFirst({
      where: {
        id: req.params.id,
        userId: req.user.id // 确保服务器属于当前用户
      }
    });

    if (!server) {
      return res.status(404).json({ success: false, error: '服务器不存在' });
    }

    res.json({
      success: true,
      server: {
        id: server.id,
        name: server.name,
        ip: server.ip,
        port: server.port,
        playerId: server.playerId,
        playerToken: server.playerToken,
        battlemetricsId: server.battlemetricsId,
        img: server.img,
        logo: server.logo,
        url: server.url,
        description: server.description,
        isActive: server.isActive,
        createdAt: server.createdAt,
        connected: rustPlusService.isConnected(server.id)
      }
    });
  } catch (error) {
    console.error('获取服务器详情失败:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * POST /api/servers
 * 添加新服务器
 */
router.post('/', async (req, res) => {
  try {
    const { id, name, ip, port, playerId, playerToken } = req.body;

    // 验证必填字段
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
    if (name.length > 100) {
      return res.status(400).json({ success: false, error: 'name 长度不能超过 100 字符' });
    }
    if (ip.length > 45) {
      return res.status(400).json({ success: false, error: 'ip 长度不能超过 45 字符' });
    }
    if (String(playerId).length > 50) {
      return res.status(400).json({ success: false, error: 'playerId 长度不能超过 50 字符' });
    }
    if (String(playerToken).length > 50) {
      return res.status(400).json({ success: false, error: 'playerToken 长度不能超过 50 字符' });
    }

    // IP 格式验证
    if (typeof ip !== 'string' || !/^[\d.]+$|^[a-zA-Z0-9.-]+$/.test(ip)) {
      return res.status(400).json({ success: false, error: 'ip 格式无效' });
    }

    // 端口验证
    const portNum = parseInt(port);
    if (isNaN(portNum) || portNum < 1 || portNum > 65535) {
      return res.status(400).json({ success: false, error: 'port 必须是 1-65535 之间的数字' });
    }

    // 检查是否已存在相同的服务器（同一用户、同一 IP 和端口）
    const existing = await prisma.server.findFirst({
      where: {
        userId: req.user.id,
        ip,
        port: String(portNum)
      }
    });

    if (existing) {
      return res.status(409).json({
        success: false,
        error: '该服务器已存在'
      });
    }

    // 创建服务器
    const server = await prisma.server.create({
      data: {
        id,
        userId: req.user.id, // 关联到当前用户
        name,
        ip,
        port: String(portNum),
        playerId: String(playerId),
        playerToken: String(playerToken)
      }
    });

    res.status(201).json({
      success: true,
      message: '服务器添加成功',
      server: {
        id: server.id,
        name: server.name
      }
    });
  } catch (error) {
    console.error('添加服务器失败:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * PUT /api/servers/:id
 * 更新服务器信息
 */
router.put('/:id', async (req, res) => {
  try {
    const { name, ip, port, playerId, playerToken, battlemetricsId, img, logo, url, description } = req.body;

    // 先检查服务器是否存在且属于当前用户
    const server = await prisma.server.findFirst({
      where: {
        id: req.params.id,
        userId: req.user.id
      }
    });

    if (!server) {
      return res.status(404).json({ success: false, error: '服务器不存在' });
    }

    // 构建更新数据
    const updates = {};
    if (name !== undefined) updates.name = name;
    if (ip !== undefined) updates.ip = ip;
    if (port !== undefined) updates.port = String(port);
    if (playerId !== undefined) updates.playerId = String(playerId);
    if (playerToken !== undefined) updates.playerToken = String(playerToken);
    if (battlemetricsId !== undefined) updates.battlemetricsId = battlemetricsId;
    if (img !== undefined) updates.img = img;
    if (logo !== undefined) updates.logo = logo;
    if (url !== undefined) updates.url = url;
    if (description !== undefined) updates.description = description;

    // 更新服务器
    await prisma.server.update({
      where: { id: req.params.id },
      data: updates
    });

    res.json({ success: true, message: '服务器更新成功' });
  } catch (error) {
    console.error('更新服务器失败:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * DELETE /api/servers/:id
 * 删除服务器
 */
router.delete('/:id', async (req, res) => {
  try {
    const serverId = req.params.id;
    console.log(`🗑️ 删除服务器请求: ${serverId}`);

    // 检查服务器是否存在且属于当前用户
    const server = await prisma.server.findFirst({
      where: {
        id: serverId,
        userId: req.user.id
      }
    });

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
        await rustPlusService.disconnect(serverId);
        console.log(`   - 断开成功`);
      } catch (disconnectError) {
        console.error(`❌ 断开连接失败:`, disconnectError);
        // 继续删除，即使断开失败
      }
    } else {
      console.log(`   - 服务器未连接，清理配置...`);
      await rustPlusService.disconnect(serverId);
    }

    // 从数据库删除（会级联删除关联的设备和事件日志）
    console.log(`   - 正在从数据库删除...`);
    await prisma.server.delete({
      where: { id: serverId }
    });

    console.log(`✅ 服务器删除成功: ${serverId}`);
    res.json({ success: true, message: '服务器删除成功' });
  } catch (error) {
    console.error(`❌ 删除服务器失败:`, error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// ============================================================
// 设备管理
// ============================================================

/**
 * GET /api/servers/:id/devices
 * 获取服务器的所有设备
 */
router.get('/:id/devices', async (req, res) => {
  try {
    // 先验证服务器属于当前用户
    const server = await prisma.server.findFirst({
      where: {
        id: req.params.id,
        userId: req.user.id
      }
    });

    if (!server) {
      return res.status(404).json({ success: false, error: '服务器不存在' });
    }

    // 获取设备列表
    const devices = await prisma.device.findMany({
      where: {
        serverId: req.params.id
      },
      orderBy: {
        createdAt: 'asc'
      }
    });

    // 转换为前端格式
    const devicesFormatted = devices.map(device => ({
      id: device.id,
      entityId: device.entityId,
      name: device.name,
      type: device.type,
      command: device.command,
      autoMode: device.autoMode,
      isActive: device.isActive,
      reachable: device.reachable,
      lastTrigger: device.lastTrigger,
      createdAt: device.createdAt
    }));

    res.json({ success: true, devices: devicesFormatted });
  } catch (error) {
    console.error('获取设备列表失败:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * POST /api/servers/:id/devices
 * 添加设备
 */
router.post('/:id/devices', async (req, res) => {
  try {
    const { entityId, name, type } = req.body;
    const serverId = req.params.id;

    if (!entityId || !name) {
      return res.status(400).json({ success: false, error: '缺少必要参数' });
    }

    // 验证服务器属于当前用户
    const server = await prisma.server.findFirst({
      where: {
        id: serverId,
        userId: req.user.id
      }
    });

    if (!server) {
      return res.status(404).json({ success: false, error: '服务器不存在' });
    }

    // 长度限制
    if (name.length > 100) {
      return res.status(400).json({ success: false, error: '设备名称长度不能超过 100 字符' });
    }

    // entityId 类型验证
    const entityIdNum = parseInt(entityId);
    if (isNaN(entityIdNum) || entityIdNum < 0) {
      return res.status(400).json({ success: false, error: 'entityId 必须是非负整数' });
    }

    // 检查设备是否已存在
    const existing = await prisma.device.findFirst({
      where: {
        serverId,
        entityId: entityIdNum
      }
    });

    if (existing) {
      return res.status(409).json({ success: false, error: '该设备已存在' });
    }

    // 验证设备类型
    const validTypes = ['SWITCH', 'ALARM', 'STORAGE'];
    const deviceType = type ? type.toUpperCase() : 'SWITCH';
    if (!validTypes.includes(deviceType)) {
      return res.status(400).json({ success: false, error: '无效的设备类型' });
    }

    // 创建设备
    const device = await prisma.device.create({
      data: {
        serverId,
        entityId: entityIdNum,
        name,
        type: deviceType
      }
    });

    res.status(201).json({
      success: true,
      message: '设备添加成功',
      device: {
        id: device.id,
        entityId: device.entityId,
        name: device.name
      }
    });
  } catch (error) {
    console.error('添加设备失败:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * PUT /api/servers/:id/devices/:entityId
 * 更新设备配置
 */
router.put('/:id/devices/:entityId', async (req, res) => {
  try {
    const { id, entityId } = req.params;
    const entityIdNum = parseInt(entityId);

    if (isNaN(entityIdNum) || entityIdNum < 0) {
      return res.status(400).json({ success: false, error: 'entityId 必须是非负整数' });
    }

    // 验证服务器属于当前用户
    const server = await prisma.server.findFirst({
      where: {
        id,
        userId: req.user.id
      }
    });

    if (!server) {
      return res.status(404).json({ success: false, error: '服务器不存在' });
    }

    // 查找设备
    const device = await prisma.device.findFirst({
      where: {
        serverId: id,
        entityId: entityIdNum
      }
    });

    if (!device) {
      return res.status(404).json({ success: false, error: '设备不存在' });
    }

    const { name, type, command, auto_mode } = req.body;
    const updates = {};

    // 验证并添加更新字段
    if (name !== undefined) {
      if (typeof name !== 'string' || name.length > 100) {
        return res.status(400).json({ success: false, error: '设备名称无效或过长' });
      }
      updates.name = name;
    }

    if (type !== undefined) {
      const validTypes = ['SWITCH', 'ALARM', 'STORAGE'];
      const deviceType = type.toUpperCase();
      if (!validTypes.includes(deviceType)) {
        return res.status(400).json({ success: false, error: '无效的设备类型' });
      }
      updates.type = deviceType;
    }

    if (command !== undefined) {
      if (command !== null && (typeof command !== 'string' || command.length > 50)) {
        return res.status(400).json({ success: false, error: '命令名称无效或过长' });
      }
      // 检查命令是否与内置命令冲突
      const builtInCommands = ['help', 'time', 'pop', 'team', 'online', 'afk', 'cargo', 'small', 'large', 'heli', 'events', 'history', 'shop', 'leader', 'tr'];
      if (command && builtInCommands.includes(command.toLowerCase())) {
        return res.status(400).json({ success: false, error: `命令名称 "${command}" 与内置命令冲突` });
      }
      updates.command = command || null;
    }

    if (auto_mode !== undefined) {
      // 将数字映射到枚举
      const autoModeMap = {
        0: 'NONE',
        1: 'DAY_ON',
        2: 'NIGHT_ON',
        3: 'ALWAYS_ON',
        4: 'ALWAYS_OFF',
        7: 'ONLINE_ON',
        8: 'ONLINE_OFF'
      };

      const modeNum = parseInt(auto_mode);
      if (!(modeNum in autoModeMap)) {
        return res.status(400).json({ success: false, error: '自动化模式必须是 0-4 或 7-8' });
      }
      updates.autoMode = autoModeMap[modeNum];
    }

    if (Object.keys(updates).length === 0) {
      return res.status(400).json({ success: false, error: '没有提供有效的更新字段' });
    }

    // 更新设备
    await prisma.device.update({
      where: { id: device.id },
      data: updates
    });

    res.json({ success: true, message: '设备更新成功' });
  } catch (error) {
    console.error('更新设备失败:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * DELETE /api/servers/:id/devices/:entityId
 * 删除设备
 */
router.delete('/:id/devices/:entityId', async (req, res) => {
  try {
    const { id, entityId } = req.params;
    const entityIdNum = parseInt(entityId);

    if (isNaN(entityIdNum) || entityIdNum < 0) {
      return res.status(400).json({ success: false, error: 'entityId 必须是非负整数' });
    }

    // 验证服务器属于当前用户
    const server = await prisma.server.findFirst({
      where: {
        id,
        userId: req.user.id
      }
    });

    if (!server) {
      return res.status(404).json({ success: false, error: '服务器不存在' });
    }

    // 查找并删除设备
    const device = await prisma.device.findFirst({
      where: {
        serverId: id,
        entityId: entityIdNum
      }
    });

    if (!device) {
      return res.status(404).json({ success: false, error: '设备不存在' });
    }

    await prisma.device.delete({
      where: { id: device.id }
    });

    res.json({ success: true, message: '设备删除成功' });
  } catch (error) {
    console.error('删除设备失败:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * GET /api/servers/:id/devices/:entityId/status
 * 获取设备实时状态（从 Rust+ 服务器查询）
 */
router.get('/:id/devices/:entityId/status', async (req, res) => {
  try {
    const { id, entityId } = req.params;
    const entityIdNum = parseInt(entityId);

    if (isNaN(entityIdNum) || entityIdNum < 0) {
      return res.status(400).json({ success: false, error: 'entityId 必须是非负整数' });
    }

    // 验证服务器属于当前用户
    const server = await prisma.server.findFirst({
      where: {
        id,
        userId: req.user.id
      }
    });

    if (!server) {
      return res.status(404).json({ success: false, error: '服务器不存在' });
    }

    // 检查服务器是否连接
    if (!rustPlusService.isConnected(id)) {
      return res.status(400).json({ success: false, error: '服务器未连接' });
    }

    const info = await rustPlusService.getEntityInfo(id, entityIdNum);
    if (!info || !info.payload) {
      return res.status(404).json({ success: false, error: '无法获取设备状态' });
    }

    res.json({
      success: true,
      entityId: entityIdNum,
      value: info.payload.value || false,
      capacity: info.payload.capacity || 0,
      hasProtection: info.payload.hasProtection || false,
      protectionExpiry: info.payload.protectionExpiry || 0
    });
  } catch (error) {
    console.error('获取设备状态失败:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// ============================================================
// 事件日志
// ============================================================

/**
 * GET /api/servers/:id/events
 * 获取服务器事件日志
 */
router.get('/:id/events', async (req, res) => {
  try {
    // 验证服务器属于当前用户
    const server = await prisma.server.findFirst({
      where: {
        id: req.params.id,
        userId: req.user.id
      }
    });

    if (!server) {
      return res.status(404).json({ success: false, error: '服务器不存在' });
    }

    const limit = parseInt(req.query.limit) || 100;

    // 验证 limit 范围
    if (limit < 1 || limit > 1000) {
      return res.status(400).json({ success: false, error: 'limit 必须在 1-1000 之间' });
    }

    // 获取事件日志
    const events = await prisma.eventLog.findMany({
      where: {
        serverId: req.params.id
      },
      orderBy: {
        createdAt: 'desc'
      },
      take: limit
    });

    // 转换为前端格式
    const eventsFormatted = events.map(event => ({
      id: event.id,
      eventType: event.eventType,
      eventData: event.eventData,
      createdAt: event.createdAt
    }));

    res.json({ success: true, events: eventsFormatted });
  } catch (error) {
    console.error('获取事件日志失败:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// ============================================================
// Battlemetrics 集成
// ============================================================

/**
 * GET /api/servers/:id/battlemetrics
 * 获取 Battlemetrics 详细信息
 */
router.get('/:id/battlemetrics', async (req, res) => {
  try {
    // 验证服务器属于当前用户
    const server = await prisma.server.findFirst({
      where: {
        id: req.params.id,
        userId: req.user.id
      }
    });

    if (!server) {
      return res.status(404).json({ success: false, error: '服务器不存在' });
    }

    let battlemetricsId = server.battlemetricsId;

    // 如果没有保存的 Battlemetrics ID，尝试查找
    if (!battlemetricsId) {
      battlemetricsId = await battlemetricsService.searchServerByAddress(
        server.ip,
        server.port,
        server.name
      );

      if (battlemetricsId) {
        // 保存找到的 ID
        await prisma.server.update({
          where: { id: req.params.id },
          data: { battlemetricsId }
        });
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
    console.error('获取 Battlemetrics 信息失败:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * GET /api/servers/:id/battlemetrics/top-players
 * 获取服务器玩家排行
 */
router.get('/:id/battlemetrics/top-players', async (req, res) => {
  try {
    // 验证服务器属于当前用户
    const server = await prisma.server.findFirst({
      where: {
        id: req.params.id,
        userId: req.user.id
      }
    });

    if (!server || !server.battlemetricsId) {
      return res.status(404).json({
        success: false,
        error: '服务器不存在或未关联 Battlemetrics'
      });
    }

    const days = parseInt(req.query.days) || 30;

    // 验证 days 范围
    if (days < 1 || days > 365) {
      return res.status(400).json({ success: false, error: 'days 必须在 1-365 之间' });
    }

    const players = await battlemetricsService.getTopPlayers(server.battlemetricsId, days);

    res.json({ success: true, players });
  } catch (error) {
    console.error('获取玩家排行失败:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// ============================================================
// 连接设置
// ============================================================

/**
 * GET /api/servers/settings/connection
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
 * POST /api/servers/settings/connection
 * 设置 Rust+ 连接模式
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
