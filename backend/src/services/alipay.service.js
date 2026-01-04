/**
 * 支付宝服务
 *
 * 功能:
 * - 初始化支付宝 SDK
 * - 创建支付订单(电脑网站支付 + 扫码支付)
 * - 生成支付二维码
 * - 查询订单状态
 * - 验证支付回调签名
 */

import AlipaySdk from 'alipay-sdk';
import AlipayFormData from 'alipay-sdk/lib/form.js';
import QRCode from 'qrcode';
import paymentService from './payment.service.js';

class AlipayService {
  constructor() {
    this.alipaySdk = null;
    this.config = {
      appId: process.env.ALIPAY_APP_ID || '',
      privateKey: process.env.ALIPAY_PRIVATE_KEY || '',
      alipayPublicKey: process.env.ALIPAY_PUBLIC_KEY || '',
      gateway: process.env.ALIPAY_GATEWAY || 'https://openapi.alipaydev.com/gateway.do', // 沙箱网关
      notifyUrl: process.env.ALIPAY_NOTIFY_URL || '',
      returnUrl: process.env.ALIPAY_RETURN_URL || '',
    };

    this.initialize();
  }

  /**
   * 初始化支付宝 SDK
   */
  initialize() {
    if (!this.config.appId || !this.config.privateKey || !this.config.alipayPublicKey) {
      console.warn('⚠️  [支付宝] 配置不完整,支付宝支付功能将不可用');
      console.warn('    请在 .env 文件中配置:');
      console.warn('    - ALIPAY_APP_ID');
      console.warn('    - ALIPAY_PRIVATE_KEY');
      console.warn('    - ALIPAY_PUBLIC_KEY');
      console.warn('    - ALIPAY_NOTIFY_URL');
      console.warn('    - ALIPAY_RETURN_URL');
      return;
    }

    try {
      this.alipaySdk = new AlipaySdk({
        appId: this.config.appId,
        privateKey: this.config.privateKey,
        alipayPublicKey: this.config.alipayPublicKey,
        gateway: this.config.gateway,
        timeout: 30000, // 30秒超时
      });

      console.log('✅ [支付宝] SDK 初始化成功');
      console.log(`   网关: ${this.config.gateway}`);
      console.log(`   AppID: ${this.config.appId}`);
    } catch (error) {
      console.error('❌ [支付宝] SDK 初始化失败:', error.message);
    }
  }

  /**
   * 检查 SDK 是否已初始化
   */
  checkInitialized() {
    if (!this.alipaySdk) {
      throw new Error('支付宝 SDK 未初始化或配置不完整');
    }
  }

  /**
   * 创建电脑网站支付订单
   * @param {Object} order - 订单信息
   * @returns {Promise<string>} 支付链接
   */
  async createPagePay(order) {
    this.checkInitialized();

    const formData = new AlipayFormData();
    formData.setMethod('get');

    // 设置支付参数
    formData.addField('bizContent', {
      outTradeNo: order.id,                    // 商户订单号
      productCode: 'FAST_INSTANT_TRADE_PAY',   // 产品码
      totalAmount: order.amount.toString(),    // 订单金额(元)
      subject: `Rust+ Dashboard - ${order.planType}`,  // 订单标题
      body: `订阅套餐: ${order.planType}`,      // 订单描述
    });

    formData.addField('returnUrl', this.config.returnUrl);  // 同步回调地址
    formData.addField('notifyUrl', this.config.notifyUrl);  // 异步回调地址

    try {
      // 调用 SDK 生成支付链接
      const result = await this.alipaySdk.exec(
        'alipay.trade.page.pay',
        {},
        { formData }
      );

      console.log(`[支付宝] 创建电脑网站支付订单: ${order.id}`);
      return result;
    } catch (error) {
      console.error('[支付宝] 创建电脑网站支付订单失败:', error);
      throw new Error(`创建支付订单失败: ${error.message}`);
    }
  }

