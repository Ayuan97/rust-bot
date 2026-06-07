# Low-Cost Distributed Deployment

Goal: keep capacity elastic while preventing cost runaway.

## 1. Requirements

- Main node can access MySQL
- Main holds `NODE_TOKEN_SECRET`; each connector carries its own `NODE_TOKEN` issued by `backend/scripts/issue-node-token.js <nodeId>`
- Connector nodes should have public IPs (different IPs help same-server hotspots)

## 2. Key `.env` settings

```env
RUST_CONN_MODE=distributed
NODE_TOKEN_SECRET=replace_with_random_value
INTERNAL_ALLOWED_IPS=127.0.0.1,::1
USER_MONTHLY_PRICE=20
INFRA_COST_RATIO_CAP=0.35

AUTOSCALER_ENABLED=true
AUTOSCALER_NODE_MONTHLY_COST=120
```

Connector overrides:

```env
CONTROL_API_URL=http://<api-core>/api/internal
# issue on main: node backend/scripts/issue-node-token.js node-1
NODE_TOKEN=<token-issued-for-node-1>
NODE_PUBLIC_IP=<public-ip>
NODE_REGION=aliyun-hz
NODE_CAPACITY=120
NODE_MAX_PER_SERVER=4
```

## 3. Boot order

1. Initialize DB with `backend/sql/init.sql`
2. Start main node: `./start-main.ps1`
3. Issue a node token on main: `node backend/scripts/issue-node-token.js <nodeId>`, set it as `NODE_TOKEN` on that connector
4. Start one or more connectors: `./start-connector.ps1`

## 4. Scale rules (default)

Scale-up triggers include:
- high hottest-server utilization for a sustained period
- high global pool utilization for a sustained period
- sustained pending queue

Scale-down requires idle nodes above minimum replicas.

## 5. Budget gate

Before scaling up, system checks:

- `current_month_cost + estimated_new_node_cost <= remaining_budget`

If not satisfied, no scale-up; requests stay queued.
