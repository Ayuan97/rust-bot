import { useState, useEffect, useRef } from 'react';
import { FaPaperPlane, FaComments } from 'react-icons/fa';
import socketService from '../services/socket';

function ChatPanel({ serverId }) {
  const [messages, setMessages] = useState([]);
  const [inputMessage, setInputMessage] = useState('');
  const [sending, setSending] = useState(false);
  const messagesEndRef = useRef(null);

  useEffect(() => {
    // 监听队伍消息
    const handleTeamMessage = (data) => {
      if (data.serverId === serverId) {
        setMessages((prev) => [
          ...prev,
          {
            id: Date.now(),
            name: data.name,
            message: data.message,
            steamId: data.steamId,
            time: data.time || Date.now(),
            isMe: false
          }
        ]);
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

    setSending(true);
    try {
      await socketService.sendMessage(serverId, inputMessage);

      // 添加自己的消息到列表
      setMessages((prev) => [
        ...prev,
        {
          id: Date.now(),
          name: 'You',
          message: inputMessage,
          time: Date.now(),
          isMe: true
        }
      ]);

      setInputMessage('');
    } catch (error) {
      console.error('发送消息失败:', error);
      alert('发送失败: ' + error.message);
    } finally {
      setSending(false);
    }
  };

  const formatTime = (timestamp) => {
    const date = new Date(timestamp * 1000);
    return date.toLocaleTimeString('zh-CN', {
      hour: '2-digit',
      minute: '2-digit'
    });
  };

  return (
    <div className="card h-full flex flex-col">
      <div className="flex items-center gap-2 mb-4 pb-3 border-b border-rust-gray">
        <FaComments className="text-rust-orange text-xl" />
        <h2 className="text-xl font-bold">队伍聊天</h2>
      </div>

      {/* 消息列表 */}
      <div className="flex-1 overflow-y-auto mb-4 space-y-3">
        {messages.length === 0 ? (
          <div className="text-center text-gray-400 py-8">
            暂无消息
          </div>
        ) : (
          messages.map((msg) => (
            <div
              key={msg.id}
              className={`p-3 rounded-lg ${
                msg.isMe
                  ? 'bg-rust-orange bg-opacity-20 ml-8'
                  : 'bg-rust-gray mr-8'
              }`}
            >
              <div className="flex items-center justify-between mb-1">
                <span className="font-semibold text-sm">
                  {msg.isMe ? '你' : msg.name}
                </span>
                <span className="text-xs text-gray-400">
                  {formatTime(msg.time)}
                </span>
              </div>
              <p className="text-sm break-words">{msg.message}</p>
            </div>
          ))
        )}
        <div ref={messagesEndRef} />
      </div>

      {/* 输入框 */}
      <form onSubmit={handleSendMessage} className="flex gap-2">
        <input
          type="text"
          className="input flex-1"
          placeholder="输入消息发送到游戏内..."
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
