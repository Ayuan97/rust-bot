/**
 * UserCommands - 用户级别的游戏内命令服务
 * 处理队伍聊天命令（内置命令 + 自定义设备命令）
 */

import { EventEmitter } from 'events';
import db from '../lib/db.js';
import logger from '../utils/logger.js';
import translate from 'translate';
import { parseTimeString } from '../utils/timer.js';
import { cmd, cmdConfig, formatDuration } from '../utils/messages.js';
import { getItemName, getItemShortName, searchItems } from '../utils/item-info.js';
import { AppMarkerType } from '../utils/event-constants.js';
import { formatPosition } from '../utils/coordinates.js';
import { getLanguageCode } from '../utils/languages.js';

const SHOP_SEARCH_CHINESE_REGEX = /[\u3400-\u9FFF]/;
const SHOP_TRANSLATION_CACHE_LIMIT = 200;
const POP_SAMPLING_INTERVAL_MS = 60 * 1000;
const POP_CURVE_WINDOW_MS = 3 * 24 * 60 * 60 * 1000;
const SHOP_SEARCH_ALIAS_MAP = new Map([
  ['金属门', ['door.hinged.metal', 'sheet metal door', 'metal door', '铁门']],
  ['铁门', ['door.hinged.metal', 'sheet metal door', 'metal door']],
  ['冲锋枪', ['smg', 'submachine gun']],
  ['半自动步枪', ['rifle.semiauto', 'semi automatic rifle']],
  ['步枪子弹', ['ammo.rifle', 'rifle ammo']],
  ['手枪子弹', ['ammo.pistol', 'pistol ammo']],
  ['霰弹枪子弹', ['ammo.shotgun', 'shotgun ammo']],
  ['火箭弹', ['ammo.rocket.basic', 'rocket']],
  ['高质金属', ['metal.refined', 'high quality metal']],
  ['高金', ['metal.refined', 'high quality metal']],
  ['金属碎片', ['metal.fragments', 'metal fragments']]
]);

const LEADER_NOT_ALLOWED_PATTERNS = [
  'not leader',
  'not_leader',
  'not the leader',
  '当前账号不是队长',
  '不是队长',
];

function getCommandErrorMessage(error) {
  if (typeof error === 'string') {
    return error;
  }

  if (error instanceof Error) {
    return error.message || String(error);
  }

  if (error && typeof error.message === 'string') {
    return error.message;
  }

  return String(error || '');
}

function isLeaderPermissionError(message) {
  if (!message) {
    return false;
  }

  const normalized = String(message).toLowerCase();
  return LEADER_NOT_ALLOWED_PATTERNS.some(pattern => normalized.includes(pattern.toLowerCase()));
}

class UserCommands extends EventEmitter {
  constructor(userId, rustPlusService, eventMonitorService = null) {
    super();

    if (!userId) {
      throw new Error('userId 是必需的');
    }

    if (!rustPlusService) {
      throw new Error('rustPlusService 是必需的');
    }

    this.userId = userId;
    this.rustPlusService = rustPlusService;
    this.eventMonitorService = eventMonitorService;

    this.commandPrefix = '!';
    this.commands = new Map();

    // 设备命令缓存（serverId -> Device[]）
    this.deviceCommandsCache = new Map();

    // 命令开关设置缓存
    this.commandSettings = null;

    // 时间配置缓存（serverId -> { dayLengthMinutes, sunrise, sunset, lastTime, lastFetchTime }）
    this.timeCache = new Map();
    this.TIME_CACHE_TTL = 5 * 60 * 1000; // 5分钟刷新一次配置
    this.popHistory = new Map(); // serverId -> [{ timestamp, players }]
    this.POP_HISTORY_WINDOW_MS = 60 * 60 * 1000; // 过去一小时
    this.POP_CURVE_WINDOW_MS = POP_CURVE_WINDOW_MS; // 近三天曲线
    this.POP_HISTORY_RETENTION_MS = this.POP_CURVE_WINDOW_MS + (24 * 60 * 60 * 1000); // 最多保留四天样本
    this.POP_BASELINE_TOLERANCE_MS = 5 * 60 * 1000; // 基线允许误差，超出则不展示一小时变化
    this.POP_HISTORY_MAX_POINTS = Math.ceil(this.POP_HISTORY_RETENTION_MS / POP_SAMPLING_INTERVAL_MS) + 120; // 防止极端刷屏导致内存增长
    this.popSamplingTimer = null;
    this.isCollectingPopSamples = false;
    this.shopSearchTranslationCache = new Map();

    // 注册内置命令
    this.registerBuiltInCommands();
    this.startPopSampling();
  }

  startPopSampling() {
    if (this.popSamplingTimer) {
      return;
    }

    this.popSamplingTimer = setInterval(() => {
      this.collectPopSamples().catch((error) => {
        logger.debug(`[pop] 定时采样失败 (userId=${this.userId}): ${error.message}`);
      });
    }, POP_SAMPLING_INTERVAL_MS);

    this.collectPopSamples().catch((error) => {
      logger.debug(`[pop] 初始化采样失败 (userId=${this.userId}): ${error.message}`);
    });
  }

  async collectPopSamples() {
    if (this.isCollectingPopSamples) {
      return;
    }

    const connectedServers = typeof this.rustPlusService.getConnectedServers === 'function'
      ? this.rustPlusService.getConnectedServers()
      : [];

    if (!connectedServers.length) {
      return;
    }

    this.isCollectingPopSamples = true;
    try {
      for (const serverId of connectedServers) {
        try {
          const info = await this.rustPlusService.getServerInfo(serverId);
          if (!info) {
            continue;
          }

          const players = Number.parseInt(info.players, 10) || 0;
          this.recordPopSample(serverId, players, Date.now());
        } catch (error) {
          logger.debug(`[pop] 采样失败 serverId=${serverId}: ${error.message}`);
        }
      }
    } finally {
      this.isCollectingPopSamples = false;
    }
  }

  recordPopSample(serverId, players, timestamp = Date.now()) {
    const history = this.popHistory.get(serverId) || [];
    const retained = history.filter((point) => point.timestamp >= timestamp - this.POP_HISTORY_RETENTION_MS);
    const numericPlayers = Number.parseInt(players, 10) || 0;
    const lastPoint = retained[retained.length - 1];

    // WebSocket 刷新和定时采样可能会在短时间内重复写入，合并为单点避免 3 天数据膨胀
    if (lastPoint && (timestamp - lastPoint.timestamp) < (POP_SAMPLING_INTERVAL_MS * 0.9)) {
      lastPoint.timestamp = Math.max(lastPoint.timestamp, timestamp);
      lastPoint.players = numericPlayers;
    } else {
      retained.push({ timestamp, players: numericPlayers });
    }

    if (retained.length > this.POP_HISTORY_MAX_POINTS) {
      retained.splice(0, retained.length - this.POP_HISTORY_MAX_POINTS);
    }

    this.popHistory.set(serverId, retained);
    return retained;
  }

