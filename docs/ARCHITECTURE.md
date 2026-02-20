# Architecture (Current)

## 1. Topology

The system uses a distributed pattern:

- Main node (`api-core`):
  - authentication, subscription checks, and tenant isolation
  - REST API and WebSocket
  - session scheduling, queueing, and command dispatch
  - autoscaler and budget guard
- Connector node (`connector-node`):
  - real Rust server connections
  - command execution (chat, devices, map, time, etc.)
  - event callback to main node
- MySQL:
  - business data plus distributed session state

## 2. Core services

- `GlobalServiceManager`
- `UserServiceManager`
- `DistributedSessionService`
- `AutoScalerService`
- `CostGuardService`

## 3. Connection flow

1. Client emits `server:connect`
2. Main node validates ownership (`userId + serverId`)
3. Scheduler picks a node:
   - available capacity -> assign session
   - no capacity -> queue request
4. Connector pulls assignment and opens Rust connection
5. Connector updates state (`ASSIGNED/CONNECTING/CONNECTED/FAILED/CLOSED`)
6. Main node pushes updates to `user:{userId}` room

## 4. Command and event flow

- Commands are inserted into `session_commands`
- Connector claims and executes commands, then reports result
- Connector posts node events via internal API
- Main node forwards only allowlisted events to the owner user

## 5. Security and tenancy rules

- User data queries must always include tenant checks
- WebSocket handshake must validate JWT
- Internal routes require `INTERNAL_API_TOKEN`
- No cross-user broadcast for private data

## 6. Deployment notes

- Small setup: 1 main node + 1 local connector process
- Hot single-server traffic: add connector nodes with different public IPs
- Autoscaling assumes 1-3 minutes cold-start tolerance
