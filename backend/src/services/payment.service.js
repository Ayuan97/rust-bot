/**
 * 支付服务
 *
 * 功能:
 * - 创建订单
 * - 查询订单
 * - 更新订单状态
 * - 处理支付回调
 * - 延长用户订阅时间
 * - 套餐配置管理
 */

import db from '../lib/db.js';
import { v4 as uuidv4 } from 'uuid';

// 旧版套餐价格配置 (单位:元) - 用于向后兼容
const LEGACY_PLAN_PRICES = {
  TRIAL: 0,        // 试用免费
  MONTHLY: 29,     // 月付 ¥29
  QUARTERLY: 79,   // 季付 ¥79
  YEARLY: 299,     // 年付 ¥299
};

// 旧版套餐时长配置 (单位:天) - 用于向后兼容
const LEGACY_PLAN_DURATIONS = {
  TRIAL: 7,        // 试用 7 天
  MONTHLY: 30,     // 月付 30 天
  QUARTERLY: 90,   // 季付 90 天
  YEARLY: 365,     // 年付 365 天
};

// 订单过期时间 (单位:分钟)
const ORDER_EXPIRE_MINUTES = 30;

class PaymentService {
  /**
   * 获取所有启用的套餐配置
   * @param {boolean} includeInactive - 是否包含未启用的套餐
   * @returns {Promise<Array>} 套餐列表
   */
  async getPlans(includeInactive = false) {
    let query = 'SELECT * FROM subscription_plans';
    const params = [];

    if (!includeInactive) {
      query += ' WHERE isActive = 1';
    }
    query += ' ORDER BY sortOrder ASC';

    const [plans] = await db.query(query, params);

    return plans.map(plan => ({
      ...plan,
      price: parseFloat(plan.price),
      features: plan.features ? (typeof plan.features === 'string' ? JSON.parse(plan.features) : plan.features) : [],
      isActive: !!plan.isActive,
      highlighted: !!plan.highlighted
    }));
  }

  /**
   * 根据 ID 获取套餐
   * @param {string} planId - 套餐 ID
   * @returns {Promise<Object|null>} 套餐信息
   */
  async getPlanById(planId) {
    const [rows] = await db.query(
      'SELECT * FROM subscription_plans WHERE id = ?',
      [planId]
    );
    const plan = rows[0];

    if (!plan) return null;

    return {
      ...plan,
      price: parseFloat(plan.price),
      features: plan.features ? (typeof plan.features === 'string' ? JSON.parse(plan.features) : plan.features) : [],
      isActive: !!plan.isActive,
      highlighted: !!plan.highlighted
    };
  }

  /**
   * 根据代码获取套餐
   * @param {string} code - 套餐代码
   * @returns {Promise<Object|null>} 套餐信息
   */
  async getPlanByCode(code) {
    const [rows] = await db.query(
      'SELECT * FROM subscription_plans WHERE code = ?',
      [code]
    );
    const plan = rows[0];

    if (!plan) return null;

    return {
      ...plan,
      price: parseFloat(plan.price),
      features: plan.features ? (typeof plan.features === 'string' ? JSON.parse(plan.features) : plan.features) : [],
      isActive: !!plan.isActive,
      highlighted: !!plan.highlighted
    };
  }

  /**
   * 创建套餐
   * @param {Object} data - 套餐数据
   * @returns {Promise<Object>} 创建的套餐
   */
  async createPlan(data) {
    const id = uuidv4();
    const features = data.features || [];

    await db.query(
      `INSERT INTO subscription_plans
        (id, code, name, price, duration, description, features, sortOrder, isActive, highlighted, createdAt, updatedAt)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NOW(), NOW())`,
      [
        id,
        data.code,
        data.name,
        data.price,
        data.duration,
        data.description || null,
        JSON.stringify(features),
        data.sortOrder || 0,
        data.isActive !== false ? 1 : 0,
        data.highlighted ? 1 : 0
      ]
    );

    return {
      id,
      code: data.code,
      name: data.name,
      price: parseFloat(data.price),
      duration: data.duration,
      description: data.description || null,
      features,
      sortOrder: data.sortOrder || 0,
      isActive: data.isActive !== false,
      highlighted: data.highlighted || false
    };
  }

