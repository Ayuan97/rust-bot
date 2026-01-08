import { useState, useEffect, useMemo } from 'react';
import { 
  FaLightbulb, FaTrash, FaSync, FaPowerOff, FaBolt, 
  FaEdit, FaTerminal, FaRobot, FaSearch, FaStar, FaRegStar,
  FaDoorOpen, FaCrosshairs, FaFan
} from 'react-icons/fa';
import socketService from '../services/socket';
import { getDevices, deleteDevice as apiDeleteDevice } from '../services/api';
import { useToast } from './Toast';
import { useConfirm } from './ConfirmModal';
import EmptyState from './EmptyState';
import { DeviceListSkeleton } from './Skeleton';
import DeviceEditModal from './DeviceEditModal';

// 自动化模式名称映射
const AUTO_MODE_NAMES = {
  0: null, 1: '白天开启', 2: '夜晚开启', 3: '始终开启', 4: '始终关闭', 7: '在线开启', 8: '在线关闭'
};

function DeviceControl({ serverId, isReadOnly = false }) {
  const [devices, setDevices] = useState([]);
  const [loading, setLoading] = useState(false);
  const [editingDevice, setEditingDevice] = useState(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [filterType, setFilterType] = useState('all'); 
  const [pinnedIds, setPinnedIds] = useState(() => {
    const saved = localStorage.getItem(`pinned_devices_${serverId}`);
    return saved ? JSON.parse(saved) : [];
  });

  const toast = useToast();
  const confirm = useConfirm();

  // 虚拟演示设备：当真实列表为空时显示
  const demoDevices = [
    { id: 'demo1', entity_id: 12345, name: '示例_核心房大门', type: 'Door', currentValue: false, auto_mode: 0 },
    { id: 'demo2', entity_id: 67890, name: '示例_基地外围炮塔', type: 'Turret', currentValue: true, auto_mode: 7 },
    { id: 'demo3', entity_id: 11223, name: '示例_自动感应灯', type: 'Light', currentValue: false, auto_mode: 2 },
  ];

  const isDemo = devices.length === 0 && !loading;
  const activeDevices = isDemo ? demoDevices : devices;

  useEffect(() => {
    fetchDevices();
    const handleEntityChanged = (data) => {
      if (data.serverId === serverId) {
        setDevices((prev) => prev.map((d) => d.entity_id === data.entityId ? { ...d, currentValue: data.value } : d));
      }
    };
    const handleDevicePaired = (data) => {
      if (data.serverId === serverId) {
        toast.success(`新设备接入: ${data.name}`);
        fetchDevices();
      }
    };
    socketService.on('entity:changed', handleEntityChanged);
    socketService.on('device:paired', handleDevicePaired);
    return () => {
      socketService.off('entity:changed', handleEntityChanged);
      socketService.off('device:paired', handleDevicePaired);
    };
  }, [serverId]);

  useEffect(() => {
    localStorage.setItem(`pinned_devices_${serverId}`, JSON.stringify(pinnedIds));
  }, [pinnedIds, serverId]);

  const fetchDevices = async () => {
    setLoading(true);
    try {
      const response = await getDevices(serverId);
      setDevices(response.data.devices || []);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  const togglePin = (id) => {
    setPinnedIds(prev => prev.includes(id) ? prev.filter(i => i !== id) : [...prev, id]);
  };

  const handleToggleDevice = async (device) => {
    if (isDemo) {
      toast.info('演示模式无法操作真实设备');
      return;
    }
    const originalValue = device.currentValue;
    const newValue = !originalValue;
    setDevices(prev => prev.map(d => d.entity_id === device.entity_id ? { ...d, currentValue: newValue } : d));
    try {
      await socketService.controlDevice(serverId, device.entity_id, newValue);
    } catch (e) {
      setDevices(prev => prev.map(d => d.entity_id === device.entity_id ? { ...d, currentValue: originalValue } : d));
      toast.error('指令发送失败');
    }
  };

  const filteredDevices = useMemo(() => {
    return activeDevices
      .filter(d => {
        const matchesSearch = d.name.toLowerCase().includes(searchTerm.toLowerCase());
        if (filterType === 'all') return matchesSearch;
        const nameMatch = d.name.toLowerCase();
        const typeMatch = d.type ? d.type.toLowerCase() : '';
        if (filterType === 'light') return matchesSearch && (nameMatch.includes('灯') || typeMatch.includes('light'));
        if (filterType === 'turret') return matchesSearch && (nameMatch.includes('炮') || nameMatch.includes('枪') || typeMatch.includes('turret'));
        if (filterType === 'door') return matchesSearch && (nameMatch.includes('门') || typeMatch.includes('door'));
        return matchesSearch;
      })
      .sort((a, b) => {
        const aPinned = pinnedIds.includes(a.entity_id);
        const bPinned = pinnedIds.includes(b.entity_id);
        if (aPinned && !bPinned) return -1;
        if (!aPinned && bPinned) return 1;
        return 0;
      });
  }, [activeDevices, searchTerm, filterType, pinnedIds]);

  const handleDeleteDevice = async (entityId) => {
    if (isDemo) return;
    const confirmed = await confirm({ title: '注销设备', message: '确定要断开与此设备的远程连接吗？', type: 'danger' });
    if (!confirmed) return;
    try {
      await apiDeleteDevice(serverId, entityId);
      fetchDevices();
      toast.success('设备已成功移除');
    } catch (e) { toast.error('操作失败'); }
  };

  const getDeviceIcon = (name, type) => {
    const n = name.toLowerCase();
    const t = type ? type.toLowerCase() : '';
    if (n.includes('门') || t.includes('door')) return <FaDoorOpen />;
    if (n.includes('炮') || n.includes('枪') || t.includes('turret')) return <FaCrosshairs />;
    if (n.includes('风扇') || n.includes('抽风')) return <FaFan />;
    return <FaLightbulb />;
  };

  if (loading) return <div className="p-8"><DeviceListSkeleton /></div>;

  return (
    <div className="flex flex-col h-full space-y-6 animate-fade-in font-sans">
      {/* 顶部工具栏 */}
      <div className="flex flex-wrap items-center justify-between gap-6 p-6 tactic-border tactic-cut bg-black/30 shadow-xl">
        <div className="relative flex-1 min-w-[280px]">
          <FaSearch className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-500" />
          <input 
            type="text"
            placeholder="搜索设备名称（如：核心门、防御炮）..."
            className="w-full pl-12 pr-4 py-3 bg-black/40 border border-white/5 tactic-cut text-sm focus:border-[#cd5241]/50 outline-none transition-all placeholder:text-gray-700"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
          />
        </div>
        
        <div className="flex items-center gap-2">
          <FilterBtn active={filterType === 'all'} onClick={() => setFilterType('all')} icon={<FaBolt />} label="全部" />
          <FilterBtn active={filterType === 'light'} onClick={() => setFilterType('light')} icon={<FaLightbulb />} label="灯光" />
          <FilterBtn active={filterType === 'turret'} onClick={() => setFilterType('turret')} icon={<FaCrosshairs />} label="防御" />
          <FilterBtn active={filterType === 'door'} onClick={() => setFilterType('door')} icon={<FaDoorOpen />} label="大门" />
          <div className="w-px h-6 bg-white/5 mx-2" />
          <button onClick={fetchDevices} className="p-2 text-gray-500 hover:text-[#cd5241] transition-all">
            <FaSync className={loading ? 'animate-spin' : ''} />
          </button>
        </div>
      </div>

      {isDemo && (
        <div className="bg-[#cd5241]/10 border-l-4 border-[#cd5241] p-5 flex items-start gap-4">
          <FaRobot className="text-[#cd5241] text-2xl mt-1" />
          <div>
            <div className="text-sm font-black text-white uppercase mb-1">未检测到绑定的智能设备 [ 演示模式 ]</div>
            <p className="text-xs text-gray-400 leading-relaxed">
              请在游戏内使用“智能开关”或“警报器”，并使用 Rust 手机 App 完成配对。
              <br />系统检测到新配对后，此处将自动同步真实的设备列表。
            </p>
          </div>
        </div>
      )}

      {/* 设备展示网格 */}
      <div className="flex-1 overflow-y-auto pr-2 custom-scrollbar">
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-5">
          {filteredDevices.map((device) => (
            <div 
              key={device.id} 
              className={`relative tactic-border tactic-cut p-1 group transition-all duration-500 ${device.currentValue ? 'bg-[#cd5241]/10 border-[#cd5241]/40 shadow-[0_0_20px_rgba(205,82,65,0.1)]' : 'bg-black/30 border-white/5 hover:border-white/20'}`}
            >
              <div className="bg-black/40 p-5 h-full flex flex-col relative overflow-hidden">
                <button 
                  onClick={() => !isDemo && togglePin(device.entity_id)}
                  className={`absolute top-3 right-3 p-1 transition-colors z-20 ${pinnedIds.includes(device.entity_id) ? 'text-[#cd5241]' : 'text-gray-800 hover:text-gray-600'}`}
                >
                  {pinnedIds.includes(device.entity_id) ? <FaStar /> : <FaRegStar />}
                </button>

                <div className="flex items-center gap-4 mb-6 relative z-10">
                  <div className={`w-12 h-12 tactic-cut flex items-center justify-center text-xl border transition-all ${device.currentValue ? 'bg-[#cd5241] border-[#cd5241]/30 text-white shadow-lg shadow-[#cd5241]/20' : 'bg-gray-800 border-white/5 text-gray-600'}`}>
                    {getDeviceIcon(device.name, device.type)}
                  </div>
                  <div className="min-w-0 flex-1">
                    <h3 className="text-base font-black truncate uppercase tracking-tight">{device.name}</h3>
                    <div className="text-[10px] text-gray-600 font-mono flex items-center gap-2 mt-1 uppercase font-bold">
                       识别码: {device.entity_id}
                       {device.command && <span className="text-[#cd5241] italic">!{device.command}</span>}
                    </div>
                  </div>
                </div>

                <div className="flex-1 flex flex-col justify-end space-y-4 relative z-10">
                  {AUTO_MODE_NAMES[device.auto_mode] && (
                    <div className="text-[9px] px-2 py-1 bg-[#a3e635]/10 text-[#a3e635] tactic-cut inline-flex items-center gap-2 w-fit font-black border border-[#a3e635]/20 uppercase">
                      <FaRobot className="text-[8px]" /> {AUTO_MODE_NAMES[device.auto_mode]}
                    </div>
                  )}

                  <div className="flex items-center justify-between pt-4 border-t border-white/5">
                    <div 
                      onClick={() => !isReadOnly && handleToggleDevice(device)}
                      className={`relative w-14 h-7 tactic-cut cursor-pointer transition-all ${isReadOnly ? 'opacity-30 cursor-not-allowed' : ''} ${device.currentValue ? 'bg-[#cd5241]' : 'bg-gray-800 shadow-inner'}`}
                    >
                      <div className={`absolute top-1 w-5 h-5 bg-white tactic-cut transition-all duration-300 ${device.currentValue ? 'right-1 shadow-[0_0_15px_white]' : 'left-1'}`} />
                    </div>

                    <div className="flex gap-2">
                      <ActionBtn onClick={() => setEditingDevice(device)} icon={<FaEdit />} title="设置" disabled={isReadOnly || isDemo} />
                      <ActionBtn onClick={() => handleDeleteDevice(device.entity_id)} icon={<FaTrash />} title="注销" variant="danger" disabled={isReadOnly || isDemo} />
                    </div>
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>

      {editingDevice && (
        <DeviceEditModal
          device={editingDevice}
          serverId={serverId}
          onClose={() => setEditingDevice(null)}
          onSaved={fetchDevices}
        />
      )}
    </div>
  );
}

function FilterBtn({ active, onClick, icon, label }) {
  return (
    <button 
      onClick={onClick}
      className={`px-4 py-2 tactic-cut text-[11px] font-black uppercase flex items-center gap-2 transition-all ${active ? 'bg-[#cd5241] text-white shadow-lg shadow-[#cd5241]/20' : 'text-gray-600 hover:bg-white/5 hover:text-gray-300'}`}
    >
      {icon} <span className="hidden sm:inline">{label}</span>
    </button>
  );
}

function ActionBtn({ onClick, icon, title, variant = 'default', disabled }) {
  return (
    <button 
      onClick={onClick}
      disabled={disabled}
      className={`w-8 h-8 flex items-center justify-center tactic-cut transition-all ${disabled ? 'opacity-20 cursor-not-allowed' : ''} ${variant === 'danger' ? 'hover:bg-red-500/20 text-gray-700 hover:text-red-400' : 'hover:bg-white/10 text-gray-700 hover:text-white'}`}
      title={title}
    >
      {icon}
    </button>
  );
}

export default DeviceControl;
