import Database from 'better-sqlite3';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

class Storage {
  constructor() {
    const dbPath = join(__dirname, '../../data/database.db');
    this.db = new Database(dbPath);
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
        created_at INTEGER DEFAULT (strftime('%s', 'now'))
      )
    `);

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

    console.log('✅ 数据库初始化完成');
  }

  // ========== 服务器管理 ==========

  addServer(server) {
    const stmt = this.db.prepare(`
      INSERT INTO servers (id, name, ip, port, player_id, player_token)
      VALUES (?, ?, ?, ?, ?, ?)
    `);
    return stmt.run(server.id, server.name, server.ip, server.port, server.playerId, server.playerToken);
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
}

export default new Storage();
