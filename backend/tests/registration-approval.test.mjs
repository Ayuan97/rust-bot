import test, { after } from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import jwt from 'jsonwebtoken';
import db from '../src/lib/db.js';
import authRoutes from '../src/routes/auth.routes.js';
import adminRoutes from '../src/routes/admin.routes.js';
import paymentRoutes from '../src/routes/payment.routes.js';
import { requireApprovedAccount } from '../src/middleware/auth.middleware.js';
import appConfigService from '../src/services/app-config.service.js';
import globalServiceManager from '../src/services/global-manager.service.js';
import websocketService from '../src/services/websocket.service.js';
import alipayService from '../src/services/alipay.service.js';

const TEST_JWT_SECRET = 'registration-approval-test-secret';
const originalJwtSecret = process.env.JWT_SECRET;

after(async () => {
  process.env.JWT_SECRET = originalJwtSecret;
  await db.end().catch(() => {});
});

async function withRouter(prefix, router, run) {
  const app = express();
  app.use(express.json());
  app.use(prefix, router);
  const server = await new Promise((resolve) => {
    const listener = app.listen(0, '127.0.0.1', () => resolve(listener));
  });

  try {
    const { port } = server.address();
    return await run(`http://127.0.0.1:${port}`);
  } finally {
    await new Promise((resolve, reject) => {
      server.close((error) => error ? reject(error) : resolve());
    });
  }
}

function createResponseRecorder() {
  return {
    statusCode: 200,
    body: null,
    status(code) {
      this.statusCode = code;
      return this;
    },
    json(body) {
      this.body = body;
      return this;
    }
  };
}

test('approval middleware blocks pending and rejected accounts', () => {
  for (const approvalStatus of ['PENDING', 'REJECTED']) {
    const res = createResponseRecorder();
    let nextCalled = false;
    requireApprovedAccount({ user: { approvalStatus } }, res, () => { nextCalled = true; });
    assert.equal(res.statusCode, 403);
    assert.equal(nextCalled, false);
  }

  const res = createResponseRecorder();
  let nextCalled = false;
  requireApprovedAccount({ user: { approvalStatus: 'APPROVED' } }, res, () => { nextCalled = true; });
  assert.equal(nextCalled, true);
});

test('approval-mode registration creates a pending account without consuming trial time', async () => {
  const originalQuery = db.query;
  const originalGetConnection = db.getConnection;
  const originalConfig = appConfigService.getConfig;
  const inserted = [];
  let committed = false;

  process.env.JWT_SECRET = TEST_JWT_SECRET;
  db.query = async (sql) => {
    if (sql.includes('SELECT id FROM users WHERE username')) return [[], []];
    throw new Error(`Unexpected pool query: ${sql}`);
  };
  db.getConnection = async () => ({
    beginTransaction: async () => {},
    query: async (sql, params) => {
      inserted.push({ sql, params });
      return [{ affectedRows: 1 }, []];
    },
    commit: async () => { committed = true; },
    rollback: async () => {},
    release: () => {}
  });
  appConfigService.getConfig = () => ({
    registrationMode: 'approval',
    freeTrialEnabled: true,
    freeTrialDays: 30
  });

  try {
    const response = await withRouter('/api/auth', authRoutes, (baseUrl) => fetch(`${baseUrl}/api/auth/register`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ username: 'pending_user', password: 'test1234', confirmPassword: 'test1234' })
    }));
    const body = await response.json();

    assert.equal(response.status, 201);
    assert.equal(body.data.user.approvalStatus, 'PENDING');
    assert.equal(committed, true);
    const subscriptionInsert = inserted.find(({ sql }) => sql.includes('INSERT INTO subscriptions'));
    const [, , endDate, createdAt] = subscriptionInsert.params;
    assert.ok(Math.abs(endDate.getTime() - createdAt.getTime()) < 1000);
  } finally {
    db.query = originalQuery;
    db.getConnection = originalGetConnection;
    appConfigService.getConfig = originalConfig;
  }
});

test('concurrent duplicate registration returns 409', async () => {
  const originalQuery = db.query;
  const originalGetConnection = db.getConnection;
  const originalConfig = appConfigService.getConfig;
  let rolledBack = false;

  db.query = async (sql) => {
    if (sql.includes('SELECT id FROM users WHERE username')) return [[], []];
    throw new Error(`Unexpected pool query: ${sql}`);
  };
  db.getConnection = async () => ({
    beginTransaction: async () => {},
    query: async (sql) => {
      if (sql.includes('INSERT INTO users')) {
        const error = new Error('duplicate');
        error.code = 'ER_DUP_ENTRY';
        throw error;
      }
      return [{ affectedRows: 1 }, []];
    },
    commit: async () => {},
    rollback: async () => { rolledBack = true; },
    release: () => {}
  });
  appConfigService.getConfig = () => ({ registrationMode: 'approval', freeTrialEnabled: true, freeTrialDays: 30 });

  try {
    const response = await withRouter('/api/auth', authRoutes, (baseUrl) => fetch(`${baseUrl}/api/auth/register`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ username: 'duplicate_user', password: 'test1234', confirmPassword: 'test1234' })
    }));
    const body = await response.json();

    assert.equal(response.status, 409);
    assert.equal(body.error, '用户名已被占用');
    assert.equal(rolledBack, true);
  } finally {
    db.query = originalQuery;
    db.getConnection = originalGetConnection;
    appConfigService.getConfig = originalConfig;
  }
});

