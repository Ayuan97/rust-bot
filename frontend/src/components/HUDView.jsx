import React, { useState, useEffect } from 'react';
import { FaShieldAlt, FaPlus, FaClock, FaUsers, FaSkullCrossbones, FaLock, FaLightbulb, FaDoorOpen, FaCrosshairs, FaFan, FaStar } from 'react-icons/fa';
import ChatPanel from './ChatPanel';
import EventTracker from './EventTracker';
import SubscriptionStatus from './SubscriptionStatus';
import { getDevices } from '../services/api';
import socketService from '../services/socket';

function QuickToggle({ label, active, pro, disabled }) {
  return (
    <div className={`flex items-center justify-between p-3 tactic-cut border transition-all ${active ? 'bg-[#cd5241]/10 border-[#cd5241]/30' : 'bg-white/5 border-white/5 opacity-40'} ${disabled ? 'grayscale cursor-not-allowed' : 'hover:bg-white/10'}`}>
      <div className="flex items-center gap-3">
        <div className={`w-1.5 h-1.5 rounded-full ${active ? 'bg-[#a3e635] shadow-[0_0_8px_#a3e635]' : 'bg-gray-800'}`} />
        <span className="text-[11px] font-black text-gray-300 uppercase tracking-widest">{label}</span>
      </div>
      <div className={`w-8 h-4 tactic-cut relative transition-all ${active ? 'bg-[#cd5241]' : 'bg-gray-900 shadow-inner'}`}>
        <div className={`absolute top-0.5 w-3 h-3 bg-white tactic-cut transition-all ${active ? 'right-0.5 shadow-[0_0_5px_white]' : 'left-0.5'}`} />
      </div>
    </div>
  );
}

function PinnedDeviceToggle({ device, serverId, isReadOnly, onToggle }) {
  const getDeviceIcon = (name, type) => {
    const n = name.toLowerCase();
    const t = type ? type.toLowerCase() : '';
    if (n.includes('门') || t.includes('door')) return <FaDoorOpen />;
    if (n.includes('炮') || n.includes('枪') || t.includes('turret')) return <FaCrosshairs />;
    if (n.includes('风扇') || n.includes('抽风')) return <FaFan />;
    return <FaLightbulb />;
  };

  return (
    <div className="flex items-center justify-between p-3 tactic-cut border border-white/5 bg-white/[0.02] hover:bg-white/[0.05] transition-all">
      <div className="flex items-center gap-3 flex-1 min-w-0">
        <div className={`w-8 h-8 tactic-cut flex items-center justify-center text-sm ${device.currentValue
          ? 'bg-[#cd5241] text-white'
          : 'bg-gray-800 text-gray-600'
          }`}>
          {getDeviceIcon(device.name, device.type)}
        </div>
        <div className="flex-1 min-w-0">
          <div className="text-xs font-black uppercase truncate">{device.name}</div>
          <div className="text-[9px] text-gray-500 font-mono">ID: {device.entityId}</div>
        </div>
      </div>

      <div
        onClick={() => !isReadOnly && onToggle(device)}
        className={`relative w-10 h-5 tactic-cut cursor-pointer transition-all ${isReadOnly ? 'opacity-30 cursor-not-allowed' : ''
          } ${device.currentValue ? 'bg-[#cd5241]' : 'bg-gray-800 shadow-inner'}`}
      >
        <div className={`absolute top-0.5 w-4 h-4 bg-white tactic-cut transition-all duration-300 ${device.currentValue ? 'right-0.5 shadow-[0_0_8px_white]' : 'left-0.5'
          }`} />
      </div>
    </div>
  );
}

