# Troubleshooting

## 1) Missing environment variables at startup

Symptom:
- startup errors for `DB_*`, `JWT_SECRET`, or `NODE_TOKEN_SECRET`

Fix:
1. Ensure root `.env` exists
2. Compare with `.env.example`
3. Restart via start script

## 2) Table or column not found

Symptom:
- `ER_NO_SUCH_TABLE`
- `ER_BAD_FIELD_ERROR`

Fix:

```bash
mysql -u root -p < backend/sql/init.sql
```

## 3) Connector registration or heartbeat fails

Check:
- `CONTROL_API_URL` reachable from connector
- connector `NODE_TOKEN` is signed by main's `NODE_TOKEN_SECRET` (issue via `backend/scripts/issue-node-token.js <nodeId>`)
- connector source IP is allowed by `INTERNAL_ALLOWED_IPS` on main
- main node is running and serving `/api/internal`

## 4) Session keeps queued

Check:
- online nodes and heartbeat freshness in `gateway_nodes`
- `NODE_CAPACITY` and `NODE_MAX_PER_SERVER`
- autoscaler budget block events

## 5) FCM looks unstable after some time

Check:
- connector logs for reconnect loops
- main node receives node events
- queue pressure is not being misread as FCM failure
