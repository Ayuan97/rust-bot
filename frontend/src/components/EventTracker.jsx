import React, { useState, useEffect, useRef } from 'react';
import {
    FaSatellite, FaShip, FaHelicopter, FaSkullCrossbones,
    FaLightbulb, FaBell, FaDoorOpen, FaOilCan, FaExclamationTriangle,
    FaUserCheck, FaUserSlash
} from 'react-icons/fa';
import socketService from '../services/socket';
import { formatTime } from '../utils/time';

// 事件类型配置
const EVENT_CONFIG = {
    'cargo:spawn': { icon: FaShip, label: '货船', color: 'text-blue-400', desc: '货船已出现' },
    'cargo:dock': { icon: FaShip, label: '货船', color: 'text-green-400', desc: '货船已停靠' },
    'cargo:egress': { icon: FaShip, label: '货船', color: 'text-yellow-400', desc: '货船准备离开' },
    'cargo:leave': { icon: FaShip, label: '货船', color: 'text-gray-400', desc: '货船已离开' },
    'heli:spawn': { icon: FaHelicopter, label: '直升机', color: 'text-red-400', desc: '武装直升机出现' },
    'heli:downed': { icon: FaHelicopter, label: '直升机', color: 'text-green-400', desc: '直升机被击落' },
    'heli:leave': { icon: FaHelicopter, label: '直升机', color: 'text-gray-400', desc: '直升机已离开' },
    'player:died': { icon: FaSkullCrossbones, label: '阵亡', color: 'text-red-500', desc: '队友阵亡' },
    'player:online': { icon: FaUserCheck, label: '上线', color: 'text-green-400', desc: '队友上线' },
    'player:offline': { icon: FaUserSlash, label: '离线', color: 'text-gray-400', desc: '队友离线' },
    'alarm:triggered': { icon: FaBell, label: '警报', color: 'text-red-500', desc: '智能警报触发' },
    'entity:changed': { icon: FaLightbulb, label: '设备', color: 'text-amber-400', desc: '设备状态变化' },
};

const MAX_EVENTS = 50;

