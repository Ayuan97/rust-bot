/**
 * UserCommands - 用户级别的游戏内命令服务
 * 处理队伍聊天命令（内置命令 + 自定义设备命令）
 */

import { EventEmitter } from 'events';
import { PrismaClient } from '@prisma/client';
import logger from '../utils/logger.js';
import { parseTimeString } from '../utils/timer.js';
import { cmd, cmdConfig, formatDuration } from '../utils/messages.js';

const prisma = new PrismaClient();

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
  }

  /**
   * 注册单个命令
   */
  registerCommand(name, config) {
    this.commands.set(name.toLowerCase(), config);
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
        try {
          const response = await command.handler(serverId, args, context);
          if (response) {
            await this.rustPlusService.sendTeamMessage(serverId, response);
          }
          return true;
        } catch (error) {
          logger.error(`❌ 内置命令 "${commandName}" 执行失败:`, error.message);
          await this.rustPlusService.sendTeamMessage(
            serverId,
            cmd('error', 'msg') || `❌ 命令执行失败`
          );
          return true;
        }
      }

      // 2. 尝试设备命令
      const deviceResponse = await this.tryDeviceCommand(serverId, commandName, args, context);
      if (deviceResponse !== null) {
        await this.rustPlusService.sendTeamMessage(serverId, deviceResponse);
        return true;
      }

      // 3. 未知命令
      await this.rustPlusService.sendTeamMessage(
        serverId,
        cmd('unknown', 'msg', { cmd: commandName }) || `❓ 未知命令: ${commandName}`
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
        return `❓ 不支持的设备类型: ${device.type}`;
      }

    } catch (error) {
      logger.error(`❌ 设备命令执行失败:`, error.message);
      return `❌ 设备命令执行失败: ${error.message}`;
    }
  }

  /**
   * 获取用户的设备命令（带缓存）
   */
  async getDeviceCommands(serverId) {
    try {
      const devices = await prisma.devices.findMany({
        where: {
          serverId,
          servers: {
            userId: this.userId
          },
          command: {
            not: null
          },
          isActive: true
        }
      });

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
        return `❌ 无法获取警报 "${device.name}" 的信息`;
      }

      const lastTrigger = device.lastTrigger ? new Date(device.lastTrigger) : null;
      const now = new Date();

      if (lastTrigger) {
        const minutesAgo = Math.floor((now - lastTrigger) / 1000 / 60);
        return `🚨 ${device.name}: 上次触发于 ${minutesAgo} 分钟前`;
      } else {
        return `🚨 ${device.name}: 从未触发`;
      }

    } catch (error) {
      logger.error(`警报命令失败:`, error);
      return `❌ 警报 "${device.name}" 不可达`;
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
          return `❌ 无法获取设备 "${device.name}" 的信息`;
        }
        const state = info.payload.value ? '开启' : '关闭';
        return `💡 ${device.name}: ${state}`;
      }

      // status 子命令
      if (subCommand === 'status') {
        const info = await this.rustPlusService.getEntityInfo(serverId, device.entityId);
        if (!info || !info.payload) {
          return `❌ 无法获取设备 "${device.name}" 的信息`;
        }
        const state = info.payload.value ? '开启' : '关闭';
        return `💡 ${device.name}: ${state}`;
      }

      // on 子命令
      if (subCommand === 'on') {
        const timeArg = args[1];

        if (timeArg) {
          // 带时间参数，延迟开启
          const delaySeconds = parseTimeString(timeArg);
          if (delaySeconds === null) {
            return `❌ 无效的时间格式: ${timeArg}。示例: 5m, 1h30m`;
          }

          const delayMs = delaySeconds * 1000;
          const delayMinutes = Math.floor(delaySeconds / 60);

          // 设置定时器
          setTimeout(async () => {
            try {
              await this.rustPlusService.turnSmartSwitchOn(serverId, device.entityId);
              await this.rustPlusService.sendTeamMessage(
                serverId,
                `✅ ${device.name} 已自动开启（延迟 ${delayMinutes} 分钟）`
              );
            } catch (error) {
              logger.error(`定时开启失败:`, error);
            }
          }, delayMs);

          return `⏰ ${device.name} 将在 ${delayMinutes} 分钟后开启`;
        } else {
          // 立即开启
          await this.rustPlusService.turnSmartSwitchOn(serverId, device.entityId);
          return `✅ ${device.name} 已开启`;
        }
      }

      // off 子命令
      if (subCommand === 'off') {
        const timeArg = args[1];

        if (timeArg) {
          // 带时间参数，延迟关闭
          const delaySeconds = parseTimeString(timeArg);
          if (delaySeconds === null) {
            return `❌ 无效的时间格式: ${timeArg}。示例: 5m, 1h30m`;
          }

          const delayMs = delaySeconds * 1000;
          const delayMinutes = Math.floor(delaySeconds / 60);

          // 设置定时器
          setTimeout(async () => {
            try {
              await this.rustPlusService.turnSmartSwitchOff(serverId, device.entityId);
              await this.rustPlusService.sendTeamMessage(
                serverId,
                `✅ ${device.name} 已自动关闭（延迟 ${delayMinutes} 分钟）`
              );
            } catch (error) {
              logger.error(`定时关闭失败:`, error);
            }
          }, delayMs);

          return `⏰ ${device.name} 将在 ${delayMinutes} 分钟后关闭`;
        } else {
          // 立即关闭
          await this.rustPlusService.turnSmartSwitchOff(serverId, device.entityId);
          return `✅ ${device.name} 已关闭`;
        }
      }

      // toggle 子命令
      if (subCommand === 'toggle') {
        const info = await this.rustPlusService.getEntityInfo(serverId, device.entityId);
        if (!info || !info.payload) {
          return `❌ 无法获取设备 "${device.name}" 的信息`;
        }

        const currentState = info.payload.value;
        if (currentState) {
          await this.rustPlusService.turnSmartSwitchOff(serverId, device.entityId);
          return `✅ ${device.name} 已关闭`;
        } else {
          await this.rustPlusService.turnSmartSwitchOn(serverId, device.entityId);
          return `✅ ${device.name} 已开启`;
        }
      }

      return `❓ 未知子命令: ${subCommand}。可用: on, off, status, toggle`;

    } catch (error) {
      logger.error(`开关命令失败:`, error);
      return `❌ 设备 "${device.name}" 不可达`;
    }
  }

  // ==================== 内置命令处理器 ====================

  /**
   * !help - 显示帮助
   */
  async handleHelp(serverId, args, context) {
    const lines = ['📖 可用命令:'];

    // 内置命令
    lines.push('');
    lines.push('📌 基础命令:');
    lines.push('  !help - 显示此帮助');
    lines.push('  !time - 游戏时间');
    lines.push('  !pop - 服务器人数');
    lines.push('  !team - 队伍统计');
    lines.push('  !online - 在线队友');
    lines.push('  !afk - 挂机队友');

    // 事件命令
    if (this.eventMonitorService) {
      lines.push('');
      lines.push('📌 事件命令:');
      lines.push('  !cargo - 货船状态');
      lines.push('  !heli - 直升机状态');
      lines.push('  !small - 小型油井');
      lines.push('  !large - 大型油井');
    }

    // 设备命令
    const devices = await this.getDeviceCommands(serverId);
    if (devices.length > 0) {
      lines.push('');
      lines.push('📌 设备命令:');
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
   */
  async handleTime(serverId, args, context) {
    try {
      const timeInfo = await this.rustPlusService.getTime(serverId);

      const currentTime = timeInfo.time || 0;
      const sunrise = timeInfo.sunrise || 6.5;
      const sunset = timeInfo.sunset || 18.5;

      const isDay = currentTime >= sunrise && currentTime < sunset;
      const hours = Math.floor(currentTime);
      const mins = Math.floor((currentTime - hours) * 60);
      const timeStr = `${hours.toString().padStart(2, '0')}:${mins.toString().padStart(2, '0')}`;

      let timeUntil;
      if (isDay) {
        timeUntil = sunset - currentTime;
      } else {
        if (currentTime < sunrise) {
          timeUntil = sunrise - currentTime;
        } else {
          timeUntil = (24 - currentTime) + sunrise;
        }
      }

      const minutesUntil = Math.floor(timeUntil * 60);

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
      const { formatPosition } = await import('../utils/coordinates.js');
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
      const { formatPosition } = await import('../utils/coordinates.js');
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
}

export default UserCommands;
