# BattlemetricsService 模块文档

> 文件: `backend/src/services/battlemetrics.service.js`
> 行数: 336 | 类型: 单例服务

---

## 1. 概述

`BattlemetricsService` 是 **Battlemetrics API 集成服务**，用于获取 Rust 服务器详细信息、清档时间、玩家排行等数据。

---

## 2. 核心功能

| 功能 | 描述 |
|------|------|
| **服务器搜索** | 按名称或 IP 搜索服务器 |
| **服务器详情** | 获取详细信息（清档时间、地图等） |
| **玩家排行** | 获取在线时长排行榜 |
| **缓存管理** | 缓存查询结果 |

---

## 3. 公开方法

| 方法 | 描述 |
|------|------|
| `setProxyAgent(agent)` | 设置代理 |
| `searchServerByName(name)` | 按名称搜索 |
| `searchServerByAddress(ip, port, name)` | 按地址搜索 |
| `getServerInfo(battlemetricsId)` | 获取服务器详情 |
| `getTopPlayers(battlemetricsId, days)` | 获取玩家排行 |
| `getCachedServerInfo(id)` | 获取缓存数据 |
| `clearCache(id)` | 清除缓存 |

---

## 4. 返回数据示例

```javascript
{
  id: '123456',
  name: 'Rust Server',
  players: 150,
  maxPlayers: 200,
  map: 'Procedural Map',
  mapSize: 4500,
  lastWipe: '2026-01-01T00:00:00Z',
  nextWipe: '2026-01-08T00:00:00Z',
  wipeCycle: 7,  // 估算的清档周期（天）
  rank: 100
}
```

---

## 5. 使用示例

```javascript
import battlemetricsService from './battlemetrics.service.js';

// 搜索服务器
const server = await battlemetricsService.searchServerByAddress('1.2.3.4', '28015');

// 获取详情
const info = await battlemetricsService.getServerInfo(server.id);
console.log(`下次清档: ${info.nextWipe}`);
```
