/**
 * 游戏内命令处理服务
 * 处理以 ! 开头的队伍聊天命令
 */

import { cmd, cmdConfig, allCommands } from '../utils/messages.js';
import { formatPosition } from '../utils/coordinates.js';
import EventTimerManager from '../utils/event-timer.js';

class CommandsService {
  constructor(rustPlusService, eventMonitorService = null) {
    this.rustPlusService = rustPlusService;
    this.eventMonitorService = eventMonitorService;
    this.commandPrefix = '!';
    this.commands = new Map();
    this.settings = new Map(); // 存储每个服务器的设置
    this.playerCountHistory = new Map(); // 存储人数历史记录

    // 注册内置命令
    this.registerBuiltInCommands();
  }

  /**
   * 获取服务器设置
   */
  getServerSettings(serverId) {
    if (!this.settings.has(serverId)) {
      this.settings.set(serverId, {
        deathNotify: true  // 默认开启死亡通知
      });
    }
    return this.settings.get(serverId);
  }

  /**
   * 更新服务器设置
   */
  updateServerSettings(serverId, newSettings) {
    const settings = this.getServerSettings(serverId);
    Object.assign(settings, newSettings);
    this.settings.set(serverId, settings);
  }

  /**
   * 注册内置命令
   */
  registerBuiltInCommands() {
    // 帮助命令
    const helpConfig = cmdConfig('help');
    this.registerCommand('help', {
      description: helpConfig.desc,
      usage: '!help',
      handler: async (serverId, args, context) => {
        const commandList = Array.from(this.commands.entries())
          .map(([name, c]) => `!${name}`)
          .join(' | ');
        return cmd('help', 'msg', { commands: commandList });
      }
    });

    // 游戏时间命令
    const timeConfig = cmdConfig('time');
    this.registerCommand('time', {
      description: timeConfig.desc,
      usage: '!time',
      handler: async (serverId, args, context) => {
        try {
          const timeInfo = await this.rustPlusService.getTime(serverId);
          const currentTime = timeInfo.time || 0;
          const hours = Math.floor(currentTime);
          const minutes = Math.floor((currentTime - hours) * 60);
          const timeStr = `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}`;

          const sunrise = timeInfo.sunrise || 6;
          const sunset = timeInfo.sunset || 18;
          const dayLengthMinutes = timeInfo.dayLengthMinutes || 45; // 默认45分钟一天

          const isDaytime = currentTime >= sunrise && currentTime < sunset;

          // 计算距离下次昼夜变化的时间（游戏时间）
          let nextChangeTime;
          let changeType; // 'night' 或 'day'

          if (isDaytime) {
            // 白天，计算距离天黑的时间
            nextChangeTime = sunset;
            changeType = 'night';
          } else {
            // 夜晚，计算距离天亮的时间
            if (currentTime < sunrise) {
              // 当前时间在午夜到日出之间
              nextChangeTime = sunrise;
            } else {
              // 当前时间在日落到午夜之间，下次天亮是明天
              nextChangeTime = 24 + sunrise;
            }
            changeType = 'day';
          }

          // 游戏时间差（小时）
          const gameTimeDiff = nextChangeTime - currentTime;

          // 转换为真实时间（分钟）
          // 公式: 真实分钟 = 游戏时间差(小时) × (一天真实分钟数 / 24小时)
          const realMinutes = Math.floor(gameTimeDiff * (dayLengthMinutes / 24));

          if (changeType === 'night') {
            return cmd('time', 'msg_night', {
              time: timeStr,
              minutes: realMinutes
            });
          } else {
            return cmd('time', 'msg_day', {
              time: timeStr,
              minutes: realMinutes
            });
          }
        } catch (error) {
          return cmd('time', 'error');
        }
      }
    });

    // 服务器人数命令
    const popConfig = cmdConfig('pop');
    this.registerCommand('pop', {
      description: popConfig.desc,
      usage: '!pop',
      handler: async (serverId, args, context) => {
        try {
          const info = await this.rustPlusService.getServerInfo(serverId);
          const current = info.players || 0;
          const maxPlayers = info.maxPlayers || 0;
          const queued = info.queuedPlayers || 0;

          // 记录当前人数
          this.recordPlayerCount(serverId, current, queued);

          // 获取30分钟前的人数变化
          const change = this.getPlayerCountChange(serverId);

          // 有排队人数时，不展示人数变化趋势
          if (queued > 0) {
            return cmd('pop', 'msg_queued', {
              current,
              max: maxPlayers,
              queued
            });
          } else {
            // 没有排队人数时，展示人数变化趋势
            // 但是当变化为0时不展示
            if (change === 0) {
              return cmd('pop', 'msg_no_change', {
                current,
                max: maxPlayers
              });
            } else {
              const changeText = change > 0 ? `新增${change}` : `减少${Math.abs(change)}`;
              return cmd('pop', 'msg', {
                current,
                max: maxPlayers,
                change: changeText
              });
            }
          }
        } catch (error) {
          return cmd('pop', 'error');
        }
      }
    });

    // 队伍信息命令
    const teamConfig = cmdConfig('team');
    this.registerCommand('team', {
      description: teamConfig.desc,
      usage: '!team',
      handler: async (serverId, args, context) => {
        try {
          const teamInfo = await this.rustPlusService.getTeamInfo(serverId);
          if (!teamInfo.members || teamInfo.members.length === 0) {
            return cmd('team', 'empty');
          }

          const onlineMembers = teamInfo.members.filter(m => m.isOnline);

          let list = onlineMembers.map(m => {
            const status = m.isAlive ? '活' : '死';
            return `${m.name}[${status}]`;
          }).join(' | ');

          return cmd('team', 'msg', {
            online: onlineMembers.length,
            total: teamInfo.members.length,
            list: list || '无'
          });
        } catch (error) {
          return cmd('team', 'error');
        }
      }
    });

    // 队伍成员命令
    const onlineConfig = cmdConfig('online');
    this.registerCommand('online', {
      description: onlineConfig.desc,
      usage: '!online',
      handler: async (serverId, args, context) => {
        try {
          const teamInfo = await this.rustPlusService.getTeamInfo(serverId);
          if (!teamInfo.members || teamInfo.members.length === 0) {
            return cmd('online', 'empty');
          }

          const onlineMembers = teamInfo.members.filter(m => m.isOnline);
          const offlineMembers = teamInfo.members.filter(m => !m.isOnline);

          let list = onlineMembers.map(m => {
            const status = m.isAlive ? '活' : '死';
            return `${m.name}[${status}]`;
          }).join(' | ');

          return cmd('online', 'msg', {
            online: onlineMembers.length,
            total: teamInfo.members.length,
            list: list.trim()
          });
        } catch (error) {
          return cmd('online', 'error');
        }
      }
    });

    // 只有在 eventMonitorService 可用时才注册事件命令
    if (this.eventMonitorService) {
      this.registerEventCommands();
    }
  }

