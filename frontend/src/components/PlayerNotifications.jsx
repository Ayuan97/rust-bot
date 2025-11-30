import { useState, useEffect, useRef } from 'react';
import { FaSkull, FaUser, FaSignInAlt, FaSignOutAlt } from 'react-icons/fa';
import socketService from '../services/socket';

function PlayerNotifications({ serverId }) {
  const [notifications, setNotifications] = useState([]);
  const timeoutsRef = useRef([]); // 存储所有 timeout ID

  useEffect(() => {
    // 监听玩家事件
    socketService.on('player:died', handlePlayerDied);
    socketService.on('player:spawned', handlePlayerSpawned);
    socketService.on('player:online', handlePlayerOnline);
    socketService.on('player:offline', handlePlayerOffline);

    return () => {
      // 清理所有 timeout
      timeoutsRef.current.forEach(clearTimeout);
      timeoutsRef.current = [];

      // 清理监听器
      socketService.off('player:died', handlePlayerDied);
      socketService.off('player:spawned', handlePlayerSpawned);
      socketService.off('player:online', handlePlayerOnline);
      socketService.off('player:offline', handlePlayerOffline);
    };
  }, [serverId]);

  const addNotification = (type, name, data = {}) => {
    const notification = {
      id: Date.now() + Math.random(),
      type,
      name,
      time: Date.now(),
      ...data
    };

    setNotifications(prev => [notification, ...prev].slice(0, 20)); // 只保留最近20条

    // 5秒后自动移除
    const timeoutId = setTimeout(() => {
      setNotifications(prev => prev.filter(n => n.id !== notification.id));
    }, 5000);

    // 保存 timeout ID
    timeoutsRef.current.push(timeoutId);
  };

  const handlePlayerDied = (data) => {
    if (data.serverId === serverId) {
      addNotification('died', data.name, { position: data.position });
    }
  };

  const handlePlayerSpawned = (data) => {
    if (data.serverId === serverId) {
      addNotification('spawned', data.name);
    }
  };

  const handlePlayerOnline = (data) => {
    if (data.serverId === serverId) {
      addNotification('online', data.name);
    }
  };

  const handlePlayerOffline = (data) => {
    if (data.serverId === serverId) {
      addNotification('offline', data.name);
    }
  };

  const getNotificationConfig = (type) => {
    const configs = {
      died: {
        icon: <FaSkull />,
        color: 'bg-red-500',
        text: '死亡'
      },
      spawned: {
        icon: <FaUser />,
        color: 'bg-green-500',
        text: '重生'
      },
      online: {
        icon: <FaSignInAlt />,
        color: 'bg-blue-500',
        text: '上线'
      },
      offline: {
        icon: <FaSignOutAlt />,
        color: 'bg-gray-500',
        text: '下线'
      }
    };
    return configs[type] || configs.online;
  };

  if (notifications.length === 0) {
    return null;
  }

  return (
    <div className="fixed bottom-4 right-4 z-50 space-y-2 max-w-sm">
      {notifications.map((notification) => {
        const config = getNotificationConfig(notification.type);
        return (
          <div
            key={notification.id}
            className="bg-rust-dark border border-rust-gray rounded-lg shadow-lg p-4 animate-slide-in-right"
          >
            <div className="flex items-center gap-3">
              <div className={`${config.color} w-10 h-10 rounded-full flex items-center justify-center text-white`}>
                {config.icon}
              </div>
              <div className="flex-1">
                <p className="font-semibold">{notification.name}</p>
                <p className="text-sm text-gray-400">{config.text}</p>
                {notification.position && (
                  <p className="text-xs text-gray-500 mt-1">
                    位置: {notification.position}
                  </p>
                )}
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}

export default PlayerNotifications;
