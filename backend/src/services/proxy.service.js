/**
 * 代理出口管理服务（主节点）
 * - 维护机场订阅列表(proxy_subscriptions 表) + 总开关(app_config.proxy_enabled)。
 * - 给管理后台提供增删查;给子节点(连接器)下发"启用的订阅 + 开关"。
 *
 * 实际的 Mihomo 引擎跑在子节点上,本服务只负责"存 + 下发",由连接器拉取后自行生成配置/热重载。
 */

import db from '../lib/db.js';
import { v4 as uuidv4 } from 'uuid';
import appConfigService from './app-config.service.js';

const PROXY_ENABLED_KEY = 'proxy_enabled';

class ProxyService {
  /** 表结构自举(随应用启动调用) */
  async ensureSchema() {
    await db.query(
      'CREATE TABLE IF NOT EXISTS `proxy_subscriptions` (' +
      '`id` VARCHAR(36) NOT NULL,' +
      '`name` VARCHAR(64) NOT NULL,' +
      '`url` VARCHAR(1024) NOT NULL,' +
      '`enabled` TINYINT(1) NOT NULL DEFAULT 1,' +
      '`createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),' +
      '`updatedAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),' +
      'PRIMARY KEY (`id`)' +
      ') ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci'
    );
  }

  async listSubscriptions() {
    const [rows] = await db.query(
      'SELECT id, name, url, enabled, createdAt FROM proxy_subscriptions ORDER BY createdAt ASC'
    );
    return rows.map((r) => ({ ...r, enabled: !!r.enabled }));
  }

  async addSubscription({ name, url }) {
    const id = uuidv4();
    await db.query(
      'INSERT INTO proxy_subscriptions (id, name, url, enabled, createdAt, updatedAt) VALUES (?, ?, ?, 1, NOW(3), NOW(3))',
      [id, name, url]
    );
    return { id, name, url, enabled: true };
  }

  async deleteSubscription(id) {
    await db.query('DELETE FROM proxy_subscriptions WHERE id = ?', [id]);
  }

  async setSubscriptionEnabled(id, enabled) {
    await db.query(
      'UPDATE proxy_subscriptions SET enabled = ?, updatedAt = NOW(3) WHERE id = ?',
      [enabled ? 1 : 0, id]
    );
  }

  isEnabled() {
    return appConfigService.getBool(PROXY_ENABLED_KEY);
  }

  async setEnabled(enabled) {
    await appConfigService.setValue(PROXY_ENABLED_KEY, enabled ? '1' : '0');
  }

  /** 管理后台视图：开关 + 全部订阅 */
  async getAdminView() {
    return {
      enabled: this.isEnabled(),
      subscriptions: await this.listSubscriptions()
    };
  }

  /** 下发给连接器：开关 + 仅启用的订阅(name+url) */
  async getConnectorConfig() {
    const subs = (await this.listSubscriptions()).filter((s) => s.enabled);
    return {
      enabled: this.isEnabled(),
      subscriptions: subs.map((s) => ({ name: s.name, url: s.url }))
    };
  }
}

export default new ProxyService();
