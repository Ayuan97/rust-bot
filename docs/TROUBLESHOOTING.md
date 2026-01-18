# 常见问题和解决方案

## 数据库错误

### Cannot open database because the directory does not exist

**原因**: `/backend/data` 目录不存在

**解决**:
```bash
mkdir -p backend/data
```
服务器启动时通常会自动创建。

---

### table xxx has no column named yyy

**原因**: 数据库 schema 与代码不同步

**解决**:
```bash
# 检查 sql/init.sql 中的表结构
# 手动执行 ALTER TABLE 添加缺失列
mysql -u root -p rustplus_db < backend/sql/migrations/xxx.sql
```

---

### ER_DUP_ENTRY: Duplicate entry

**原因**: 尝试插入重复的唯一字段值

**解决**: 检查是否有重复的 email、username 或 (serverId, entityId) 组合

## FCM 监听错误

### Cannot read properties of undefined (reading 'listen')

**原因**: 使用了不存在的 `RustPlus.FCM.listen()` API

**解决**: 使用 push-receiver 库
```javascript
import PushReceiverClient from '@liamcottle/push-receiver/src/client.js';

const client = new PushReceiverClient(androidId, securityToken, []);
client.on('ON_DATA_RECEIVED', (data) => { });
await client.connect();
```

---

### 凭证格式错误：需要 GCM 格式的凭证

**原因**: 传入了 FCM 格式凭证，但代码只支持 GCM 格式

**解决**: 确保凭证包含：
```json
{
  "gcm": {
    "androidId": "...",
    "securityToken": "..."
  }
}
```

---

### FCM 已连接但收不到配对推送

**可能原因**:
1. GCM 凭证未在 Rust+ 服务器注册
2. Steam ID 与游戏账号不匹配
3. 凭证已过期
4. 网络问题

**排查步骤**:
1. 检查日志中是否有 "FCM 连接心跳检查"
2. 确认凭证中的 steam_id 正确
3. 检查 expire_date 时间戳
4. 在游戏中多次点击配对按钮
5. 检查防火墙

**验证**:
```bash
curl http://localhost:3000/api/pairing/status
# 检查 credentialType 是否为 "GCM"
# 检查 isListening 是否为 true
```

## CORS 错误

### 前端请求被 CORS 策略阻止

**原因**: 前端 URL 未在后端白名单中

**解决**: 在 `backend/.env` 设置：
```env
FRONTEND_URL=http://localhost:5173
```

## 连接失败

### 前端显示"连接服务器失败"

**可能原因**:
1. 后端未启动
2. IP/端口/Token 错误
3. 游戏服务器 app.port 未开放

**解决**:
1. 确认后端运行：`curl http://localhost:3000/api/health`
2. 检查服务器配置
3. 确认游戏服务器 `server.cfg` 中配置了 `app.port`

## WebSocket 连接问题

### WebSocket 连接失败 / 断开

**可能原因**:
1. JWT Token 过期
2. 订阅已过期
3. 网络不稳定

**解决**:
1. 重新登录获取新 Token
2. 检查订阅状态
3. 检查网络连接

## 日志调试

### 启用调试日志

```bash
LOG_LEVEL=debug npm run dev
```

### 日志级别

| 级别 | 说明 |
|------|------|
| error | 仅错误 |
| warn | 错误 + 警告 |
| info | 默认，常规信息 |
| debug | 包含调试信息 |

### 日志格式

```
[10:30:45] ✅ FCM 注册成功
[10:30:46] [MyServer] 🔌 已连接到服务器
[10:30:47] ❌ 连接失败: Connection timeout
```

## 健康检查

```bash
# 检查后端
curl http://localhost:3000/api/health

# 检查配对状态
curl http://localhost:3000/api/pairing/status

# 检查数据库连接
mysql -u root -p -e "SELECT 1"
```

## 性能问题

### 内存使用过高

**可能原因**:
1. 连接的服务器过多
2. 事件日志积累过多
3. 内存泄漏

**解决**:
1. 检查 `globalServiceManager.userServices.size`
2. 定期清理旧事件日志
3. 重启服务

### API 响应慢

**可能原因**:
1. 数据库查询未优化
2. N+1 查询问题

**解决**:
1. 优化 SQL 查询，使用 JOIN 减少查询次数
2. 添加适当的数据库索引
