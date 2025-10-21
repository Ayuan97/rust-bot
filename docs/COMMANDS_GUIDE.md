# 游戏内命令系统指南

本文档说明如何在游戏中通过队伍聊天与 Rust+ 机器人进行互动。

## 🎮 快速开始

在游戏内打开队伍聊天（默认按 `Enter` 键），输入以 `!` 开头的命令即可与机器人互动。

**示例：**
```
!time
!help
!online
```

机器人会自动识别命令并在队伍聊天中回复结果。

---

## 📋 可用命令

### 基础命令

#### `!help`
显示所有可用命令列表。

**用法：**
```
!help
```

**示例输出：**
```
📋 可用命令:
!help - 显示所有可用命令
!time - 显示当前游戏时间
!info - 显示服务器信息
!online - 显示在线队友
!ping - 测试机器人响应
!pos - 显示所有队友位置
!markers - 显示地图标记数量
!notify - 控制自动通知（死亡/重生）
!stats - 显示队伍统计
```

---

#### `!ping`
测试机器人是否正常运行。

**用法：**
```
!ping
```

**示例输出：**
```
🏓 Pong! 机器人运行正常
```

---

### 时间与服务器信息

#### `!time` ⭐ 推荐
显示当前游戏内时间，包括日出日落时间。

**用法：**
```
!time
```

**示例输出：**
```
☀️ 游戏时间: 14:23
🌅 日出: 06:30
🌇 日落: 18:45
```

---

#### `!info`
显示服务器详细信息。

**用法：**
```
!info
```

**示例输出：**
```
🖥️ 服务器: [EU] Awesome Server
🗺️ 地图: Procedural Map (3500m)
👥 在线人数: 87/150
⏳ 排队: 5
```

---

### 队伍相关命令

#### `!online` ⭐ 推荐
显示所有队伍成员的在线状态。

**用法：**
```
!online
```

**示例输出：**
```
👥 队伍成员 (3/5 在线):

🟢 在线:
  • PlayerOne ✅ 存活
  • PlayerTwo 💀 已死亡
  • PlayerThree ✅ 存活

🔴 离线:
  • PlayerFour
  • PlayerFive
```

---

#### `!pos`
显示所有在线队友的地图坐标。

**用法：**
```
!pos
```

**示例输出：**
```
📍 队友位置:
  ✅ PlayerOne: (1250, 2340)
  💀 PlayerTwo: (980, 1560)
  ✅ PlayerThree: (1305, 2298)
```

---

### 地图相关命令

#### `!markers`
显示地图上的标记统计。

**用法：**
```
!markers
```

**示例输出：**
```
📍 地图标记 (共 15 个):
  • 玩家: 5
  • 售货机: 7
  • 空投: 2
  • 巡逻直升机: 1
```

---

### 设置命令

#### `!notify` ⭐ 新增
控制自动通知功能的开关（死亡通知、重生通知）。

**用法：**
```
!notify                  # 查看当前设置
!notify death on         # 开启死亡通知
!notify death off        # 关闭死亡通知
!notify spawn on         # 开启重生通知
!notify spawn off        # 关闭重生通知
```

**示例输出：**
```
# 查看设置
🔔 通知设置:
  💀 死亡通知: 开启
  ✨ 重生通知: 开启

用法: !notify [death|spawn] [on|off]

# 修改设置
💀 死亡通知已关闭
```

**说明：**
- 死亡通知默认开启，当队友死亡时自动在队伍聊天发送位置
- 重生通知默认开启，当队友重生时自动发送通知
- 每个服务器的设置独立保存

---

### 统计命令

#### `!stats`
显示队伍统计信息（开发中）。

**用法：**
```
!stats
```

**示例输出：**
```
📊 统计功能开发中...
```

---

## 🔧 自定义命令

开发者可以通过编程方式添加自定义命令。

### 注册自定义命令

在 `/backend/src/app.js` 或任何初始化代码中：

```javascript
import rustPlusService from './services/rustplus.service.js';

// 获取命令服务
const commandsService = rustPlusService.getCommandsService();

// 注册自定义命令
commandsService.registerCommand('greet', {
  description: '向队伍问好',
  usage: '!greet [名字]',
  handler: async (serverId, args, context) => {
    const name = args[0] || context.name;
    return `👋 你好, ${name}! 欢迎使用机器人！`;
  }
});

// 注册带参数的命令
commandsService.registerCommand('remind', {
  description: '设置提醒',
  usage: '!remind <时间(秒)> <消息>',
  handler: async (serverId, args, context) => {
    if (args.length < 2) {
      return '❌ 用法: !remind <时间(秒)> <消息>';
    }

    const seconds = parseInt(args[0]);
    if (isNaN(seconds) || seconds <= 0) {
      return '❌ 请输入有效的秒数';
    }

    const message = args.slice(1).join(' ');
    
    setTimeout(async () => {
      await rustPlusService.sendTeamMessage(
        serverId,
        `⏰ 提醒 @${context.name}: ${message}`
      );
    }, seconds * 1000);

    return `✅ 将在 ${seconds} 秒后提醒你: ${message}`;
  }
});
```

### 命令配置选项

```javascript
{
  description: string,    // 命令描述（必需）
  usage: string,         // 使用方法（可选，默认 !commandName）
  handler: function,     // 处理函数（必需）
  adminOnly: boolean     // 是否仅管理员可用（可选，默认 false）
}
```

### Handler 函数参数

