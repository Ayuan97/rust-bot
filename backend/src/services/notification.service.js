/**
 * NotificationService - 外部强提醒通知服务（突袭警报）
 *
 * 智能警报(Smart Alarm)触发时，给用户配置的多个通知人发 Bark（iOS 强提醒，
 * critical 可绕过静音强制响铃），未来可扩展电话等渠道。
 *
 * 核心能力：
 * - 按 userId 读「通知人名单」(raid_alert_recipients) 与「总开关」(raid_alert_config)
 * - 总开关三态：ACTIVE 正常 / SNOOZED 临时静音(到点自动恢复) / DISABLED 彻底关闭
 * - 合并窗口：一次突袭智能警报会连触发多次，但手机一次只播一个强提醒，
 *   故同一用户在 mergeWindowSec 内只发 1 条，窗口内的后续触发被合并。
 * - 通知人各自启用开关(enabled)：关掉某人 = 该人永久不收（真·关闭）。
 * - 向后兼容：用户未配通知人时，回退到 .env 的全局 Bark（旧部署不受影响）。
 */

import axios from 'axios';
import { v4 as uuidv4 } from 'uuid';
import db from '../lib/db.js';

const DEFAULT_BARK_SERVER = 'https://api.day.app';

class NotificationService {
  constructor() {
    // ===== 全局 Bark 回退（兼容旧 .env 配置；用户没配通知人时用）=====
    this.fallbackEnabled = String(process.env.BARK_ENABLED || 'false') === 'true';
    this.fallbackServer = (process.env.BARK_SERVER || DEFAULT_BARK_SERVER).replace(/\/+$/, '');
    this.fallbackKey = process.env.BARK_KEY || '';

    // ===== Bark 推送参数（全局一致）=====
    this.barkLevel = process.env.BARK_LEVEL || 'critical';   // critical=绕过静音强制响铃
    this.barkVolume = Number(process.env.BARK_VOLUME || 8);  // 0-10
    this.barkCall = String(process.env.BARK_CALL || 'true') === 'true'; // 重复响铃约30秒
    this.barkSound = process.env.BARK_SOUND || '';

    // 合并窗口内存态：userId -> 上次实际发送时间戳(ms)。重启丢失无妨（重启后首次告警照常发）。
    this.lastNotifiedAt = new Map();
  }

  /**
   * 警报通知入口（智能警报触发时调用）
   * @param {object} data - { userId, serverId, deviceName, message, ... }
   */
  async notifyAlarm(data = {}) {
    const userId = data.userId;
    if (!userId) return;

    try {
      const config = await this._getConfig(userId);

      // 1) 总开关
      if (config.mode === 'DISABLED') return;
      if (config.mode === 'SNOOZED') {
        if (config.snoozeUntil && new Date() < new Date(config.snoozeUntil)) {
          return; // 静音未到期
        }
        await this._setMode(userId, 'ACTIVE', null); // 到期自动恢复
      }

      // 2) 合并窗口：窗口内多次触发只发一条
      const now = Date.now();
      const last = this.lastNotifiedAt.get(userId) || 0;
      if (now - last < (config.mergeWindowSec || 300) * 1000) {
        return;
      }
      this.lastNotifiedAt.set(userId, now);

      // 3) 发给所有「启用」的通知人
      const alarmName = data.deviceName || '智能警报';
      const title = `🚨 警报：${alarmName}`;
      // 正文：服务器名 · Smart Alarm 自带消息 · 触发时间（任一为空自动省略）
      const serverName = await this._getServerName(data.serverId);
      const body =
        [serverName, data.message, this._formatTime(data.time)].filter(Boolean).join(' · ') ||
        `${alarmName} 触发`;
      const recipients = await this._getEnabledRecipients(userId);

      if (recipients.length === 0) {
        // 没配通知人 → 回退到全局 .env Bark（兼容旧部署）
        if (this.fallbackEnabled && this.fallbackKey) {
          await this._sendBark(this.fallbackServer, this.fallbackKey, title, body);
        }
        return;
      }

      await Promise.all(
        recipients.map((r) => this._sendBark(r.barkServer, r.barkKey, title, body))
      );
    } catch (err) {
      console.error('❌ 警报通知处理失败:', err.message);
    }
  }

  // ============ 总开关 / 配置 ============

  /** 读配置；不存在则返回默认（懒创建延后到写操作） */
  async _getConfig(userId) {
    const [rows] = await db.query('SELECT * FROM raid_alert_config WHERE userId = ?', [userId]);
    if (rows[0]) return rows[0];
    return { userId, mode: 'ACTIVE', snoozeUntil: null, snoozeHours: 6, mergeWindowSec: 300 };
  }

  /** 对外状态查询：顺便把已过期的 SNOOZED 归一化为 ACTIVE */
  async getStatus(userId) {
    const config = await this._getConfig(userId);
    if (
      config.mode === 'SNOOZED' &&
      config.snoozeUntil &&
      new Date() >= new Date(config.snoozeUntil)
    ) {
      await this._setMode(userId, 'ACTIVE', null);
      config.mode = 'ACTIVE';
      config.snoozeUntil = null;
    }
    return {
      mode: config.mode,
      snoozeUntil: config.snoozeUntil,
      snoozeHours: config.snoozeHours || 6,
      mergeWindowSec: config.mergeWindowSec || 300,
    };
  }

  async _setMode(userId, mode, snoozeUntil) {
    await db.query(
      `INSERT INTO raid_alert_config (userId, mode, snoozeUntil, updatedAt)
       VALUES (?, ?, ?, NOW(3))
       ON DUPLICATE KEY UPDATE mode = VALUES(mode), snoozeUntil = VALUES(snoozeUntil), updatedAt = NOW(3)`,
      [userId, mode, snoozeUntil]
    );
  }

