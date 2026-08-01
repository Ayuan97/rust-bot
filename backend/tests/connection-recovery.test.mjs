import test, { after } from 'node:test';
import assert from 'node:assert/strict';
import db from '../src/lib/db.js';
import distributedSessionService from '../src/services/distributed-session.service.js';
import DistributedRustPlusManager from '../src/services/distributed-rustplus-manager.js';
import UserServiceManager from '../src/services/user-service-manager.js';

after(async () => {
  distributedSessionService.shutdown();
  await db.end().catch(() => {});
});

test('service shutdown closes sessions without changing desired server state', async () => {
  const originalGetSessions = distributedSessionService.getUserActiveSessions;
  const originalCloseSession = distributedSessionService.closeSession;
  const originalQuery = db.query;
  const closeCalls = [];
  const updateCalls = [];
  const manager = new DistributedRustPlusManager('user-shutdown');

  distributedSessionService.getUserActiveSessions = async () => [{ serverId: 'server-1' }];
  distributedSessionService.closeSession = async (input) => {
    closeCalls.push(input);
    return { closed: true };
  };
  db.query = async (...args) => {
    updateCalls.push(args);
    return [{ affectedRows: 1 }];
  };

  try {
    await manager.disconnectAll({ preserveDesiredState: true, reason: 'service_shutdown' });

    assert.equal(updateCalls.length, 0);
    assert.equal(manager.manualDisconnect.has('server-1'), false);
    assert.deepEqual(closeCalls, [{
      userId: 'user-shutdown',
      serverId: 'server-1',
      reason: 'service_shutdown'
    }]);
  } finally {
    manager.destroy();
    distributedSessionService.getUserActiveSessions = originalGetSessions;
    distributedSessionService.closeSession = originalCloseSession;
    db.query = originalQuery;
  }
});

test('manual disconnect still persists the desired offline state', async () => {
  const originalGetSessions = distributedSessionService.getUserActiveSessions;
  const originalCloseSession = distributedSessionService.closeSession;
  const originalQuery = db.query;
  const closeCalls = [];
  const updateCalls = [];
  const manager = new DistributedRustPlusManager('user-manual');

  distributedSessionService.getUserActiveSessions = async () => [{ serverId: 'server-1' }];
  distributedSessionService.closeSession = async (input) => {
    closeCalls.push(input);
    return { closed: true };
  };
  db.query = async (...args) => {
    updateCalls.push(args);
    return [{ affectedRows: 1 }];
  };

  try {
    await manager.disconnectAll();

    assert.equal(updateCalls.length, 1);
    assert.deepEqual(updateCalls[0][1], [0, 'server-1', 'user-manual']);
    assert.equal(manager.manualDisconnect.has('server-1'), true);
    assert.deepEqual(closeCalls, [{
      userId: 'user-manual',
      serverId: 'server-1',
      reason: 'manual_disconnect'
    }]);
  } finally {
    manager.destroy();
    distributedSessionService.getUserActiveSessions = originalGetSessions;
    distributedSessionService.closeSession = originalCloseSession;
    db.query = originalQuery;
  }
});

test('startup restores active real servers without requiring FCM', async () => {
  const manager = new UserServiceManager('user-startup');
  const connectCalls = [];
  let monitorStarts = 0;
  let trackingStarts = 0;
  let disconnectAllOptions = null;

  manager.user = {
    servers: [
      { id: 'fcm-placeholder', name: 'FCM', ip: '0.0.0.0', isActive: 0 },
      { id: 'server-offline', name: 'Offline', ip: '127.0.0.2', port: 28082, isActive: 0, battlemetricsId: 'bm-1' },
      {
        id: 'server-active',
        name: 'Active',
        ip: '127.0.0.1',
        port: 28082,
        playerId: 'player',
        playerToken: 123,
        isActive: 1,
        battlemetricsId: 'bm-2'
      }
    ]
  };
  manager.rustPlusService.connect = async (config) => {
    connectCalls.push(config);
    manager.rustPlusService.sessionStates.set(config.serverId, { status: 'QUEUED' });
    return { queued: true, queuePosition: 1 };
  };
  manager.eventMonitorService.start = async () => { monitorStarts += 1; };
  manager.automationService.start = () => { monitorStarts += 1; };
  manager.dayNightNotifier.start = async () => { monitorStarts += 1; };
  manager.trackingService.start = async () => { trackingStarts += 1; };
  manager.rustPlusService.disconnectAll = async (options) => { disconnectAllOptions = options; };

  try {
    await manager._connectToServers();

    assert.equal(connectCalls.length, 1);
    assert.equal(connectCalls[0].serverId, 'server-active');
    assert.equal(connectCalls[0].reason, 'service_startup');
    assert.equal(manager.rustPlusService.manualDisconnect.has('server-offline'), true);
    assert.equal(monitorStarts, 0);
    assert.equal(trackingStarts, 1);

    await manager._disconnectServers();
    assert.deepEqual(disconnectAllOptions, {
      preserveDesiredState: true,
      reason: 'service_shutdown'
    });
  } finally {
    manager.commandsService.destroy();
    manager.rustPlusService.destroy();
    manager.removeAllListeners();
  }
});
