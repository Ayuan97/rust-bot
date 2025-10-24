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
    this.playerPositionHistory = new Map(); // 存储玩家位置历史记录
    this.afkNotifiedPlayers = new Map(); // 存储已通知的挂机玩家 serverId -> Map(steamId -> {name, afkStartTime})
    this.playerSessionData = new Map(); // 存储玩家会话数据 serverId -> Map(steamId -> {name, onlineTime, offlineTime})

    // 注册内置命令
    this.registerBuiltInCommands();

    // 启动定期检测挂机玩家
    this.startAfkDetection();

    // 启动定期记录服务器人数
    this.startPlayerCountTracking();

    // 监听玩家上下线事件
    this.setupPlayerEventListeners();
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
        // 获取所有命令并分类
        const allCmds = allCommands();

        // 基础命令
        const basicCmds = ['help', 'time', 'pop', 'team', 'online'];
        // 事件命令
        const eventCmds = ['cargo', 'small', 'large', 'heli', 'events', 'history', 'shop'];

        let messages = ['可用命令:'];

        // 基础命令分组
        const basicList = allCmds
          .filter(c => basicCmds.includes(c.name))
          .map(c => `!${c.name} - ${c.desc}`)
          .join(' | ');
        if (basicList) {
          messages.push(`[基础] ${basicList}`);
        }

        // 事件命令分组
        const eventList = allCmds
          .filter(c => eventCmds.includes(c.name))
          .map(c => `!${c.name} - ${c.desc}`)
          .join(' | ');
        if (eventList) {
          messages.push(`[事件] ${eventList}`);
        }

        return messages.join('\n');
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

          const sunrise = timeInfo.sunrise || 6.5;  // 修正日出时间
          const sunset = timeInfo.sunset || 18.5;   // 修正日落时间
          const dayLengthMinutes = timeInfo.dayLengthMinutes || 45;

          const isDaytime = currentTime >= sunrise && currentTime < sunset;

          // 计算距离下次昼夜变化的时间（游戏时间）
          let nextChangeTime;
          let changeType;

          if (isDaytime) {
            nextChangeTime = sunset;
            changeType = 'night';
          } else {
            if (currentTime < sunrise) {
              nextChangeTime = sunrise;
            } else {
              nextChangeTime = 24 + sunrise;
            }
            changeType = 'day';
          }

          // 游戏时间差（小时）
          const gameTimeDiff = nextChangeTime - currentTime;

          // 转换为真实时间（分钟），使用 ceil 向上取整
          const realMinutes = Math.ceil(gameTimeDiff * (dayLengthMinutes / 24));

          // 优化显示
          if (realMinutes <= 0) {
            if (changeType === 'night') {
              return `当前时间 ${timeStr} 即将天黑`;
            } else {
              return `当前时间 ${timeStr} 即将天亮`;
            }
          } else {
            if (changeType === 'night') {
              return `当前时间 ${timeStr} 还有 ${realMinutes} 分钟天黑`;
            } else {
              return `当前时间 ${timeStr} 还有 ${realMinutes} 分钟天亮`;
            }
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

          // 获取30分钟内的人数变化（累计加入和离开）
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
            // 如果加入和离开都为0，不展示变化
            if (change.joined === 0 && change.left === 0) {
              return cmd('pop', 'msg_no_change', {
                current,
                max: maxPlayers
              });
            } else {
              // 构建变化文本：+X -Y (净变化)
              const parts = [];
              if (change.joined > 0) parts.push(`+${change.joined}`);
              if (change.left > 0) parts.push(`-${change.left}`);

              let changeText = parts.join(' ');

              // 添加净变化提示
              if (change.net > 0) {
                changeText += ` (净增${change.net})`;
              } else if (change.net < 0) {
                changeText += ` (净减${Math.abs(change.net)})`;
              }

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
          const offlineMembers = teamInfo.members.filter(m => !m.isOnline);

          // 检测挂机玩家
          const afkPlayers = [];
          for (const member of onlineMembers) {
            const afkTime = this.getPlayerAfkTime(serverId, member.steamId);
            if (afkTime >= 3) { // 挂机3分钟以上
              afkPlayers.push({
                name: member.name,
                afkTime: afkTime
              });
            }
          }

          // 构建消息数组
          const messages = [];

          // 第一行：统计信息
          const stats = [`团队人员(${onlineMembers.length}/${teamInfo.members.length})`];
          if (afkPlayers.length > 0) {
            stats.push(`挂机人员(${afkPlayers.length})`);
          }
          if (offlineMembers.length > 0) {
            stats.push(`离线人员(${offlineMembers.length})`);
          }
          messages.push(stats.join(' '));

          // 第二行：挂机玩家详情
          if (afkPlayers.length > 0) {
            const afkList = afkPlayers.map(p => `${p.name}(挂机${p.afkTime}分钟)`).join(' ');
            messages.push(afkList);
          }

          // 第三行：离线玩家详情（显示最后在线时间）
          if (offlineMembers.length > 0) {
            const offlineList = offlineMembers.map(m => {
              // 获取最后在线时间
              const lastOnlineTime = this.getPlayerLastOnlineTime(serverId, m.steamId);
              return `${m.name}(${lastOnlineTime})`;
            }).join(' ');
            messages.push(offlineList);
          }

          return messages.join('\n');
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

          // 构建玩家状态列表（使用符号标记更优雅）
          const playerList = onlineMembers.map(m => {
            const statusSymbol = m.isAlive ? '✓' : '✗';

            // 检查是否挂机
            const afkTime = this.getPlayerAfkTime(serverId, m.steamId);
            const afkSuffix = afkTime >= 3 ? ',挂机' : '';

            return `${m.name}${statusSymbol}${afkSuffix}`;
          }).join(' ');

          return `在线${onlineMembers.length}/${teamInfo.members.length}: ${playerList}`;
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

    // !shop - 搜索售货机
    const shopConfig = cmdConfig('shop') || {};
    this.registerCommand('shop', {
      description: shopConfig.desc || '搜索售货机物品',
      usage: '!shop [物品名称]',
      handler: async (serverId, args, context) => {
        try {
          const markers = await this.rustPlusService.getMapMarkers(serverId);
          const vendingMachines = markers.markers ? markers.markers.filter(m => m.type === 3) : [];

          if (vendingMachines.length === 0) {
            return cmd('shop', 'empty');
          }

          const mapSize = this.rustPlusService.getMapSize(serverId);
          const { getItemName, getItemShortName, isImportantItem } = await import('../utils/item-info.js');

          // 如果没有提供搜索参数，只显示售货机数量
          if (args.length === 0) {
            return cmd('shop', 'summary', { count: vendingMachines.length });
          }

          // 搜索指定物品
          const searchTerm = args.join(' ');
          const foundItems = [];

          for (const vm of vendingMachines) {
            if (!vm.sellOrders || vm.sellOrders.length === 0) continue;

            const position = formatPosition(vm.x, vm.y, mapSize);

            for (const order of vm.sellOrders) {
              const itemName = getItemName(order.itemId);
              if (itemName.includes(searchTerm)) {
                foundItems.push({
                  position,
                  itemName,
                  itemId: order.itemId,  // 添加 itemId
                  quantity: order.quantity,
                  stock: order.amountInStock,
                  costPerItem: order.costPerItem,
                  currencyId: order.currencyId
                });
              }
            }
          }

          if (foundItems.length === 0) {
            return cmd('shop', 'not_found', { item: searchTerm });
          }

          // 限制显示数量
          const MAX_DISPLAY = 10;
          const itemsToDisplay = foundItems.slice(0, MAX_DISPLAY);
          const hasMore = foundItems.length > MAX_DISPLAY;

          // 发送第一条消息：找到多少个
          let summaryMessage = cmd('shop', 'found', { item: searchTerm, count: foundItems.length });
          if (hasMore) {
            summaryMessage += `（仅显示前${MAX_DISPLAY}个）`;
          }
          await this.rustPlusService.sendTeamMessage(serverId, summaryMessage);

          // 逐条发送每个物品信息（最多10个）
          for (const item of itemsToDisplay) {
            // 获取物品表情（如果找不到就用物品名称）
            const itemShortName = getItemShortName(item.itemId);
            const currencyShortName = getItemShortName(item.currencyId);

            const itemDisplay = itemShortName !== 'unknown' ? `:${itemShortName}:` : getItemName(item.itemId);
            const currencyDisplay = currencyShortName !== 'unknown' ? `:${currencyShortName}:` : getItemName(item.currencyId);

            // 优化消息格式：位置 | 物品x数量 | 价格 | 库存
            const message = `${item.position} | ${itemDisplay}x${item.quantity} | ${item.costPerItem}${currencyDisplay} | 库存${item.stock}`;
            await this.rustPlusService.sendTeamMessage(serverId, message);
            // 延迟100ms，避免消息发送过快
            await new Promise(resolve => setTimeout(resolve, 100));
          }

          return null; // 已经发送过消息，不需要返回
        } catch (error) {
          return cmd('shop', 'error');
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
   * 获取30分钟内的人数变化（累计加入和离开）
   * @returns {{ joined: number, left: number, net: number }} 加入人数、离开人数、净变化
   */
  getPlayerCountChange(serverId) {
    if (!this.playerCountHistory || !this.playerCountHistory.has(serverId)) {
      return { joined: 0, left: 0, net: 0 };
    }

    const history = this.playerCountHistory.get(serverId);
    if (history.length < 2) {
      return { joined: 0, left: 0, net: 0 };
    }

    const now = Date.now();
    const thirtyMinutesAgo = now - 30 * 60 * 1000;

    // 筛选出30分钟内的记录
    const recentHistory = history.filter(r => r.time >= thirtyMinutesAgo);

    // 如果没有足够的历史数据
    if (recentHistory.length < 2) {
      return { joined: 0, left: 0, net: 0 };
    }

    // 计算累计加入和离开人数
    let totalJoined = 0;
    let totalLeft = 0;

    for (let i = 1; i < recentHistory.length; i++) {
      const prev = recentHistory[i - 1].count;
      const current = recentHistory[i].count;
      const change = current - prev;

      if (change > 0) {
        totalJoined += change;  // 人数增加 = 有人加入
      } else if (change < 0) {
        totalLeft += Math.abs(change);  // 人数减少 = 有人离开
      }
    }

    const netChange = totalJoined - totalLeft;

    return {
      joined: totalJoined,
      left: totalLeft,
      net: netChange
    };
  }

  /**
   * 设置玩家事件监听器
   */
  setupPlayerEventListeners() {
    // 监听玩家上线事件
    this.rustPlusService.on('player:online', async (data) => {
      await this.handlePlayerOnline(data.serverId, data.steamId, data.name);
    });

    // 监听玩家下线事件
    this.rustPlusService.on('player:offline', async (data) => {
      await this.handlePlayerOffline(data.serverId, data.steamId, data.name);
    });

    console.log('[系统] 玩家上下线监听器已启动');
  }

  /**
   * 处理玩家上线
   */
  async handlePlayerOnline(serverId, steamId, playerName) {
    // 初始化会话数据
    if (!this.playerSessionData.has(serverId)) {
      this.playerSessionData.set(serverId, new Map());
    }

    const sessionMap = this.playerSessionData.get(serverId);
    const steamIdStr = steamId.toString();

    // 检查是否有离线记录
    if (sessionMap.has(steamIdStr)) {
      const sessionData = sessionMap.get(steamIdStr);

      // 计算离线时长
      if (sessionData.offlineTime) {
        const offlineDuration = Date.now() - sessionData.offlineTime;
        const offlineDurationText = this.formatDuration(offlineDuration);

        // 构建上线通知消息
        const message = `[上线] ${playerName} 在离线 ${offlineDurationText} 后回来了`;

        try {
          await this.rustPlusService.sendTeamMessage(serverId, message);
          console.log(`[上线通知] ${playerName} 离线了 ${offlineDurationText}`);
        } catch (error) {
          console.error(`[错误] 发送上线通知失败:`, error.message);
        }
      }
    }

    // 更新会话数据（重置会话）
    sessionMap.set(steamIdStr, {
      name: playerName,
      onlineTime: Date.now(),
      offlineTime: null,
      afkInfo: null
    });

    // 清除挂机记录（新的游戏会话）
    if (this.afkNotifiedPlayers.has(serverId)) {
      const notifiedMap = this.afkNotifiedPlayers.get(serverId);
      notifiedMap.delete(steamIdStr);
    }
  }

  /**
   * 处理玩家下线
   */
  async handlePlayerOffline(serverId, steamId, playerName) {
    if (!this.playerSessionData.has(serverId)) {
      return;
    }

    const sessionMap = this.playerSessionData.get(serverId);
    const steamIdStr = steamId.toString();

    // 获取会话数据
    const sessionData = sessionMap.get(steamIdStr);
    if (!sessionData || !sessionData.onlineTime) {
      return;
    }

    // 计算今日游玩时长
    const playDuration = Date.now() - sessionData.onlineTime;
    const durationText = this.formatDuration(playDuration);

    // 检查是否有挂机记录
    let afkInfo = null;
    if (this.afkNotifiedPlayers.has(serverId)) {
      const notifiedMap = this.afkNotifiedPlayers.get(serverId);
      if (notifiedMap.has(steamIdStr)) {
        const afkRecord = notifiedMap.get(steamIdStr);
        const afkDuration = Date.now() - afkRecord.afkStartTime;
        afkInfo = {
          duration: afkDuration,
          durationText: this.formatDuration(afkDuration)
        };
      }
    }

    // 更新离线时间，并保存挂机信息
    sessionData.offlineTime = Date.now();
    sessionData.afkInfo = afkInfo; // 保存挂机信息供上线时使用
    sessionMap.set(steamIdStr, sessionData);

    // 构建下线通知消息
    let message = `[下线] ${playerName} 今天游玩了 ${durationText}`;
    if (afkInfo) {
      message += ` (其中挂机 ${afkInfo.durationText})`;
    }

    try {
      await this.rustPlusService.sendTeamMessage(serverId, message);
      console.log(`[下线通知] ${playerName} 游玩了 ${durationText}${afkInfo ? ` (挂机 ${afkInfo.durationText})` : ''}`);
    } catch (error) {
      console.error(`[错误] 发送下线通知失败:`, error.message);
    }

    // 不清除挂机记录，保留到上线时处理
  }

  /**
   * 格式化时长
   */
  formatDuration(milliseconds) {
    const hours = Math.floor(milliseconds / (60 * 60 * 1000));
    const minutes = Math.floor((milliseconds % (60 * 60 * 1000)) / (60 * 1000));

    if (hours > 0) {
      return `${hours}小时${minutes}分钟`;
    } else {
      return `${minutes}分钟`;
    }
  }

  /**
   * 启动定期记录服务器人数
   */
  startPlayerCountTracking() {
    // 每2分钟自动记录一次服务器人数
    this.playerCountTrackingInterval = setInterval(async () => {
      const connectedServers = this.rustPlusService.getConnectedServers();

      for (const serverId of connectedServers) {
        try {
          const info = await this.rustPlusService.getServerInfo(serverId);
          const current = info.players || 0;
          const queued = info.queuedPlayers || 0;

          // 自动记录人数
          this.recordPlayerCount(serverId, current, queued);
        } catch (error) {
          // 静默失败，避免日志过多
        }
      }
    }, 2 * 60 * 1000); // 每2分钟

    console.log('✅ 服务器人数追踪已启动（每2分钟记录一次）');
  }

  /**
   * 停止人数追踪
   */
  stopPlayerCountTracking() {
    if (this.playerCountTrackingInterval) {
      clearInterval(this.playerCountTrackingInterval);
      this.playerCountTrackingInterval = null;
      console.log('✅ 服务器人数追踪已停止');
    }
  }

  /**
   * 启动挂机检测定时任务
   */
  startAfkDetection() {
    // 每30秒检测一次玩家位置
    this.afkDetectionInterval = setInterval(() => {
      this.checkPlayerPositions();
    }, 30 * 1000);

    console.log('✅ 挂机检测系统已启动（每30秒检测一次）');
  }

  /**
   * 停止挂机检测
   */
  stopAfkDetection() {
    if (this.afkDetectionInterval) {
      clearInterval(this.afkDetectionInterval);
      this.afkDetectionInterval = null;
      console.log('✅ 挂机检测系统已停止');
    }
  }

  /**
   * 检测所有服务器的玩家位置
   */
  async checkPlayerPositions() {
    const connectedServers = this.rustPlusService.getConnectedServers();

    console.log(`[AFK检测] 开始检测，已连接服务器数: ${connectedServers.length}`);

    for (const serverId of connectedServers) {
      try {
        const teamInfo = await this.rustPlusService.getTeamInfo(serverId);
        if (!teamInfo.members || teamInfo.members.length === 0) {
          console.log(`[AFK检测] 服务器 ${serverId} 无队员`);
          continue;
        }

        console.log(`[AFK检测] 服务器 ${serverId} 队员数: ${teamInfo.members.length}`);

        // 获取地图大小（用于坐标转换）
        const mapSize = this.rustPlusService.getMapSize(serverId);

        // 更新每个玩家的位置历史
        for (const member of teamInfo.members) {
          if (!member.isOnline) {
            // 玩家离线，不清除通知记录（等玩家上线后再处理）
            continue;
          }

          console.log(`[AFK检测] 玩家 ${member.name} 位置: (${member.x}, ${member.y})`);

          this.updatePlayerPosition(serverId, member.steamId, {
            x: member.x,
            y: member.y,
            isAlive: member.isAlive,
            timestamp: Date.now(),
            name: member.name
          });

          // 检测挂机并通知
          const afkTime = this.getPlayerAfkTime(serverId, member.steamId);
          console.log(`[AFK检测] 玩家 ${member.name} 挂机时长: ${afkTime} 分钟`);

          if (afkTime >= 3) {
            await this.notifyAfkPlayer(serverId, member, afkTime, mapSize);
          } else {
            // 不再挂机，检查是否需要发送回归通知
            await this.notifyPlayerReturn(serverId, member);
          }
        }
      } catch (error) {
        console.error(`[AFK检测] 检测失败:`, error.message);
      }
    }
  }

  /**
   * 更新玩家位置历史
   */
  updatePlayerPosition(serverId, steamId, positionData) {
    if (!this.playerPositionHistory.has(serverId)) {
      this.playerPositionHistory.set(serverId, new Map());
    }

    const serverHistory = this.playerPositionHistory.get(serverId);

    if (!serverHistory.has(steamId)) {
      serverHistory.set(steamId, []);
    }

    const playerHistory = serverHistory.get(steamId);
    playerHistory.push(positionData);

    // 只保留最近10分钟的数据
    const tenMinutesAgo = Date.now() - 10 * 60 * 1000;
    const filtered = playerHistory.filter(p => p.timestamp >= tenMinutesAgo);
    serverHistory.set(steamId, filtered);
  }

  /**
   * 通知挂机玩家
   */
  async notifyAfkPlayer(serverId, member, afkTime, mapSize) {
    // 初始化通知记录
    if (!this.afkNotifiedPlayers.has(serverId)) {
      this.afkNotifiedPlayers.set(serverId, new Map());
    }

    const notifiedMap = this.afkNotifiedPlayers.get(serverId);
    const steamId = member.steamId.toString();

    // 如果已经通知过，不再重复通知
    if (notifiedMap.has(steamId)) {
      return;
    }

    // 记录真实的挂机开始时间（当前时间 - 已经挂机的时长）
    const realAfkStartTime = Date.now() - (afkTime * 60 * 1000);

    notifiedMap.set(steamId, {
      name: member.name,
      afkStartTime: realAfkStartTime  // 使用真实的开始时间，而不是通知时间
    });

    // 格式化位置
    const position = formatPosition(member.x, member.y, mapSize);

    // 发送通知
    const message = `[挂机检测] ${member.name} 在 ${position} 挂机 ${afkTime} 分钟`;

    try {
      await this.rustPlusService.sendTeamMessage(serverId, message);
      console.log(`[挂机通知] ${member.name} (${afkTime}分钟) at ${position}`);
    } catch (error) {
      console.error(`[错误] 发送挂机通知失败:`, error.message);
    }
  }

  /**
   * 通知玩家回归
   */
  async notifyPlayerReturn(serverId, member) {
    if (!this.afkNotifiedPlayers.has(serverId)) {
      return;
    }

    const notifiedMap = this.afkNotifiedPlayers.get(serverId);
    const steamId = member.steamId.toString();

    // 检查是否有挂机记录
    if (!notifiedMap.has(steamId)) {
      return;
    }

    // 获取挂机记录
    const afkRecord = notifiedMap.get(steamId);
    const afkDuration = Date.now() - afkRecord.afkStartTime;
    const durationText = this.formatDuration(afkDuration);

    // 发送回归通知
    const message = `[回归] 玩家 "${member.name}" 在挂机 ${durationText} 后回来了`;

    try {
      await this.rustPlusService.sendTeamMessage(serverId, message);
      console.log(`[回归通知] ${member.name} 挂机了 ${durationText}`);
    } catch (error) {
      console.error(`[错误] 发送回归通知失败:`, error.message);
    }

    // 清除挂机记录
    notifiedMap.delete(steamId);
  }

  /**
   * 检测玩家是否挂机
   * @returns {minutes} 挂机时长（分钟），0 表示不挂机
   */
  getPlayerAfkTime(serverId, steamId) {
    if (!this.playerPositionHistory.has(serverId)) {
      console.log(`[AFK计算] 服务器 ${serverId} 无位置历史`);
      return 0;
    }

    const serverHistory = this.playerPositionHistory.get(serverId);
    if (!serverHistory.has(steamId)) {
      console.log(`[AFK计算] 玩家 ${steamId} 无位置历史`);
      return 0;
    }

    const playerHistory = serverHistory.get(steamId);
    console.log(`[AFK计算] 玩家 ${steamId} 位置历史记录数: ${playerHistory.length}`);

    if (playerHistory.length < 2) {
      console.log(`[AFK计算] 位置记录不足2条，跳过`);
      return 0;
    }

    // 检查最近的位置记录
    const now = Date.now();
    const threeMinutesAgo = now - 3 * 60 * 1000;

    // 获取3分钟前的位置记录
    const oldPositions = playerHistory.filter(p => p.timestamp <= threeMinutesAgo);
    console.log(`[AFK计算] 3分钟前的位置记录数: ${oldPositions.length}`);

    if (oldPositions.length === 0) {
      console.log(`[AFK计算] 数据不足3分钟，跳过`);
      return 0; // 数据不足3分钟
    }

    // 最新位置
    const currentPosition = playerHistory[playerHistory.length - 1];
    console.log(`[AFK计算] 当前位置: (${currentPosition.x}, ${currentPosition.y})`);

    // 查找最早开始静止的位置（向前追溯）
    let afkStartTime = null;

    // 从3分钟前开始，检查所有位置是否都在原地（严格比对坐标）
    for (const position of oldPositions) {
      // 严格比对 x 和 y 坐标是否完全相同
      const isSamePosition = (position.x === currentPosition.x && position.y === currentPosition.y);
      console.log(`[AFK计算] 比对位置 (${position.x}, ${position.y}) vs (${currentPosition.x}, ${currentPosition.y}) = ${isSamePosition}`);

      if (isSamePosition) {
        // 记录第一个静止的时间点
        if (!afkStartTime) {
          afkStartTime = position.timestamp;
          console.log(`[AFK计算] 找到静止起点时间: ${new Date(afkStartTime).toISOString()}`);
        }
      } else {
        // 如果发现有移动，重置记录
        console.log(`[AFK计算] 发现移动，重置静止记录`);
        afkStartTime = null;
      }
    }

    // 如果找到了连续静止的起点
    if (afkStartTime) {
      const afkDuration = now - afkStartTime;
      const afkMinutes = Math.floor(afkDuration / 60000);
      console.log(`[AFK计算] 挂机时长: ${afkMinutes} 分钟`);

      // 至少挂机3分钟才返回
      return afkMinutes >= 3 ? afkMinutes : 0;
    }

    console.log(`[AFK计算] 未找到连续静止，返回0`);
    return 0;
  }

  /**
   * 获取玩家最后在线时间（格式化为"X小时前"/"X天前"）
   * @returns {string} 格式化的时间字符串
   */
  getPlayerLastOnlineTime(serverId, steamId) {
    if (!this.playerSessionData.has(serverId)) {
      return '未知';
    }

    const sessionMap = this.playerSessionData.get(serverId);
    const steamIdStr = steamId.toString();

    if (!sessionMap.has(steamIdStr)) {
      return '未知';
    }

    const sessionData = sessionMap.get(steamIdStr);
    if (!sessionData.offlineTime) {
      return '刚刚离线';
    }

    const now = Date.now();
    const timeSinceOffline = now - sessionData.offlineTime;

    // 格式化时间差
    const minutes = Math.floor(timeSinceOffline / (60 * 1000));
    const hours = Math.floor(minutes / 60);
    const days = Math.floor(hours / 24);

    if (minutes < 1) {
      return '刚刚离线';
    } else if (minutes < 60) {
      return `${minutes}分钟前`;
    } else if (hours < 24) {
      return `${hours}小时前`;
    } else {
      return `${days}天前`;
    }
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
