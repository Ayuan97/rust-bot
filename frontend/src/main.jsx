import React from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import App from './App';
import LoginPage from './pages/LoginPage';
import RegisterPage from './pages/RegisterPage';
import HomePage from './pages/HomePage';
import PaymentPage from './pages/PaymentPage';
import AccountPage from './pages/AccountPage';
import AdminPage from './pages/AdminPage';
import PrivacyPage from './pages/PrivacyPage';
import { ToastProvider } from './components/Toast';
import { ConfirmProvider } from './components/ConfirmModal';
import { AuthProvider } from './context/AuthContext';
import ServicePausedBanner from './components/ServicePausedBanner';
import ContactUsModal from './components/ContactUsModal';
import PendingApprovalView from './components/PendingApprovalView';
import { useAuth } from './context/AuthContext';
import './styles/index.css';

// 私有路由组件 - 需要登录才能访问
function PrivateRoute({ children }) {
  const { user } = useAuth();
  const token = localStorage.getItem('token');
  if (!token) {
    return <Navigate to="/login" replace />;
  }
  // 待审核 / 审核未通过用户：锁定功能，显示审核提示页（管理员豁免）
  if (user && user.approvalStatus && user.approvalStatus !== 'APPROVED' && !user.isAdmin) {
    return <PendingApprovalView status={user.approvalStatus} />;
  }
  return children;
}

// 管理员路由组件 - 需要管理员权限
function AdminRoute({ children }) {
  const token = localStorage.getItem('token');
  if (!token) {
    return <Navigate to="/login" replace />;
  }

  const userStr = localStorage.getItem('user');
  if (!userStr) {
    return <Navigate to="/login" replace />;
  }

  try {
    const user = JSON.parse(userStr);
    if (!user.isAdmin) {
      return <Navigate to="/dashboard" replace />;
    }
  } catch {
    return <Navigate to="/login" replace />;
  }

  return children;
}

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <BrowserRouter>
      <AuthProvider>
        <ToastProvider>
          <ConfirmProvider>
            {/* 订阅过期提醒条 + 联系我们（微信二维码）弹窗 */}
            <ServicePausedBanner />
            <ContactUsModal />

            <Routes>
              {/* 公开路由 */}
              <Route path="/" element={<HomePage />} />
              <Route path="/login" element={<LoginPage />} />
              <Route path="/register" element={<RegisterPage />} />
              <Route path="/privacy" element={<PrivacyPage />} />

              {/* 私有路由 - 需要登录 */}
              <Route
                path="/dashboard"
                element={
                  <PrivateRoute>
                    <App />
                  </PrivateRoute>
                }
              />

              <Route
                path="/payment"
                element={
                  <PrivateRoute>
                    <PaymentPage />
                  </PrivateRoute>
                }
              />

              <Route
                path="/account"
                element={
                  <PrivateRoute>
                    <AccountPage />
                  </PrivateRoute>
                }
              />

              {/* 管理后台路由 - 需要管理员权限 */}
              <Route
                path="/admin"
                element={
                  <AdminRoute>
                    <AdminPage />
                  </AdminRoute>
                }
              />

              {/* 404 页面 */}
              <Route path="*" element={<Navigate to="/" replace />} />
            </Routes>
          </ConfirmProvider>
        </ToastProvider>
      </AuthProvider>
    </BrowserRouter>
  </React.StrictMode>
);
