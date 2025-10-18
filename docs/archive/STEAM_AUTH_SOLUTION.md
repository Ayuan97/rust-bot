# 🔐 Steam 认证解决方案

## 问题分析

你说得完全正确！完整的 Rust+ 配对流程需要：

### 1. Steam 登录获取认证
```
用户 → Steam OpenID 登录
     → 获取 Steam Auth Token
     → 绑定到 FCM Token
```

### 2. 注册到 Companion API
```http
POST https://companion-rust.facepunch.com/api/push/register
Headers:
  - Authorization: Steam Auth Token

Body:
  - FCM Token (gcm_android_id, gcm_security_token)
```

### 3. 才能接收推送
只有完成上述步骤，游戏服务器才知道要推送给谁。

---

## 🎯 解决方案

### 方案 A: 使用已有的认证信息（推荐）⭐

如果你已经有 Rust+ App 的认证信息，可以直接使用：

**需要的信息**:
```bash
gcm_android_id: 5052709013102372144
gcm_security_token: 8153440654009569937
steam_id: 76561198385127796
```

**如何获取**:

#### 方法 1: 从 Rust+ App 提取（Android）
```bash
# 需要 Root 权限
adb shell
su
cat /data/data/com.facepunch.rust.companion/shared_prefs/Expo.plist

# 查找:
# - fcmToken
# - expoPushToken
# - credentials
```

#### 方法 2: 抓包获取
```bash
# 使用 Burp Suite / Charles / mitmproxy
# 抓取 Rust+ App 与 Companion API 的通信
# 找到 /api/push/register 请求中的认证信息
```

#### 方法 3: 使用现有凭证文件
```bash
# rustplus.js 保存的凭证
~/.rustplus/credentials
```

**实现方式**:

```javascript
// backend/src/services/fcm.service.js

async registerWithExistingCredentials(credentials) {
  // 使用已有的 FCM 凭证
  this.credentials = {
    fcm: {
      token: credentials.fcm_token,
      pushSet: credentials.push_set || 'default'
    },
    keys: {
      privateKey: credentials.private_key,
      publicKey: credentials.public_key,
      authSecret: credentials.auth_secret
    }
  };

  // 直接开始监听
  this.startListening();

  // 保存凭证
  configStorage.saveFCMCredentials(this.credentials);
}
```

**使用**:
```javascript
// 手动配置已有凭证
const existingCredentials = {
  fcm_token: 'ExponentPushToken[xxx]',
  gcm_android_id: '5052709013102372144',
  gcm_security_token: '8153440654009569937',
  steam_id: '76561198385127796'
};

fcmService.registerWithExistingCredentials(existingCredentials);
```

---

### 方案 B: 实现 Steam OpenID 登录

**优点**: 用户体验好，自动化
**缺点**: 实现复杂，需要处理 OAuth

#### 实现步骤

##### 1. 添加 Steam 登录路由

```javascript
// backend/src/routes/auth.routes.js

import express from 'express';
import passport from 'passport';
import { Strategy as SteamStrategy } from 'passport-steam';

const router = express.Router();

// Steam OpenID 配置
passport.use(new SteamStrategy({
    returnURL: 'http://localhost:3000/api/auth/steam/callback',
    realm: 'http://localhost:3000/',
    apiKey: process.env.STEAM_API_KEY
  },
  (identifier, profile, done) => {
    // profile.id 就是 Steam ID
    return done(null, profile);
  }
));

// Steam 登录
router.get('/steam', passport.authenticate('steam'));

// Steam 回调
router.get('/steam/callback',
  passport.authenticate('steam', { session: false }),
  async (req, res) => {
    // 获取 Steam ID
    const steamId = req.user.id;

    // 注册 FCM
    const fcmCreds = await RustPlus.FCM.register();

    // 注册到 Companion API
    const response = await fetch('https://companion-rust.facepunch.com/api/push/register', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${req.user.token}` // Steam Auth Token
      },
      body: JSON.stringify({
        AuthToken: req.user.token,
        DeviceId: fcmCreds.fcm.token,
        PushKind: 0 // FCM
      })
    });

    // 保存凭证
    const credentials = {
      ...fcmCreds,
      steamId: steamId
    };

    configStorage.saveFCMCredentials(credentials);

    // 重定向回前端
    res.redirect('http://localhost:5173?auth=success');
  }
);

