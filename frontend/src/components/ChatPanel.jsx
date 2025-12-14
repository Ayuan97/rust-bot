import { useState, useEffect, useRef, useCallback } from 'react';
import { FaPaperPlane, FaComments, FaArrowDown } from 'react-icons/fa';
import socketService from '../services/socket';
import { useToast } from './Toast';
import { formatTime } from '../utils/time';
import EmptyState from './EmptyState';

function ChatPanel({ serverId }) {
  const [messages, setMessages] = useState([]);
  const [inputMessage, setInputMessage] = useState('');
  const [sending, setSending] = useState(false);
  const [showScrollButton, setShowScrollButton] = useState(false);
  const [newMessageCount, setNewMessageCount] = useState(0);
  const messagesEndRef = useRef(null);
  const messagesContainerRef = useRef(null);
  const recentlySentRef = useRef([]); // 记录最近发送的消息，用于去重
  const isAtBottomRef = useRef(true); // 跟踪用户是否在底部
  const MAX_MESSAGES = 500; // 限制消息数量，防止内存泄漏

  const toast = useToast();

  // 检查是否在底部
  const checkIfAtBottom = useCallback(() => {
    const container = messagesContainerRef.current;
    if (!container) return true;
    const threshold = 100; // 距离底部100px内视为在底部
    return container.scrollHeight - container.scrollTop - container.clientHeight < threshold;
  }, []);

  // 处理滚动事件
  const handleScroll = useCallback(() => {
    const atBottom = checkIfAtBottom();
    isAtBottomRef.current = atBottom;
    setShowScrollButton(!atBottom);
    if (atBottom) {
      setNewMessageCount(0);
    }
  }, [checkIfAtBottom]);

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

        // 如果不在底部，增加未读计数
        if (!isAtBottomRef.current) {
          setNewMessageCount(c => c + 1);
        }
      }
    };

    socketService.on('team:message', handleTeamMessage);

    return () => {
      socketService.off('team:message', handleTeamMessage);
    };
  }, [serverId]);

  useEffect(() => {
    // 只有在底部时才自动滚动
    if (isAtBottomRef.current) {
      scrollToBottom();
    }
  }, [messages]);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    setNewMessageCount(0);
    setShowScrollButton(false);
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
      toast.error('发送失败: ' + error.message);
    } finally {
      setSending(false);
    }
  };

  return (
    <div className="h-full flex flex-col">
      {/* 标题栏 */}
      <div className="mb-4 pb-3 border-b border-dark-700">
        <div className="flex items-center gap-2">
          <FaComments className="text-blue-400 text-xl" />
          <h2 className="text-xl font-bold">队伍聊天</h2>
        </div>
        <p className="text-xs text-gray-500 mt-1">与队友实时聊天，消息会同步到游戏内</p>
      </div>

      {/* 消息列表 */}
      <div className="flex-1 relative min-h-0">
        <div
          ref={messagesContainerRef}
          onScroll={handleScroll}
          className="absolute inset-0 overflow-y-auto space-y-3 custom-scrollbar pr-2"
        >
          {messages.length === 0 ? (
            <EmptyState type="chat" />
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

        {/* 滚动到底部按钮 */}
        {showScrollButton && (
          <button
            onClick={scrollToBottom}
            className="absolute bottom-4 right-4 z-10 flex items-center gap-2 px-3 py-2 bg-rust-accent hover:bg-rust-accent/80 text-white rounded-full shadow-lg transition-all hover:scale-105"
            aria-label="滚动到最新消息"
          >
            <FaArrowDown className="text-sm" />
            {newMessageCount > 0 && (
              <span className="text-xs font-medium">{newMessageCount} 条新消息</span>
            )}
          </button>
        )}
      </div>

      {/* 输入框 */}
      <form onSubmit={handleSendMessage} className="flex gap-2 pt-3 mt-1 border-t border-dark-700">
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