  /**
   * 更新套餐
   * @param {string} planId - 套餐 ID
   * @param {Object} data - 更新数据
   * @returns {Promise<Object>} 更新后的套餐
   */
  async updatePlan(planId, data) {
    const updateFields = [];
    const updateValues = [];

    if (data.code !== undefined) {
      updateFields.push('code = ?');
      updateValues.push(data.code);
    }
    if (data.name !== undefined) {
      updateFields.push('name = ?');
      updateValues.push(data.name);
    }
    if (data.price !== undefined) {
      updateFields.push('price = ?');
      updateValues.push(data.price);
    }
    if (data.duration !== undefined) {
      updateFields.push('duration = ?');
      updateValues.push(data.duration);
    }
    if (data.description !== undefined) {
      updateFields.push('description = ?');
      updateValues.push(data.description);
    }
    if (data.features !== undefined) {
      updateFields.push('features = ?');
      updateValues.push(JSON.stringify(data.features));
    }
    if (data.sortOrder !== undefined) {
      updateFields.push('sortOrder = ?');
      updateValues.push(data.sortOrder);
    }
    if (data.isActive !== undefined) {
      updateFields.push('isActive = ?');
      updateValues.push(data.isActive ? 1 : 0);
    }
    if (data.highlighted !== undefined) {
      updateFields.push('highlighted = ?');
      updateValues.push(data.highlighted ? 1 : 0);
    }

    updateFields.push('updatedAt = NOW()');
    updateValues.push(planId);

    await db.query(
      `UPDATE subscription_plans SET ${updateFields.join(', ')} WHERE id = ?`,
      updateValues
    );

    // Return the updated plan
    return this.getPlanById(planId);
  }

  /**
   * 删除套餐
   * @param {string} planId - 套餐 ID
   * @returns {Promise<boolean>} 是否成功
   */
  async deletePlan(planId) {
    // 检查是否有关联的订单
    const [countResult] = await db.query(
      'SELECT COUNT(*) as count FROM orders WHERE planId = ?',
      [planId]
    );
    const orderCount = countResult[0].count;

    if (orderCount > 0) {
      throw new Error(`该套餐已有 ${orderCount} 个关联订单，无法删除。请先禁用该套餐。`);
    }

    await db.query(
      'DELETE FROM subscription_plans WHERE id = ?',
      [planId]
    );

    return true;
  }

  /**
   * 初始化默认套餐（如果不存在）
   * @returns {Promise<void>}
   */
  async initDefaultPlans() {
    const [countResult] = await db.query('SELECT COUNT(*) as count FROM subscription_plans');
    const existingPlans = countResult[0].count;

    if (existingPlans > 0) {
      console.log('套餐配置已存在，跳过初始化');
      return;
    }

    const defaultPlans = [
      {
        code: 'WEEKLY',
        name: '周卡',
        price: 9.9,
        duration: 7,
        description: '7天体验套餐',
        features: ['全部核心功能', '实时事件推送', '设备远程控制', '团队状态监控'],
        sortOrder: 1,
        isActive: true,
        highlighted: false,
      },
      {
        code: 'BIWEEKLY',
        name: '半月卡',
        price: 16.9,
        duration: 15,
        description: '15天标准套餐',
        features: ['全部核心功能', '实时事件推送', '设备远程控制', '团队状态监控', '节省 10%'],
        sortOrder: 2,
        isActive: true,
        highlighted: false,
      },
      {
        code: 'MONTHLY',
        name: '月卡',
        price: 29,
        duration: 30,
        description: '30天推荐套餐',
        features: ['全部核心功能', '实时事件推送', '设备远程控制', '团队状态监控', '节省 20%'],
        sortOrder: 3,
        isActive: true,
        highlighted: true,
      },
    ];

    for (const plan of defaultPlans) {
      await db.query(
        `INSERT INTO subscription_plans
          (id, code, name, price, duration, description, features, sortOrder, isActive, highlighted, createdAt, updatedAt)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NOW(), NOW())`,
        [
          uuidv4(),
          plan.code,
          plan.name,
          plan.price,
          plan.duration,
          plan.description,
          JSON.stringify(plan.features),
          plan.sortOrder,
          plan.isActive ? 1 : 0,
          plan.highlighted ? 1 : 0
        ]
      );
    }

    console.log('已初始化默认套餐配置');
  }

