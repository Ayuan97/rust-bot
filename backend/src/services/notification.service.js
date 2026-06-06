/**
 * NotificationService - 外部强提醒通知服务
 *
 * 警报触发时，通过外部渠道把人"叫醒"。当前实现：Bark（iOS 强提醒，
 * critical 级别可绕过静音/勿扰强制响铃）。
 *
 * 设计说明（两步走，避免以后返工）：
 * - 现在：个人自用，只实现 Bark 一个渠道，配置走环境变量（全局一份）。
 * - 以后：要做成面向用户的功能时，在 notifyAlarm() 里按 data.userId 读取
 *   用户通知配置表，并新增微信/语音等渠道（各实现一个 _sendXxx 方法即可），
 *   警报核心链路无需改动。
 */

import axios from 'axios';

class NotificationService {
  constructor() {
    // ===== Bark（iOS 强提醒）配置 =====
    this.barkEnabled = String(process.env.BARK_ENABLED || 'false') === 'true';
    // 服务器地址：官方公益服 https://api.day.app；自建则填自己的地址
    this.barkServer = (process.env.BARK_SERVER || 'https://api.day.app').replace(/\/+$/, '');
    // 设备 key：装 Bark App 后，App 首页显示的那串随机字符
    this.barkKey = process.env.BARK_KEY || '';
    // 推送级别：critical=绕过静音/勿扰强制响铃（需在 App 里授权"重要提醒"）
    this.barkLevel = process.env.BARK_LEVEL || 'critical';
    // critical 音量，0-10
    this.barkVolume = Number(process.env.BARK_VOLUME || 8);
    // call=1：让提示音重复播放约 30 秒，更接近来电
    this.barkCall = String(process.env.BARK_CALL || 'true') === 'true';
    // 自定义铃声（留空用 App 默认）
    this.barkSound = process.env.BARK_SOUND || '';

    if (this.barkEnabled && this.barkKey) {
      console.log('🔔 NotificationService: Bark 强提醒已启用');
    } else {
      console.log('🔕 NotificationService: Bark 强提醒未启用（缺少 BARK_ENABLED 或 BARK_KEY）');
    }
  }

  /**
   * 警报通知入口
   * @param {object} data - { userId, serverId, entityId, deviceName, message, time, notificationId }
   */
  async notifyAlarm(data = {}) {
    if (!this.barkEnabled || !this.barkKey) return;

    const title = '🚨 Rust 警报';
    const body = data.message || `${data.deviceName || '设备'} 触发警报`;

    await this._sendBark({ title, body, group: 'rust-alarm' });
  }

  /**
   * 发送 Bark 推送
   * GET {server}/{key}/{title}/{body}?level=&volume=&call=&group=&sound=
   * @private
   */
  async _sendBark({ title, body, group }) {
    const url = `${this.barkServer}/${this.barkKey}/${encodeURIComponent(title)}/${encodeURIComponent(body)}`;
    const params = {
      level: this.barkLevel,
      volume: this.barkVolume,
      group: group || 'rust-bot',
      isArchive: 1
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
