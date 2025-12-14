import { useState, useEffect, createContext, useContext, useCallback } from 'react';
import { FaCheckCircle, FaExclamationCircle, FaInfoCircle, FaExclamationTriangle, FaTimes } from 'react-icons/fa';

// Toast Context
const ToastContext = createContext(null);

// Toast 类型配置
const toastConfig = {
  success: {
    icon: FaCheckCircle,
    bgColor: 'bg-green-500/10',
    borderColor: 'border-green-500/30',
    iconColor: 'text-green-400',
    progressColor: 'bg-green-500'
  },
  error: {
    icon: FaExclamationCircle,
    bgColor: 'bg-red-500/10',
    borderColor: 'border-red-500/30',
    iconColor: 'text-red-400',
    progressColor: 'bg-red-500'
  },
  warning: {
    icon: FaExclamationTriangle,
    bgColor: 'bg-yellow-500/10',
    borderColor: 'border-yellow-500/30',
    iconColor: 'text-yellow-400',
    progressColor: 'bg-yellow-500'
  },
  info: {
    icon: FaInfoCircle,
    bgColor: 'bg-blue-500/10',
    borderColor: 'border-blue-500/30',
    iconColor: 'text-blue-400',
    progressColor: 'bg-blue-500'
  }
};

// 单个 Toast 组件
function ToastItem({ toast, onRemove }) {
  const [progress, setProgress] = useState(100);
  const [isExiting, setIsExiting] = useState(false);
  const config = toastConfig[toast.type] || toastConfig.info;
  const Icon = config.icon;
  const duration = toast.duration || 3000;

  useEffect(() => {
    const startTime = Date.now();
    const interval = setInterval(() => {
      const elapsed = Date.now() - startTime;
      const remaining = Math.max(0, 100 - (elapsed / duration) * 100);
      setProgress(remaining);

      if (remaining <= 0) {
        clearInterval(interval);
        handleClose();
      }
    }, 50);

    return () => clearInterval(interval);
  }, [duration]);

  const handleClose = () => {
    setIsExiting(true);
    setTimeout(() => onRemove(toast.id), 200);
  };

  return (
    <div
      className={`relative overflow-hidden rounded-lg border backdrop-blur-md shadow-lg transition-all duration-200 ${
        isExiting ? 'opacity-0 translate-x-4' : 'opacity-100 translate-x-0'
      } ${config.bgColor} ${config.borderColor}`}
    >
      <div className="flex items-start gap-3 p-4">
        <Icon className={`text-lg flex-shrink-0 mt-0.5 ${config.iconColor}`} />
        <div className="flex-1 min-w-0">
          {toast.title && (
            <p className="font-semibold text-white text-sm mb-1">{toast.title}</p>
          )}
          <p className="text-sm text-gray-300">{toast.message}</p>
        </div>
        <button
          onClick={handleClose}
          className="text-gray-500 hover:text-white transition-colors flex-shrink-0"
        >
          <FaTimes className="text-sm" />
        </button>
      </div>

      {/* 进度条 */}
      <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-black/20">
        <div
          className={`h-full transition-all duration-50 ${config.progressColor}`}
          style={{ width: `${progress}%` }}
        />
      </div>
    </div>
  );
}

// Toast 容器
function ToastContainer({ toasts, removeToast }) {
  if (toasts.length === 0) return null;

  return (
    <div className="fixed top-4 right-4 z-[9999] space-y-2 max-w-sm w-full pointer-events-none">
      {toasts.map((toast) => (
        <div key={toast.id} className="pointer-events-auto">
          <ToastItem toast={toast} onRemove={removeToast} />
        </div>
      ))}
    </div>
  );
}

// Toast Provider
export function ToastProvider({ children }) {
  const [toasts, setToasts] = useState([]);

  const addToast = useCallback((type, message, options = {}) => {
    const id = Date.now() + Math.random();
    const toast = {
      id,
      type,
      message,
      title: options.title,
      duration: options.duration || 3000
    };
    setToasts((prev) => [...prev, toast]);
    return id;
  }, []);

  const removeToast = useCallback((id) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  const toast = {
    success: (message, options) => addToast('success', message, options),
    error: (message, options) => addToast('error', message, options),
    warning: (message, options) => addToast('warning', message, options),
    info: (message, options) => addToast('info', message, options),
    remove: removeToast
  };

  return (
    <ToastContext.Provider value={toast}>
      {children}
      <ToastContainer toasts={toasts} removeToast={removeToast} />
    </ToastContext.Provider>
  );
}

// Hook
export function useToast() {
  const context = useContext(ToastContext);
  if (!context) {
    throw new Error('useToast must be used within a ToastProvider');
  }
  return context;
}

export default ToastProvider;
