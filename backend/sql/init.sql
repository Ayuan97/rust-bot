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
  `eventType` ENUM('PLAYER_DEATH', 'PLAYER_ONLINE', 'PLAYER_OFFLINE', 'PLAYER_AFK', 'PLAYER_RETURN', 'CARGO_SPAWN', 'CARGO_LEAVE', 'HELI_SPAWN', 'HELI_DOWN', 'OIL_RIG_TRIGGERED', 'OIL_RIG_UNLOCKED', 'CHINOOK_SPAWN', 'ALARM_TRIGGERED', 'ENTITY_CHANGED', 'DEVICE_OFFLINE', 'SERVER_CONNECTED', 'SERVER_DISCONNECTED', 'FCM_CONNECTED', 'FCM_DISCONNECTED') NOT NULL,
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

-- 代理配置表
CREATE TABLE IF NOT EXISTS `proxy_config` (
  `id` INT NOT NULL DEFAULT 1,
  `subscriptionUrl` TEXT NULL,
  `selectedNode` VARCHAR(255) NULL,
  `proxyPort` INT NOT NULL DEFAULT 10808,
  `autoStart` TINYINT(1) NOT NULL DEFAULT 0,
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updatedAt` DATETIME(3) NOT NULL,
  PRIMARY KEY (`id`)
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

-- 事件刷新模式表
CREATE TABLE IF NOT EXISTS `event_spawn_patterns` (
  `id` VARCHAR(36) NOT NULL,
  `serverAddress` VARCHAR(60) NOT NULL,
  `eventType` ENUM('CARGO_SPAWN', 'HELI_SPAWN', 'SMALL_OIL_COOLDOWN', 'LARGE_OIL_COOLDOWN') NOT NULL,
  `sampleCount` INT NOT NULL DEFAULT 0,
  `avgInterval` DOUBLE NULL,
  `stdDeviation` DOUBLE NULL,
  `minInterval` DOUBLE NULL,
  `maxInterval` DOUBLE NULL,
  `recentIntervals` JSON NULL,
  `lastEventTime` DATETIME(3) NULL,
  `lastUpdated` DATETIME(3) NOT NULL,
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (`id`),
  UNIQUE INDEX `event_spawn_patterns_serverAddress_eventType_key` (`serverAddress`, `eventType`),
  INDEX `event_spawn_patterns_serverAddress_idx` (`serverAddress`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 事件预测表
CREATE TABLE IF NOT EXISTS `event_predictions` (
  `id` VARCHAR(36) NOT NULL,
  `serverAddress` VARCHAR(60) NOT NULL,
  `serverId` VARCHAR(36) NOT NULL,
  `userId` VARCHAR(36) NOT NULL,
  `eventType` ENUM('CARGO_SPAWN', 'HELI_SPAWN', 'SMALL_OIL_COOLDOWN', 'LARGE_OIL_COOLDOWN') NOT NULL,
  `predictedTime` DATETIME(3) NOT NULL,
  `confidenceLevel` DOUBLE NOT NULL DEFAULT 0,
  `windowStart` DATETIME(3) NOT NULL,
  `windowEnd` DATETIME(3) NOT NULL,
  `status` ENUM('PENDING', 'NOTIFIED', 'OCCURRED', 'MISSED', 'CANCELLED') NOT NULL DEFAULT 'PENDING',
  `notifiedAt` DATETIME(3) NULL,
  `actualTime` DATETIME(3) NULL,
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updatedAt` DATETIME(3) NOT NULL,
  PRIMARY KEY (`id`),
  INDEX `event_predictions_serverAddress_status_idx` (`serverAddress`, `status`),
  INDEX `event_predictions_serverId_status_idx` (`serverId`, `status`),
  INDEX `event_predictions_predictedTime_idx` (`predictedTime`),
  INDEX `event_predictions_userId_idx` (`userId`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
