import React, { useState, useEffect, useRef } from 'react';
import {
    FaSatellite, FaShip, FaHelicopter, FaSkullCrossbones,
    FaLightbulb, FaBell, FaExclamationTriangle,
    FaUserCheck, FaUserSlash
} from 'react-icons/fa';
import socketService from '../services/socket';
import { formatTime } from '../utils/time';

// 事件类型配置（颜色语义化：危险=hazard / 利好=terminal / 中性=灰）
const EVENT_CONFIG = {
    'cargo:spawn': { icon: FaShip, label: '货船', color: 'text-fg-dim', desc: '货船已出现' },
    'cargo:dock': { icon: FaShip, label: '货船', color: 'text-fg-dim', desc: '货船已停靠' },
    'cargo:egress': { icon: FaShip, label: '货船', color: 'text-fg-dim', desc: '货船准备离开' },
    'cargo:leave': { icon: FaShip, label: '货船', color: 'text-fg-mute', desc: '货船已离开' },
    'heli:spawn': { icon: FaHelicopter, label: '直升机', color: 'text-hazard', desc: '武装直升机出现' },
    'heli:downed': { icon: FaHelicopter, label: '直升机', color: 'text-terminal', desc: '直升机被击落' },
    'heli:leave': { icon: FaHelicopter, label: '直升机', color: 'text-fg-mute', desc: '直升机已离开' },
    'player:died': { icon: FaSkullCrossbones, label: '阵亡', color: 'text-hazard', desc: '队友阵亡' },
    'player:online': { icon: FaUserCheck, label: '上线', color: 'text-terminal', desc: '队友上线' },
    'player:offline': { icon: FaUserSlash, label: '离线', color: 'text-fg-mute', desc: '队友离线' },
    'alarm:triggered': { icon: FaBell, label: '警报', color: 'text-hazard', desc: '智能警报触发' },
    'entity:changed': { icon: FaLightbulb, label: '设备', color: 'text-fg-dim', desc: '设备状态变化' },
};

const MAX_EVENTS = 50;

export default function EventTracker({ serverId, isDemo = false }) {
    const [events, setEvents] = useState([]);
    const containerRef = useRef(null);
    const isAtBottomRef = useRef(true);

    // 添加事件
    const addEvent = (type, data) => {
        const config = EVENT_CONFIG[type] || { icon: FaExclamationTriangle, label: '事件', color: 'text-fg', desc: type };

        let description = config.desc;
        let extra = '';

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
                description = `警报触发: ${data.message || data.title || data.deviceName || data.name || '智能警报'}`;
                break;
            case 'entity:changed':
                description = `${data.name || '设备'}: ${data.value ? '开启' : '关闭'}`;
                break;
            default:
                break;
        }

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

        const fetchHistory = async () => {
            try {
                const response = await import('../services/api').then(m => m.getEvents(serverId, 50));
                if (response.data && response.data.success) {
                    const historyEvents = response.data.events.map(event => {
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
                        const config = EVENT_CONFIG[type] || { icon: FaExclamationTriangle, label: '事件', color: 'text-fg', desc: type };

                        let description = config.desc;
                        switch (type) {
                            case 'player:died': description = `队友阵亡: ${data.name || '未知'}`; break;
                            case 'player:online': description = `队友上线: ${data.name || '未知'}`; break;
                            case 'player:offline': description = `队友离线: ${data.name || '未知'}`; break;
                            case 'alarm:triggered': description = `警报触发: ${data.message || data.title || data.deviceName || data.name || '智能警报'}`; break;
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
                    setEvents(historyEvents.reverse());
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
        { id: 1, type: 'cargo:spawn', description: '货船已出现', position: 'J8', config: EVENT_CONFIG['cargo:spawn'], time: Date.now() - 300000 },
        { id: 2, type: 'heli:spawn', description: '武装直升机出现', direction: '西北', config: EVENT_CONFIG['heli:spawn'], time: Date.now() - 180000 },
        { id: 3, type: 'player:died', description: '队友阵亡: 侦查员_Echo', position: 'G12', config: EVENT_CONFIG['player:died'], time: Date.now() - 120000 },
        { id: 4, type: 'entity:changed', description: '前门: 开启', config: EVENT_CONFIG['entity:changed'], time: Date.now() - 60000 },
        { id: 5, type: 'alarm:triggered', description: '警报触发: 基地入侵警报', config: EVENT_CONFIG['alarm:triggered'], time: Date.now() - 30000 },
    ];

    const displayEvents = isDemo ? demoEvents : events;

    return (
        <div className="h-full flex flex-col">
            {/* 标题栏 */}
            <div className="flex items-center justify-between mb-3 border-b border-ink-line pb-2.5">
                <div className="flex items-center gap-2">
                    <FaSatellite className={isDemo ? 'text-fg-mute' : 'text-hazard'} />
                    <span className="font-mono text-[11px] uppercase tracking-[0.18em] text-fg-dim">实时事件追踪 // EVENTS</span>
                    {isDemo && <span className="font-mono text-[9px] text-hazard">[DEMO]</span>}
                </div>
                <div className="font-mono text-[10px] text-fg-mute">{displayEvents.length} 条</div>
            </div>

            {/* 事件列表 */}
            <div
                ref={containerRef}
                onScroll={handleScroll}
                className="flex-1 overflow-y-auto custom-scrollbar space-y-1 pr-1"
            >
                {displayEvents.length === 0 ? (
                    <div className="h-full flex flex-col items-center justify-center text-fg-mute">
                        <FaSatellite className="text-2xl mb-2 opacity-40" />
                        <div className="font-mono text-[10px] uppercase tracking-widest">等待事件...</div>
                    </div>
                ) : (
                    displayEvents.map((event) => {
                        const IconComponent = event.config.icon;
                        return (
                            <div
                                key={event.id}
                                className="flex items-center gap-2 px-2 py-1.5 border border-ink-line bg-ink-850 hover:bg-ink-800 transition-colors min-h-[36px]"
                            >
                                <div className={`w-6 h-6 shrink-0 flex items-center justify-center border border-ink-line ${event.config.color}`}>
                                    <IconComponent className="text-xs" />
                                </div>
                                <div className="flex-1 min-w-0 flex items-center justify-between gap-2 overflow-hidden">
                                    <div className="flex items-center gap-2 flex-1 min-w-0">
                                        <span className={`text-[13px] font-bold ${event.config.color} truncate`}>
                                            {event.description}
                                        </span>
                                        {(event.position || event.direction) && (
                                            <span className="flex items-center gap-1.5 whitespace-nowrap overflow-hidden">
                                                {event.position && <span className="font-mono text-[10px] text-hazard bg-hazard-dim px-1 border border-hazard/20">{event.position}</span>}
                                                {event.direction && <span className="font-mono text-[10px] text-fg-dim border border-ink-line px-1">{event.direction}</span>}
                                            </span>
                                        )}
                                    </div>
                                    <span className="font-mono text-[11px] text-fg-mute shrink-0">
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
