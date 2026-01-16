/**
 * 支付路由
 *
 * API 端点:
 * - POST   /api/payment/create-order   - 创建订单
 * - GET    /api/payment/orders         - 获取当前用户的订单列表
 * - GET    /api/payment/orders/:id     - 获取订单详情
 * - POST   /api/payment/orders/:id/cancel - 取消订单
 * - GET    /api/payment/plans          - 获取套餐价格配置（公开）
 */

import express from 'express';
import paymentService from '../services/payment.service.js';
import alipayService from '../services/alipay.service.js';
import { authenticate } from '../middleware/auth.middleware.js';

const router = express.Router();

/**
 * GET /api/payment/plans
 * 获取套餐配置（公开接口，用于首页展示）
 *
 * 响应:
 * {
 *   "success": true,
 *   "plans": [ { id, code, name, price, duration, description, features, highlighted } ]
 * }
 */
router.get('/plans', async (req, res) => {
  try {
    const plans = await paymentService.getPlans(false); // 只获取启用的套餐

    res.json({
      success: true,
      plans,
    });
  } catch (error) {
    console.error('[支付] 获取套餐配置失败:', error);
    res.status(500).json({
      success: false,
      error: error.message || '获取套餐配置失败',
    });
  }
});

/**
 * POST /api/payment/create-order
 * 创建支付订单
 *
 * 请求体:
 * {
 *   "planId": "套餐 ID",
 *   "paymentMethod": "ALIPAY" | "WECHAT"
 * }
 *
 * 响应:
 * {
 *   "success": true,
 *   "order": { ... }
 * }
 */
router.post('/create-order', authenticate, async (req, res) => {
  try {
    const { planId, paymentMethod } = req.body;
    const userId = req.user.id;

    // 验证必填字段
    if (!planId || !paymentMethod) {
      return res.status(400).json({
        success: false,
        error: '缺少必填字段: planId 或 paymentMethod',
      });
    }

    // 创建订单
    const order = await paymentService.createOrder(userId, planId, paymentMethod);

    console.log(`[支付] 用户 ${userId} 创建订单: ${order.id} (套餐: ${order.planName}, ${paymentMethod})`);

    res.json({
      success: true,
      order,
    });
  } catch (error) {
    console.error('[支付] 创建订单失败:', error);
    res.status(500).json({
      success: false,
      error: error.message || '创建订单失败',
    });
  }
});

/**
 * GET /api/payment/orders
 * 获取当前用户的订单列表
 *
 * 查询参数:
 * - limit: 数量限制 (默认 50)
 * - status: 订单状态过滤 (可选)
 *
 * 响应:
 * {
 *   "success": true,
 *   "orders": [ ... ]
 * }
 */
router.get('/orders', authenticate, async (req, res) => {
  try {
    const userId = req.user.id;
    const { limit, status } = req.query;

    const options = {};
    if (limit) {
      options.limit = parseInt(limit, 10);
    }
    if (status) {
      options.status = status;
    }

    const orders = await paymentService.getUserOrders(userId, options);

    res.json({
      success: true,
      orders,
    });
  } catch (error) {
    console.error('[支付] 获取订单列表失败:', error);
    res.status(500).json({
      success: false,
      error: error.message || '获取订单列表失败',
    });
  }
});

/**
 * GET /api/payment/orders/:id
 * 获取订单详情
 *
 * 响应:
 * {
 *   "success": true,
 *   "order": { ... }
 * }
 */
router.get('/orders/:id', authenticate, async (req, res) => {
  try {
    const { id } = req.params;
    const userId = req.user.id;

    const order = await paymentService.getOrderById(id);

    if (!order) {
      return res.status(404).json({
        success: false,
        error: '订单不存在',
      });
    }

    // 验证订单所属用户
    if (order.userId !== userId && !req.user.isAdmin) {
      return res.status(403).json({
        success: false,
        error: '无权访问此订单',
      });
    }

    res.json({
      success: true,
      order,
    });
  } catch (error) {
    console.error('[支付] 获取订单详情失败:', error);
    res.status(500).json({
      success: false,
      error: error.message || '获取订单详情失败',
    });
  }
});

