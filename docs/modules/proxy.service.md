# ProxyService 模块文档

> 文件: `backend/src/services/proxy.service.js`
> 行数: 466 | 类型: 单例服务

---

## 1. 概述

`ProxyService` 是 **Xray 代理管理服务**，负责解析订阅链接、生成配置、启动/停止 Xray 进程。专为中国大陆用户解决网络连接问题。

---

## 2. 核心职责

| 职责 | 描述 |
|------|------|
| **订阅解析** | 解析 Clash/V2Ray 订阅链接 |
| **配置生成** | 生成 Xray JSON 配置 |
| **进程管理** | 启动/停止 Xray 进程 |
| **节点切换** | 动态切换代理节点 |

---

## 3. 支持的协议

| 协议 | 支持 |
|------|:----:|
| VMess | ✅ |
| VLESS | ✅ |
| Trojan | ✅ |
| Shadowsocks | ✅ |

---

## 4. 公开方法

| 方法 | 描述 |
|------|------|
| `initialize(subscriptionUrl, preferredNode)` | 初始化代理 |
| `startXray()` | 启动 Xray 进程 |
| `stopXray()` | 停止 Xray 进程 |
| `switchNode(nodeName)` | 切换节点 |
| `getProxyAgent()` | 获取 SOCKS5 Agent |
| `getProxyUrl()` | 获取代理地址 |
| `getStatus()` | 获取当前状态 |

---

## 5. 事件列表

| 事件 | 描述 |
|------|------|
| `proxy:started` | 代理启动 |
| `proxy:stopped` | 代理停止 |
| `proxy:error` | 代理错误 |
| `node:changed` | 节点切换 |

---

## 6. 使用示例

```javascript
import proxyService from './proxy.service.js';

// 初始化代理
await proxyService.initialize('https://订阅链接', '香港节点');

// 获取代理 Agent
const agent = proxyService.getProxyAgent();

// 切换节点
await proxyService.switchNode('日本节点');
```
