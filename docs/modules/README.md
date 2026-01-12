# 后端服务模块文档索引

> 生成时间: 2026-01-12

本目录包含 Rust+ Web Dashboard 项目后端服务层的详细模块文档。

---

## 📦 核心服务层

| 模块 | 文档 | 描述 | 行数 |
|------|------|------|:----:|
| GlobalServiceManager | [查看](global-manager.service.md) | 全局服务编排器 | 527 |
| UserServiceManager | [查看](user-service-manager.md) | 用户服务管理器 | 791 |

---

## 🎮 游戏服务层

| 模块 | 文档 | 描述 | 行数 |
|------|------|------|:----:|
| UserRustPlusManager | [查看](user-rustplus-manager.md) | Rust+ 连接管理 | 977 |
| UserFCMManager | [查看](user-fcm-manager.md) | FCM 推送监听 | 839 |
| UserEventMonitor | [查看](user-event-monitor.md) | 游戏事件监控 | 880 |
| UserAutomation | [查看](user-automation.md) | 设备自动化 | 310 |
| UserCommands | [查看](user-commands.md) | 游戏内命令 | 720 |

---

## 🔌 基础设施层

| 模块 | 文档 | 描述 | 行数 |
|------|------|------|:----:|
| WebSocketService | [查看](websocket.service.md) | Socket.io 实时通信 | 622 |
| ProxyService | [查看](proxy.service.md) | Xray 代理管理 | 466 |
| SubscriptionService | [查看](subscription.service.md) | 订阅链接解析 | 297 |

---

## 💰 业务服务层

| 模块 | 文档 | 描述 | 行数 |
|------|------|------|:----:|
| PaymentService | [查看](payment.service.md) | 订单管理 | 380 |
| AlipayService | [查看](alipay.service.md) | 支付宝支付 | 276 |
| BattlemetricsService | [查看](battlemetrics.service.md) | Battlemetrics API | 336 |

---

## 📊 统计

- **模块总数**: 13
- **代码总行数**: ~6,421 行
- **文档最后更新**: 2026-01-12
