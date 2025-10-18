# 🔑 如何获取 FCM 凭证

## ⚠️ 重要说明

要使用 Rust+ 配对功能，**必须**先获取关联到你 Steam 账号的 FCM 凭证。

没有这些凭证，系统无法接收来自游戏服务器的配对推送！

---

## 🎯 方法 1: 使用 rustplus CLI（最简单）⭐⭐⭐

这是**最推荐**的方式！

### 步骤

```bash
# 1. 安装 rustplus CLI 工具
npm install -g @liamcottle/rustplus.js

# 2. 启动配对服务器
rustplus-pairing-server

# 3. 会显示一个二维码和链接
# 示例输出:
#   ┌─────────────────────────────────────┐
#   │                                     │
#   │   █▀▀▀▀▀█ █▀█ ▀▀█▀▀█ █▀▀▀▀▀█     │
#   │   █ ███ █ ▀▀█▄ ▄█ ▄█ █ ███ █     │
#   │   █ ▀▀▀ █ ▀ ▀███▄ ▀█ █ ▀▀▀ █     │
#   │                                     │
#   └─────────────────────────────────────┘
#
#   Or visit: http://localhost:8080
```

### 在手机上操作

#### Android / iOS:
1. 打开 Rust+ App
2. 登录你的 Steam 账号
3. 在 App 中找到扫描二维码的功能
4. 扫描终端显示的二维码
5. 完成配对

### 完成

凭证会自动保存到：`~/.rustplus/credentials`

**重启我们的项目**，系统会自动检测并加载这个凭证文件！

```bash
# 停止现有进程（Ctrl + C）
# 重新启动
./start.sh

# 看到以下输出表示成功:
# ✅ 已从 rustplus CLI 加载凭证
# 📂 凭证来源: /Users/xxx/.rustplus/credentials
# ✅ FCM 监听已启动
```

---

## 🎯 方法 2: 从 Rust+ App 提取（Android）

如果你已经在用 Rust+ App，可以直接提取凭证。

### 前提条件
- Android 设备
- 已安装 Rust+ App
- 已登录 Steam 账号
- 设备已 Root（或使用 ADB backup）

### 步骤 1: Root 设备方式

```bash
# 连接设备
adb shell
su

# 进入 Rust+ 数据目录
cd /data/data/com.facepunch.rust.companion/

# 查找凭证
cat shared_prefs/Expo.plist

# 或者
cat shared_prefs/*.xml | grep -E "(fcm|expo|credentials)"
```

### 步骤 2: 提取关键信息

查找以下字段：
- `expoPushToken` - FCM Token
- `credentials` - 完整凭证 JSON

### 步骤 3: 保存为文件

将提取的 JSON 保存到：
```
~/.rustplus/credentials
```

格式示例：
```json
{
  "fcm": {
    "token": "ExponentPushToken[xxx]",
    "pushSet": "default"
  },
  "keys": {
    "privateKey": "...",
    "publicKey": "...",
    "authSecret": "..."
  }
}
```

---

## 🎯 方法 3: 抓包获取

使用抓包工具获取凭证。

### 工具选择
- mitmproxy (免费)
- Charles (付费)
- Burp Suite (免费社区版)

### 步骤

#### 1. 配置抓包代理
```bash
# 安装 mitmproxy
pip install mitmproxy

# 启动代理
mitmproxy -p 8080

# 或使用 Web 界面
mitmweb -p 8080
```

#### 2. 手机配置代理
- 连接到同一 WiFi
- 设置 HTTP 代理
- 主机: 电脑 IP
- 端口: 8080
- 安装 mitmproxy 证书

#### 3. 打开 Rust+ App
登录后，在 mitmproxy 中查找：
```
POST https://companion-rust.facepunch.com/api/push/register
```

#### 4. 查看请求内容
```json
{
  "AuthToken": "Steam_Auth_Token_Here",
  "DeviceId": "ExponentPushToken[xxx]",
  "PushKind": 0
}
```

#### 5. 构造凭证文件
根据抓包信息构造完整的凭证 JSON。

---

## 🎯 方法 4: 通过 Web 界面手动输入

