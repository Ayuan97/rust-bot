import express from 'express';
import distributedSessionService from '../services/distributed-session.service.js';
import proxyService from '../services/proxy.service.js';
import { verifyNodeToken, isAllowedInternalIp } from '../utils/node-auth.js';

const router = express.Router();

/**
 * 网络层：仅允许可信来源访问内部接口。
 * 默认锁本机（INTERNAL_ALLOWED_IPS 缺省 = 127.0.0.1,::1）；
 * 跨机子节点需把其出口 IP 加入 INTERNAL_ALLOWED_IPS，或设为 "*" 关闭该限制。
 */
function restrictInternalNetwork(req, res, next) {
  const ip = req.ip || req.socket?.remoteAddress || '';
  if (!isAllowedInternalIp(ip)) {
    return res.status(403).json({
      success: false,
      error: 'internal endpoint not allowed from this address',
    });
  }
  next();
}

/**
 * 身份层：用节点 JWT 解析出可信 nodeId 并写入 req.nodeId。
 * 后续所有处理一律以 req.nodeId 为准，忽略请求体/查询里自报的 nodeId。
 */
function authenticateNode(req, res, next) {
  if (!process.env.NODE_TOKEN_SECRET) {
    return res.status(503).json({
      success: false,
      error: 'NODE_TOKEN_SECRET not configured',
    });
  }

  const headerToken = req.headers['x-node-token'];
  const authHeader = req.headers.authorization;
  let bearerToken = null;
  if (authHeader) {
    const parts = authHeader.split(' ');
    if (parts.length === 2 && parts[0] === 'Bearer') {
      bearerToken = parts[1];
    }
  }
  const token = headerToken || bearerToken;

  try {
    req.nodeId = verifyNodeToken(token);
    next();
  } catch (error) {
    return res.status(401).json({ success: false, error: 'invalid node token' });
  }
}

router.use(restrictInternalNetwork);
router.use(authenticateNode);

router.post('/gateway/register', async (req, res) => {
  try {
    const node = await distributedSessionService.registerGatewayNode({
      ...(req.body || {}),
      nodeId: req.nodeId,
    });
    res.json({ success: true, node });
  } catch (error) {
    res.status(400).json({ success: false, error: error.message });
  }
});

router.post('/gateway/heartbeat', async (req, res) => {
  try {
    await distributedSessionService.heartbeatGatewayNode({
      ...(req.body || {}),
      nodeId: req.nodeId,
    });
    res.json({ success: true });
  } catch (error) {
    res.status(400).json({ success: false, error: error.message });
  }
});

// 子节点拉取代理配置(开关 + 启用的订阅);连接器据此生成 Mihomo 配置并决定是否走代理出口
router.get('/proxy-config', async (req, res) => {
  try {
    res.json({ success: true, ...(await proxyService.getConnectorConfig()) });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

router.get('/session/assignments', async (req, res) => {
  try {
    const assignments = await distributedSessionService.getAssignmentsForNode(req.nodeId);
    res.json({ success: true, assignments });
  } catch (error) {
    res.status(400).json({ success: false, error: error.message });
  }
});

router.post('/session/state', async (req, res) => {
  try {
    const { sessionId, status, error } = req.body || {};
    if (!sessionId || !status) {
      return res.status(400).json({
        success: false,
        error: 'sessionId and status are required',
      });
    }
    const result = await distributedSessionService.updateSessionState({
      nodeId: req.nodeId,
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
    const { sessionId, eventType, payload } = req.body || {};
    if (!sessionId || !eventType) {
      return res.status(400).json({
        success: false,
        error: 'sessionId and eventType are required',
      });
    }
    const result = await distributedSessionService.publishNodeEvent({
      nodeId: req.nodeId,
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
    const { limit } = req.query;
    const commands = await distributedSessionService.claimCommandsForNode(
      req.nodeId,
      Number(limit || 20)
    );
    res.json({ success: true, commands });
  } catch (error) {
    res.status(400).json({ success: false, error: error.message });
  }
});

router.post('/session/commands/:id/result', async (req, res) => {
  try {
    const commandId = req.params.id;
    const { success, result, error } = req.body || {};
    const normalizedSuccess =
      success === true || success === 'true' || success === 1 || success === '1';
    const payload = await distributedSessionService.completeCommandForNode({
      nodeId: req.nodeId,
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