  getPopulationTrend(serverId, currentPlayers, now = Date.now()) {
    const history = this.popHistory.get(serverId) || [];
    const retained = history.filter((point) => point.timestamp >= now - this.POP_HISTORY_RETENTION_MS);
    const windowStart = now - this.POP_HISTORY_WINDOW_MS;

    let baselinePoint = null;
    let baselineGap = Number.POSITIVE_INFINITY;
    for (const point of retained) {
      const gap = Math.abs(point.timestamp - windowStart);
      if (gap <= this.POP_BASELINE_TOLERANCE_MS && gap < baselineGap) {
        baselinePoint = point;
        baselineGap = gap;
      }
    }

    if (!baselinePoint) {
      return {
        hasBaseline: false,
        diff: null,
        baselineTime: null,
        windowMinutes: 60
      };
    }

    const baselinePlayers = Number.parseInt(baselinePoint.players, 10) || 0;
    const current = Number.parseInt(currentPlayers, 10) || 0;

    return {
      hasBaseline: true,
      diff: current - baselinePlayers,
      baselineTime: baselinePoint.timestamp,
      windowMinutes: 60
    };
  }

  getPopulationSeries(serverId, options = {}) {
    const {
      now = Date.now(),
      windowMs = this.POP_HISTORY_WINDOW_MS,
      maxPoints = 120
    } = options;

    const history = this.popHistory.get(serverId) || [];
    const windowStart = now - windowMs;
    const windowPoints = history.filter((point) => point.timestamp >= windowStart);

    if (windowPoints.length <= maxPoints) {
      return windowPoints.map((point) => ({
        timestamp: point.timestamp,
        players: Number.parseInt(point.players, 10) || 0
      }));
    }

    const step = Math.ceil(windowPoints.length / maxPoints);
    const sampled = [];
    for (let i = 0; i < windowPoints.length; i += step) {
      const point = windowPoints[i];
      sampled.push({
        timestamp: point.timestamp,
        players: Number.parseInt(point.players, 10) || 0
      });
    }

    const lastPoint = windowPoints[windowPoints.length - 1];
    if (sampled[sampled.length - 1]?.timestamp !== lastPoint.timestamp) {
      sampled.push({
        timestamp: lastPoint.timestamp,
        players: Number.parseInt(lastPoint.players, 10) || 0
      });
    }

    return sampled;
  }

  /**
   * 注册所有内置命令
   */
  registerBuiltInCommands() {
    // 帮助命令
    this.registerCommand('help', {
      description: '显示可用命令',
      usage: '!help',
      handler: async (serverId, args, context) => {
        return this.handleHelp(serverId, args, context);
      }
    });

    // 时间命令
    this.registerCommand('time', {
      description: '显示游戏时间和日出/日落倒计时',
      usage: '!time',
      handler: async (serverId, args, context) => {
        return this.handleTime(serverId, args, context);
      }
    });

    // 人数命令
    this.registerCommand('pop', {
      description: '显示服务器人数',
      usage: '!pop',
      handler: async (serverId, args, context) => {
        return this.handlePop(serverId, args, context);
      }
    });

    // 队伍统计命令
    this.registerCommand('team', {
      description: '显示队伍统计',
      usage: '!team',
      handler: async (serverId, args, context) => {
        return this.handleTeam(serverId, args, context);
      }
    });

    // 在线队友命令
    this.registerCommand('online', {
      description: '显示在线队友',
      usage: '!online',
      handler: async (serverId, args, context) => {
        return this.handleOnline(serverId, args, context);
      }
    });

    // 挂机队友命令
    this.registerCommand('afk', {
      description: '显示挂机队友',
      usage: '!afk',
      handler: async (serverId, args, context) => {
        return this.handleAfk(serverId, args, context);
      }
    });

    // 货船命令（需要 eventMonitorService）
    this.registerCommand('cargo', {
      description: '显示货船状态',
      usage: '!cargo',
      handler: async (serverId, args, context) => {
        return this.handleCargo(serverId, args, context);
      }
    });

    // 直升机命令（需要 eventMonitorService）
    this.registerCommand('heli', {
      description: '显示直升机状态',
      usage: '!heli',
      handler: async (serverId, args, context) => {
        return this.handleHeli(serverId, args, context);
      }
    });

    // 小型油井命令
    this.registerCommand('small', {
      description: '显示小型油井状态',
      usage: '!small',
      handler: async (serverId, args, context) => {
        return this.handleSmallOilRig(serverId, args, context);
      }
    });

    // 大型油井命令
    this.registerCommand('large', {
      description: '显示大型油井状态',
      usage: '!large',
      handler: async (serverId, args, context) => {
        return this.handleLargeOilRig(serverId, args, context);
      }
    });

    // 售货机搜索命令
    this.registerCommand('shop', {
      description: '搜索售货机物品',
      usage: '!shop <物品名>',
      handler: async (serverId, args, context) => {
        return this.handleShop(serverId, args, context);
      }
    });

    // 翻译命令（英文翻译到其他语言）
    this.registerCommand('tr', {
      description: '翻译文本（默认从英文翻译）',
      usage: '!tr <语言> <文本> 或 !tr language <语言名>',
      handler: async (serverId, args, context) => {
        return this.handleTranslateTo(serverId, args, context);
      }
    });

    // 翻译命令（指定源语言和目标语言）
    this.registerCommand('trf', {
      description: '翻译文本（指定源语言）',
      usage: '!trf <源语言> <目标语言> <文本>',
      handler: async (serverId, args, context) => {
        return this.handleTranslateFromTo(serverId, args, context);
      }
    });

    // 移交队长命令
    this.registerCommand('leader', {
      description: '移交队长权限',
      usage: '!leader 或 !leader <名字>',
      handler: async (serverId, args, context) => {
        return this.handleLeader(serverId, args, context);
      }
    });
  }

  /**
   * 注册单个命令
   */
  registerCommand(name, config) {
    this.commands.set(name.toLowerCase(), config);
  }

