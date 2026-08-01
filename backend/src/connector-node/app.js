import axios from 'axios';
import os from 'os';
import jwt from 'jsonwebtoken';
import '../utils/load-env.js';
import UserRustPlusManager from '../services/user-rustplus-manager.js';
import { subsKey, applyProxy } from './proxy-agent.js';
import ProxyPool from './proxy-pool.js';
import { createAssignmentSynchronizer } from './assignment-sync.js';

const CONTROL_API_URL = process.env.CONTROL_API_URL || 'http://127.0.0.1:3000/api/internal';
const NODE_TOKEN = process.env.NODE_TOKEN || '';
// 节点身份由 NODE_TOKEN（节点 JWT）决定，nodeId 从令牌中解析，保证与主节点登记一致。
const NODE_ID = jwt.decode(NODE_TOKEN)?.sub || process.env.NODE_ID || `node-${os.hostname()}`;
const PUBLIC_IP = process.env.NODE_PUBLIC_IP || '127.0.0.1';
const NODE_REGION = process.env.NODE_REGION || 'unknown';
const NODE_CAPACITY = Number(process.env.NODE_CAPACITY || 120);
const NODE_MAX_PER_SERVER = Number(process.env.NODE_MAX_PER_SERVER || 4);
const HEARTBEAT_INTERVAL_MS = Number(process.env.NODE_HEARTBEAT_INTERVAL_MS || 8000);
const POLL_ASSIGNMENT_INTERVAL_MS = Number(process.env.NODE_POLL_ASSIGNMENT_INTERVAL_MS || 2000);
const POLL_COMMAND_INTERVAL_MS = Number(process.env.NODE_POLL_COMMAND_INTERVAL_MS || 300);
const CONTROL_PLANE_STALE_MS = Number(process.env.NODE_CONTROL_PLANE_STALE_MS || 45000);
const CONTROL_PLANE_CHECK_INTERVAL_MS = Number(process.env.NODE_CONTROL_PLANE_CHECK_INTERVAL_MS || 2000);
// 代理出口(本机 Mihomo 的 SOCKS) + 拉取代理配置的间隔
const PROXY_SOCKS = process.env.PROXY_SOCKS || 'socks5://127.0.0.1:7899';
const PROXY_POLL_INTERVAL_MS = Number(process.env.PROXY_POLL_INTERVAL_MS || 15000);

if (!NODE_TOKEN) {
  // eslint-disable-next-line no-console
  console.error(
    '[connector-node] NODE_TOKEN 未配置，无法启动（用 backend/scripts/issue-node-token.js 为本节点签发）'
  );
  process.exit(1);
}

const http = axios.create({
  baseURL: CONTROL_API_URL,
  timeout: 15000,
  headers: {
    'x-node-token': NODE_TOKEN,
  },
});

const rustManager = new UserRustPlusManager(`connector:${NODE_ID}`, { autoReconnect: false });
const proxyPool = new ProxyPool();

const activeSessions = new Map();
// 主动关闭中的会话：断开事件不得再上报 CONNECTING（避免与 manual_disconnect 打架）
const intentionalCloseSessions = new Set();
let heartbeatTimer = null;
let assignmentTimer = null;
let commandTimer = null;
let controlPlaneTimer = null;
let proxyTimer = null;
let lastProxySubsKey = null;
let isPollingCommands = false;
let lastControlPlaneSuccessAt = Date.now();
let staleDisconnectTriggered = false;
let stopped = false;

function serializeResult(value) {
  return JSON.parse(
    JSON.stringify(value, (_, current) => {
      if (Buffer.isBuffer(current)) {
        return { __type: 'buffer-base64', data: current.toString('base64') };
      }
      if (typeof current === 'bigint') {
        return current.toString();
      }
      return current;
    })
  );
}

function markControlPlaneSuccess() {
  const wasStale = staleDisconnectTriggered;
  lastControlPlaneSuccessAt = Date.now();
  staleDisconnectTriggered = false;

  if (wasStale) {
    // eslint-disable-next-line no-console
    console.log('[connector-node] control plane recovered');
  }
}

async function apiPost(path, payload) {
  const { data } = await http.post(path, payload);
  markControlPlaneSuccess();
  return data;
}

async function apiGet(path, params = {}) {
  const { data } = await http.get(path, { params });
  markControlPlaneSuccess();
  return data;
}

