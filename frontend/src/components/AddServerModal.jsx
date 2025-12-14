import { useState } from 'react';
import { FaTimes } from 'react-icons/fa';
import { useToast } from './Toast';

function AddServerModal({ isOpen, onClose, onAdd }) {
  const [formData, setFormData] = useState({
    id: '',
    name: '',
    ip: '',
    port: '',
    playerId: '',
    playerToken: ''
  });
  const [errors, setErrors] = useState({});

  const toast = useToast();

  const handleSubmit = async (e) => {
    e.preventDefault();

    // 字段级别校验
    const newErrors = {};
    if (!formData.id) newErrors.id = '请填写服务器 ID';
    if (!formData.name) newErrors.name = '请填写服务器名称';
    if (!formData.ip) newErrors.ip = '请填写 IP 地址';
    if (!formData.port) newErrors.port = '请填写端口';
    if (!formData.playerId) newErrors.playerId = '请填写 Player ID';
    if (!formData.playerToken) newErrors.playerToken = '请填写 Player Token';

    if (Object.keys(newErrors).length > 0) {
      setErrors(newErrors);
      toast.warning('请填写所有必填字段');
      return;
    }

    setErrors({});

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
      toast.success('服务器添加成功');
    } catch (error) {
      console.error('添加服务器失败:', error);
      toast.error('添加失败: ' + error.message);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black/80 backdrop-blur-sm flex items-center justify-center z-50 p-4">
      <div className="bg-dark-800 rounded-2xl p-6 max-w-md w-full border border-white/10 shadow-2xl">
        <div className="flex items-center justify-between mb-6">
          <h2 className="text-xl font-bold text-white">添加服务器</h2>
          <button
            className="text-gray-400 hover:text-white transition-colors"
            onClick={onClose}
          >
            <FaTimes size={20} />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-xs font-medium text-gray-400 mb-1.5 uppercase tracking-wider">
              服务器 ID <span className="text-rust-accent">*</span>
            </label>
            <input
              type="text"
              className={`input w-full ${errors.id ? 'input-error' : ''}`}
              placeholder="server-1"
              value={formData.id}
              onChange={(e) => {
                setFormData({ ...formData, id: e.target.value });
                if (errors.id) setErrors({ ...errors, id: '' });
              }}
            />
            {errors.id ? (
              <p className="text-[10px] text-red-400 mt-1">{errors.id}</p>
            ) : (
              <p className="text-[10px] text-gray-500 mt-1">唯一标识符，用于区分不同服务器</p>
            )}
          </div>

          <div>
            <label className="block text-xs font-medium text-gray-400 mb-1.5 uppercase tracking-wider">
              服务器名称 <span className="text-rust-accent">*</span>
            </label>
            <input
              type="text"
              className={`input w-full ${errors.name ? 'input-error' : ''}`}
              placeholder="我的 Rust 服务器"
              value={formData.name}
              onChange={(e) => {
                setFormData({ ...formData, name: e.target.value });
                if (errors.name) setErrors({ ...errors, name: '' });
              }}
            />
            {errors.name && <p className="text-[10px] text-red-400 mt-1">{errors.name}</p>}
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-medium text-gray-400 mb-1.5 uppercase tracking-wider">
                IP 地址 <span className="text-rust-accent">*</span>
              </label>
              <input
                type="text"
                className={`input w-full ${errors.ip ? 'input-error' : ''}`}
                placeholder="123.456.789.0"
                value={formData.ip}
                onChange={(e) => {
                  setFormData({ ...formData, ip: e.target.value });
                  if (errors.ip) setErrors({ ...errors, ip: '' });
                }}
              />
              {errors.ip && <p className="text-[10px] text-red-400 mt-1">{errors.ip}</p>}
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-400 mb-1.5 uppercase tracking-wider">
                端口 <span className="text-rust-accent">*</span>
              </label>
              <input
                type="text"
                className={`input w-full ${errors.port ? 'input-error' : ''}`}
                placeholder="28082"
                value={formData.port}
                onChange={(e) => {
                  setFormData({ ...formData, port: e.target.value });
                  if (errors.port) setErrors({ ...errors, port: '' });
                }}
              />
              {errors.port && <p className="text-[10px] text-red-400 mt-1">{errors.port}</p>}
            </div>
          </div>

          <div>
            <label className="block text-xs font-medium text-gray-400 mb-1.5 uppercase tracking-wider">
              Player ID (Steam ID) <span className="text-rust-accent">*</span>
            </label>
            <input
              type="text"
              className={`input w-full ${errors.playerId ? 'input-error' : ''}`}
              placeholder="76561198012345678"
              value={formData.playerId}
              onChange={(e) => {
                setFormData({ ...formData, playerId: e.target.value });
                if (errors.playerId) setErrors({ ...errors, playerId: '' });
              }}
            />
            {errors.playerId && <p className="text-[10px] text-red-400 mt-1">{errors.playerId}</p>}
          </div>

          <div>
            <label className="block text-xs font-medium text-gray-400 mb-1.5 uppercase tracking-wider">
              Player Token <span className="text-rust-accent">*</span>
            </label>
            <input
              type="text"
              className={`input w-full ${errors.playerToken ? 'input-error' : ''}`}
              placeholder="-1234567890"
              value={formData.playerToken}
              onChange={(e) => {
                setFormData({ ...formData, playerToken: e.target.value });
                if (errors.playerToken) setErrors({ ...errors, playerToken: '' });
              }}
            />
            {errors.playerToken ? (
              <p className="text-[10px] text-red-400 mt-1">{errors.playerToken}</p>
            ) : (
              <p className="text-[10px] text-gray-500 mt-1">从 Rust+ 应用获取配对信息</p>
            )}
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