```javascript
async function handler(serverId, args, context) {
  // serverId: 服务器 ID
  // args: 命令参数数组，例如 "!cmd arg1 arg2" -> ['arg1', 'arg2']
  // context: {
  //   name: string,      // 发送者名称
  //   steamId: string,   // 发送者 Steam ID
  //   message: string    // 完整消息内容
  // }
  
  // 返回字符串将作为回复发送到队伍聊天
  // 返回 null/undefined 则不发送回复
  return '回复消息';
}
```

---

## 💡 高级示例

### 1. 死亡通知命令

```javascript
let deathNotifications = new Map(); // serverId -> enabled

commandsService.registerCommand('deathnotify', {
  description: '开关死亡通知',
  usage: '!deathnotify [on|off]',
  handler: async (serverId, args, context) => {
    const action = args[0]?.toLowerCase();
    
    if (action === 'on') {
      deathNotifications.set(serverId, true);
      return '✅ 已开启死亡通知';
    } else if (action === 'off') {
      deathNotifications.set(serverId, false);
      return '✅ 已关闭死亡通知';
    } else {
      const enabled = deathNotifications.get(serverId);
      return `ℹ️ 死亡通知当前: ${enabled ? '开启' : '关闭'}`;
    }
  }
});

// 监听死亡事件
rustPlusService.on('player:died', async (data) => {
  if (deathNotifications.get(data.serverId)) {
    await rustPlusService.sendTeamMessage(
      data.serverId,
      `💀 ${data.name} 在 (${Math.round(data.x)}, ${Math.round(data.y)}) 死亡了！`
    );
  }
});
```

### 2. 设备状态查询命令

```javascript
commandsService.registerCommand('device', {
  description: '查询设备状态',
  usage: '!device <设备ID>',
  handler: async (serverId, args, context) => {
    if (args.length === 0) {
      return '❌ 用法: !device <设备ID>';
    }

    const entityId = parseInt(args[0]);
    if (isNaN(entityId)) {
      return '❌ 请输入有效的设备ID';
    }

    try {
      const info = await rustPlusService.getEntityInfo(serverId, entityId);
      const status = info.payload.value ? '🟢 开启' : '🔴 关闭';
      const type = info.type === 1 ? '开关' : 
                   info.type === 2 ? '警报' : 
                   info.type === 3 ? '储物监视器' : '未知';
      
      return `🎛️ 设备 ${entityId} (${type})\n状态: ${status}`;
    } catch (error) {
      return `❌ 查询失败: ${error.message}`;
    }
  }
});
```

### 3. 队伍召集命令

```javascript
commandsService.registerCommand('gather', {
  description: '召集队友到指定位置',
  usage: '!gather <X> <Y>',
  handler: async (serverId, args, context) => {
    if (args.length < 2) {
      return '❌ 用法: !gather <X> <Y>';
    }

    const x = parseInt(args[0]);
    const y = parseInt(args[1]);

    if (isNaN(x) || isNaN(y)) {
      return '❌ 请输入有效的坐标';
    }

    return `📍 ${context.name} 召集大家到 (${x}, ${y})！\n所有人集合！`;
  }
});
```

---

## 🚀 实现原理

### 消息处理流程

1. **接收消息** - Rust+ API 接收到队伍聊天消息
2. **检测命令** - 检查消息是否以 `!` 开头
3. **解析命令** - 提取命令名和参数
4. **查找处理器** - 在已注册的命令中查找对应处理器
5. **执行命令** - 调用处理器函数
6. **发送响应** - 将结果发送回队伍聊天

### 代码位置

- **命令服务**: `/backend/src/services/commands.service.js`
- **集成逻辑**: `/backend/src/services/rustplus.service.js`
- **事件转发**: `/backend/src/services/websocket.service.js`

---

## 📊 命令统计与日志

所有命令执行都会在后端控制台输出日志：

```
🎮 收到命令: !time (来自 PlayerOne)
✅ 命令执行成功: !time
```

如果命令执行失败，也会有相应的错误日志：

```
❌ 命令执行失败 !time: 服务器未连接
```

---

## ⚠️ 注意事项

1. **权限控制**: 当前所有队伍成员都可以使用命令。如需限制，可以通过检查 `context.steamId` 实现。

2. **频率限制**: Rust+ API 有速率限制，过于频繁发送消息可能导致被限流。建议在命令处理中加入冷却时间。

3. **错误处理**: 所有命令都应该有适当的错误处理，避免命令失败导致机器人崩溃。

4. **消息长度**: 队伍聊天消息有长度限制，过长的回复可能被截断。

5. **异步执行**: 命令是异步执行的，不会阻塞其他消息处理。

---

## 🔮 未来计划

- [ ] 命令权限系统（管理员命令）
- [ ] 命令冷却时间
- [ ] 命令别名支持
- [ ] 持久化统计数据
- [ ] 更多内置命令
- [ ] 命令使用统计
- [ ] 多语言支持

---

## 🤝 贡献

欢迎提交新的命令想法或改进建议！可以通过以下方式：

1. 在项目中添加自定义命令
2. 提交 Pull Request 贡献内置命令
3. 报告 Bug 或提出功能请求

---

## 相关文档

- [事件系统指南](./EVENTS_GUIDE.md) - 了解所有可用的事件类型
- [API 文档](./API_CHANNELS.md) - Rust+ API 详细说明
- [架构文档](./ARCHITECTURE.md) - 系统架构说明

