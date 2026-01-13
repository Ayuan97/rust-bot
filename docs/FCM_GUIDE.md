# FCM 凭证管理指南

本文档详细说明 FCM (Firebase Cloud Messaging) 凭证的获取、格式和使用方法。

## 凭证格式要求

本项目**只支持 GCM 格式**凭证：

```json
{
  "gcm": {
    "androidId": "...",
    "securityToken": "..."
  },
  "steam": {
    "steamId": "..."
  }
}
```

## 获取凭证

### 方法1：通过 Rust+ Companion 网站

1. 访问 `https://companion-rust.facepunch.com/login`
2. 使用 Steam 账号登录
3. 获取凭证命令，格式如：
   ```
   /credentials add gcm_android_id:xxx gcm_security_token:xxx steam_id:xxx ...
   ```
4. 在 Web 界面填入凭证参数

### 方法2：通过 RustPlus CLI

凭证文件位置：`~/.rustplus/credentials`

系统会自动尝试从此位置加载凭证。

### 方法3：手动输入

通过 API 提交：
```bash
POST /api/pairing/credentials/manual
Content-Type: application/json

{
  "gcm": {
    "androidId": "your_android_id",
    "securityToken": "your_security_token"
  },
  "steam": {
    "steamId": "your_steam_id"
  }
}
```

## 凭证加载优先级

1. **数据库** - 之前保存的凭证（最快）
2. **RustPlus CLI** - 从 `~/.rustplus/credentials` 加载
3. **手动输入** - 通过 API 提交

## 正确的 FCM 监听实现

```javascript
import AndroidFCM from '@liamcottle/push-receiver/src/android/fcm.js';
import PushReceiverClient from '@liamcottle/push-receiver/src/client.js';

// 注册新凭证
const credentials = await AndroidFCM.register(apiKey, projectId, ...);

// 使用已有凭证监听
const client = new PushReceiverClient(androidId, securityToken, []);

client.on('ON_DATA_RECEIVED', (data) => {
  // 处理推送消息
});

await client.connect();
```

## 常见错误

### 错误：使用不存在的 API

```javascript
// ❌ 这些方法不存在！
RustPlus.FCM.register()
RustPlus.FCM.listen()
```

### 正确用法

参考 `backend/src/services/user-fcm-manager.js` 中的实现。

## 配对流程

1. 用户在 Web 界面提交凭证
2. 后端保存凭证并启动 FCM 监听
3. 用户在游戏中点击 "Rust+ → Pair with Server"
4. FCM 推送到达后端
5. 后端解析推送，保存服务器信息
6. 自动连接到服务器

## 调试

### 检查凭证状态

```bash
curl http://localhost:3000/api/pairing/status
```

返回示例：
```json
{
  "hasCredentials": true,
  "credentialType": "GCM",
  "isListening": true,
  "steamId": "76561198xxxxxxxxx"
}
```

### 启用详细日志

```bash
LOG_LEVEL=debug npm run dev
```

日志输出：
- FCM 连接状态
- 心跳检查（每30秒）
- 收到的推送消息
- 配对事件

## 凭证过期

GCM 凭证可能会过期，检查 `expire_date` 字段（Unix 时间戳）。

过期后需要重新获取凭证。

## 安全注意事项

- 凭证应妥善保管，不要泄露
- 每个用户使用独立的凭证
- 凭证存储在数据库中，建议加密存储