  /**
   * 创建扫码支付订单(Native 支付)
   * @param {Object} order - 订单信息
   * @returns {Promise<Object>} { qrCode: '二维码字符串', tradeNo: '交易号' }
   */
  async createQRCodePay(order) {
    this.checkInitialized();

    try {
      // 调用 SDK 创建预支付订单
      const result = await this.alipaySdk.exec('alipay.trade.precreate', {
        bizContent: {
          outTradeNo: order.id,                    // 商户订单号
          totalAmount: order.amount.toString(),    // 订单金额(元)
          subject: `Rust+ Dashboard - ${order.planType}`,  // 订单标题
          body: `订阅套餐: ${order.planType}`,      // 订单描述
          timeoutExpress: '30m',                   // 订单超时时间
        },
        notifyUrl: this.config.notifyUrl,         // 异步回调地址
      });

      // 解析响应
      const response = result.alipayTradePrecreateResponse;
      if (response.code !== '10000') {
        throw new Error(`支付宝返回错误: ${response.subMsg || response.msg}`);
      }

      const qrCodeUrl = response.qrCode;  // 支付二维码内容(URL)

      // 生成二维码图片(Base64)
      const qrCodeImage = await QRCode.toDataURL(qrCodeUrl);

      // 更新订单,保存二维码和交易号
      await paymentService.updateOrder(order.id, {
        qrCode: qrCodeImage,
        tradeNo: order.id, // 使用订单 ID 作为商户订单号
      });

      console.log(`[支付宝] 创建扫码支付订单: ${order.id}`);
      console.log(`   二维码内容: ${qrCodeUrl}`);

      return {
        qrCode: qrCodeImage,  // Base64 格式的二维码图片
        qrCodeUrl,            // 原始二维码内容
        tradeNo: order.id,    // 商户订单号
      };
    } catch (error) {
      console.error('[支付宝] 创建扫码支付订单失败:', error);
      throw new Error(`创建扫码支付失败: ${error.message}`);
    }
  }

  /**
   * 查询订单支付状态
   * @param {string} orderId - 订单 ID (商户订单号)
   * @returns {Promise<Object>} 订单状态信息
   */
  async queryOrderStatus(orderId) {
    this.checkInitialized();

    try {
      const result = await this.alipaySdk.exec('alipay.trade.query', {
        bizContent: {
          outTradeNo: orderId,  // 商户订单号
        },
      });

      const response = result.alipayTradeQueryResponse;
      if (response.code !== '10000') {
        console.warn(`[支付宝] 查询订单失败: ${response.subMsg || response.msg}`);
        return {
          exists: false,
          tradeStatus: null,
        };
      }

      console.log(`[支付宝] 查询订单状态: ${orderId}`);
      console.log(`   交易状态: ${response.tradeStatus}`);
      console.log(`   支付宝交易号: ${response.tradeNo}`);

      return {
        exists: true,
        tradeNo: response.tradeNo,           // 支付宝交易号
        tradeStatus: response.tradeStatus,   // WAIT_BUYER_PAY | TRADE_SUCCESS | TRADE_FINISHED | TRADE_CLOSED
        totalAmount: response.totalAmount,   // 交易金额
        buyerLogonId: response.buyerLogonId, // 买家支付宝账号
        sendPayDate: response.sendPayDate,   // 支付时间
      };
    } catch (error) {
      console.error('[支付宝] 查询订单状态失败:', error);
      throw new Error(`查询订单状态失败: ${error.message}`);
    }
  }

  /**
   * 验证支付回调签名
   * @param {Object} params - 回调参数
   * @returns {boolean} 验证结果
   */
  checkNotifySign(params) {
    this.checkInitialized();

    try {
      // 使用 SDK 的签名验证方法
      const isValid = this.alipaySdk.checkNotifySign(params);

      if (isValid) {
        console.log('[支付宝] 回调签名验证通过');
      } else {
        console.warn('[支付宝] 回调签名验证失败');
      }

      return isValid;
    } catch (error) {
      console.error('[支付宝] 签名验证异常:', error);
      return false;
    }
  }

  /**
   * 关闭订单(用户取消支付)
   * @param {string} orderId - 订单 ID
   * @returns {Promise<boolean>} 是否成功关闭
   */
  async closeOrder(orderId) {
    this.checkInitialized();

    try {
      const result = await this.alipaySdk.exec('alipay.trade.close', {
        bizContent: {
          outTradeNo: orderId,
        },
      });

      const response = result.alipayTradeCloseResponse;
      if (response.code === '10000') {
        console.log(`[支付宝] 关闭订单成功: ${orderId}`);
        return true;
      } else {
        console.warn(`[支付宝] 关闭订单失败: ${response.subMsg || response.msg}`);
        return false;
      }
    } catch (error) {
      console.error('[支付宝] 关闭订单失败:', error);
      return false;
    }
  }

  /**
   * 获取配置信息(用于前端显示)
   * @returns {Object} 配置信息
   */
  getConfig() {
    return {
      enabled: !!this.alipaySdk,
      appId: this.config.appId,
      gateway: this.config.gateway,
      isSandbox: this.config.gateway.includes('alipaydev.com'),
    };
  }
}

// 导出单例
export default new AlipayService();