export default router;
```

##### 2. 前端添加 Steam 登录按钮

```jsx
// frontend/src/components/PairingPanel.jsx

function PairingPanel() {
  const handleSteamLogin = () => {
    // 打开 Steam 登录窗口
    window.location.href = 'http://localhost:3000/api/auth/steam';
  };

  return (
    <div className="card">
      <h2>Steam 登录</h2>
      <button onClick={handleSteamLogin} className="btn btn-primary">
        通过 Steam 登录
      </button>
    </div>
  );
}
```

---

### 方案 C: 手动输入凭证（最简单）⭐⭐

**优点**: 简单直接
**缺点**: 用户需要自己获取凭证

#### 实现

##### 1. 添加凭证输入界面

```jsx
// frontend/src/components/CredentialsInput.jsx

function CredentialsInput({ onSubmit }) {
  const [credentials, setCredentials] = useState({
    gcm_android_id: '',
    gcm_security_token: '',
    steam_id: '',
    fcm_token: ''
  });

  const handleSubmit = (e) => {
    e.preventDefault();
    onSubmit(credentials);
  };

  return (
    <div className="card">
      <h2>输入 FCM 凭证</h2>
      <form onSubmit={handleSubmit}>
        <input
          className="input"
          placeholder="GCM Android ID"
          value={credentials.gcm_android_id}
          onChange={(e) => setCredentials({...credentials, gcm_android_id: e.target.value})}
        />
        <input
          className="input"
          placeholder="GCM Security Token"
          value={credentials.gcm_security_token}
          onChange={(e) => setCredentials({...credentials, gcm_security_token: e.target.value})}
        />
        <input
          className="input"
          placeholder="Steam ID"
          value={credentials.steam_id}
          onChange={(e) => setCredentials({...credentials, steam_id: e.target.value})}
        />
        <button type="submit" className="btn btn-primary">
          保存凭证
        </button>
      </form>

      <div className="mt-4 text-sm text-gray-400">
        <p>如何获取凭证？</p>
        <ol className="list-decimal list-inside">
          <li>在 Android 设备上安装 Rust+ App</li>
          <li>登录并完成配对</li>
          <li>使用 ADB 或抓包工具提取凭证</li>
        </ol>
      </div>
    </div>
  );
}
```

##### 2. 后端接收并使用凭证

```javascript
// backend/src/routes/pairing.routes.js