如果你已经通过其他方式获取了凭证，可以直接在 Web 界面输入。

### 步骤

1. 启动项目
```bash
./start.sh
```

2. 访问 Web 界面
```
http://localhost:5173
```

3. 点击"输入 FCM 凭证"

4. 填写表单
```
FCM Token: ExponentPushToken[xxx]
或
GCM Android ID: 5052709013102372144
GCM Security Token: 8153440654009569937
Steam ID: 76561198385127796
```

5. 点击"保存并开始监听"

---

## 📋 凭证格式说明

### 完整格式（推荐）
```json
{
  "fcm": {
    "token": "ExponentPushToken[xxxxxxxxx]",
    "pushSet": "default"
  },
  "keys": {
    "privateKey": "-----BEGIN PRIVATE KEY-----\n...\n-----END PRIVATE KEY-----",
    "publicKey": "-----BEGIN PUBLIC KEY-----\n...\n-----END PUBLIC KEY-----",
    "authSecret": "base64_encoded_string"
  }
}
```

### 简化格式
```json
{
  "fcm_token": "ExponentPushToken[xxx]",
  "gcm_android_id": "5052709013102372144",
  "gcm_security_token": "8153440654009569937",
  "steam_id": "76561198385127796"
}
```

---

## ✅ 验证凭证是否有效

### 通过 API
```bash
curl http://localhost:3000/api/pairing/status
```

响应：
```json
{
  "success": true,
  "status": {
    "isListening": true,
    "hasCredentials": true,
    "hasStoredCredentials": true
  }
}
```

### 通过日志
启动项目后查看日志：
```
✅ 找到已保存的 FCM 凭证
✅ FCM 凭证已加载
👂 开始监听 FCM 推送消息...
✅ FCM 监听已启动
```

---

## 🚨 常见问题

### Q1: 使用方法 3（/api/pairing/start）可以吗？

**不推荐！**

虽然会生成 FCM 凭证，但：
- ❌ 没有关联 Steam 账号
- ❌ 游戏服务器不知道推送给谁
- ❌ 无法接收配对推送
- ❌ 配对功能无法使用

### Q2: 凭证会过期吗？

Steam Auth Token 会在 **2 周**后过期。

但 FCM 凭证理论上不会过期。如果失效：
1. 重新使用 rustplus CLI 获取
2. 或者手动刷新 Steam Auth Token

### Q3: 多个设备可以共用凭证吗？

理论上可以，但**不推荐**：
- 可能导致推送混乱
- 只有一个设备能接收推送
- 建议每个设备使用独立凭证

### Q4: 我没有 Android 设备怎么办？

**方法 1（推荐）**: 使用 Android 模拟器
```bash
# 安装 Android Studio
# 创建虚拟设备
# 安装 Rust+ APK
# 使用 rustplus CLI 配对
```

**方法 2**: 借用朋友的 Android 设备
- 临时登录你的 Steam
- 使用 rustplus CLI 配对
- 凭证保存后就可以归还设备

**方法 3**: 使用 iOS
- iOS 版本也可以配对
- 但提取凭证更困难（需要越狱）
- 推荐使用 rustplus CLI 方式

---

## 💡 推荐流程

### 首次使用

```bash
# 1. 安装 rustplus CLI
npm install -g @liamcottle/rustplus.js

# 2. 获取凭证
rustplus-pairing-server
# 在手机 App 中扫描二维码

# 3. 启动我们的项目
cd rust-bot-new
./start.sh

# 4. 系统自动加载凭证
# ✅ 已从 rustplus CLI 加载凭证
```

### 之后使用

```bash
# 直接启动，自动加载已保存的凭证
./start.sh
```

---

## 📚 参考资料

- [rustplus.js GitHub](https://github.com/liamcottle/rustplus.js)
- [Rust+ Pairing Flow](https://github.com/liamcottle/rustplus.js/blob/master/docs/PairingFlow.md)
- [Rust Companion API](https://companion-rust.facepunch.com)

---

**最后更新**: 2025-10-18

**推荐方法**: 🥇 rustplus CLI → 🥈 从 App 提取 → 🥉 抓包
