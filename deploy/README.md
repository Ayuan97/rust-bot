# 部署脚本说明

这些脚本放在仓库里，目的是让“部署逻辑”和“代码版本”保持一致，避免服务器上出现多份脚本不好维护。

## 脚本用途

- `deploy/deploy-main.sh`  
  主节点**首次一键部署**：装依赖 / 拉代码 / 自动生成 .env(含随机密钥) / 建库 / 构建前端 / pm2 起 rust-main / 健康检查。子命令：`token <nodeId>` 签发子节点令牌、`allow <ip>` 放行内部接口来源 IP。
- `deploy/deploy-connector.sh`  
  子节点**首次一键部署**（把此脚本传到子节点机器执行）：交互填 主节点地址 + NODE_TOKEN + 节点画像，自动装依赖 / 拉代码 / 写 .env / pm2 起 rust-connector。**子节点不连数据库。**

- `deploy/rustbot-update.sh`  
  主节点一键更新脚本：拉代码、安装依赖、构建前端、重启主节点与本机子节点、健康检查，并可自动扇出更新远程子节点。
- `deploy/rustbot-update-connectors.sh`  
  远程子节点批量更新脚本：支持免密模式与密码模式，自动把更新助手脚本同步到子节点并执行。
- `deploy/rustbot-update-connector.sh`  
  子节点本地更新脚本：只更新并重启 `rust-connector-*`，不重启 `rust-main`。
- `deploy/rustbot-restart.sh`  
  统一重启脚本：重启 `rust-main` + 本机所有 `rust-connector-*`。
- `deploy/rustbot-clean-logs.sh`  
  日志清理脚本：清空 PM2 缓冲日志并删除 PM2/Nginx 历史日志文件。

## 子节点清单文件（仅放服务器，不进仓库）

- `/etc/rustbot/connector-nodes.list`（免密模式）  
  每行一个 SSH 目标，例如 `root@<子节点公网IP>`。
- `/etc/rustbot/connector-nodes.auth`（密码模式）  
  每行格式：`host|user|password`。

示例文件：

- `deploy/connector-nodes.list.example`
- `deploy/connector-nodes.auth.example`

## 常用命令

```bash
# 在主节点执行，更新主节点并按配置自动更新子节点
cd /www/wwwroot/rust-bot
bash deploy/rustbot-update.sh main

# 仅重启主节点和本机子节点
bash deploy/rustbot-restart.sh

# 仅清理日志
bash deploy/rustbot-clean-logs.sh
```

---

> 📖 服务器信息、关键目录、环境变量、部署流程与血泪教训，统一见根目录 **`DEPLOYMENT.md`**（部署权威文档）。本文件只讲各脚本职责。
