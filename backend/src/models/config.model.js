import Database from 'better-sqlite3';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

class ConfigStorage {
  constructor() {
    const dbPath = join(__dirname, '../../data/database.db');
    this.db = new Database(dbPath);
    this.initDatabase();
  }

  initDatabase() {
    // 检查旧表结构并迁移
    const tableInfo = this.db.prepare("PRAGMA table_info(fcm_credentials)").all();
    const hasOldSchema = tableInfo.some(col => col.name === 'fcm_token');

    if (hasOldSchema) {
      console.log('🔄 检测到旧数据库结构，正在迁移...');

      // 备份旧数据
      const oldData = this.db.prepare('SELECT * FROM fcm_credentials WHERE id = 1').get();

      // 删除旧表
      this.db.exec('DROP TABLE IF EXISTS fcm_credentials');

      // 创建新表
      this.db.exec(`
        CREATE TABLE fcm_credentials (
          id INTEGER PRIMARY KEY CHECK (id = 1),
          credentials_json TEXT NOT NULL,
          credential_type TEXT NOT NULL,
          created_at INTEGER DEFAULT (strftime('%s', 'now')),
          updated_at INTEGER DEFAULT (strftime('%s', 'now'))
        )
      `);

      // 迁移旧数据（如果存在）
      if (oldData) {
        const oldCredentials = {
          fcm: {
            token: oldData.fcm_token,
            pushSet: oldData.fcm_push_set,
          },
          keys: JSON.parse(oldData.keys),
        };

        this.db.prepare(`
          INSERT INTO fcm_credentials (id, credentials_json, credential_type)
          VALUES (1, ?, ?)
        `).run(JSON.stringify(oldCredentials), 'FCM');

        console.log('✅ 数据迁移完成');
      }
    } else {
      // 创建新表（如果不存在）
      this.db.exec(`
        CREATE TABLE IF NOT EXISTS fcm_credentials (
          id INTEGER PRIMARY KEY CHECK (id = 1),
          credentials_json TEXT NOT NULL,
          credential_type TEXT NOT NULL,
          created_at INTEGER DEFAULT (strftime('%s', 'now')),
          updated_at INTEGER DEFAULT (strftime('%s', 'now'))
        )
      `);
    }

    console.log('✅ 配置数据库初始化完成');
  }

  // ========== FCM/GCM 凭证管理 ==========

  saveFCMCredentials(credentials) {
    // 判断凭证类型
    const credentialType = credentials.gcm ? 'GCM' : 'FCM';

    const stmt = this.db.prepare(`
      INSERT INTO fcm_credentials (id, credentials_json, credential_type)
      VALUES (1, ?, ?)
      ON CONFLICT(id) DO UPDATE SET
        credentials_json = excluded.credentials_json,
        credential_type = excluded.credential_type,
        updated_at = strftime('%s', 'now')
    `);

    return stmt.run(
      JSON.stringify(credentials),
      credentialType
    );
  }

  getFCMCredentials() {
    const stmt = this.db.prepare('SELECT * FROM fcm_credentials WHERE id = 1');
    const row = stmt.get();

    if (!row) return null;

    return JSON.parse(row.credentials_json);
  }

  deleteFCMCredentials() {
    const stmt = this.db.prepare('DELETE FROM fcm_credentials WHERE id = 1');
    return stmt.run();
  }

  hasFCMCredentials() {
    const stmt = this.db.prepare('SELECT COUNT(*) as count FROM fcm_credentials WHERE id = 1');
    const result = stmt.get();
    return result.count > 0;
  }

  // ========== 代理配置管理 ==========

  initProxyTable() {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS proxy_config (
        id INTEGER PRIMARY KEY CHECK (id = 1),
        subscription_url TEXT,
        selected_node TEXT,
        proxy_port INTEGER DEFAULT 10808,
        auto_start INTEGER DEFAULT 1,
        nodes_json TEXT,
        updated_at INTEGER DEFAULT (strftime('%s', 'now'))
      )
    `);
  }

  saveProxyConfig(config) {
    this.initProxyTable();

    const stmt = this.db.prepare(`
      INSERT INTO proxy_config (id, subscription_url, selected_node, proxy_port, auto_start, nodes_json)
      VALUES (1, ?, ?, ?, ?, ?)
      ON CONFLICT(id) DO UPDATE SET
        subscription_url = excluded.subscription_url,
        selected_node = excluded.selected_node,
        proxy_port = excluded.proxy_port,
        auto_start = excluded.auto_start,
        nodes_json = excluded.nodes_json,
        updated_at = strftime('%s', 'now')
    `);

    return stmt.run(
      config.subscriptionUrl || null,
      config.selectedNode || null,
      config.proxyPort || 10808,
      config.autoStart ? 1 : 0,
      config.nodes ? JSON.stringify(config.nodes) : null
    );
  }

  getProxyConfig() {
    this.initProxyTable();

    const stmt = this.db.prepare('SELECT * FROM proxy_config WHERE id = 1');
    const row = stmt.get();

    if (!row) return null;

    return {
      subscriptionUrl: row.subscription_url,
      selectedNode: row.selected_node,
      proxyPort: row.proxy_port,
      autoStart: row.auto_start === 1,
      nodes: row.nodes_json ? JSON.parse(row.nodes_json) : [],
      updatedAt: row.updated_at
    };
  }

  updateProxyNodes(nodes) {
    this.initProxyTable();

    const stmt = this.db.prepare(`
      UPDATE proxy_config SET nodes_json = ?, updated_at = strftime('%s', 'now') WHERE id = 1
    `);
    return stmt.run(JSON.stringify(nodes));
  }

  updateSelectedNode(nodeName) {
    this.initProxyTable();

    const stmt = this.db.prepare(`
      UPDATE proxy_config SET selected_node = ?, updated_at = strftime('%s', 'now') WHERE id = 1
    `);
    return stmt.run(nodeName);
  }

  deleteProxyConfig() {
    this.initProxyTable();

    const stmt = this.db.prepare('DELETE FROM proxy_config WHERE id = 1');
    return stmt.run();
  }

  hasProxyConfig() {
    this.initProxyTable();

    const stmt = this.db.prepare('SELECT subscription_url FROM proxy_config WHERE id = 1');
    const row = stmt.get();
    return row && row.subscription_url;
  }
}

export default new ConfigStorage();
