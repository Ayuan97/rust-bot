import { useState } from 'react';
import { FaTimes } from 'react-icons/fa';

function AddServerModal({ isOpen, onClose, onAdd }) {
  const [formData, setFormData] = useState({
    id: '',
    name: '',
    ip: '',
    port: '',
    playerId: '',
    playerToken: ''
  });

  const handleSubmit = async (e) => {
    e.preventDefault();

    if (!formData.id || !formData.name || !formData.ip || !formData.port || !formData.playerId || !formData.playerToken) {
      alert('请填写所有字段');
      return;
    }

    try {
      await onAdd(formData);
      setFormData({
        id: '',
        name: '',
        ip: '',
        port: '',
        playerId: '',
        playerToken: ''
      });
      onClose();
    } catch (error) {
      console.error('添加服务器失败:', error);
      alert('添加失败: ' + error.message);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-75 flex items-center justify-center z-50">
      <div className="bg-rust-dark rounded-lg p-6 max-w-md w-full mx-4 border border-rust-gray">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-2xl font-bold">添加服务器</h2>
          <button
            className="text-gray-400 hover:text-white transition-colors"
            onClick={onClose}
          >
            <FaTimes size={24} />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm font-medium mb-2">
              服务器 ID <span className="text-red-500">*</span>
            </label>
            <input
              type="text"
              className="input w-full"
              placeholder="server-1"
              value={formData.id}
              onChange={(e) => setFormData({ ...formData, id: e.target.value })}
              required
            />
            <p className="text-xs text-gray-400 mt-1">唯一标识符，用于区分不同服务器</p>
          </div>

          <div>
            <label className="block text-sm font-medium mb-2">
              服务器名称 <span className="text-red-500">*</span>
            </label>
            <input
              type="text"
              className="input w-full"
              placeholder="我的 Rust 服务器"
              value={formData.name}
              onChange={(e) => setFormData({ ...formData, name: e.target.value })}
              required
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium mb-2">
                IP 地址 <span className="text-red-500">*</span>
              </label>
              <input
                type="text"
                className="input w-full"
                placeholder="123.456.789.0"
                value={formData.ip}
                onChange={(e) => setFormData({ ...formData, ip: e.target.value })}
                required
              />
            </div>
            <div>
              <label className="block text-sm font-medium mb-2">
                端口 <span className="text-red-500">*</span>
              </label>
              <input
                type="text"
                className="input w-full"
                placeholder="28082"
                value={formData.port}
                onChange={(e) => setFormData({ ...formData, port: e.target.value })}
                required
              />
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium mb-2">
              Player ID (Steam ID) <span className="text-red-500">*</span>
            </label>
            <input
              type="text"
              className="input w-full"
              placeholder="76561198012345678"
              value={formData.playerId}
              onChange={(e) => setFormData({ ...formData, playerId: e.target.value })}
              required
            />
          </div>

          <div>
            <label className="block text-sm font-medium mb-2">
              Player Token <span className="text-red-500">*</span>
            </label>
            <input
              type="text"
              className="input w-full"
              placeholder="-1234567890"
              value={formData.playerToken}
              onChange={(e) => setFormData({ ...formData, playerToken: e.target.value })}
              required
            />
            <p className="text-xs text-gray-400 mt-1">从 Rust+ 应用获取配对信息</p>
          </div>

          <div className="flex gap-3 pt-4">
            <button type="submit" className="btn btn-primary flex-1">
              添加服务器
            </button>
            <button
              type="button"
              className="btn btn-secondary flex-1"
              onClick={onClose}
            >
              取消
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

export default AddServerModal;