async function updateSessionState(sessionId, status, error = null) {
  try {
    await apiPost('/session/state', {
      sessionId,
      status,
      error,
    });
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error('[connector-node] update session state failed:', err.message);
  }
}

async function emitSessionEvent(sessionId, eventType, payload = {}) {
  const assignment = activeSessions.get(sessionId);
  if (!assignment) {
    return;
  }

  try {
    await apiPost('/session/events', {
      sessionId,
      eventType,
      payload,
    });
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error(`[connector-node] emit ${eventType} failed:`, err.message);
  }
}

function forwardRustEvent(eventType, data = {}) {
  const sessionId = data.serverId;
  if (!sessionId) return;
  try {
    const payload = serializeResult({ ...data });
    delete payload.userId;
    delete payload.serverId;
    emitSessionEvent(sessionId, eventType, payload);
  } catch (error) {
    // eslint-disable-next-line no-console
    console.error(`[connector-node] serialize ${eventType} failed:`, error.message);
  }
}

async function connectSession(assignment) {
  const sessionId = assignment.sessionId;
  if (activeSessions.has(sessionId)) {
    return;
  }

  activeSessions.set(sessionId, assignment);
  await updateSessionState(sessionId, 'CONNECTING');

  try {
    await rustManager.connect({
      serverId: sessionId,
      ip: assignment.ip,
      port: assignment.port,
      playerId: assignment.playerId,
      playerToken: assignment.playerToken,
    });
    await updateSessionState(sessionId, 'CONNECTED');
  } catch (error) {
    activeSessions.delete(sessionId);
    await updateSessionState(sessionId, 'FAILED', error.message || String(error));
  }
}

async function disconnectSession(sessionId, reason = 'assignment_removed') {
  intentionalCloseSessions.add(sessionId);
  try {
    await rustManager.disconnect(sessionId);
  } catch {
    // Ignore local disconnect errors and still publish closed state.
  } finally {
    activeSessions.delete(sessionId);
    intentionalCloseSessions.delete(sessionId);
  }
  await updateSessionState(sessionId, 'CLOSED', reason);
}

async function drainActiveSessionsForSafety(reason = 'control_plane_stale') {
  for (const sessionId of Array.from(activeSessions.keys())) {
    await disconnectSession(sessionId, reason);
  }
}

async function monitorControlPlaneHealth() {
  if (stopped) return;

  const staleForMs = Date.now() - lastControlPlaneSuccessAt;
  if (staleForMs <= CONTROL_PLANE_STALE_MS) {
    return;
  }
  if (staleDisconnectTriggered) {
    return;
  }

  staleDisconnectTriggered = true;
  if (activeSessions.size === 0) {
    return;
  }
  // eslint-disable-next-line no-console
  console.error(
    `[connector-node] control plane stale for ${staleForMs}ms, draining ${activeSessions.size} sessions`
  );

  await drainActiveSessionsForSafety('control_plane_stale');
}

const syncAssignmentState = createAssignmentSynchronizer({
  activeSessions,
  fetchAssignments: async () => {
    const res = await apiGet('/session/assignments');
    return res.assignments || [];
  },
  connectSession,
  disconnectSession,
});

async function syncAssignments() {
  if (stopped) return;
  try {
    await syncAssignmentState();
  } catch (error) {
    // eslint-disable-next-line no-console
    console.error('[connector-node] sync assignments failed:', error.message);
  }
}

