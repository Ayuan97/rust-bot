import { useState, useEffect, useMemo } from 'react';
import {
  FaLightbulb, FaTrash, FaSync, FaPowerOff, FaBolt,
  FaEdit, FaTerminal, FaRobot, FaSearch, FaStar, FaRegStar,
  FaDoorOpen, FaCrosshairs, FaFan, FaBell, FaBox, FaShieldAlt, FaExclamationTriangle, FaWifi
} from 'react-icons/fa';
import socketService from '../services/socket';
import { getDevices, deleteDevice as apiDeleteDevice, checkDeviceReachability } from '../services/api';
import { useToast } from './Toast';
import { useConfirm } from './ConfirmModal';
import EmptyState from './EmptyState';
import { DeviceListSkeleton } from './Skeleton';
import DeviceEditModal from './DeviceEditModal';

// 自动化模式名称映射
const AUTO_MODE_NAMES = {
  0: null, 1: '白天开启', 2: '夜晚开启', 3: '始终开启', 4: '始终关闭', 7: '在线开启', 8: '在线关闭'
};

// ============================================================================
// 子组件：战术工具栏
// ============================================================================
function TacticalToolbar({
  searchTerm, setSearchTerm,
  filterType, setFilterType,
  onRefresh, loading,
  onCheckReachability, checking,
  stats
}) {
  return (
    <div className="relative isolate overflow-hidden tactic-border tactic-cut bg-black/40 shadow-2xl transition-all duration-300">
      {/* 顶部装饰条 */}
      <div className="absolute top-0 left-0 right-0 h-[1px] bg-gradient-to-r from-transparent via-white/20 to-transparent opacity-50"></div>

      <div className="flex flex-col md:flex-row items-center justify-between gap-6 p-5">

        {/* 左侧：搜索区 */}
        <div className="relative w-full md:w-auto md:min-w-[320px] group">
          <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none">
            <FaSearch className="h-4 w-4 text-gray-400 group-focus-within:text-rust-orange transition-colors" />
          </div>
          <input
            type="text"
            className="block w-full tactic-cut border border-white/5 bg-black/40 py-2.5 pl-11 pr-4 text-sm text-gray-200 placeholder:text-gray-600 focus:border-white/20 focus:bg-black/60 outline-none transition-all"
            placeholder="搜索设备..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
          />
        </div>

        {/* 中间：过滤器 */}
        <div className="flex items-center gap-2 p-1 bg-black/40 tactic-cut border border-white/5">
          <FilterTab active={filterType === 'all'} onClick={() => setFilterType('all')} icon={<FaBolt />} label="全部" />
          <FilterTab active={filterType === 'light'} onClick={() => setFilterType('light')} icon={<FaLightbulb />} label="灯光" />
          <FilterTab active={filterType === 'turret'} onClick={() => setFilterType('turret')} icon={<FaCrosshairs />} label="防御" />
          <FilterTab active={filterType === 'door'} onClick={() => setFilterType('door')} icon={<FaDoorOpen />} label="门控" />
        </div>

        {/* 右侧：操作区 */}
        <div className="flex items-center gap-3">
          <div className="h-8 w-px bg-white/10 mx-1 hidden md:block"></div>

          <button
            onClick={() => onCheckReachability(false)}
            disabled={checking}
            className="group relative flex items-center gap-2 px-4 py-2 bg-indigo-500/10 hover:bg-indigo-500/20 text-indigo-400 tactic-cut border border-indigo-500/20 hover:border-indigo-500/40 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <span className={`flex items-center justify-center ${checking ? 'animate-spin' : ''}`}>
              {checking ? <FaSync className="text-xs" /> : <FaWifi className="text-xs" />}
            </span>
            <span className="text-xs font-bold tracking-wider">连接检测</span>

            {/* 状态指示点 */}
            <span className="flex h-2 w-2 absolute top-0 right-0 -mt-1 -mr-1">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-indigo-400 opacity-75"></span>
              <span className="relative inline-flex rounded-full h-2 w-2 bg-indigo-500"></span>
            </span>
          </button>

          <button
            onClick={onRefresh}
            className="p-2.5 text-gray-400 hover:text-white hover:bg-white/10 tactic-cut transition-all border border-transparent hover:border-white/10"
            title="刷新列表"
          >
            <FaSync className={`${loading ? 'animate-spin' : ''}`} />
          </button>
        </div>
      </div>

      {/* 底部状态栏 */}
      <div className="bg-black/40 px-5 py-2 flex items-center gap-6 text-[10px] font-mono text-gray-500 uppercase tracking-wider border-t border-white/5">
        <div className="flex items-center gap-2">
          <div className="w-1.5 h-1.5 rounded-full bg-green-500 shadow-[0_0_5px_rgba(34,197,94,0.5)]"></div>
          系统在线
        </div>
        <div>总设备: <span className="text-gray-300">{stats.total}</span></div>
        <div>活跃中: <span className="text-rust-orange">{stats.active}</span></div>
        <div>警报器: <span className="text-red-400">{stats.alarms}</span></div>
      </div>
    </div>
  );
}

