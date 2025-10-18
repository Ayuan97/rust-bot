# 🔐 Steam 认证流程说明

## ✅ 正确的认证流程

用户通过官方 Companion API 的 Steam 登录页面获取凭证。

### 步骤详解

#### 1. 启动项目
```bash
./start.sh
```

#### 2. 访问 Web 界面
打开浏览器访问：`http://localhost:5173`

#### 3. 点击"配对服务器"
在顶部导航栏点击"配对服务器"按钮

#### 4. 输入凭证
如果没有凭证，会看到提示：
```
⚠️ 未找到 FCM 凭证。请先输入凭证才能使用配对功能。
```

点击"输入 FCM 凭证"按钮

#### 5. Steam 登录
1. 点击"Steam 登录获取凭证"按钮
2. 会在新窗口打开：`https://companion-rust.facepunch.com/login`
3. 使用你的 Steam 账号登录

#### 6. 获取凭证信息
登录成功后，页面会显示类似这样的凭证命令：

```
/credentials add gcm_android_id:5346984656978408915 gcm_security_token:4579341590924378429 steam_id:76561198385127796 issued_date:1760759239 expire_date:1761968839
```

#### 7. 填写表单
将上面的参数分别填入表单：

| 字段 | 示例值 | 必填 |
|------|--------|------|
| GCM Android ID | 5346984656978408915 | ✅ |
| GCM Security Token | 4579341590924378429 | ✅ |
| Steam ID | 76561198385127796 | ✅ |
| Issued Date | 1760759239 | ⚪ |
| Expire Date | 1761968839 | ⚪ |

#### 8. 保存并开始监听
点击"保存并开始监听"按钮

系统会：
- ✅ 保存凭证到数据库
- ✅ 自动开始 FCM 监听
- ✅ 等待游戏内配对

#### 9. 游戏内配对
1. 进入 Rust 游戏中的任意服务器
2. 按 `ESC` 打开菜单
3. 点击右下角的 **Rust+** 图标
4. 点击 **"Pair with Server"**

#### 10. 自动完成
- ✅ Dashboard 会自动接收配对推送
- ✅ 服务器信息自动保存
- ✅ 自动连接到服务器
- ✅ 可以开始使用所有功能

---

## 🔧 技术细节

### 凭证格式

从 Companion API 获取的凭证格式：

```javascript
{
  gcm_android_id: "5346984656978408915",
  gcm_security_token: "4579341590924378429",
  steam_id: "76561198385127796",
  issued_date: "1760759239",    // 可选
  expire_date: "1761968839"     // 可选
}
```

### 后端处理

后端会将此格式转换为 `rustplus.js` 库支持的 GCM 格式：

```javascript
{
  gcm: {
    androidId: "5346984656978408915",
    securityToken: "4579341590924378429"
  },
  steam: {
    steamId: "76561198385127796"
  },
  issuedDate: "1760759239",
  expireDate: "1761968839"
}
```

### 监听流程

```
用户登录 Steam
    ↓
获取 GCM 凭证
    ↓
前端提交凭证
    ↓
后端保存并转换格式
    ↓
RustPlus.FCM.listen(credentials)
    ↓
等待推送
    ↓
游戏内配对
    ↓
接收 FCM 推送 (Channel 1001)
    ↓
自动保存服务器信息
    ↓
自动连接服务器
```

---

## ⚠️ 重要说明

### 1. 凭证有效期

- **Issued Date**: 凭证签发时间
- **Expire Date**: 凭证过期时间
- 通常有效期为 **约 14 天**

过期后需要重新登录 Steam 获取新凭证。

### 2. Steam 账号绑定

- 凭证绑定到你的 Steam ID
- 只能接收该 Steam 账号的推送
- 不同 Steam 账号需要不同的凭证

### 3. 多设备使用

- 理论上可以在多个设备上使用相同凭证
- 但所有设备会收到相同的推送
- 建议每个设备使用独立的凭证

### 4. 官方 API

使用的是 Facepunch 官方 Companion API：
- 登录页面: `https://companion-rust.facepunch.com/login`
- 完全合法、安全
- 与 Rust+ App 使用相同的认证系统

---

## 🚨 常见问题

### Q: 为什么不能直接调用 `/api/pairing/start`？

A: 直接调用会生成新的 FCM Token，但：
- ❌ 没有关联到你的 Steam 账号
- ❌ Companion API 不知道推送给谁
- ❌ 无法接收配对推送
- ❌ 配对功能无法工作

必须通过 Steam 登录获取已绑定的凭证！

### Q: 凭证安全吗？

A:
- ✅ 凭证保存在本地数据库
- ✅ 只用于接收推送通知
- ✅ 不包含 Steam 密码
- ⚠️ 但可以接收你的游戏推送，请妥善保管

### Q: 凭证过期了怎么办？

A:
1. 点击"重置 FCM 凭证"
2. 重新进行 Steam 登录
3. 获取新的凭证
4. 填写并保存

### Q: 可以跳过 Steam 登录吗？

A: 不可以！这是官方认证流程的必要步骤：

```
Steam 登录 → 获取 Auth Token → 注册到 Companion API → 才能接收推送
```

没有这个步骤，系统无法知道要推送给谁。

---

## 📚 相关文档

- [README.md](README.md) - 项目主文档
- [IMPORTANT_CORRECTION.md](IMPORTANT_CORRECTION.md) - 之前错误的修正说明
- [Rust Companion API](https://companion-rust.facepunch.com) - 官方 API

---

**最后更新**: 2025-10-18

**状态**: ✅ 完整可用的认证流程