  /**
   * 从数据库加载命令开关设置
   */
  async loadCommandSettings() {
    try {
      const [rows] = await db.query(
        'SELECT settings FROM notification_settings WHERE userId = ?',
        [this.userId]
      );

      if (rows.length === 0) {
        this.commandSettings = null;
        return;
      }

      const settings = typeof rows[0].settings === 'string'
        ? JSON.parse(rows[0].settings)
        : (rows[0].settings || {});

      // 只提取 cmd_ 开头的设置
      this.commandSettings = {};
      for (const [key, value] of Object.entries(settings)) {
        if (key.startsWith('cmd_')) {
          this.commandSettings[key] = value;
        }
      }
    } catch (error) {
      logger.error(`加载命令设置失败 (用户 ${this.userId}):`, error);
      this.commandSettings = null;
    }
  }

  /**
   * 检查命令是否启用
   * @param {string} name - 命令名（不含前缀）
   * @returns {boolean}
   */
  isCommandEnabled(name) {
    if (!this.commandSettings) {
      return true; // 未加载设置时默认启用
    }
    const key = `cmd_${name}`;
    return this.commandSettings[key] !== false;
  }

  /**
   * 处理消息（入口方法）
   */
  async handleMessage(serverId, name, steamId, message) {
    try {
      // 检查是否是命令
      if (!message.startsWith(this.commandPrefix)) {
        return false;
      }

      const parts = message.slice(this.commandPrefix.length).split(' ');
      const commandName = parts[0].toLowerCase();
      const args = parts.slice(1);

      logger.server(serverId, `💬 命令: ${name} 执行 "${message}" (用户 ${this.userId})`);

      // 构建上下文
      const context = {
        serverId,
        playerName: name,
        steamId,
        userId: this.userId
      };

      // 1. 尝试内置命令
      const command = this.commands.get(commandName);
      if (command) {
        // 检查命令是否启用
        if (!this.isCommandEnabled(commandName)) {
          return true; // 静默忽略
        }
        try {
          const response = await command.handler(serverId, args, context);
          if (response) {
            await this.rustPlusService.sendTeamMessage(serverId, response, { isBot: true });
          }
          return true;
        } catch (error) {
          logger.error(`❌ 内置命令 "${commandName}" 执行失败:`, error.message);
          await this.rustPlusService.sendTeamMessage(
            serverId,
            cmd('error', 'msg') || `[错误] 命令执行失败`,
            { isBot: true }
          );
          return true;
        }
      }

      // 2. 尝试设备命令
      const deviceResponse = await this.tryDeviceCommand(serverId, commandName, args, context);
      if (deviceResponse !== null) {
        await this.rustPlusService.sendTeamMessage(serverId, deviceResponse, { isBot: true });
        return true;
      }

      // 3. 未知命令
      await this.rustPlusService.sendTeamMessage(
        serverId,
        cmd('unknown', 'msg', { cmd: commandName }) || `[错误] 未知命令: ${commandName}`,
        { isBot: true }
      );
      return true;

    } catch (error) {
      logger.error(`❌ 处理命令失败:`, error);
      return false;
    }
  }

  /**
   * 尝试执行设备命令
   */
  async tryDeviceCommand(serverId, commandName, args, context) {
    try {
      // 获取用户的设备命令
      const devices = await this.getDeviceCommands(serverId);

      // 查找匹配的设备
      const device = devices.find(d => d.command?.toLowerCase() === commandName);
      if (!device) {
        return null; // 没有匹配的设备命令
      }

      // 根据设备类型处理命令
      if (device.type === 'ALARM') {
        return await this.handleAlarmCommand(serverId, device, args, context);
      } else if (device.type === 'SWITCH') {
        return await this.handleSwitchCommand(serverId, device, args, context);
      } else {
        return `[错误] 不支持的设备类型: ${device.type}`;
      }

    } catch (error) {
      logger.error(`❌ 设备命令执行失败:`, error.message);
      return `[错误] 设备命令执行失败: ${error.message}`;
    }
  }

  /**
   * 获取用户的设备命令（带缓存）
   */
  async getDeviceCommands(serverId) {
    try {
      const [devices] = await db.query(
        `SELECT * FROM devices
         WHERE serverId = ? AND userId = ? AND command IS NOT NULL AND isActive = 1`,
        [serverId, this.userId]
      );

      return devices;
    } catch (error) {
      logger.error(`获取设备命令失败 (用户 ${this.userId}):`, error);
      return [];
    }
  }

  /**
   * 处理警报命令
   */
  async handleAlarmCommand(serverId, device, args, context) {
    try {
      // 获取警报信息
      const info = await this.rustPlusService.getEntityInfo(serverId, device.entityId);

      if (!info || !info.payload) {
        return `[错误] 无法获取警报 "${device.name}" 的信息`;
      }

      const lastTrigger = device.lastTrigger ? new Date(device.lastTrigger) : null;
      const now = new Date();

      if (lastTrigger) {
        const minutesAgo = Math.floor((now - lastTrigger) / 1000 / 60);
        return `[警报] ${device.name}: 上次触发于 ${minutesAgo} 分钟前`;
      } else {
        return `[警报] ${device.name}: 从未触发`;
      }

    } catch (error) {
      logger.error(`警报命令失败:`, error);
      return `[错误] 警报 "${device.name}" 不可达`;
    }
  }

