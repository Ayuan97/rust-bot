import { useState, useEffect, useMemo } from 'react';
import {
  FaLightbulb, FaTrash, FaSync, FaPowerOff, FaBolt,
  FaEdit, FaRobot, FaSearch, FaStar, FaRegStar,
  FaDoorOpen, FaCrosshairs, FaFan, FaBell, FaBox, FaShieldAlt, FaExclamationTriangle, FaWifi
} from 'react-icons/fa';
import socketService from '../services/socket';
import { getDevices, deleteDevice as apiDeleteDevice, checkDeviceReachability } from '../services/api';
import { useToast } from './Toast';
import { useConfirm } from './ConfirmModal';
import EmptyState from './EmptyState';
import { DeviceListSkeleton } from './Skeleton';
import DeviceEditModal from './DeviceEditModal';

// 自动化模式名称映射（Rust+ 智能开关真实模式）
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
    <div className="tac-panel">
      <div className="flex flex-col md:flex-row items-stretch md:items-center justify-between gap-4 p-4">
        {/* 搜索 */}
        <div className="relative w-full md:w-auto md:min-w-[300px]">
          <FaSearch className="absolute left-3.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-fg-mute pointer-events-none" />
          <input
            type="text"
            className="tac-input !pl-10"
            placeholder="搜索设备..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
          />
        </div>

        {/* 过滤 */}
        <div className="flex items-center gap-1 border border-ink-line p-1">
          <FilterTab active={filterType === 'all'} onClick={() => setFilterType('all')} icon={<FaBolt />} label="全部" />
          <FilterTab active={filterType === 'light'} onClick={() => setFilterType('light')} icon={<FaLightbulb />} label="灯光" />
          <FilterTab active={filterType === 'turret'} onClick={() => setFilterType('turret')} icon={<FaCrosshairs />} label="防御" />
          <FilterTab active={filterType === 'door'} onClick={() => setFilterType('door')} icon={<FaDoorOpen />} label="门控" />
        </div>

        {/* 操作 */}
        <div className="flex items-center gap-2">
          <button onClick={() => onCheckReachability(false)} disabled={checking} className="tac-btn tac-btn-ghost !py-2.5">
            {checking ? <FaSync className="text-xs animate-spin" /> : <FaWifi className="text-xs" />}
            连接检测
          </button>
          <button
            onClick={onRefresh}
            className="w-10 h-10 flex items-center justify-center border border-ink-line text-fg-dim hover:text-fg hover:border-fg-dim transition-colors shrink-0"
            title="刷新列表"
          >
            <FaSync className={loading ? 'animate-spin' : ''} />
          </button>
        </div>
      </div>

      {/* 统计栏 */}
      <div className="border-t border-ink-line px-4 py-2.5 flex items-center gap-6 font-mono text-[10px] uppercase tracking-wider text-fg-mute">
        <div className="flex items-center gap-2">
          <span className="w-1.5 h-1.5 bg-terminal" /> 系统在线
        </div>
        <div>总设备: <span className="text-fg">{stats.total}</span></div>
        <div>活跃中: <span className="text-hazard">{stats.active}</span></div>
        <div>警报器: <span className="text-fg">{stats.alarms}</span></div>
      </div>
    </div>
  );
}

function FilterTab({ active, onClick, icon, label }) {
  return (
    <button
      onClick={onClick}
      className={`px-3.5 py-1.5 text-xs font-bold flex items-center gap-2 transition-colors ${active
        ? 'bg-hazard-dim text-hazard'
        : 'text-fg-dim hover:text-fg hover:bg-ink-800'
        }`}
    >
      <span className="text-[11px]">{icon}</span> {label}
    </button>
  );
}