async function executeCommand(command) {
  const sessionId = command.sessionId;
  const payload = command.payload || {};

  switch (command.action) {
    case 'sendTeamMessage':
      return rustManager.sendTeamMessage(sessionId, payload.message);
    case 'getTeamChat':
      return rustManager.getTeamChat(sessionId);
    case 'setEntityValue':
      return rustManager.setEntityValue(sessionId, payload.entityId, payload.value);
    case 'getEntityInfo':
      return rustManager.getEntityInfo(sessionId, payload.entityId, {
        timeoutMs: payload.timeoutMs,
      });
    case 'getServerInfo':
      return rustManager.getServerInfo(sessionId);
    case 'getTeamInfo':
      return rustManager.getTeamInfo(sessionId);
    case 'getMap':
      return rustManager.getMap(sessionId);
    case 'getMapMarkers':
      return rustManager.getMapMarkers(sessionId);
    case 'getTime':
      return rustManager.getTime(sessionId);
    case 'turnSmartSwitchOn':
      return rustManager.turnSmartSwitchOn(sessionId, payload.entityId);
    case 'turnSmartSwitchOff':
      return rustManager.turnSmartSwitchOff(sessionId, payload.entityId);
    case 'subscribeCamera':
      return rustManager.subscribeCamera(sessionId, payload.cameraId);
    case 'unsubscribeCamera':
      return rustManager.unsubscribeCamera(sessionId, payload.cameraId);
    case 'cameraMove':
      return rustManager.cameraMove(
        sessionId,
        payload.cameraId,
        payload.buttons,
        payload.x,
        payload.y
      );
    case 'cameraZoom':
      return rustManager.cameraZoom(sessionId, payload.cameraId);
    case 'cameraShoot':
      return rustManager.cameraShoot(sessionId, payload.cameraId);
    case 'cameraReload':
      return rustManager.cameraReload(sessionId, payload.cameraId);
    case 'promoteToLeader':
      return rustManager.promoteToLeader(sessionId, payload.steamId);
    default:
      throw new Error(`unsupported action: ${command.action}`);
  }
}

async function pollCommands() {
  if (stopped || isPollingCommands) return;
  isPollingCommands = true;
  try {
    const res = await apiGet('/session/commands', { limit: 20 });
    const commands = res.commands || [];
    for (const command of commands) {
      try {
        const result = await executeCommand(command);
        await apiPost(`/session/commands/${command.id}/result`, {
          success: true,
          result: serializeResult(result),
        });
      } catch (error) {
        await apiPost(`/session/commands/${command.id}/result`, {
          success: false,
          error: error.message || String(error),
        });
      }
    }
  } catch (error) {
    // eslint-disable-next-line no-console
    console.error('[connector-node] poll commands failed:', error.message);
  } finally {
    isPollingCommands = false;
  }
}

async function heartbeat() {
  if (stopped) return;
  try {
    await apiPost('/gateway/heartbeat', {
      publicIp: PUBLIC_IP,
      region: NODE_REGION,
      status: 'ONLINE',
      metadata: {
        activeSessionCount: activeSessions.size,
      },
    });
  } catch (error) {
    // eslint-disable-next-line no-console
    console.error('[connector-node] heartbeat failed:', error.message);
  }
}

// 从控制平面拉代理配置：运行时开关代理出口;订阅有变化则重生成 Mihomo 配置并热重载
async function syncProxyConfig() {
  if (stopped) return;
  try {
    const res = await apiGet('/proxy-config');
    const enabled = !!res.enabled;
    const subs = res.subscriptions || [];
    rustManager.setProxy({ enabled, socks: PROXY_SOCKS, pool: proxyPool });
    const key = subsKey(subs);
    if (enabled && subs.length > 0 && key !== lastProxySubsKey) {
      await applyProxy(subs);
      lastProxySubsKey = key;
      // eslint-disable-next-line no-console
      console.log(`[connector-node] proxy 已更新: ${subs.length} 个订阅, Mihomo 已重载`);
    } else if (!enabled) {
      lastProxySubsKey = null; // 关闭后重置,下次开启重新生成
    }
  } catch (error) {
    // eslint-disable-next-line no-console
    console.error('[connector-node] sync proxy config failed:', error.message);
  }
}