  /**
   * 处理开关命令
   */
  async handleSwitchCommand(serverId, device, args, context) {
    try {
      const subCommand = args[0]?.toLowerCase();

      // 没有子命令，显示状态
      if (!subCommand) {
        const info = await this.rustPlusService.getEntityInfo(serverId, device.entityId);
        if (!info || !info.payload) {
          return `[错误] 无法获取设备 "${device.name}" 的信息`;
        }
        const state = info.payload.value ? '开启' : '关闭';
        return `[开关] ${device.name}: ${state}`;
      }

      // status 子命令
      if (subCommand === 'status') {
        const info = await this.rustPlusService.getEntityInfo(serverId, device.entityId);
        if (!info || !info.payload) {
          return `[错误] 无法获取设备 "${device.name}" 的信息`;
        }
        const state = info.payload.value ? '开启' : '关闭';
        return `[开关] ${device.name}: ${state}`;
      }

      // on 子命令
      if (subCommand === 'on') {
        const timeArg = args[1];

        if (timeArg) {
          // 带时间参数，延迟开启
          const delaySeconds = parseTimeString(timeArg);
          if (delaySeconds === null) {
            return `[错误] 无效的时间格式: ${timeArg} 示例: 5m, 1h30m`;
          }

          const delayMs = delaySeconds * 1000;
          const delayMinutes = Math.floor(delaySeconds / 60);

          // 设置定时器
          setTimeout(async () => {
            try {
              await this.rustPlusService.turnSmartSwitchOn(serverId, device.entityId);
              await this.rustPlusService.sendTeamMessage(
                serverId,
                `[定时] ${device.name} 已自动开启 (延迟 ${delayMinutes} 分钟)`,
                { isBot: true }
              );
            } catch (error) {
              logger.error(`定时开启失败:`, error);
            }
          }, delayMs);

          return `[定时] ${device.name} 将在 ${delayMinutes} 分钟后开启`;
        } else {
          // 立即开启
          await this.rustPlusService.turnSmartSwitchOn(serverId, device.entityId);
          return `[成功] ${device.name} 已开启`;
        }
      }

      // off 子命令
      if (subCommand === 'off') {
        const timeArg = args[1];

        if (timeArg) {
          // 带时间参数，延迟关闭
          const delaySeconds = parseTimeString(timeArg);
          if (delaySeconds === null) {
            return `[错误] 无效的时间格式: ${timeArg} 示例: 5m, 1h30m`;
          }

          const delayMs = delaySeconds * 1000;
          const delayMinutes = Math.floor(delaySeconds / 60);

          // 设置定时器
          setTimeout(async () => {
            try {
              await this.rustPlusService.turnSmartSwitchOff(serverId, device.entityId);
              await this.rustPlusService.sendTeamMessage(
                serverId,
                `[定时] ${device.name} 已自动关闭 (延迟 ${delayMinutes} 分钟)`,
                { isBot: true }
              );
            } catch (error) {
              logger.error(`定时关闭失败:`, error);
            }
          }, delayMs);

          return `[定时] ${device.name} 将在 ${delayMinutes} 分钟后关闭`;
        } else {
          // 立即关闭
          await this.rustPlusService.turnSmartSwitchOff(serverId, device.entityId);
          return `[成功] ${device.name} 已关闭`;
        }
      }

      // toggle 子命令
      if (subCommand === 'toggle') {
        const info = await this.rustPlusService.getEntityInfo(serverId, device.entityId);
        if (!info || !info.payload) {
          return `[错误] 无法获取设备 "${device.name}" 的信息`;
        }

        const currentState = info.payload.value;
        if (currentState) {
          await this.rustPlusService.turnSmartSwitchOff(serverId, device.entityId);
          return `[成功] ${device.name} 已关闭`;
        } else {
          await this.rustPlusService.turnSmartSwitchOn(serverId, device.entityId);
          return `[成功] ${device.name} 已开启`;
        }
      }

      return `[错误] 未知子命令: ${subCommand} 可用: on, off, status, toggle`;

    } catch (error) {
      logger.error(`开关命令失败:`, error);
      return `[错误] 设备 "${device.name}" 不可达`;
    }
  }

  // ==================== 内置命令处理器 ====================

  /**
   * !help - 显示帮助
   */
  async handleHelp(serverId, args, context) {
    const lines = ['[帮助] 可用命令:'];

    // 内置命令
    lines.push('');
    lines.push('[基础]');
    lines.push('  !help - 显示此帮助');
    lines.push('  !time - 游戏时间');
    lines.push('  !pop - 服务器人数');
    lines.push('  !team - 队伍统计');
    lines.push('  !online - 在线队友');
    lines.push('  !afk - 挂机队友');
    lines.push('  !leader [名字] - 移交队长');
    lines.push('  !shop <物品> - 搜索售货机');

    // 事件命令
    if (this.eventMonitorService) {
      lines.push('');
      lines.push('[事件]');
      lines.push('  !cargo - 货船状态');
      lines.push('  !heli - 直升机状态');
      lines.push('  !small - 小型油井');
      lines.push('  !large - 大型油井');
    }

    // 翻译命令
    lines.push('');
    lines.push('[翻译]');
    lines.push('  !tr <语言> <文本> - 翻译文本');
    lines.push('  !tr lang <语言名> - 查询语言代码');
    lines.push('  !trf <源> <目标> <文本> - 指定源语言翻译');

    // 设备命令
    const devices = await this.getDeviceCommands(serverId);
    if (devices.length > 0) {
      lines.push('');
      lines.push('[设备]');
      devices.forEach(device => {
        if (device.type === 'SWITCH') {
          lines.push(`  !${device.command} [on/off/status/toggle] [时间]`);
        } else if (device.type === 'ALARM') {
          lines.push(`  !${device.command} - ${device.name}`);
        }
      });
    }

    return lines.join('\n');
  }

  /**
   * !time - 游戏时间
   * Rust 默认时间机制 (反编译 Time of Day Unity asset + uMod 实测交叉验证):
   * - 整个周期 dayLengthMinutes (默认 60 分钟; TOD_Time 类源码默认 30, Unity scene 覆盖到 60)
   * - 白天 50 分钟真实时间 (≈83.3%)
   * - 黑夜 10 分钟真实时间 (≈16.7%)
   * - 默认 sunrise≈7.40, sunset≈19.73 (game-hour tick 不均匀: 白天慢, 黑夜快)
   */
  async handleTime(serverId, args, context) {
    try {
      // 直接获取最新时间
      const timeInfo = await this.rustPlusService.getTime(serverId);

      const currentTime = timeInfo.time || 0;
      const sunrise = timeInfo.sunrise || 7.4;
      const sunset = timeInfo.sunset || 19.73;
      const dayLengthMinutes = timeInfo.dayLengthMinutes || 60;

      // 格式化时间 HH:MM
      const hours = Math.floor(currentTime);
      const mins = Math.floor((currentTime - hours) * 60);
      const timeStr = `${hours.toString().padStart(2, '0')}:${mins.toString().padStart(2, '0')}`;

      // 判断白天/黑夜
      const isDay = currentTime >= sunrise && currentTime < sunset;

      // 计算游戏内时间差（小时）
      let gameHoursUntil;
      if (isDay) {
        // 白天 -> 计算到日落的游戏小时
        gameHoursUntil = sunset - currentTime;
      } else {
        // 黑夜 -> 计算到日出的游戏小时
        if (currentTime >= sunset) {
          gameHoursUntil = (24 - currentTime) + sunrise;
        } else {
          gameHoursUntil = sunrise - currentTime;
        }
      }

      // 关键: TOD_Sky 的 game-hour tick 速率不均匀, 白天慢黑夜快
      //       60 分钟周期里 50 min 真实=白天 (12.33 game-h), 10 min 真实=黑夜 (11.67 game-h)
      // 来源: Time.realtimeSinceStartup vs TOD_Sky.Cycle.Hour 实测日志 (umod.org/community/rust/13769)
      const dayGameHours = sunset - sunrise;       // 白天游戏小时 (默认约 12.33h)
      const nightGameHours = 24 - dayGameHours;    // 黑夜游戏小时 (默认约 11.67h)

      const dayRealMinutes = dayLengthMinutes * (50 / 60);   // 白天真实分钟 (≈83.3%)
      const nightRealMinutes = dayLengthMinutes * (10 / 60); // 黑夜真实分钟 (≈16.7%)

      let minutesUntil;
      if (isDay) {
        const realMinutesPerDayHour = dayRealMinutes / dayGameHours;
        minutesUntil = Math.max(0, Math.ceil(gameHoursUntil * realMinutesPerDayHour));
      } else {
        const realMinutesPerNightHour = nightRealMinutes / nightGameHours;
        minutesUntil = Math.max(0, Math.ceil(gameHoursUntil * realMinutesPerNightHour));
      }

      // 使用模板: msg_night = 距离天黑, msg_day = 距离天亮
      if (minutesUntil === 0) {
        return isDay
          ? `当前游戏时间为 ${timeStr}（即将天黑）`
          : `当前游戏时间为 ${timeStr}（即将天亮）`;
      }

      if (isDay) {
        return cmd('time', 'msg_night', { time: timeStr, minutes: minutesUntil });
      } else {
        return cmd('time', 'msg_day', { time: timeStr, minutes: minutesUntil });
      }

    } catch (error) {
      logger.error('获取时间失败:', error);
      return cmd('time', 'error');
    }
  }