function FilterTab({ active, onClick, icon, label }) {
  return (
    <button
      onClick={onClick}
      className={`relative px-4 py-1.5 tactic-cut text-[10px] font-black uppercase tracking-wider flex items-center gap-2 transition-all ${active
        ? 'bg-rust-dark text-white '
        : 'text-gray-500 hover:text-gray-300 hover:bg-white/5'
        }`}
    >
      {icon} {label}
    </button>
  );
}

// ============================================================================
// 子组件：智能开关卡片 (SmartSwitchCard) - 强调交互
// ============================================================================
function SmartSwitchCard({ device, isReadOnly, onToggle, onEdit, onDelete, onPin, isPinned, onCheck }) {
  const isOn = device.currentValue;
  const isUnreachable = device.reachable === false;

  return (
    <div className={`group relative h-full flex flex-col tactic-cut border transition-all duration-300 overflow-hidden
      ${isOn
        ? 'border-rust-orange/50 bg-[#cd5241]/5'
        : 'border-white/10 bg-black/20 hover:bg-black/40 hover:border-white/20'
      }
      ${isUnreachable ? 'opacity-70 border-yellow-500/30' : ''}
    `}>
      {/* 顶部光效 - 增强亮度 */}
      {isOn && <div className="absolute top-0 left-0 right-0 h-[2px] bg-[#cd5241] shadow-[0_0_15px_rgba(205,82,65,0.8)]"></div>}

      {/* 不可达覆盖层 */}
      {isUnreachable && (
        <div className="absolute inset-0 bg-black/90 backdrop-blur-[1px] z-20 flex flex-col items-center justify-center text-center p-4 cursor-pointer"
          onClick={onCheck}
        >
          <FaExclamationTriangle className="text-3xl text-yellow-500 mb-2 animate-pulse" />
          <span className="text-xs font-bold text-yellow-500 uppercase tracking-widest">连接丢失</span>
          <span className="text-[10px] text-gray-500 mt-1">点击移除设备</span>
        </div>
      )}

      {/* 卡片内容 */}
      <div className="p-5 flex-1 flex flex-col relative z-10">
        <div className="flex justify-between items-start mb-4">
          <div className={`w-12 h-12 tactic-cut flex items-center justify-center text-2xl transition-all duration-500 ${isOn
            ? 'bg-[#cd5241] text-white shadow-[0_0_20px_rgba(205,82,65,0.4)]'
            : 'bg-white/5 text-gray-600'
            }`}>
            {getDeviceIcon(device.name, device.type)}
          </div>
          <button onClick={onPin} className={`text-sm transition-colors ${isPinned ? 'text-yellow-400' : 'text-gray-700 hover:text-gray-500'}`}>
            {isPinned ? <FaStar /> : <FaRegStar />}
          </button>
        </div>

        <div className="mb-6">
          <h3 className={`text-base font-black uppercase tracking-tight truncate mb-1 transition-colors ${isOn ? 'text-white' : 'text-gray-400'}`}>
            {device.name}
          </h3>
          <div className="flex items-center gap-2">
            <span className="text-[10px] bg-white/5 px-1.5 py-0.5 tactic-cut text-gray-500 font-mono">#{device.entityId}</span>
            {AUTO_MODE_NAMES[device.autoMode] && (
              <span className="text-[9px] text-lime-400 bg-lime-400/10 px-1.5 py-0.5 tactic-cut font-bold uppercase flex items-center gap-1 border border-lime-400/20">
                <FaRobot className="text-[8px]" /> {AUTO_MODE_NAMES[device.autoMode]}
              </span>
            )}
          </div>
        </div>

        <div className="mt-auto">
          {/* 大开关按钮 */}
          <button
            onClick={() => !isReadOnly && onToggle(device)}
            disabled={isReadOnly}
            title={isReadOnly ? '续费后可控制设备' : ''}
            className={`w-full py-3.5 tactic-cut flex items-center justify-center gap-3 transition-all duration-300 relative overflow-hidden group/btn ${isReadOnly
              ? 'bg-black/20 border border-white/5 text-gray-600 cursor-not-allowed'
              : isOn
                ? 'bg-[#cd5241] text-white hover:bg-[#a03525]'
                : 'bg-black/40 border border-white/10 text-gray-500 hover:bg-white/5 hover:text-gray-300'
              }`}
          >
            <FaPowerOff className={`text-sm ${isOn && !isReadOnly ? '' : 'group-hover/btn:scale-110 transition-transform'}`} />
            <span className="text-xs font-black uppercase tracking-widest">
              {isReadOnly ? '已暂停' : isOn ? '已启动' : '关闭中'}
            </span>
          </button>
        </div>
      </div>

      {/* 底部悬浮操作栏 (Group Hover 显示) */}
      <div className="absolute top-4 right-14 flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity duration-200">
        <ActionIconBtn icon={<FaEdit />} onClick={onEdit} />
        <ActionIconBtn icon={<FaTrash />} variant="danger" onClick={onDelete} />
      </div>
    </div>
  );
}

