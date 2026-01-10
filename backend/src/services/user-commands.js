/**
 * UserCommands - 用户级别的游戏内命令服务
 * 处理队伍聊天命令（内置命令 + 自定义设备命令）
 */

import { EventEmitter } from 'events';
import { PrismaClient } from '@prisma/client';
import logger from '../utils/logger.js';
import { parseTimeString } from '../utils/timer.js';

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
            `❌ 命令执行失败: ${error.message}`
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
        `❓ 未知命令: ${commandName}。输入 !help 查看可用命令。`
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
      const minutes = Math.floor((currentTime - hours) * 60);

      let nextEvent, timeUntil;
      if (isDay) {
        // 白天，计算到日落的时间
        timeUntil = sunset - currentTime;
        nextEvent = '日落';
      } else {
        // 夜晚，计算到日出的时间
        if (currentTime < sunrise) {
          timeUntil = sunrise - currentTime;
        } else {
          timeUntil = (24 - currentTime) + sunrise;
        }
        nextEvent = '日出';
      }

      const hoursUntil = Math.floor(timeUntil);
      const minutesUntil = Math.floor((timeUntil - hoursUntil) * 60);

      return `🕐 游戏时间: ${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')} (${isDay ? '白天' : '夜晚'})\n` +
             `⏰ 距离${nextEvent}: ${hoursUntil}小时${minutesUntil}分钟`;

    } catch (error) {
      logger.error('获取时间失败:', error);
      return '❌ 无法获取游戏时间';
    }
  }

  /**
   * !pop - 服务器人数
   */
  async handlePop(serverId, args, context) {
    try {
      const info = await this.rustPlusService.getServerInfo(serverId);

      if (!info) {
        return '❌ 无法获取服务器信息';
      }

      const current = info.players || 0;
      const max = info.maxPlayers || 0;
      const queued = info.queuedPlayers || 0;

      let message = `👥 服务器人数: ${current}/${max}`;
      if (queued > 0) {
        message += ` (排队: ${queued})`;
      }

      return message;

    } catch (error) {
      logger.error('获取人数失败:', error);
      return '❌ 无法获取服务器人数';
    }
  }

  /**
   * !team - 队伍统计
   */
  async handleTeam(serverId, args, context) {
    try {
      const teamInfo = await this.rustPlusService.getTeamInfo(serverId);

      if (!teamInfo || !teamInfo.members) {
        return '❌ 无法获取队伍信息';
      }

      const members = teamInfo.members;
      const online = members.filter(m => m.isOnline).length;
      const offline = members.filter(m => !m.isOnline && !m.isAlive).length;
      const dead = members.filter(m => !m.isAlive && m.isOnline).length;

      return `👥 队伍统计:\n` +
             `  在线: ${online}\n` +
             `  离线: ${offline}\n` +
             `  死亡: ${dead}\n` +
             `  总计: ${members.length}`;

    } catch (error) {
      logger.error('获取队伍信息失败:', error);
      return '❌ 无法获取队伍信息';
    }
  }

  /**
   * !online - 在线队友
   */
  async handleOnline(serverId, args, context) {
    try {
      const teamInfo = await this.rustPlusService.getTeamInfo(serverId);

      if (!teamInfo || !teamInfo.members) {
        return '❌ 无法获取队伍信息';
      }

      const onlineMembers = teamInfo.members.filter(m => m.isOnline && m.isAlive);

      if (onlineMembers.length === 0) {
        return '😴 当前无在线队友';
      }

      const lines = ['✅ 在线队友:'];
      onlineMembers.forEach(m => {
        lines.push(`  • ${m.name}`);
      });

      return lines.join('\n');

    } catch (error) {
      logger.error('获取在线队友失败:', error);
      return '❌ 无法获取队伍信息';
    }
  }

  /**
   * !afk - 挂机队友
   */
  async handleAfk(serverId, args, context) {
    try {
      const teamInfo = await this.rustPlusService.getTeamInfo(serverId);

      if (!teamInfo || !teamInfo.members) {
        return '❌ 无法获取队伍信息';
      }

      // 简化版：认为在线但死亡的为挂机
      const afkMembers = teamInfo.members.filter(m => m.isOnline && !m.isAlive);

      if (afkMembers.length === 0) {
        return '✅ 当前无挂机队友';
      }

      const lines = ['😴 挂机队友:'];
      afkMembers.forEach(m => {
        lines.push(`  • ${m.name}`);
      });

      return lines.join('\n');

    } catch (error) {
      logger.error('获取挂机队友失败:', error);
      return '❌ 无法获取队伍信息';
    }
  }

  /**
   * !cargo - 货船状态
   */
  async handleCargo(serverId, args, context) {
    if (!this.eventMonitorService) {
      return '❌ 事件监控服务未启用';
    }

    const eventData = this.eventMonitorService.eventData.get(serverId);
    if (!eventData || !eventData.cargoShip) {
      return '🚢 货船: 未刷新';
    }

    const cargo = eventData.cargoShip;
    if (!cargo.active) {
      return '🚢 货船: 未刷新';
    }

    const now = Date.now();
    const elapsed = Math.floor((now - cargo.spawnTime) / 1000 / 60);

    return `🚢 货船: 已刷新 ${elapsed} 分钟`;
  }

  /**
   * !heli - 直升机状态
   */
  async handleHeli(serverId, args, context) {
    if (!this.eventMonitorService) {
      return '❌ 事件监控服务未启用';
    }

    const eventData = this.eventMonitorService.eventData.get(serverId);
    if (!eventData || !eventData.patrolHelicopter) {
      return '🚁 直升机: 未刷新';
    }

    const heli = eventData.patrolHelicopter;
    if (!heli.active) {
      return '🚁 直升机: 未刷新';
    }

    const now = Date.now();
    const elapsed = Math.floor((now - heli.spawnTime) / 1000 / 60);

    return `🚁 直升机: 已刷新 ${elapsed} 分钟`;
  }

  /**
   * !small - 小型油井状态
   */
  async handleSmallOilRig(serverId, args, context) {
    if (!this.eventMonitorService) {
      return '❌ 事件监控服务未启用';
    }

    const eventData = this.eventMonitorService.eventData.get(serverId);
    if (!eventData || !eventData.smallOilRig) {
      return '🛢️ 小型油井: 未触发';
    }

    const rig = eventData.smallOilRig;
    if (!rig.triggered) {
      return '🛢️ 小型油井: 未触发';
    }

    const now = Date.now();
    const elapsed = Math.floor((now - rig.triggerTime) / 1000 / 60);
    const unlockIn = 15 - elapsed; // 15分钟解锁

    if (unlockIn > 0) {
      return `🛢️ 小型油井: 已触发，${unlockIn} 分钟后解锁`;
    } else {
      return `🛢️ 小型油井: 已解锁`;
    }
  }

  /**
   * !large - 大型油井状态
   */
  async handleLargeOilRig(serverId, args, context) {
    if (!this.eventMonitorService) {
      return '❌ 事件监控服务未启用';
    }

    const eventData = this.eventMonitorService.eventData.get(serverId);
    if (!eventData || !eventData.largeOilRig) {
      return '🛢️ 大型油井: 未触发';
    }

    const rig = eventData.largeOilRig;
    if (!rig.triggered) {
      return '🛢️ 大型油井: 未触发';
    }

    const now = Date.now();
    const elapsed = Math.floor((now - rig.triggerTime) / 1000 / 60);
    const unlockIn = 15 - elapsed; // 15分钟解锁

    if (unlockIn > 0) {
      return `🛢️ 大型油井: 已触发，${unlockIn} 分钟后解锁`;
    } else {
      return `🛢️ 大型油井: 已解锁`;
    }
  }
}

export default UserCommands;
