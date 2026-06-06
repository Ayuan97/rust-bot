import React, { useState, useEffect } from 'react';
import { FaPlus, FaUsers, FaSkullCrossbones, FaLock, FaLightbulb, FaDoorOpen, FaCrosshairs, FaFan, FaStar } from 'react-icons/fa';
import ChatPanel from './ChatPanel';
import EventTracker from './EventTracker';
import { getDevices, getTeamDetailed } from '../services/api';
import socketService from '../services/socket';

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
    <div className="flex items-center justify-between p-3 border border-ink-line bg-ink-850 hover:bg-ink-800 transition-colors">
      <div className="flex items-center gap-3 flex-1 min-w-0">
        <div className={`w-8 h-8 flex items-center justify-center text-sm border ${device.currentValue
          ? 'bg-hazard border-hazard text-white'
          : 'border-ink-line text-fg-mute'
          }`}>
          {getDeviceIcon(device.name, device.type)}
        </div>
        <div className="flex-1 min-w-0">
          <div className="text-xs font-bold text-fg truncate">{device.name}</div>
          <div className="font-mono text-[9px] text-fg-mute">#{device.entityId}</div>
        </div>
      </div>

      <div
        onClick={() => !isReadOnly && onToggle(device)}
        className={`relative w-10 h-5 cursor-pointer transition-colors border ${isReadOnly ? 'opacity-30 cursor-not-allowed' : ''} ${device.currentValue ? 'bg-hazard-dim border-hazard/50' : 'bg-ink-700 border-ink-line'}`}
      >
        <div className={`absolute top-[2px] w-3.5 h-3.5 transition-all ${device.currentValue ? 'right-[2px] bg-hazard' : 'left-[2px] bg-fg-mute'}`} />
      </div>
    </div>
  );
}

