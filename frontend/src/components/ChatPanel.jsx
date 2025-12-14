import { useState, useEffect, useRef } from 'react';
import { FaPaperPlane, FaComments } from 'react-icons/fa';
import socketService from '../services/socket';

function ChatPanel({ serverId }) {
  const [messages, setMessages] = useState([]);
  const [inputMessage, setInputMessage] = useState('');
  const [sending, setSending] = useState(false);
  const messagesEndRef = useRef(null);
  const recentlySentRef = useRef([]); // 记录最近发送的消息，用于去重
  const MAX_MESSAGES = 500; // 限制消息数量，防止内存泄漏

  useEffect(() => {
    // 监听队伍消息
    const handleTeamMessage = (data) => {
      if (data.serverId === serverId) {
        // 检查是否是自己刚发送的消息（去重）
        const isDuplicate = recentlySentRef.current.some(sent =>
          sent.message === data.message &&
          Math.abs(Date.now() - sent.time) < 5000 // 5秒内的相同消息视为重复
        );

        if (isDuplicate) {
          // 清理已匹配的发送记录
          recentlySentRef.current = recentlySentRef.current.filter(
            sent => sent.message !== data.message
          );
          return; // 跳过重复消息
        }

        setMessages((prev) => {
          const newMessages = [
            ...prev,
            {
              id: Date.now(),
              name: data.name,
              message: data.message,
              steamId: data.steamId,
              time: data.time || Date.now(),
              isMe: false
            }
          ];
          // 限制消息数量
          return newMessages.slice(-MAX_MESSAGES);
        });
      }
    };

    socketService.on('team:message', handleTeamMessage);

    return () => {
      socketService.off('team:message', handleTeamMessage);
    };
  }, [serverId]);

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  const handleSendMessage = async (e) => {
    e.preventDefault();

    if (!inputMessage.trim() || sending) return;

    const messageToSend = inputMessage.trim();
    setSending(true);
    try {
      await socketService.sendMessage(serverId, messageToSend);

      // 记录发送的消息用于去重（防止服务器广播回来时重复显示）
      recentlySentRef.current.push({
        message: messageToSend,
        time: Date.now()
      });

      // 清理超过10秒的旧记录
      const now = Date.now();
      recentlySentRef.current = recentlySentRef.current.filter(
        sent => now - sent.time < 10000
      );

      // 添加自己的消息到列表
      setMessages((prev) => {
        const newMessages = [
          ...prev,
          {
            id: Date.now(),
            name: '你',
            message: messageToSend,
            time: Date.now(),
            isMe: true
          }
        ];
        return newMessages.slice(-MAX_MESSAGES);
      });

      setInputMessage('');
    } catch (error) {
      console.error('发送消息失败:', error);
      alert('发送失败: ' + error.message);
    } finally {
      setSending(false);
    }
  };

  const formatTime = (timestamp) => {
    // 统一处理时间戳：如果小于 10000000000，认为是秒级，否则是毫秒级
    const ms = timestamp < 10000000000 ? timestamp * 1000 : timestamp;
    const date = new Date(ms);
    return date.toLocaleTimeString('zh-CN', {
      hour: '2-digit',
      minute: '2-digit'
    });
  };

  return (
    <div className="h-full flex flex-col">
      {/* 消息列表 */}
      <div className="flex-1 overflow-y-auto mb-4 space-y-3 custom-scrollbar pr-2">
        {messages.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full text-gray-500 space-y-2">
            <FaComments className="text-4xl opacity-20" />
            <p className="text-sm">暂无消息</p>
          </div>
        ) : (
          messages.map((msg) => (
            <div
              key={msg.id}
              className={`p-3 rounded-xl max-w-[80%] ${
                msg.isMe
                  ? 'bg-rust-accent/20 border border-rust-accent/20 ml-auto rounded-tr-sm text-gray-100'
                  : 'bg-dark-700/50 border border-white/5 mr-auto rounded-tl-sm text-gray-300'
              }`}
            >
              <div className="flex items-center justify-between mb-1 gap-4">
                <span className={`font-bold text-xs ${msg.isMe ? 'text-rust-accent' : 'text-gray-400'}`}>
                  {msg.isMe ? '你' : msg.name}
                </span>
                <span className="text-[10px] text-gray-500 font-mono opacity-70">
                  {formatTime(msg.time)}
                </span>
              </div>
              <p className="text-sm break-words leading-relaxed">{msg.message}</p>
            </div>
          ))
        )}
        <div ref={messagesEndRef} />
      </div>

      {/* 输入框 */}
      <form onSubmit={handleSendMessage} className="flex gap-2 p-1">
        <input
          type="text"
          className="input flex-1 bg-dark-800/50 backdrop-blur border-white/10 focus:border-rust-accent/50 focus:ring-1 focus:ring-rust-accent/50"
          placeholder="发送消息到游戏内..."
          value={inputMessage}
          onChange={(e) => setInputMessage(e.target.value)}
          disabled={sending}
        />
        <button
          type="submit"
          className="btn btn-primary flex items-center gap-2"
          disabled={!inputMessage.trim() || sending}
        >
          <FaPaperPlane />
          {sending ? '发送中' : '发送'}
        </button>
      </form>
    </div>
  );
}

export default ChatPanel;
