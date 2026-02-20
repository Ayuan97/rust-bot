# 部署脚本说明

这些脚本放在仓库里，目的是让“部署逻辑”和“代码版本”保持一致，避免服务器上出现多份脚本不好维护。

## 脚本用途

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
  每行一个 SSH 目标，例如 `root@38.76.201.26`。
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
