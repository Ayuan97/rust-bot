-- MySQL 初始化脚本
-- 此脚本在容器首次启动时自动执行

-- 确保使用正确的字符集
SET NAMES utf8mb4;
SET CHARACTER SET utf8mb4;

-- 创建数据库（如果不存在）
CREATE DATABASE IF NOT EXISTS rustplus_db
  CHARACTER SET utf8mb4
  COLLATE utf8mb4_unicode_ci;

USE rustplus_db;

-- 后续的表结构将由 Prisma 管理
-- 这里只做基础初始化

-- 记录初始化日志
CREATE TABLE IF NOT EXISTS _migration_log (
  id INT AUTO_INCREMENT PRIMARY KEY,
  message VARCHAR(255) NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

INSERT INTO _migration_log (message) VALUES ('Database initialized via init.sql');

-- 显示初始化完成信息
SELECT 'MySQL database initialized successfully!' AS status;