export default function HUDView({ server, teamData, isSubscriptionExpired, onPair }) {
  // 只有在没有服务器或服务器未连接时才是演示模式
  const isDemo = !server || !server.connected;

  // 演示模式显示假数据,已连接则显示真实数据(即使为空)
  const members = isDemo ? [
    { steamId: 'demo1', name: '基地指挥官 (您)', isOnline: true, isAlive: true },
    { steamId: 'demo2', name: '侦查员_Echo', isOnline: true, isAlive: false },
    { steamId: 'demo3', name: '守卫_Alpha', isOnline: false, isAlive: true }
  ] : (teamData?.members || []);

  const maxDisplay = 12;

  // 置顶设备状态
  const [pinnedDevices, setPinnedDevices] = useState([]);

  useEffect(() => {
    if (!server || !server.connected) {
      setPinnedDevices([]);
      return;
    }

    fetchPinnedDevices();

    // 监听设备状态变化
    const handleEntityChanged = (data) => {
      if (data.serverId === server.id) {
        setPinnedDevices(prev => prev.map(d =>
          d.entityId === data.entityId ? { ...d, currentValue: data.value } : d
        ));
      }
    };

    socketService.on('entity:changed', handleEntityChanged);
    return () => socketService.off('entity:changed', handleEntityChanged);
  }, [server?.id]);

  const fetchPinnedDevices = async () => {
    try {
      const res = await getDevices(server.id);
      const allDevices = res.data.devices || [];

      const pinnedIds = JSON.parse(
        localStorage.getItem(`pinned_devices_${server.id}`) || '[]'
      );

      const pinned = allDevices
        .filter(d => pinnedIds.includes(d.entityId))
        .slice(0, 6);

      setPinnedDevices(pinned);
    } catch (error) {
      console.error('获取置顶设备失败:', error);
    }
  };

  const handleToggleDevice = async (device) => {
    const newValue = !device.currentValue;

    setPinnedDevices(prev => prev.map(d =>
      d.entityId === device.entityId ? { ...d, currentValue: newValue } : d
    ));

    try {
      await socketService.controlDevice(server.id, device.entityId, newValue);
    } catch (error) {
      setPinnedDevices(prev => prev.map(d =>
        d.entityId === device.entityId ? { ...d, currentValue: !newValue } : d
      ));
      console.error('设备控制失败:', error);
    }
  };

  const [contributionAlerts, setContributionAlerts] = useState([]);

  useEffect(() => {
    if (!server || !server.connected) return;

    const handleContribution = (data) => {
      if (data.serverId === server.id) {
        const id = Date.now();
        setContributionAlerts(prev => [...prev, { ...data, id }]);
        setTimeout(() => {
          setContributionAlerts(prev => prev.filter(a => a.id !== id));
        }, 5000);
      }
    };

    socketService.on('player:contribution', handleContribution);
    return () => socketService.off('player:contribution', handleContribution);
  }, [server?.id]);

  return (
    <div className="grid lg:grid-cols-3 gap-6 h-full animate-fade-in font-sans relative">
      {/* 贡献警报通知 */}
      <div className="fixed bottom-8 left-1/2 -translate-x-1/2 z-[100] flex flex-col items-center gap-3 pointer-events-none">
        {contributionAlerts.map(alert => (
          <div key={alert.id} className="bg-black/80 tactic-border tactic-cut p-1 border-[#a3e635]/30 animate-in fade-in slide-in-from-bottom-4 duration-300">
            <div className="bg-[#a3e635]/10 px-6 py-3 flex items-center gap-4">
              <div className="w-8 h-8 tactic-cut bg-[#a3e635] flex items-center justify-center text-black">
                <FaStar className="animate-pulse" />
              </div>
              <div>
                <div className="text-[10px] text-[#a3e635] font-black uppercase tracking-widest">战功卓越 / 今日贡献</div>
                <div className="text-xs font-black uppercase text-white tracking-tight">
                  <span className="text-[#a3e635] italic mr-2">{alert.playerName}</span>
                  已累计采集 {alert.amount.toLocaleString()} {alert.statName}
                </div>
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* 演示模式全屏水印/引导 */}
      {isDemo && (
        <div className="absolute inset-0 z-50 flex items-center justify-center pointer-events-none">
          <div className="bg-black/60 backdrop-blur-md border border-[#cd5241]/30 p-8 tactic-cut text-center max-w-md pointer-events-auto shadow-2xl">
            <div className="w-16 h-16 bg-[#cd5241]/20 rounded-full flex items-center justify-center mx-auto mb-6">
              <FaLock className="text-[#cd5241] text-2xl animate-pulse" />
            </div>
            <h3 className="text-xl font-black uppercase italic text-white mb-2 tracking-tighter">系统未授权 / 演示模式</h3>
            <p className="text-xs text-gray-400 mb-8 leading-relaxed">
              当前展示为系统模拟运行状态。要接管真实的 Rust 基地并激活实时监控链路，请先完成服务器配对。
            </p>
            <button
              onClick={onPair}
              className="w-full py-4 bg-[#cd5241] text-white font-black uppercase italic tactic-cut hover:bg-[#b04537] transition-all shadow-lg shadow-[#cd5241]/20 flex items-center justify-center gap-3"
            >
              <FaPlus /> 建立远程控制链路
            </button>
          </div>
        </div>
      )}

      <div className={`lg:col-span-2 flex flex-col gap-4 h-full min-h-0 ${isDemo ? 'opacity-30' : ''}`}>
        {/* 上半部分：游戏事件追踪 */}
        <div className="flex-[2] tactic-border tactic-cut p-1 bg-black/40 relative overflow-hidden min-h-0">
          <div className="scanline"></div>
          <div className="bg-black/40 h-full p-4 relative z-10">
            <EventTracker serverId={server?.id} isDemo={isDemo} />
          </div>
        </div>

        {/* 下半部分：团队聊天 */}
        <div className="flex-[3] tactic-border tactic-cut p-1 bg-black/40 relative overflow-hidden min-h-0">
          <div className="scanline"></div>
          <div className="bg-black/40 h-full p-4 relative z-10">
            <ChatPanel serverId={server?.id} isReadOnly={isSubscriptionExpired || isDemo} />
          </div>
        </div>
      </div>

      <div className={`flex flex-col gap-4 h-full min-h-0 ${isDemo ? 'opacity-30' : ''}`}>
        <div className="tactic-border tactic-cut p-1 bg-black/40">
          <div className="bg-black/40 p-4">
            <div className="text-xs font-black text-gray-300 uppercase tracking-widest mb-4 flex justify-between items-center">
              <span>团队动态矩阵</span>
              <span className={members.some(m => m.isOnline) ? 'text-[#a3e635] font-bold' : 'text-gray-400'}>
                {members.filter(m => m.isOnline).length}/{members.length}
              </span>
            </div>
            <div className="grid grid-cols-4 gap-2">
              {members.map((member) => (
                <div key={member.steamId} className="aspect-square bg-white/[0.03] border border-white/5 tactic-cut flex items-center justify-center relative group cursor-pointer hover:bg-[#cd5241]/10 transition-all">
                  <div className={`w-2.5 h-2.5 rounded-full shadow-lg ${!member.isAlive ? 'bg-[#ef4444] shadow-[#ef4444]/40' :
                    member.isOnline ? 'bg-[#a3e635] shadow-[#a3e635]/40 animate-pulse' :
                      'bg-gray-800'
                    }`} />
                  <div className="absolute inset-0 bg-[#cd5241] opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center text-[9px] text-white font-black p-2 text-center leading-tight">
                    {member.name}
                  </div>
                </div>
              ))}
              {[...Array(Math.max(0, maxDisplay - members.length))].map((_, i) => (
                <div key={`empty-${i}`} className="aspect-square bg-white/[0.01] border border-dashed border-white/5 tactic-cut flex items-center justify-center">
                  <div className="w-1 h-1 rounded-full bg-gray-900" />
                </div>
              ))}
            </div>
          </div>
        </div>

        <div className="tactic-border tactic-cut p-1 bg-black/40 flex-1">
          <div className="bg-black/40 p-6 h-full flex flex-col">
            <div className="text-xs font-black text-gray-300 uppercase tracking-widest mb-6 italic flex items-center gap-2">
              <FaStar className="text-[#cd5241]" /> 快捷设备控制
            </div>
            <div className="space-y-3 flex-1 overflow-y-auto custom-scrollbar">
              {pinnedDevices.length === 0 ? (
                <div className="p-4 text-center text-gray-400 text-xs space-y-2">
                  <div className="text-[#cd5241] font-bold">⭐ 未设置快捷设备</div>
                  <div className="text-[10px] leading-relaxed">
                    在"智能中控"页面点击星标图标<br />
                    将常用设备置顶到此处
                  </div>
                </div>
              ) : (
                pinnedDevices.map(device => (
                  <PinnedDeviceToggle
                    key={device.entityId}
                    device={device}
                    serverId={server.id}
                    isReadOnly={isSubscriptionExpired}
                    onToggle={handleToggleDevice}
                  />
                ))
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

