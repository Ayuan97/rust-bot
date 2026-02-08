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

    // 注册内置命令
    this.registerBuiltInCommands();
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
   * Rust 默认时间机制：
   * - 整个周期 dayLengthMinutes (默认 60 分钟)
   * - 白天占 75% 真实时间 (默认 45 分钟)
   * - 黑夜占 25% 真实时间 (默认 15 分钟)
   */
  async handleTime(serverId, args, context) {
    try {
      // 直接获取最新时间
      const timeInfo = await this.rustPlusService.getTime(serverId);

      const currentTime = timeInfo.time || 0;
      const sunrise = timeInfo.sunrise || 7;
      const sunset = timeInfo.sunset || 20;
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

      // Rust 默认时间比例：白天 75%，黑夜 25%
      // 参考: https://gamerant.com/rust-day-night-cycle-length-detailed-explained/
      const dayGameHours = sunset - sunrise;       // 白天游戏小时 (默认约 13h)
      const nightGameHours = 24 - dayGameHours;    // 黑夜游戏小时 (默认约 11h)

      const dayRealMinutes = dayLengthMinutes * 0.75;   // 白天真实分钟
      const nightRealMinutes = dayLengthMinutes * 0.25; // 黑夜真实分钟

      let minutesUntil;
      if (isDay) {
        const realMinutesPerDayHour = dayRealMinutes / dayGameHours;
        minutesUntil = Math.floor(gameHoursUntil * realMinutesPerDayHour);
      } else {
        const realMinutesPerNightHour = nightRealMinutes / nightGameHours;
        minutesUntil = Math.floor(gameHoursUntil * realMinutesPerNightHour);
      }

      // 使用模板: msg_night = 距离天黑, msg_day = 距离天亮
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

      const current = info.players || 0;
      const max = info.maxPlayers || 0;
      const queued = info.queuedPlayers || 0;

      if (queued > 0) {
        return cmd('pop', 'msg_queued', { current, max, queued });
      }
      return cmd('pop', 'msg_no_change', { current, max });

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
      const teamInfo = await this.rustPlusService.getTeamInfo(serverId);

      if (!teamInfo || !teamInfo.members) {
        return cmd('afk', 'error');
      }

      // 简化版：认为在线但死亡的为挂机
      const afkMembers = teamInfo.members.filter(m => m.isOnline && !m.isAlive);

      if (afkMembers.length === 0) {
        return cmd('afk', 'empty');
      }

      const count = afkMembers.length;
      const list = afkMembers.map(m => `\`${m.name}\``).join(' ');

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

  /**
   * !shop - 搜索售货机物品
   */
  async handleShop(serverId, args, context) {
    try {
      const mapSize = this.rustPlusService.getMapSize(serverId);
      const response = await this.rustPlusService.getMapMarkers(serverId);
      const markers = response.markers || [];

      // 过滤售货机
      const vendingMachines = markers.filter(m => m.type === AppMarkerType.VendingMachine);

      if (vendingMachines.length === 0) {
        return cmd('shop', 'empty');
      }

      // 如果没有搜索参数，显示统计
      if (args.length === 0) {
        return cmd('shop', 'summary', { count: vendingMachines.length });
      }

      // 搜索物品
      const searchTerm = args.join(' ');
      const matchingItemIds = searchItems(searchTerm);

      if (matchingItemIds.length === 0) {
        return cmd('shop', 'not_found', { item: searchTerm });
      }

      // 在售货机中搜索匹配的物品
      const results = [];
      const matchingIdSet = new Set(matchingItemIds.slice(0, 10)); // 只取前10个匹配结果

      for (const vm of vendingMachines) {
        if (!vm.sellOrders || vm.sellOrders.length === 0) continue;

        for (const order of vm.sellOrders) {
          if (matchingIdSet.has(String(order.itemId))) {
            const position = formatPosition(vm.x, vm.y, mapSize);
            const itemName = getItemName(order.itemId);
            const itemShortName = getItemShortName(order.itemId);
            const currencyName = getItemName(order.currencyId);
            const currencyShortName = getItemShortName(order.currencyId);

            results.push({
              position,
              itemName,
              itemShortName,
              quantity: order.quantity,
              cost: order.costPerItem,
              currencyName,
              currencyShortName,
              stock: order.amountInStock,
              vmName: vm.name || '售货机'
            });
          }
        }
      }

      if (results.length === 0) {
        return cmd('shop', 'not_found', { item: searchTerm });
      }

      // 格式化输出（限制结果数量，避免消息过长）
      const maxResults = 5;
      const displayResults = results.slice(0, maxResults);
      const itemName = getItemName(matchingItemIds[0]);
      const itemShortName = getItemShortName(matchingItemIds[0]);

      let output = cmd('shop', 'found', { count: results.length, item: `:${itemShortName}: ${itemName}` }) + '\n';

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
      logger.error('翻译失败:', error);
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
      logger.error('翻译失败:', error);
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
        return cmd('leader', 'error') || '[错误] 获取队伍信息失败';
      }

      const members = teamInfo.members;
      if (members.length === 0) {
        return cmd('leader', 'error') || '[错误] 队伍为空';
      }

      const leaderSteamId = teamInfo.leaderSteamId?.toString();
      const botSteamId = this.rustPlusService.getPlayerId(serverId);

      // 检查当前机器人账号是否是队长
      if (leaderSteamId !== botSteamId?.toString()) {
        return cmd('leader', 'not_leader') || '[错误] 移交失败: 当前账号不是队长';
      }

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

      // 移交队长权限
      await this.rustPlusService.promoteToLeader(serverId, targetPlayer.steamId);

      return cmd('leader', 'msg', { name: targetPlayer.name }) || `[队长] 已将队长移交给 ${targetPlayer.name}`;

    } catch (error) {
      logger.error('移交队长失败:', error);
      return cmd('leader', 'error') || '[错误] 移交队长失败';
    }
  }

  /**
   * 销毁服务，清理资源
   */
  destroy() {
    this.commands.clear();
    this.deviceCommandsCache.clear();
    this.timeCache.clear();
    this.commandSettings = null;
    this.removeAllListeners();
    logger.debug(`👤 UserCommands 已销毁 (userId: ${this.userId})`);
  }
}

export default UserCommands;
