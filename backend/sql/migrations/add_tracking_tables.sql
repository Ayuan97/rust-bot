-- ============================================================
-- 玩家追踪系统 - 数据库迁移脚本
-- 执行: mysql -u root -p rust_plus < add_tracking_tables.sql
-- ============================================================

-- 追踪玩家主表 - 存储用户追踪的玩家列表
CREATE TABLE IF NOT EXISTS `tracked_players` (
  `id` VARCHAR(36) NOT NULL,
  `userId` VARCHAR(36) NOT NULL,
  `steamId` VARCHAR(36) NOT NULL,
  `battlemetricsId` VARCHAR(50) NULL,
  `groupName` VARCHAR(50) NOT NULL DEFAULT '默认',
  `notes` VARCHAR(255) NULL,
  `priority` ENUM('NORMAL', 'HIGH') NOT NULL DEFAULT 'NORMAL',
  `isActive` TINYINT(1) NOT NULL DEFAULT 1,
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updatedAt` DATETIME(3) NULL,
  PRIMARY KEY (`id`),
  UNIQUE INDEX `tracked_players_userId_steamId_key` (`userId`, `steamId`),
  INDEX `tracked_players_userId_idx` (`userId`),
  INDEX `tracked_players_steamId_idx` (`steamId`),
  CONSTRAINT `tracked_players_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `users` (`id`) ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 玩家信息缓存表 - 全局共享的玩家状态缓存
CREATE TABLE IF NOT EXISTS `tracked_player_cache` (
  `steamId` VARCHAR(36) NOT NULL,
  `battlemetricsId` VARCHAR(50) NULL,
  `currentName` VARCHAR(255) NULL,
  `nameHistory` JSON NULL,
  `currentServerBmId` VARCHAR(50) NULL,
  `currentServerName` VARCHAR(255) NULL,
  `isOnline` TINYINT(1) NOT NULL DEFAULT 0,
  `lastOnlineTime` DATETIME(3) NULL,
  `lastOfflineTime` DATETIME(3) NULL,
  `sessionStartTime` DATETIME(3) NULL,
  `vacBanned` TINYINT(1) NOT NULL DEFAULT 0,
  `gameBans` INT NOT NULL DEFAULT 0,
  `lastUpdated` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (`steamId`),
  INDEX `tracked_player_cache_battlemetricsId_idx` (`battlemetricsId`),
  INDEX `tracked_player_cache_isOnline_idx` (`isOnline`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 追踪事件日志表 - 记录玩家上下线等事件
CREATE TABLE IF NOT EXISTS `tracking_events` (
  `id` VARCHAR(36) NOT NULL,
  `userId` VARCHAR(36) NOT NULL,
  `steamId` VARCHAR(36) NOT NULL,
  `eventType` ENUM('ONLINE', 'OFFLINE', 'SERVER_CHANGE', 'NAME_CHANGE') NOT NULL,
  `playerName` VARCHAR(255) NULL,
  `serverBmId` VARCHAR(50) NULL,
  `serverName` VARCHAR(255) NULL,
  `previousServerBmId` VARCHAR(50) NULL,
  `previousServerName` VARCHAR(255) NULL,
  `sessionDuration` INT NULL,
  `eventData` JSON NULL,
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (`id`),
  INDEX `tracking_events_userId_steamId_idx` (`userId`, `steamId`),
  INDEX `tracking_events_userId_createdAt_idx` (`userId`, `createdAt`),
  INDEX `tracking_events_steamId_createdAt_idx` (`steamId`, `createdAt`),
  CONSTRAINT `tracking_events_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `users` (`id`) ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 完成提示
SELECT 'Tracking tables created successfully!' AS result;
