import React, { createContext, useContext, useState, useEffect, useCallback, useMemo, useRef } from 'react';
import socketService from '../services/socket';
import api from '../services/api';

const AuthContext = createContext(null);

// 订阅状态刷新间隔：5 分钟
const SUBSCRIPTION_REFRESH_INTERVAL = 5 * 60 * 1000;

/**
 * 解析 JWT token（不验证签名，仅解码）
 * @param {string} token JWT token
 * @returns {object|null} payload 或 null
 */
function parseJwt(token) {
  try {
    const base64Url = token.split('.')[1];
    const base64 = base64Url.replace(/-/g, '+').replace(/_/g, '/');
    const jsonPayload = decodeURIComponent(
      atob(base64)
        .split('')
        .map(c => '%' + ('00' + c.charCodeAt(0).toString(16)).slice(-2))
        .join('')
    );
    return JSON.parse(jsonPayload);
  } catch {
    return null;
  }
}

/**
 * 检查 token 是否过期
 * @param {string} token JWT token
 * @returns {boolean} true 如果过期或无效
 */
function isTokenExpired(token) {
  if (!token) return true;
  const payload = parseJwt(token);
  if (!payload || !payload.exp) return true;
  // exp 是 Unix 时间戳（秒），提前 60 秒判定过期
  return Date.now() >= (payload.exp * 1000) - 60000;
}

export const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(() => {
    const savedUser = localStorage.getItem('user');
    const token = localStorage.getItem('token');
    // 初始化时检查 token 有效性
    if (savedUser && token && !isTokenExpired(token)) {
      return JSON.parse(savedUser);
    }
    // token 无效或过期，清除存储
    if (savedUser || token) {
      localStorage.removeItem('user');
      localStorage.removeItem('token');
    }
    return null;
  });

  const refreshingRef = useRef(false);

  const logout = useCallback(() => {
    localStorage.removeItem('token');
    localStorage.removeItem('user');
    socketService.disconnect();
    setUser(null);
    window.location.href = '/login';
  }, []);

  // 刷新用户信息（从服务器获取最新订阅状态）
  const refreshUser = useCallback(async () => {
    const token = localStorage.getItem('token');
    if (!token || isTokenExpired(token) || refreshingRef.current) return;

    refreshingRef.current = true;
    try {
      const response = await api.get('/auth/me');
      if (response.data.success) {
        const newUserData = response.data.data;
        // 更新 localStorage 和 state
        localStorage.setItem('user', JSON.stringify(newUserData));
        setUser(newUserData);
      }
    } catch (error) {
      // 静默失败，不影响用户体验
      console.warn('刷新用户信息失败:', error.message);
    } finally {
      refreshingRef.current = false;
    }
  }, []);

  // 定期刷新订阅状态
  useEffect(() => {
    if (!user) return;

    // 立即刷新一次
    refreshUser();

    // 每 5 分钟刷新一次
    const interval = setInterval(refreshUser, SUBSCRIPTION_REFRESH_INTERVAL);

    return () => clearInterval(interval);
  }, [user?.id, refreshUser]);

  // 定期检查 token 是否过期
  useEffect(() => {
    const checkTokenValidity = () => {
      const token = localStorage.getItem('token');
      if (user && isTokenExpired(token)) {
        console.log('⚠️ Token 已过期，自动登出');
        logout();
      }
    };

    // 每分钟检查一次
    const interval = setInterval(checkTokenValidity, 60000);
    // 立即检查一次
    checkTokenValidity();

    return () => clearInterval(interval);
  }, [user, logout]);

  // 当用户状态变化时，管理 Socket 连接
  useEffect(() => {
    if (user) {
      // 用户已登录，连接 Socket
      const token = localStorage.getItem('token');
      if (token && !isTokenExpired(token)) {
        console.log('🔌 用户已登录，初始化 WebSocket 连接...');
        socketService.connect();
      }
    } else {
      // 用户未登录或已退出，断开 Socket
      console.log('🔌 用户已退出，断开 WebSocket 连接...');
      socketService.disconnect();
    }

    return () => {
      // 组件卸载时断开连接
      if (!user) {
        socketService.disconnect();
      }
    };
  }, [user]);

  useEffect(() => {
    const handleStorageChange = () => {
      const savedUser = localStorage.getItem('user');
      const token = localStorage.getItem('token');
      if (savedUser && token && !isTokenExpired(token)) {
        setUser(JSON.parse(savedUser));
      } else {
        setUser(null);
      }
    };

    window.addEventListener('storage', handleStorageChange);
    return () => window.removeEventListener('storage', handleStorageChange);
  }, []);

  // 计算订阅是否过期
  const isSubscriptionExpired = useMemo(() => {
    // 用户未登录或订阅数据未加载时，不假设过期
    if (!user) return false;
    if (!user.subscriptions || !user.subscriptions.endDate) return false;
    const endDate = new Date(user.subscriptions.endDate);
    return new Date() > endDate;
  }, [user]);

  // 计算订阅剩余天数
  const subscriptionDaysLeft = useMemo(() => {
    if (!user || !user.subscriptions) return 0;
    const endDate = new Date(user.subscriptions.endDate);
    const now = new Date();
    const diffTime = endDate - now;
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
    return Math.max(0, diffDays);
  }, [user]);

  return (
    <AuthContext.Provider value={{
      user,
      setUser,
      logout,
      refreshUser,
      isTokenExpired,
      isSubscriptionExpired,
      subscriptionDaysLeft
    }}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};
