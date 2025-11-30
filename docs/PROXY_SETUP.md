# 代理配置指南

本项目支持通过订阅链接使用代理，无需在系统上安装 Clash/V2Ray，所有代理功能都集成在项目内部。

## 快速开始

### 1. 获取订阅链接

从您的机场/VPN 服务商获取订阅链接，通常格式如下：
```
https://example.com/api/v1/client/subscribe?token=xxxxxx
```

### 2. 配置环境变量

编辑 `backend/.env` 文件，添加订阅链接：

```env
# 必填：订阅链接
PROXY_SUBSCRIPTION_URL=https://example.com/api/v1/client/subscribe?token=xxxxx

# 可选：指定节点名称（如不指定则自动选择）
PROXY_NODE_NAME=香港节点01

# 可选：本地代理端口（默认 10808）
PROXY_PORT=10808
```

### 3. 启动项目

```bash
cd backend
npm start
```

项目启动时将自动：
1. 检测系统（Windows/Linux/macOS）
2. 下载对应的 xray-core 二进制文件（约 10MB）
3. 解析订阅链接，获取节点列表
4. 自动选择最佳节点
5. 启动本地代理服务（127.0.0.1:10808）
6. 配置所有外网请求使用代理

## 支持的订阅格式

### Clash 订阅（YAML 格式）

```yaml
proxies:
  - name: "香港节点01"
    type: vmess
    server: hk.example.com
    port: 443
    uuid: xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx
    alterId: 0
    cipher: auto
```

### V2Ray 订阅（Base64 编码）

包含多行 `vmess://`, `vless://`, `trojan://`, `ss://` 等协议的 Base64 编码文本。

## 支持的代理协议

- ✅ **VMess** - V2Ray 标准协议
- ✅ **VLESS** - V2Ray 轻量协议
- ✅ **Trojan** - Trojan 协议
- ✅ **Shadowsocks** - SS 协议
- ✅ **ShadowsocksR** - SSR 协议

## 启动日志示例

成功启动时，您会看到类似日志：

```
╔═══════════════════════════════════════╗
║   🎮 Rust+ Web Dashboard Backend    ║
║                                       ║
║   Server: http://localhost:3000     ║
║   Status: ✅ Running                  ║
╚═══════════════════════════════════════╝

🌐 初始化代理服务...

📦 检查 Xray-core...
✅ Xray-core 已存在，跳过下载

🔗 正在获取订阅链接...
   URL: https://example.com/api/v1/client/subscribe...
📋 检测到 Clash YAML 格式
✅ 成功解析 25 个节点
✅ 自动选择节点: 香港节点01 (vmess)

⚙️  生成 Xray 配置...
   配置文件: D:\hello\code\rust-bot\backend\data\xray-config.json

🚀 启动 Xray 代理...
✅ Xray 启动成功

✅ 代理服务初始化成功！
   节点: 香港节点01
   类型: vmess
   本地端口: 10808

✅ 代理服务已启动
```

## 常见问题

### Q1: 首次启动下载 xray-core 很慢？

**原因**: 从 GitHub 下载二进制文件可能较慢。

**解决方案**:
- 等待下载完成（仅首次需要，约 10MB）
- 下载完成后会自动缓存，后续启动不再下载

### Q2: 如何切换节点？

**方法 1**: 修改 `.env` 中的 `PROXY_NODE_NAME`，重启项目
```env
PROXY_NODE_NAME=日本节点02
```

**方法 2**: 未来版本将支持通过 API 动态切换

### Q3: 如何查看当前使用的节点？

启动日志中会显示：
```
✅ 代理服务初始化成功！
   节点: 香港节点01
   类型: vmess
   本地端口: 10808
```

### Q4: 订阅链接无效怎么办？

**检查步骤**:
1. 确认订阅链接是否正确（复制时可能漏字符）
2. 确认订阅未过期
3. 尝试在浏览器访问订阅链接，看是否返回内容
4. 查看后端日志，确认错误信息

### Q5: 不使用代理可以吗？

