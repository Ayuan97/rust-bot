/**
 * MySQL2 数据库连接池
 */

import mysql from 'mysql2/promise';
import '../utils/load-env.js';

const pool = mysql.createPool({
  host: process.env.DB_HOST,
  port: parseInt(process.env.DB_PORT, 10) || 3306,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME,
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0,
  enableKeepAlive: true,
  keepAliveInitialDelay: 0
});

// 测试连接
pool.getConnection()
  .then(conn => {
    console.log('[DB] MySQL 连接池初始化成功');
    conn.release();
  })
  .catch(err => {
    console.error('[DB] MySQL 连接池初始化失败:', err.message);
  });

export default pool;

/**
 * 执行 SQL 查询
 * @param {string} sql SQL语句
 * @param {Array} params 参数数组
 * @returns {Promise<[Array, Array]>} [rows, fields]
 */
export const query = (sql, params) => pool.execute(sql, params);

/**
 * 获取数据库连接（用于事务）
 * @returns {Promise<Connection>}
 */
export const getConnection = () => pool.getConnection();
