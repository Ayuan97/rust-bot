import { useState } from 'react';
import { FaTimes, FaGlobe, FaCog, FaBell } from 'react-icons/fa';
import ProxySettings from './ProxySettings';
import FCMSettings from './FCMSettings';

/**
 * 设置面板 - 包含代理配置等设置项
 */
function SettingsPanel({ isOpen, onClose }) {
  const [activeTab, setActiveTab] = useState('proxy');

  if (!isOpen) return null;

  const tabs = [
    { id: 'proxy', label: '代理设置', icon: <FaGlobe /> },
    { id: 'fcm', label: 'FCM 配置', icon: <FaBell /> },
    // 未来可扩展其他设置项
    // { id: 'appearance', label: '外观', icon: <FaPalette /> },
  ];

  return (
    <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-50 flex items-center justify-center p-4">
      <div className="bg-dark-800 rounded-2xl w-full max-w-3xl border border-white/10 shadow-2xl overflow-hidden flex flex-col max-h-[85vh]">
        {/* Header */}
        <div className="p-4 border-b border-white/10 flex justify-between items-center bg-dark-900/50">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg bg-rust-accent/20 flex items-center justify-center">
              <FaCog className="text-rust-accent" />
            </div>
            <h3 className="font-bold text-lg">设置</h3>
          </div>
          <button
            onClick={onClose}
            className="w-8 h-8 rounded-lg hover:bg-white/10 flex items-center justify-center text-gray-400 hover:text-white transition-colors"
          >
            <FaTimes />
          </button>
        </div>

        {/* Content */}
        <div className="flex flex-1 min-h-0">
          {/* Sidebar */}
          <div className="w-48 border-r border-white/5 bg-dark-900/30 p-2">
            {tabs.map((tab) => (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`w-full flex items-center gap-2 px-3 py-2.5 rounded-lg text-sm font-medium transition-all ${
                  activeTab === tab.id
                    ? 'bg-rust-accent text-white'
                    : 'text-gray-400 hover:bg-white/5 hover:text-gray-200'
                }`}
              >
                {tab.icon}
                {tab.label}
              </button>
            ))}
          </div>

          {/* Tab Content */}
          <div className="flex-1 overflow-y-auto p-6">
            {activeTab === 'proxy' && <ProxySettings />}
            {activeTab === 'fcm' && <FCMSettings />}
          </div>
        </div>
      </div>
    </div>
  );
}

export default SettingsPanel;