  /**
   * 创建订单
   * @param {string} userId - 用户 ID
   * @param {string} planId - 套餐 ID
   * @param {string} paymentMethod - 支付方式 (ALIPAY | WECHAT)
   * @returns {Promise<Object>} 订单信息
   */
  async createOrder(userId, planId, paymentMethod) {
    // 验证支付方式
    if (!['ALIPAY', 'WECHAT'].includes(paymentMethod)) {
      throw new Error(`无效的支付方式: ${paymentMethod}`);
    }

    // 验证用户是否存在
    const [userRows] = await db.query(
      'SELECT u.*, s.id as subscriptionId, s.endDate as subscriptionEndDate FROM users u LEFT JOIN subscriptions s ON u.id = s.userId WHERE u.id = ?',
      [userId]
    );
    const user = userRows[0];

    if (!user) {
      throw new Error('用户不存在');
    }

    // 获取套餐配置
    const plan = await this.getPlanById(planId);
    if (!plan) {
      throw new Error('套餐不存在');
    }

    if (!plan.isActive) {
      throw new Error('该套餐已下架');
    }

    // 计算订单过期时间
    const expireAt = new Date();
    expireAt.setMinutes(expireAt.getMinutes() + ORDER_EXPIRE_MINUTES);

    // 创建订单
    const orderId = uuidv4();
    await db.query(
      `INSERT INTO orders (id, userId, planId, amount, paymentMethod, status, expireAt, createdAt, updatedAt)
       VALUES (?, ?, ?, ?, ?, 'PENDING', ?, NOW(), NOW())`,
      [orderId, userId, planId, plan.price, paymentMethod, expireAt]
    );

    return {
      id: orderId,
      userId,
      planId,
      amount: plan.price,
      paymentMethod,
      status: 'PENDING',
      expireAt,
      duration: plan.duration,
      planName: plan.name,
      plan
    };
  }

  /**
   * 创建订单（旧版兼容 - 使用 planType）
   * @deprecated 请使用新版 createOrder(userId, planId, paymentMethod)
   */
  async createOrderLegacy(userId, planType, paymentMethod) {
    // 验证套餐类型
    if (!['MONTHLY', 'QUARTERLY', 'YEARLY'].includes(planType)) {
      throw new Error(`无效的套餐类型: ${planType}`);
    }

    // 验证支付方式
    if (!['ALIPAY', 'WECHAT'].includes(paymentMethod)) {
      throw new Error(`无效的支付方式: ${paymentMethod}`);
    }

    // 验证用户是否存在
    const [userRows] = await db.query(
      'SELECT u.*, s.id as subscriptionId, s.endDate as subscriptionEndDate FROM users u LEFT JOIN subscriptions s ON u.id = s.userId WHERE u.id = ?',
      [userId]
    );
    const user = userRows[0];

    if (!user) {
      throw new Error('用户不存在');
    }

    // 获取套餐价格
    const amount = LEGACY_PLAN_PRICES[planType];

    // 计算订单过期时间
    const expireAt = new Date();
    expireAt.setMinutes(expireAt.getMinutes() + ORDER_EXPIRE_MINUTES);

    // 创建订单
    const orderId = uuidv4();
    await db.query(
      `INSERT INTO orders (id, userId, planType, amount, paymentMethod, status, expireAt, createdAt, updatedAt)
       VALUES (?, ?, ?, ?, ?, 'PENDING', ?, NOW(), NOW())`,
      [orderId, userId, planType, amount, paymentMethod, expireAt]
    );

    return {
      id: orderId,
      userId,
      planType,
      amount,
      paymentMethod,
      status: 'PENDING',
      expireAt,
      duration: LEGACY_PLAN_DURATIONS[planType]
    };
  }

  /**
   * 获取用户的所有订单
   * @param {string} userId - 用户 ID
   * @param {Object} options - 查询选项
   * @param {number} options.limit - 限制数量
   * @param {string} options.status - 订单状态过滤
   * @returns {Promise<Array>} 订单列表
   */
  async getUserOrders(userId, options = {}) {
    const { limit = 50, status } = options;

    let query = `
      SELECT o.*, p.name as planName, p.duration as planDuration, p.features as planFeatures
      FROM orders o
      LEFT JOIN subscription_plans p ON o.planId = p.id
      WHERE o.userId = ?
    `;
    const params = [userId];

    if (status) {
      query += ' AND o.status = ?';
      params.push(status);
    }

    query += ' ORDER BY o.createdAt DESC LIMIT ?';
    params.push(limit);

    const [orders] = await db.query(query, params);

    return orders.map(order => {
      // 如果有关联套餐，使用套餐配置；否则使用旧版配置
      const duration = order.planDuration || (order.planType ? LEGACY_PLAN_DURATIONS[order.planType] : null);

      return {
        ...order,
        amount: parseFloat(order.amount),
        duration,
        planName: order.planName || order.planType,
        plan: order.planId ? {
          id: order.planId,
          name: order.planName,
          duration: order.planDuration,
          features: order.planFeatures ? (typeof order.planFeatures === 'string' ? JSON.parse(order.planFeatures) : order.planFeatures) : []
        } : null
      };
    });
  }

