import React, { useState, useEffect } from 'react';
import { FaSatellite, FaShieldAlt, FaPlus, FaClock, FaUsers, FaSkullCrossbones, FaLock, FaToggleOn, FaToggleOff } from 'react-icons/fa';
import ChatPanel from './ChatPanel';
import SubscriptionStatus from './SubscriptionStatus';
import { api } from '../services/api';
import socketService from '../services/socket';

function QuickToggle({ label, active, pro, disabled, onToggle }) {
  return (
    <div
      onClick={!disabled ? onToggle : undefined}
      className={`flex items-center justify-between p-3 tactic-cut border transition-all ${active ? 'bg-[#cd5241]/10 border-[#cd5241]/30' : 'bg-white/5 border-white/5 opacity-60'} ${disabled ? 'grayscale cursor-not-allowed' : 'hover:bg-white/10 cursor-pointer'}`}
    >
      <div className="flex items-center gap-3">
        <div className={`w-1.5 h-1.5 rounded-full ${active ? 'bg-[#a3e635] shadow-[0_0_8px_#a3e635]' : 'bg-gray-800'}`} />
        <span className="text-[11px] font-black text-gray-400 uppercase tracking-widest truncate max-w-[100px]">{label}</span>
      </div>
      <div className={`w-8 h-4 tactic-cut relative transition-all ${active ? 'bg-[#cd5241]' : 'bg-gray-900 shadow-inner'}`}>
        <div className={`absolute top-0.5 w-3 h-3 bg-white tactic-cut transition-all ${active ? 'right-0.5 shadow-[0_0_5px_white]' : 'left-0.5'}`} />
      </div>
    </div>
  );
}

