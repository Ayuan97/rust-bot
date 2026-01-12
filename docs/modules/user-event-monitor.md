# UserEventMonitor 模块文档

> 文件: `backend/src/services/user-event-monitor.js`
> 行数: 880 | 类型: 用户实例服务

---

## 1. 概述

`UserEventMonitor` 是用户级别的 **事件监控服务**，负责追踪游戏事件（货船、直升机、油井、队友状态等）并发出通知。

---

## 2. 核心职责

| 职责 | 描述 |
|------|------|
| **地图标记监控** | 定时轮询地图标记变化 |
| **队伍状态监控** | 检测队友上线/下线/死亡/AFK |
| **事件日志** | 保存事件到数据库 |
| **通知设置** | 根据用户设置过滤通知 |

---

## 3. 监控的事件类型

| 事件 | 方法 |
|------|------|
| **货船** | `checkCargoShips()` - 出现/离开/停靠港口 |
| **直升机** | `checkPatrolHelicopters()` - 出现/坠毁 |
| **CH47** | `checkCH47s()` |
| **油井** | 触发/箱子解锁 |
| **上锁箱子** | `checkLockedCrates()` |
| **队伍** | `checkTeamInfo()` - 上下线/死亡/AFK |

---

## 4. 公开方法

| 方法 | 描述 |
|------|------|
| `start(serverId)` | 启动服务器事件监控 |
| `stop(serverId)` | 停止服务器监控 |
| `stopAll()` | 停止所有监控 |
| `loadNotificationSettings()` | 加载用户通知设置 |
| `isNotificationEnabled(key)` | 检查通知是否启用 |
| `saveEventLog(serverId, eventType, data)` | 保存事件日志 |
| `getEventData(serverId)` | 获取事件数据 |

---

## 5. 事件列表

| 事件 | 描述 |
|------|------|
| `cargo:spawn` | 货船出现 |
| `cargo:egress` | 货船边缘出现 |
| `cargo:dock` | 货船停靠港口 |
| `cargo:leave` | 货船离开 |
| `heli:spawn` | 直升机出现 |
| `heli:downed` | 直升机坠毁 |
| `player:died` | 队友死亡 |
| `player:online` | 队友上线 |
| `player:offline` | 队友下线 |
| `player:afk` | 队友挂机 |

---

## 6. 使用示例

```javascript
const eventMonitor = new UserEventMonitor(userId, rustPlusService);

// 加载通知设置
await eventMonitor.loadNotificationSettings();

// 启动监控
eventMonitor.start(serverId);

// 监听事件
eventMonitor.on('cargo:spawn', (data) => {
  console.log('货船出现于', data.grid);
});
```