  /**
   * 根据 ID 获取订单
   * @param {string} orderId - 订单 ID
   * @returns {Promise<Object|null>} 订单信息
   */
  async getOrderById(orderId) {
    const [rows] = await db.query(
      `SELECT o.*, p.name as planName, p.duration as planDuration, p.features as planFeatures,
              u.id as usersId, u.username, u.email
       FROM orders o
       LEFT JOIN subscription_plans p ON o.planId = p.id
       LEFT JOIN users u ON o.userId = u.id
       WHERE o.id = ?`,
      [orderId]
    );
    const order = rows[0];

    if (!order) {
      return null;
    }

    const duration = order.planDuration || (order.planType ? LEGACY_PLAN_DURATIONS[order.planType] : null);

    return {
      ...order,
      amount: parseFloat(order.amount),
      duration,
      planName: order.planName || order.planType,
      users: order.usersId ? {
        id: order.usersId,
        username: order.username,
        email: order.email
      } : null,
      plan: order.planId ? {
        id: order.planId,
        name: order.planName,
        duration: order.planDuration,
        features: order.planFeatures ? (typeof order.planFeatures === 'string' ? JSON.parse(order.planFeatures) : order.planFeatures) : []
      } : null
    };
  }

  /**
   * 根据交易号获取订单
   * @param {string} tradeNo - 交易号
   * @returns {Promise<Object|null>} 订单信息
   */
  async getOrderByTradeNo(tradeNo) {
    const [rows] = await db.query(
      `SELECT o.*, p.name as planName, p.duration as planDuration, p.features as planFeatures,
              u.id as usersId, u.username, u.email
       FROM orders o
       LEFT JOIN subscription_plans p ON o.planId = p.id
       LEFT JOIN users u ON o.userId = u.id
       WHERE o.tradeNo = ?`,
      [tradeNo]
    );
    const order = rows[0];

    if (!order) {
      return null;
    }

    const duration = order.planDuration || (order.planType ? LEGACY_PLAN_DURATIONS[order.planType] : null);

    return {
      ...order,
      amount: parseFloat(order.amount),
      duration,
      planName: order.planName || order.planType,
      users: order.usersId ? {
        id: order.usersId,
        username: order.username,
        email: order.email
      } : null,
      plan: order.planId ? {
        id: order.planId,
        name: order.planName,
        duration: order.planDuration,
        features: order.planFeatures ? (typeof order.planFeatures === 'string' ? JSON.parse(order.planFeatures) : order.planFeatures) : []
      } : null
    };
  }

  /**
   * 更新订单状态
   * @param {string} orderId - 订单 ID
   * @param {Object} updates - 更新数据
   * @returns {Promise<Object>} 更新后的订单
   */
  async updateOrder(orderId, updates) {
    const updateFields = [];
    const updateValues = [];

    for (const [key, value] of Object.entries(updates)) {
      updateFields.push(`${key} = ?`);
      updateValues.push(value);
    }

    updateFields.push('updatedAt = NOW()');
    updateValues.push(orderId);

    await db.query(
      `UPDATE orders SET ${updateFields.join(', ')} WHERE id = ?`,
      updateValues
    );

    return this.getOrderById(orderId);
  }