  /**
   * 注册事件相关命令
   */
  registerEventCommands() {
    // !cargo - 查询货船状态
    const cargoConfig = cmdConfig('cargo');
    this.registerCommand('cargo', {
      description: cargoConfig.desc,
      usage: '!cargo',
      handler: async (serverId, args, context) => {
        try {
          const markers = await this.rustPlusService.getMapMarkers(serverId);
          const cargoShips = markers.markers ? markers.markers.filter(m => m.type === 5) : [];

          if (cargoShips.length === 0) {
            return cmd('cargo', 'empty');
          }

          const mapSize = this.rustPlusService.getMapSize(serverId);
          let messages = [];

          for (const ship of cargoShips) {
            const position = formatPosition(ship.x, ship.y, mapSize);
            const timeLeft = EventTimerManager.getTimeLeft(`cargo_egress_${ship.id}`, serverId);

            if (timeLeft > 0) {
              const minutesLeft = Math.floor(timeLeft / 60000);
              messages.push(cmd('cargo', 'msg', { position, minutes: minutesLeft }));
            } else {
              messages.push(cmd('cargo', 'msg_active', { position }));
            }
          }

          return messages.join('\n');
        } catch (error) {
          return cmd('cargo', 'error');
        }
      }
    });

    // !small - 查询小油井状态
    const smallConfig = cmdConfig('small');
    this.registerCommand('small', {
      description: smallConfig.desc,
      usage: '!small',
      handler: async (serverId, args, context) => {
        try {
          const eventData = this.eventMonitorService.getEventData(serverId);
          if (!eventData || !eventData.lastEvents) {
            return cmd('small', 'error');
          }

          const lastTriggered = eventData.lastEvents.smallOilRigTriggered;
          if (!lastTriggered) {
            return cmd('small', 'empty');
          }

          const timeSinceTriggered = Date.now() - lastTriggered;
          const minutesSince = Math.floor(timeSinceTriggered / 60000);
          const crateTimeLeft = EventTimerManager.getTimeLeft('small_oil_rig_crate', serverId);

          if (crateTimeLeft > 0) {
            const minutesLeft = Math.floor(crateTimeLeft / 60000);
            return cmd('small', 'msg_triggered', { minutesSince, minutesLeft });
          } else if (timeSinceTriggered < 60 * 60 * 1000) {
            return cmd('small', 'msg_unlocked', { minutesSince });
          } else {
            return cmd('small', 'msg_old', { minutesSince });
          }
        } catch (error) {
          return cmd('small', 'error');
        }
      }
    });

    // !large - 查询大油井状态
    const largeConfig = cmdConfig('large');
    this.registerCommand('large', {
      description: largeConfig.desc,
      usage: '!large',
      handler: async (serverId, args, context) => {
        try {
          const eventData = this.eventMonitorService.getEventData(serverId);
          if (!eventData || !eventData.lastEvents) {
            return cmd('large', 'error');
          }

          const lastTriggered = eventData.lastEvents.largeOilRigTriggered;
          if (!lastTriggered) {
            return cmd('large', 'empty');
          }

          const timeSinceTriggered = Date.now() - lastTriggered;
          const minutesSince = Math.floor(timeSinceTriggered / 60000);
          const crateTimeLeft = EventTimerManager.getTimeLeft('large_oil_rig_crate', serverId);

          if (crateTimeLeft > 0) {
            const minutesLeft = Math.floor(crateTimeLeft / 60000);
            return cmd('large', 'msg_triggered', { minutesSince, minutesLeft });
          } else if (timeSinceTriggered < 60 * 60 * 1000) {
            return cmd('large', 'msg_unlocked', { minutesSince });
          } else {
            return cmd('large', 'msg_old', { minutesSince });
          }
        } catch (error) {
          return cmd('large', 'error');
        }
      }
    });

    // !heli - 查询武装直升机状态
    const heliConfig = cmdConfig('heli');
    this.registerCommand('heli', {
      description: heliConfig.desc,
      usage: '!heli',
      handler: async (serverId, args, context) => {
        try {
          const markers = await this.rustPlusService.getMapMarkers(serverId);
          const helicopters = markers.markers ? markers.markers.filter(m => m.type === 8) : [];

          if (helicopters.length === 0) {
            return cmd('heli', 'empty');
          }

          const mapSize = this.rustPlusService.getMapSize(serverId);
          let messages = [];

          for (const heli of helicopters) {
            const position = formatPosition(heli.x, heli.y, mapSize);
            messages.push(cmd('heli', 'msg', { position }));
          }

          return messages.join('\n');
        } catch (error) {
          return cmd('heli', 'error');
        }
      }
    });

    // !events - 查看所有活跃事件
    const eventsConfig = cmdConfig('events');
    this.registerCommand('events', {
      description: eventsConfig.desc,
      usage: '!events',
      handler: async (serverId, args, context) => {
        try {
          const markers = await this.rustPlusService.getMapMarkers(serverId);
          const mapSize = this.rustPlusService.getMapSize(serverId);

          let messages = [cmd('events', 'header')];
          let eventCount = 0;

          // 货船
          const cargoShips = markers.markers ? markers.markers.filter(m => m.type === 5) : [];
          if (cargoShips.length > 0) {
            eventCount++;
            for (const ship of cargoShips) {
              const position = formatPosition(ship.x, ship.y, mapSize);
              const timeLeft = EventTimerManager.getTimeLeft(`cargo_egress_${ship.id}`, serverId);

              if (timeLeft > 0) {
                const minutes = Math.floor(timeLeft / 60000);
                messages.push(cmd('events', 'cargo', { position, minutes }));
              } else {
                messages.push(cmd('events', 'cargo_active', { position }));
              }
            }
          }

          // 直升机
          const helicopters = markers.markers ? markers.markers.filter(m => m.type === 8) : [];
          if (helicopters.length > 0) {
            eventCount++;
            for (const heli of helicopters) {
              const position = formatPosition(heli.x, heli.y, mapSize);
              messages.push(cmd('events', 'heli', { position }));
            }
          }

          // CH47
          const ch47s = markers.markers ? markers.markers.filter(m => m.type === 4) : [];
          if (ch47s.length > 0) {
            eventCount++;
            messages.push(cmd('events', 'ch47', { count: ch47s.length }));
          }

          // 上锁箱子
          const crates = markers.markers ? markers.markers.filter(m => m.type === 6) : [];
          if (crates.length > 0) {
            eventCount++;
            messages.push(cmd('events', 'crate', { count: crates.length }));
          }

          // 油井箱子计时器
          const smallCrateTime = EventTimerManager.getTimeLeft('small_oil_rig_crate', serverId);
          if (smallCrateTime > 0) {
            eventCount++;
            const minutes = Math.floor(smallCrateTime / 60000);
            messages.push(cmd('events', 'small_crate', { minutes }));
          }

          const largeCrateTime = EventTimerManager.getTimeLeft('large_oil_rig_crate', serverId);
          if (largeCrateTime > 0) {
            eventCount++;
            const minutes = Math.floor(largeCrateTime / 60000);
            messages.push(cmd('events', 'large_crate', { minutes }));
          }

          if (eventCount === 0) {
            return cmd('events', 'empty');
          }

          return messages.join('\n');
        } catch (error) {
          return cmd('events', 'error');
        }
      }
    });

    // !history - 查看所有事件历史
    const historyConfig = cmdConfig('history');
    this.registerCommand('history', {
      description: historyConfig.desc,
      usage: '!history',
      handler: async (serverId, args, context) => {
        try {
          const eventData = this.eventMonitorService.getEventData(serverId);
          if (!eventData || !eventData.lastEvents) {
            return cmd('history', 'error');
          }

          const lastEvents = eventData.lastEvents;
          const now = Date.now();
          const messages = [cmd('history', 'header')];
          let hasAnyEvent = false;

          // 格式化时间差
          const formatTimeSince = (timestamp) => {
            if (!timestamp) return '从未触发';
            const diff = now - timestamp;
            const minutes = Math.floor(diff / 60000);
            const hours = Math.floor(minutes / 60);

            if (minutes < 1) return '刚刚';
            if (minutes < 60) return `${minutes}分钟前`;
            if (hours < 24) return `${hours}小时前`;
            const days = Math.floor(hours / 24);
            return `${days}天前`;
          };

          // 添加各类事件历史
          if (lastEvents.cargoShipSpawn) {
            hasAnyEvent = true;
            messages.push(cmd('history', 'cargo_spawn', { time: formatTimeSince(lastEvents.cargoShipSpawn) }));
          }
          if (lastEvents.cargoShipLeave) {
            hasAnyEvent = true;
            messages.push(cmd('history', 'cargo_leave', { time: formatTimeSince(lastEvents.cargoShipLeave) }));
          }
          if (lastEvents.smallOilRigTriggered) {
            hasAnyEvent = true;
            messages.push(cmd('history', 'small_triggered', { time: formatTimeSince(lastEvents.smallOilRigTriggered) }));
          }
          if (lastEvents.smallOilRigCrateUnlocked) {
            hasAnyEvent = true;
            messages.push(cmd('history', 'small_unlocked', { time: formatTimeSince(lastEvents.smallOilRigCrateUnlocked) }));
          }
          if (lastEvents.largeOilRigTriggered) {
            hasAnyEvent = true;
            messages.push(cmd('history', 'large_triggered', { time: formatTimeSince(lastEvents.largeOilRigTriggered) }));
          }
          if (lastEvents.largeOilRigCrateUnlocked) {
            hasAnyEvent = true;
            messages.push(cmd('history', 'large_unlocked', { time: formatTimeSince(lastEvents.largeOilRigCrateUnlocked) }));
          }
          if (lastEvents.patrolHeliSpawn) {
            hasAnyEvent = true;
            messages.push(cmd('history', 'heli_spawn', { time: formatTimeSince(lastEvents.patrolHeliSpawn) }));
          }
          if (lastEvents.patrolHeliDowned) {
            hasAnyEvent = true;
            messages.push(cmd('history', 'heli_downed', { time: formatTimeSince(lastEvents.patrolHeliDowned) }));
          }
          if (lastEvents.patrolHeliLeave) {
            hasAnyEvent = true;
            messages.push(cmd('history', 'heli_leave', { time: formatTimeSince(lastEvents.patrolHeliLeave) }));
          }
          if (lastEvents.ch47Spawn) {
            hasAnyEvent = true;
            messages.push(cmd('history', 'ch47_spawn', { time: formatTimeSince(lastEvents.ch47Spawn) }));
          }
          if (lastEvents.lockedCrateSpawn) {
            hasAnyEvent = true;
            messages.push(cmd('history', 'crate_spawn', { time: formatTimeSince(lastEvents.lockedCrateSpawn) }));
          }
          if (lastEvents.raidDetected) {
            hasAnyEvent = true;
            messages.push(cmd('history', 'raid', { time: formatTimeSince(lastEvents.raidDetected) }));
          }

          if (!hasAnyEvent) {
            return cmd('history', 'empty');
          }

          return messages.join('\n');
        } catch (error) {
          return cmd('history', 'error');
        }
      }
    });
  }