async function callApproval({ target, config, action = 'approve', createError = null }) {
  const originalQuery = db.query;
  const originalGetConnection = db.getConnection;
  const originalConfig = appConfigService.getConfig;
  const originalCreate = globalServiceManager.createUserService;
  const originalRemove = globalServiceManager.removeUserService;
  const originalDisconnect = websocketService.disconnectUser;
  const queries = [];
  let committed = false;
  let rolledBack = false;
  let createCalls = 0;

  process.env.JWT_SECRET = TEST_JWT_SECRET;
  db.query = async (sql) => {
    if (sql.includes('FROM users u') && sql.includes('s.id as sub_id')) {
      return [[{
        id: 'admin-user',
        username: 'admin',
        email: null,
        isActive: 1,
        isAdmin: 1,
        approvalStatus: 'APPROVED',
        sub_id: 'admin-sub',
        sub_planType: 'YEARLY',
        sub_status: 'ACTIVE',
        sub_startDate: new Date(Date.now() - 1000),
        sub_endDate: new Date(Date.now() + 86400000),
        sub_autoRenew: 0
      }], []];
    }
    throw new Error(`Unexpected pool query: ${sql}`);
  };
  db.getConnection = async () => ({
    beginTransaction: async () => {},
    query: async (sql, params) => {
      queries.push({ sql, params });
      if (sql.includes('SELECT u.*')) return [[target], []];
      return [{ affectedRows: 1 }, []];
    },
    commit: async () => { committed = true; },
    rollback: async () => { rolledBack = true; },
    release: () => {}
  });
  appConfigService.getConfig = () => config;
  globalServiceManager.userServices.delete(target.id);
  globalServiceManager.createUserService = async () => {
    createCalls++;
    if (createError) throw createError;
    return {};
  };
  globalServiceManager.removeUserService = async () => {};
  websocketService.disconnectUser = () => {};

  try {
    const token = jwt.sign({ userId: 'admin-user' }, TEST_JWT_SECRET, { expiresIn: '1m' });
    const response = await withRouter('/api/admin', adminRoutes, (baseUrl) => fetch(`${baseUrl}/api/admin/users/${target.id}/approval`, {
      method: 'PUT',
      headers: { 'content-type': 'application/json', authorization: `Bearer ${token}` },
      body: JSON.stringify({ action })
    }));
    return { response, body: await response.json(), queries, committed, rolledBack, createCalls };
  } finally {
    db.query = originalQuery;
    db.getConnection = originalGetConnection;
    appConfigService.getConfig = originalConfig;
    globalServiceManager.createUserService = originalCreate;
    globalServiceManager.removeUserService = originalRemove;
    websocketService.disconnectUser = originalDisconnect;
  }
}

test('approval without free trial requires a subscription and does not start service', async () => {
  const result = await callApproval({
    target: {
      id: 'pending-no-trial',
      isAdmin: 0,
      isActive: 1,
      approvalStatus: 'PENDING',
      subscriptionId: 'sub-1',
      subscriptionEndDate: new Date(Date.now() - 1000)
    },
    config: { freeTrialEnabled: false, freeTrialDays: 30 }
  });

  assert.equal(result.response.status, 200);
  assert.equal(result.body.data.approvalStatus, 'APPROVED');
  assert.equal(result.body.data.serviceStatus, 'subscription_required');
  assert.equal(result.createCalls, 0);
  assert.equal(result.committed, true);
  assert.equal(result.queries.some(({ sql }) => sql.includes('UPDATE subscriptions')), false);
});

test('approval reports retrying when service initialization fails', async () => {
  const result = await callApproval({
    target: {
      id: 'pending-retry',
      isAdmin: 0,
      isActive: 1,
      approvalStatus: 'PENDING',
      subscriptionId: 'sub-2',
      subscriptionEndDate: new Date(Date.now() - 1000)
    },
    config: { freeTrialEnabled: true, freeTrialDays: 30 },
    createError: new Error('startup failed')
  });

  assert.equal(result.response.status, 202);
  assert.equal(result.body.data.serviceStatus, 'retrying');
  assert.equal(result.body.data.grantedTrialDays, 30);
  assert.equal(result.createCalls, 1);
  assert.equal(result.queries.some(({ sql }) => sql.includes("status = 'ACTIVE'")), true);
});

