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
    <div className="fixed inset-0 bg-black/90 backdrop-blur-md flex items-center justify-center z-[150] p-4 animate-fade-in">
      <div className="w-full max-w-lg tactic-border tactic-cut p-1 bg-black/60 shadow-2xl relative">
        <div className="scanline"></div>
        
        <div className="bg-black/80 p-8 relative z-10">
          <header className="flex items-center justify-between mb-8 border-b border-white/5 pb-4">
            <div className="flex items-center gap-4">
              <div className="w-10 h-10 bg-[#cd5241]/20 tactic-cut flex items-center justify-center text-[#cd5241]">
                <FaServer className="text-lg" />
              </div>
              <div>
                <h2 className="text-xl font-black uppercase italic text-white tracking-tighter">手动录入服务器</h2>
                <p className="text-[10px] text-gray-500 uppercase tracking-[0.3em]">Manual Link Protocol</p>
              </div>
            </div>
            <button onClick={onClose} className="text-gray-600 hover:text-white transition-colors">
              <FaTimes />
            </button>
          </header>

          <form onSubmit={handleSubmit} className="space-y-5">
            <div className="grid grid-cols-2 gap-5">
              <TacticInput 
                label="识别 ID (Unique ID)" 
                icon={<FaFingerprint />}
                placeholder="server-01"
                value={formData.id}
                error={errors.id}
                onChange={v => setFormData({...formData, id: v})}
              />
              <TacticInput 
                label="显示名称 (Alias)" 
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
                icon={<FaNetworkWired />}
                placeholder="127.0.0.1"
                value={formData.ip}
                error={errors.ip}
                onChange={v => setFormData({...formData, ip: v})}
              />
              <TacticInput 
                label="通讯端口" 
                icon={<FaNetworkWired />}
                placeholder="28082"
                value={formData.port}
                error={errors.port}
                onChange={v => setFormData({...formData, port: v})}
              />
            </div>

            <TacticInput 
              label="Player ID (Steam ID)" 
              icon={<FaKey />}
              placeholder="7656119XXXXXXXXXX"
              value={formData.playerId}
              error={errors.playerId}
              onChange={v => setFormData({...formData, playerId: v})}
            />

            <TacticInput 
              label="Player Token (配对令牌)" 
              icon={<FaKey />}
              placeholder="-1234567890"
              value={formData.playerToken}
              error={errors.playerToken}
              onChange={v => setFormData({...formData, playerToken: v})}
            />

            <div className="flex gap-4 pt-6 border-t border-white/5">
              <button 
                type="submit" 
                className="flex-1 tactic-cut bg-[#cd5241] py-4 text-[11px] font-black uppercase tracking-[0.3em] hover:bg-[#b04537] transition-all shadow-lg shadow-[#cd5241]/20 flex items-center justify-center gap-2 group"
              >
                录入控制终端 <FaArrowRight className="group-hover:translate-x-1 transition-transform" />
              </button>
              <button 
                type="button" 
                onClick={onClose}
                className="px-8 py-4 tactic-cut border border-white/10 text-gray-500 text-[10px] font-black uppercase hover:text-white transition-all"
              >
                取消
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
}

function TacticInput({ label, icon, placeholder, value, error, onChange, type = "text" }) {
  return (
    <div className="space-y-1.5">
      <label className="block text-[9px] font-black text-gray-600 uppercase tracking-widest pl-2 border-l border-[#cd5241]/30">{label}</label>
      <div className="relative">
        <div className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-700 text-[10px]">
          {icon}
        </div>
        <input
          type={type}
          className={`w-full bg-white/[0.03] border ${error ? 'border-red-500/50' : 'border-white/5'} tactic-cut pl-9 pr-4 py-2.5 text-xs text-white outline-none focus:border-[#cd5241]/50 transition-all placeholder:text-gray-800`}
          placeholder={placeholder}
          value={value}
          onChange={e => onChange(e.target.value)}
        />
      </div>
      {error && <p className="text-[8px] font-black text-red-500 uppercase italic">{"!!"} {error}</p>}
    </div>
  );
}

export default AddServerModal;