// ============================================================================
// 子组件：智能开关卡片
// ============================================================================
function SmartSwitchCard({ device, isReadOnly, onToggle, onEdit, onDelete, onPin, isPinned, onCheck }) {
  const isOn = device.currentValue;
  const isUnreachable = device.reachable === false;

  return (
    <div className={`group relative h-full flex flex-col border bg-ink-850 transition-colors overflow-hidden
      ${isOn ? 'border-hazard/50' : 'border-ink-line hover:border-ink-line2'}
      ${isUnreachable ? 'opacity-70' : ''}
    `}>
      {isOn && <div className="absolute top-0 left-0 right-0 h-0.5 bg-hazard" />}

      {isUnreachable && (
        <div className="absolute inset-0 bg-ink-900/90 z-20 flex flex-col items-center justify-center text-center p-4 cursor-pointer" onClick={onCheck}>
          <FaExclamationTriangle className="text-2xl text-hazard mb-2" />
          <span className="font-mono text-[11px] font-bold text-hazard uppercase tracking-wider">连接丢失</span>
          <span className="text-[10px] text-fg-mute mt-1">点击移除设备</span>
        </div>
      )}

      <div className="p-5 flex-1 flex flex-col relative z-10">
        <div className="flex justify-between items-start mb-4">
          <div className={`w-11 h-11 flex items-center justify-center text-xl border transition-colors ${isOn
            ? 'bg-hazard border-hazard text-white'
            : 'border-ink-line text-fg-mute'
            }`}>
            {getDeviceIcon(device.name, device.type)}
          </div>
          <button onClick={onPin} className={`text-sm transition-colors ${isPinned ? 'text-hazard' : 'text-fg-mute hover:text-fg-dim'}`}>
            {isPinned ? <FaStar /> : <FaRegStar />}
          </button>
        </div>

        <div className="mb-5">
          <h3 className={`text-base font-bold tracking-tight truncate mb-1.5 ${isOn ? 'text-fg' : 'text-fg-dim'}`}>
            {device.name}
          </h3>
          <div className="flex items-center gap-2 flex-wrap">
            <span className="font-mono text-[10px] text-fg-mute">#{device.entityId}</span>
            {AUTO_MODE_NAMES[device.autoMode] && (
              <span className="font-mono text-[9px] text-terminal uppercase tracking-wider flex items-center gap-1 border border-terminal/30 px-1.5 py-0.5">
                <FaRobot className="text-[8px]" /> {AUTO_MODE_NAMES[device.autoMode]}
              </span>
            )}
          </div>
        </div>

        <div className="mt-auto">
          <button
            onClick={() => !isReadOnly && onToggle(device)}
            disabled={isReadOnly}
            title={isReadOnly ? '续费后可控制设备' : ''}
            className={`w-full py-3.5 flex items-center justify-center gap-3 font-mono text-xs font-bold uppercase tracking-[0.15em] transition-colors ${isReadOnly
              ? 'border border-ink-line text-fg-mute cursor-not-allowed'
              : isOn
                ? 'bg-hazard text-white hover:bg-hazard-bright'
                : 'border border-ink-line text-fg-dim hover:text-fg hover:bg-ink-800'
              }`}
          >
            <FaPowerOff className="text-sm" />
            {isReadOnly ? '已暂停' : isOn ? '已启动 ON' : '关闭 OFF'}
          </button>
        </div>
      </div>

      <div className="absolute top-4 right-14 flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
        <ActionIconBtn icon={<FaEdit />} onClick={onEdit} />
        <ActionIconBtn icon={<FaTrash />} variant="danger" onClick={onDelete} />
      </div>
    </div>
  );
}

// ============================================================================
// 子组件：智能警报卡片
// ============================================================================
function SmartAlarmCard({ device, isReadOnly, onEdit, onDelete, onPin, isPinned, onCheck }) {
  const isUnreachable = device.reachable === false;

  return (
    <div className={`group relative h-full flex flex-col border border-ink-line bg-ink-850 transition-colors overflow-hidden hover:border-ink-line2
      ${isUnreachable ? 'opacity-70' : ''}
    `}>
      {isUnreachable && (
        <div className="absolute inset-0 bg-ink-900/90 z-20 flex flex-col items-center justify-center text-center p-4 cursor-pointer" onClick={onCheck}>
          <FaExclamationTriangle className="text-2xl text-hazard mb-2" />
          <span className="font-mono text-[11px] font-bold text-hazard uppercase tracking-wider">连接丢失</span>
        </div>
      )}

      <div className="absolute left-0 top-0 bottom-0 w-0.5 bg-hazard/60" />

      <div className="p-5 pl-6 flex-1 flex flex-col">
        <div className="flex justify-between items-start mb-3">
          <div className="tac-label flex items-center gap-1.5"><FaShieldAlt className="text-hazard" /> 安全警报</div>
          <button onClick={onPin} className={`text-sm transition-colors ${isPinned ? 'text-hazard' : 'text-fg-mute hover:text-fg-dim'}`}>
            {isPinned ? <FaStar /> : <FaRegStar />}
          </button>
        </div>

        <h3 className="text-base font-bold text-fg tracking-tight mb-4">{device.name}</h3>

        <div className="mt-auto space-y-2.5">
          <div className="border border-ink-line p-3">
            <div className="tac-label !text-[10px] mb-1">最近触发</div>
            <div className="font-mono text-xs text-fg">
              {device.lastTrigger ? new Date(device.lastTrigger).toLocaleString() : '暂无触发记录'}
            </div>
          </div>
          {device.message && (
            <div className="text-[11px] text-fg-dim flex items-start gap-2 border border-ink-line p-2">
              <FaBell className="mt-0.5 text-hazard shrink-0" />
              <span className="line-clamp-2">"{device.message}"</span>
            </div>
          )}
        </div>
      </div>

      <div className="absolute top-4 right-14 flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
        <ActionIconBtn icon={<FaEdit />} onClick={onEdit} />
        <ActionIconBtn icon={<FaTrash />} variant="danger" onClick={onDelete} />
      </div>
    </div>
  );
}