test('approval rejects repeated transitions and administrator targets', async () => {
  const repeated = await callApproval({
    target: {
      id: 'already-approved',
      isAdmin: 0,
      isActive: 1,
      approvalStatus: 'APPROVED',
      subscriptionId: 'sub-3',
      subscriptionEndDate: new Date(Date.now() + 86400000)
    },
    config: { freeTrialEnabled: true, freeTrialDays: 30 }
  });
  assert.equal(repeated.response.status, 409);
  assert.equal(repeated.committed, false);
  assert.equal(repeated.rolledBack, true);

  const adminTarget = await callApproval({
    target: {
      id: 'target-admin',
      isAdmin: 1,
      isActive: 1,
      approvalStatus: 'PENDING',
      subscriptionId: 'sub-4',
      subscriptionEndDate: new Date(Date.now() - 1000)
    },
    config: { freeTrialEnabled: true, freeTrialDays: 30 }
  });
  assert.equal(adminTarget.response.status, 400);
  assert.equal(adminTarget.committed, false);
});

test('rejected account can be approved again', async () => {
  const result = await callApproval({
    target: {
      id: 'rejected-user',
      isAdmin: 0,
      isActive: 1,
      approvalStatus: 'REJECTED',
      subscriptionId: 'sub-5',
      subscriptionEndDate: new Date(Date.now() + 86400000)
    },
    config: { freeTrialEnabled: false, freeTrialDays: 30 }
  });

  assert.equal(result.response.status, 200);
  assert.equal(result.body.data.previousApprovalStatus, 'REJECTED');
  assert.equal(result.body.data.serviceStatus, 'running');
  assert.equal(result.createCalls, 1);
});

test('alipay callback accepts form data, activates the subscription, and starts the user service', async () => {
  const originalQuery = db.query;
  const originalGetConnection = db.getConnection;
  const originalCheckNotifySign = alipayService.checkNotifySign;
  const originalCreate = globalServiceManager.createUserService;
  const transactionQueries = [];
  const created = [];
  let signedOrderId = null;

  db.query = async (sql) => {
    if (sql.includes('p.name as planName')) {
      return [[{
        id: 'paid-order',
        userId: 'approved-buyer',
        status: 'PENDING',
        amount: '20.00',
        planId: 'monthly-plan',
        planType: 'MONTHLY',
        paymentMethod: 'ALIPAY',
        planName: '月付',
        planDuration: 30,
        planFeatures: '[]',
        usersId: 'approved-buyer',
        username: 'buyer'
      }], []];
    }
    if (sql.includes('s.id as subscriptionId')) {
      return [[{
        id: 'paid-order',
        userId: 'approved-buyer',
        status: 'PENDING',
        amount: '20.00',
        planType: 'MONTHLY',
        paymentMethod: 'ALIPAY',
        planDuration: 30,
        subscriptionId: 'buyer-subscription',
        subscriptionEndDate: new Date(Date.now() - 1000)
      }], []];
    }
    throw new Error(`Unexpected query: ${sql}`);
  };
  db.getConnection = async () => ({
    beginTransaction: async () => {},
    query: async (sql) => {
      transactionQueries.push(sql);
      return [{ affectedRows: 1 }, []];
    },
    commit: async () => {},
    rollback: async () => {},
    release: () => {}
  });
  alipayService.checkNotifySign = (params) => {
    signedOrderId = params.out_trade_no;
    return true;
  };
  globalServiceManager.userServices.delete('approved-buyer');
  globalServiceManager.createUserService = async (userId) => {
    created.push(userId);
    return {};
  };

  try {
    const response = await withRouter('/api/payment', paymentRoutes, (baseUrl) => fetch(`${baseUrl}/api/payment/callback/alipay`, {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        out_trade_no: 'paid-order',
        trade_no: 'alipay-trade',
        trade_status: 'TRADE_SUCCESS',
        total_amount: '20.00',
        sign: 'test-sign'
      })
    }));

    assert.equal(response.status, 200);
    assert.equal(await response.text(), 'success');
    assert.equal(signedOrderId, 'paid-order');
    assert.deepEqual(created, ['approved-buyer']);
    assert.equal(transactionQueries.some((sql) => sql.includes("status = 'ACTIVE'")), true);
  } finally {
    db.query = originalQuery;
    db.getConnection = originalGetConnection;
    alipayService.checkNotifySign = originalCheckNotifySign;
    globalServiceManager.createUserService = originalCreate;
  }
});

test('subscription check recreates missing eligible user services', async () => {
  const originalQuery = db.query;
  const originalCreate = globalServiceManager.createUserService;
  const originalServices = globalServiceManager.userServices;
  const originalCreatingUsers = globalServiceManager.creatingUsers;
  const created = [];

  globalServiceManager.userServices = new Map();
  globalServiceManager.creatingUsers = new Map();
  db.query = async (sql) => {
    if (sql.includes("s.endDate > NOW()")) return [[{ id: 'eligible-user', username: 'eligible' }], []];
    throw new Error(`Unexpected query: ${sql}`);
  };
  globalServiceManager.createUserService = async (userId) => {
    created.push(userId);
    globalServiceManager.userServices.set(userId, {});
  };

  try {
    await globalServiceManager.checkExpiredSubscriptions();
    assert.deepEqual(created, ['eligible-user']);
  } finally {
    db.query = originalQuery;
    globalServiceManager.createUserService = originalCreate;
    globalServiceManager.userServices = originalServices;
    globalServiceManager.creatingUsers = originalCreatingUsers;
  }
});