  /**
   * 记录玩家人数（用于统计变化）
   */
  recordPlayerCount(serverId, count, queued = 0) {
    if (!this.playerCountHistory) {
      this.playerCountHistory = new Map();
    }

    if (!this.playerCountHistory.has(serverId)) {
      this.playerCountHistory.set(serverId, []);
    }

    const history = this.playerCountHistory.get(serverId);
    const now = Date.now();

    // 添加当前记录
    history.push({ time: now, count, queued });

    // 只保留最近1小时的数据
    const oneHourAgo = now - 60 * 60 * 1000;
    const filtered = history.filter(record => record.time >= oneHourAgo);
    this.playerCountHistory.set(serverId, filtered);
  }

  /**
   * 获取30分钟内的人数变化
   */
  getPlayerCountChange(serverId) {
    if (!this.playerCountHistory || !this.playerCountHistory.has(serverId)) {
      return 0;
    }

    const history = this.playerCountHistory.get(serverId);
    if (history.length === 0) return 0;

    const now = Date.now();
    const thirtyMinutesAgo = now - 30 * 60 * 1000;

    // 找到30分钟前最接近的记录
    const oldRecord = history.find(r => r.time <= thirtyMinutesAgo) || history[0];
    const currentRecord = history[history.length - 1];

    return currentRecord.count - oldRecord.count;
  }


