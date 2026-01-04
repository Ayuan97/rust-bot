import axios from 'axios';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3000/api';

// 创建 axios 实例
const apiClient = axios.create({
  baseURL: API_URL,
  timeout: 30000,
  headers: {
    'Content-Type': 'application/json',
  },
});

// 请求拦截器 - 自动添加 JWT Token
apiClient.interceptors.request.use(
  (config) => {
    const token = localStorage.getItem('token');
    if (token) {
      config.headers.Authorization = `Bearer ${token}`;
    }
    return config;
  },
  (error) => {
    return Promise.reject(error);
  }
);

// 响应拦截器 - 处理 401 未授权
apiClient.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response?.status === 401) {
      // Token 过期或无效，清除本地存储并跳转到登录页
      localStorage.removeItem('token');
      localStorage.removeItem('user');
      window.location.href = '/login';
    }
    return Promise.reject(error);
  }
);

// ========== 认证 API ==========

export const authApi = {
  /**
   * 用户登录
   */
  login: async (email, password) => {
    const response = await apiClient.post('/auth/login', { username: email, password });
    return response.data;
  },

  /**
   * 用户注册
   */
  register: async (username, email, password) => {
    const response = await apiClient.post('/auth/register', { username, email, password, confirmPassword: password });
    return response.data;
  },

  /**
   * 获取当前用户信息
   */
  getCurrentUser: async () => {
    const response = await apiClient.get('/auth/me');
    return response.data;
  },

  /**
   * 登出
   */
  logout: () => {
    localStorage.removeItem('token');
    localStorage.removeItem('user');
    window.location.href = '/login';
  },
};

// ========== 支付 API ==========

export const paymentApi = {
  /**
   * 创建订单
   */
  createOrder: async (planType, paymentMethod) => {
    const response = await apiClient.post('/payment/create-order', {
      planType,
      paymentMethod,
    });
    return response.data;
  },

  /**
   * 获取用户订单列表
   */
  getOrders: async (options = {}) => {
    const params = new URLSearchParams();
    if (options.limit) params.append('limit', options.limit);
    if (options.status) params.append('status', options.status);

    const response = await apiClient.get(`/payment/orders?${params.toString()}`);
    return response.data;
  },

  /**
   * 获取订单详情
   */
  getOrder: async (orderId) => {
    const response = await apiClient.get(`/payment/orders/${orderId}`);
    return response.data;
  },

  /**
   * 取消订单
   */
  cancelOrder: async (orderId) => {
    const response = await apiClient.post(`/payment/orders/${orderId}/cancel`);
    return response.data;
  },

  /**
   * 获取套餐配置
   */
  getPlans: async () => {
    const response = await apiClient.get('/payment/plans');
    return response.data;
  },

  /**
   * 创建支付宝扫码支付
   */
  createAlipayQRCode: async (orderId) => {
    const response = await apiClient.post('/payment/alipay/qrcode', { orderId });
    return response.data;
  },

  /**
   * 创建支付宝网站支付
   */
  createAlipayPage: async (orderId) => {
    const response = await apiClient.post('/payment/alipay/page', { orderId });
    return response.data;
  },

  /**
   * 查询支付宝订单状态
   */
  queryAlipayOrder: async (orderId) => {
    const response = await apiClient.get(`/payment/alipay/query/${orderId}`);
    return response.data;
  },
};

// ========== 用户 API ==========

export const userApi = {
  /**
   * 获取用户订阅信息
   */
  getSubscription: async () => {
    const response = await apiClient.get('/user/subscription');
    return response.data;
  },

  /**
   * 更新用户信息
   */
  updateProfile: async (data) => {
    const response = await apiClient.put('/user/profile', data);
    return response.data;
  },

  /**
   * 修改密码
   */
  changePassword: async (oldPassword, newPassword) => {
    const response = await apiClient.post('/user/change-password', {
      oldPassword,
      newPassword,
    });
    return response.data;
  },

  /**
   * 删除账号
   */
  deleteAccount: async (password) => {
    const response = await apiClient.post('/user/delete-account', { password });
    return response.data;
  },
};

export default apiClient;
