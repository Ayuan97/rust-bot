# SubscriptionService 模块文档

> 文件: `backend/src/services/subscription.service.js`
> 行数: 297 | 类型: 单例服务

---

## 1. 概述

`SubscriptionService` 是 **代理订阅解析服务**，支持解析 Clash YAML 和 Base64 编码的订阅链接，提取代理节点配置。

---

## 2. 支持的格式

| 格式 | 描述 |
|------|------|
| **Clash YAML** | 标准 Clash 配置文件 |
| **Base64** | V2Ray/SS 订阅格式 |
| `vmess://` | VMess 协议 URI |
| `ss://` | Shadowsocks URI |
| `trojan://` | Trojan 协议 URI |
| `vless://` | VLESS 协议 URI |

---

## 3. 公开方法

| 方法 | 描述 |
|------|------|
| `fetchSubscription(url)` | 获取并解析订阅 |
| `parseClashYaml(content)` | 解析 Clash YAML |
| `parseBase64Subscription(content)` | 解析 Base64 订阅 |
| `parseVmessUri(uri)` | 解析 VMess URI |
| `parseShadowsocksUri(uri)` | 解析 SS URI |
| `parseTrojanUri(uri)` | 解析 Trojan URI |
| `parseVlessUri(uri)` | 解析 VLESS URI |
| `selectBestNode(nodes, preferredName)` | 选择最佳节点 |
| `getNodes()` | 获取节点列表 |

---

## 4. 使用示例

```javascript
import subscriptionService from './subscription.service.js';

// 获取节点列表
const nodes = await subscriptionService.fetchSubscription('https://订阅链接');

// 选择节点
const bestNode = subscriptionService.selectBestNode(nodes, '香港');
```