  /**
   * 注册自定义命令
   */
  registerCommand(name, config) {
    if (!config.handler || typeof config.handler !== 'function') {
      throw new Error(`Command ${name} must provide a handler function`);
    }

    this.commands.set(name.toLowerCase(), {
      name,
      description: config.description || 'No description',
      usage: config.usage || `!${name}`,
      handler: config.handler,
      adminOnly: config.adminOnly || false
    });

    console.log(`✅ Registered command: !${name}`);
  }

  /**
   * 取消注册命令
   */
  unregisterCommand(name) {
    return this.commands.delete(name.toLowerCase());
  }

  /**
   * 处理消息，检查是否为命令
   */
  async handleMessage(serverId, messageData) {
    const { message, name, steamId } = messageData;

    // 检查是否为命令
    if (!message.startsWith(this.commandPrefix)) {
      return false;
    }

    // 解析命令
    const parts = message.slice(this.commandPrefix.length).trim().split(/\s+/);
    const commandName = parts[0].toLowerCase();
    const args = parts.slice(1);

    console.log(`🎮 Received command: !${commandName} (from ${name})`);

    // 查找命令
    const command = this.commands.get(commandName);
    if (!command) {
      await this.rustPlusService.sendTeamMessage(
        serverId,
        cmd('unknown', 'msg', { cmd: commandName })
      );
      return true;
    }

    try {
      // 执行命令
      const context = { name, steamId, message };
      const response = await command.handler(serverId, args, context);

      // 发送响应
      if (response) {
        await this.rustPlusService.sendTeamMessage(serverId, response);
      }

      console.log(`✅ Command executed: !${commandName}`);
      return true;
    } catch (error) {
      console.error(`❌ Command failed !${commandName}:`, error);
      await this.rustPlusService.sendTeamMessage(serverId, cmd('error', 'msg'));
      return true;
    }
  }

  /**
   * 获取所有命令列表
   */
  getCommandList() {
    return Array.from(this.commands.values()).map(cmd => ({
      name: cmd.name,
      description: cmd.description,
      usage: cmd.usage,
      adminOnly: cmd.adminOnly
    }));
  }
}

export default CommandsService;
