import { useState, useEffect, useRef, useCallback } from 'react';
import { FaPaperPlane, FaComments, FaArrowDown, FaHistory, FaExclamationTriangle } from 'react-icons/fa';
import socketService from '../services/socket';
import { useToast } from './Toast';
import { formatTime } from '../utils/time';
import EmptyState from './EmptyState';

const MAX_MESSAGE_LENGTH = 128; // Rust+ 消息长度限制

function ChatPanel({ serverId }) {
  const [messages, setMessages] = useState([]);
  const [inputMessage, setInputMessage] = useState('');
  const [sending, setSending] = useState(false);
  const [showScrollButton, setShowScrollButton] = useState(false);
  const [newMessageCount, setNewMessageCount] = useState(0);
  const [loadingHistory, setLoadingHistory] = useState(false);
  const messagesEndRef = useRef(null);
  const messagesContainerRef = useRef(null);
  const recentlySentRef = useRef([]); // 记录最近发送的消息，用于去重
  const isAtBottomRef = useRef(true); // 跟踪用户是否在底部
  const historyLoadedRef = useRef(false); // 是否已加载历史
  const MAX_MESSAGES = 500; // 限制消息数量，防止内存泄漏

  const toast = useToast();

  // 计算消息是否超长
  const isMessageTooLong = inputMessage.length > MAX_MESSAGE_LENGTH;
  const willSplit = inputMessage.length > MAX_MESSAGE_LENGTH;
  const estimatedParts = Math.ceil(inputMessage.length / MAX_MESSAGE_LENGTH);

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

  // 加载聊天历史
  const loadChatHistory = useCallback(async () => {
    if (!serverId || loadingHistory) return;

    setLoadingHistory(true);
    try {
      const history = await socketService.getChatHistory(serverId);
      if (history && history.length > 0) {
        // 将历史消息转换为前端格式
        const historyMessages = history.map((msg, index) => ({
          id: `history-${msg.time || index}-${index}`,
          name: msg.name,
          message: msg.message,
          steamId: msg.steamId?.toString(),
          time: msg.time ? msg.time * 1000 : Date.now() - (history.length - index) * 1000,
          isMe: false,
          isHistory: true
        }));

        setMessages(prev => {
          // 合并历史消息，去除重复
          const existingIds = new Set(prev.map(m => m.message + m.name));
          const newHistory = historyMessages.filter(m => !existingIds.has(m.message + m.name));
          return [...newHistory, ...prev].slice(-MAX_MESSAGES);
        });

        historyLoadedRef.current = true;
        // 滚动到底部显示最新消息
        setTimeout(() => scrollToBottom(), 100);
      }
    } catch (error) {
      console.warn('加载聊天历史失败:', error.message);
      // 不显示 toast，因为这不是关键功能
    } finally {
      setLoadingHistory(false);
    }
  }, [serverId, loadingHistory]);

  // 组件挂载时加载历史
  useEffect(() => {
    if (serverId && !historyLoadedRef.current) {
      loadChatHistory();
    }
    // serverId 变化时重置
    return () => {
      historyLoadedRef.current = false;
    };
  }, [serverId]);

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

      // 如果消息会被拆分，记录所有可能的拆分片段用于去重
      if (messageToSend.length > MAX_MESSAGE_LENGTH) {
        // 简单拆分逻辑，与后端保持一致
        for (let i = 0; i < messageToSend.length; i += MAX_MESSAGE_LENGTH) {
          const part = messageToSend.slice(i, i + MAX_MESSAGE_LENGTH);
          recentlySentRef.current.push({
            message: part,
            time: Date.now()
          });
        }
      } else {
        recentlySentRef.current.push({
          message: messageToSend,
          time: Date.now()
        });
      }

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
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <FaComments className="text-blue-400 text-xl" />
            <h2 className="text-xl font-bold">队伍聊天</h2>
          </div>
          <button
            onClick={loadChatHistory}
            disabled={loadingHistory}
            className="text-xs text-gray-400 hover:text-gray-300 flex items-center gap-1 transition-colors"
            title="刷新聊天历史"
          >
            <FaHistory className={loadingHistory ? 'animate-spin' : ''} />
            {loadingHistory ? '加载中...' : '刷新'}
          </button>
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
                } ${msg.isHistory ? 'opacity-80' : ''}`}
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
      <form onSubmit={handleSendMessage} className="pt-3 mt-1 border-t border-dark-700">
        {/* 字符计数和警告 */}
        <div className="flex items-center justify-between mb-2 text-xs">
          <div className="flex items-center gap-2">
            {willSplit && (
              <span className="flex items-center gap-1 text-yellow-400">
                <FaExclamationTriangle />
                消息将拆分为 {estimatedParts} 条发送
              </span>
            )}
          </div>
          <span className={`font-mono ${isMessageTooLong ? 'text-yellow-400' : 'text-gray-500'}`}>
            {inputMessage.length}/{MAX_MESSAGE_LENGTH}
          </span>
        </div>

        <div className="flex gap-2">
          <input
            type="text"
            className={`input flex-1 bg-dark-800/50 backdrop-blur border-white/10 focus:border-rust-accent/50 focus:ring-1 focus:ring-rust-accent/50 ${
              isMessageTooLong ? 'border-yellow-500/50' : ''
            }`}
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
        </div>
      </form>
    </div>
  );
}

export default ChatPanel;
