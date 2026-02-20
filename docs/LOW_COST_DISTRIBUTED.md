# Low-Cost Distributed Deployment

Goal: keep capacity elastic while preventing cost runaway.

## 1. Requirements

- Main node can access MySQL
- Main and connector nodes share the same `INTERNAL_API_TOKEN`
- Connector nodes should have public IPs (different IPs help same-server hotspots)

## 2. Key `.env` settings

```env
RUST_CONN_MODE=distributed
INTERNAL_API_TOKEN=replace_with_random_value
USER_MONTHLY_PRICE=20
INFRA_COST_RATIO_CAP=0.35

AUTOSCALER_ENABLED=true
AUTOSCALER_NODE_MONTHLY_COST=120
```

Connector overrides:

```env
CONTROL_API_URL=http://<api-core>/api/internal
NODE_ID=node-1
NODE_PUBLIC_IP=<public-ip>
NODE_REGION=aliyun-hz
NODE_CAPACITY=120
NODE_MAX_PER_SERVER=4
```

## 3. Boot order

1. Initialize DB with `backend/sql/init.sql`
2. Start main node: `./start-main.ps1`
3. Start one or more connectors: `./start-connector.ps1`

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