**可以！** 代理功能是可选的：
- 如果不配置 `PROXY_SUBSCRIPTION_URL`，项目将正常运行（无代理模式）
- 仅在中国大陆等网络受限地区需要使用代理

### Q6: xray-core 文件存放在哪里？

```
backend/
├── bin/
│   ├── xray.exe (Windows)
│   ├── xray (Linux)
│   └── xray (macOS)
└── data/
    └── xray-config.json (配置文件)
```

### Q7: 如何验证代理是否生效？

**方法 1**: 查看启动日志
- 如果看到 "✅ FCM 服务已配置代理"，说明已生效

**方法 2**: 查看 FCM 请求日志
- 在请求 Expo API 和 Rust+ API 时会显示 "使用代理请求"

## 跨平台支持

| 操作系统 | 架构 | 自动支持 | 说明 |
|---------|------|---------|------|
| Windows | x64 | ✅ | 自动下载 xray.exe |
| Windows | ARM64 | ✅ | 自动下载对应版本 |
| Linux | x64 | ✅ | 自动设置可执行权限 |
| Linux | ARM64 | ✅ | 支持树莓派等设备 |
| macOS | x64/ARM64 | ✅ | 支持 Intel 和 M1/M2 芯片 |

## 技术架构

```
项目启动
   ↓
读取 PROXY_SUBSCRIPTION_URL
   ↓
下载 xray-core (首次)
   ↓
解析订阅链接 → 获取节点列表
   ↓
选择最佳节点
   ↓
生成 xray 配置文件
   ↓
启动 xray 进程 (127.0.0.1:10808)
   ↓
创建 SocksProxyAgent
   ↓
传递给 FCMService
   ↓
所有外网请求自动走代理
   - axios (Expo API, Rust+ API)
   - AndroidFCM.register()
   - PushReceiverClient
```

## 安全说明

1. **订阅链接保密**: 订阅链接包含您的账号信息，不要分享给他人
2. **本地代理**: xray 仅在本地运行（127.0.0.1），不对外开放
3. **数据安全**: 项目不会上传或记录您的订阅信息

## 故障排查

### 代理启动失败

**检查日志**:
```
❌ 代理服务初始化失败: xxxxx
```

**常见原因**:
1. 订阅链接格式错误 → 检查链接是否完整
2. 订阅已过期 → 联系服务商续费
3. 端口被占用 → 修改 `PROXY_PORT` 为其他端口
4. xray-core 下载失败 → 检查网络连接

### FCM 仍然无法访问

**可能原因**:
1. xray 未成功启动 → 查看启动日志
2. 代理节点失效 → 尝试切换节点
3. 订阅节点全部失效 → 更新订阅或联系服务商

## 卸载代理功能

如不再需要代理：

1. 删除 `.env` 中的代理配置
2. 删除 `backend/bin/` 目录（可选，清理缓存）
3. 删除 `backend/data/xray-config.json`（可选）
4. 重启项目

## 性能影响

- **CPU 使用**: xray-core 占用极少（< 1%）
- **内存占用**: 约 20-50MB
- **网络延迟**: 增加 50-200ms（取决于节点质量）
- **启动时间**: 首次启动增加 5-10 秒（下载 xray），后续无影响

## 高级配置

### 手动选择节点

如果自动选择的节点不理想，可以手动指定：

```env
PROXY_NODE_NAME=日本节点
```

节点名称支持**模糊匹配**，例如：
- `PROXY_NODE_NAME=香港` → 匹配任何包含"香港"的节点
- `PROXY_NODE_NAME=01` → 匹配任何包含"01"的节点

### 自定义代理端口

如果 10808 端口被占用：

```env
PROXY_PORT=10809
```

## 更新日志

### v1.0.0 (2025-01-30)
- ✅ 支持 Clash YAML 订阅
- ✅ 支持 V2Ray Base64 订阅
- ✅ 自动下载 xray-core
- ✅ 支持 VMess/VLESS/Trojan/SS 协议
- ✅ 跨平台支持（Windows/Linux/macOS）

## 参与贡献

如遇到问题或有改进建议，欢迎提交 Issue 或 Pull Request。
