# AlipayService 模块文档

> 文件: `backend/src/services/alipay.service.js`
> 行数: 276 | 类型: 单例服务

---

## 1. 概述

`AlipayService` 是 **支付宝支付服务**，负责创建支付订单、生成二维码、查询订单状态、验证回调签名。

---

## 2. 支持的支付方式

| 方式 | 方法 |
|------|------|
| **电脑网站支付** | `createPagePay()` |
| **扫码支付** | `createQRCodePay()` |

---

## 3. 环境变量

| 变量 | 描述 |
|------|------|
| `ALIPAY_APP_ID` | 应用 ID |
| `ALIPAY_PRIVATE_KEY` | 应用私钥 |
| `ALIPAY_PUBLIC_KEY` | 支付宝公钥 |
| `ALIPAY_GATEWAY` | 网关地址 |
| `ALIPAY_NOTIFY_URL` | 回调通知 URL |
| `ALIPAY_RETURN_URL` | 支付成功跳转 URL |

---

## 4. 公开方法

| 方法 | 描述 |
|------|------|
| `initialize()` | 初始化 SDK |
| `createPagePay(order)` | 创建网页支付 |
| `createQRCodePay(order)` | 创建扫码支付 |
| `queryOrderStatus(orderId)` | 查询订单状态 |
| `checkNotifySign(params)` | 验证回调签名 |
| `closeOrder(orderId)` | 关闭订单 |
| `getConfig()` | 获取配置信息 |

---

## 5. 使用示例

```javascript
import alipayService from './alipay.service.js';

// 初始化
alipayService.initialize();

// 创建扫码支付
const { qrCode, tradeNo } = await alipayService.createQRCodePay({
  id: 'ORDER123',
  amount: 19.9,
  subject: '月度订阅'
});
```
