# Database

## 1. Single schema source

Use only this file as schema source of truth:

- `backend/sql/init.sql`

No migration directory is maintained anymore.

## 2. Initialization

```bash
mysql -u root -p < backend/sql/init.sql
```

## 3. Important table groups

User and billing:
- `users`
- `subscriptions`
- `orders`

Rust domain:
- `servers`
- `devices`
- `event_logs`
- `tracked_players`
- `tracking_events`

Distributed connection:
- `gateway_nodes`
- `connection_sessions`
- `connection_queue`
- `session_commands`
- `cost_ledger`

## 4. Multi-tenant constraints

- User-scoped data must be filtered by `userId`
- Ownership must be checked for server/device/tracking resources
- Cross-user reads and writes are forbidden

## 5. Schema change rule

When changing tables:

1. Edit `backend/sql/init.sql` directly
2. Keep indexes and foreign keys complete
3. Re-check tenant fields (especially `userId`)
