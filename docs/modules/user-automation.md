# UserAutomation 模块文档

> 文件: `backend/src/services/user-automation.js`
> 行数: 310 | 类型: 用户实例服务

---

## 1. 概述

`UserAutomation` 是用户级别的 **设备自动化服务**，支持根据游戏时间（日/夜）和队友在线状态自动控制智能设备。

---

## 2. 自动化模式

| 模式 | 枚举值 | 行为 |
|------|--------|------|
| 手动 | `NONE` | 不自动控制 |
| 白天开启 | `DAY_ON` | 游戏白天自动开启 |
| 夜晚开启 | `NIGHT_ON` | 游戏夜晚自动开启 |
| 始终开启 | `ALWAYS_ON` | 保持开启状态 |
| 始终关闭 | `ALWAYS_OFF` | 保持关闭状态 |
| 在线开启 | `ONLINE_ON` | 有队友在线时开启 |
| 离线开启 | `ONLINE_OFF` | 所有队友离线时开启 |

---

## 3. 公开方法

| 方法 | 描述 |
|------|------|
| `start(serverId)` | 启动自动化轮询 |
| `stop(serverId)` | 停止自动化 |
| `stopAll()` | 停止所有自动化 |
| `getDevicesWithAutoMode(serverId)` | 获取有自动化模式的设备 |
| `checkAutomation(serverId)` | 检查并执行自动化 |
| `evaluateAutoMode(device, ctx)` | 评估设备应该开/关 |
| `isInteracting(serverId, entityId)` | 检查是否正在操作 |

---

## 4. 轮询机制

- **轮询间隔**: 30 秒
- **冷却时间**: 操作后 5 秒内不重复操作
- **可达性检查**: 设备不可达时自动标记

---

## 5. 事件列表

| 事件 | 描述 |
|------|------|
| `automation:executed` | 自动化操作已执行 |

---

## 6. 使用示例

```javascript
const automation = new UserAutomation(userId, rustPlusService);

// 启动自动化
automation.start(serverId);

// 监听执行事件
automation.on('automation:executed', (data) => {
  console.log(`设备 ${data.entityId} 已自动${data.value ? '开启' : '关闭'}`);
});
```