// ============================================================================
// 子组件：智能警报卡片 (SmartAlarmCard) - 强调状态
// ============================================================================
function SmartAlarmCard({ device, isReadOnly, onEdit, onDelete, onPin, isPinned, onCheck }) {
  const isTriggered = false; // 目前没有实时触发状态字段
  const isUnreachable = device.reachable === false;

  return (
    <div className={`group relative h-full flex flex-col tactic-cut border bg-black/20 transition-all duration-300 overflow-hidden
      ${isTriggered
        ? 'border-red-500/50 shadow-[0_0_30px_rgba(239,68,68,0.2)]'
        : 'border-white/10 hover:border-blue-500/30'
      }
      ${isUnreachable ? 'opacity-70 border-yellow-500/30' : ''}
    `}>
      {/* 不可达逻辑同上 */}
      {isUnreachable && (
        <div className="absolute inset-0 bg-black/90 backdrop-blur-[1px] z-20 flex flex-col items-center justify-center text-center p-4 cursor-pointer" onClick={onCheck}>
          <FaExclamationTriangle className="text-3xl text-yellow-500 mb-2 animate-pulse" />
          <span className="text-xs font-bold text-yellow-500 uppercase tracking-widest">连接丢失</span>
        </div>
      )}

      {/* 状态指示条 */}
      <div className={`absolute left-0 top-0 bottom-0 w-1 ${isTriggered ? 'bg-red-500 animate-pulse' : 'bg-blue-500/50'}`}></div>

      <div className="p-5 pl-7 flex-1 flex flex-col">
        <div className="flex justify-between items-start mb-2">
          <div className="flex items-center gap-2 text-xs font-bold text-blue-400 uppercase tracking-wider">
            <FaShieldAlt /> 安全系统
          </div>
          <button onClick={onPin} className={`text-sm transition-colors ${isPinned ? 'text-yellow-400' : 'text-gray-700 hover:text-gray-500'}`}>
            {isPinned ? <FaStar /> : <FaRegStar />}
          </button>
        </div>

        <h3 className="text-lg font-black text-gray-200 uppercase tracking-tight mb-4">{device.name}</h3>

        <div className="mt-auto space-y-3">
          {/* 最近触发时间 */}
          <div className="bg-black/40 tactic-cut p-3 border border-white/5">
            <div className="text-[10px] text-gray-500 uppercase mb-1">最近活动</div>
            <div className="text-xs font-mono text-gray-300">
              {device.lastTrigger ? new Date(device.lastTrigger).toLocaleString() : '暂无触发记录'}
            </div>
          </div>

          {/* 自定义消息展示 */}
          {device.message && (
            <div className="text-[10px] text-gray-500 flex items-start gap-2 bg-blue-500/5 p-2 tactic-cut border border-blue-500/10">
              <FaBell className="mt-0.5 text-blue-400" />
              <span className="line-clamp-2 italic">"{device.message}"</span>
            </div>
          )}
        </div>
      </div>

      <div className="absolute top-4 right-14 flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity duration-200">
        <ActionIconBtn icon={<FaEdit />} onClick={onEdit} />
        <ActionIconBtn icon={<FaTrash />} variant="danger" onClick={onDelete} />
      </div>
    </div>
  );
}

