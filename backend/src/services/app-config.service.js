/**
 * 全局应用配置服务（注册模式 / 免费试用开关等运营开关）
 * - 维护 app_config 键值表，进程内缓存，读多写少。
 * - 同时负责本特性所需的表结构自举（app_config 表 + users.approvalStatus 列），
 *   让线上仅靠重启即可完成迁移，无需手工执行 ALTER。
 */

import db from '../lib/db.js';

export const CONFIG_KEYS = {
  REGISTRATION_MODE: 'registration_mode', // 'open' 开放注册即用 | 'approval' 注册后需审核
  FREE_TRIAL_ENABLED: 'free_trial_enabled', // '0' | '1'
  FREE_TRIAL_DAYS: 'free_trial_days', // 整数字符串
  PROXY_ENABLED: 'proxy_enabled' // '0' | '1'：子节点出口被封时，是否启用"直连失败回退代理"
};

const DEFAULTS = {
  [CONFIG_KEYS.REGISTRATION_MODE]: 'open',
  [CONFIG_KEYS.FREE_TRIAL_ENABLED]: '0',
  [CONFIG_KEYS.FREE_TRIAL_DAYS]: '30',
  [CONFIG_KEYS.PROXY_ENABLED]: '0'
};

const REGISTRATION_MODES = new Set(['open', 'approval']);
const MAX_TRIAL_DAYS = 3650;

class AppConfigService {
  constructor() {
    this.cache = new Map(); // configKey -> configValue(string)
  }

  /**
   * 表结构自举 + 载入缓存。应在应用启动、其它初始化之前调用一次。
   */
  async ensureSchema() {
    // 1) 配置表
    await db.query(
      'CREATE TABLE IF NOT EXISTS `app_config` (' +
      '`configKey` VARCHAR(64) NOT NULL,' +
      '`configValue` VARCHAR(255) NOT NULL,' +
      '`updatedAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),' +
      'PRIMARY KEY (`configKey`)' +
      ') ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci'
    );

    // 2) 播种默认值（已存在则忽略，不覆盖管理员改动）
    for (const [key, value] of Object.entries(DEFAULTS)) {
      await db.query(
        'INSERT IGNORE INTO `app_config` (`configKey`, `configValue`) VALUES (?, ?)',
        [key, value]
      );
    }

    // 3) users.approvalStatus 列（MySQL 无 ADD COLUMN IF NOT EXISTS，先查 information_schema 再补）
    const [cols] = await db.query(
      "SELECT COLUMN_NAME FROM information_schema.COLUMNS " +
      "WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'users' AND COLUMN_NAME = 'approvalStatus'"
    );
    if (cols.length === 0) {
      await db.query(
        "ALTER TABLE `users` " +
        "ADD COLUMN `approvalStatus` ENUM('PENDING','APPROVED','REJECTED') NOT NULL DEFAULT 'APPROVED' AFTER `isAdmin`, " +
        "ADD INDEX `users_approvalStatus_idx` (`approvalStatus`)"
      );
      console.log('[app-config] 已为 users 表补充 approvalStatus 列');
    }

    await this.reload();
  }

  /**
   * 从数据库重新载入配置到缓存
   */
  async reload() {
    const [rows] = await db.query('SELECT `configKey`, `configValue` FROM `app_config`');
    this.cache = new Map(rows.map((r) => [r.configKey, r.configValue]));
  }

  _raw(key) {
    return this.cache.has(key) ? this.cache.get(key) : DEFAULTS[key];
  }

  _normalizeDays(value) {
    const n = Number.parseInt(value, 10);
    if (Number.isNaN(n) || n < 1) return 30;
    if (n > MAX_TRIAL_DAYS) return MAX_TRIAL_DAYS;
    return n;
  }

  /**
   * 返回类型化的配置对象，供注册流程 / 管理后台 / 前端使用。
   * @returns {{registrationMode: string, freeTrialEnabled: boolean, freeTrialDays: number}}
   */
  getConfig() {
    const mode = this._raw(CONFIG_KEYS.REGISTRATION_MODE);
    return {
      registrationMode: REGISTRATION_MODES.has(mode) ? mode : 'open',
      freeTrialEnabled: this._raw(CONFIG_KEYS.FREE_TRIAL_ENABLED) === '1',
      freeTrialDays: this._normalizeDays(this._raw(CONFIG_KEYS.FREE_TRIAL_DAYS))
    };
  }

  /** 通用：按键读布尔('1' 为 true) */
  getBool(key) {
    return this._raw(key) === '1';
  }

  /** 通用：写入单个键并刷新缓存 */
  async setValue(key, value) {
    await db.query(
      'INSERT INTO `app_config` (`configKey`, `configValue`, `updatedAt`) VALUES (?, ?, NOW(3)) ' +
      'ON DUPLICATE KEY UPDATE `configValue` = VALUES(`configValue`), `updatedAt` = NOW(3)',
      [key, String(value)]
    );
    await this.reload();
  }

  /**
   * 更新配置（部分更新）。校验后写库并刷新缓存。
   * @param {{registrationMode?: string, freeTrialEnabled?: boolean, freeTrialDays?: number}} patch
   * @returns {Promise<object>} 更新后的类型化配置
   */
  async updateConfig(patch = {}) {
    const writes = [];

    if (patch.registrationMode !== undefined) {
      if (!REGISTRATION_MODES.has(patch.registrationMode)) {
        throw new Error('无效的注册模式');
      }
      writes.push([CONFIG_KEYS.REGISTRATION_MODE, patch.registrationMode]);
    }

    if (patch.freeTrialEnabled !== undefined) {
      writes.push([CONFIG_KEYS.FREE_TRIAL_ENABLED, patch.freeTrialEnabled ? '1' : '0']);
    }

    if (patch.freeTrialDays !== undefined) {
      const days = Number.parseInt(patch.freeTrialDays, 10);
      if (Number.isNaN(days) || days < 1 || days > MAX_TRIAL_DAYS) {
        throw new Error(`免费天数必须是 1-${MAX_TRIAL_DAYS} 的整数`);
      }
      writes.push([CONFIG_KEYS.FREE_TRIAL_DAYS, String(days)]);
    }

    for (const [key, value] of writes) {
      await db.query(
        'INSERT INTO `app_config` (`configKey`, `configValue`, `updatedAt`) VALUES (?, ?, NOW(3)) ' +
        'ON DUPLICATE KEY UPDATE `configValue` = VALUES(`configValue`), `updatedAt` = NOW(3)',
        [key, value]
      );
    }

    await this.reload();
    return this.getConfig();
  }
}

export default new AppConfigService();
