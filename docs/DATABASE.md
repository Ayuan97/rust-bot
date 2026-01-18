# 数据库结构

本项目使用 **mysql2 + MySQL** 进行数据管理。

## 数据库配置

**环境变量** (`backend/.env`):
```env
DB_HOST=localhost
DB_PORT=3306
DB_USER=root
DB_PASSWORD=your_password
DB_NAME=rustplus_db
```

**连接池**: `backend/src/lib/db.js`

## 初始化脚本

`backend/sql/init.sql` - 包含所有表的 CREATE TABLE 语句

## 多租户隔离

所有业务表都包含 `userId` 字段，实现数据隔离：
- 手动级联删除：删除用户时需按顺序清理关联数据
- 索引优化：userId、serverId、createdAt 都建立了索引
- 查询自动过滤：所有业务查询都需添加 `WHERE userId = ?`

## 数据模型

### User - 用户表

| 字段 | 类型 | 说明 |
|------|------|------|
| id | VARCHAR(36) | 主键 (UUID) |
| username | VARCHAR(50) | 用户名 (唯一) |
| email | VARCHAR(100) | 邮箱 (唯一) |
| password | VARCHAR(255) | 密码 (bcrypt) |
| isAdmin | TINYINT(1) | 是否管理员 |
| isActive | TINYINT(1) | 是否激活 |
| createdAt | DATETIME | 创建时间 |
| lastLogin | DATETIME | 最后登录 |

**关联**: subscription, servers, devices, eventLogs, orders

### Subscription - 订阅表

| 字段 | 类型 | 说明 |
|------|------|------|
| id | VARCHAR(36) | 主键 |
| userId | VARCHAR(36) | 用户ID (唯一) |
| planType | ENUM | TRIAL/MONTHLY/QUARTERLY/YEARLY |
| startDate | DATETIME | 开始时间 |
| endDate | DATETIME | 结束时间 |
| status | ENUM | ACTIVE/EXPIRED/CANCELLED |

### Order - 订单表

| 字段 | 类型 | 说明 |
|------|------|------|
| id | VARCHAR(36) | 主键 |
| userId | VARCHAR(36) | 用户ID |
| amount | INT | 金额（分） |
| planType | ENUM | 套餐类型 |
| duration | INT | 时长（天） |
| paymentMethod | ENUM | ALIPAY/WECHAT |
| status | ENUM | PENDING/SUCCESS/FAILED/CANCELLED |
| tradeNo | VARCHAR(100) | 支付平台交易号 |
| paidAt | DATETIME | 支付时间 |

### Server - 游戏服务器

| 字段 | 类型 | 说明 |
|------|------|------|
| id | VARCHAR(36) | 主键 |
| userId | VARCHAR(36) | 用户ID |
| name | VARCHAR(255) | 服务器名称 |
| ip | VARCHAR(100) | IP地址 |
| port | VARCHAR(10) | 端口 |
| playerId | VARCHAR(50) | 玩家ID |
| playerToken | VARCHAR(100) | 玩家Token |
| battlemetricsId | VARCHAR(50) | BM ID |
| img | TEXT | 地图图片 |

**关联**: devices, eventLogs

### Device - 智能设备

| 字段 | 类型 | 说明 |
|------|------|------|
| id | VARCHAR(36) | 主键 |
| serverId | VARCHAR(36) | 服务器ID |
| userId | VARCHAR(36) | 用户ID (冗余) |
| entityId | INT | 游戏实体ID |
| name | VARCHAR(255) | 设备名称 |
| type | ENUM | SWITCH/ALARM/STORAGE_MONITOR |
| command | VARCHAR(50) | 自定义命令名 |
| autoMode | VARCHAR(20) | 自动化模式 |
| reachable | TINYINT(1) | 是否可达 |
| lastTrigger | DATETIME | 最后触发时间 |

**唯一约束**: (serverId, entityId)

### EventLog - 事件日志

| 字段 | 类型 | 说明 |
|------|------|------|
| id | VARCHAR(36) | 主键 |
| serverId | VARCHAR(36) | 服务器ID |
| userId | VARCHAR(36) | 用户ID |
| eventType | ENUM | 事件类型 |
| eventData | TEXT | 事件数据 (JSON) |
| createdAt | DATETIME | 创建时间 |

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

## 数据库管理

### 初始化数据库
```bash
mysql -u root -p < backend/sql/init.sql
```

### 数据库变更
将变更脚本放在 `backend/sql/migrations/` 目录，按日期命名：
```
2025-01-18_add_new_column.sql
```

## 查询示例

```javascript
import db from '../lib/db.js';

// 获取用户的所有服务器
const [servers] = await db.query(
  'SELECT * FROM servers WHERE userId = ? ORDER BY createdAt DESC',
  [userId]
);

// 获取服务器及其设备
const [serverRows] = await db.query('SELECT * FROM servers WHERE id = ?', [serverId]);
const server = serverRows[0];
const [devices] = await db.query('SELECT * FROM devices WHERE serverId = ?', [serverId]);

// 创建订单
const id = crypto.randomUUID();
await db.query(
  `INSERT INTO orders (id, userId, amount, planType, duration, paymentMethod, status, createdAt, updatedAt)
   VALUES (?, ?, ?, ?, ?, ?, 'PENDING', NOW(), NOW())`,
  [id, userId, 2900, 'MONTHLY', 30, 'ALIPAY']
);

// 事务处理
const conn = await db.getConnection();
try {
  await conn.beginTransaction();
  await conn.query('UPDATE users SET balance = ? WHERE id = ?', [newBalance, userId]);
  await conn.query('INSERT INTO orders (...) VALUES (...)', [...]);
  await conn.commit();
} catch (err) {
  await conn.rollback();
  throw err;
} finally {
  conn.release();
}
```
