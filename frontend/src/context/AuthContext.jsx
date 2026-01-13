import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import socketService from '../services/socket';

const AuthContext = createContext(null);

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

  const logout = useCallback(() => {
    localStorage.removeItem('token');
    localStorage.removeItem('user');
    socketService.disconnect();
    setUser(null);
    window.location.href = '/login';
  }, []);

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

  return (
    <AuthContext.Provider value={{ user, setUser, logout, isTokenExpired }}>
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
