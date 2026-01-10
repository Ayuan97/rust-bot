import React, { createContext, useContext, useState, useEffect } from 'react';
import socketService from '../services/socket';

const AuthContext = createContext(null);

export const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(() => {
    const savedUser = localStorage.getItem('user');
    return savedUser ? JSON.parse(savedUser) : null;
  });

  // 当用户状态变化时，管理 Socket 连接
  useEffect(() => {
    if (user) {
      // 用户已登录，连接 Socket
      const token = localStorage.getItem('token');
      if (token) {
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

  const logout = () => {
    localStorage.removeItem('token');
    localStorage.removeItem('user');
    socketService.disconnect();
    setUser(null);
    window.location.href = '/login';
  };

  useEffect(() => {
    const handleStorageChange = () => {
      const savedUser = localStorage.getItem('user');
      setUser(savedUser ? JSON.parse(savedUser) : null);
    };

    window.addEventListener('storage', handleStorageChange);
    return () => window.removeEventListener('storage', handleStorageChange);
  }, []);

  return (
    <AuthContext.Provider value={{ user, setUser, logout }}>
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

