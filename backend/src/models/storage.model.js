import Database from 'better-sqlite3';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

class Storage {
  constructor() {
    const dbPath = join(__dirname, '../../data/database.db');
    this.db = new Database(dbPath);
    // 启用外键级联删除，确保重置/删除服务器时级联清理设备与事件日志
    try {
      this.db.pragma('foreign_keys = ON');
    } catch (e) {
      console.warn('无法启用 SQLite 外键:', e?.message || e);
    }
    this.initDatabase();
  }

  initDatabase() {
    // 创建服务器配置表
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS servers (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        ip TEXT NOT NULL,
        port TEXT NOT NULL,
        player_id TEXT NOT NULL,
        player_token TEXT NOT NULL,
        battlemetrics_id TEXT,
        img TEXT,
        logo TEXT,
        url TEXT,
        description TEXT,
        created_at INTEGER DEFAULT (strftime('%s', 'now'))
      )
    `);

    // 检查并添加新列（兼容旧数据库）
    const columnsToAdd = [
      'battlemetrics_id',
      'img',
      'logo',
      'url',
      'description'
    ];

    for (const column of columnsToAdd) {
      try {
        this.db.exec(`ALTER TABLE servers ADD COLUMN ${column} TEXT`);
        console.log(`✅ 添加 ${column} 列`);
      } catch (error) {
        // 列已存在，忽略错误
      }
    }

    // 创建设备表
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS devices (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        server_id TEXT NOT NULL,
        entity_id INTEGER NOT NULL,
        name TEXT NOT NULL,
        type TEXT,
        created_at INTEGER DEFAULT (strftime('%s', 'now')),
        FOREIGN KEY (server_id) REFERENCES servers(id) ON DELETE CASCADE,
        UNIQUE(server_id, entity_id)
      )
    `);

