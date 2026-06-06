import { useState } from 'react';
import { FaTimes, FaServer, FaFingerprint, FaNetworkWired, FaKey, FaArrowRight, FaTerminal } from 'react-icons/fa';
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

    const newErrors = {};
    if (!formData.id) newErrors.id = '请填写识别 ID';
    if (!formData.name) newErrors.name = '请填写显示名称';
    if (!formData.ip) newErrors.ip = '请填写 IP 地址';
    if (!formData.port) newErrors.port = '请填写端口';
    if (!formData.playerId) newErrors.playerId = '请填写 Steam ID';
    if (!formData.playerToken) newErrors.playerToken = '请填写配对 Token';

    if (Object.keys(newErrors).length > 0) {
      setErrors(newErrors);
      toast.warning('数据校验未通过，请检查标记项');
      return;
    }

    setErrors({});

    try {
      await onAdd(formData);
      setFormData({ id: '', name: '', ip: '', port: '', playerId: '', playerToken: '' });
      onClose();
      toast.success('服务器已成功录入系统');
    } catch (error) {
      toast.error('录入失败: ' + error.message);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[150] flex items-center justify-center p-4">
      {/* 遮罩 */}
      <div
        className="absolute inset-0 bg-black/70 backdrop-blur-sm animate-fade-in"
        aria-hidden="true"
      />

      {/* 面板 */}
      <div className="relative tac-panel tac-corners w-full max-w-lg animate-scale-in">
        <div className="p-7 md:p-8">
          <header className="flex items-start justify-between mb-7 pb-5 border-b border-ink-line">
            <div className="flex items-center gap-4">
              <div className="w-10 h-10 bg-hazard-dim border border-hazard/40 flex items-center justify-center text-hazard shrink-0">
                <FaServer className="text-lg" />
              </div>
              <div>
                <div className="tac-label mb-1">MANUAL LINK PROTOCOL</div>
                <h2 className="text-xl font-extrabold text-fg tracking-tight">手动录入服务器</h2>
              </div>
            </div>
            <button
              onClick={onClose}
              className="text-fg-mute hover:text-fg transition-colors mt-1"
              aria-label="关闭"
            >
              <FaTimes />
            </button>
          </header>

          <form onSubmit={handleSubmit} className="space-y-5">
            <div className="grid grid-cols-2 gap-5">
              <TacticInput
                label="识别 ID"
                hint="UNIQUE ID"
                icon={<FaFingerprint />}
                placeholder="server-01"
                mono
                value={formData.id}
                error={errors.id}
                onChange={v => setFormData({...formData, id: v})}
              />
              <TacticInput
                label="显示名称"
                hint="ALIAS"
                icon={<FaTerminal />}
                placeholder="我的基地服务器"
                value={formData.name}
                error={errors.name}
                onChange={v => setFormData({...formData, name: v})}
              />
            </div>

            <div className="grid grid-cols-2 gap-5">
              <TacticInput
                label="IP 地址"
                hint="HOST"
                icon={<FaNetworkWired />}
                placeholder="127.0.0.1"
                mono
                value={formData.ip}
                error={errors.ip}
                onChange={v => setFormData({...formData, ip: v})}
              />
              <TacticInput
                label="通讯端口"
                hint="PORT"
                icon={<FaNetworkWired />}
                placeholder="28082"
                mono
                value={formData.port}
                error={errors.port}
                onChange={v => setFormData({...formData, port: v})}
              />
            </div>

            <TacticInput
              label="Steam ID"
              hint="PLAYER ID"
              icon={<FaKey />}
              placeholder="7656119XXXXXXXXXX"
              mono
              value={formData.playerId}
              error={errors.playerId}
              onChange={v => setFormData({...formData, playerId: v})}
            />

            <TacticInput
              label="配对令牌"
              hint="PLAYER TOKEN"
              icon={<FaKey />}
              placeholder="-1234567890"
              mono
              value={formData.playerToken}
              error={errors.playerToken}
              onChange={v => setFormData({...formData, playerToken: v})}
            />

            <div className="flex gap-3 pt-6 border-t border-ink-line">
              <button
                type="button"
                onClick={onClose}
                className="tac-btn tac-btn-ghost px-8"
              >
                取消
              </button>
              <button
                type="submit"
                className="tac-btn tac-btn-primary flex-1 group"
              >
                录入控制终端 // LINK <FaArrowRight className="text-xs group-hover:translate-x-1 transition-transform" />
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
}

function TacticInput({ label, hint, icon, placeholder, value, error, onChange, type = "text", mono = false }) {
  return (
    <div className="space-y-1.5">
      <label className="flex items-baseline gap-2">
        <span className="text-sm font-bold text-fg">{label}</span>
        {hint && <span className="tac-label">{hint}</span>}
      </label>
      <div className="relative">
        <div className="absolute left-3 top-1/2 -translate-y-1/2 text-fg-mute text-xs pointer-events-none">
          {icon}
        </div>
        <input
          type={type}
          className={`tac-input pl-9 ${mono ? 'font-mono tabular-nums' : ''} ${error ? '!border-hazard/60' : ''}`}
          placeholder={placeholder}
          value={value}
          onChange={e => onChange(e.target.value)}
        />
      </div>
      {error && (
        <p className="flex items-center gap-1.5 text-xs text-fg-dim">
          <span className="font-mono text-hazard-bright text-[11px]">[ERR]</span>
          {error}
        </p>
      )}
    </div>
  );
}

export default AddServerModal;