  /**
   * !pop - 服务器人数
   */
  async handlePop(serverId, args, context) {
    try {
      const info = await this.rustPlusService.getServerInfo(serverId);

      if (!info) {
        return cmd('pop', 'error');
      }

      const current = Number.parseInt(info.players, 10) || 0;
      const max = Number.parseInt(info.maxPlayers, 10) || 0;
      const queued = Number.parseInt(info.queuedPlayers, 10) || 0;
      const now = Date.now();
      const trend = this.getPopulationTrend(serverId, current, now);
      const diffText = trend.hasBaseline ? `${trend.diff >= 0 ? '+' : ''}${trend.diff}` : '';
      const baseText = (!trend.hasBaseline || trend.diff === 0)
        ? `当前服务器在线人数为${current} / ${max}玩家`
        : `当前服务器在线人数为${current} / ${max}玩家（过去一小时内为${diffText}玩家）`;

      const output = queued > 0 ? `${baseText}，排队${queued}人` : baseText;

      this.recordPopSample(serverId, current, now);

      return output;

    } catch (error) {
      logger.error('获取人数失败:', error);
      return cmd('pop', 'error');
    }
  }

  /**
   * !team - 队伍统计
   */
  async handleTeam(serverId, args, context) {
    try {
      const teamInfo = await this.rustPlusService.getTeamInfo(serverId);

      if (!teamInfo || !teamInfo.members) {
        return cmd('team', 'error');
      }

      const members = teamInfo.members;
      if (members.length === 0) {
        return cmd('team', 'empty');
      }

      const total = members.length;
      const online = members.filter(m => m.isOnline).length;
      const offline = total - online;

      return cmd('team', 'msg', { total, online, offline });

    } catch (error) {
      logger.error('获取队伍信息失败:', error);
      return cmd('team', 'error');
    }
  }

  /**
   * !online - 在线队友
   */
  async handleOnline(serverId, args, context) {
    try {
      const teamInfo = await this.rustPlusService.getTeamInfo(serverId);

      if (!teamInfo || !teamInfo.members) {
        return cmd('online', 'error');
      }

      const members = teamInfo.members;
      if (members.length === 0) {
        return cmd('online', 'empty');
      }

      const onlineMembers = members.filter(m => m.isOnline);
      const total = members.length;
      const online = onlineMembers.length;
      const list = onlineMembers.map(m => `\`${m.name}\``).join(' ');

      return cmd('online', 'msg', { online, total, list });

    } catch (error) {
      logger.error('获取在线队友失败:', error);
      return cmd('online', 'error');
    }
  }

  /**
   * !afk - 挂机队友
   */
  async handleAfk(serverId, args, context) {
    try {
      if (!this.eventMonitorService) {
        return cmd('afk', 'error');
      }

      const eventData = this.eventMonitorService.eventData.get(serverId);
      const teamMembers = eventData?.teamMembers;

      if (!teamMembers || teamMembers.size === 0) {
        // 首次轮询基线尚未建立时，避免误报错误
        return cmd('afk', 'empty');
      }

      const configuredMinutes = Number.parseInt(
        this.eventMonitorService.notificationSettings?.player_afk_minutes,
        10
      );
      const afkThresholdSeconds = (Number.isNaN(configuredMinutes) ? 3 : configuredMinutes) * 60;

      const afkMembers = [];
      for (const [, state] of teamMembers.entries()) {
        if (!state?.isOnline) {
          continue;
        }

        const afkSeconds = Number.parseInt(state.afkSeconds, 10) || 0;
        if (afkSeconds < afkThresholdSeconds) {
          continue;
        }

        afkMembers.push({
          name: state.name || '未知玩家',
          afkSeconds
        });
      }

      if (afkMembers.length === 0) {
        return cmd('afk', 'empty');
      }

      const count = afkMembers.length;
      const list = afkMembers
        .sort((a, b) => b.afkSeconds - a.afkSeconds)
        .map((m) => {
          const duration = formatDuration(m.afkSeconds * 1000);
          return cmd('afk', 'item', { name: m.name, duration }) || `\`${m.name}\`(${duration})`;
        })
        .join(' ');

      return cmd('afk', 'msg', { count, list });

    } catch (error) {
      logger.error('获取挂机队友失败:', error);
      return cmd('afk', 'error');
    }
  }

  /**
   * !cargo - 货船状态
   */
  async handleCargo(serverId, args, context) {
    if (!this.eventMonitorService) {
      return cmd('cargo', 'error');
    }

    try {
      const eventData = this.eventMonitorService.eventData.get(serverId);
      if (!eventData || !eventData.cargoShipTracers || eventData.cargoShipTracers.size === 0) {
        return cmd('cargo', 'empty');
      }

      // 获取第一艘货船的位置
      const firstTracer = eventData.cargoShipTracers.values().next().value;
      if (!firstTracer || firstTracer.length === 0) {
        return cmd('cargo', 'empty');
      }

      const lastPos = firstTracer[firstTracer.length - 1];
      const mapSize = this.rustPlusService.getMapSize(serverId);
      const position = formatPosition(lastPos.x, lastPos.y, mapSize);

      return cmd('cargo', 'msg_active', { position });

    } catch (error) {
      logger.error('获取货船状态失败:', error);
      return cmd('cargo', 'error');
    }
  }