// ============================================================================
// 子组件：存储监控卡片
// ============================================================================
function StorageMonitorCard({ device, isReadOnly, onEdit, onDelete, onPin, isPinned, onCheck }) {
  const isUnreachable = device.reachable === false;

  return (
    <div className={`group relative h-full flex flex-col border border-ink-line bg-ink-850 transition-colors overflow-hidden hover:border-ink-line2
      ${isUnreachable ? 'opacity-70' : ''}
    `}>
      {isUnreachable && (
        <div className="absolute inset-0 bg-ink-900/90 z-20 flex flex-col items-center justify-center text-center p-4 cursor-pointer" onClick={onCheck}>
          <FaExclamationTriangle className="text-2xl text-hazard mb-2" />
          <span className="font-mono text-[11px] font-bold text-hazard uppercase tracking-wider">连接丢失</span>
        </div>
      )}

      <div className="p-5 flex-1 flex flex-col">
        <div className="flex justify-between items-start mb-4">
          <div className="w-10 h-10 border border-ink-line text-fg-dim flex items-center justify-center text-lg">
            <FaBox />
          </div>
          <button onClick={onPin} className={`text-sm transition-colors ${isPinned ? 'text-hazard' : 'text-fg-mute hover:text-fg-dim'}`}>
            {isPinned ? <FaStar /> : <FaRegStar />}
          </button>
        </div>

        <div className="mb-4">
          <h3 className="text-sm font-bold text-fg tracking-tight truncate mb-1.5">{device.name}</h3>
          <span className="font-mono text-[10px] text-fg-mute">#{device.entityId}</span>
        </div>

        <div className="mt-auto">
          <div className="border border-ink-line px-3 py-2 flex items-center justify-between">
            <span className="tac-label !text-[10px]">状态</span>
            <span className="font-mono text-[10px] text-terminal uppercase tracking-wider flex items-center gap-1.5">
              <span className="w-1 h-1 bg-terminal" /> 监控中
            </span>
          </div>
        </div>
      </div>

      <div className="absolute top-4 right-14 flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
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
      className={`w-7 h-7 flex items-center justify-center border transition-colors ${variant === 'danger'
        ? 'border-hazard/30 text-hazard hover:bg-hazard hover:text-white'
        : 'border-ink-line text-fg-dim hover:text-fg hover:border-fg-dim'
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

  // 虚拟演示设备（Rust+ 三类：智能开关 / 警报 / 储物监视）
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
      if (String(data.serverId) === String(serverId)) {
        const changedEntityId = Number.parseInt(data.entityId, 10);
        setDevices((prev) => prev.map((d) => (
          Number.parseInt(d.entityId, 10) === changedEntityId
            ? { ...d, currentValue: data.value }
            : d
        )));
      }
    };
    const handleDevicePaired = (data) => {
      if (String(data.serverId) === String(serverId)) {
        const deviceName = data.device?.name || data.name || data.entityName || `设备 ${data.entityId || ''}`;
        toast.success(`检测到新设备: ${deviceName}`);
        fetchDevices();
      }
    };
    const handleAlarmTriggered = (data) => {
      if (String(data.serverId) !== String(serverId)) {
        return;
      }

      const changedEntityId = Number.parseInt(data.entityId, 10);
      if (!Number.isNaN(changedEntityId)) {
        setDevices((prev) => prev.map((d) => (
          Number.parseInt(d.entityId, 10) === changedEntityId
            ? {
              ...d,
              lastTrigger: data.time || Date.now(),
              message: data.message || d.message || null
            }
            : d
        )));
      }

      const alarmContent = data.message || data.title || data.deviceName || data.name || `警报 ${data.entityId || ''}`;
      toast.warning(`警报触发: ${alarmContent}`);
    };
    socketService.on('entity:changed', handleEntityChanged);
    socketService.on('device:paired', handleDevicePaired);
    socketService.on('alarm:triggered', handleAlarmTriggered);
    return () => {
      socketService.off('entity:changed', handleEntityChanged);
      socketService.off('device:paired', handleDevicePaired);
      socketService.off('alarm:triggered', handleAlarmTriggered);
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
    <div className="flex flex-col h-full space-y-5 animate-fade-in font-sans pb-6">
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
        <div className="tac-panel p-4 flex items-center gap-3">
          <span className="font-mono text-hazard text-xs shrink-0">[DEMO]</span>
          <div className="text-sm text-fg-dim">
            <span className="text-fg font-bold">演示模式运行中</span> — 请在 Rust 游戏中使用 "Rust+ 配对" 来连接真实设备。
          </div>
        </div>
      )}

      {/* Grid Layout */}
      <div className="flex-1 overflow-y-auto pr-1 custom-scrollbar">
        {filteredDevices.length === 0 ? (
          <EmptyState title="未找到设备" description="请尝试调整过滤条件或配对新设备。" icon={<FaSearch className="text-4xl text-fg-mute" />} />
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5 gap-3">
            {filteredDevices.map((device) => {
              const commonProps = {
                device,
                isReadOnly,
                onEdit: () => setEditingDevice(device),
                onDelete: () => handleDeleteDevice(device.entityId),
                onPin: () => togglePin(device.entityId),
                isPinned: pinnedIds.includes(device.entityId),
                onCheck: () => handleCheckReachability(true)
              };

              if (device.type === 'ALARM') {
                return <SmartAlarmCard key={device.id} {...commonProps} />;
              }
              if (device.type === 'STORAGE') {
                return <StorageMonitorCard key={device.id} {...commonProps} />;
              }
              return <SmartSwitchCard key={device.id} {...commonProps} onToggle={handleToggleDevice} />;
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
