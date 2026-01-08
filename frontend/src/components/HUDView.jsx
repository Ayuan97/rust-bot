import React from 'react';
import { FaSatellite, FaShieldAlt, FaPlus, FaClock, FaUsers, FaSkullCrossbones, FaLock } from 'react-icons/fa';
import ChatPanel from './ChatPanel';
import SubscriptionStatus from './SubscriptionStatus';

function QuickToggle({ label, active, pro, disabled }) {
  return (
    <div className={`flex items-center justify-between p-3 tactic-cut border transition-all ${active ? 'bg-[#cd5241]/10 border-[#cd5241]/30' : 'bg-white/5 border-white/5 opacity-40'} ${disabled ? 'grayscale cursor-not-allowed' : 'hover:bg-white/10'}`}>
       <div className="flex items-center gap-3">
          <div className={`w-1.5 h-1.5 rounded-full ${active ? 'bg-[#a3e635] shadow-[0_0_8px_#a3e635]' : 'bg-gray-800'}`} />
          <span className="text-[11px] font-black text-gray-400 uppercase tracking-widest">{label}</span>
       </div>
       <div className={`w-8 h-4 tactic-cut relative transition-all ${active ? 'bg-[#cd5241]' : 'bg-gray-900 shadow-inner'}`}>
          <div className={`absolute top-0.5 w-3 h-3 bg-white tactic-cut transition-all ${active ? 'right-0.5 shadow-[0_0_5px_white]' : 'left-0.5'}`} />
       </div>
    </div>
  );
}

export default function HUDView({ server, teamData, isSubscriptionExpired, onPair }) {
  const isDemo = !server;
  const members = teamData?.members || (isDemo ? [
    { steamId: 'demo1', name: '基地指挥官 (您)', isOnline: true, isAlive: true },
    { steamId: 'demo2', name: '侦查员_Echo', isOnline: true, isAlive: false },
    { steamId: 'demo3', name: '守卫_Alpha', isOnline: false, isAlive: true }
  ] : []);
  
  const maxDisplay = 12;

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
                <div className="text-gray-700 font-mono text-[10px]">链路状态: {server?.connected ? '已连接' : '断开'}</div>
              </div>
              <div className="flex-1 flex flex-col min-h-0">
                 <div className="flex-1 font-mono text-[10px] text-gray-600 space-y-1 overflow-y-auto mb-4 opacity-50 custom-scrollbar">
                    <div>{">"} [系统] 正在尝试建立数据链路...</div>
                    {!isDemo ? (
                      <>
                        <div>{">"} [信号] 节点 HK-04 活跃: 延迟 42ms</div>
                        <div className="text-[#cd5241]">{">"} [警告] 智能报警器监控已启动</div>
                        <div>{">"} [数据] 正在同步团队位置... 已发现 {members.length} 名成员</div>
                        {members.filter(m => !m.isAlive).map(m => (
                          <div key={m.steamId} className="text-[#ef4444] font-bold">{">"} [警报] 队友阵亡: {m.name}</div>
                        ))}
                      </>
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
               <div className="grid grid-cols-4 gap-2">
                  {members.map((member) => (
                    <div key={member.steamId} className="aspect-square bg-white/[0.03] border border-white/5 tactic-cut flex items-center justify-center relative group cursor-pointer hover:bg-[#cd5241]/10 transition-all">
                       <div className={`w-2.5 h-2.5 rounded-full shadow-lg ${
                         !member.isAlive ? 'bg-[#ef4444] shadow-[#ef4444]/40' : 
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
               <div className="text-xs font-black text-gray-500 uppercase tracking-widest mb-6 italic">基地状态总览</div>
               <div className="space-y-4">
                  <div className={`p-4 tactic-cut text-center transition-all group ${isDemo ? 'bg-gray-800/20 border border-white/5 cursor-not-allowed' : 'bg-[#ef4444]/10 border border-[#ef4444]/30 cursor-pointer hover:bg-[#ef4444]/20'}`}>
                     <div className={`text-xs font-black uppercase tracking-[0.2em] italic ${isDemo ? 'text-gray-700' : 'text-[#ef4444] group-hover:scale-105 transition-transform'}`}>
                        一键全屋封锁 (紧急)
                     </div>
                  </div>
                  <div className="h-px bg-white/5 my-2" />
                  <QuickToggle label="防御炮塔总控" disabled={isDemo} />
                  <QuickToggle label="核心电力主路" active={!isDemo} disabled={isDemo} />
                  
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