  /**
   * !heli - 直升机状态
   */
  async handleHeli(serverId, args, context) {
    if (!this.eventMonitorService) {
      return cmd('heli', 'error');
    }

    try {
      const eventData = this.eventMonitorService.eventData.get(serverId);
      if (!eventData || !eventData.patrolHeliTracers || eventData.patrolHeliTracers.size === 0) {
        return cmd('heli', 'empty');
      }

      // 获取第一架直升机的位置
      const firstTracer = eventData.patrolHeliTracers.values().next().value;
      if (!firstTracer || firstTracer.length === 0) {
        return cmd('heli', 'empty');
      }

      const lastPos = firstTracer[firstTracer.length - 1];
      const mapSize = this.rustPlusService.getMapSize(serverId);
      const position = formatPosition(lastPos.x, lastPos.y, mapSize);

      return cmd('heli', 'msg', { position });

    } catch (error) {
      logger.error('获取直升机状态失败:', error);
      return cmd('heli', 'error');
    }
  }

  /**
   * !small - 小型油井状态
   */
  async handleSmallOilRig(serverId, args, context) {
    if (!this.eventMonitorService) {
      return cmd('small', 'error');
    }

    try {
      const eventData = this.eventMonitorService.eventData.get(serverId);
      if (!eventData || !eventData.lastEvents) {
        return cmd('small', 'empty');
      }

      const { smallOilRigTriggered, smallOilRigCrateUnlocked } = eventData.lastEvents;
      if (!smallOilRigTriggered) {
        return cmd('small', 'empty');
      }

      const now = Date.now();
      const minutesSince = Math.floor((now - smallOilRigTriggered) / 1000 / 60);
      const minutesLeft = 15 - minutesSince; // 15分钟解锁

      if (smallOilRigCrateUnlocked && smallOilRigCrateUnlocked > smallOilRigTriggered) {
        return cmd('small', 'msg_unlocked', { minutesSince });
      } else if (minutesLeft > 0) {
        return cmd('small', 'msg_triggered', { minutesSince, minutesLeft });
      } else {
        return cmd('small', 'msg_unlocked', { minutesSince });
      }

    } catch (error) {
      logger.error('获取小油井状态失败:', error);
      return cmd('small', 'error');
    }
  }

  /**
   * !large - 大型油井状态
   */
  async handleLargeOilRig(serverId, args, context) {
    if (!this.eventMonitorService) {
      return cmd('large', 'error');
    }

    try {
      const eventData = this.eventMonitorService.eventData.get(serverId);
      if (!eventData || !eventData.lastEvents) {
        return cmd('large', 'empty');
      }

      const { largeOilRigTriggered, largeOilRigCrateUnlocked } = eventData.lastEvents;
      if (!largeOilRigTriggered) {
        return cmd('large', 'empty');
      }

      const now = Date.now();
      const minutesSince = Math.floor((now - largeOilRigTriggered) / 1000 / 60);
      const minutesLeft = 15 - minutesSince; // 15分钟解锁

      if (largeOilRigCrateUnlocked && largeOilRigCrateUnlocked > largeOilRigTriggered) {
        return cmd('large', 'msg_unlocked', { minutesSince });
      } else if (minutesLeft > 0) {
        return cmd('large', 'msg_triggered', { minutesSince, minutesLeft });
      } else {
        return cmd('large', 'msg_unlocked', { minutesSince });
      }

    } catch (error) {
      logger.error('获取大油井状态失败:', error);
      return cmd('large', 'error');
    }
  }

  getShopSearchAliases(searchTerm) {
    const normalized = String(searchTerm || '').toLowerCase().replace(/\s+/g, '');
    if (!normalized) {
      return [];
    }

    const aliases = [];
    for (const [keyword, values] of SHOP_SEARCH_ALIAS_MAP.entries()) {
      if (normalized.includes(keyword)) {
        aliases.push(...values);
      }
    }

    return aliases;
  }

  getShopTranslationCacheKey(searchTerm) {
    return String(searchTerm || '').toLowerCase().replace(/\s+/g, '');
  }

  setShopTranslationCache(key, value) {
    this.shopSearchTranslationCache.set(key, value);
    if (this.shopSearchTranslationCache.size <= SHOP_TRANSLATION_CACHE_LIMIT) {
      return;
    }

    const oldestKey = this.shopSearchTranslationCache.keys().next().value;
    if (oldestKey !== undefined) {
      this.shopSearchTranslationCache.delete(oldestKey);
    }
  }

  buildShopSearchCandidates(searchTerm, translatedTerm = '') {
    const candidates = [searchTerm, ...this.getShopSearchAliases(searchTerm)];

    if (translatedTerm) {
      const normalizedTranslated = translatedTerm.trim();
      candidates.push(normalizedTranslated);

      // Keep a singular form for simple plural translations (e.g. Rockets -> Rocket)
      const singularizedTranslated = normalizedTranslated.replace(/\b([a-z]+)s\b/gi, '$1');
      if (singularizedTranslated.toLowerCase() !== normalizedTranslated.toLowerCase()) {
        candidates.push(singularizedTranslated);
      }
    }

    const dedupedCandidates = [];
    const seen = new Set();
    for (const rawCandidate of candidates) {
      const candidate = String(rawCandidate || '').trim();
      if (!candidate) continue;

      const key = candidate.toLowerCase();
      if (seen.has(key)) continue;
      seen.add(key);
      dedupedCandidates.push(candidate);
    }

    return dedupedCandidates;
  }