  /** 临时静音：默认按配置的 snoozeHours（默认 6 小时），到点自动恢复 */
  async snooze(userId, hours = null) {
    const config = await this._getConfig(userId);
    const h = Number(hours) > 0 ? Number(hours) : (config.snoozeHours || 6);
    const until = new Date(Date.now() + h * 3600 * 1000);
    await this._setMode(userId, 'SNOOZED', until);
    return { mode: 'SNOOZED', snoozeUntil: until, hours: h };
  }

  /** 彻底关闭：手动恢复前不再通知 */
  async disable(userId) {
    await this._setMode(userId, 'DISABLED', null);
    return { mode: 'DISABLED' };
  }

  /** 恢复正常 */
  async activate(userId) {
    await this._setMode(userId, 'ACTIVE', null);
    return { mode: 'ACTIVE' };
  }

  // ============ 通知人 CRUD ============

  async _getEnabledRecipients(userId) {
    const [rows] = await db.query(
      "SELECT * FROM raid_alert_recipients WHERE userId = ? AND enabled = 1 AND channel = 'bark' AND barkKey <> ''",
      [userId]
    );
    return rows;
  }

  async listRecipients(userId) {
    const [rows] = await db.query(
      'SELECT id, name, channel, barkServer, barkKey, enabled, createdAt FROM raid_alert_recipients WHERE userId = ? ORDER BY createdAt ASC',
      [userId]
    );
    return rows;
  }

  async addRecipient(userId, { name, barkKey, barkServer } = {}) {
    const id = uuidv4();
    await db.query(
      `INSERT INTO raid_alert_recipients (id, userId, name, channel, barkServer, barkKey, enabled, createdAt, updatedAt)
       VALUES (?, ?, ?, 'bark', ?, ?, 1, NOW(3), NOW(3))`,
      [id, userId, name, (barkServer || DEFAULT_BARK_SERVER).replace(/\/+$/, ''), barkKey]
    );
    return id;
  }

  async updateRecipient(userId, id, fields = {}) {
    const updates = [];
    const params = [];
    if (fields.name !== undefined) { updates.push('name = ?'); params.push(fields.name); }
    if (fields.barkKey !== undefined) { updates.push('barkKey = ?'); params.push(fields.barkKey); }
    if (fields.barkServer !== undefined) {
      updates.push('barkServer = ?');
      params.push(String(fields.barkServer || DEFAULT_BARK_SERVER).replace(/\/+$/, ''));
    }
    if (fields.enabled !== undefined) { updates.push('enabled = ?'); params.push(fields.enabled ? 1 : 0); }
    if (updates.length === 0) return false;
    updates.push('updatedAt = NOW(3)');
    params.push(id, userId);
    const [r] = await db.query(
      `UPDATE raid_alert_recipients SET ${updates.join(', ')} WHERE id = ? AND userId = ?`,
      params
    );
    return r.affectedRows > 0;
  }

  async deleteRecipient(userId, id) {
    const [r] = await db.query(
      'DELETE FROM raid_alert_recipients WHERE id = ? AND userId = ?',
      [id, userId]
    );
    return r.affectedRows > 0;
  }

  /** 测试某个通知人是否能收到（用户配完点"测试"用） */
  async testRecipient(userId, id) {
    const [rows] = await db.query(
      'SELECT * FROM raid_alert_recipients WHERE id = ? AND userId = ?',
      [id, userId]
    );
    const r = rows[0];
    if (!r) return false;
    await this._sendBark(
      r.barkServer,
      r.barkKey,
      '🚨 警报：大门',
      `测试基地 · 这是一条测试警报 · ${this._formatTime()}`
    );
    return true;
  }

  // ============ 通知内容辅助 ============

  /** 查服务器名（用于通知正文；查不到则返回空，正文里自动省略） */
  async _getServerName(serverId) {
    if (!serverId) return '';
    try {
      const [rows] = await db.query('SELECT name FROM servers WHERE id = ?', [serverId]);
      return rows[0]?.name || '';
    } catch {
      return '';
    }
  }

  /** 触发时间格式化为 MM-DD HH:MM（服务器本地时区） */
  _formatTime(time) {
    const d = time ? new Date(time) : new Date();
    const MM = String(d.getMonth() + 1).padStart(2, '0');
    const DD = String(d.getDate()).padStart(2, '0');
    const hh = String(d.getHours()).padStart(2, '0');
    const mm = String(d.getMinutes()).padStart(2, '0');
    return `${MM}-${DD} ${hh}:${mm}`;
  }

  // ============ Bark 发送 ============

  /**
   * GET {server}/{key}/{title}/{body}?level=&volume=&call=&group=&sound=
   * @private
   */
  async _sendBark(server, key, title, body) {
    if (!key) return;
    const base = (server || DEFAULT_BARK_SERVER).replace(/\/+$/, '');
    const url = `${base}/${key}/${encodeURIComponent(title)}/${encodeURIComponent(body)}`;
    const params = {
      level: this.barkLevel,
      volume: this.barkVolume,
      group: 'rust-alarm',
      isArchive: 1,
    };
    if (this.barkCall) params.call = 1;
    if (this.barkSound) params.sound = this.barkSound;

    try {
      await axios.get(url, { params, timeout: 10000 });
    } catch (err) {
      console.error('❌ Bark 推送失败:', err.message);
    }
  }
}

export default new NotificationService();
