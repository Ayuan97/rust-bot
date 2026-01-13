/**
 * 支付服务
 *
 * 功能:
 * - 创建订单
 * - 查询订单
 * - 更新订单状态
 * - 处理支付回调
 * - 延长用户订阅时间
 */

import prisma from '../lib/prisma.js';
import { v4 as uuidv4 } from 'uuid';

// 套餐价格配置 (单位:元)
const PLAN_PRICES = {
  TRIAL: 0,        // 试用免费
  MONTHLY: 29,     // 月付 ¥29
  QUARTERLY: 79,   // 季付 ¥79
  YEARLY: 299,     // 年付 ¥299
};

// 套餐时长配置 (单位:天)
const PLAN_DURATIONS = {
  TRIAL: 7,        // 试用 7 天
  MONTHLY: 30,     // 月付 30 天
  QUARTERLY: 90,   // 季付 90 天
  YEARLY: 365,     // 年付 365 天
};

// 订单过期时间 (单位:分钟)
const ORDER_EXPIRE_MINUTES = 30;

class PaymentService {
  /**
   * 创建订单
   * @param {string} userId - 用户 ID
   * @param {string} planType - 套餐类型 (MONTHLY | QUARTERLY | YEARLY)
   * @param {string} paymentMethod - 支付方式 (ALIPAY | WECHAT)
   * @returns {Promise<Object>} 订单信息
   */
  async createOrder(userId, planType, paymentMethod) {
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
    const amount = PLAN_PRICES[planType];

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
      duration: PLAN_DURATIONS[planType],
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
    });

    return orders.map(order => ({
      ...order,
      duration: PLAN_DURATIONS[order.planType],
    }));
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
      },
    });

    if (!order) {
      return null;
    }

    return {
      ...order,
      duration: PLAN_DURATIONS[order.planType],
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
      },
    });

    if (!order) {
      return null;
    }

    return {
      ...order,
      duration: PLAN_DURATIONS[order.planType],
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
      const duration = PLAN_DURATIONS[order.planType];
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
          planType: order.planType,
          startDate: now,
          endDate: newEndDate,
          amount: order.amount,
          paymentMethod: order.paymentMethod,
          transactionId: tradeNo,
        },
        update: {
          planType: order.planType,
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
   * 获取套餐价格配置
   * @returns {Object} 价格配置
   */
  getPlanPrices() {
    return PLAN_PRICES;
  }

  /**
   * 获取套餐时长配置
   * @returns {Object} 时长配置
   */
  getPlanDurations() {
    return PLAN_DURATIONS;
  }
}

// 导出单例
export default new PaymentService();