// ============================================================================
// 子组件：存储监控卡片 (StorageMonitorCard) - 强调容量
// ============================================================================
function StorageMonitorCard({ device, isReadOnly, onEdit, onDelete, onPin, isPinned, onCheck }) {
  const isUnreachable = device.reachable === false;

  return (
    <div className={`group relative h-full flex flex-col tactic-cut border border-white/10 bg-black/20 transition-all duration-300 overflow-hidden hover:border-emerald-500/30
      ${isUnreachable ? 'opacity-70 border-yellow-500/30' : ''}
    `}>
      {isUnreachable && (
        <div className="absolute inset-0 bg-black/90 backdrop-blur-[1px] z-20 flex flex-col items-center justify-center text-center p-4 cursor-pointer" onClick={onCheck}>
          <FaExclamationTriangle className="text-3xl text-yellow-500 mb-2 animate-pulse" />
          <span className="text-xs font-bold text-yellow-500 uppercase tracking-widest">连接丢失</span>
        </div>
      )}

      <div className="p-5 flex-1 flex flex-col">
        <div className="flex justify-between items-start mb-4">
          <div className={`w-10 h-10 tactic-cut bg-emerald-500/10 border border-emerald-500/20 text-emerald-500 flex items-center justify-center text-lg`}>
            <FaBox />
          </div>
          <button onClick={onPin} className={`text-sm transition-colors ${isPinned ? 'text-yellow-400' : 'text-gray-700 hover:text-gray-500'}`}>
            {isPinned ? <FaStar /> : <FaRegStar />}
          </button>
        </div>

        <div className="mb-4">
          <h3 className="text-sm font-black text-gray-200 uppercase tracking-tight truncate mb-1">{device.name}</h3>
          <span className="text-[10px] bg-white/5 px-1.5 py-0.5 tactic-cut text-gray-500 font-mono">#{device.entityId}</span>
        </div>

        <div className="mt-auto">
          <div className="bg-black/40 tactic-cut px-3 py-2 border border-white/5 flex items-center justify-between">
            <span className="text-[10px] text-gray-500 uppercase">状态</span>
            <span className="text-[10px] font-bold text-emerald-400 uppercase">监控中</span>
          </div>
        </div>
      </div>

      <div className="absolute top-4 right-14 flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity duration-200">
        <ActionIconBtn icon={<FaEdit />} onClick={onEdit} />
        <ActionIconBtn icon={<FaTrash />} variant="danger" onClick={onDelete} />
      </div>
    </div>
  );
}

function ActionIconBtn({ icon, onClick, variant = 'default' }) {
  return (
    <button
      onClick={(e) => { e.stopPropagation(); onClick(); }}
      className={`w-7 h-7 flex items-center justify-center tactic-cut transition-all ${variant === 'danger'
        ? 'bg-red-500/10 text-red-400 hover:bg-red-500 hover:text-white'
        : 'bg-white/5 text-gray-400 hover:bg-white/20 hover:text-white'
        }`}
    >
      <span className="text-xs">{icon}</span>
    </button>
  );
}

function getDeviceIcon(name, type) {
  if (type === 'ALARM') return <FaBell />;
  if (type === 'STORAGE') return <FaBox />;
  const n = name.toLowerCase();
  if (n.includes('门')) return <FaDoorOpen />;
  if (n.includes('炮') || n.includes('枪') || n.includes('turret')) return <FaCrosshairs />;
  if (n.includes('风扇') || n.includes('抽风')) return <FaFan />;
  return <FaLightbulb />;
}

