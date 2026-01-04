import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import axios from 'axios';
import { useToast } from '../components/Toast';

// 子组件（暂时占位，后续实现）
import StatsDashboard from '../components/admin/StatsDashboard';
import UserList from '../components/admin/UserList';
import OrderList from '../components/admin/OrderList';
import SystemStatus from '../components/admin/SystemStatus';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3000/api';

function AdminPage() {
  const navigate = useNavigate();
  const { showToast } = useToast();
  const [activeTab, setActiveTab] = useState('stats');
  const [loading, setLoading] = useState(true);
  const [user, setUser] = useState(null);

  useEffect(() => {
    // 检查管理员权限
    const checkAdmin = async () => {
      try {
        const token = localStorage.getItem('token');
        if (!token) {
          navigate('/login');
          return;
        }

        // 从 localStorage 获取用户信息
        const userStr = localStorage.getItem('user');
        if (!userStr) {
          navigate('/login');
          return;
        }

        const userData = JSON.parse(userStr);
        if (!userData.isAdmin) {
          showToast('需要管理员权限', 'error');
          navigate('/dashboard');
          return;
        }

        setUser(userData);
        setLoading(false);
      } catch (error) {
        console.error('权限检查失败:', error);
        navigate('/login');
      }
    };

    checkAdmin();
  }, [navigate, showToast]);

  const handleLogout = () => {
    localStorage.removeItem('token');
    localStorage.removeItem('user');
    navigate('/login');
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-900 flex items-center justify-center">
        <div className="text-white text-lg">加载中...</div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-900">
      {/* 顶部导航栏 */}
      <nav className="bg-gray-800 border-b border-gray-700">
        <div className="max-w-full px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between h-16">
            <div className="flex items-center">
              <h1 className="text-xl font-bold text-white">管理后台</h1>
              <span className="ml-3 px-2 py-1 text-xs bg-blue-500 text-white rounded">
                管理员
              </span>
            </div>
            <div className="flex items-center gap-4">
              <span className="text-gray-300 text-sm">{user?.username}</span>
              <button
                onClick={() => navigate('/dashboard')}
                className="px-3 py-1.5 bg-gray-700 hover:bg-gray-600 text-white rounded-lg transition-colors text-sm"
              >
                返回仪表板
              </button>
              <button
                onClick={handleLogout}
                className="px-3 py-1.5 bg-red-600 hover:bg-red-700 text-white rounded-lg transition-colors text-sm"
              >
                退出登录
              </button>
            </div>
          </div>
        </div>
      </nav>

      <div className="flex h-[calc(100vh-4rem)]">
        {/* 侧边栏 */}
        <aside className="w-64 bg-gray-800 border-r border-gray-700">
          <nav className="p-4 space-y-2">
            <button
              onClick={() => setActiveTab('stats')}
              className={`w-full text-left px-4 py-2.5 rounded-lg transition-colors ${
                activeTab === 'stats'
                  ? 'bg-blue-600 text-white'
                  : 'text-gray-300 hover:bg-gray-700 hover:text-white'
              }`}
            >
              📊 统计概览
            </button>
            <button
              onClick={() => setActiveTab('users')}
              className={`w-full text-left px-4 py-2.5 rounded-lg transition-colors ${
                activeTab === 'users'
                  ? 'bg-blue-600 text-white'
                  : 'text-gray-300 hover:bg-gray-700 hover:text-white'
              }`}
            >
              👥 用户管理
            </button>
            <button
              onClick={() => setActiveTab('orders')}
              className={`w-full text-left px-4 py-2.5 rounded-lg transition-colors ${
                activeTab === 'orders'
                  ? 'bg-blue-600 text-white'
                  : 'text-gray-300 hover:bg-gray-700 hover:text-white'
              }`}
            >
              💰 订单管理
            </button>
            <button
              onClick={() => setActiveTab('system')}
              className={`w-full text-left px-4 py-2.5 rounded-lg transition-colors ${
                activeTab === 'system'
                  ? 'bg-blue-600 text-white'
                  : 'text-gray-300 hover:bg-gray-700 hover:text-white'
              }`}
            >
              ⚙️ 系统状态
            </button>
          </nav>
        </aside>

        {/* 主内容区 */}
        <main className="flex-1 overflow-y-auto bg-gray-900 p-6">
          {activeTab === 'stats' && <StatsDashboard />}
          {activeTab === 'users' && <UserList />}
          {activeTab === 'orders' && <OrderList />}
          {activeTab === 'system' && <SystemStatus />}
        </main>
      </div>
    </div>
  );
}

export default AdminPage;