export default function HUDView({ server, teamData, fcmStatus, isSubscriptionExpired, onPair, onLockdown }) {
  const isDemo = !server;
  const [pinnedDevices, setPinnedDevices] = useState([]);

  const members = teamData?.members || (isDemo ? [
    { steamId: 'demo1', name: '基地指挥官 (您)', isOnline: true, isAlive: true },
    { steamId: 'demo2', name: '侦查员_Echo', isOnline: true, isAlive: false },
    { steamId: 'demo3', name: '守卫_Alpha', isOnline: false, isAlive: true }
  ] : []);

  const maxDisplay = 12;

  const [events, setEvents] = useState([]);

  useEffect(() => {
    if (!isDemo && server?.id) {
      fetchPinnedDevices();
      fetchEvents();
    }
  }, [server?.id]);

  const fetchEvents = async () => {
    try {
      const res = await api.get(`/servers/${server.id}/events?limit=50`);
      if (res.data.success) {
        setEvents(res.data.events.map(e => ({
          ...e,
          data: typeof e.eventData === 'string' ? JSON.parse(e.eventData) : e.eventData
        })));
      }
    } catch (e) {
      console.error('获取事件失败');
    }
  };

  const fetchPinnedDevices = async () => {
    try {
      const res = await api.get(`/servers/${server.id}/devices`);
      if (res.data.success) {
        // 暂时选取前4个开关作为“置顶”显示
        const switches = res.data.devices.filter(d => d.type === 'SWITCH').slice(0, 4);
        setPinnedDevices(switches);
      }
    } catch (e) {
      console.error('获取置顶设备失败');
    }
  };

  useEffect(() => {
    if (isDemo || !server?.id) return;

    const handleGameEvent = (type, data) => {
      if (data.serverId === server.id) {
        setEvents(prev => [{
          id: Date.now(),
          eventType: type,
          data: data,
          createdAt: new Date().toISOString()
        }, ...prev].slice(0, 50));
      }
    };

    const listeners = [
      'cargo:spawn', 'cargo:egress', 'cargo:dock', 'cargo:leave',
      'heli:spawn', 'heli:downed', 'heli:leave',
      'player:died', 'player:online', 'player:offline',
      'automation:executed'
    ];

    listeners.forEach(event => {
      socketService.on(event, (data) => handleGameEvent(event, data));
    });

    return () => {
      listeners.forEach(event => {
        socketService.off(event);
      });
    };
  }, [server?.id, isDemo]);

  const getEventMarkup = (event) => {
    const time = new Date(event.createdAt).toLocaleTimeString([], { hour12: false, hour: '2-digit', minute: '2-digit', second: '2-digit' });
    const type = event.eventType;
    const data = event.data || {};

    switch (type) {
      case 'cargo:spawn': return <div key={event.id}>{">"} [{time}] <span className="text-[#a3e635] font-black">[货船]</span> 刷新 @ {data.position} ({data.direction})</div>;
      case 'cargo:egress': return <div key={event.id}>{">"} [{time}] <span className="text-[#cd5241] font-black">[货船]</span> 正在撤离 @ {data.position}</div>;
      case 'cargo:dock': return <div key={event.id}>{">"} [{time}] <span className="text-[#3b82f6] font-black">[货船]</span> 停靠港口: {data.harborName}</div>;
      case 'heli:spawn': return <div key={event.id}>{">"} [{time}] <span className="text-[#a3e635] font-black">[武装直升机]</span> 刷新 @ {data.position}</div>;
      case 'heli:downed': return <div key={event.id}>{">"} [{time}] <span className="text-[#cd5241] font-black">[武装直升机]</span> 已被击落 @ {data.position}</div>;
      case 'player:died': return <div key={event.id} className="text-[#ef4444] font-bold">{">"} [{time}] <span className="text-[#ef4444] font-black">[阵亡]</span> {data.name} @ {data.position}</div>;
      case 'player:online': return <div key={event.id}>{">"} [{time}] <span className="text-[#a3e635] font-black">[上线]</span> {data.name}</div>;
      case 'player:offline': return <div key={event.id}>{">"} [{time}] <span className="text-gray-500 font-black">[下线]</span> {data.name}</div>;
      case 'automation:executed': return <div key={event.id} className="italic text-gray-500">{">"} [{time}] [自动] {data.message}</div>;
      default: return <div key={event.id}>{">"} [{time}] [{type}] {typeof data === 'string' ? data : JSON.stringify(data)}</div>;
    }
  };

  const handleToggle = async (device) => {
    if (isSubscriptionExpired) return;
    try {
      const action = device.currentValue ? 'off' : 'on';
      const res = await api.post(`/servers/${server.id}/devices/${device.entityId}/control`, { action });
      if (res.data.success) {
        fetchPinnedDevices();
      }
    } catch (e) {
      console.error('控制失败');
    }
  };

  return (
    <div className="grid lg:grid-cols-3 gap-6 h-full animate-fade-in font-sans relative">
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

      <div className={`lg:col-span-2 flex flex-col gap-4 ${isDemo ? 'opacity-30' : ''}`}>
        <div className="flex-1 tactic-border tactic-cut p-1 bg-black/40 relative overflow-hidden">
          <div className="scanline"></div>
          <div className="bg-black/40 h-full p-4 flex flex-col relative z-10">
            <div className="text-xs font-black text-gray-500 uppercase tracking-widest mb-4 flex items-center justify-between border-b border-white/5 pb-2">
              <div className="flex items-center gap-2">
                <FaSatellite className={!isDemo ? "text-[#cd5241]" : "text-gray-700"} />
                实时事件追踪 {isDemo && <span className="text-[9px] text-[#cd5241]/50 ml-2 italic">[ 离线模拟 ]</span>}
              </div>

              <div className="flex items-center gap-4">
                <div className="flex items-center gap-1.5 opacity-80">
                  <div className={`w-1 h-1 rounded-full ${fcmStatus?.isListening ? 'bg-[#a3e635] shadow-[0_0_3px_#a3e635]' : 'bg-gray-800'}`} />
                  <span className="text-[8px] font-bold text-gray-600 uppercase tracking-tighter">PUSH (FCM)</span>
                </div>
                <div className="flex items-center gap-1.5 opacity-80">
                  <div className={`w-1 h-1 rounded-full ${server?.connected ? 'bg-[#3b82f6] shadow-[0_0_3px_#3b82f6]' : 'bg-gray-800'}`} />
                  <span className="text-[8px] font-bold text-gray-600 uppercase tracking-tighter">CLOUD (WS)</span>
                </div>
              </div>
            </div>
            <div className="flex-1 flex flex-col min-h-0">
              <div className="flex-1 font-mono text-[10px] text-gray-400 space-y-1 overflow-y-auto mb-4 custom-scrollbar">
                {!isDemo ? (
                  events.length > 0 ? (
                    events.map(event => getEventMarkup(event))
                  ) : (
                    <div className="animate-pulse">{">"} [系统] 正在等待数据流...</div>
                  )
                ) : (
                  <>
                    <div className="text-gray-800 italic">{">"} [离线] 未连接到活跃服务器。</div>
                    <div className="animate-pulse">{">"} [模拟] 正在广播虚拟信号...</div>
                    <div>{">"} [模拟] 监测到周边 3 个活跃辐射区</div>
                    <div className="text-[#a3e635]">{">"} [模拟] 领地柜维护状态: 正常 (72h)</div>
                  </>
                )}
              </div>
              <div className="flex-[4] min-h-0">
                <ChatPanel serverId={server?.id} isReadOnly={isSubscriptionExpired || isDemo} />
              </div>
            </div>
          </div>
        </div>
      </div>

      <div className={`flex flex-col gap-4 ${isDemo ? 'opacity-30' : ''}`}>
        <div className="tactic-border tactic-cut p-1 bg-black/40">
          <div className="bg-black/40 p-4">
            <div className="text-xs font-black text-gray-500 uppercase tracking-widest mb-4 flex justify-between items-center">
              <span>团队动态矩阵</span>
              <span className={members.some(m => m.isOnline) ? 'text-[#a3e635]' : 'text-gray-500'}>
                {members.filter(m => m.isOnline).length}/{members.length}
              </span>
            </div>
            <div className={`grid grid-cols-4 gap-2 ${!isDemo && !teamData ? 'animate-pulse' : ''}`}>
              {!isDemo && !teamData ? (
                <div className="col-span-4 h-32 flex items-center justify-center text-[10px] text-gray-500 uppercase font-black italic tracking-widest">
                  数据链路同步中...
                </div>
              ) : (
                <>
                  {members.map((member) => (
                    <div key={member.steamId} className="aspect-square bg-white/[0.03] border border-white/5 tactic-cut flex flex-col items-center justify-center relative group cursor-pointer hover:bg-[#cd5241]/10 transition-all">
                      <div className={`w-2 h-2 rounded-full shadow-lg mb-1 ${!member.isAlive ? 'bg-[#ef4444] shadow-[#ef4444]/40' :
                        member.isOnline ? 'bg-[#a3e635] shadow-[#a3e635]/40 animate-pulse' :
                          'bg-gray-800'
                        }`} />
                      <div className="text-[7px] text-gray-600 font-bold uppercase truncate w-full text-center px-1 group-hover:text-white">
                        {member.name.split(' ')[0]}
                      </div>
                      <div className="absolute inset-0 bg-[#cd5241] opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center text-[9px] text-white font-black p-2 text-center leading-tight pointer-events-none">
                        {member.name}<br />
                        <span className="text-[7px] opacity-70 font-bold">{member.isOnline ? 'ONLINE' : 'OFFLINE'}</span>
                      </div>
                    </div>
                  ))}
                  {[...Array(Math.max(0, maxDisplay - members.length))].map((_, i) => (
                    <div key={`empty-${i}`} className="aspect-square bg-white/[0.01] border border-dashed border-white/5 tactic-cut flex items-center justify-center">
                      <div className="w-1 h-1 rounded-full bg-gray-900" />
                    </div>
                  ))}
                </>
              )}
            </div>
          </div>
        </div>

        <div className="tactic-border tactic-cut p-1 bg-black/40 flex-1">
          <div className="bg-black/40 p-6 h-full flex flex-col">
            <div className="text-xs font-black text-gray-500 uppercase tracking-widest mb-6 italic">基地状态总览</div>
            <div className="space-y-4">
              <div
                onClick={!isDemo ? onLockdown : undefined}
                className={`p-4 tactic-cut text-center transition-all group ${isDemo ? 'bg-gray-800/20 border border-white/5 cursor-not-allowed' : 'bg-[#ef4444]/10 border border-[#ef4444]/30 cursor-pointer hover:bg-[#ef4444]/20'}`}
              >
                <div className={`text-xs font-black uppercase tracking-[0.2em] italic ${isDemo ? 'text-gray-700' : 'text-[#ef4444] group-hover:scale-105 transition-transform'}`}>
                  一键全屋封锁 (紧急)
                </div>
              </div>
              <div className="h-px bg-white/5 my-2" />

              {/* 置顶设备 */}
              <div className="space-y-2">
                {pinnedDevices.length > 0 ? pinnedDevices.map(device => (
                  <QuickToggle
                    key={device.id}
                    label={device.name}
                    active={device.currentValue}
                    onToggle={() => handleToggle(device)}
                  />
                )) : (
                  <div className="py-4 px-2 border border-dashed border-white/5 bg-white/5 tactic-cut text-center">
                    <div className="text-[10px] text-gray-500 font-black uppercase tracking-widest leading-tight">
                      {!isDemo ? '暂无置顶设备' : '系统模拟状态'}
                    </div>
                    {!isDemo && (
                      <p className="text-[8px] text-gray-700 mt-2 uppercase font-bold leading-tight">
                        在“智能中控”中星标置顶核心设备
                      </p>
                    )}
                  </div>
                )}
              </div>

              <div className={`mt-4 p-4 tactic-cut border transition-all ${isDemo ? 'bg-black/20 border-white/5' : 'bg-[#a3e635]/5 border-[#a3e635]/10'}`}>
                <div className="text-[10px] text-gray-600 font-bold uppercase mb-2 tracking-widest">基地安全监测</div>
                <div className={`flex items-center gap-3 text-xs font-black ${isDemo ? 'text-gray-700' : 'text-[#a3e635]'}`}>
                  <FaShieldAlt className={!isDemo ? "animate-pulse" : ""} /> {isDemo ? "离线监控中..." : "系统在线, 监控正常"}
                </div>
              </div>
            </div>
            <div className="mt-auto pt-8"><SubscriptionStatus /></div>
          </div>
        </div>
      </div>
    </div>
  );
}