// ============================================================================
// 主组件：设备控制中心
// ============================================================================
function DeviceControl({ serverId, isReadOnly = false }) {
  const [devices, setDevices] = useState([]);
  const [loading, setLoading] = useState(false);
  const [editingDevice, setEditingDevice] = useState(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [filterType, setFilterType] = useState('all');
  const [checking, setChecking] = useState(false);
  const [pinnedIds, setPinnedIds] = useState(() => {
    const saved = localStorage.getItem(`pinned_devices_${serverId}`);
    return saved ? JSON.parse(saved) : [];
  });

  const toast = useToast();
  const confirm = useConfirm();

  // 虚拟演示设备
  const demoDevices = [
    { id: 'demo1', entityId: 12345, name: '核心权限门 (演示)', type: 'SWITCH', currentValue: false, autoMode: 0, reachable: true },
    { id: 'demo2', entityId: 67890, name: '外围自动炮塔 (演示)', type: 'SWITCH', currentValue: true, autoMode: 7, reachable: true },
    { id: 'demo3', entityId: 11223, name: '基地入侵警报 (演示)', type: 'ALARM', lastTrigger: Date.now() - 3600000, message: '于扇区7检测到活动', reachable: true },
    { id: 'demo4', entityId: 44556, name: '主战利品室 (演示)', type: 'STORAGE', reachable: true },
  ];

  const isDemo = devices.length === 0 && !loading;
  const activeDevices = isDemo ? demoDevices : devices;

  // 统计数据
  const stats = useMemo(() => ({
    total: activeDevices.length,
    active: activeDevices.filter(d => d.currentValue).length,
    alarms: activeDevices.filter(d => d.type === 'ALARM').length
  }), [activeDevices]);

  useEffect(() => {
    fetchDevices();
    const handleEntityChanged = (data) => {
      if (data.serverId === serverId) {
        setDevices((prev) => prev.map((d) => d.entityId === data.entityId ? { ...d, currentValue: data.value } : d));
      }
    };
    const handleDevicePaired = (data) => {
      if (data.serverId === serverId) {
        toast.success(`检测到新设备: ${data.name}`);
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
    if (!serverId) {
      setDevices([]);
      return;
    }
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
      toast.info('演示模式：无法操作真实设备');
      return;
    }
    const originalValue = device.currentValue;
    const newValue = !originalValue;
    setDevices(prev => prev.map(d => d.entityId === device.entityId ? { ...d, currentValue: newValue } : d));
    try {
      await socketService.controlDevice(serverId, device.entityId, newValue);
    } catch (e) {
      setDevices(prev => prev.map(d => d.entityId === device.entityId ? { ...d, currentValue: originalValue } : d));
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
        const aPinned = pinnedIds.includes(a.entityId);
        const bPinned = pinnedIds.includes(b.entityId);
        if (aPinned && !bPinned) return -1;
        if (!aPinned && bPinned) return 1;
        return 0;
      });
  }, [activeDevices, searchTerm, filterType, pinnedIds]);

  const handleDeleteDevice = async (entityId) => {
    if (isDemo) return;
    const confirmed = await confirm({ title: '注销设备', message: '确定要断开与此设备的远程连接吗？此操作无法撤销。', type: 'danger' });
    if (!confirmed) return;
    try {
      await apiDeleteDevice(serverId, entityId);
      fetchDevices();
      toast.success('设备连接已断开');
    } catch (e) { toast.error('操作失败'); }
  };

  const handleCheckReachability = async (removeUnreachable = false) => {
    if (isDemo) {
      toast.info('演示模式：无法检测可达性');
      return;
    }
    setChecking(true);
    try {
      const response = await checkDeviceReachability(serverId, removeUnreachable);
      const { reachableCount, unreachableCount, removedCount } = response.data;

      if (unreachableCount === 0) {
        toast.success(`系统正常：${reachableCount} 个设备运行中`);
      } else if (removedCount > 0) {
        toast.warning(`已清理 ${removedCount} 个失效设备`);
      } else {
        toast.warning(`警告：${unreachableCount} 个设备无法连接`);
      }
      fetchDevices();
    } catch (e) {
      toast.error('连接检测失败');
    } finally {
      setChecking(false);
    }
  };

  if (loading && !devices.length) return <div className="p-8"><DeviceListSkeleton /></div>;

  return (
    <div className="flex flex-col h-full space-y-6 animate-fade-in font-sans pb-6">
      <TacticalToolbar
        searchTerm={searchTerm}
        setSearchTerm={setSearchTerm}
        filterType={filterType}
        setFilterType={setFilterType}
        onRefresh={fetchDevices}
        loading={loading}
        onCheckReachability={handleCheckReachability}
        checking={checking}
        stats={stats}
      />

      {isDemo && (
        <div className="mx-1 tactic-cut bg-indigo-500/10 border border-indigo-500/20 p-4 flex items-center gap-4">
          <FaRobot className="text-indigo-400 text-xl" />
          <div className="text-sm text-indigo-200">
            <span className="font-bold">演示模式运行中</span> — 请在 Rust 游戏中使用 "Rust+ 配对" 来连接真实设备。
          </div>
        </div>
      )}

      {/* Grid Layout */}
      <div className="flex-1 overflow-y-auto pr-2 custom-scrollbar">
        {filteredDevices.length === 0 ? (
          <EmptyState title="未找到设备" description="请尝试调整过滤条件或配对新设备。" icon={<FaSearch className="text-4xl text-gray-700" />} />
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5 gap-4">
            {filteredDevices.map((device) => {
              const commonProps = {
                key: device.id,
                device,
                isReadOnly,
                onEdit: () => setEditingDevice(device),
                onDelete: () => handleDeleteDevice(device.entityId),
                onPin: () => togglePin(device.entityId),
                isPinned: pinnedIds.includes(device.entityId),
                onCheck: () => handleCheckReachability(true)
              };

              if (device.type === 'ALARM') {
                return <SmartAlarmCard {...commonProps} />;
              }
              if (device.type === 'STORAGE') {
                return <StorageMonitorCard {...commonProps} />;
              }
              return <SmartSwitchCard {...commonProps} onToggle={handleToggleDevice} />;
            })}
          </div>
        )}
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

export default DeviceControl;
