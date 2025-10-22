import { useState, useEffect } from 'react';
import { FaShip, FaHelicopter, FaOilCan, FaBox, FaClock } from 'react-icons/fa';
import socketService from '../services/socket';

function EventsPanel({ serverId }) {
  const [events, setEvents] = useState({
    cargo: [],
    heli: [],
    ch47: [],
    crates: [],
    smallOilRig: null,
    largeOilRig: null
  });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // 监听游戏事件
    socketService.on('event:cargo:spawn', handleCargoSpawn);
    socketService.on('event:cargo:leave', handleCargoLeave);
    socketService.on('event:heli:spawn', handleHeliSpawn);
    socketService.on('event:heli:downed', handleHeliDowned);
    socketService.on('event:heli:leave', handleHeliLeave);
    socketService.on('event:ch47:spawn', handleCH47Spawn);
    socketService.on('event:ch47:leave', handleCH47Leave);
    socketService.on('event:crate:spawn', handleCrateSpawn);
    socketService.on('event:crate:despawn', handleCrateDespawn);
    socketService.on('event:small:triggered', handleSmallOilRig);
    socketService.on('event:large:triggered', handleLargeOilRig);

    // 初始加载
    fetchEvents();

    return () => {
      socketService.off('event:cargo:spawn', handleCargoSpawn);
      socketService.off('event:cargo:leave', handleCargoLeave);
      socketService.off('event:heli:spawn', handleHeliSpawn);
      socketService.off('event:heli:downed', handleHeliDowned);
      socketService.off('event:heli:leave', handleHeliLeave);
      socketService.off('event:ch47:spawn', handleCH47Spawn);
      socketService.off('event:ch47:leave', handleCH47Leave);
      socketService.off('event:crate:spawn', handleCrateSpawn);
      socketService.off('event:crate:despawn', handleCrateDespawn);
      socketService.off('event:small:triggered', handleSmallOilRig);
      socketService.off('event:large:triggered', handleLargeOilRig);
    };
  }, [serverId]);

  const fetchEvents = async () => {
    try {
      // 这里可以通过 socket 请求当前活跃事件
      setLoading(false);
    } catch (error) {
      console.error('获取事件失败:', error);
      setLoading(false);
    }
  };

  const handleCargoSpawn = (data) => {
    if (data.serverId === serverId) {
      setEvents(prev => ({
        ...prev,
        cargo: [...prev.cargo, { id: data.markerId, position: data.position, time: data.time }]
      }));
    }
  };

  const handleCargoLeave = (data) => {
    if (data.serverId === serverId) {
      setEvents(prev => ({
        ...prev,
        cargo: prev.cargo.filter(c => c.id !== data.markerId)
      }));
    }
  };

  const handleHeliSpawn = (data) => {
    if (data.serverId === serverId) {
      setEvents(prev => ({
        ...prev,
        heli: [...prev.heli, { id: data.markerId, position: data.position, time: data.time }]
      }));
    }
  };

  const handleHeliDowned = (data) => {
    if (data.serverId === serverId) {
      setEvents(prev => ({
        ...prev,
        heli: prev.heli.filter(h => h.id !== data.markerId)
      }));
    }
  };

  const handleHeliLeave = (data) => {
    if (data.serverId === serverId) {
      setEvents(prev => ({
        ...prev,
        heli: prev.heli.filter(h => h.id !== data.markerId)
      }));
    }
  };

  const handleCH47Spawn = (data) => {
    if (data.serverId === serverId) {
      setEvents(prev => ({
        ...prev,
        ch47: [...prev.ch47, { id: data.markerId, position: data.position, time: data.time }]
      }));
    }
  };

  const handleCH47Leave = (data) => {
    if (data.serverId === serverId) {
      setEvents(prev => ({
        ...prev,
        ch47: prev.ch47.filter(c => c.id !== data.markerId)
      }));
    }
  };

  const handleCrateSpawn = (data) => {
    if (data.serverId === serverId) {
      setEvents(prev => ({
        ...prev,
        crates: [...prev.crates, { id: data.markerId, position: data.position, time: data.time }]
      }));
    }
  };

  const handleCrateDespawn = (data) => {
    if (data.serverId === serverId) {
      setEvents(prev => ({
        ...prev,
        crates: prev.crates.filter(c => c.id !== data.markerId)
      }));
    }
  };

  const handleSmallOilRig = (data) => {
    if (data.serverId === serverId) {
      setEvents(prev => ({
        ...prev,
        smallOilRig: { time: data.time, position: data.position }
      }));
    }
  };

  const handleLargeOilRig = (data) => {
    if (data.serverId === serverId) {
      setEvents(prev => ({
        ...prev,
        largeOilRig: { time: data.time, position: data.position }
      }));
    }
  };

  const formatTimeAgo = (timestamp) => {
    const now = Date.now();
    const diff = now - timestamp;
    const minutes = Math.floor(diff / 60000);

    if (minutes < 1) return '刚刚';
    if (minutes < 60) return `${minutes}分钟前`;
    const hours = Math.floor(minutes / 60);
    if (hours < 24) return `${hours}小时前`;
    return `${Math.floor(hours / 24)}天前`;
  };

  const hasActiveEvents = events.cargo.length > 0 ||
                         events.heli.length > 0 ||
                         events.ch47.length > 0 ||
                         events.crates.length > 0 ||
                         events.smallOilRig ||
                         events.largeOilRig;

  if (loading) {
    return (
      <div className="card h-full flex items-center justify-center">
        <div className="text-gray-400">加载中...</div>
      </div>
    );
  }

  return (
    <div className="card h-full">
      <h2 className="text-xl font-bold mb-4 pb-3 border-b border-rust-gray">
        活跃游戏事件
      </h2>

      <div className="space-y-4 overflow-y-auto max-h-[500px]">
        {!hasActiveEvents ? (
          <div className="text-center text-gray-400 py-8">
            当前没有活跃事件
          </div>
        ) : (
          <>
            {/* 货船 */}
            {events.cargo.length > 0 && (
              <div className="space-y-2">
                <h3 className="text-sm font-semibold text-rust-orange flex items-center gap-2">
                  <FaShip /> 货船 ({events.cargo.length})
                </h3>
                {events.cargo.map((cargo) => (
                  <div key={cargo.id} className="p-3 bg-rust-gray rounded-lg">
                    <div className="flex justify-between items-center">
                      <span className="text-sm">位置: {cargo.position}</span>
                      <span className="text-xs text-gray-400">{formatTimeAgo(cargo.time)}</span>
                    </div>
                  </div>
                ))}
              </div>
            )}

            {/* 武装直升机 */}
            {events.heli.length > 0 && (
              <div className="space-y-2">
                <h3 className="text-sm font-semibold text-rust-orange flex items-center gap-2">
                  <FaHelicopter /> 武装直升机 ({events.heli.length})
                </h3>
                {events.heli.map((heli) => (
                  <div key={heli.id} className="p-3 bg-rust-gray rounded-lg">
                    <div className="flex justify-between items-center">
                      <span className="text-sm">位置: {heli.position}</span>
                      <span className="text-xs text-gray-400">{formatTimeAgo(heli.time)}</span>
                    </div>
                  </div>
                ))}
              </div>
            )}

            {/* CH47 */}
            {events.ch47.length > 0 && (
              <div className="space-y-2">
                <h3 className="text-sm font-semibold text-rust-orange flex items-center gap-2">
                  <FaHelicopter className="transform rotate-45" /> CH47 ({events.ch47.length})
                </h3>
                {events.ch47.map((ch47) => (
                  <div key={ch47.id} className="p-3 bg-rust-gray rounded-lg">
                    <div className="flex justify-between items-center">
                      <span className="text-sm">位置: {ch47.position}</span>
                      <span className="text-xs text-gray-400">{formatTimeAgo(ch47.time)}</span>
                    </div>
                  </div>
                ))}
              </div>
            )}

            {/* 上锁箱子 */}
            {events.crates.length > 0 && (
              <div className="space-y-2">
                <h3 className="text-sm font-semibold text-rust-orange flex items-center gap-2">
                  <FaBox /> 上锁箱子 ({events.crates.length})
                </h3>
                {events.crates.map((crate) => (
                  <div key={crate.id} className="p-3 bg-rust-gray rounded-lg">
                    <div className="flex justify-between items-center">
                      <span className="text-sm">位置: {crate.position}</span>
                      <span className="text-xs text-gray-400">{formatTimeAgo(crate.time)}</span>
                    </div>
                  </div>
                ))}
              </div>
            )}

            {/* 小油井 */}
            {events.smallOilRig && (
              <div className="space-y-2">
                <h3 className="text-sm font-semibold text-rust-orange flex items-center gap-2">
                  <FaOilCan /> 小油井已触发
                </h3>
                <div className="p-3 bg-rust-gray rounded-lg">
                  <div className="flex justify-between items-center">
                    <span className="text-sm">箱子解锁倒计时</span>
                    <span className="text-xs text-gray-400">{formatTimeAgo(events.smallOilRig.time)}</span>
                  </div>
                </div>
              </div>
            )}

            {/* 大油井 */}
            {events.largeOilRig && (
              <div className="space-y-2">
                <h3 className="text-sm font-semibold text-rust-orange flex items-center gap-2">
                  <FaOilCan /> 大油井已触发
                </h3>
                <div className="p-3 bg-rust-gray rounded-lg">
                  <div className="flex justify-between items-center">
                    <span className="text-sm">箱子解锁倒计时</span>
                    <span className="text-xs text-gray-400">{formatTimeAgo(events.largeOilRig.time)}</span>
                  </div>
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}

export default EventsPanel;
