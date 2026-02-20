# Deploy Scripts

These scripts are kept in the repository so deployment behavior stays versioned with code.

## Scripts

- `deploy/rustbot-update.sh`  
  Update the main node (backend/frontend), restart `rust-main` and local connectors, then fan out connector updates.
- `deploy/rustbot-update-connectors.sh`  
  Roll out connector updates to remote connector nodes.
- `deploy/rustbot-update-connector.sh`  
  Connector-only update script intended to run on connector nodes.
- `deploy/rustbot-restart.sh`  
  Restart `rust-main` and local `rust-connector-*` processes.
- `deploy/rustbot-clean-logs.sh`  
  Flush PM2 logs and clean log files.

## Node Inventory Files (server local)

These files should stay on the server and are not committed:

- `/etc/rustbot/connector-nodes.list` (SSH key mode)  
  One SSH target per line.
- `/etc/rustbot/connector-nodes.auth` (password mode)  
  One line per node: `host|user|password`.

Examples are provided in:

- `deploy/connector-nodes.list.example`
- `deploy/connector-nodes.auth.example`

## Typical Usage

```bash
cd /www/wwwroot/rust-bot
bash deploy/rustbot-update.sh main
```