router.post('/credentials', async (req, res) => {
  try {
    const { gcm_android_id, gcm_security_token, steam_id } = req.body;

    // 构造 FCM 凭证
    const credentials = {
      fcm: {
        token: `ExponentPushToken[${gcm_android_id}]`,
        pushSet: 'default'
      },
      keys: {
        // 使用提供的凭证
        privateKey: '...',
        publicKey: '...',
        authSecret: gcm_security_token
      },
      steamId: steam_id
    };

    // 保存并开始监听
    configStorage.saveFCMCredentials(credentials);
    fcmService.loadCredentials(credentials);
    fcmService.startListening();

    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});
```

---

### 方案 D: 使用 rustplus.js CLI 工具（推荐给开发者）⭐

rustplus.js 提供了 CLI 工具来辅助获取凭证：

```bash
# 安装全局 CLI
npm install -g @liamcottle/rustplus.js

# 启动配对服务器
rustplus-pairing-server

# 在浏览器打开
# http://localhost:8080

# 按照提示操作：
# 1. 在移动设备上打开 Rust+ App
# 2. 扫描二维码
# 3. 完成配对
# 4. 获取凭证信息

# 凭证会保存在
~/.rustplus/credentials
```

**然后在我们的项目中使用**:

```javascript
import fs from 'fs';
import os from 'os';
import path from 'path';

// 读取 rustplus CLI 保存的凭证
const credentialsPath = path.join(os.homedir(), '.rustplus', 'credentials');
const savedCredentials = JSON.parse(fs.readFileSync(credentialsPath, 'utf8'));

// 使用凭证
fcmService.loadCredentials(savedCredentials);
fcmService.startListening();
```

---

## 🎯 推荐方案组合

### 对于开发者（你自己使用）⭐⭐⭐

**方案 D + 方案 A**:

1. 使用 `rustplus-pairing-server` 获取凭证（一次性）
2. 将凭证保存到我们的系统中
3. 之后自动加载使用

```bash
# 1. 获取凭证
rustplus-pairing-server

# 2. 凭证会保存在 ~/.rustplus/credentials

# 3. 我们的系统自动读取
# 修改 backend/src/app.js
const credentialsPath = path.join(os.homedir(), '.rustplus', 'credentials');
if (fs.existsSync(credentialsPath)) {
  const creds = JSON.parse(fs.readFileSync(credentialsPath));
  fcmService.loadCredentials(creds);
  fcmService.startListening();
}
```

### 对于普通用户

**方案 C**: 提供界面让用户输入凭证

用户可以：
1. 在手机安装 Rust+ App
2. 使用抓包工具获取凭证
3. 复制粘贴到我们的界面

---

## 🔧 立即实现（推荐方案）

### 1. 支持从 rustplus CLI 读取凭证

```javascript
// backend/src/services/fcm.service.js

import fs from 'fs';
import os from 'os';
import path from 'path';

async loadFromRustPlusCLI() {
  try {
    const credPath = path.join(os.homedir(), '.rustplus', 'credentials');

    if (!fs.existsSync(credPath)) {
      console.log('⚠️  未找到 rustplus CLI 凭证');
      console.log('💡 请先运行: rustplus-pairing-server');
      return false;
    }

    const creds = JSON.parse(fs.readFileSync(credPath, 'utf8'));

    this.credentials = creds;
    configStorage.saveFCMCredentials(creds);
    this.startListening();

    console.log('✅ 已加载 rustplus CLI 凭证');
    return true;
  } catch (error) {
    console.error('❌ 加载凭证失败:', error);
    return false;
  }
}
```

### 2. 添加手动输入凭证的 API

```javascript
// backend/src/routes/pairing.routes.js

router.post('/credentials/manual', async (req, res) => {
  try {
    const credentials = req.body;

    fcmService.loadCredentials(credentials);
    configStorage.saveFCMCredentials(credentials);
    fcmService.startListening();

    res.json({ success: true, message: '凭证已保存并开始监听' });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});
```

### 3. 修改初始化流程

```javascript
// backend/src/app.js

const initializeFCM = async () => {
  // 1. 尝试加载已保存的凭证
  const savedCreds = configStorage.getFCMCredentials();
  if (savedCreds) {
    console.log('✅ 使用已保存的凭证');
    fcmService.loadCredentials(savedCreds);
    fcmService.startListening();
    return;
  }

  // 2. 尝试从 rustplus CLI 读取
  const fromCLI = await fcmService.loadFromRustPlusCLI();
  if (fromCLI) {
    return;
  }

  // 3. 提示用户需要配置凭证
  console.log('⚠️  需要配置 FCM 凭证');
  console.log('💡 方式 1: 运行 rustplus-pairing-server 获取');
  console.log('💡 方式 2: 通过 Web 界面手动输入');
};
```

---

## 📝 使用指南

### 方法 1: 使用 rustplus CLI（推荐）⭐

```bash
# 1. 安装 CLI
npm install -g @liamcottle/rustplus.js

# 2. 启动配对服务器
rustplus-pairing-server

# 3. 在移动设备上:
#    - 打开 Rust+ App
#    - 扫描屏幕上的二维码
#    - 完成配对

# 4. 凭证自动保存到 ~/.rustplus/credentials

# 5. 启动我们的项目
cd rust-bot-new
./start.sh

# 6. 系统会自动读取凭证并开始监听
```

### 方法 2: 手动输入凭证

```bash
# 1. 启动项目
./start.sh

# 2. 访问 Web 界面
http://localhost:5173

# 3. 点击"配置 FCM 凭证"

# 4. 输入从 Rust+ App 提取的凭证:
#    - GCM Android ID
#    - GCM Security Token
#    - Steam ID

# 5. 保存并开始监听
```

---

## ✅ 总结

**你的理解是正确的！**

完整的流程确实需要：

1. ✅ Steam 登录
2. ✅ 获取 FCM 凭证
3. ✅ 注册到 Companion API（绑定 Steam 和 FCM）
4. ✅ 才能接收推送

**推荐方案**:

- 🥇 使用 `rustplus-pairing-server` CLI 工具（一次性获取凭证）
- 🥈 提供手动输入凭证的界面
- 🥉 实现 Steam OpenID 登录（最完整但最复杂）

**我会立即实现方案 1 + 2 的组合！**

想要我现在就实现这些更新吗？
