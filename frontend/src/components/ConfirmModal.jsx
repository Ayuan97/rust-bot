import { useState, useEffect, useRef, createContext, useContext, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { FaExclamationTriangle, FaTrash, FaInfoCircle } from 'react-icons/fa';

// Confirm Context
const ConfirmContext = createContext(null);

// 确认类型配置
const confirmConfig = {
  danger: {
    icon: FaTrash,
    iconBg: 'bg-red-500/10',
    iconColor: 'text-red-400',
    confirmBtn: 'bg-red-500 hover:bg-red-600 text-white focus-visible:ring-red-500'
  },
  warning: {
    icon: FaExclamationTriangle,
    iconBg: 'bg-yellow-500/10',
    iconColor: 'text-yellow-400',
    confirmBtn: 'bg-yellow-500 hover:bg-yellow-600 text-black focus-visible:ring-yellow-500'
  },
  info: {
    icon: FaInfoCircle,
    iconBg: 'bg-blue-500/10',
    iconColor: 'text-blue-400',
    confirmBtn: 'bg-rust-accent hover:bg-rust-hover text-white focus-visible:ring-rust-accent'
  }
};

// Modal 组件
function ConfirmModal({ isOpen, config, onConfirm, onCancel }) {
  const cancelButtonRef = useRef(null);
  const modalRef = useRef(null);

  // 打开时聚焦取消按钮，关闭时恢复焦点
  useEffect(() => {
    if (isOpen) {
      // 保存当前焦点
      const previousActiveElement = document.activeElement;

      // 延迟聚焦以确保动画完成
      const timer = setTimeout(() => {
        cancelButtonRef.current?.focus();
      }, 50);

      return () => {
        clearTimeout(timer);
        // 恢复焦点
        previousActiveElement?.focus?.();
      };
    }
  }, [isOpen]);

  // ESC 键关闭
  useEffect(() => {
    if (!isOpen) return;

    const handleKeyDown = (e) => {
      if (e.key === 'Escape') {
        onCancel();
      }
      // 焦点陷阱
      if (e.key === 'Tab' && modalRef.current) {
        const focusableElements = modalRef.current.querySelectorAll(
          'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
        );
        const firstElement = focusableElements[0];
        const lastElement = focusableElements[focusableElements.length - 1];

        if (e.shiftKey && document.activeElement === firstElement) {
          e.preventDefault();
          lastElement?.focus();
        } else if (!e.shiftKey && document.activeElement === lastElement) {
          e.preventDefault();
          firstElement?.focus();
        }
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onCancel]);

  if (!isOpen) return null;

  const typeConfig = confirmConfig[config.type] || confirmConfig.info;
  const Icon = typeConfig.icon;
  const titleId = 'confirm-modal-title';
  const descId = 'confirm-modal-desc';

  return createPortal(
    <div className="fixed inset-0 z-[9999] flex items-center justify-center p-4">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/70 backdrop-blur-sm animate-fade-in"
        onClick={onCancel}
        aria-hidden="true"
      />

      {/* Modal */}
      <div
        ref={modalRef}
        role="alertdialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={descId}
        className="relative bg-dark-800 rounded-2xl border border-white/10 shadow-2xl w-full max-w-md animate-scale-in"
      >
        <div className="p-6">
          {/* Icon */}
          <div className={`w-12 h-12 rounded-full ${typeConfig.iconBg} flex items-center justify-center mx-auto mb-4`}>
            <Icon className={`text-xl ${typeConfig.iconColor}`} aria-hidden="true" />
          </div>

          {/* Title */}
          <h3 id={titleId} className="text-lg font-bold text-white text-center mb-2">
            {config.title || '确认操作'}
          </h3>

          {/* Message */}
          <p id={descId} className="text-gray-400 text-center text-sm mb-6">
            {config.message}
          </p>

          {/* Buttons */}
          <div className="flex gap-3">
            <button
              ref={cancelButtonRef}
              onClick={onCancel}
              className="flex-1 px-4 py-2.5 rounded-lg bg-dark-700 text-gray-300 hover:bg-dark-600 hover:text-white transition-all font-medium focus:outline-none focus-visible:ring-2 focus-visible:ring-dark-500 focus-visible:ring-offset-2 focus-visible:ring-offset-dark-800"
            >
              {config.cancelText || '取消'}
            </button>
            <button
              onClick={onConfirm}
              className={`flex-1 px-4 py-2.5 rounded-lg transition-all font-medium focus:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-offset-dark-800 ${typeConfig.confirmBtn}`}
            >
              {config.confirmText || '确认'}
            </button>
          </div>
        </div>
      </div>
    </div>,
    document.body
  );
}

// Confirm Provider
export function ConfirmProvider({ children }) {
  const [modal, setModal] = useState({
    isOpen: false,
    config: {},
    resolve: null
  });

  const confirm = useCallback((options) => {
    return new Promise((resolve) => {
      setModal({
        isOpen: true,
        config: typeof options === 'string' ? { message: options } : options,
        resolve
      });
    });
  }, []);

  const handleConfirm = () => {
    modal.resolve?.(true);
    setModal({ isOpen: false, config: {}, resolve: null });
  };

  const handleCancel = () => {
    modal.resolve?.(false);
    setModal({ isOpen: false, config: {}, resolve: null });
  };

  return (
    <ConfirmContext.Provider value={confirm}>
      {children}
      <ConfirmModal
        isOpen={modal.isOpen}
        config={modal.config}
        onConfirm={handleConfirm}
        onCancel={handleCancel}
      />
    </ConfirmContext.Provider>
  );
}

// Hook
export function useConfirm() {
  const context = useContext(ConfirmContext);
  if (!context) {
    throw new Error('useConfirm must be used within a ConfirmProvider');
  }
  return context;
}

export default ConfirmProvider;
