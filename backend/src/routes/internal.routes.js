import express from 'express';
import distributedSessionService from '../services/distributed-session.service.js';

const router = express.Router();

function authenticateInternal(req, res, next) {
  const expected = process.env.INTERNAL_API_TOKEN;
  if (!expected) {
    return res.status(503).json({
      success: false,
      error: 'INTERNAL_API_TOKEN not configured',
    });
  }

  const headerToken = req.headers['x-internal-token'];
  const authHeader = req.headers.authorization;
  let bearerToken = null;
  if (authHeader) {
    const parts = authHeader.split(' ');
    if (parts.length === 2 && parts[0] === 'Bearer') {
      bearerToken = parts[1];
    }
  }
  const token = headerToken || bearerToken;
  if (!token || token !== expected) {
    return res.status(401).json({
      success: false,
      error: 'invalid internal token',
    });
  }
  next();
}

router.use(authenticateInternal);

router.post('/gateway/register', async (req, res) => {
  try {
    const node = await distributedSessionService.registerGatewayNode(req.body || {});
    res.json({ success: true, node });
  } catch (error) {
    res.status(400).json({ success: false, error: error.message });
  }
});

router.post('/gateway/heartbeat', async (req, res) => {
  try {
    await distributedSessionService.heartbeatGatewayNode(req.body || {});
    res.json({ success: true });
  } catch (error) {
    res.status(400).json({ success: false, error: error.message });
  }
});

router.post('/session/open', async (req, res) => {
  try {
    const { userId, serverId, reason } = req.body || {};
    if (!userId || !serverId) {
      return res.status(400).json({ success: false, error: 'userId and serverId are required' });
    }
    const result = await distributedSessionService.openSession({ userId, serverId, reason });
    if (result.status === 'queued') {
      return res.status(202).json({ success: true, queued: true, ...result });
    }
    return res.json({ success: true, queued: false, ...result });
  } catch (error) {
    res.status(400).json({ success: false, error: error.message });
  }
});

router.post('/session/command', async (req, res) => {
  try {
    const { userId, serverId, action, payload, timeoutMs } = req.body || {};
    if (!userId || !serverId || !action) {
      return res.status(400).json({
        success: false,
        error: 'userId, serverId and action are required',
      });
    }
    const result = await distributedSessionService.dispatchCommand({
      userId,
      serverId,
      action,
      payload,
      timeoutMs,
    });
    if (result.status === 'queued' || result.status === 'missing_session') {
      return res.status(202).json({ success: false, ...result });
    }
    if (result.status === 'failed') {
      return res.status(400).json({ success: false, ...result });
    }
    return res.json({ success: true, ...result });
  } catch (error) {
    res.status(400).json({ success: false, error: error.message });
  }
});

router.post('/session/close', async (req, res) => {
  try {
    const { userId, serverId, sessionId, reason } = req.body || {};
    if (!userId) {
      return res.status(400).json({ success: false, error: 'userId is required' });
    }
    const result = await distributedSessionService.closeSession({
      userId,
      serverId,
      sessionId,
      reason,
    });
    res.json({ success: true, ...result });
  } catch (error) {
    res.status(400).json({ success: false, error: error.message });
  }
});

router.get('/session/queue', async (req, res) => {
  try {
    const { userId } = req.query;
    const queue = await distributedSessionService.getQueue(userId || null);
    res.json({ success: true, queue });
  } catch (error) {
    res.status(400).json({ success: false, error: error.message });
  }
});

router.get('/session/assignments', async (req, res) => {
  try {
    const { nodeId } = req.query;
    if (!nodeId) {
      return res.status(400).json({ success: false, error: 'nodeId is required' });
    }
    const assignments = await distributedSessionService.getAssignmentsForNode(nodeId);
    res.json({ success: true, assignments });
  } catch (error) {
    res.status(400).json({ success: false, error: error.message });
  }
});

router.post('/session/state', async (req, res) => {
  try {
    const { nodeId, sessionId, status, error } = req.body || {};
    if (!nodeId || !sessionId || !status) {
      return res.status(400).json({
        success: false,
        error: 'nodeId, sessionId and status are required',
      });
    }
    const result = await distributedSessionService.updateSessionState({
      nodeId,
      sessionId,
      status,
      error,
    });
    res.json({ success: true, ...result });
  } catch (err) {
    res.status(400).json({ success: false, error: err.message });
  }
});

router.post('/session/events', async (req, res) => {
  try {
    const { nodeId, sessionId, eventType, payload } = req.body || {};
    if (!nodeId || !sessionId || !eventType) {
      return res.status(400).json({
        success: false,
        error: 'nodeId, sessionId and eventType are required',
      });
    }
    const result = await distributedSessionService.publishNodeEvent({
      nodeId,
      sessionId,
      eventType,
      payload: payload || {},
    });
    res.json({ success: true, ...result });
  } catch (error) {
    res.status(400).json({ success: false, error: error.message });
  }
});

router.get('/session/commands', async (req, res) => {
  try {
    const { nodeId, limit } = req.query;
    if (!nodeId) {
      return res.status(400).json({ success: false, error: 'nodeId is required' });
    }
    const commands = await distributedSessionService.claimCommandsForNode(nodeId, Number(limit || 20));
    res.json({ success: true, commands });
  } catch (error) {
    res.status(400).json({ success: false, error: error.message });
  }
});

router.post('/session/commands/:id/result', async (req, res) => {
  try {
    const commandId = req.params.id;
    const { nodeId, success, result, error } = req.body || {};
    const normalizedSuccess = success === true || success === 'true' || success === 1 || success === '1';
    if (!nodeId) {
      return res.status(400).json({ success: false, error: 'nodeId is required' });
    }
    const payload = await distributedSessionService.completeCommandForNode({
      nodeId,
      commandId,
      success: normalizedSuccess,
      result,
      error,
    });
    res.json({ success: true, ...payload });
  } catch (err) {
    res.status(400).json({ success: false, error: err.message });
  }
});

export default router;