/**
 * POST /api/payment/orders/:id/cancel
 * 取消订单
 *
 * 响应:
 * {
 *   "success": true,
 *   "order": { ... }
 * }
 */
router.post('/orders/:id/cancel', authenticate, async (req, res) => {
  try {
    const { id } = req.params;
    const userId = req.user.id;

    const order = await paymentService.cancelOrder(id, userId);

    console.log(`[支付] 用户 ${userId} 取消订单: ${id}`);

    res.json({
      success: true,
      order,
    });
  } catch (error) {
    console.error('[支付] 取消订单失败:', error);
    res.status(500).json({
      success: false,
      error: error.message || '取消订单失败',
    });
  }
});

// ========== 支付宝相关接口 ==========

/**
 * POST /api/payment/alipay/qrcode
 * 创建支付宝扫码支付(Native 支付)
 *
 * 请求体:
 * {
 *   "orderId": "订单 ID"
 * }
 *
 * 响应:
 * {
 *   "success": true,
 *   "qrCode": "data:image/png;base64,...",
 *   "qrCodeUrl": "https://...",
 *   "tradeNo": "商户订单号"
 * }
 */
router.post('/alipay/qrcode', authenticate, async (req, res) => {
  try {
    const { orderId } = req.body;
    const userId = req.user.id;

    if (!orderId) {
      return res.status(400).json({
        success: false,
        error: '缺少订单 ID',
      });
    }

    // 获取订单
    const order = await paymentService.getOrderById(orderId);

    if (!order) {
      return res.status(404).json({
        success: false,
        error: '订单不存在',
      });
    }

    // 验证订单所属用户
    if (order.userId !== userId) {
      return res.status(403).json({
        success: false,
        error: '无权操作此订单',
      });
    }

    // 验证订单状态
    if (order.status !== 'PENDING') {
      return res.status(400).json({
        success: false,
        error: `订单状态为 ${order.status},无法支付`,
      });
    }

    // 验证支付方式
    if (order.paymentMethod !== 'ALIPAY') {
      return res.status(400).json({
        success: false,
        error: '订单支付方式不是支付宝',
      });
    }

    // 创建支付宝扫码支付
    const result = await alipayService.createQRCodePay(order);

    res.json({
      success: true,
      ...result,
    });
  } catch (error) {
    console.error('[支付宝] 创建扫码支付失败:', error);
    res.status(500).json({
      success: false,
      error: error.message || '创建扫码支付失败',
    });
  }
});

/**
 * POST /api/payment/alipay/page
 * 创建支付宝电脑网站支付(跳转支付)
 *
 * 请求体:
 * {
 *   "orderId": "订单 ID"
 * }
 *
 * 响应:
 * {
 *   "success": true,
 *   "payUrl": "https://..."
 * }
 */
router.post('/alipay/page', authenticate, async (req, res) => {
  try {
    const { orderId } = req.body;
    const userId = req.user.id;

    if (!orderId) {
      return res.status(400).json({
        success: false,
        error: '缺少订单 ID',
      });
    }

    // 获取订单
    const order = await paymentService.getOrderById(orderId);

    if (!order) {
      return res.status(404).json({
        success: false,
        error: '订单不存在',
      });
    }

    // 验证订单所属用户
    if (order.userId !== userId) {
      return res.status(403).json({
        success: false,
        error: '无权操作此订单',
      });
    }

    // 验证订单状态
    if (order.status !== 'PENDING') {
      return res.status(400).json({
        success: false,
        error: `订单状态为 ${order.status},无法支付`,
      });
    }

    // 验证支付方式
    if (order.paymentMethod !== 'ALIPAY') {
      return res.status(400).json({
        success: false,
        error: '订单支付方式不是支付宝',
      });
    }

    // 创建支付宝电脑网站支付
    const payUrl = await alipayService.createPagePay(order);

    res.json({
      success: true,
      payUrl,
    });
  } catch (error) {
    console.error('[支付宝] 创建电脑网站支付失败:', error);
    res.status(500).json({
      success: false,
      error: error.message || '创建电脑网站支付失败',
    });
  }
});

