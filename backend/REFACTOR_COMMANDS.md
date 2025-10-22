# 命令系统重构完成

## 重构内容

按照项目规范，将事件命令系统重构为统一管理：

### 1. 移除表情符号
- 所有表情符号已从代码中移除
- 保持纯文本输出

### 2. 统一命令管理
- **之前**: 事件命令在独立的 `event-commands.service.js` 中
- **现在**: 所有命令统一在 `commands.service.js` 中管理

### 3. 统一消息格式
- **之前**: 消息字符串硬编码在代码中
- **现在**: 所有消息模板定义在 `config/messages.json` 中

## 修改的文件

### 1. `config/messages.json`
添加了所有事件命令的消息模板：

```json
{
  "commands": {
    "cargo": {
      "desc": "查询货船状态",
      "msg": "货船位于 {position} 还有 {minutes} 分钟即将离开",
      "msg_active": "货船位于 {position}",
      "empty": "当前地图上没有货船",
      "error": "[错误] 获取货船信息失败"
    },
    "small": { ... },
    "large": { ... },
    "heli": { ... },
    "events": { ... },
    "history": { ... }
  }
}
```

### 2. `src/services/commands.service.js`
- 修改构造函数接受 `eventMonitorService` 参数
- 添加 `registerEventCommands()` 方法
- 实现所有事件命令处理器：
  - `!cargo` - 查询货船状态
  - `!small` - 查询小油井状态
  - `!large` - 查询大油井状态
  - `!heli` - 查询武装直升机位置
  - `!events` - 查看所有活跃事件
  - `!history` - 查看所有事件历史
- **修复**: 将 CommonJS `require()` 改为 ES6 `import`

### 3. `src/services/rustplus.service.js`
- 添加 `setEventMonitorService()` 方法
- 自动调用 `registerEventCommands()` 注册事件命令

### 4. `src/app.js`
- 移除 `EventCommandsService` 导入
- 使用 `rustPlusService.setEventMonitorService(eventMonitorService)` 注入服务
- 简化 `setupEventMonitorLifecycle()` 函数

### 5. `src/services/event-monitor.service.js`
- **修复**: 将 `rustplus.getMapMarkersAsync()` 改为 `rustPlusService.getMapMarkers(serverId)`
- 修正返回数据结构：`response.markers` 而非 `response.response.mapMarkers.markers`

### 6. 删除文件
- `src/services/event-commands.service.js` - 已删除，功能合并到 `commands.service.js`

## 修复的问题

### 问题 1: ES Module 语法错误
**错误**: `ReferenceError: require is not defined in ES module scope`
- **位置**: `commands.service.js:242`
- **原因**: 使用 CommonJS `require()` 在 ES 模块中
- **修复**: 改为 ES6 `import EventTimerManager from '../utils/event-timer.js'`

### 问题 2: API 方法不存在
**错误**: `rustplus.getMapMarkersAsync is not a function`
- **位置**: `event-monitor.service.js:115`
- **原因**: 使用了不存在的 `getMapMarkersAsync()` 方法
- **修复**: 改为 `this.rustPlusService.getMapMarkers(serverId)`

## 命令列表

现在所有命令统一管理，包括：

### 基础命令
- `!help` - 显示所有命令
- `!time` - 显示游戏时间
- `!pop` - 显示服务器人数
- `!team` - 显示队伍信息
- `!online` - 显示在线队友

### 事件命令
- `!cargo` - 查询货船状态
- `!small` - 查询小油井状态
- `!large` - 查询大油井状态
- `!heli` - 查询武装直升机位置
- `!events` - 查看所有活跃事件
- `!history` - 查看所有事件历史

## 架构改进

### 之前的架构问题
1. 命令分散在多个服务中
2. 消息字符串硬编码
3. 表情符号混杂在代码中
4. 命令注册流程复杂
5. 使用错误的 API 方法

### 现在的架构优势
1. **统一命令管理**: 所有命令在 `commands.service.js` 中
2. **统一消息格式**: 所有消息在 `messages.json` 中
3. **无表情符号**: 纯文本输出
4. **简化注册**: 自动注册事件命令
5. **正确的 API**: 使用 `rustPlusService` 封装的方法
6. **ES6 模块**: 全部使用 `import/export` 语法

## 使用方式

### 服务初始化
```javascript
// 1. 创建事件监控服务
const eventMonitorService = new EventMonitorService(rustPlusService);

// 2. 注入到命令服务
rustPlusService.setEventMonitorService(eventMonitorService);

// 3. 事件命令自动注册完成
```

### 添加新消息模板
在 `config/messages.json` 中添加：

```json
{
  "commands": {
    "newcmd": {
      "desc": "新命令描述",
      "msg": "消息模板 {param}",
      "error": "[错误] 错误消息"
    }
  }
}
```

### 使用消息模板
在命令处理器中：

```javascript
const config = cmdConfig('newcmd');
this.registerCommand('newcmd', {
  description: config.desc,
  handler: async (serverId, args, context) => {
    return cmd('newcmd', 'msg', { param: 'value' });
  }
});
```

## 重启服务

修改完成后需要重启后端服务：

```bash
npm run dev
```

## 完成！

现在命令系统完全符合项目规范：
- ✅ 统一命令管理
- ✅ 统一消息格式
- ✅ 移除表情符号
- ✅ 简化架构
- ✅ 使用正确的 API
- ✅ ES6 模块语法