  async resolveShopSearchCandidates(searchTerm) {
    const normalizedSearchTerm = String(searchTerm || '').trim();
    if (!normalizedSearchTerm) {
      return [];
    }

    const baseCandidates = this.buildShopSearchCandidates(normalizedSearchTerm);
    if (!SHOP_SEARCH_CHINESE_REGEX.test(normalizedSearchTerm)) {
      return baseCandidates;
    }

    const cacheKey = this.getShopTranslationCacheKey(normalizedSearchTerm);
    let translatedTerm = this.shopSearchTranslationCache.get(cacheKey);

    if (translatedTerm === undefined) {
      try {
        translatedTerm = (await translate(normalizedSearchTerm, { from: 'zh', to: 'en' }))?.trim() || '';
        if (translatedTerm.toLowerCase() === normalizedSearchTerm.toLowerCase()) {
          translatedTerm = '';
        }
      } catch (error) {
        translatedTerm = '';
        logger.debug(`shop search translation failed (${normalizedSearchTerm}): ${error.message}`);
      }

      this.setShopTranslationCache(cacheKey, translatedTerm);
    }

    const translatedCandidates = this.buildShopSearchCandidates(normalizedSearchTerm, translatedTerm);
    return translatedCandidates.length > baseCandidates.length ? translatedCandidates : baseCandidates;
  }

  rankShopMatchingItems(searchTerms) {
    const scoreByItemId = new Map();

    for (let termIndex = 0; termIndex < searchTerms.length; termIndex++) {
      const term = searchTerms[termIndex];
      const ids = searchItems(term).slice(0, 50);
      for (let matchIndex = 0; matchIndex < ids.length; matchIndex++) {
        const itemId = ids[matchIndex];
        const score = (searchTerms.length - termIndex) * 1000 - matchIndex;
        const currentScore = scoreByItemId.get(itemId) ?? Number.NEGATIVE_INFINITY;
        if (score > currentScore) {
          scoreByItemId.set(itemId, score);
        }
      }
    }

    return [...scoreByItemId.entries()]
      .sort((a, b) => b[1] - a[1])
      .map(([itemId]) => itemId);
  }

  /**
   * !shop - 搜索售货机物品
   */
  async handleShop(serverId, args, context) {
    try {
      const mapSize = this.rustPlusService.getMapSize(serverId);
      const response = await this.rustPlusService.getMapMarkers(serverId);
      const markers = Array.isArray(response)
        ? response
        : (response?.markers || []);

      // 过滤售货机
      const vendingMachines = markers.filter(m => m.type === AppMarkerType.VendingMachine);

      if (vendingMachines.length === 0) {
        return cmd('shop', 'empty');
      }

      // 没有搜索参数时只返回统计
      if (args.length === 0) {
        return cmd('shop', 'summary', { count: vendingMachines.length });
      }

      const searchTerm = args.join(' ').trim();
      const searchCandidates = await this.resolveShopSearchCandidates(searchTerm);
      const matchingItemIds = this.rankShopMatchingItems(searchCandidates);

      if (matchingItemIds.length === 0) {
        return cmd('shop', 'not_found', { item: searchTerm });
      }

      // 在售货机中搜索匹配物品
      const results = [];
      const matchingIdSet = new Set(matchingItemIds.slice(0, 20));

      for (const vm of vendingMachines) {
        if (!vm.sellOrders || vm.sellOrders.length === 0) continue;

        for (const order of vm.sellOrders) {
          const itemId = String(order.itemId);
          if (matchingIdSet.has(itemId)) {
            // amountInStock 在部分协议返回中可能缺失（0 库存时尤为常见），统一兜底为 0
            const normalizedStock = Number.isFinite(Number(order.amountInStock))
              ? Number(order.amountInStock)
              : 0;
            const position = formatPosition(vm.x, vm.y, mapSize);
            const itemName = getItemName(order.itemId);
            const itemShortName = getItemShortName(order.itemId);
            const currencyName = getItemName(order.currencyId);
            const currencyShortName = getItemShortName(order.currencyId);

            results.push({
              itemId,
              position,
              itemName,
              itemShortName,
              quantity: order.quantity,
              cost: order.costPerItem,
              currencyName,
              currencyShortName,
              stock: normalizedStock,
              vmName: vm.name || '售货机'
            });
          }
        }
      }

      if (results.length === 0) {
        return cmd('shop', 'not_found', { item: searchTerm });
      }

      // 格式化输出（限制结果数量，避免消息过长）
      const maxResults = 20;
      const displayResults = results.slice(0, maxResults);
      const matchedItemIds = new Set(results.map(r => r.itemId));

      let displayItem = searchTerm;
      if (matchedItemIds.size === 1) {
        const singleItemId = displayResults[0]?.itemId;
        if (singleItemId) {
          const itemName = getItemName(singleItemId);
          const itemShortName = getItemShortName(singleItemId);
          displayItem = `:${itemShortName}: ${itemName}`;
        }
      }

      let output = cmd('shop', 'found', { count: results.length, item: displayItem }) + '\n';

      for (const r of displayResults) {
        output += `${r.position}: ${r.quantity}x :${r.itemShortName}: = ${r.cost}:${r.currencyShortName}: (库存${r.stock})\n`;
      }

      if (results.length > maxResults) {
        output += `...还有 ${results.length - maxResults} 个结果`;
      }

      return output.trim();

    } catch (error) {
      logger.error('搜索售货机失败:', error);
      return cmd('shop', 'error');
    }
  }

  /**
   * !tr - 翻译文本（默认从英文翻译到目标语言）
   * 用法: !tr <语言代码> <文本>
   *       !tr language <语言名称>  获取语言代码
   */
  async handleTranslateTo(serverId, args, context) {
    try {
      if (args.length === 0) {
        return '[翻译] 用法: !tr <语言> <文本> 或 !tr language <语言名>';
      }

      const subCommand = args[0].toLowerCase();

      // !tr language <语言名称> - 查询语言代码
      if (subCommand === 'language' || subCommand === 'lang') {
        if (args.length < 2) {
          return '[翻译] 请输入语言名称，如: !tr language 日语';
        }

        const languageName = args.slice(1).join(' ');
        const code = getLanguageCode(languageName);

        if (code) {
          return `[翻译] "${languageName}" 的语言代码是: ${code}`;
        } else {
          return `[翻译] 未找到语言: ${languageName}`;
        }
      }

      // !tr <语言代码> <文本> - 翻译文本
      if (args.length < 2) {
        return '[翻译] 请输入要翻译的文本，如: !tr zh Hello World';
      }

      const targetLang = getLanguageCode(args[0]) || args[0];
      const text = args.slice(1).join(' ');

      const result = await translate(text, { to: targetLang });
      return `[翻译] ${result}`;

    } catch (error) {
      logger.warn('翻译失败:', error.message);
      if (error.message?.includes('language')) {
        return `[翻译] 不支持的语言: ${args[0]}`;
      }
      return '[翻译] 翻译失败，请稍后重试';
    }
  }

