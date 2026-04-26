/**
 * 游戏事件相关常量
 */

// Rust+ API 地图标记类型
export const AppMarkerType = {
  Undefined: 0,
  Player: 1,
  Explosion: 2,
  VendingMachine: 3,
  CH47: 4,              // Chinook 重型直升机
  CargoShip: 5,         // 货船
  Crate: 6,             // 上锁箱子
  GenericRadius: 7,
  PatrolHelicopter: 8,  // 武装直升机
  TravellingVendor: 9   // 流浪商人 (2024-07 Road Renegades 加入)
};

// 事件时间常量（毫秒）
export const EventTiming = {
  // 货船
  // 注意: CARGO_SHIP_EGRESS_TIME 是事件持续时间（船在地图上的时间），不是 egress 过程时间
  // 实际 egress（离开过程）大约 10 分钟，由服务器参数 cargoship.egress_duration_minutes 控制
  CARGO_SHIP_EGRESS_TIME: 50 * 60 * 1000,           // 50分钟 (事件持续时间)
  CARGO_SHIP_EGRESS_WARNING_TIME: 5 * 60 * 1000,   // Egress前5分钟警告
  HARBOR_CARGO_SHIP_DOCK_DISTANCE: 100,             // 港口停靠距离 100米

  // 油井
  OIL_RIG_LOCKED_CRATE_UNLOCK_TIME: 15 * 60 * 1000, // 15分钟
  OIL_RIG_CRATE_WARNING_TIME: 3 * 60 * 1000,        // 箱子解锁前3分钟警告
  OIL_RIG_CHINOOK_MAX_SPAWN_DISTANCE: 550,          // CH47最大刷新距离 550米
  OIL_RIG_RADIATION_START_TIME: 45 * 60 * 1000,     // 45分钟 - 辐射开始上升
  OIL_RIG_RADIATION_WARNING_TIME: 3 * 60 * 1000,    // 3分钟 - 辐射警告提前量
  OIL_RIG_RESET_TIME: 50 * 60 * 1000,               // 50分钟 - 辐射达到最大/重置
  OIL_RIG_RESET_WARNING_TIME: 3 * 60 * 1000,        // 3分钟 - 重置警告提前量

  // 直升机
  PATROL_HELICOPTER_DOWNED_RADIUS: 400,             // 击落半径 400米
  // 直升机残骸时间:
  // - 箱子火焰消散约 3 分钟（箱子本身没有锁定时间，可立即打开，但火焰阻止靠近）
  // - 机身冷却可采集约 8 分钟（480秒）
  HELI_CRATE_FIRE_DURATION: 3 * 60 * 1000,          // 3分钟 (箱子火焰消散时间)
  HELI_DEBRIS_COOLING_TIME: 8 * 60 * 1000,          // 8分钟 (机身冷却可采集时间)
  MAP_EDGE_THRESHOLD: 50,                           // 地图边缘阈值 50米

  // 坦克 (Bradley APC)
  BRADLEY_CRATE_FIRE_DURATION: 5 * 60 * 1000,      // 5分钟 - 箱子火焰消散时间
  BRADLEY_DEBRIS_COOLING_TIME: 8 * 60 * 1000,      // 8分钟 - 残骸冷却可采集时间
  BRADLEY_RESPAWN_TIME: 60 * 60 * 1000,            // 60分钟 - 重生时间
  BRADLEY_RESPAWN_WARNING_TIME: 5 * 60 * 1000,     // 5分钟 - 重生前提醒
  BRADLEY_DETECTION_RADIUS: 150,                    // 150米 - 发射场爆炸检测半径

  // 爆炸
  EXPLOSION_RAID_TIME_WINDOW: 5 * 60 * 1000,       // 袭击检测时间窗口 5分钟
  EXPLOSION_RAID_MIN_COUNT: 3,                      // 最少爆炸次数判定为袭击

  // 流浪商人 (Travelling Vendor) - 来自反编译 convar travellingvendor.alive_time_seconds=1800
  TRAVELLING_VENDOR_LIFETIME: 30 * 60 * 1000,       // 30分钟存活时间
  TRAVELLING_VENDOR_LEAVE_WARNING_TIME: 5 * 60 * 1000, // 离场前5分钟警告

  // 轮询
  MAP_MARKERS_POLL_INTERVAL: 5000,                  // 5秒轮询一次

  // 玩家状态（参考 rustplusplus）
  AFK_TIME_SECONDS: 5 * 60                          // 5分钟判定为 AFK
};

