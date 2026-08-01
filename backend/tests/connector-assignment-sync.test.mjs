import test from 'node:test';
import assert from 'node:assert/strict';
import { createAssignmentSynchronizer } from '../src/connector-node/assignment-sync.js';

test('overlapping assignment polls cannot remove sessions from a newer snapshot', async () => {
  const activeSessions = new Map();
  const snapshots = [
    [{ sessionId: 'session-old' }],
    [{ sessionId: 'session-old' }, { sessionId: 'session-new' }],
  ];
  const disconnected = [];
  let releaseFirstConnect;
  const firstConnectBlocked = new Promise((resolve) => {
    releaseFirstConnect = resolve;
  });
  let firstConnectStarted;
  const firstConnectReady = new Promise((resolve) => {
    firstConnectStarted = resolve;
  });

  const syncAssignments = createAssignmentSynchronizer({
    activeSessions,
    fetchAssignments: async () => snapshots.shift() || [],
    connectSession: async (assignment) => {
      activeSessions.set(assignment.sessionId, assignment);
      if (assignment.sessionId === 'session-old') {
        firstConnectStarted();
        await firstConnectBlocked;
      }
    },
    disconnectSession: async (sessionId) => {
      disconnected.push(sessionId);
      activeSessions.delete(sessionId);
    },
  });

  const firstSync = syncAssignments();
  await firstConnectReady;
  await syncAssignments();
  releaseFirstConnect();
  await firstSync;

  await syncAssignments();

  assert.deepEqual(Array.from(activeSessions.keys()), ['session-old', 'session-new']);
  assert.deepEqual(disconnected, []);
});
