# 数据库结构

本项目使用 **Prisma ORM + MySQL** 进行数据管理。

## Schema 文件位置

`backend/prisma/schema.prisma`

## 多租户隔离

所有业务表都包含 `userId` 字段，实现数据隔离：
- 级联删除：删除用户时自动清理所有关联数据
- 索引优化：userId、serverId、createdAt 都建立了索引
- 查询自动过滤：所有业务查询都需添加 `where: { userId }`

## 数据模型

### User - 用户表

| 字段 | 类型 | 说明 |
|------|------|------|
| id | String | 主键 (cuid) |
| username | String | 用户名 (唯一) |
| email | String | 邮箱 (唯一) |
| password | String | 密码 (bcrypt) |
| isAdmin | Boolean | 是否管理员 |
| isActive | Boolean | 是否激活 |
| createdAt | DateTime | 创建时间 |
| lastLogin | DateTime? | 最后登录 |

**关联**: subscription, servers, devices, eventLogs, orders

### Subscription - 订阅表

| 字段 | 类型 | 说明 |
|------|------|------|
| id | String | 主键 |
| userId | String | 用户ID (唯一) |
| planType | Enum | TRIAL/MONTHLY/QUARTERLY/YEARLY |
| startDate | DateTime | 开始时间 |
| endDate | DateTime | 结束时间 |
| status | Enum | ACTIVE/EXPIRED/CANCELLED |

### Order - 订单表

| 字段 | 类型 | 说明 |
|------|------|------|
| id | String | 主键 |
| userId | String | 用户ID |
| amount | Int | 金额（分） |
| planType | Enum | 套餐类型 |
| duration | Int | 时长（天） |
| paymentMethod | Enum | ALIPAY/WECHAT |
| status | Enum | PENDING/SUCCESS/FAILED/CANCELLED |
| tradeNo | String? | 支付平台交易号 |
| paidAt | DateTime? | 支付时间 |

### Server - 游戏服务器

| 字段 | 类型 | 说明 |
|------|------|------|
| id | String | 主键 |
| userId | String | 用户ID |
| name | String | 服务器名称 |
| ip | String | IP地址 |
| port | String | 端口 |
| playerId | String | 玩家ID |
| playerToken | String | 玩家Token |
| battlemetricsId | String? | BM ID |
| img | String? | 地图图片 |

**关联**: devices, eventLogs

### Device - 智能设备

| 字段 | 类型 | 说明 |
|------|------|------|
| id | String | 主键 |
| serverId | String | 服务器ID |
| userId | String | 用户ID (冗余) |
| entityId | Int | 游戏实体ID |
| name | String | 设备名称 |
| type | Enum? | SWITCH/ALARM/STORAGE_MONITOR |
| command | String? | 自定义命令名 |
| autoMode | Int | 自动化模式 (0-8) |
| reachable | Boolean | 是否可达 |
| lastTrigger | DateTime? | 最后触发时间 |

**唯一约束**: (serverId, entityId)

### EventLog - 事件日志

| 字段 | 类型 | 说明 |
|------|------|------|
| id | String | 主键 |
| serverId | String | 服务器ID |
| userId | String | 用户ID |
| eventType | String | 事件类型 |
| eventData | Json? | 事件数据 |
| createdAt | DateTime | 创建时间 |

## 枚举类型

### SubscriptionPlan
- `TRIAL` - 试用版（7天）
- `MONTHLY` - 月付（¥29/月）
- `QUARTERLY` - 季付（¥79/季）
- `YEARLY` - 年付（¥299/年）

### SubscriptionStatus
- `ACTIVE` - 活跃
- `EXPIRED` - 已过期
- `CANCELLED` - 已取消

### OrderStatus
- `PENDING` - 待支付
- `SUCCESS` - 成功
- `FAILED` - 失败
- `CANCELLED` - 已取消

### PaymentMethod
- `ALIPAY` - 支付宝
- `WECHAT` - 微信（未实现）

### DeviceType
- `SWITCH` - 开关
- `ALARM` - 警报
- `STORAGE_MONITOR` - 存储监控器

## 常用命令

```bash
# 创建新迁移
npx prisma migrate dev --name add_new_field

# 应用迁移到生产
npx prisma migrate deploy

# 生成 Prisma Client
npx prisma generate

# 打开数据库 UI
npx prisma studio

# 重置数据库
npx prisma migrate reset
```

## 查询示例

```javascript
// 获取用户的所有服务器
const servers = await prisma.server.findMany({
  where: { userId: req.user.id }
});

// 获取服务器及其设备
const server = await prisma.server.findUnique({
  where: { id: serverId },
  include: { devices: true }
});

// 创建订单
const order = await prisma.order.create({
  data: {
    userId,
    amount: 2900,
    planType: 'MONTHLY',
    duration: 30,
    paymentMethod: 'ALIPAY'
  }
});
```
