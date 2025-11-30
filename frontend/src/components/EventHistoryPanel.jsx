import { useState, useEffect } from 'react';
import { FaHistory, FaShip, FaHelicopter, FaOilCan, FaBox, FaBomb } from 'react-icons/fa';
import socketService from '../services/socket';

function EventHistoryPanel({ serverId }) {
  const [history, setHistory] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // 定义事件处理器（在 useEffect 内部，避免依赖问题）
    const handleEvent = (data) => {
      if (data.serverId === serverId) {
        setHistory(prev => [
          {
            id: `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
            type: data.type || '未知事件',
            position: data.position,
            time: data.time,
            data: data
          },
          ...prev
        ].slice(0, 50)); // 只保留最近50条
      }
    };

    // 监听所有游戏事件并添加到历史
    socketService.on('event:cargo:spawn', handleEvent);
    socketService.on('event:cargo:leave', handleEvent);
    socketService.on('event:heli:spawn', handleEvent);
    socketService.on('event:heli:downed', handleEvent);
    socketService.on('event:heli:leave', handleEvent);
    socketService.on('event:ch47:spawn', handleEvent);
    socketService.on('event:ch47:leave', handleEvent);
    socketService.on('event:crate:spawn', handleEvent);
    socketService.on('event:crate:despawn', handleEvent);
    socketService.on('event:small:triggered', handleEvent);
    socketService.on('event:small:unlocked', handleEvent);
    socketService.on('event:large:triggered', handleEvent);
    socketService.on('event:large:unlocked', handleEvent);
    socketService.on('event:raid:detected', handleEvent);

    setLoading(false);

    return () => {
      socketService.off('event:cargo:spawn', handleEvent);
      socketService.off('event:cargo:leave', handleEvent);
      socketService.off('event:heli:spawn', handleEvent);
      socketService.off('event:heli:downed', handleEvent);
      socketService.off('event:heli:leave', handleEvent);
      socketService.off('event:ch47:spawn', handleEvent);
      socketService.off('event:ch47:leave', handleEvent);
      socketService.off('event:crate:spawn', handleEvent);
      socketService.off('event:crate:despawn', handleEvent);
      socketService.off('event:small:triggered', handleEvent);
      socketService.off('event:small:unlocked', handleEvent);
      socketService.off('event:large:triggered', handleEvent);
      socketService.off('event:large:unlocked', handleEvent);
      socketService.off('event:raid:detected', handleEvent);
    };
  }, [serverId]);

  const getEventIcon = (type) => {
    if (type.includes('cargo')) return <FaShip className="text-blue-400" />;
    if (type.includes('heli')) return <FaHelicopter className="text-red-400" />;
    if (type.includes('ch47')) return <FaHelicopter className="text-yellow-400 transform rotate-45" />;
    if (type.includes('crate')) return <FaBox className="text-purple-400" />;
    if (type.includes('oil')) return <FaOilCan className="text-green-400" />;
    if (type.includes('raid')) return <FaBomb className="text-orange-400" />;
    return <FaHistory className="text-gray-400" />;
  };

  const getEventTitle = (type) => {
    const titles = {
      'cargo:spawn': '货船刷新',
      'cargo:leave': '货船离开',
      'heli:spawn': '武装直升机刷新',
      'heli:downed': '武装直升机被击落',
      'heli:leave': '武装直升机离开',
      'ch47:spawn': 'CH47刷新',
      'ch47:leave': 'CH47离开',
      'crate:spawn': '上锁箱子出现',
      'crate:despawn': '上锁箱子消失',
      'small:triggered': '小油井触发',
      'small:unlocked': '小油井箱子解锁',
      'large:triggered': '大油井触发',
      'large:unlocked': '大油井箱子解锁',
      'raid:detected': '袭击检测'
    };
    return titles[type] || type;
  };

  const formatTime = (timestamp) => {
    // 统一处理时间戳：如果小于 10000000000，认为是秒级，否则是毫秒级
    const ms = timestamp < 10000000000 ? timestamp * 1000 : timestamp;
    const date = new Date(ms);
    return date.toLocaleTimeString('zh-CN', {
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit'
    });
  };

  const formatTimeAgo = (timestamp) => {
    const now = Date.now();
    // 统一处理时间戳：如果小于 10000000000，认为是秒级，否则是毫秒级
    const ms = timestamp < 10000000000 ? timestamp * 1000 : timestamp;
    const diff = now - ms;
    const minutes = Math.floor(diff / 60000);

    if (minutes < 1) return '刚刚';
    if (minutes < 60) return `${minutes}分钟前`;
    const hours = Math.floor(minutes / 60);
    if (hours < 24) return `${hours}小时前`;
    return `${Math.floor(hours / 24)}天前`;
  };

  if (loading) {
    return (
      <div className="card h-full flex items-center justify-center">
        <div className="text-gray-400">加载中...</div>
      </div>
    );
  }

  return (
    <div className="card h-full flex flex-col">
      <h2 className="text-xl font-bold mb-4 pb-3 border-b border-rust-gray flex items-center gap-2">
        <FaHistory className="text-rust-orange" />
        事件历史
      </h2>

      <div className="flex-1 overflow-y-auto space-y-2">
        {history.length === 0 ? (
          <div className="text-center text-gray-400 py-8">
            暂无事件历史
          </div>
        ) : (
          history.map((event) => (
            <div
              key={event.id}
              className="p-3 bg-rust-gray rounded-lg hover:bg-opacity-80 transition-colors"
            >
              <div className="flex items-start gap-3">
                <div className="text-xl mt-1">
                  {getEventIcon(event.type)}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between mb-1">
                    <span className="font-semibold text-sm">
                      {getEventTitle(event.type)}
                    </span>
                    <span className="text-xs text-gray-400">
                      {formatTimeAgo(event.time)}
                    </span>
                  </div>
                  {event.position && (
                    <p className="text-xs text-gray-300">
                      位置: {event.position}
                    </p>
                  )}
                  <p className="text-xs text-gray-500 mt-1">
                    {formatTime(event.time)}
                  </p>
                </div>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}

export default EventHistoryPanel;