    // 创建事件日志表
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS event_logs (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        server_id TEXT NOT NULL,
        event_type TEXT NOT NULL,
        event_data TEXT,
        created_at INTEGER DEFAULT (strftime('%s', 'now')),
        FOREIGN KEY (server_id) REFERENCES servers(id) ON DELETE CASCADE
      )
    `);

    // 设备表新列迁移（自动化和命令功能）
    const deviceColumnsToAdd = [
      { name: 'command', type: 'TEXT DEFAULT NULL' },           // 自定义命令名
      { name: 'auto_mode', type: 'INTEGER DEFAULT 0' },         // 自动化模式 0-8
      { name: 'reachable', type: 'INTEGER DEFAULT 1' },         // 是否可达
      { name: 'last_trigger', type: 'INTEGER DEFAULT NULL' }    // 警报触发时间
    ];

    // 获取现有列信息
    const existingColumns = this.db.prepare("PRAGMA table_info(devices)").all();
    const existingColumnNames = new Set(existingColumns.map(col => col.name));

    for (const col of deviceColumnsToAdd) {
      if (!existingColumnNames.has(col.name)) {
        try {
          this.db.exec(`ALTER TABLE devices ADD COLUMN ${col.name} ${col.type}`);
          console.log(`✅ devices 表添加 ${col.name} 列`);
        } catch (error) {
          console.error(`❌ devices 表添加 ${col.name} 列失败:`, error.message);
        }
      }
    }

    // 创建索引以提升查询性能
    try {
      this.db.exec(`CREATE INDEX IF NOT EXISTS idx_event_logs_server_id ON event_logs(server_id)`);
      this.db.exec(`CREATE INDEX IF NOT EXISTS idx_event_logs_created_at ON event_logs(created_at)`);
      this.db.exec(`CREATE INDEX IF NOT EXISTS idx_devices_server_id ON devices(server_id)`);
      this.db.exec(`CREATE INDEX IF NOT EXISTS idx_devices_auto_mode ON devices(auto_mode)`);
    } catch (e) {
      // 索引已存在，忽略
    }

    // 创建通知设置表
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS notification_settings (
        id INTEGER PRIMARY KEY CHECK (id = 1),
        settings_json TEXT NOT NULL DEFAULT '{}',
        created_at INTEGER DEFAULT (strftime('%s', 'now')),
        updated_at INTEGER DEFAULT (strftime('%s', 'now'))
      )
    `);

    console.log('✅ 数据库初始化完成');
  }

  // ========== 服务器管理 ==========

  addServer(server) {
    const stmt = this.db.prepare(`
      INSERT OR REPLACE INTO servers (id, name, ip, port, player_id, player_token, img, logo, url, description)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);
    return stmt.run(
      server.id,
      server.name,
      server.ip,
      server.port,
      server.playerId,
      server.playerToken,
      server.img || null,
      server.logo || null,
      server.url || null,
      server.desc || server.description || null
    );
  }

  getServer(id) {
    const stmt = this.db.prepare('SELECT * FROM servers WHERE id = ?');
    return stmt.get(id);
  }

  getAllServers() {
    const stmt = this.db.prepare('SELECT * FROM servers ORDER BY created_at DESC');
    return stmt.all();
  }

  updateServer(id, updates) {
    const fields = Object.keys(updates).map(key => `${key} = ?`).join(', ');
    const values = [...Object.values(updates), id];
    const stmt = this.db.prepare(`UPDATE servers SET ${fields} WHERE id = ?`);
    return stmt.run(...values);
  }

  deleteServer(id) {
    const stmt = this.db.prepare('DELETE FROM servers WHERE id = ?');
    return stmt.run(id);
  }

  // ========== 设备管理 ==========

  addDevice(device) {
    const stmt = this.db.prepare(`
      INSERT INTO devices (server_id, entity_id, name, type)
      VALUES (?, ?, ?, ?)
      ON CONFLICT(server_id, entity_id) DO UPDATE SET
        name = excluded.name,
        type = excluded.type
    `);
    return stmt.run(device.serverId, device.entityId, device.name, device.type);
  }

  getDevicesByServer(serverId) {
    const stmt = this.db.prepare('SELECT * FROM devices WHERE server_id = ?');
    return stmt.all(serverId);
  }

  deleteDevice(serverId, entityId) {
    const stmt = this.db.prepare('DELETE FROM devices WHERE server_id = ? AND entity_id = ?');
    return stmt.run(serverId, entityId);
  }

  getDeviceByEntityId(serverId, entityId) {
    const stmt = this.db.prepare('SELECT * FROM devices WHERE server_id = ? AND entity_id = ?');
    return stmt.get(serverId, entityId);
  }

  updateDevice(serverId, entityId, updates) {
    const allowedFields = ['name', 'type', 'command', 'auto_mode', 'reachable', 'last_trigger'];
    const fields = Object.keys(updates).filter(k => allowedFields.includes(k));
    if (fields.length === 0) return { changes: 0 };

    const setClause = fields.map(k => `${k} = ?`).join(', ');
    const values = fields.map(k => updates[k]);
    const stmt = this.db.prepare(`UPDATE devices SET ${setClause} WHERE server_id = ? AND entity_id = ?`);
    return stmt.run(...values, serverId, entityId);
  }

  updateDeviceLastTrigger(serverId, entityId, time) {
    const stmt = this.db.prepare('UPDATE devices SET last_trigger = ? WHERE server_id = ? AND entity_id = ?');
    return stmt.run(time, serverId, entityId);
  }

  updateDeviceReachable(serverId, entityId, reachable) {
    const stmt = this.db.prepare('UPDATE devices SET reachable = ? WHERE server_id = ? AND entity_id = ?');
    return stmt.run(reachable ? 1 : 0, serverId, entityId);
  }

  getDevicesWithCommand(serverId) {
    const stmt = this.db.prepare('SELECT * FROM devices WHERE server_id = ? AND command IS NOT NULL AND command != ""');
    return stmt.all(serverId);
  }

  getDevicesWithAutoMode(serverId) {
    const stmt = this.db.prepare('SELECT * FROM devices WHERE server_id = ? AND auto_mode > 0');
    return stmt.all(serverId);
  }

  getAllDevicesWithAutoMode() {
    const stmt = this.db.prepare('SELECT * FROM devices WHERE auto_mode > 0');
    return stmt.all();
  }

  // ========== 事件日志 ==========

  addEventLog(serverId, eventType, eventData) {
    const stmt = this.db.prepare(`
      INSERT INTO event_logs (server_id, event_type, event_data)
      VALUES (?, ?, ?)
    `);
    return stmt.run(serverId, eventType, JSON.stringify(eventData));
  }

  getEventLogs(serverId, limit = 100) {
    const stmt = this.db.prepare(`
      SELECT * FROM event_logs
      WHERE server_id = ?
      ORDER BY created_at DESC
      LIMIT ?
    `);
    const logs = stmt.all(serverId, limit);
    return logs.map(log => ({
      ...log,
      event_data: JSON.parse(log.event_data)
    }));
  }

  clearEventLogs(serverId) {
    const stmt = this.db.prepare('DELETE FROM event_logs WHERE server_id = ?');
    return stmt.run(serverId);
  }

  // ========== 通知设置 ==========

  getNotificationSettings() {
    const stmt = this.db.prepare('SELECT settings_json FROM notification_settings WHERE id = 1');
    const row = stmt.get();
    if (row) {
      try {
        return JSON.parse(row.settings_json);
      } catch (e) {
        return {};
      }
    }
    return {};
  }

  saveNotificationSettings(settings) {
    const stmt = this.db.prepare(`
      INSERT INTO notification_settings (id, settings_json, updated_at)
      VALUES (1, ?, strftime('%s', 'now'))
      ON CONFLICT(id) DO UPDATE SET
        settings_json = excluded.settings_json,
        updated_at = strftime('%s', 'now')
    `);
    return stmt.run(JSON.stringify(settings));
  }

  updateNotificationSettings(partialSettings) {
    const current = this.getNotificationSettings();
    const updated = { ...current, ...partialSettings };
    return this.saveNotificationSettings(updated);
  }

  resetNotificationSettings() {
    const stmt = this.db.prepare('DELETE FROM notification_settings WHERE id = 1');
    return stmt.run();
  }
}

export default new Storage();
