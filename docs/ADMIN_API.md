# 管理后台 API 文档

所有管理接口需要管理员权限（`isAdmin: true`）。

## 认证

所有请求需要携带 JWT Token：
```
Authorization: Bearer <token>
```

权限验证：
```javascript
router.use(authenticate, requireAdmin);
```

## 用户管理

### 获取用户列表

```
GET /api/admin/users
```

**查询参数**:
| 参数 | 类型 | 说明 |
|------|------|------|
| page | number | 页码（默认1） |
| limit | number | 每页数量（默认20） |
| search | string | 搜索用户名/邮箱 |
| status | string | active/inactive/all |
| planType | string | TRIAL/MONTHLY/QUARTERLY/YEARLY |

**返回**: 用户列表 + 服务运行状态

---

### 获取用户详情

```
GET /api/admin/users/:id
```

**返回**:
- 用户信息
- 统计数据（服务器数、订单数、总消费）
- 服务状态（FCM监听、连接的服务器）

---

### 启用/禁用用户

```
PUT /api/admin/users/:id/status
```

**请求体**:
```json
{
  "isActive": false
}
```

**行为**:
- 禁用时自动停止该用户的 UserServiceManager
- 启用时自动创建服务实例（如订阅有效）

---

### 调整订阅时间

```
PUT /api/admin/users/:id/subscription
```

**请求体**:
```json
{
  "endDate": "2024-12-31T23:59:59.000Z",
  "planType": "YEARLY"
}
```

---

### 获取用户服务器列表

```
GET /api/admin/users/:id/servers
```

**返回**: 服务器列表（含连接状态）

---

### 强制断开服务器连接

```
DELETE /api/admin/users/:userId/servers/:serverId
```

---

### 获取用户事件日志

```
GET /api/admin/users/:id/events
```

**查询参数**:
| 参数 | 类型 | 说明 |
|------|------|------|
| page | number | 页码 |
| limit | number | 每页数量 |

## 订单管理

### 获取所有订单

```
GET /api/admin/orders
```

**查询参数**:
| 参数 | 类型 | 说明 |
|------|------|------|
| page | number | 页码 |
| limit | number | 每页数量 |
| status | string | PENDING/SUCCESS/FAILED/CANCELLED |
| userId | string | 过滤特定用户 |

## 统计数据

### 获取系统统计

```
GET /api/admin/stats
```

**返回**:
```json
{
  "users": {
    "total": 100,
    "active": 80,
    "trial": 20,
    "paid": 60,
    "banned": 5
  },
  "subscriptions": {
    "expiringSoon": 10,
    "expired": 15
  },
  "orders": {
    "total": 200,
    "success": 180,
    "pending": 10,
    "totalRevenue": 50000,
    "todayRevenue": 1000
  },
  "rustplus": {
    "totalServers": 150,
    "connectedServers": 80,
    "totalDevices": 500,
    "activeConnections": 80,
    "fcmActiveUsers": 70
  },
  "events": {
    "today": 1000,
    "total": 50000
  }
}
```

## 系统监控

### 获取系统状态

```
GET /api/admin/system
```

**返回**:
```json
{
  "uptime": 86400,
  "memory": {
    "heapUsed": 100000000,
    "heapTotal": 200000000,
    "external": 50000000
  },
  "activeUserServices": 50,
  "config": {
    "proxyEnabled": true,
    "fcmEnabled": true
  }
}
```

## 默认管理员账户

创建：
```bash
# 直接通过 SQL 创建管理员用户
mysql -u root -p rustplus_db -e "
INSERT INTO users (id, username, email, password, isAdmin, isActive, createdAt, updatedAt)
VALUES (UUID(), 'admin', 'admin@localhost', '\$2b\$10\$...', 1, 1, NOW(), NOW());
"
```

默认凭证：
- 邮箱: `admin@localhost`
- 密码: `admin123456`（需手动用 bcrypt 加密）
- 订阅: 永久订阅（至 2099-12-31）