async function bootstrap() {
  // eslint-disable-next-line no-console
  console.log(`[connector-node] starting ${NODE_ID} -> ${CONTROL_API_URL}`);

  await apiPost('/gateway/register', {
    publicIp: PUBLIC_IP,
    region: NODE_REGION,
    totalCapacity: NODE_CAPACITY,
    maxPerServer: NODE_MAX_PER_SERVER,
    metadata: { startedAt: new Date().toISOString() },
  });

  heartbeatTimer = setInterval(() => {
    heartbeat();
  }, HEARTBEAT_INTERVAL_MS);

  assignmentTimer = setInterval(() => {
    syncAssignments();
  }, POLL_ASSIGNMENT_INTERVAL_MS);

  commandTimer = setInterval(() => {
    pollCommands();
  }, POLL_COMMAND_INTERVAL_MS);

  controlPlaneTimer = setInterval(() => {
    monitorControlPlaneHealth().catch((error) => {
      // eslint-disable-next-line no-console
      console.error('[connector-node] control plane health check failed:', error.message);
    });
  }, CONTROL_PLANE_CHECK_INTERVAL_MS);

  proxyTimer = setInterval(() => {
    syncProxyConfig();
  }, PROXY_POLL_INTERVAL_MS);

  rustManager.on('server:connected', ({ serverId }) => {
    if (!activeSessions.has(serverId)) return;
    updateSessionState(serverId, 'CONNECTED');
  });

  rustManager.on('server:reconnecting', ({ serverId }) => {
    // 仅对仍在分配中的会话上报重连；主动关闭不进入 CONNECTING
    if (!activeSessions.has(serverId) || intentionalCloseSessions.has(serverId)) return;
    updateSessionState(serverId, 'CONNECTING');
  });

  rustManager.on('server:disconnected', ({ serverId }) => {
    // 主动关闭（manual_disconnect / assignment_removed）：disconnectSession 会写 CLOSED，这里不要改回 CONNECTING
    if (intentionalCloseSessions.has(serverId)) {
      return;
    }
    // 意外掉线：本地不自动重连，从 activeSessions 移除并上报 CONNECTING，
    // 由 syncAssignments 依据控制平面 assignment 决定是否重连（避免 failover 双连接）
    activeSessions.delete(serverId);
    updateSessionState(serverId, 'CONNECTING', 'connection dropped, awaiting reassignment');
  });

  rustManager.on('server:error', ({ serverId, error }) => {
    if (!activeSessions.has(serverId) || intentionalCloseSessions.has(serverId)) return;
    updateSessionState(serverId, 'FAILED', error || 'server error');
  });

  rustManager.on('rust:message', (data) => forwardRustEvent('rust:message', data));
  rustManager.on('team:message', (data) => forwardRustEvent('team:message', data));
  rustManager.on('team:changed', (data) => forwardRustEvent('team:changed', data));
  rustManager.on('entity:changed', (data) => forwardRustEvent('entity:changed', data));
  rustManager.on('clan:changed', (data) => forwardRustEvent('clan:changed', data));
  rustManager.on('clan:message', (data) => forwardRustEvent('clan:message', data));
  rustManager.on('camera:subscribing', (data) => forwardRustEvent('camera:subscribing', data));
  rustManager.on('camera:subscribed', (data) => forwardRustEvent('camera:subscribed', data));
  rustManager.on('camera:unsubscribed', (data) => forwardRustEvent('camera:unsubscribed', data));
  rustManager.on('camera:render', (data) => forwardRustEvent('camera:render', data));
  rustManager.on('camera:rays', (data) => forwardRustEvent('camera:rays', data));

  await heartbeat();
  await syncProxyConfig();
  await syncAssignments();
}

async function shutdown(signal) {
  if (stopped) return;
  stopped = true;

  // eslint-disable-next-line no-console
  console.log(`[connector-node] shutting down by ${signal}`);

  if (heartbeatTimer) clearInterval(heartbeatTimer);
  if (assignmentTimer) clearInterval(assignmentTimer);
  if (commandTimer) clearInterval(commandTimer);
  if (controlPlaneTimer) clearInterval(controlPlaneTimer);
  if (proxyTimer) clearInterval(proxyTimer);

  // 重启/优雅停机：仅断开本地 Rust+ 连接，会话标记为 CONNECTING（待复连），
  // 绝不 CLOSED——否则重启后 getAssignmentsForNode 不再返回它、无法自动复连。
  // 用户主动断开走 closeSession 标记 CLOSED，与此区分；本节点若永久下线，
  // 控制平面心跳超时会经 failover 接管这些会话。
  for (const sessionId of Array.from(activeSessions.keys())) {
    try {
      await rustManager.disconnect(sessionId);
    } catch {
      // 忽略本地断开错误，仍上报待复连状态
    }
    activeSessions.delete(sessionId);
    await updateSessionState(sessionId, 'CONNECTING', 'node_restart');
  }

  process.exit(0);
}

process.on('SIGINT', () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));

bootstrap().catch((error) => {
  // eslint-disable-next-line no-console
  console.error('[connector-node] bootstrap failed:', error.message);
  process.exit(1);
});