/**
 * GET /api/payment/alipay/query/:orderId
 * 查询支付宝订单状态
 *
 * 响应:
 * {
 *   "success": true,
 *   "exists": true,
 *   "tradeStatus": "TRADE_SUCCESS",
 *   "tradeNo": "...",
 *   ...
 * }
 */
router.get('/alipay/query/:orderId', authenticate, async (req, res) => {
  try {
    const { orderId } = req.params;
    const userId = req.user.id;

    // 获取订单
    const order = await paymentService.getOrderById(orderId);

    if (!order) {
      return res.status(404).json({
        success: false,
        error: '订单不存在',
      });
    }

    // 验证订单所属用户
    if (order.userId !== userId && !req.user.isAdmin) {
      return res.status(403).json({
        success: false,
        error: '无权访问此订单',
      });
    }

    // 查询支付宝订单状态
    const result = await alipayService.queryOrderStatus(orderId);

    res.json({
      success: true,
      ...result,
    });
  } catch (error) {
    console.error('[支付宝] 查询订单状态失败:', error);
    res.status(500).json({
      success: false,
      error: error.message || '查询订单状态失败',
    });
  }
});

/**
 * POST /api/payment/callback/alipay
 * 支付宝支付异步回调
 *
 * 注意: 此接口不需要身份验证,由支付宝服务器调用
 *
 * 响应: success 或 fail (直接返回文本,不是 JSON)
 */
router.post('/callback/alipay', async (req, res) => {
  try {
    const params = req.body;

    console.log('[支付宝] 收到支付回调:', JSON.stringify(params, null, 2));

    // 1. 验证签名
    const signValid = alipayService.checkNotifySign(params);

    if (!signValid) {
      console.error('[支付宝] 签名验证失败');
      return res.send('fail');
    }

    // 2. 提取关键参数
    const {
      out_trade_no,   // 商户订单号(我们的订单 ID)
      trade_no,       // 支付宝交易号
      trade_status,   // 交易状态
      total_amount,   // 交易金额
    } = params;

    // 3. 验证交易状态
    if (trade_status !== 'TRADE_SUCCESS' && trade_status !== 'TRADE_FINISHED') {
      console.warn(`[支付宝] 交易状态为 ${trade_status},不做处理`);
      return res.send('success');
    }

    // 4. 获取订单
    const order = await paymentService.getOrderById(out_trade_no);

    if (!order) {
      console.error(`[支付宝] 订单不存在: ${out_trade_no}`);
      return res.send('fail');
    }

    // 5. 验证金额
    if (parseFloat(total_amount) !== parseFloat(order.amount)) {
      console.error(`[支付宝] 金额不匹配: 订单金额=${order.amount}, 支付金额=${total_amount}`);
      return res.send('fail');
    }

    // 6. 检查订单是否已处理
    if (order.status === 'PAID') {
      console.warn(`[支付宝] 订单已支付,跳过处理: ${out_trade_no}`);
      return res.send('success');
    }

    // 7. 标记订单为已支付,并延长用户订阅时间
    const result = await paymentService.markOrderAsPaid(out_trade_no, trade_no);

    console.log('[支付宝] 支付成功处理完成:');
    console.log(`   订单 ID: ${out_trade_no}`);
    console.log(`   交易号: ${trade_no}`);
    console.log(`   金额: ¥${total_amount}`);
    console.log(`   套餐: ${order.planType}`);
    console.log(`   订阅到期时间: ${result.subscription.endDate}`);

    // TODO: 触发服务创建/恢复 (需要在多租户架构中实现)

    // 8. 返回成功
    res.send('success');
  } catch (error) {
    console.error('[支付宝] 支付回调处理失败:', error);
    res.send('fail');
  }
});

export default router;