export default function EventTracker({ serverId, isDemo = false }) {
    const [events, setEvents] = useState([]);
    const containerRef = useRef(null);
    const isAtBottomRef = useRef(true);

    // 添加事件
    const addEvent = (type, data) => {
        const config = EVENT_CONFIG[type] || { icon: FaExclamationTriangle, label: '事件', color: 'text-white', desc: type };

        let description = config.desc;
        let extra = '';

        // 根据事件类型生成详细描述
        switch (type) {
            case 'cargo:dock':
                extra = data.location ? ` 坐标: ${data.location}` : '';
                break;
            case 'heli:spawn':
                extra = data.location ? ` 方向: ${data.location}` : '';
                break;
            case 'player:died':
                description = `队友阵亡: ${data.name || '未知'}`;
                break;
            case 'player:online':
                description = `队友上线: ${data.name || '未知'}`;
                break;
            case 'player:offline':
                description = `队友离线: ${data.name || '未知'}`;
                break;
            case 'alarm:triggered':
                description = `警报触发: ${data.title || data.name || '智能警报'}`;
                break;
            case 'entity:changed':
                description = `${data.name || '设备'}: ${data.value ? '开启' : '关闭'}`;
                break;
            default:
                break;
        }

        // 提取坐标和方向信息
        const positionInfo = data.position || '';
        const directionInfo = data.direction || '';

        const newEvent = {
            id: Date.now() + Math.random(),
            type,
            time: Date.now(),
            description: description + extra,
            position: positionInfo,
            direction: directionInfo,
            config,
            data
        };

        setEvents(prev => [...prev, newEvent].slice(-MAX_EVENTS));
    };

    // 监听所有游戏事件
    useEffect(() => {
        if (!serverId || isDemo) return;

        // 加载历史记录
        const fetchHistory = async () => {
            try {
                const response = await import('../services/api').then(m => m.getEvents(serverId, 50));
                if (response.data && response.data.success) {
                    const historyEvents = response.data.events.map(event => {
                        // 将后端枚举映射回前端类型
                        const typeMap = {
                            'PLAYER_DEATH': 'player:died',
                            'PLAYER_ONLINE': 'player:online',
                            'PLAYER_OFFLINE': 'player:offline',
                            'CARGO_SPAWN': 'cargo:spawn',
                            'CARGO_DOCK': 'cargo:dock',
                            'HELI_SPAWN': 'heli:spawn',
                            'HELI_DOWN': 'heli:downed',
                            'ALARM_TRIGGERED': 'alarm:triggered',
                            'ENTITY_CHANGED': 'entity:changed'
                        };

                        const type = typeMap[event.eventType] || event.eventType.toLowerCase().replace('_', ':');
                        const data = typeof event.eventData === 'string' ? JSON.parse(event.eventData) : event.eventData;
                        const config = EVENT_CONFIG[type] || { icon: FaExclamationTriangle, label: '事件', color: 'text-white', desc: type };

                        let description = config.desc;
                        switch (type) {
                            case 'player:died': description = `队友阵亡: ${data.name || '未知'}`; break;
                            case 'player:online': description = `队友上线: ${data.name || '未知'}`; break;
                            case 'player:offline': description = `队友离线: ${data.name || '未知'}`; break;
                            case 'alarm:triggered': description = `警报触发: ${data.title || data.deviceName || data.name || '智能警报'}`; break;
                            case 'entity:changed': description = `${data.name || '设备'}: ${data.value ? '开启' : '关闭'}`; break;
                            default: break;
                        }

                        return {
                            id: event.id,
                            type,
                            time: new Date(event.createdAt).getTime(),
                            description: description,
                            position: data.position || '',
                            direction: data.direction || '',
                            config,
                            data
                        };
                    });
                    setEvents(historyEvents.reverse()); // 历史记录是倒序的，反转以匹配后续追加逻辑
                }
            } catch (error) {
                console.error('加载事件历史失败:', error);
            }
        };

        fetchHistory();

        const eventTypes = [
            'cargo:spawn', 'cargo:dock', 'cargo:egress', 'cargo:leave',
            'heli:spawn', 'heli:downed', 'heli:leave',
            'player:died', 'player:online', 'player:offline',
            'alarm:triggered', 'entity:changed'
        ];

        const handlers = {};

        eventTypes.forEach(eventType => {
            handlers[eventType] = (data) => {
                if (data.serverId === serverId) {
                    addEvent(eventType, data);
                }
            };
            socketService.on(eventType, handlers[eventType]);
        });

        return () => {
            eventTypes.forEach(eventType => {
                socketService.off(eventType, handlers[eventType]);
            });
        };
    }, [serverId, isDemo]);

    // 自动滚动到底部
    useEffect(() => {
        if (isAtBottomRef.current && containerRef.current) {
            containerRef.current.scrollTop = containerRef.current.scrollHeight;
        }
    }, [events]);

    const handleScroll = () => {
        if (!containerRef.current) return;
        const { scrollTop, scrollHeight, clientHeight } = containerRef.current;
        isAtBottomRef.current = scrollHeight - scrollTop - clientHeight < 50;
    };

    // 演示模式显示模拟数据
    const demoEvents = [
        { id: 1, type: 'cargo:spawn', description: '货船已出现', config: EVENT_CONFIG['cargo:spawn'], time: Date.now() - 300000 },
        { id: 2, type: 'heli:spawn', description: '武装直升机出现 方向: 西北', config: EVENT_CONFIG['heli:spawn'], time: Date.now() - 180000 },
        { id: 3, type: 'player:died', description: '队友阵亡: 侦查员_Echo', config: EVENT_CONFIG['player:died'], time: Date.now() - 120000 },
        { id: 4, type: 'entity:changed', description: '前门: 开启', config: EVENT_CONFIG['entity:changed'], time: Date.now() - 60000 },
        { id: 5, type: 'alarm:triggered', description: '警报触发: 基地入侵警报', config: EVENT_CONFIG['alarm:triggered'], time: Date.now() - 30000 },
    ];

    const displayEvents = isDemo ? demoEvents : events;

    return (
        <div className="h-full flex flex-col">
            {/* 标题栏 */}
            <div className="flex items-center justify-between mb-3 border-b border-white/5 pb-2">
                <div className="flex items-center gap-2">
                    <FaSatellite className={!isDemo ? "text-[#cd5241]" : "text-gray-600"} />
                    <span className="text-xs font-black uppercase tracking-widest text-gray-300">
                        实时事件追踪
                    </span>
                    {isDemo && <span className="text-[9px] text-[#cd5241]/50 italic">[ 演示 ]</span>}
                </div>
                <div className="text-[10px] text-gray-500 font-mono">
                    {displayEvents.length} 条记录
                </div>
            </div>

            {/* 事件列表 */}
            <div
                ref={containerRef}
                onScroll={handleScroll}
                className="flex-1 overflow-y-auto custom-scrollbar space-y-1 pr-1"
            >
                {displayEvents.length === 0 ? (
                    <div className="h-full flex flex-col items-center justify-center text-gray-600">
                        <FaSatellite className="text-2xl mb-2 opacity-30" />
                        <div className="text-[10px] uppercase tracking-widest">等待事件...</div>
                    </div>
                ) : (
                    displayEvents.map((event) => {
                        const IconComponent = event.config.icon;
                        return (
                            <div
                                key={event.id}
                                className="flex items-center gap-2 p-1.5 bg-white/[0.02] border border-white/5 tactic-cut hover:bg-white/[0.05] transition-all group min-h-[36px]"
                            >
                                <div className={`w-6 h-6 flex-shrink-0 flex items-center justify-center tactic-cut ${event.config.color} bg-black/40`}>
                                    <IconComponent className="text-xs" />
                                </div>
                                <div className="flex-1 min-w-0 flex items-center justify-between gap-2 overflow-hidden">
                                    <div className="flex items-center gap-2 flex-1 min-w-0">
                                        <span className={`text-[13px] font-black uppercase tracking-tight ${event.config.color} truncate`}>
                                            {event.description}
                                        </span>
                                        {(event.position || event.direction) && (
                                            <span className="flex items-center gap-1.5 whitespace-nowrap overflow-hidden">
                                                {event.position && <span className="text-[10px] font-mono text-[#cd5241] bg-[#cd5241]/10 px-1 tactic-cut border border-[#cd5241]/20">{event.position}</span>}
                                                {event.direction && <span className="text-[10px] font-mono text-gray-400 bg-white/5 px-1 tactic-cut">{event.direction}</span>}
                                            </span>
                                        )}
                                    </div>
                                    <span className="text-[11px] font-black text-white/50 bg-white/5 px-1.5 tactic-cut shrink-0 font-mono">
                                        {formatTime(event.time)}
                                    </span>
                                </div>
                            </div>
                        );
                    })
                )}
            </div>
        </div>
    );
}
