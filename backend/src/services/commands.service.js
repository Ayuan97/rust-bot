/**
 * 游戏内命令处理服务
 * 处理以 ! 开头的队伍聊天命令
 */

class CommandsService {
  constructor(rustPlusService) {
    this.rustPlusService = rustPlusService;
    this.commandPrefix = '!';
    this.commands = new Map();
    this.settings = new Map(); // 存储每个服务器的设置
    
    // 注册内置命令
    this.registerBuiltInCommands();
  }

  /**
   * 获取服务器设置
   */
  getServerSettings(serverId) {
    if (!this.settings.has(serverId)) {
      this.settings.set(serverId, {
        deathNotify: true,  // 默认开启死亡通知
        spawnNotify: true   // 默认开启重生通知
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
    this.registerCommand('help', {
      description: '显示所有可用命令',
      usage: '!help',
      handler: async (serverId, args, context) => {
        const commandList = Array.from(this.commands.entries())
          .map(([name, cmd]) => `!${name} - ${cmd.description}`)
          .join('\n');
        return `📋 可用命令:\n${commandList}`;
      }
    });

    // 游戏时间命令
    this.registerCommand('time', {
      description: '显示当前游戏时间',
      usage: '!time',
      handler: async (serverId, args, context) => {
        try {
          const timeInfo = await this.rustPlusService.getTime(serverId);
          const currentTime = timeInfo.time || 0;
          const hours = Math.floor(currentTime);
          const minutes = Math.floor((currentTime - hours) * 60);
          
          const sunrise = timeInfo.sunrise || 6;
          const sunset = timeInfo.sunset || 18;
          
          const isDaytime = currentTime >= sunrise && currentTime < sunset;
          const timeEmoji = isDaytime ? '☀️' : '🌙';
          
          return `${timeEmoji} 游戏时间: ${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}\n` +
                 `🌅 日出: ${Math.floor(sunrise)}:${Math.floor((sunrise % 1) * 60).toString().padStart(2, '0')}\n` +
                 `🌇 日落: ${Math.floor(sunset)}:${Math.floor((sunset % 1) * 60).toString().padStart(2, '0')}`;
        } catch (error) {
          return `❌ 获取时间失败: ${error.message}`;
        }
      }
    });

    // 服务器信息命令
    this.registerCommand('info', {
      description: '显示服务器信息',
      usage: '!info',
      handler: async (serverId, args, context) => {
        try {
          const info = await this.rustPlusService.getServerInfo(serverId);
          return `🖥️ 服务器: ${info.name}\n` +
                 `🗺️ 地图: ${info.map} (${info.mapSize}m)\n` +
                 `👥 在线人数: ${info.players}/${info.maxPlayers}` +
                 (info.queuedPlayers > 0 ? `\n⏳ 排队: ${info.queuedPlayers}` : '');
        } catch (error) {
          return `❌ 获取服务器信息失败: ${error.message}`;
        }
      }
    });

    // 队伍成员命令
    this.registerCommand('online', {
      description: '显示在线队友',
      usage: '!online',
      handler: async (serverId, args, context) => {
        try {
          const teamInfo = await this.rustPlusService.getTeamInfo(serverId);
          if (!teamInfo.members || teamInfo.members.length === 0) {
            return '❌ 没有队伍成员';
          }

          const onlineMembers = teamInfo.members.filter(m => m.isOnline);
          const offlineMembers = teamInfo.members.filter(m => !m.isOnline);

          let message = `👥 队伍成员 (${onlineMembers.length}/${teamInfo.members.length} 在线):\n\n`;
          
          if (onlineMembers.length > 0) {
            message += '🟢 在线:\n';
            onlineMembers.forEach(m => {
              const status = m.isAlive ? '✅ 存活' : '💀 已死亡';
              message += `  • ${m.name} ${status}\n`;
            });
          }

          if (offlineMembers.length > 0) {
            message += '\n🔴 离线:\n';
            offlineMembers.forEach(m => {
              message += `  • ${m.name}\n`;
            });
          }

          return message.trim();
        } catch (error) {
          return `❌ 获取队伍信息失败: ${error.message}`;
        }
      }
    });

    // Ping 命令
    this.registerCommand('ping', {
      description: '测试机器人响应',
      usage: '!ping',
      handler: async (serverId, args, context) => {
        return `🏓 Pong! 机器人运行正常`;
      }
    });

    // 位置命令
    this.registerCommand('pos', {
      description: '显示所有队友位置',
      usage: '!pos',
      handler: async (serverId, args, context) => {
        try {
          const teamInfo = await this.rustPlusService.getTeamInfo(serverId);
          if (!teamInfo.members || teamInfo.members.length === 0) {
            return '❌ 没有队伍成员';
          }

          const onlineMembers = teamInfo.members.filter(m => m.isOnline);
          if (onlineMembers.length === 0) {
            return '❌ 没有在线的队友';
          }

          let message = '📍 队友位置:\n';
          onlineMembers.forEach(m => {
            const status = m.isAlive ? '✅' : '💀';
            const pos = m.x !== undefined && m.y !== undefined 
              ? `(${Math.round(m.x)}, ${Math.round(m.y)})` 
              : '(未知)';
            message += `  ${status} ${m.name}: ${pos}\n`;
          });

          return message.trim();
        } catch (error) {
          return `❌ 获取位置失败: ${error.message}`;
        }
      }
    });

    // 地图标记命令
    this.registerCommand('markers', {
      description: '显示地图标记数量',
      usage: '!markers',
      handler: async (serverId, args, context) => {
        try {
          const markers = await this.rustPlusService.getMapMarkers(serverId);
          if (!markers.markers || markers.markers.length === 0) {
            return '📍 地图上没有标记';
          }

          const markerTypes = {};
          markers.markers.forEach(m => {
            const type = this.getMarkerTypeName(m.type);
            markerTypes[type] = (markerTypes[type] || 0) + 1;
          });

          let message = `📍 地图标记 (共 ${markers.markers.length} 个):\n`;
          Object.entries(markerTypes).forEach(([type, count]) => {
            message += `  • ${type}: ${count}\n`;
          });

          return message.trim();
        } catch (error) {
          return `❌ 获取地图标记失败: ${error.message}`;
        }
      }
    });

    // 死亡统计命令 (示例 - 需要实现统计功能)
    this.registerCommand('stats', {
      description: '显示队伍统计',
      usage: '!stats',
      handler: async (serverId, args, context) => {
        return '📊 统计功能开发中...';
      }
    });

    // 通知设置命令
    this.registerCommand('notify', {
      description: '控制自动通知（死亡/重生）',
      usage: '!notify [death|spawn] [on|off]',
      handler: async (serverId, args, context) => {
        const settings = this.getServerSettings(serverId);

        if (args.length === 0) {
          // 显示当前设置
          return `🔔 通知设置:\n` +
                 `  💀 死亡通知: ${settings.deathNotify ? '开启' : '关闭'}\n` +
                 `  ✨ 重生通知: ${settings.spawnNotify ? '开启' : '关闭'}\n\n` +
                 `用法: !notify [death|spawn] [on|off]`;
        }

        const type = args[0].toLowerCase();
        const action = args[1]?.toLowerCase();

        if (!['death', 'spawn'].includes(type)) {
          return '❌ 类型错误，请使用 death 或 spawn';
        }

        if (!action || !['on', 'off'].includes(action)) {
          return '❌ 请指定 on 或 off';
        }

        const enabled = action === 'on';
        const emoji = type === 'death' ? '💀' : '✨';
        const typeName = type === 'death' ? '死亡' : '重生';

        if (type === 'death') {
          this.updateServerSettings(serverId, { deathNotify: enabled });
        } else {
          this.updateServerSettings(serverId, { spawnNotify: enabled });
        }

        return `${emoji} ${typeName}通知已${enabled ? '开启' : '关闭'}`;
      }
    });
  }

  /**
   * 获取标记类型名称
   */
  getMarkerTypeName(type) {
    const typeMap = {
      0: '未定义',
      1: '玩家',
      2: '爆炸',
      3: '售货机',
      4: '运输直升机',
      5: '货船',
      6: '空投',
      7: '通用半径',
      8: '巡逻直升机',
      9: '移动商人'
    };
    return typeMap[type] || `类型${type}`;
  }

  /**
   * 注册自定义命令
   */
  registerCommand(name, config) {
    if (!config.handler || typeof config.handler !== 'function') {
      throw new Error(`命令 ${name} 必须提供 handler 函数`);
    }

    this.commands.set(name.toLowerCase(), {
      name,
      description: config.description || '无描述',
      usage: config.usage || `!${name}`,
      handler: config.handler,
      adminOnly: config.adminOnly || false
    });

    console.log(`✅ 已注册命令: !${name}`);
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

    console.log(`🎮 收到命令: !${commandName} (来自 ${name})`);

    // 查找命令
    const command = this.commands.get(commandName);
    if (!command) {
      // 命令不存在
      await this.rustPlusService.sendTeamMessage(
        serverId,
        `❌ 未知命令: !${commandName}\n输入 !help 查看所有命令`
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

      console.log(`✅ 命令执行成功: !${commandName}`);
      return true;
    } catch (error) {
      console.error(`❌ 命令执行失败 !${commandName}:`, error);
      await this.rustPlusService.sendTeamMessage(
        serverId,
        `❌ 命令执行失败: ${error.message}`
      );
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