  /**
   * 标记订单为已支付,并延长用户订阅时间
   * @param {string} orderId - 订单 ID
   * @param {string} tradeNo - 交易号
   * @returns {Promise<Object>} 更新结果
   */
  async markOrderAsPaid(orderId, tradeNo) {
    // 获取订单
    const [orderRows] = await db.query(
      `SELECT o.*, p.duration as planDuration,
              u.id as usersId, s.id as subscriptionId, s.endDate as subscriptionEndDate
       FROM orders o
       LEFT JOIN subscription_plans p ON o.planId = p.id
       LEFT JOIN users u ON o.userId = u.id
       LEFT JOIN subscriptions s ON u.id = s.userId
       WHERE o.id = ?`,
      [orderId]
    );
    const order = orderRows[0];

    if (!order) {
      throw new Error('订单不存在');
    }

    if (order.status === 'PAID') {
      throw new Error('订单已支付,请勿重复支付');
    }

    if (order.status !== 'PENDING') {
      throw new Error(`订单状态异常: ${order.status}`);
    }

    // 检查订单是否过期
    if (order.expireAt && new Date() > order.expireAt) {
      await db.query(
        `UPDATE orders SET status = 'EXPIRED', updatedAt = NOW() WHERE id = ?`,
        [orderId]
      );
      throw new Error('订单已过期');
    }

    // 获取套餐时长
    const duration = order.planDuration || (order.planType ? LEGACY_PLAN_DURATIONS[order.planType] : 30);

    // 开启事务
    const conn = await db.getConnection();
    try {
      await conn.beginTransaction();

      // 1. 更新订单状态
      await conn.query(
        `UPDATE orders SET status = 'PAID', tradeNo = ?, paidAt = NOW(), updatedAt = NOW() WHERE id = ?`,
        [tradeNo, orderId]
      );

      // 2. 延长用户订阅时间
      const now = new Date();

      // 计算新的到期时间
      let newEndDate;
      if (order.subscriptionEndDate && new Date(order.subscriptionEndDate) > now) {
        // 如果当前订阅未过期,在现有基础上延长
        newEndDate = new Date(order.subscriptionEndDate);
        newEndDate.setDate(newEndDate.getDate() + duration);
      } else {
        // 如果当前订阅已过期或不存在,从现在开始计算
        newEndDate = new Date();
        newEndDate.setDate(newEndDate.getDate() + duration);
      }

      // 更新或创建订阅
      if (order.subscriptionId) {
        await conn.query(
          `UPDATE subscriptions SET
            planType = ?, endDate = ?, amount = ?, paymentMethod = ?, transactionId = ?, updatedAt = NOW()
           WHERE userId = ?`,
          [order.planType || 'MONTHLY', newEndDate, order.amount, order.paymentMethod, tradeNo, order.userId]
        );
      } else {
        await conn.query(
          `INSERT INTO subscriptions (id, userId, planType, startDate, endDate, amount, paymentMethod, transactionId, createdAt, updatedAt)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, NOW(), NOW())`,
          [uuidv4(), order.userId, order.planType || 'MONTHLY', now, newEndDate, order.amount, order.paymentMethod, tradeNo]
        );
      }

      await conn.commit();

      return {
        order: { id: orderId, status: 'PAID', tradeNo, paidAt: now },
        subscription: { endDate: newEndDate }
      };
    } catch (err) {
      await conn.rollback();
      throw err;
    } finally {
      conn.release();
    }
  }

  /**
   * 标记订单为失败
   * @param {string} orderId - 订单 ID
   * @param {string} reason - 失败原因
   * @returns {Promise<Object>} 更新后的订单
   */
  async markOrderAsFailed(orderId, reason) {
    await db.query(
      `UPDATE orders SET status = 'FAILED', updatedAt = NOW() WHERE id = ?`,
      [orderId]
    );

    console.log(`订单 ${orderId} 支付失败: ${reason}`);
    return this.getOrderById(orderId);
  }

  /**
   * 取消订单
   * @param {string} orderId - 订单 ID
   * @param {string} userId - 用户 ID (用于权限验证)
   * @returns {Promise<Object>} 更新后的订单
   */
  async cancelOrder(orderId, userId) {
    const [rows] = await db.query(
      'SELECT * FROM orders WHERE id = ?',
      [orderId]
    );
    const order = rows[0];

    if (!order) {
      throw new Error('订单不存在');
    }

    if (order.userId !== userId) {
      throw new Error('无权取消此订单');
    }

    if (order.status !== 'PENDING') {
      throw new Error(`订单状态为 ${order.status},无法取消`);
    }

    await db.query(
      `UPDATE orders SET status = 'CANCELLED', updatedAt = NOW() WHERE id = ?`,
      [orderId]
    );

    return this.getOrderById(orderId);
  }

  /**
   * 清理过期订单 (定时任务)
   * @returns {Promise<number>} 清理的订单数量
   */
  async cleanExpiredOrders() {
    const [result] = await db.query(
      `UPDATE orders SET status = 'EXPIRED', updatedAt = NOW()
       WHERE status = 'PENDING' AND expireAt < NOW()`
    );

    if (result.affectedRows > 0) {
      console.log(`清理了 ${result.affectedRows} 个过期订单`);
    }

    return result.affectedRows;
  }

  /**
   * 获取套餐价格配置（旧版兼容）
   * @returns {Object} 价格配置
   */
  getPlanPrices() {
    return LEGACY_PLAN_PRICES;
  }

  /**
   * 获取套餐时长配置（旧版兼容）
   * @returns {Object} 时长配置
   */
  getPlanDurations() {
    return LEGACY_PLAN_DURATIONS;
  }
}

// 导出单例
export default new PaymentService();