export default function HUDView({ server, teamData, isSubscriptionExpired, onPair }) {
  // 只有在没有服务器或服务器未连接时才是演示模式
  const isDemo = !server || !server.connected;

  // 详细队员数据（包含头像）
  const [detailedMembers, setDetailedMembers] = useState([]);

  useEffect(() => {
    if (isDemo) {
      setDetailedMembers([
        { steamId: 'demo1', name: '基地指挥官 (您)', isOnline: true, isAlive: true, avatar: null },
        { steamId: 'demo2', name: '侦查员_Echo', isOnline: true, isAlive: false, avatar: null },
        { steamId: 'demo3', name: '守卫_Alpha', isOnline: false, isAlive: true, avatar: null }
      ]);
      return;
    }

    const fetchDetailed = async () => {
      try {
        const res = await getTeamDetailed(server.id);
        if (res.data.success) {
          setDetailedMembers(res.data.members || []);
        }
      } catch (e) {
        console.error('获取详细队伍数据失败:', e);
        setDetailedMembers(teamData?.members || []);
      }
    };

    fetchDetailed();
    const interval = setInterval(fetchDetailed, 30000);
    return () => clearInterval(interval);
  }, [server?.id, isDemo]);

  const members = detailedMembers;
  const maxDisplay = 12;

  // 置顶设备状态
  const [pinnedDevices, setPinnedDevices] = useState([]);

  useEffect(() => {
    if (!server || !server.connected) {
      setPinnedDevices([]);
      return;
    }

    fetchPinnedDevices();

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
    <div className="grid lg:grid-cols-3 gap-4 h-full animate-fade-in font-sans relative">
      {/* 贡献警报通知 */}
      <div className="fixed bottom-8 left-1/2 -translate-x-1/2 z-[100] flex flex-col items-center gap-3 pointer-events-none">
        {contributionAlerts.map(alert => (
          <div key={alert.id} className="bg-ink-850 border border-terminal/40 px-5 py-3 flex items-center gap-4 animate-fade-in shadow-2xl">
            <div className="w-8 h-8 bg-terminal flex items-center justify-center text-ink-900">
              <FaStar />
            </div>
            <div>
              <div className="font-mono text-[10px] uppercase tracking-widest text-terminal">战功 / 今日贡献</div>
              <div className="text-xs font-bold text-fg">
                <span className="text-terminal mr-2">{alert.playerName}</span>
                已累计采集 {alert.amount.toLocaleString()} {alert.statName}
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* 演示模式引导 */}
      {isDemo && (
        <div className="absolute inset-0 z-50 flex items-center justify-center pointer-events-none">
          <div className="bg-ink-900/85 backdrop-blur-sm border border-hazard/30 tac-corners p-8 text-center max-w-md pointer-events-auto">
            <div className="w-14 h-14 border border-hazard/40 bg-hazard-dim flex items-center justify-center mx-auto mb-5">
              <FaLock className="text-hazard text-xl" />
            </div>
            <div className="tac-label mb-2">UNAUTHORIZED · DEMO</div>
            <h3 className="text-lg font-extrabold text-fg mb-2">系统未授权 / 演示模式</h3>
            <p className="text-sm text-fg-dim mb-6 leading-relaxed">
              当前为系统模拟运行。要接管真实的 Rust 基地并激活实时监控链路，请先完成服务器配对。
            </p>
            <button onClick={onPair} className="tac-btn tac-btn-primary w-full !py-3.5">
              <FaPlus /> 建立远程控制链路
            </button>
          </div>
        </div>
      )}

      {/* 左 2 列：事件 + 聊天 */}
      <div className={`lg:col-span-2 flex flex-col gap-4 h-full min-h-0 ${isDemo ? 'opacity-30' : ''}`}>
        <div className="flex-[2] tac-panel p-4 min-h-0">
          <EventTracker serverId={server?.id} isDemo={isDemo} />
        </div>
        <div className="flex-[3] tac-panel p-4 min-h-0">
          <ChatPanel serverId={server?.id} isReadOnly={isSubscriptionExpired || isDemo} />
        </div>
      </div>

      {/* 右 1 列：团队矩阵 + 快捷设备 */}
      <div className={`flex flex-col gap-4 h-full min-h-0 overflow-y-auto custom-scrollbar ${isDemo ? 'opacity-30' : ''}`}>
        <div className="tac-panel p-4">
          <div className="flex justify-between items-center mb-4">
            <span className="tac-label">团队动态矩阵</span>
            <span className={`font-mono text-xs ${members.some(m => m.isOnline) ? 'text-terminal' : 'text-fg-mute'}`}>
              {members.filter(m => m.isOnline).length}/{members.length}
            </span>
          </div>
          <div className="grid grid-cols-4 gap-2">
            {members.map((member) => (
              <div key={member.steamId} className="aspect-square bg-ink-900 border border-ink-line flex items-center justify-center relative group cursor-pointer hover:border-hazard/40 transition-colors overflow-hidden">
                {member.avatar ? (
                  <img
                    src={member.avatar}
                    alt={member.name}
                    className={`w-full h-full object-cover ${!member.isOnline && member.isAlive ? 'grayscale opacity-50' : ''}`}
                  />
                ) : (
                  <FaUsers className="text-fg-mute text-lg" />
                )}
                <div className={`absolute bottom-1 right-1 w-2 h-2 ${!member.isAlive ? 'bg-hazard' : member.isOnline ? 'bg-terminal' : 'bg-ink-line2'}`} />
                {!member.isAlive && (
                  <div className="absolute inset-0 bg-hazard/20 flex items-center justify-center">
                    <FaSkullCrossbones className="text-hazard text-lg" />
                  </div>
                )}
                <div className="absolute inset-0 bg-hazard opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center text-[9px] text-white font-bold p-2 text-center leading-tight">
                  {member.name}
                </div>
              </div>
            ))}
            {[...Array(Math.max(0, maxDisplay - members.length))].map((_, i) => (
              <div key={`empty-${i}`} className="aspect-square bg-ink-900/50 border border-dashed border-ink-line flex items-center justify-center">
                <div className="w-1 h-1 bg-ink-line2" />
              </div>
            ))}
          </div>
        </div>

        <div className="tac-panel p-4 flex-1 min-h-[200px] flex flex-col">
          <div className="tac-label mb-4 flex items-center gap-2">
            <FaStar className="text-hazard" /> 快捷设备控制
          </div>
          <div className="space-y-2 flex-1 overflow-y-auto custom-scrollbar">
            {pinnedDevices.length === 0 ? (
              <div className="p-4 text-center space-y-2">
                <div className="text-hazard text-sm font-bold">未设置快捷设备</div>
                <div className="text-[11px] text-fg-mute leading-relaxed">
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
  );
}
