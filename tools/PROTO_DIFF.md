# Rust+ 协议差异报告

- 本地基线: `backend\lib\rustplus\rustplus.proto` (55 message, 3 enum)
- 服务器端实测: 360 message, 2 enum (Rust.Data.dll, 仅 ProtoBuf 命名空间)

## 新增 message（游戏端有 / 本地基线无）
### `Approval`
- `level`: string = 2
- `hostname`: string = 3
- `modded`: bool = 4
- `official`: bool = 5
- `steamid`: uint64 = 6
- `ipaddress`: uint32 = 7
- `port`: int32 = 8
- `levelSeed`: uint32 = 9
- `levelSize`: uint32 = 10
- `checksum`: string = 11
- `encryption`: uint32 = 12
- `levelUrl`: string = 13
- `levelTransfer`: bool = 14
- `version`: string = 15
- `levelConfig`: string = 16
- `nexus`: bool = 17
- `nexusEndpoint`: string = 18
- `nexusId`: int32 = 19
- `dnsEndpoint`: string = 20

### `ClanLeaderboard`

### `ClanManager`
- `backendType`: string = 1

### `ClanScoreEvents`
- `clanId`: int64 = 1


## 现有 message 中新增字段
### `ClanInfo`
- `score`: int64 = 14

### `AppCameraRays`
- `cameraPosition`: Vector3 = 7
- `cameraRotation`: Vector3 = 8


## 枚举新增值
### `enum AppMarkerType`
- `TravellingVendor` = 9


## 字段类型/tag 变更（可能要小心）
### `ClanInfo`
- `color`: type sint32 -> int32

### `AppCameraRays`
- `rayData`: type bytes -> ArraySegment`1


---
（本报告只关心 `App*` / `Clan*` 前缀，即 Rust+ 客户端面向的协议；其他游戏内部 protobuf message 不在 diff 范围。）