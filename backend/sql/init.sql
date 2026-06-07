-- ============================================================
-- Rust+ Web Dashboard - 数据库初始化脚本
-- ============================================================

-- 用户表
CREATE TABLE IF NOT EXISTS `users` (
  `id` VARCHAR(36) NOT NULL,
  `username` VARCHAR(50) NOT NULL,
  `email` VARCHAR(100) NULL,
  `password` VARCHAR(255) NOT NULL,
  `balance` DECIMAL(10, 2) NOT NULL DEFAULT 0.00,
  `isActive` TINYINT(1) NOT NULL DEFAULT 1,
  `isAdmin` TINYINT(1) NOT NULL DEFAULT 0,
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updatedAt` DATETIME(3) NOT NULL,
  `lastLogin` DATETIME(3) NULL,
  PRIMARY KEY (`id`),
  UNIQUE INDEX `users_username_key` (`username`),
  UNIQUE INDEX `users_email_key` (`email`),
  INDEX `users_email_idx` (`email`),
  INDEX `users_username_idx` (`username`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 服务器表
CREATE TABLE IF NOT EXISTS `servers` (
  `id` VARCHAR(36) NOT NULL,
  `userId` VARCHAR(36) NOT NULL,
  `name` VARCHAR(100) NOT NULL,
  `ip` VARCHAR(45) NOT NULL,
  `port` VARCHAR(10) NOT NULL,
  `playerId` VARCHAR(50) NOT NULL,
  `playerToken` VARCHAR(50) NOT NULL,
  `battlemetricsId` VARCHAR(50) NULL,
  `img` TEXT NULL,
  `logo` TEXT NULL,
  `url` VARCHAR(255) NULL,
  `description` TEXT NULL,
  `fcmCredentials` JSON NULL,
  `isActive` TINYINT(1) NOT NULL DEFAULT 1,
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updatedAt` DATETIME(3) NOT NULL,
  PRIMARY KEY (`id`),
  UNIQUE INDEX `servers_userId_ip_port_key` (`userId`, `ip`, `port`),
  INDEX `servers_playerId_idx` (`playerId`),
  INDEX `servers_userId_idx` (`userId`),
  CONSTRAINT `servers_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `users` (`id`) ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 设备表
CREATE TABLE IF NOT EXISTS `devices` (
  `id` VARCHAR(36) NOT NULL,
  `serverId` VARCHAR(36) NOT NULL,
  `userId` VARCHAR(36) NOT NULL,
  `entityId` INT NOT NULL,
  `name` VARCHAR(100) NOT NULL,
  `type` ENUM('SWITCH', 'ALARM', 'STORAGE') NOT NULL,
  `command` VARCHAR(50) NULL,
  `message` VARCHAR(255) NULL,
  `autoMode` ENUM('NONE', 'DAY_ON', 'NIGHT_ON', 'ALWAYS_ON', 'ALWAYS_OFF', 'ONLINE_ON', 'ONLINE_OFF') NOT NULL DEFAULT 'NONE',
  `isActive` TINYINT(1) NOT NULL DEFAULT 1,
  `reachable` TINYINT(1) NOT NULL DEFAULT 1,
  `lastTrigger` DATETIME(3) NULL,
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updatedAt` DATETIME(3) NOT NULL,
  PRIMARY KEY (`id`),
  UNIQUE INDEX `devices_serverId_entityId_key` (`serverId`, `entityId`),
  INDEX `devices_serverId_idx` (`serverId`),
  INDEX `devices_userId_idx` (`userId`),
  CONSTRAINT `devices_serverId_fkey` FOREIGN KEY (`serverId`) REFERENCES `servers` (`id`) ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT `devices_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `users` (`id`) ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 事件日志表
CREATE TABLE IF NOT EXISTS `event_logs` (
  `id` VARCHAR(36) NOT NULL,
  `serverId` VARCHAR(36) NOT NULL,
  `userId` VARCHAR(36) NOT NULL,
  `eventType` ENUM('PLAYER_DEATH', 'PLAYER_ONLINE', 'PLAYER_OFFLINE', 'PLAYER_AFK', 'PLAYER_RETURN', 'CARGO_SPAWN', 'CARGO_LEAVE', 'HELI_SPAWN', 'HELI_DOWN', 'OIL_RIG_TRIGGERED', 'OIL_RIG_UNLOCKED', 'CHINOOK_SPAWN', 'ALARM_TRIGGERED', 'ENTITY_CHANGED', 'DEVICE_OFFLINE', 'SERVER_CONNECTED', 'SERVER_DISCONNECTED', 'FCM_CONNECTED', 'FCM_DISCONNECTED', 'TRAVELLING_VENDOR_SPAWN', 'TRAVELLING_VENDOR_LEAVE') NOT NULL,
  `eventData` JSON NOT NULL,
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (`id`),
  INDEX `event_logs_createdAt_idx` (`createdAt`),
  INDEX `event_logs_eventType_idx` (`eventType`),
  INDEX `event_logs_serverId_idx` (`serverId`),
  INDEX `event_logs_userId_idx` (`userId`),
  CONSTRAINT `event_logs_serverId_fkey` FOREIGN KEY (`serverId`) REFERENCES `servers` (`id`) ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT `event_logs_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `users` (`id`) ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 通知设置表
CREATE TABLE IF NOT EXISTS `notification_settings` (
  `id` VARCHAR(36) NOT NULL,
  `userId` VARCHAR(36) NOT NULL,
  `settings` JSON NOT NULL,
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updatedAt` DATETIME(3) NOT NULL,
  PRIMARY KEY (`id`),
  UNIQUE INDEX `notification_settings_userId_key` (`userId`),
  INDEX `notification_settings_userId_idx` (`userId`),
  CONSTRAINT `notification_settings_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `users` (`id`) ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 订阅套餐表
CREATE TABLE IF NOT EXISTS `subscription_plans` (
  `id` VARCHAR(36) NOT NULL,
  `code` VARCHAR(50) NOT NULL,
  `name` VARCHAR(100) NOT NULL,
  `price` DECIMAL(10, 2) NOT NULL,
  `duration` INT NOT NULL,
  `description` VARCHAR(255) NULL,
  `features` JSON NULL,
  `sortOrder` INT NOT NULL DEFAULT 0,
  `isActive` TINYINT(1) NOT NULL DEFAULT 1,
  `highlighted` TINYINT(1) NOT NULL DEFAULT 0,
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updatedAt` DATETIME(3) NOT NULL,
  PRIMARY KEY (`id`),
  UNIQUE INDEX `subscription_plans_code_key` (`code`),
  INDEX `subscription_plans_isActive_sortOrder_idx` (`isActive`, `sortOrder`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 订阅表
CREATE TABLE IF NOT EXISTS `subscriptions` (
  `id` VARCHAR(36) NOT NULL,
  `userId` VARCHAR(36) NOT NULL,
  `planType` ENUM('TRIAL', 'MONTHLY', 'QUARTERLY', 'YEARLY') NOT NULL DEFAULT 'TRIAL',
  `status` ENUM('ACTIVE', 'EXPIRED', 'CANCELLED') NOT NULL DEFAULT 'ACTIVE',
  `startDate` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `endDate` DATETIME(3) NOT NULL,
  `amount` DECIMAL(10, 2) NULL,
  `paymentMethod` ENUM('ALIPAY', 'WECHAT') NULL,
  `transactionId` VARCHAR(100) NULL,
  `autoRenew` TINYINT(1) NOT NULL DEFAULT 0,
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updatedAt` DATETIME(3) NOT NULL,
  PRIMARY KEY (`id`),
  UNIQUE INDEX `subscriptions_userId_key` (`userId`),
  INDEX `subscriptions_endDate_idx` (`endDate`),
  INDEX `subscriptions_userId_idx` (`userId`),
  INDEX `subscriptions_status_idx` (`status`),
  CONSTRAINT `subscriptions_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `users` (`id`) ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 订单表
CREATE TABLE IF NOT EXISTS `orders` (
  `id` VARCHAR(36) NOT NULL,
  `userId` VARCHAR(36) NOT NULL,
  `type` ENUM('TOPUP', 'AUTH_BUY', 'SERVICE_FEE', 'ADMIN_ADJUST') NOT NULL DEFAULT 'AUTH_BUY',
  `planType` ENUM('TRIAL', 'MONTHLY', 'QUARTERLY', 'YEARLY') NULL,
  `planId` VARCHAR(36) NULL,
  `amount` DECIMAL(10, 2) NOT NULL,
  `balanceBefore` DECIMAL(10, 2) NULL,
  `balanceAfter` DECIMAL(10, 2) NULL,
  `paymentMethod` ENUM('ALIPAY', 'WECHAT') NULL,
  `status` ENUM('PENDING', 'PAID', 'FAILED', 'CANCELLED', 'EXPIRED') NOT NULL DEFAULT 'PENDING',
  `tradeNo` VARCHAR(100) NULL,
  `qrCode` TEXT NULL,
  `expireAt` DATETIME(3) NULL,
  `paidAt` DATETIME(3) NULL,
  `notes` TEXT NULL,
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updatedAt` DATETIME(3) NOT NULL,
  PRIMARY KEY (`id`),
  INDEX `orders_createdAt_idx` (`createdAt`),
  INDEX `orders_status_idx` (`status`),
  INDEX `orders_tradeNo_idx` (`tradeNo`),
  INDEX `orders_userId_idx` (`userId`),
  INDEX `orders_planId_idx` (`planId`),
  CONSTRAINT `orders_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `users` (`id`) ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT `orders_planId_fkey` FOREIGN KEY (`planId`) REFERENCES `subscription_plans` (`id`) ON DELETE SET NULL ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 管理员日志表
CREATE TABLE IF NOT EXISTS `admin_logs` (
  `id` VARCHAR(36) NOT NULL,
  `adminId` VARCHAR(36) NOT NULL,
  `targetUserId` VARCHAR(36) NOT NULL,
  `action` VARCHAR(50) NOT NULL,
  `details` JSON NOT NULL,
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (`id`),
  INDEX `admin_logs_adminId_idx` (`adminId`),
  INDEX `admin_logs_targetUserId_idx` (`targetUserId`),
  INDEX `admin_logs_createdAt_idx` (`createdAt`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 玩家档案表
CREATE TABLE IF NOT EXISTS `player_profiles` (
  `steamId` VARCHAR(36) NOT NULL,
  `name` VARCHAR(255) NULL,
  `avatar` VARCHAR(512) NULL,
  `playtime` INT NOT NULL DEFAULT 0,
  `vacBanned` TINYINT(1) NOT NULL DEFAULT 0,
  `gameBans` INT NOT NULL DEFAULT 0,
  `lastUpdated` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (`steamId`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 玩家统计表
CREATE TABLE IF NOT EXISTS `player_stats` (
  `id` VARCHAR(36) NOT NULL,
  `steamId` VARCHAR(36) NOT NULL,
  `statKey` VARCHAR(100) NOT NULL,
  `statValue` DOUBLE NOT NULL,
  `updatedAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (`id`),
  UNIQUE INDEX `player_stats_steamId_statKey_key` (`steamId`, `statKey`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 玩家统计快照表
CREATE TABLE IF NOT EXISTS `player_stats_snapshots` (
  `id` VARCHAR(36) NOT NULL,
  `steamId` VARCHAR(36) NOT NULL,
  `statKey` VARCHAR(100) NOT NULL,
  `statValue` DOUBLE NOT NULL,
  `snapshotDate` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (`id`),
  UNIQUE INDEX `player_stats_snapshots_steamId_statKey_snapshotDate_key` (`steamId`, `statKey`, `snapshotDate`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 扩展队友表
CREATE TABLE IF NOT EXISTS `extended_teammates` (
  `id` VARCHAR(36) NOT NULL,
  `userId` VARCHAR(36) NOT NULL,
  `serverId` VARCHAR(36) NOT NULL,
  `steamId` VARCHAR(36) NOT NULL,
  `addedAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `lastSeenAt` DATETIME(3) NULL,
  `notes` VARCHAR(255) NULL,
  PRIMARY KEY (`id`),
  UNIQUE INDEX `extended_teammates_userId_serverId_steamId_key` (`userId`, `serverId`, `steamId`),
  INDEX `extended_teammates_userId_idx` (`userId`),
  INDEX `extended_teammates_serverId_idx` (`serverId`),
  INDEX `extended_teammates_steamId_idx` (`steamId`),
  CONSTRAINT `extended_teammates_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `users` (`id`) ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT `extended_teammates_serverId_fkey` FOREIGN KEY (`serverId`) REFERENCES `servers` (`id`) ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 公共服务器信息表 (Battlemetrics 数据缓存)
CREATE TABLE IF NOT EXISTS `public_servers` (
  `battlemetricsId` VARCHAR(50) NOT NULL,
  `name` VARCHAR(255) NOT NULL,
  `ip` VARCHAR(45) NULL,
  `port` INT NULL,
  `address` VARCHAR(100) NULL,
  `status` VARCHAR(20) NOT NULL DEFAULT 'online',
  `players` INT NOT NULL DEFAULT 0,
  `maxPlayers` INT NOT NULL DEFAULT 0,
  `queuedPlayers` INT NOT NULL DEFAULT 0,
  `rank` INT NULL,
  `fps` INT NULL,
  `fpsAvg` INT NULL,
  `uptime` INT NULL,
  `entityCount` INT NULL,
  `map` VARCHAR(100) NULL,
  `mapSize` INT NULL,
  `seed` INT NULL,
  `wipeTime` DATETIME(3) NULL,
  `wipeCycle` VARCHAR(20) NULL,
  `nextWipe` DATETIME(3) NULL,
  `headerImage` TEXT NULL,
  `logoImage` TEXT NULL,
  `rustMapsUrl` VARCHAR(255) NULL,
  `rustMapsThumbnail` TEXT NULL,
  `country` VARCHAR(50) NULL,
  `official` TINYINT(1) NOT NULL DEFAULT 0,
  `modded` TINYINT(1) NOT NULL DEFAULT 0,
  `pve` TINYINT(1) NOT NULL DEFAULT 0,
  `description` TEXT NULL,
  `url` VARCHAR(255) NULL,
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updatedAt` DATETIME(3) NOT NULL,
  PRIMARY KEY (`battlemetricsId`),
  INDEX `public_servers_name_idx` (`name`),
  INDEX `public_servers_updatedAt_idx` (`updatedAt`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ============================================================
-- 玩家追踪系统
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

-- ============================================================
-- Distributed connection + budget guard tables
-- ============================================================
CREATE TABLE IF NOT EXISTS `gateway_nodes` (
  `id` VARCHAR(64) NOT NULL,
  `publicIp` VARCHAR(45) NOT NULL,
  `region` VARCHAR(64) NULL,
  `status` ENUM('ONLINE', 'OFFLINE', 'DRAINING') NOT NULL DEFAULT 'ONLINE',
  `totalCapacity` INT NOT NULL DEFAULT 120,
  `maxPerServer` INT NOT NULL DEFAULT 4,
  `metadata` JSON NULL,
  `lastHeartbeat` DATETIME(3) NULL,
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updatedAt` DATETIME(3) NOT NULL,
  PRIMARY KEY (`id`),
  UNIQUE INDEX `gateway_nodes_publicIp_key` (`publicIp`),
  INDEX `gateway_nodes_status_lastHeartbeat_idx` (`status`, `lastHeartbeat`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `connection_sessions` (
  `id` VARCHAR(36) NOT NULL,
  `userId` VARCHAR(36) NOT NULL,
  `serverId` VARCHAR(36) NOT NULL,
  `serverKey` VARCHAR(128) NOT NULL,
  `nodeId` VARCHAR(64) NULL,
  `status` ENUM('ASSIGNED', 'CONNECTING', 'CONNECTED', 'FAILED', 'CLOSED') NOT NULL DEFAULT 'ASSIGNED',
  `sourceQueueId` VARCHAR(36) NULL,
  `lastError` TEXT NULL,
  `connectedAt` DATETIME(3) NULL,
  `closedAt` DATETIME(3) NULL,
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updatedAt` DATETIME(3) NOT NULL,
  -- 活跃会话唯一键：仅在 ASSIGNED/CONNECTING/CONNECTED 时取值，终态(FAILED/CLOSED)为 NULL（NULL 不参与唯一约束）。
  -- 保证同一 (userId, serverId) 同时至多一条活跃会话，从 DB 层杜绝并发产生的重复会话/双连接。
  `activeKey` VARCHAR(80) GENERATED ALWAYS AS (
    CASE WHEN `status` IN ('ASSIGNED', 'CONNECTING', 'CONNECTED')
         THEN CONCAT(`userId`, ':', `serverId`)
         ELSE NULL END
  ) STORED,
  PRIMARY KEY (`id`),
  UNIQUE INDEX `connection_sessions_active_key` (`activeKey`),
  INDEX `connection_sessions_userId_status_idx` (`userId`, `status`),
  INDEX `connection_sessions_serverId_status_idx` (`serverId`, `status`),
  INDEX `connection_sessions_serverKey_status_idx` (`serverKey`, `status`),
  INDEX `connection_sessions_nodeId_status_idx` (`nodeId`, `status`),
  CONSTRAINT `connection_sessions_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `users` (`id`) ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT `connection_sessions_serverId_fkey` FOREIGN KEY (`serverId`) REFERENCES `servers` (`id`) ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT `connection_sessions_nodeId_fkey` FOREIGN KEY (`nodeId`) REFERENCES `gateway_nodes` (`id`) ON DELETE SET NULL ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `connection_queue` (
  `id` VARCHAR(36) NOT NULL,
  `userId` VARCHAR(36) NOT NULL,
  `serverId` VARCHAR(36) NOT NULL,
  `serverKey` VARCHAR(128) NOT NULL,
  `reason` VARCHAR(64) NOT NULL DEFAULT 'NO_CAPACITY',
  `status` ENUM('PENDING', 'ASSIGNED', 'CANCELLED', 'EXPIRED') NOT NULL DEFAULT 'PENDING',
  `priority` INT NOT NULL DEFAULT 100,
  `sessionId` VARCHAR(36) NULL,
  `expiresAt` DATETIME(3) NULL,
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updatedAt` DATETIME(3) NOT NULL,
  PRIMARY KEY (`id`),
  INDEX `connection_queue_status_createdAt_idx` (`status`, `createdAt`),
  INDEX `connection_queue_status_expiresAt_idx` (`status`, `expiresAt`),
  INDEX `connection_queue_serverKey_status_idx` (`serverKey`, `status`),
  INDEX `connection_queue_userId_status_idx` (`userId`, `status`),
  CONSTRAINT `connection_queue_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `users` (`id`) ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT `connection_queue_serverId_fkey` FOREIGN KEY (`serverId`) REFERENCES `servers` (`id`) ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT `connection_queue_sessionId_fkey` FOREIGN KEY (`sessionId`) REFERENCES `connection_sessions` (`id`) ON DELETE SET NULL ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `cost_ledger` (
  `id` BIGINT NOT NULL AUTO_INCREMENT,
  `billingMonth` CHAR(7) NOT NULL,
  `itemType` ENUM('NODE_HOUR', 'BANDWIDTH_GB', 'MANUAL_ADJUST', 'NODE_RESERVED') NOT NULL,
  `quantity` DECIMAL(12, 4) NOT NULL DEFAULT 0,
  `unitPrice` DECIMAL(12, 4) NOT NULL DEFAULT 0,
  `amount` DECIMAL(12, 4) NOT NULL DEFAULT 0,
  `currency` VARCHAR(10) NOT NULL DEFAULT 'CNY',
  `metadata` JSON NULL,
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (`id`),
  INDEX `cost_ledger_billingMonth_idx` (`billingMonth`),
  INDEX `cost_ledger_itemType_idx` (`itemType`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `session_commands` (
  `id` VARCHAR(36) NOT NULL,
  `sessionId` VARCHAR(36) NOT NULL,
  `userId` VARCHAR(36) NOT NULL,
  `serverId` VARCHAR(36) NOT NULL,
  `action` VARCHAR(100) NOT NULL,
  `payload` JSON NULL,
  `status` ENUM('PENDING', 'CLAIMED', 'DONE', 'FAILED', 'EXPIRED') NOT NULL DEFAULT 'PENDING',
  `result` JSON NULL,
  `error` TEXT NULL,
  `claimedAt` DATETIME(3) NULL,
  `expiresAt` DATETIME(3) NULL,
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updatedAt` DATETIME(3) NOT NULL,
  PRIMARY KEY (`id`),
  INDEX `session_commands_sessionId_status_idx` (`sessionId`, `status`),
  INDEX `session_commands_userId_status_idx` (`userId`, `status`),
  INDEX `session_commands_serverId_status_idx` (`serverId`, `status`),
  INDEX `session_commands_status_expiresAt_idx` (`status`, `expiresAt`),
  INDEX `session_commands_status_createdAt_idx` (`status`, `createdAt`),
  INDEX `session_commands_session_action_status_createdAt_idx` (`sessionId`, `action`, `status`, `createdAt`),
  CONSTRAINT `session_commands_sessionId_fkey` FOREIGN KEY (`sessionId`) REFERENCES `connection_sessions` (`id`) ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT `session_commands_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `users` (`id`) ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT `session_commands_serverId_fkey` FOREIGN KEY (`serverId`) REFERENCES `servers` (`id`) ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
