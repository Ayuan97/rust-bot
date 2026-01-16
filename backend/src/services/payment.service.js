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

import prisma from '../lib/prisma.js';
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
    const where = includeInactive ? {} : { isActive: true };

    const plans = await prisma.subscription_plans.findMany({
      where,
      orderBy: { sortOrder: 'asc' },
    });

    return plans.map(plan => ({
      ...plan,
      price: parseFloat(plan.price),
      features: plan.features || [],
    }));
  }

  /**
   * 根据 ID 获取套餐
   * @param {string} planId - 套餐 ID
   * @returns {Promise<Object|null>} 套餐信息
   */
  async getPlanById(planId) {
    const plan = await prisma.subscription_plans.findUnique({
      where: { id: planId },
    });

    if (!plan) return null;

    return {
      ...plan,
      price: parseFloat(plan.price),
      features: plan.features || [],
    };
  }

  /**
   * 根据代码获取套餐
   * @param {string} code - 套餐代码
   * @returns {Promise<Object|null>} 套餐信息
   */
  async getPlanByCode(code) {
    const plan = await prisma.subscription_plans.findUnique({
      where: { code },
    });

    if (!plan) return null;

    return {
      ...plan,
      price: parseFloat(plan.price),
      features: plan.features || [],
    };
  }

  /**
   * 创建套餐
   * @param {Object} data - 套餐数据
   * @returns {Promise<Object>} 创建的套餐
   */
  async createPlan(data) {
    const plan = await prisma.subscription_plans.create({
      data: {
        code: data.code,
        name: data.name,
        price: data.price,
        duration: data.duration,
        description: data.description || null,
        features: data.features || [],
        sortOrder: data.sortOrder || 0,
        isActive: data.isActive !== false,
        highlighted: data.highlighted || false,
      },
    });

    return {
      ...plan,
      price: parseFloat(plan.price),
      features: plan.features || [],
    };
  }

  /**
   * 更新套餐
   * @param {string} planId - 套餐 ID
   * @param {Object} data - 更新数据
   * @returns {Promise<Object>} 更新后的套餐
   */
  async updatePlan(planId, data) {
    const updateData = {};

    if (data.code !== undefined) updateData.code = data.code;
    if (data.name !== undefined) updateData.name = data.name;
    if (data.price !== undefined) updateData.price = data.price;
    if (data.duration !== undefined) updateData.duration = data.duration;
    if (data.description !== undefined) updateData.description = data.description;
    if (data.features !== undefined) updateData.features = data.features;
    if (data.sortOrder !== undefined) updateData.sortOrder = data.sortOrder;
    if (data.isActive !== undefined) updateData.isActive = data.isActive;
    if (data.highlighted !== undefined) updateData.highlighted = data.highlighted;

    const plan = await prisma.subscription_plans.update({
      where: { id: planId },
      data: updateData,
    });

    return {
      ...plan,
      price: parseFloat(plan.price),
      features: plan.features || [],
    };
  }

  /**
   * 删除套餐
   * @param {string} planId - 套餐 ID
   * @returns {Promise<boolean>} 是否成功
   */
  async deletePlan(planId) {
    // 检查是否有关联的订单
    const orderCount = await prisma.orders.count({
      where: { planId },
    });

    if (orderCount > 0) {
      throw new Error(`该套餐已有 ${orderCount} 个关联订单，无法删除。请先禁用该套餐。`);
    }

    await prisma.subscription_plans.delete({
      where: { id: planId },
    });

    return true;
  }

  /**
   * 初始化默认套餐（如果不存在）
   * @returns {Promise<void>}
   */
  async initDefaultPlans() {
    const existingPlans = await prisma.subscription_plans.count();

    if (existingPlans > 0) {
      console.log('📦 套餐配置已存在，跳过初始化');
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
      await prisma.subscription_plans.create({ data: plan });
    }

    console.log('📦 已初始化默认套餐配置');
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
    const user = await prisma.users.findUnique({
      where: { id: userId },
      include: { subscriptions: true },
    });

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
    const order = await prisma.orders.create({
      data: {
        userId,
        planId,
        amount: plan.price,
        paymentMethod,
        status: 'PENDING',
        expireAt,
      },
      include: {
        plan: true,
      },
    });

    return {
      ...order,
      amount: parseFloat(order.amount),
      duration: plan.duration,
      planName: plan.name,
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
    const user = await prisma.users.findUnique({
      where: { id: userId },
      include: { subscriptions: true },
    });

    if (!user) {
      throw new Error('用户不存在');
    }

    // 获取套餐价格
    const amount = LEGACY_PLAN_PRICES[planType];

    // 计算订单过期时间
    const expireAt = new Date();
    expireAt.setMinutes(expireAt.getMinutes() + ORDER_EXPIRE_MINUTES);

    // 创建订单
    const order = await prisma.orders.create({
      data: {
        userId,
        planType,
        amount,
        paymentMethod,
        status: 'PENDING',
        expireAt,
      },
    });

    return {
      ...order,
      duration: LEGACY_PLAN_DURATIONS[planType],
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

    const where = { userId };
    if (status) {
      where.status = status;
    }

    const orders = await prisma.orders.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      take: limit,
      include: {
        plan: true,
      },
    });

    return orders.map(order => {
      // 如果有关联套餐，使用套餐配置；否则使用旧版配置
      const duration = order.plan
        ? order.plan.duration
        : (order.planType ? LEGACY_PLAN_DURATIONS[order.planType] : null);

      return {
        ...order,
        amount: parseFloat(order.amount),
        duration,
        planName: order.plan?.name || order.planType,
      };
    });
  }

  /**
   * 根据 ID 获取订单
   * @param {string} orderId - 订单 ID
   * @returns {Promise<Object|null>} 订单信息
   */
  async getOrderById(orderId) {
    const order = await prisma.orders.findUnique({
      where: { id: orderId },
      include: {
        users: {
          select: {
            id: true,
            username: true,
            email: true,
          },
        },
        plan: true,
      },
    });

    if (!order) {
      return null;
    }

    const duration = order.plan
      ? order.plan.duration
      : (order.planType ? LEGACY_PLAN_DURATIONS[order.planType] : null);

    return {
      ...order,
      amount: parseFloat(order.amount),
      duration,
      planName: order.plan?.name || order.planType,
    };
  }

  /**
   * 根据交易号获取订单
   * @param {string} tradeNo - 交易号
   * @returns {Promise<Object|null>} 订单信息
   */
  async getOrderByTradeNo(tradeNo) {
    const order = await prisma.orders.findFirst({
      where: { tradeNo },
      include: {
        users: {
          select: {
            id: true,
            username: true,
            email: true,
          },
        },
        plan: true,
      },
    });

    if (!order) {
      return null;
    }

    const duration = order.plan
      ? order.plan.duration
      : (order.planType ? LEGACY_PLAN_DURATIONS[order.planType] : null);

    return {
      ...order,
      amount: parseFloat(order.amount),
      duration,
      planName: order.plan?.name || order.planType,
    };
  }

  /**
   * 更新订单状态
   * @param {string} orderId - 订单 ID
   * @param {Object} updates - 更新数据
   * @returns {Promise<Object>} 更新后的订单
   */
  async updateOrder(orderId, updates) {
    const order = await prisma.orders.update({
      where: { id: orderId },
      data: updates,
    });

    return order;
  }

  /**
   * 标记订单为已支付,并延长用户订阅时间
   * @param {string} orderId - 订单 ID
   * @param {string} tradeNo - 交易号
   * @returns {Promise<Object>} 更新结果
   */
  async markOrderAsPaid(orderId, tradeNo) {
    // 获取订单
    const order = await prisma.orders.findUnique({
      where: { id: orderId },
      include: {
        users: {
          include: {
            subscriptions: true,
          },
        },
        plan: true,
      },
    });

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
      await prisma.orders.update({
        where: { id: orderId },
        data: { status: 'EXPIRED' },
      });
      throw new Error('订单已过期');
    }

    // 获取套餐时长
    const duration = order.plan
      ? order.plan.duration
      : (order.planType ? LEGACY_PLAN_DURATIONS[order.planType] : 30);

    const result = await prisma.$transaction(async (tx) => {
      // 1. 更新订单状态
      const updatedOrder = await tx.orders.update({
        where: { id: orderId },
        data: {
          status: 'PAID',
          tradeNo,
          paidAt: new Date(),
        },
      });

      // 2. 延长用户订阅时间
      const now = new Date();

      // 计算新的到期时间
      let newEndDate;
      if (order.users.subscriptions && order.users.subscriptions.endDate > now) {
        // 如果当前订阅未过期,在现有基础上延长
        newEndDate = new Date(order.users.subscriptions.endDate);
        newEndDate.setDate(newEndDate.getDate() + duration);
      } else {
        // 如果当前订阅已过期或不存在,从现在开始计算
        newEndDate = new Date();
        newEndDate.setDate(newEndDate.getDate() + duration);
      }

      // 更新或创建订阅
      const subscription = await tx.subscriptions.upsert({
        where: { userId: order.userId },
        create: {
          userId: order.userId,
          planType: order.planType || 'MONTHLY',
          startDate: now,
          endDate: newEndDate,
          amount: order.amount,
          paymentMethod: order.paymentMethod,
          transactionId: tradeNo,
        },
        update: {
          planType: order.planType || 'MONTHLY',
          endDate: newEndDate,
          amount: order.amount,
          paymentMethod: order.paymentMethod,
          transactionId: tradeNo,
        },
      });

      return {
        order: updatedOrder,
        subscription,
      };
    });

    return result;
  }

  /**
   * 标记订单为失败
   * @param {string} orderId - 订单 ID
   * @param {string} reason - 失败原因
   * @returns {Promise<Object>} 更新后的订单
   */
  async markOrderAsFailed(orderId, reason) {
    const order = await prisma.orders.update({
      where: { id: orderId },
      data: { status: 'FAILED' },
    });

    console.log(`订单 ${orderId} 支付失败: ${reason}`);
    return order;
  }

  /**
   * 取消订单
   * @param {string} orderId - 订单 ID
   * @param {string} userId - 用户 ID (用于权限验证)
   * @returns {Promise<Object>} 更新后的订单
   */
  async cancelOrder(orderId, userId) {
    const order = await prisma.orders.findUnique({
      where: { id: orderId },
    });

    if (!order) {
      throw new Error('订单不存在');
    }

    if (order.userId !== userId) {
      throw new Error('无权取消此订单');
    }

    if (order.status !== 'PENDING') {
      throw new Error(`订单状态为 ${order.status},无法取消`);
    }

    const updatedOrder = await prisma.orders.update({
      where: { id: orderId },
      data: { status: 'CANCELLED' },
    });

    return updatedOrder;
  }

  /**
   * 清理过期订单 (定时任务)
   * @returns {Promise<number>} 清理的订单数量
   */
  async cleanExpiredOrders() {
    const now = new Date();

    const result = await prisma.orders.updateMany({
      where: {
        status: 'PENDING',
        expireAt: {
          lt: now,
        },
      },
      data: {
        status: 'EXPIRED',
      },
    });

    if (result.count > 0) {
      console.log(`清理了 ${result.count} 个过期订单`);
    }

    return result.count;
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