  /**
   * !trf - 翻译文本（指定源语言和目标语言）
   * 用法: !trf <源语言> <目标语言> <文本>
   */
  async handleTranslateFromTo(serverId, args, context) {
    try {
      if (args.length < 3) {
        return '[翻译] 用法: !trf <源语言> <目标语言> <文本>  例: !trf en zh Hello';
      }

      const fromLang = getLanguageCode(args[0]) || args[0];
      const toLang = getLanguageCode(args[1]) || args[1];
      const text = args.slice(2).join(' ');

      const result = await translate(text, { from: fromLang, to: toLang });
      return `[翻译] ${result}`;

    } catch (error) {
      logger.warn('翻译失败:', error.message);
      // 尝试从错误信息中提取不支持的语言
      const match = error.message?.match(/language "(.+?)"/);
      if (match) {
        return `[翻译] 不支持的语言: ${match[1]}`;
      }
      return '[翻译] 翻译失败，请稍后重试';
    }
  }

  /**
   * !leader - 移交队长权限
   * 用法: !leader - 移交给发送命令的玩家
   *       !leader <名字> - 移交给指定队友
   */
  async handleLeader(serverId, args, context) {
    try {
      // 获取队伍信息
      const teamInfo = await this.rustPlusService.getTeamInfo(serverId);
      if (!teamInfo || !teamInfo.members) {
        logger.warn(`[leader] getTeamInfo 返回空 (server=${serverId}, user=${this.userId})`);
        return cmd('leader', 'error') || '[错误] 获取队伍信息失败';
      }

      const members = teamInfo.members;
      if (members.length === 0) {
        return cmd('leader', 'error') || '[错误] 队伍为空';
      }

      const leaderSteamId = teamInfo.leaderSteamId?.toString();
      const botSteamId = this.rustPlusService.getPlayerId(serverId)?.toString();
      logger.debug(`[leader] server=${serverId} leader=${leaderSteamId} bot=${botSteamId} members=${members.length} caller=${context.steamId}`);

      let targetPlayer;

      if (args.length === 0) {
        // !leader 无参数：移交给发送命令的玩家自己
        const callerSteamId = context.steamId?.toString();
        if (!callerSteamId) {
          return cmd('leader', 'error') || '[错误] 无法获取发送者信息';
        }

        // 检查发送者是否已经是队长
        if (leaderSteamId === callerSteamId) {
          return '[队长] 你已经是队长了';
        }

        // 在队伍中查找发送者
        targetPlayer = members.find(m => m.steamId?.toString() === callerSteamId);
        if (!targetPlayer) {
          return cmd('leader', 'error') || '[错误] 你不在队伍中';
        }
      } else {
        // !leader <name>：移交给指定名字的队友
        const targetName = args.join(' ');

        // 查找匹配的队友（支持部分匹配）
        targetPlayer = members.find(m =>
          m.name.toLowerCase().includes(targetName.toLowerCase())
        );

        if (!targetPlayer) {
          return cmd('leader', 'not_found', { name: targetName }) || `[错误] 找不到玩家: ${targetName}`;
        }

        // 检查是否已经是队长
        if (leaderSteamId === targetPlayer.steamId?.toString()) {
          return cmd('leader', 'already', { name: targetPlayer.name }) || `[队长] ${targetPlayer.name} 已经是队长了`;
        }
      }

      if (leaderSteamId !== botSteamId) {
        logger.warn(`[leader] bot is not leader (server=${serverId}, leader=${leaderSteamId || 'null'}, bot=${botSteamId || 'null'}, caller=${context.steamId || 'null'})`);
        return cmd('leader', 'not_leader') || '[错误] 移交失败: 当前账号不是队长';
      }

      logger.debug(`[leader] 调用 promoteToLeader target=${targetPlayer.steamId} name=${targetPlayer.name}`);
      try {
        await this.rustPlusService.promoteToLeader(serverId, targetPlayer.steamId);
      } catch (error) {
        const errorMessage = getCommandErrorMessage(error);

        if (isLeaderPermissionError(errorMessage)) {
          logger.warn(`[leader] promote rejected by server (server=${serverId}, target=${targetPlayer.steamId}, bot=${botSteamId || 'null'}): ${errorMessage}`);
          return cmd('leader', 'not_leader') || '[错误] 移交失败: 当前账号不是队长';
        }

        try {
          const latestTeamInfo = await this.rustPlusService.getTeamInfo(serverId);
          const latestLeaderSteamId = latestTeamInfo?.leaderSteamId?.toString();

          if (latestLeaderSteamId && latestLeaderSteamId === targetPlayer.steamId?.toString()) {
            logger.warn(`[leader] promote completed externally (server=${serverId}, target=${targetPlayer.steamId}, msg=${errorMessage})`);
            return cmd('leader', 'msg', { name: targetPlayer.name }) || `[队长] 已将队长移交给 ${targetPlayer.name}`;
          }

          if (latestLeaderSteamId && latestLeaderSteamId !== botSteamId) {
            logger.warn(`[leader] leader changed during promote (server=${serverId}, latestLeader=${latestLeaderSteamId}, bot=${botSteamId || 'null'}, msg=${errorMessage})`);
            return cmd('leader', 'not_leader') || '[错误] 移交失败: 当前账号不是队长';
          }
        } catch (refreshError) {
          logger.warn(`[leader] refresh team info after promote failed (server=${serverId}): ${getCommandErrorMessage(refreshError)}`);
        }

        throw error;
      }

      return cmd('leader', 'msg', { name: targetPlayer.name }) || `[队长] 已将队长移交给 ${targetPlayer.name}`;

    } catch (error) {
      const errorMessage = getCommandErrorMessage(error);
      logger.warn(`[leader] 异常 (server=${serverId}, user=${this.userId}): ${errorMessage}`);
      if (errorMessage.includes('timeout') || errorMessage.includes('Timeout')) {
        return '[错误] 移交队长超时，请稍后重试';
      }
      return cmd('leader', 'error') || `[错误] 移交队长失败: ${errorMessage}`;
    }
  }

  /**
   * 销毁服务，清理资源
   */
  destroy() {
    if (this.popSamplingTimer) {
      clearInterval(this.popSamplingTimer);
      this.popSamplingTimer = null;
    }
    this.isCollectingPopSamples = false;
    this.commands.clear();
    this.deviceCommandsCache.clear();
    this.timeCache.clear();
    this.popHistory.clear();
    this.shopSearchTranslationCache.clear();
    this.commandSettings = null;
    this.removeAllListeners();
    logger.debug(`👤 UserCommands 已销毁 (userId: ${this.userId})`);
  }
}

export default UserCommands;