// 事件类型定义
export const EventType = {
  // 货船
  CARGO_SPAWN: 'cargo:spawn',
  CARGO_DOCK: 'cargo:dock',
  CARGO_EGRESS_WARNING: 'cargo:egress_warning',
  CARGO_EGRESS: 'cargo:egress',
  CARGO_LEAVE: 'cargo:leave',

  // 小油井
  SMALL_OIL_RIG_TRIGGERED: 'small_oil_rig:triggered',
  SMALL_OIL_RIG_CRATE_WARNING: 'small_oil_rig:crate_warning',
  SMALL_OIL_RIG_CRATE_UNLOCKED: 'small_oil_rig:crate_unlocked',

  // 大油井
  LARGE_OIL_RIG_TRIGGERED: 'large_oil_rig:triggered',
  LARGE_OIL_RIG_CRATE_WARNING: 'large_oil_rig:crate_warning',
  LARGE_OIL_RIG_CRATE_UNLOCKED: 'large_oil_rig:crate_unlocked',

  // 武装直升机
  PATROL_HELI_SPAWN: 'patrol_heli:spawn',
  PATROL_HELI_DOWNED: 'patrol_heli:downed',
  PATROL_HELI_LEAVE: 'patrol_heli:leave',

  // CH47
  CH47_SPAWN: 'ch47:spawn',
  CH47_LEAVE: 'ch47:leave',

  // 坦克 (Bradley APC)
  BRADLEY_DESTROYED: 'bradley:destroyed',
  BRADLEY_CRATE_AVAILABLE: 'bradley:crate_available',
  BRADLEY_RESPAWN_WARNING: 'bradley:respawn_warning',

  // 上锁箱子
  LOCKED_CRATE_SPAWN: 'locked_crate:spawn',
  LOCKED_CRATE_DESPAWN: 'locked_crate:despawn',

  // 售货机
  VENDING_MACHINE_NEW: 'vending_machine:new',
  VENDING_MACHINE_REMOVED: 'vending_machine:removed',
  VENDING_MACHINE_STOCK_CHANGE: 'vending_machine:stock_change',
  VENDING_MACHINE_ORDER_CHANGE: 'vending_machine:order_change',

  // 流浪商人 (Travelling Vendor)
  TRAVELLING_VENDOR_SPAWN: 'travelling_vendor:spawn',
  TRAVELLING_VENDOR_LEAVE_WARNING: 'travelling_vendor:leave_warning',
  TRAVELLING_VENDOR_LEAVE: 'travelling_vendor:leave',

  // 爆炸
  EXPLOSION_DETECTED: 'explosion:detected',
  RAID_DETECTED: 'raid:detected',

  // 玩家状态（通过轮询检测）
  PLAYER_DIED: 'player:died',
  PLAYER_SPAWNED: 'player:spawned',
  PLAYER_ONLINE: 'player:online',
  PLAYER_OFFLINE: 'player:offline',
  PLAYER_AFK: 'player:afk',
  PLAYER_AFK_RETURNED: 'player:afk_returned',
  PLAYER_JOINED_TEAM: 'player:joined_team',
  PLAYER_LEFT_TEAM: 'player:left_team'
};

// 古迹标记 (monument tokens)
export const MonumentTokens = {
  SMALL_OIL_RIG: 'oil_rig_small',
  LARGE_OIL_RIG: 'large_oil_rig',
  HARBOR_1: 'harbor_1',
  HARBOR_2: 'harbor_2',
  LAUNCH_SITE: 'launch_site'
};

export default {
  AppMarkerType,
  EventTiming,
  EventType,
  MonumentTokens
};
