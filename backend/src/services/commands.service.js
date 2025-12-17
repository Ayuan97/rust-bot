/**
 * 游戏内命令处理服务
 * 处理以 ! 开头的队伍聊天命令
 */

import { cmd, cmdConfig, allCommands, notify } from '../utils/messages.js';
import { formatPosition } from '../utils/coordinates.js';
import EventTimerManager from '../utils/event-timer.js';
import logger from '../utils/logger.js';

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
    this.afkDetectionInterval = null; // AFK检测定时器
    this.playerCountTrackingInterval = null; // 人数追踪定时器
    this.eventListenersInitialized = false; // 防止重复注册监听器
    this.isProcessingAfk = false; // AFK 检测并发保护
    this.isProcessingPlayerCount = false; // 人数追踪并发保护

    // 注册内置命令
    this.registerBuiltInCommands();

    // 监听服务器连接/断开事件
    this.setupServerEventListeners();

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
        const basicCmds = ['help', 'time', 'pop', 'team', 'online', 'afk'];
        // 事件命令
        const eventCmds = ['cargo', 'small', 'large', 'heli', 'smalllast', 'largelast', 'helilast', 'events', 'history', 'shop'];

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

        return messages.join(' | ');
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
              // 构建变化文本：仅显示净变化 (+x) 或 (-x)
              let changeText = '';
              if (change.net > 0) {
                changeText = `(+${change.net})`;
              } else if (change.net < 0) {
                changeText = `(-${Math.abs(change.net)})`;
              } else {
                changeText = `(+0)`;
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

          // 统计挂机和离线玩家
          const afkPlayers = [];
          const offlinePlayers = [];
          
          for (const member of onlineMembers) {
            const afkTime = this.getPlayerAfkTime(serverId, member.steamId);
            if (afkTime >= 3) {
              // 截断过长的名字（最多12个字符）
              const displayName = member.name.length > 12 ? member.name.substring(0, 12) + '..' : member.name;
              afkPlayers.push(displayName);
            }
          }

          // 处理离线玩家
          for (const member of offlineMembers) {
            const displayName = member.name.length > 12 ? member.name.substring(0, 12) + '..' : member.name;
            offlinePlayers.push(displayName);
          }

          // 构建单行消息
          const parts = [`团队(${onlineMembers.length}/${teamInfo.members.length})`];
          
          if (afkPlayers.length > 0) {
            parts.push(`挂机(${afkPlayers.length}):${afkPlayers.join(',')}`);
          }
          
          if (offlinePlayers.length > 0) {
            // 离线人数较多时，只显示人数，不列出名字
            if (offlinePlayers.length > 5) {
              parts.push(`离线(${offlinePlayers.length})`);
            } else {
              parts.push(`离线(${offlinePlayers.length}):${offlinePlayers.join(',')}`);
            }
          }

          return parts.join(' | ');
        } catch (error) {
          return cmd('team', 'error');
        }
      }
    });

    // 移交队长权限命令
    const leaderConfig = cmdConfig('leader');
    this.registerCommand('leader', {
      description: leaderConfig?.desc || '移交队长权限',
      usage: '!leader [玩家名]',
      handler: async (serverId, args, context) => {
        try {
          const teamInfo = await this.rustPlusService.getTeamInfo(serverId);
          if (!teamInfo.members || teamInfo.members.length === 0) {
            return cmd('leader', 'error');
          }

          // 确定目标玩家
          let targetMember;

          if (args.length === 0) {
            // 无参数：移交给发送命令的玩家
            targetMember = teamInfo.members.find(m =>
              m.steamId?.toString() === context.steamId?.toString()
            );
            if (!targetMember) {
              return cmd('leader', 'error');
            }
          } else {
            // 有参数：移交给指定玩家
            const targetName = args.join(' ').toLowerCase();
            targetMember = teamInfo.members.find(m =>
              m.name.toLowerCase().includes(targetName)
            );
            if (!targetMember) {
              return cmd('leader', 'not_found', { name: args.join(' ') });
            }
          }

          // 检查目标是否已经是队长
          if (teamInfo.leaderSteamId?.toString() === targetMember.steamId?.toString()) {
            return cmd('leader', 'already', { name: targetMember.name });
          }

          // 执行移交
          await this.rustPlusService.promoteToLeader(serverId, targetMember.steamId.toString());
          return cmd('leader', 'msg', { name: targetMember.name });
        } catch (error) {
          console.error('❌ 移交队长失败:', error);
          // 如果是权限问题，给出明确提示
          if (error.message?.includes('not_leader') || error.error === 'not_leader') {
            return cmd('leader', 'not_leader');
          }
          return cmd('leader', 'error');
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

          // 找出挂机的玩家
          const afkPlayers = [];

          onlineMembers.forEach(m => {
            const afkTime = this.getPlayerAfkTime(serverId, m.steamId);
            
            if (afkTime >= 3) {
              // 截断过长的名字（最多12个字符）
              const displayName = m.name.length > 12 ? m.name.substring(0, 12) + '..' : m.name;
              afkPlayers.push(displayName);
            }
          });

          // 构建消息
          let message = `在线(${onlineMembers.length}/${teamInfo.members.length})`;
          
          if (afkPlayers.length > 0) {
            message += ` | 挂机(${afkPlayers.length}):${afkPlayers.join(',')}`;
          }

          return message;
        } catch (error) {
          return cmd('online', 'error');
        }
      }
    });

    // !afk - 显示挂机队友
    const afkConfig = cmdConfig('afk') || {};
    this.registerCommand('afk', {
      description: afkConfig.desc || '显示挂机队友',
      usage: '!afk',
      handler: async (serverId, args, context) => {
        try {
          const teamInfo = await this.rustPlusService.getTeamInfo(serverId);
          if (!teamInfo.members || teamInfo.members.length === 0) {
            return cmd('afk', 'empty');
          }

          const onlineMembers = teamInfo.members.filter(m => m.isOnline);

          // 计算 AFK 时间（分钟），>=3 视为挂机；按时长降序
          const afkPlayers = [];
          onlineMembers.forEach(m => {
            const afkTime = this.getPlayerAfkTime(serverId, m.steamId?.toString?.() ?? m.steamId);
            if (afkTime >= 3) {
              const displayName = m.name.length > 12 ? m.name.substring(0, 12) + '..' : m.name;
              const durationText = this.formatDuration(afkTime * 60 * 1000);
              afkPlayers.push({ name: displayName, minutes: afkTime, duration: durationText });
            }
          });

          if (afkPlayers.length === 0) {
            return cmd('afk', 'empty');
          }

          afkPlayers.sort((a, b) => b.minutes - a.minutes);

          const list = afkPlayers
            .map(p => cmd('afk', 'item', { name: p.name, duration: p.duration }))
            .join(', ');

          return cmd('afk', 'msg', { count: afkPlayers.length, list });
        } catch (error) {
          return cmd('afk', 'error');
        }
      }
    });

    // !shop - 搜索售货机（不依赖 eventMonitorService）
    const shopConfig = cmdConfig('shop') || {};
    this.registerCommand('shop', {
      description: shopConfig.desc || '搜索售货机物品',
      usage: '!shop [物品名称]',
      handler: async (serverId, args, context) => {
        // command trigger logged elsewhere
        try {
          const markers = await this.rustPlusService.getMapMarkers(serverId);
          
          const vendingMachines = markers.markers ? markers.markers.filter(m => m.type === 3) : [];

          if (vendingMachines.length === 0) {
            return cmd('shop', 'empty');
          }

          const { mapSize, oceanMargin } = await this.rustPlusService.getLiveMapContext(serverId);
          
          const { getItemName, getItemShortName, isImportantItem, searchItems } = await import('../utils/item-info.js');

          // 如果没有提供搜索参数，只显示售货机数量
          if (args.length === 0) {
            return cmd('shop', 'summary', { count: vendingMachines.length });
          }

          // 搜索指定物品 - 使用智能搜索功能
          const searchTerm = args.join(' ');
          
          const matchedItemIds = searchItems(searchTerm); // 获取所有匹配的物品ID
          
          // 如果没有找到匹配的物品ID，直接返回
          if (matchedItemIds.length === 0) {
            return cmd('shop', 'not_found', { item: searchTerm });
          }

          const foundItems = [];
          const matchedItemIdsSet = new Set(matchedItemIds.map(id => String(id)));

          for (const vm of vendingMachines) {
            if (!vm.sellOrders || vm.sellOrders.length === 0) continue;

            const position = formatPosition(vm.x, vm.y, mapSize, true, false, null, oceanMargin);

            for (const order of vm.sellOrders) {
              // 检查这个售货机的物品ID是否在匹配列表中
              if (matchedItemIdsSet.has(String(order.itemId))) {
                foundItems.push({
                  position,
                  itemName: getItemName(order.itemId),
                  itemId: order.itemId,
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
          // 优先显示有库存的条目
          foundItems.sort((a, b) => {
            const aInStock = (a.stock || 0) > 0;
            const bInStock = (b.stock || 0) > 0;
            if (aInStock !== bInStock) return aInStock ? -1 : 1;
            return 0;
          });
          const itemsToDisplay = foundItems.slice(0, MAX_DISPLAY);
          const hasMore = foundItems.length > MAX_DISPLAY;

          // 发送第一条消息：找到多少个
          let summaryMessage = cmd('shop', 'found', { item: searchTerm, count: foundItems.length });
          if (hasMore) {
            summaryMessage += `（仅显示前${MAX_DISPLAY}个）`;
          }
          await this.rustPlusService.sendTeamMessage(serverId, summaryMessage);
          
          // 汇总消息后延迟1.5秒再发送详情
          await new Promise(resolve => setTimeout(resolve, 1500));

          // 逐条发送每个物品信息（最多10个）
          for (let i = 0; i < itemsToDisplay.length; i++) {
            const item = itemsToDisplay[i];
            
            try {
              // 获取物品表情（如果找不到就用物品名称）
              const itemShortName = getItemShortName(item.itemId);
              const currencyShortName = getItemShortName(item.currencyId);

              const itemDisplay = itemShortName !== 'unknown' ? `:${itemShortName}:` : getItemName(item.itemId);
              const currencyDisplay = currencyShortName !== 'unknown' ? `:${currencyShortName}:` : getItemName(item.currencyId);

              // 优化消息格式：位置 | 物品x数量 | 价格 | 库存
              const message = `${item.position} | ${itemDisplay}x${item.quantity} | ${item.costPerItem}${currencyDisplay} | 库存${item.stock}`;
              
              await this.rustPlusService.sendTeamMessage(serverId, message);
              // sendTeamMessage already logs content; avoid duplicate noisy logs
              
              // 延迟1.5秒，避免触发速率限制
              if (i < itemsToDisplay.length - 1) {
                await new Promise(resolve => setTimeout(resolve, 1500));
              }
            } catch (sendError) {
              console.error(`❌ [shop] 发送消息失败 (${i + 1}/${itemsToDisplay.length}):`, sendError.error || sendError.message);
              // 继续发送下一条，不中断整个流程
            }
          }

          return null; // 已经发送过消息，不需要返回
        } catch (error) {
          console.error('❌ !shop 命令执行失败:', error);
          console.error('   错误堆栈:', error.stack);
          return cmd('shop', 'error');
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

          const { mapSize, oceanMargin } = await this.rustPlusService.getLiveMapContext(serverId);
          let messages = [];

          for (const ship of cargoShips) {
            const position = formatPosition(ship.x, ship.y, mapSize, true, false, null, oceanMargin);
            const timeLeft = EventTimerManager.getTimeLeft(`cargo_egress_${ship.id}`, serverId);

            if (timeLeft > 0) {
              const minutesLeft = Math.floor(timeLeft / 60000);
              messages.push(cmd('cargo', 'msg', { position, minutes: minutesLeft }));
            } else {
              messages.push(cmd('cargo', 'msg_active', { position }));
            }
          }

          return messages.join(' | ');
        } catch (error) {
          return cmd('cargo', 'error');
        }
      }
    });

    // !smalllast - 上次小油井事件（触发/解锁）时间
    const smallLastConfig = cmdConfig('smalllast');
    this.registerCommand('smalllast', {
      description: smallLastConfig?.desc || '上次小油井事件时间',
      usage: '!smalllast',
      handler: async (serverId, args, context) => {
        try {
          const eventData = this.eventMonitorService.getEventData(serverId);
          if (!eventData || !eventData.lastEvents) {
            return cmd('smalllast', 'error');
          }
          const { smallOilRigTriggered, smallOilRigCrateUnlocked } = eventData.lastEvents;
          const last = smallOilRigTriggered || smallOilRigCrateUnlocked;
          if (!last) return cmd('smalllast', 'empty');
          const now = Date.now();
          const minutes = Math.floor((now - last) / 60000);
          const time = this.formatDuration(minutes * 60 * 1000);
          return cmd('smalllast', 'msg', { time });
        } catch (error) {
          return cmd('smalllast', 'error');
        }
      }
    });

    // !largelast - 上次大油井事件（触发/解锁）时间
    const largeLastConfig = cmdConfig('largelast');
    this.registerCommand('largelast', {
      description: largeLastConfig?.desc || '上次大油井事件时间',
      usage: '!largelast',
      handler: async (serverId, args, context) => {
        try {
          const eventData = this.eventMonitorService.getEventData(serverId);
          if (!eventData || !eventData.lastEvents) {
            return cmd('largelast', 'error');
          }
          const { largeOilRigTriggered, largeOilRigCrateUnlocked } = eventData.lastEvents;
          const last = largeOilRigTriggered || largeOilRigCrateUnlocked;
          if (!last) return cmd('largelast', 'empty');
          const now = Date.now();
          const minutes = Math.floor((now - last) / 60000);
          const time = this.formatDuration(minutes * 60 * 1000);
          return cmd('largelast', 'msg', { time });
        } catch (error) {
          return cmd('largelast', 'error');
        }
      }
    });

    // !helilast - 上次武装直升机相关事件时间（刷新/击落/离开中最近一次）
    const heliLastConfig = cmdConfig('helilast');
    this.registerCommand('helilast', {
      description: heliLastConfig?.desc || '上次武装直升机事件时间',
      usage: '!helilast',
      handler: async (serverId, args, context) => {
        try {
          const eventData = this.eventMonitorService.getEventData(serverId);
          if (!eventData || !eventData.lastEvents) {
            return cmd('helilast', 'error');
          }
          const { patrolHeliSpawn, patrolHeliDowned, patrolHeliLeave } = eventData.lastEvents;
          const candidates = [patrolHeliSpawn, patrolHeliDowned, patrolHeliLeave].filter(Boolean);
          if (candidates.length === 0) return cmd('helilast', 'empty');
          const last = Math.max(...candidates);
          const now = Date.now();
          const minutes = Math.floor((now - last) / 60000);
          const time = this.formatDuration(minutes * 60 * 1000);
          return cmd('helilast', 'msg', { time });
        } catch (error) {
          return cmd('helilast', 'error');
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
            return cmd('smalllast', 'error');
          }
          const { smallOilRigTriggered, smallOilRigCrateUnlocked } = eventData.lastEvents;
          const last = smallOilRigTriggered || smallOilRigCrateUnlocked;
          if (!last) return cmd('smalllast', 'empty');
          const time = this.formatDuration(Date.now() - last);
          return cmd('smalllast', 'msg', { time });
        } catch (error) {
          return cmd('smalllast', 'error');
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
            return cmd('largelast', 'error');
          }
          const { largeOilRigTriggered, largeOilRigCrateUnlocked } = eventData.lastEvents;
          const last = largeOilRigTriggered || largeOilRigCrateUnlocked;
          if (!last) return cmd('largelast', 'empty');
          const time = this.formatDuration(Date.now() - last);
          return cmd('largelast', 'msg', { time });
        } catch (error) {
          return cmd('largelast', 'error');
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
          const eventData = this.eventMonitorService.getEventData(serverId);
          if (!eventData || !eventData.lastEvents) {
            return cmd('helilast', 'error');
          }
          const { patrolHeliSpawn, patrolHeliDowned, patrolHeliLeave } = eventData.lastEvents;
          const candidates = [patrolHeliSpawn, patrolHeliDowned, patrolHeliLeave].filter(Boolean);
          if (candidates.length === 0) return cmd('helilast', 'empty');
          const last = Math.max(...candidates);
          const time = this.formatDuration(Date.now() - last);
          return cmd('helilast', 'msg', { time });
        } catch (error) {
          return cmd('helilast', 'error');
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
          const { mapSize, oceanMargin } = await this.rustPlusService.getLiveMapContext(serverId);

          let messages = [cmd('events', 'header')];
          let eventCount = 0;

          // 货船
          const cargoShips = markers.markers ? markers.markers.filter(m => m.type === 5) : [];
          if (cargoShips.length > 0) {
            eventCount++;
            for (const ship of cargoShips) {
              const position = formatPosition(ship.x, ship.y, mapSize, true, false, null, oceanMargin);
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
              const position = formatPosition(heli.x, heli.y, mapSize, true, false, null, oceanMargin);
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

          return messages.join(' | ');
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

          return messages.join(' | ');
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
   * 设置服务器事件监听器
   */
  setupServerEventListeners() {
    // 防止重复注册
    if (this.eventListenersInitialized) return;

    // 监听服务器连接事件
    this.rustPlusService.on('server:connected', (data) => {
      // keep minimal logs elsewhere

      // 首次连接服务器时启动检测系统
      const connectedServers = this.rustPlusService.getConnectedServers();

      if (connectedServers.length === 1 && !this.afkDetectionInterval) {
        // 第一个服务器连接，启动AFK检测
        this.startAfkDetection();
      }

      if (connectedServers.length === 1 && !this.playerCountTrackingInterval) {
        // 第一个服务器连接，启动人数追踪
        this.startPlayerCountTracking();
      }
    });

    // 监听服务器断开事件
    this.rustPlusService.on('server:disconnected', (data) => {
      // 清理该服务器的相关数据
      const serverId = data.serverId;
      this.cleanupServerData(serverId);

      // 当所有服务器断开时停止检测系统
      const connectedServers = this.rustPlusService.getConnectedServers();

      if (connectedServers.length === 0) {
        // 所有服务器都断开，停止AFK检测
        this.stopAfkDetection();
        // 停止人数追踪
        this.stopPlayerCountTracking();
      }
    });

    // quiet
  }

  /**
   * 清理指定服务器的相关数据
   */
  cleanupServerData(serverId) {
    this.playerCountHistory.delete(serverId);
    this.playerPositionHistory.delete(serverId);
    this.afkNotifiedPlayers.delete(serverId);
    this.playerSessionData.delete(serverId);
    this.settings.delete(serverId);
    logger.debug(`🧹 已清理服务器 ${serverId} 的缓存数据`);
  }

  /**
   * 设置玩家事件监听器
   */
  setupPlayerEventListeners() {
    // 标记监听器已初始化（与 setupServerEventListeners 共用标志）
    this.eventListenersInitialized = true;
    // 监听玩家上线事件
    this.rustPlusService.on('player:online', async (data) => {
      // quiet
      await this.handlePlayerOnline(data.serverId, data.steamId, data.name);
    });

    // 监听玩家下线事件
    this.rustPlusService.on('player:offline', async (data) => {
      // quiet
      await this.handlePlayerOffline(data.serverId, data.steamId, data.name);
    });

    // quiet
  }

  /**
   * 处理玩家上线
   */
  async handlePlayerOnline(serverId, steamId, playerName) {
    // quiet

    // 初始化会话数据
    if (!this.playerSessionData.has(serverId)) {
      this.playerSessionData.set(serverId, new Map());
      // quiet
    }

    const sessionMap = this.playerSessionData.get(serverId);
    const steamIdStr = steamId.toString();

    // 检查是否有离线记录
    if (sessionMap.has(steamIdStr)) {
      const sessionData = sessionMap.get(steamIdStr);
      // quiet

      // 计算离线时长
      if (sessionData.offlineTime) {
        const offlineDuration = Date.now() - sessionData.offlineTime;
        const offlineDurationText = this.formatDuration(offlineDuration);

        // 构建上线通知消息
        const message = notify('online_after_offline', {
          playerName,
          duration: offlineDurationText
        });

        try {
          await this.rustPlusService.sendTeamMessage(serverId, message);
          // message already logged in sendTeamMessage
        } catch (error) {
          console.error(`[错误] 发送上线通知失败:`, error.message);
        }
      } else {
        // 没有离线时间记录时，发送基础上线通知
        const message = notify('online', { playerName });
        try {
          await this.rustPlusService.sendTeamMessage(serverId, message);
          // message already logged in sendTeamMessage
        } catch (error) {
          console.error(`[错误] 发送上线通知失败:`, error.message);
        }
      }
    } else {
      // quiet
      const message = notify('online', { playerName });
      try {
        await this.rustPlusService.sendTeamMessage(serverId, message);
        // message already logged in sendTeamMessage
      } catch (error) {
        console.error(`[错误] 发送上线通知失败:`, error.message);
      }
    }

    // 更新会话数据（重置会话）
    sessionMap.set(steamIdStr, {
      name: playerName,
      onlineTime: Date.now(),
      offlineTime: null,
      afkInfo: null
    });
    // quiet

    // 清除挂机记录（新的游戏会话）
    if (this.afkNotifiedPlayers.has(serverId)) {
      const notifiedMap = this.afkNotifiedPlayers.get(serverId);
      notifiedMap.delete(steamIdStr);
      // quiet
    }
  }

  /**
   * 处理玩家下线
   */
  async handlePlayerOffline(serverId, steamId, playerName) {
    // quiet

    if (!this.playerSessionData.has(serverId)) {
      // quiet
      this.playerSessionData.set(serverId, new Map());
    }

    const sessionMap = this.playerSessionData.get(serverId);
    const steamIdStr = steamId.toString();

    // 获取会话数据
    const sessionData = sessionMap.get(steamIdStr);
    if (!sessionData || !sessionData.onlineTime) {
      // quiet
      const message = notify('offline', { playerName });
      try {
        await this.rustPlusService.sendTeamMessage(serverId, message);
        // message already logged in sendTeamMessage
      } catch (error) {
        console.error(`[错误] 发送下线通知失败:`, error.message);
      }
      // 记录离线时间，便于下次上线统计离线时长
      sessionMap.set(steamIdStr, {
        name: playerName,
        onlineTime: null,
        offlineTime: Date.now(),
        afkInfo: null
      });
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
        console.log(`[下线处理] 检测到挂机记录: ${afkInfo.durationText}`);
      }
    }

    // 更新离线时间，并保存挂机信息
    sessionData.offlineTime = Date.now();
    sessionData.afkInfo = afkInfo; // 保存挂机信息供上线时使用
    sessionMap.set(steamIdStr, sessionData);
    console.log(`[下线处理] 已更新离线时间: ${Date.now()}`);

    // 构建下线通知消息
    let message;
    if (afkInfo) {
      message = notify('offline_with_afk', {
        playerName,
        duration: durationText,
        afkDuration: afkInfo.durationText
      });
    } else {
      message = notify('offline_with_duration', {
        playerName,
        duration: durationText
      });
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
      // 并发保护：上一次还在执行则跳过
      if (this.isProcessingPlayerCount) return;
      this.isProcessingPlayerCount = true;

      try {
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
      } finally {
        this.isProcessingPlayerCount = false;
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
    // 每30秒检测一次，降低API调用频率
    this.afkDetectionInterval = setInterval(async () => {
      // 并发保护：上一次还在执行则跳过
      if (this.isProcessingAfk) return;
      this.isProcessingAfk = true;
      try {
        await this.checkPlayerPositions();
      } finally {
        this.isProcessingAfk = false;
      }
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

    logger.debug(`[AFK检测] 开始检测，已连接服务器数: ${connectedServers.length}`);

    for (const serverId of connectedServers) {
      try {
        const teamInfo = await this.rustPlusService.getTeamInfo(serverId);
        if (!teamInfo.members || teamInfo.members.length === 0) {
          logger.debug(`[AFK检测] 服务器 ${serverId} 无队员`);
          continue;
        }

        logger.debug(`[AFK检测] 服务器 ${serverId} 队员数: ${teamInfo.members.length}`);

        // 手动触发队伍状态检测（检测死亡/复活等事件）
        this.rustPlusService.handleTeamChanged(serverId, { teamInfo });

        // 获取地图大小（使用缓存，避免频繁 API 请求）
        const mapSize = this.rustPlusService.getMapSize(serverId);
        const oceanMargin = this.rustPlusService.getMapOceanMargin(serverId);

        // 更新每个玩家的位置历史
        for (const member of teamInfo.members) {
          if (!member.isOnline) {
            // 玩家离线，不清除通知记录（等玩家上线后再处理）
            continue;
          }

          // 格式化位置显示
          const position = formatPosition(member.x, member.y, mapSize, true, false, null, oceanMargin);
          logger.debug(`[AFK检测] 玩家 ${member.name} 原始坐标: (${member.x.toFixed(2)}, ${member.y.toFixed(2)}) -> 网格: ${position}`);

          // 统一转换steamId为字符串
          const steamIdStr = member.steamId.toString();

          this.updatePlayerPosition(serverId, steamIdStr, {
            x: member.x,
            y: member.y,
            isAlive: member.isAlive,
            timestamp: Date.now(),
            name: member.name
          });

          // 检测挂机并通知
          const afkTime = this.getPlayerAfkTime(serverId, steamIdStr);
          logger.debug(`[AFK检测] 玩家 ${member.name} 挂机时长: ${afkTime} 分钟`);

          if (afkTime >= 3) {
            await this.notifyAfkPlayer(serverId, member, afkTime, mapSize);
          } else {
            // 不再挂机，检查是否需要发送回归通知
            await this.notifyPlayerReturn(serverId, member);
          }
        }
      } catch (error) {
        // AppError { error: 'not_found' } 表示玩家不在队伍中，静默处理
        const errorStr = JSON.stringify(error) || String(error);
        if (errorStr.includes('not_found')) {
          // 玩家不在队伍中，跳过
          continue;
        }
        console.error(`[AFK检测] 检测失败:`, error.message || error);
      }
    }
  }

  /**
   * 更新玩家位置历史（参考 rustplusplus 的 Player.updatePlayer 实现）
   */
  updatePlayerPosition(serverId, steamId, positionData) {
    if (!this.playerPositionHistory.has(serverId)) {
      this.playerPositionHistory.set(serverId, new Map());
      logger.debug(`[位置更新] 初始化服务器 ${serverId} 的位置历史`);
    }

    const serverHistory = this.playerPositionHistory.get(serverId);

    // 初始化玩家位置数据（包含 lastMovement 字段）
    if (!serverHistory.has(steamId)) {
      serverHistory.set(steamId, {
        lastMovement: Date.now(),  // 最后移动时间
        currentPosition: positionData,  // 当前位置
        history: []  // 位置历史（用于调试）
      });
      logger.debug(`[位置更新] 初始化玩家 ${steamId} 的位置数据`);
      return;
    }

    const playerData = serverHistory.get(steamId);
    const lastPos = playerData.currentPosition;

    // 检查是否移动（X 或 Y 任一变化超过 1 米）
    const AFK_DISTANCE_THRESHOLD = 1.0;
    const distance = Math.sqrt(
      Math.pow(positionData.x - lastPos.x, 2) +
      Math.pow(positionData.y - lastPos.y, 2)
    );
    const hasMoved = distance > AFK_DISTANCE_THRESHOLD;

    if (hasMoved) {
      // 玩家移动了，重置最后移动时间
      playerData.lastMovement = Date.now();
      logger.debug(`[位置更新] 玩家 ${positionData.name} 移动了 ${distance.toFixed(2)}m，重置 lastMovement`);
    } else {
      logger.debug(`[位置更新] 玩家 ${positionData.name} 位置未变 (${distance.toFixed(2)}m)`);
    }

    // 更新当前位置
    playerData.currentPosition = positionData;

    // 添加到历史记录（可选，用于调试）
    playerData.history.push({
      ...positionData,
      hasMoved
    });

    // 只保留最近 10 分钟的历史记录
    const tenMinutesAgo = Date.now() - 10 * 60 * 1000;
    playerData.history = playerData.history.filter(p => p.timestamp >= tenMinutesAgo);

    serverHistory.set(steamId, playerData);
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
    logger.debug(`[AFK通知] 准备格式化 - 原始坐标: x=${member.x}, y=${member.y}, mapSize=${mapSize}`);
    const position = formatPosition(member.x, member.y, mapSize);
    logger.debug(`[AFK通知] 格式化结果: "${position}" (类型: ${typeof position})`);
    
    if (!position || position === 'null' || position.includes('NaN')) {
      console.error(`❌ [AFK通知] 坐标格式化失败！使用原始坐标`);
    }

    // 发送通知
    const message = notify('afk_start', {
      name: member.name,
      position: position || `(${Math.round(member.x)},${Math.round(member.y)})`,
      minutes: afkTime
    });
    logger.debug(`[AFK通知] 最终消息: ${message}`);

    try {
      await this.rustPlusService.sendTeamMessage(serverId, message);
      logger.info(`[挂机通知] ${member.name} (${afkTime}分钟) at ${position}`);
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
    const message = notify('afk_return', {
      name: member.name,
      duration: durationText
    });

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
   * 计算玩家挂机时长（参考 rustplusplus 的 Player.getAfkSeconds 实现）
   * @returns {number} 挂机时长（分钟），0 表示不挂机
   */
  getPlayerAfkTime(serverId, steamId) {
    if (!this.playerPositionHistory.has(serverId)) {
      logger.debug(`[AFK计算] 服务器 ${serverId} 无位置历史`);
      return 0;
    }

    const serverHistory = this.playerPositionHistory.get(serverId);
    if (!serverHistory.has(steamId)) {
      logger.debug(`[AFK计算] 玩家 ${steamId} 无位置数据`);
      return 0;
    }

    const playerData = serverHistory.get(steamId);

    // 计算 AFK 时长（秒） = 当前时间 - 最后移动时间
    const now = Date.now();
    const afkSeconds = (now - playerData.lastMovement) / 1000;
    const afkMinutes = Math.floor(afkSeconds / 60);

    logger.debug(`[AFK计算] 玩家 ${playerData.currentPosition?.name || steamId} 最后移动: ${new Date(playerData.lastMovement).toLocaleTimeString()}, AFK时长: ${afkMinutes}分钟`);

    // 至少挂机3分钟才返回
    return afkMinutes >= 3 ? afkMinutes : 0;
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
