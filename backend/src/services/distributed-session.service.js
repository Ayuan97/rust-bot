import { EventEmitter } from 'events';
import { v4 as uuidv4 } from 'uuid';
import db from '../lib/db.js';
import logger from '../utils/logger.js';

const SESSION_STATUS_SQL = `'ASSIGNED','CONNECTING','CONNECTED'`;
const SESSION_CONNECTED_STATUS_SQL = `'CONNECTED'`;
const COMMAND_PENDING_STATUS_SQL = `'PENDING','CLAIMED'`;
const NODE_EVENT_ALLOWLIST = new Set([
  'rust:message',
  'team:message',
  'team:changed',
  'entity:changed',
  'clan:changed',
  'clan:message',
  'camera:subscribing',
  'camera:subscribed',
  'camera:unsubscribed',
  'camera:render',
  'camera:rays',
]);
const DEADLOCK_RETRY_MAX_ATTEMPTS = 3;
const DEADLOCK_RETRY_BASE_DELAY_MS = 120;

function isDeadlockError(error) {
  if (!error) return false;
  if (error.code === 'ER_LOCK_DEADLOCK') return true;
  return /deadlock found when trying to get lock/i.test(error.message || '');
}

function delay(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function stringifyJson(value) {
  return JSON.stringify(value, (_, v) => (typeof v === 'bigint' ? v.toString() : v));
}

function parseJson(value, fallback = null) {
  if (value === null || value === undefined) return fallback;
  if (typeof value === 'object') return value;
  try {
    return JSON.parse(value);
  } catch {
    return fallback;
  }
}

class DistributedSessionService extends EventEmitter {
  constructor() {
    super();
    this.defaultNodeCapacity = Number(process.env.DISTRIBUTED_NODE_CAPACITY || 120);
    this.defaultMaxPerServer = Number(process.env.DISTRIBUTED_MAX_PER_SERVER || 4);
    this.gatewayHeartbeatTtlSec = Number(process.env.DISTRIBUTED_GATEWAY_HEARTBEAT_TTL_SEC || 30);
    this.failoverGraceSec = Number(process.env.DISTRIBUTED_FAILOVER_GRACE_SEC || 20);
    this.failoverBatchSize = Math.max(20, Number(process.env.DISTRIBUTED_FAILOVER_BATCH_SIZE || 200));
    this.queueExpireMinutes = Number(process.env.DISTRIBUTED_QUEUE_EXPIRE_MINUTES || 10);
    this.commandPollIntervalMs = Number(process.env.DISTRIBUTED_COMMAND_POLL_MS || 250);
    this.commandTimeoutMs = Number(process.env.DISTRIBUTED_COMMAND_TIMEOUT_MS || 25000);
    this.backgroundIntervalMs = Math.max(2000, Number(process.env.DISTRIBUTED_BACKGROUND_INTERVAL_MS || 10000));
    this.expireCleanupBatchSize = Math.min(
      2000,
      Math.max(50, Number(process.env.DISTRIBUTED_EXPIRE_CLEANUP_BATCH_SIZE || 300))
    );
    this.expireCleanupMaxBatches = Math.min(
      20,
      Math.max(1, Number(process.env.DISTRIBUTED_EXPIRE_CLEANUP_MAX_BATCHES || 8))
    );
    this.commandReuseWindowMs = Math.min(
      5000,
      Math.max(0, Number(process.env.DISTRIBUTED_COMMAND_REUSE_WINDOW_MS || 1500))
    );
    this.commandRetentionMs = Math.max(
      60 * 1000,
      Number(process.env.DISTRIBUTED_COMMAND_RETENTION_MS || 60 * 60 * 1000)
    );
    this.backgroundTimer = null;
    this.backgroundTickRunning = false;
    this.autoscaler = null;
  }

  isDistributedMode() {
    return true;
  }

  setAutoscaler(autoscaler) {
    this.autoscaler = autoscaler;
  }

  start() {
    if (this.backgroundTimer) {
      return;
    }
    this.backgroundTimer = setInterval(() => {
      this.runBackgroundTick().catch((error) => {
        logger.error('[distributed-session] background tick failed:', error.message);
      });
    }, this.backgroundIntervalMs);
    this.backgroundTimer.unref?.();

    this.runBackgroundTick().catch((error) => {
      logger.error('[distributed-session] initial background tick failed:', error.message);
    });
  }

  shutdown() {
    if (this.backgroundTimer) {
      clearInterval(this.backgroundTimer);
      this.backgroundTimer = null;
    }
    this.backgroundTickRunning = false;
  }

  async runBackgroundTick() {
    if (this.backgroundTickRunning) {
      return;
    }

    this.backgroundTickRunning = true;
    try {
      try {
        await this.cleanupExpiredRecords();
      } catch (error) {
        logger.error('[distributed-session] cleanup expired records failed:', error.message);
      }

      try {
        await this.tryAssignQueuedSessions();
      } catch (error) {
        logger.error('[distributed-session] assign queued sessions failed:', error.message);
      }

      try {
        await this.reconcileOfflineNodesAndFailoverSessions();
      } catch (error) {
        logger.error('[distributed-session] failover reconcile failed:', error.message);
      }
    } finally {
      this.backgroundTickRunning = false;
    }
  }

  async cleanupExpiredRecords() {
    const queueLimit = this.expireCleanupBatchSize;
    const commandLimit = this.expireCleanupBatchSize;

    for (let i = 0; i < this.expireCleanupMaxBatches; i += 1) {
      const [queueResult] = await this.queryWithDeadlockRetry(
        `UPDATE connection_queue
         SET status = 'EXPIRED', updatedAt = NOW()
         WHERE status = 'PENDING'
           AND expiresAt IS NOT NULL
           AND expiresAt < NOW()
         ORDER BY expiresAt ASC, id ASC
         LIMIT ${queueLimit}`
      );
      if ((queueResult?.affectedRows || 0) < queueLimit) {
        break;
      }
    }

    for (let i = 0; i < this.expireCleanupMaxBatches; i += 1) {
      const [commandResult] = await this.queryWithDeadlockRetry(
        `UPDATE session_commands
         SET status = 'EXPIRED', error = ?, updatedAt = NOW()
         WHERE status IN (${COMMAND_PENDING_STATUS_SQL})
           AND expiresAt IS NOT NULL
           AND expiresAt < NOW()
         ORDER BY expiresAt ASC, id ASC
         LIMIT ${commandLimit}`,
        ['command timeout']
      );
      if ((commandResult?.affectedRows || 0) < commandLimit) {
        break;
      }
    }

    const retentionCutoff = new Date(Date.now() - this.commandRetentionMs);
    for (let i = 0; i < this.expireCleanupMaxBatches; i += 1) {
      const [deleteResult] = await this.queryWithDeadlockRetry(
        `DELETE FROM session_commands
         WHERE status IN ('DONE', 'FAILED', 'EXPIRED')
           AND updatedAt < ?
         ORDER BY updatedAt ASC, id ASC
         LIMIT ${commandLimit}`,
        [retentionCutoff]
      );
      if ((deleteResult?.affectedRows || 0) < commandLimit) {
        break;
      }
    }
  }

  async queryWithDeadlockRetry(sql, params = []) {
    let attempt = 0;

    while (true) {
      try {
        return await db.query(sql, params);
      } catch (error) {
        attempt += 1;
        if (!isDeadlockError(error) || attempt >= DEADLOCK_RETRY_MAX_ATTEMPTS) {
          throw error;
        }
        await delay(DEADLOCK_RETRY_BASE_DELAY_MS * attempt);
      }
    }
  }

  async findReusablePendingCommand({ sessionId, action, payload }) {
    if (this.commandReuseWindowMs <= 0) {
      return null;
    }

    const notBefore = new Date(Date.now() - this.commandReuseWindowMs);
    const [rows] = await db.query(
      `SELECT id, payload
       FROM session_commands
       WHERE sessionId = ?
         AND action = ?
         AND status IN (${COMMAND_PENDING_STATUS_SQL})
         AND createdAt >= ?
       ORDER BY createdAt DESC, id DESC
       LIMIT 5`,
      [sessionId, action, notBefore]
    );

    if (rows.length === 0) {
      return null;
    }

    const payloadStr = stringifyJson(payload);
    for (const row of rows) {
      if (stringifyJson(parseJson(row.payload, {})) === payloadStr) {
        return row.id;
      }
    }
    return null;
  }

  async getServerOwnedByUser(userId, serverId) {
    const [rows] = await db.query(
      `SELECT id, userId, ip, port, playerId, playerToken
       FROM servers
       WHERE id = ? AND userId = ?`,
      [serverId, userId]
    );
    return rows[0] || null;
  }

  async findActiveSession(userId, serverId) {
    const [rows] = await db.query(
      `SELECT cs.id, cs.userId, cs.serverId, cs.nodeId, cs.serverKey, cs.status
       FROM connection_sessions cs
       LEFT JOIN gateway_nodes gn ON gn.id = cs.nodeId
       WHERE cs.userId = ?
         AND cs.serverId = ?
         AND cs.status IN (${SESSION_STATUS_SQL})
         AND (
           cs.nodeId IS NULL
           OR (
             gn.status = 'ONLINE'
             AND gn.lastHeartbeat >= DATE_SUB(NOW(), INTERVAL ? SECOND)
           )
         )
       ORDER BY cs.createdAt DESC
       LIMIT 1`,
      [userId, serverId, this.gatewayHeartbeatTtlSec]
    );
    return rows[0] || null;
  }

  async reconcileOfflineNodesAndFailoverSessions() {
    const staleSec = this.gatewayHeartbeatTtlSec + this.failoverGraceSec;
    const [staleNodeRows] = await db.query(
      `SELECT id
       FROM gateway_nodes
       WHERE status = 'ONLINE'
         AND lastHeartbeat IS NOT NULL
         AND lastHeartbeat < DATE_SUB(NOW(), INTERVAL ? SECOND)
       LIMIT ?`,
      [staleSec, this.failoverBatchSize]
    );

    if (staleNodeRows.length === 0) {
      return {
        staleNodeCount: 0,
        failedSessionCount: 0,
        reassignedCount: 0,
      };
    }

    const staleNodeIds = staleNodeRows.map((row) => row.id);
    const staleNodePlaceholders = staleNodeIds.map(() => '?').join(',');

    await db.query(
      `UPDATE gateway_nodes
       SET status = 'OFFLINE', updatedAt = NOW()
       WHERE id IN (${staleNodePlaceholders}) AND status = 'ONLINE'`,
      staleNodeIds
    );

    const [sessionRows] = await db.query(
      `SELECT id, userId, serverId, serverKey, nodeId
       FROM connection_sessions
       WHERE nodeId IN (${staleNodePlaceholders})
         AND status IN (${SESSION_STATUS_SQL})
       ORDER BY createdAt ASC`,
      staleNodeIds
    );

    if (sessionRows.length === 0) {
      logger.warn(
        `[distributed-session] stale gateway detected, marked OFFLINE: nodes=${staleNodeIds.length}`
      );
      return {
        staleNodeCount: staleNodeIds.length,
        failedSessionCount: 0,
        reassignedCount: 0,
      };
    }

    const sessionIds = sessionRows.map((row) => row.id);
    const sessionPlaceholders = sessionIds.map(() => '?').join(',');

    await db.query(
      `UPDATE connection_sessions
       SET status = 'FAILED', lastError = ?, closedAt = NOW(), updatedAt = NOW()
       WHERE id IN (${sessionPlaceholders})
         AND status IN (${SESSION_STATUS_SQL})`,
      ['gateway heartbeat timeout', ...sessionIds]
    );

    await db.query(
      `UPDATE session_commands
       SET status = 'FAILED', error = ?, updatedAt = NOW()
       WHERE sessionId IN (${sessionPlaceholders})
         AND status IN (${COMMAND_PENDING_STATUS_SQL})`,
      ['node unavailable', ...sessionIds]
    );

    for (const session of sessionRows) {
      this.emit('session:failed', {
        userId: session.userId,
        serverId: session.serverId,
        sessionId: session.id,
        nodeId: session.nodeId,
        error: 'gateway heartbeat timeout',
      });
    }

    let reassignedCount = 0;
    const processedPairs = new Set();
    for (const session of sessionRows) {
      const pairKey = `${session.userId}:${session.serverId}`;
      if (processedPairs.has(pairKey)) {
        continue;
      }
      processedPairs.add(pairKey);

      try {
        await this.openSession({
          userId: session.userId,
          serverId: session.serverId,
          reason: 'node_failover',
        });
        reassignedCount += 1;
      } catch (error) {
        logger.warn(
          `[distributed-session] session failover failed user=${session.userId} server=${session.serverId}: ${error.message}`
        );
      }
    }

    logger.warn(
      `[distributed-session] failover completed: staleNodes=${staleNodeIds.length}, failedSessions=${sessionRows.length}, reassigned=${reassignedCount}`
    );

    return {
      staleNodeCount: staleNodeIds.length,
      failedSessionCount: sessionRows.length,
      reassignedCount,
    };
  }

  async chooseNode(serverKey) {
    const [rows] = await db.query(
      `SELECT
         gn.id,
         gn.publicIp,
         gn.region,
         gn.totalCapacity,
         gn.maxPerServer,
         (
           SELECT COUNT(*)
           FROM connection_sessions cs
           WHERE cs.nodeId = gn.id
             AND cs.status IN (${SESSION_STATUS_SQL})
         ) AS totalSessions,
         (
           SELECT COUNT(*)
           FROM connection_sessions cs
           WHERE cs.nodeId = gn.id
             AND cs.serverKey = ?
             AND cs.status IN (${SESSION_STATUS_SQL})
         ) AS serverSessions
       FROM gateway_nodes gn
       WHERE gn.status = 'ONLINE'
         AND gn.lastHeartbeat >= DATE_SUB(NOW(), INTERVAL ? SECOND)
       ORDER BY totalSessions ASC, gn.updatedAt ASC`,
      [serverKey, this.gatewayHeartbeatTtlSec]
    );

    for (const node of rows) {
      const totalCapacity = Number(node.totalCapacity || this.defaultNodeCapacity);
      const maxPerServer = Number(node.maxPerServer || this.defaultMaxPerServer);
      const totalSessions = Number(node.totalSessions || 0);
      const serverSessions = Number(node.serverSessions || 0);
      if (totalSessions < totalCapacity && serverSessions < maxPerServer) {
        return {
          id: node.id,
          publicIp: node.publicIp,
          region: node.region,
          totalCapacity,
          maxPerServer,
          totalSessions,
          serverSessions,
        };
      }
    }
    return null;
  }

  async enqueueConnection(userId, serverId, serverKey, reason = 'NO_CAPACITY') {
    const [existingRows] = await db.query(
      `SELECT id, createdAt
       FROM connection_queue
       WHERE userId = ? AND serverId = ? AND status = 'PENDING'
       ORDER BY createdAt ASC
       LIMIT 1`,
      [userId, serverId]
    );

    let queueId = existingRows[0]?.id;
    let queueCreatedAt = existingRows[0]?.createdAt;

    if (!queueId) {
      queueId = uuidv4();
      const expiresAt = new Date(Date.now() + this.queueExpireMinutes * 60 * 1000);
      await db.query(
        `INSERT INTO connection_queue (
           id, userId, serverId, serverKey, reason, status, priority, expiresAt, createdAt, updatedAt
         ) VALUES (?, ?, ?, ?, ?, 'PENDING', 100, ?, NOW(), NOW())`,
        [queueId, userId, serverId, serverKey, reason, expiresAt]
      );
      queueCreatedAt = new Date();
    }

    const [positionRows] = await db.query(
      `SELECT COUNT(*) AS position
       FROM connection_queue
       WHERE serverKey = ?
         AND status = 'PENDING'
         AND createdAt <= ?`,
      [serverKey, queueCreatedAt]
    );

    return {
      queueId,
      queuePosition: Number(positionRows[0]?.position || 1),
      reason,
    };
  }

  async createAssignedSession({ userId, serverId, serverKey, nodeId, sourceQueueId = null }) {
    const sessionId = uuidv4();
    await db.query(
      `INSERT INTO connection_sessions (
         id, userId, serverId, serverKey, nodeId, status, sourceQueueId, createdAt, updatedAt
       ) VALUES (?, ?, ?, ?, ?, 'ASSIGNED', ?, NOW(), NOW())`,
      [sessionId, userId, serverId, serverKey, nodeId, sourceQueueId]
    );
    return sessionId;
  }

  async openSession({ userId, serverId, reason = 'manual_open' }) {
    const server = await this.getServerOwnedByUser(userId, serverId);
    if (!server) {
      throw new Error('server not found or no permission');
    }
    const serverKey = `${server.ip}:${server.port}`;

    const existingSession = await this.findActiveSession(userId, serverId);
    if (existingSession) {
      return {
        status: existingSession.status === 'CONNECTED' ? 'connected' : 'assigned',
        existing: true,
        sessionId: existingSession.id,
        nodeId: existingSession.nodeId,
        serverKey,
      };
    }

    const node = await this.chooseNode(serverKey);
    if (!node) {
      const queued = await this.enqueueConnection(userId, serverId, serverKey, 'NO_CAPACITY');
      const payload = {
        userId,
        serverId,
        serverKey,
        reason,
        ...queued,
      };
      this.emit('session:queued', payload);
      await this.autoscaler?.notifyPressure('NO_CAPACITY');
      return { status: 'queued', ...payload };
    }

    const sessionId = await this.createAssignedSession({
      userId,
      serverId,
      serverKey,
      nodeId: node.id,
    });
    const payload = {
      status: 'assigned',
      sessionId,
      userId,
      serverId,
      serverKey,
      nodeId: node.id,
      nodePublicIp: node.publicIp,
      nodeRegion: node.region,
      reason,
    };
    this.emit('session:assigned', payload);
    return payload;
  }

  async closeSession({ userId, serverId = null, sessionId = null, reason = 'manual_close' }) {
    if (!sessionId && !serverId) {
      throw new Error('sessionId or serverId is required');
    }

    const [rows] = await db.query(
      `SELECT id, userId, serverId, serverKey, nodeId, status
       FROM connection_sessions
       WHERE userId = ?
         AND (id = ? OR (? IS NULL AND serverId = ?))
         AND status IN (${SESSION_STATUS_SQL})
       ORDER BY createdAt DESC
       LIMIT 1`,
      [userId, sessionId, sessionId, serverId]
    );

    const session = rows[0];
    if (!session) {
      const [queueRows] = await db.query(
        `UPDATE connection_queue
         SET status = 'CANCELLED', updatedAt = NOW()
         WHERE userId = ?
           AND (? IS NOT NULL AND serverId = ?)
           AND status = 'PENDING'`,
        [userId, serverId, serverId]
      );
      return { closed: false, cancelledQueue: Number(queueRows?.affectedRows || 0) };
    }

    await db.query(
      `UPDATE connection_sessions
       SET status = 'CLOSED', lastError = ?, closedAt = NOW(), updatedAt = NOW()
       WHERE id = ?`,
      [reason, session.id]
    );

    await db.query(
      `UPDATE session_commands
       SET status = 'FAILED', error = ?, updatedAt = NOW()
       WHERE sessionId = ? AND status IN (${COMMAND_PENDING_STATUS_SQL})`,
      ['session closed', session.id]
    );

    this.emit('session:disconnected', {
      userId: session.userId,
      serverId: session.serverId,
      sessionId: session.id,
      nodeId: session.nodeId,
      reason,
    });

    await this.tryAssignQueuedSessions(session.serverKey);
    return { closed: true, sessionId: session.id };
  }

  async getUserActiveSessions(userId) {
    const [rows] = await db.query(
      `SELECT id, userId, serverId, nodeId, status
       FROM connection_sessions
       WHERE userId = ? AND status IN (${SESSION_STATUS_SQL})
       ORDER BY createdAt DESC`,
      [userId]
    );
    return rows;
  }

  async publishNodeEvent({ nodeId, sessionId, eventType, payload = {} }) {
    if (!nodeId || !sessionId || !eventType) {
      throw new Error('nodeId, sessionId and eventType are required');
    }
    if (!NODE_EVENT_ALLOWLIST.has(eventType)) {
      throw new Error(`eventType not allowed: ${eventType}`);
    }

    const [rows] = await db.query(
      `SELECT id, userId, serverId, nodeId, status
       FROM connection_sessions
       WHERE id = ? AND nodeId = ?
       LIMIT 1`,
      [sessionId, nodeId]
    );
    const session = rows[0];
    if (!session) {
      throw new Error('session not found for node');
    }
    if (!['ASSIGNED', 'CONNECTING', 'CONNECTED'].includes(session.status)) {
      return { accepted: false, reason: 'SESSION_NOT_ACTIVE' };
    }

    const normalizedPayload = payload && typeof payload === 'object' ? payload : { value: payload };

    this.emit(eventType, {
      ...normalizedPayload,
      userId: session.userId,
      serverId: session.serverId,
      sessionId: session.id,
      nodeId: session.nodeId,
    });

    return { accepted: true };
  }

  async getQueue(userId = null) {
    const params = [];
    const userWhere = userId ? 'AND q.userId = ?' : '';
    if (userId) params.push(userId);
    const [rows] = await db.query(
      `SELECT q.id, q.userId, q.serverId, q.serverKey, q.reason, q.status, q.createdAt, q.updatedAt,
              s.name AS serverName
       FROM connection_queue q
       INNER JOIN servers s ON q.serverId = s.id
       WHERE q.status = 'PENDING' ${userWhere}
       ORDER BY q.createdAt ASC`,
      params
    );

    return rows.map((row, index) => ({
      id: row.id,
      userId: row.userId,
      serverId: row.serverId,
      serverName: row.serverName,
      serverKey: row.serverKey,
      reason: row.reason,
      status: row.status,
      queuePosition: index + 1,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
    }));
  }

  async tryAssignQueuedSessions(targetServerKey = null) {
    const params = [];
    let extraWhere = '';
    if (targetServerKey) {
      extraWhere = 'AND serverKey = ?';
      params.push(targetServerKey);
    }

    const [queuedRows] = await db.query(
      `SELECT id, userId, serverId, serverKey
       FROM connection_queue
       WHERE status = 'PENDING' ${extraWhere}
       ORDER BY createdAt ASC
       LIMIT 50`,
      params
    );

    let assignedCount = 0;
    for (const queued of queuedRows) {
      const activeSession = await this.findActiveSession(queued.userId, queued.serverId);
      if (activeSession) {
        await db.query(
          `UPDATE connection_queue
           SET status = 'ASSIGNED', sessionId = ?, updatedAt = NOW()
           WHERE id = ?`,
          [activeSession.id, queued.id]
        );
        continue;
      }

      const node = await this.chooseNode(queued.serverKey);
      if (!node) {
        continue;
      }

      const sessionId = await this.createAssignedSession({
        userId: queued.userId,
        serverId: queued.serverId,
        serverKey: queued.serverKey,
        nodeId: node.id,
        sourceQueueId: queued.id,
      });

      await db.query(
        `UPDATE connection_queue
         SET status = 'ASSIGNED', sessionId = ?, updatedAt = NOW()
         WHERE id = ?`,
        [sessionId, queued.id]
      );

      assignedCount += 1;
      this.emit('session:assigned', {
        status: 'assigned',
        sessionId,
        userId: queued.userId,
        serverId: queued.serverId,
        serverKey: queued.serverKey,
        nodeId: node.id,
        fromQueue: true,
      });
    }

    return assignedCount;
  }

  async registerGatewayNode({
    nodeId,
    publicIp,
    region = null,
    totalCapacity = this.defaultNodeCapacity,
    maxPerServer = this.defaultMaxPerServer,
    metadata = null,
  }) {
    if (!nodeId || !publicIp) {
      throw new Error('nodeId and publicIp are required');
    }

    await db.query(
      `INSERT INTO gateway_nodes (
         id, publicIp, region, status, totalCapacity, maxPerServer, metadata, lastHeartbeat, createdAt, updatedAt
       ) VALUES (?, ?, ?, 'ONLINE', ?, ?, ?, NOW(), NOW(), NOW())
       ON DUPLICATE KEY UPDATE
         publicIp = VALUES(publicIp),
         region = VALUES(region),
         status = 'ONLINE',
         totalCapacity = VALUES(totalCapacity),
         maxPerServer = VALUES(maxPerServer),
         metadata = VALUES(metadata),
         lastHeartbeat = NOW(),
         updatedAt = NOW()`,
      [
        nodeId,
        publicIp,
        region,
        totalCapacity,
        maxPerServer,
        metadata ? stringifyJson(metadata) : null,
      ]
    );

    await this.tryAssignQueuedSessions();
    return { nodeId, publicIp, region, totalCapacity, maxPerServer };
  }

  async heartbeatGatewayNode({
    nodeId,
    publicIp = null,
    region = null,
    status = 'ONLINE',
    metadata = null,
  }) {
    if (!nodeId) {
      throw new Error('nodeId is required');
    }

    await db.query(
      `UPDATE gateway_nodes
       SET
         publicIp = COALESCE(?, publicIp),
         region = COALESCE(?, region),
         status = ?,
         metadata = COALESCE(?, metadata),
         lastHeartbeat = NOW(),
         updatedAt = NOW()
       WHERE id = ?`,
      [publicIp, region, status, metadata ? stringifyJson(metadata) : null, nodeId]
    );
    await this.tryAssignQueuedSessions();
  }

  async getAssignmentsForNode(nodeId) {
    const [rows] = await db.query(
      `SELECT
         cs.id AS sessionId,
         cs.userId,
         cs.serverId,
         cs.serverKey,
         cs.status,
         s.ip,
         s.port,
         s.playerId,
         s.playerToken
       FROM connection_sessions cs
       INNER JOIN servers s ON cs.serverId = s.id
       WHERE cs.nodeId = ?
         AND cs.status IN (${SESSION_STATUS_SQL})
       ORDER BY cs.createdAt ASC`,
      [nodeId]
    );
    return rows;
  }

  async updateSessionState({
    nodeId,
    sessionId,
    status,
    error = null,
  }) {
    const allowed = new Set([
      'ASSIGNED',
      'CONNECTING',
      'CONNECTED',
      'FAILED',
      'CLOSED',
    ]);
    if (!allowed.has(status)) {
      throw new Error(`invalid status: ${status}`);
    }

    const [rows] = await db.query(
      `SELECT id, userId, serverId, serverKey, nodeId, status
       FROM connection_sessions
       WHERE id = ?`,
      [sessionId]
    );
    const session = rows[0];
    if (!session) {
      throw new Error('session not found');
    }
    if (nodeId && session.nodeId !== nodeId) {
      throw new Error('session does not belong to node');
    }
    if (session.status === 'FAILED' || session.status === 'CLOSED') {
      return {
        sessionId,
        status: session.status,
        ignored: true,
        reason: 'SESSION_TERMINAL',
      };
    }

    const connectedAt = status === 'CONNECTED' ? 'NOW()' : 'connectedAt';
    const closedAt = status === 'CLOSED' ? 'NOW()' : 'closedAt';

    await db.query(
      `UPDATE connection_sessions
       SET status = ?, lastError = ?, connectedAt = ${connectedAt}, closedAt = ${closedAt}, updatedAt = NOW()
       WHERE id = ?`,
      [status, error, sessionId]
    );

    if (status === 'CONNECTED') {
      this.emit('session:connected', {
        userId: session.userId,
        serverId: session.serverId,
        sessionId,
        nodeId: session.nodeId,
      });
    } else if (status === 'FAILED') {
      this.emit('session:failed', {
        userId: session.userId,
        serverId: session.serverId,
        sessionId,
        nodeId: session.nodeId,
        error,
      });
      await this.tryAssignQueuedSessions(session.serverKey);
    } else if (status === 'CLOSED') {
      this.emit('session:disconnected', {
        userId: session.userId,
        serverId: session.serverId,
        sessionId,
        nodeId: session.nodeId,
      });
      await this.tryAssignQueuedSessions(session.serverKey);
    } else if (status === 'CONNECTING') {
      this.emit('session:connecting', {
        userId: session.userId,
        serverId: session.serverId,
        sessionId,
        nodeId: session.nodeId,
      });
    }

    return { sessionId, status };
  }

  async dispatchCommand({
    userId,
    serverId,
    action,
    payload = {},
    timeoutMs = this.commandTimeoutMs,
  }) {
    const [connectedRows] = await db.query(
      `SELECT cs.id, cs.status
       FROM connection_sessions cs
       LEFT JOIN gateway_nodes gn ON gn.id = cs.nodeId
       WHERE cs.userId = ?
         AND cs.serverId = ?
         AND cs.status IN (${SESSION_CONNECTED_STATUS_SQL})
         AND (
           cs.nodeId IS NULL
           OR (
             gn.status = 'ONLINE'
             AND gn.lastHeartbeat >= DATE_SUB(NOW(), INTERVAL ? SECOND)
           )
         )
       ORDER BY cs.createdAt DESC
       LIMIT 1`,
      [userId, serverId, this.gatewayHeartbeatTtlSec]
    );
    const session = connectedRows[0];

    if (!session) {
      const [transitionalRows] = await db.query(
        `SELECT cs.id
         FROM connection_sessions cs
         LEFT JOIN gateway_nodes gn ON gn.id = cs.nodeId
         WHERE cs.userId = ?
           AND cs.serverId = ?
           AND cs.status IN ('ASSIGNED','CONNECTING')
           AND (
             cs.nodeId IS NULL
             OR (
               gn.status = 'ONLINE'
               AND gn.lastHeartbeat >= DATE_SUB(NOW(), INTERVAL ? SECOND)
             )
           )
         ORDER BY cs.createdAt DESC
         LIMIT 1`,
        [userId, serverId, this.gatewayHeartbeatTtlSec]
      );

      if (transitionalRows.length > 0) {
        return { status: 'queued', reason: 'SESSION_CONNECTING' };
      }

      const [queueRows] = await db.query(
        `SELECT id FROM connection_queue WHERE userId = ? AND serverId = ? AND status = 'PENDING' LIMIT 1`,
        [userId, serverId]
      );
      if (queueRows.length > 0) {
        return { status: 'queued', reason: 'SESSION_QUEUED' };
      }
      return { status: 'missing_session', reason: 'SESSION_NOT_FOUND' };
    }

    const reusableCommandId = await this.findReusablePendingCommand({
      sessionId: session.id,
      action,
      payload,
    });
    if (reusableCommandId) {
      return this.waitForCommandResult(reusableCommandId, timeoutMs);
    }

    const commandId = uuidv4();
    const expiresAt = new Date(Date.now() + timeoutMs);
    const payloadJson = stringifyJson(payload);
    await db.query(
      `INSERT INTO session_commands (
         id, sessionId, userId, serverId, action, payload, status, expiresAt, createdAt, updatedAt
       ) VALUES (?, ?, ?, ?, ?, ?, 'PENDING', ?, NOW(), NOW())`,
      [commandId, session.id, userId, serverId, action, payloadJson, expiresAt]
    );

    return this.waitForCommandResult(commandId, timeoutMs);
  }

  async waitForCommandResult(commandId, timeoutMs) {
    const startedAt = Date.now();
    while (Date.now() - startedAt < timeoutMs) {
      const [rows] = await db.query(
        `SELECT status, result, error
         FROM session_commands
         WHERE id = ?`,
        [commandId]
      );
      const row = rows[0];
      if (!row) {
        return { status: 'failed', error: 'command not found' };
      }

      if (row.status === 'DONE') {
        return { status: 'success', result: parseJson(row.result, row.result) };
      }
      if (row.status === 'FAILED' || row.status === 'EXPIRED') {
        return { status: 'failed', error: row.error || 'command failed' };
      }

      await new Promise((resolve) => setTimeout(resolve, this.commandPollIntervalMs));
    }

    await db.query(
      `UPDATE session_commands
       SET status = 'EXPIRED', error = ?, updatedAt = NOW()
       WHERE id = ? AND status IN (${COMMAND_PENDING_STATUS_SQL})`,
      ['command timeout', commandId]
    );
    return { status: 'failed', error: 'command timeout' };
  }

  async claimCommandsForNode(nodeId, limit = 20) {
    const safeLimit = Math.max(1, Math.min(Number(limit) || 20, 100));
    const conn = await db.getConnection();

    try {
      await conn.beginTransaction();

      const [rows] = await conn.query(
        `SELECT
           c.id,
           c.sessionId,
           c.userId,
           c.serverId,
           c.action,
           c.payload,
           c.createdAt
         FROM session_commands c
         INNER JOIN connection_sessions s ON s.id = c.sessionId
         WHERE s.nodeId = ?
           AND c.status = 'PENDING'
           AND s.status IN (${SESSION_CONNECTED_STATUS_SQL})
         ORDER BY c.createdAt ASC, c.id ASC
         LIMIT ?
         FOR UPDATE`,
        [nodeId, safeLimit]
      );

      if (rows.length === 0) {
        await conn.commit();
        return [];
      }

      const ids = rows.map((row) => row.id);
      await conn.query(
        `UPDATE session_commands
         SET status = 'CLAIMED', claimedAt = NOW(), updatedAt = NOW()
         WHERE id IN (${ids.map(() => '?').join(',')})
           AND status = 'PENDING'`,
        ids
      );

      await conn.commit();

      return rows.map((row) => ({
        id: row.id,
        sessionId: row.sessionId,
        userId: row.userId,
        serverId: row.serverId,
        action: row.action,
        payload: parseJson(row.payload, {}),
        createdAt: row.createdAt,
      }));
    } catch (error) {
      await conn.rollback();
      throw error;
    } finally {
      conn.release();
    }
  }

  async completeCommandForNode({ nodeId, commandId, success, result = null, error = null }) {
    const [rows] = await db.query(
      `SELECT c.id
       FROM session_commands c
       INNER JOIN connection_sessions s ON s.id = c.sessionId
       WHERE c.id = ? AND s.nodeId = ?`,
      [commandId, nodeId]
    );
    if (rows.length === 0) {
      throw new Error('command not found for node');
    }

    const [updateResult] = await db.query(
      `UPDATE session_commands
       SET status = ?, result = ?, error = ?, updatedAt = NOW()
       WHERE id = ?
         AND status IN (${COMMAND_PENDING_STATUS_SQL})`,
      [
        success ? 'DONE' : 'FAILED',
        result === null || result === undefined ? null : stringifyJson(result),
        error,
        commandId,
      ]
    );
    if (updateResult.affectedRows === 0) {
      return { commandId, success: false, ignored: true, reason: 'COMMAND_ALREADY_RESOLVED' };
    }
    return { commandId, success };
  }

  async getNodeStatusOverview() {
    const metrics = await this.getScalingMetrics();
    const [nodeRows] = await db.query(
      `SELECT
         gn.id,
         gn.publicIp,
         gn.region,
         gn.status,
         gn.totalCapacity,
         gn.maxPerServer,
         gn.metadata,
         gn.lastHeartbeat,
         gn.updatedAt,
         SUM(CASE WHEN cs.status IN (${SESSION_STATUS_SQL}) THEN 1 ELSE 0 END) AS activeSessions,
         SUM(CASE WHEN cs.status = 'CONNECTED' THEN 1 ELSE 0 END) AS connectedSessions,
         SUM(CASE WHEN cs.status = 'CONNECTING' THEN 1 ELSE 0 END) AS connectingSessions,
         SUM(CASE WHEN cs.status = 'ASSIGNED' THEN 1 ELSE 0 END) AS assignedSessions
       FROM gateway_nodes gn
       LEFT JOIN connection_sessions cs ON cs.nodeId = gn.id
       GROUP BY
         gn.id,
         gn.publicIp,
         gn.region,
         gn.status,
         gn.totalCapacity,
         gn.maxPerServer,
         gn.metadata,
         gn.lastHeartbeat,
         gn.updatedAt
       ORDER BY
         CASE gn.status
           WHEN 'ONLINE' THEN 1
           WHEN 'DRAINING' THEN 2
           ELSE 3
         END,
         activeSessions DESC,
         gn.updatedAt DESC`
    );
    const [queueRows] = await db.query(
      `SELECT reason, COUNT(*) AS count
       FROM connection_queue
       WHERE status = 'PENDING'
       GROUP BY reason
       ORDER BY count DESC`
    );
    const [failedRows] = await db.query(
      `SELECT COUNT(*) AS failedIn5m
       FROM connection_sessions
       WHERE status = 'FAILED'
         AND updatedAt >= DATE_SUB(NOW(), INTERVAL 5 MINUTE)`
    );

    const now = Date.now();
    const heartbeatTtlSec = this.gatewayHeartbeatTtlSec;
    const nodes = nodeRows.map((row) => {
      const totalCapacity = Number(row.totalCapacity || this.defaultNodeCapacity);
      const activeSessions = Number(row.activeSessions || 0);
      const lastHeartbeatAt = row.lastHeartbeat ? new Date(row.lastHeartbeat) : null;
      const heartbeatAgeSec = lastHeartbeatAt
        ? Math.max(0, Math.floor((now - lastHeartbeatAt.getTime()) / 1000))
        : null;
      const heartbeatAlive =
        row.status === 'ONLINE' && heartbeatAgeSec !== null && heartbeatAgeSec <= heartbeatTtlSec;

      return {
        id: row.id,
        publicIp: row.publicIp,
        region: row.region || null,
        status: row.status,
        totalCapacity,
        maxPerServer: Number(row.maxPerServer || this.defaultMaxPerServer),
        activeSessions,
        connectedSessions: Number(row.connectedSessions || 0),
        connectingSessions: Number(row.connectingSessions || 0),
        assignedSessions: Number(row.assignedSessions || 0),
        utilization: totalCapacity > 0 ? activeSessions / totalCapacity : 0,
        lastHeartbeatAt,
        heartbeatAgeSec,
        heartbeatAlive,
        metadata: parseJson(row.metadata, {}),
        updatedAt: row.updatedAt ? new Date(row.updatedAt) : null,
      };
    });

    const summary = {
      ...metrics,
      heartbeatTtlSec,
      registeredNodes: nodes.length,
      configuredOnlineNodes: nodes.filter((node) => node.status === 'ONLINE').length,
      liveOnlineNodes: nodes.filter((node) => node.heartbeatAlive).length,
      drainingNodes: nodes.filter((node) => node.status === 'DRAINING').length,
      offlineNodes: nodes.filter((node) => node.status === 'OFFLINE').length,
      failedSessionsIn5m: Number(failedRows[0]?.failedIn5m || 0),
      queueByReason: queueRows.map((row) => ({
        reason: row.reason,
        count: Number(row.count || 0),
      })),
    };

    return { summary, nodes };
  }

  async getIdleNodeIds() {
    const [rows] = await db.query(
      `SELECT gn.id
       FROM gateway_nodes gn
       LEFT JOIN connection_sessions cs
         ON cs.nodeId = gn.id
        AND cs.status IN (${SESSION_STATUS_SQL})
       WHERE gn.status = 'ONLINE'
         AND gn.lastHeartbeat >= DATE_SUB(NOW(), INTERVAL ? SECOND)
       GROUP BY gn.id
       HAVING COUNT(cs.id) = 0`,
      [this.gatewayHeartbeatTtlSec]
    );
    return rows.map((row) => row.id);
  }

  async getScalingMetrics() {
    const [nodeRows] = await db.query(
      `SELECT
         COUNT(*) AS onlineNodes,
         COALESCE(SUM(totalCapacity), 0) AS totalCapacity,
         COALESCE(SUM(maxPerServer), 0) AS totalPerServerCapacity
       FROM gateway_nodes
       WHERE status = 'ONLINE'
         AND lastHeartbeat >= DATE_SUB(NOW(), INTERVAL ? SECOND)`,
      [this.gatewayHeartbeatTtlSec]
    );
    const [activeRows] = await db.query(
      `SELECT COUNT(*) AS activeSessions
       FROM connection_sessions
       WHERE status IN (${SESSION_STATUS_SQL})`
    );
    const [pendingRows] = await db.query(
      `SELECT COUNT(*) AS pendingQueue
       FROM connection_queue
       WHERE status = 'PENDING'`
    );
    const [hotRows] = await db.query(
      `SELECT serverKey, COUNT(*) AS count
       FROM connection_sessions
       WHERE status IN (${SESSION_STATUS_SQL})
       GROUP BY serverKey
       ORDER BY count DESC
       LIMIT 1`
    );

    const onlineNodes = Number(nodeRows[0]?.onlineNodes || 0);
    const totalCapacity = Number(nodeRows[0]?.totalCapacity || 0);
    const totalPerServerCapacity = Number(nodeRows[0]?.totalPerServerCapacity || 0);
    const activeSessions = Number(activeRows[0]?.activeSessions || 0);
    const pendingQueue = Number(pendingRows[0]?.pendingQueue || 0);
    const hottestServerSessions = Number(hotRows[0]?.count || 0);

    const globalUtilization = totalCapacity > 0 ? activeSessions / totalCapacity : 0;
    const hottestServerUtilization =
      totalPerServerCapacity > 0 ? hottestServerSessions / totalPerServerCapacity : 0;

    return {
      onlineNodes,
      totalCapacity,
      totalPerServerCapacity,
      activeSessions,
      pendingQueue,
      hottestServerKey: hotRows[0]?.serverKey || null,
      hottestServerSessions,
      globalUtilization,
      hottestServerUtilization,
    };
  }
}

export default new DistributedSessionService();
