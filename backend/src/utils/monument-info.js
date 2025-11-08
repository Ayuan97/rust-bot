/**
 * Rust 游戏中的古迹/资源点信息
 * 参考: https://github.com/alexemanuelol/rustplusplus
 *
 * 每个古迹包含:
 * - name: 中文名称
 * - radius: 判定半径（米）
 */

export const MONUMENT_INFO = {
  // 大型古迹
  'launchsite': {
    name: '发射场',
    radius: 250
  },
  'airfield_display_name': {
    name: '机场',
    radius: 120
  },
  'power_plant_display_name': {
    name: '电厂',
    radius: 112
  },
  'military_tunnels_display_name': {
    name: '军事隧道',
    radius: 122
  },
  'train_yard_display_name': {
    name: '火车站',
    radius: 110
  },
  'water_treatment_plant_display_name': {
    name: '污水处理厂',
    radius: 110
  },
  'excavator': {
    name: '巨型挖掘机',
    radius: 110
  },

  // 中型古迹
  'harbor_display_name': {
    name: '港口',
    radius: 96
  },
  'harbor_2_display_name': {
    name: '港口2',
    radius: 96
  },
  'ferryterminal': {
    name: '渡轮码头',
    radius: 88
  },
  'junkyard_display_name': {
    name: '垃圾场',
    radius: 88
  },
  'sewer_display_name': {
    name: '下水道',
    radius: 87
  },
  'bandit_camp': {
    name: '强盗营地',
    radius: 82
  },
  'outpost': {
    name: '前哨站',
    radius: 81
  },
  'missile_silo_monument': {
    name: '导弹发射井',
    radius: 81
  },
  'satellite_dish_display_name': {
    name: '雷达残骸',
    radius: 78
  },
  'arctic_base_a': {
    name: '北极科研基地',
    radius: 64
  },
  'dome_monument_name': {
    name: '大铁球',
    radius: 50
  },
  'AbandonedMilitaryBase': {
    name: '废弃军事基地',
    radius: 46
  },
  'swamp_c': {
    name: '沼泽',
    radius: 42
  },
  'large_fishing_village_display_name': {
    name: '大渔村',
    radius: 40
  },

  // 海上石油平台
  'large_oil_rig': {
    name: '大油井',
    radius: 40
  },
  'oil_rig_small': {
    name: '小油井',
    radius: 32
  },

  // 小型古迹/资源点
  'mining_quarry_stone_display_name': {
    name: '石矿场',
    radius: 35
  },
  'mining_quarry_sulfur_display_name': {
    name: '硫磺矿场',
    radius: 33
  },
  'mining_quarry_hqm_display_name': {
    name: '高质金属矿场',
    radius: 27
  },
  'stables_a': {
    name: '马厩A',
    radius: 35
  },
  'stables_b': {
    name: '马厩B',
    radius: 35
  },
  'fishing_village_display_name': {
    name: '渔村',
    radius: 31
  },
  'lighthouse_display_name': {
    name: '灯塔',
    radius: 28
  },
  'gas_station': {
    name: '加油站',
    radius: 28
  },
  'supermarket': {
    name: '超市',
    radius: 19
  },
  'mining_outpost_display_name': {
    name: '采矿前哨站',
    radius: 17
  },

  // 特殊古迹（隧道系统 - 半径为0表示不参与距离判定）
  'train_tunnel_display_name': {
    name: '火车隧道',
    radius: 0
  },
  'train_tunnel_link_display_name': {
    name: '火车隧道连接',
    radius: 0
  },
  'DungeonBase': {
    name: '地下基地',
    radius: 0
  },
  'underwater_lab': {
    name: '水下实验室',
    radius: 0
  }
};

export default MONUMENT_INFO;
