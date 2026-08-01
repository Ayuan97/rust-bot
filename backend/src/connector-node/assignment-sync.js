export function createAssignmentSynchronizer({
  activeSessions,
  fetchAssignments,
  connectSession,
  disconnectSession,
  shouldConnect = (assignment) => !activeSessions.has(assignment.sessionId),
}) {
  let isSyncing = false;

  return async function syncAssignments() {
    if (isSyncing) {
      return;
    }

    isSyncing = true;
    try {
      const assignments = await fetchAssignments();
      const incomingIds = new Set(assignments.map((item) => item.sessionId));

      for (const assignment of assignments) {
        if (shouldConnect(assignment)) {
          await connectSession(assignment);
        }
      }

      for (const existingSessionId of Array.from(activeSessions.keys())) {
        if (!incomingIds.has(existingSessionId)) {
          await disconnectSession(existingSessionId);
        }
      }
    } finally {
      isSyncing = false;
    }
  };
}
