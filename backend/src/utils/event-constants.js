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
  PatrolHelicopter: 8   // 武装直升机
};

// 事件时间常量（毫秒）
export const EventTiming = {
  // 货船
  CARGO_SHIP_EGRESS_TIME: 50 * 60 * 1000,           // 50分钟
  CARGO_SHIP_EGRESS_WARNING_TIME: 5 * 60 * 1000,   // Egress前5分钟警告
  HARBOR_CARGO_SHIP_DOCK_DISTANCE: 100,             // 港口停靠距离 100米

  // 油井
  OIL_RIG_LOCKED_CRATE_UNLOCK_TIME: 15 * 60 * 1000, // 15分钟
  OIL_RIG_CRATE_WARNING_TIME: 3 * 60 * 1000,        // 箱子解锁前3分钟警告
  OIL_RIG_CHINOOK_MAX_SPAWN_DISTANCE: 550,          // CH47最大刷新距离 550米

  // 直升机
  PATROL_HELICOPTER_DOWNED_RADIUS: 400,             // 击落半径 400米
  MAP_EDGE_THRESHOLD: 50,                           // 地图边缘阈值 50米

  // 爆炸
  EXPLOSION_RAID_TIME_WINDOW: 5 * 60 * 1000,       // 袭击检测时间窗口 5分钟
  EXPLOSION_RAID_MIN_COUNT: 3,                      // 最少爆炸次数判定为袭击

  // 轮询
  MAP_MARKERS_POLL_INTERVAL: 5000                   // 5秒轮询一次
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

  // 上锁箱子
  LOCKED_CRATE_SPAWN: 'locked_crate:spawn',
  LOCKED_CRATE_DESPAWN: 'locked_crate:despawn',

  // 售货机
  VENDING_MACHINE_NEW: 'vending_machine:new',
  VENDING_MACHINE_STOCK_CHANGE: 'vending_machine:stock_change',
  VENDING_MACHINE_ORDER_CHANGE: 'vending_machine:order_change',

  // 爆炸
  EXPLOSION_DETECTED: 'explosion:detected',
  RAID_DETECTED: 'raid:detected'
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
