import axios from 'axios';
import os from 'os';
import { randomUUID } from 'crypto';
import '../utils/load-env.js';
import UserRustPlusManager from '../services/user-rustplus-manager.js';

const CONTROL_API_URL = process.env.CONTROL_API_URL || 'http://127.0.0.1:3000/api/internal';
const INTERNAL_API_TOKEN = process.env.INTERNAL_API_TOKEN || '';
const NODE_ID = process.env.NODE_ID || `node-${os.hostname()}-${randomUUID().slice(0, 8)}`;
const PUBLIC_IP = process.env.NODE_PUBLIC_IP || '127.0.0.1';
const NODE_REGION = process.env.NODE_REGION || 'unknown';
const NODE_CAPACITY = Number(process.env.NODE_CAPACITY || 120);
const NODE_MAX_PER_SERVER = Number(process.env.NODE_MAX_PER_SERVER || 4);
const HEARTBEAT_INTERVAL_MS = Number(process.env.NODE_HEARTBEAT_INTERVAL_MS || 8000);
const POLL_ASSIGNMENT_INTERVAL_MS = Number(process.env.NODE_POLL_ASSIGNMENT_INTERVAL_MS || 2000);
const POLL_COMMAND_INTERVAL_MS = Number(process.env.NODE_POLL_COMMAND_INTERVAL_MS || 300);

if (!INTERNAL_API_TOKEN) {
  // eslint-disable-next-line no-console
  console.error('[connector-node] INTERNAL_API_TOKEN 未配置，无法启动');
  process.exit(1);
}

const http = axios.create({
  baseURL: CONTROL_API_URL,
  timeout: 15000,
  headers: {
    'x-internal-token': INTERNAL_API_TOKEN,
  },
});

const rustManager = new UserRustPlusManager(`connector:${NODE_ID}`);

const activeSessions = new Map();
let heartbeatTimer = null;
let assignmentTimer = null;
let commandTimer = null;
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

async function apiPost(path, payload) {
  const { data } = await http.post(path, payload);
  return data;
}

async function apiGet(path, params = {}) {
  const { data } = await http.get(path, { params });
  return data;
}

async function updateSessionState(sessionId, status, error = null) {
  try {
    await apiPost('/session/state', {
      nodeId: NODE_ID,
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
      nodeId: NODE_ID,
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
  try {
    await rustManager.disconnect(sessionId);
  } catch {
    // Ignore local disconnect errors and still publish closed state.
  }
  activeSessions.delete(sessionId);
  await updateSessionState(sessionId, 'CLOSED', reason);
}

async function syncAssignments() {
  if (stopped) return;
  try {
    const res = await apiGet('/session/assignments', { nodeId: NODE_ID });
    const assignments = res.assignments || [];
    const incomingIds = new Set(assignments.map((item) => item.sessionId));

    for (const assignment of assignments) {
      if (!activeSessions.has(assignment.sessionId)) {
        await connectSession(assignment);
      }
    }

    for (const existingSessionId of Array.from(activeSessions.keys())) {
      if (!incomingIds.has(existingSessionId)) {
        await disconnectSession(existingSessionId);
      }
    }
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
      return rustManager.getEntityInfo(sessionId, payload.entityId);
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
  if (stopped) return;
  try {
    const res = await apiGet('/session/commands', { nodeId: NODE_ID, limit: 20 });
    const commands = res.commands || [];
    for (const command of commands) {
      try {
        const result = await executeCommand(command);
        await apiPost(`/session/commands/${command.id}/result`, {
          nodeId: NODE_ID,
          success: true,
          result: serializeResult(result),
        });
      } catch (error) {
        await apiPost(`/session/commands/${command.id}/result`, {
          nodeId: NODE_ID,
          success: false,
          error: error.message || String(error),
        });
      }
    }
  } catch (error) {
    // eslint-disable-next-line no-console
    console.error('[connector-node] poll commands failed:', error.message);
  }
}

async function heartbeat() {
  if (stopped) return;
  try {
    await apiPost('/gateway/heartbeat', {
      nodeId: NODE_ID,
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

async function bootstrap() {
  // eslint-disable-next-line no-console
  console.log(`[connector-node] starting ${NODE_ID} -> ${CONTROL_API_URL}`);

  await apiPost('/gateway/register', {
    nodeId: NODE_ID,
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

  rustManager.on('server:connected', ({ serverId }) => {
    updateSessionState(serverId, 'CONNECTED');
  });

  rustManager.on('server:reconnecting', ({ serverId }) => {
    updateSessionState(serverId, 'CONNECTING');
  });

  rustManager.on('server:disconnected', ({ serverId }) => {
    updateSessionState(serverId, 'CONNECTING', 'connection dropped, reconnecting');
  });

  rustManager.on('server:error', ({ serverId, error }) => {
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

  for (const sessionId of Array.from(activeSessions.keys())) {
    await disconnectSession(sessionId, 'node_shutdown');
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
