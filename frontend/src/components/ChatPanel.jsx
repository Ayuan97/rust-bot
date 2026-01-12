import { useState, useEffect, useRef, useCallback } from 'react';
import { FaPaperPlane, FaComments, FaArrowDown, FaHistory, FaExclamationTriangle, FaTerminal } from 'react-icons/fa';
import socketService from '../services/socket';
import { useToast } from './Toast';
import { formatTime } from '../utils/time';
import EmptyState from './EmptyState';

const MAX_MESSAGE_LENGTH = 128; // Rust+ 消息长度限制

function ChatPanel({ serverId, isReadOnly = false }) {
  const [messages, setMessages] = useState([]);
  const [inputMessage, setInputMessage] = useState('');
  const [sending, setSending] = useState(false);
  const [showScrollButton, setShowScrollButton] = useState(false);
  const [newMessageCount, setNewMessageCount] = useState(0);
  const [loadingHistory, setLoadingHistory] = useState(false);
  const messagesEndRef = useRef(null);
  const messagesContainerRef = useRef(null);
  const recentlySentRef = useRef([]);
  const isAtBottomRef = useRef(true);
  const historyLoadedRef = useRef(false);
  const MAX_MESSAGES = 500;

  const toast = useToast();

  const isMessageTooLong = inputMessage.length > MAX_MESSAGE_LENGTH;
  const estimatedParts = Math.ceil(inputMessage.length / MAX_MESSAGE_LENGTH);

  const checkIfAtBottom = useCallback(() => {
    const container = messagesContainerRef.current;
    if (!container) return true;
    const threshold = 100;
    return container.scrollHeight - container.scrollTop - container.clientHeight < threshold;
  }, []);

  const handleScroll = useCallback(() => {
    const atBottom = checkIfAtBottom();
    isAtBottomRef.current = atBottom;
    setShowScrollButton(!atBottom);
    if (atBottom) {
      setNewMessageCount(0);
    }
  }, [checkIfAtBottom]);

  const loadChatHistory = useCallback(async () => {
    if (!serverId || loadingHistory) return;
    setLoadingHistory(true);
    try {
      const history = await socketService.getChatHistory(serverId);
      if (history && history.length > 0) {
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
          const existingIds = new Set(prev.map(m => m.message + m.name));
          const newHistory = historyMessages.filter(m => !existingIds.has(m.message + m.name));
          return [...newHistory, ...prev].slice(-MAX_MESSAGES);
        });
        historyLoadedRef.current = true;
        setTimeout(() => scrollToBottom(), 100);
      }
    } catch (error) {
      console.warn('加载聊天历史失败:', error.message);
    } finally {
      setLoadingHistory(false);
    }
  }, [serverId, loadingHistory]);

  useEffect(() => {
    if (serverId && !historyLoadedRef.current) loadChatHistory();
    return () => { historyLoadedRef.current = false; };
  }, [serverId]);

  useEffect(() => {
    const handleTeamMessage = (data) => {
      if (data.serverId === serverId) {
        const isDuplicate = recentlySentRef.current.some(sent =>
          sent.message === data.message && Math.abs(Date.now() - sent.time) < 5000
        );
        if (isDuplicate) {
          recentlySentRef.current = recentlySentRef.current.filter(sent => sent.message !== data.message);
          return;
        }
        setMessages((prev) => [...prev, {
          id: Date.now(), name: data.name, message: data.message, steamId: data.steamId,
          time: data.time || Date.now(), isMe: false
        }].slice(-MAX_MESSAGES));
        if (!isAtBottomRef.current) setNewMessageCount(c => c + 1);
      }
    };
    socketService.on('team:message', handleTeamMessage);
    return () => { socketService.off('team:message', handleTeamMessage); };
  }, [serverId]);

  useEffect(() => { if (isAtBottomRef.current) scrollToBottom(); }, [messages]);

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
      if (messageToSend.length > MAX_MESSAGE_LENGTH) {
        for (let i = 0; i < messageToSend.length; i += MAX_MESSAGE_LENGTH) {
          recentlySentRef.current.push({ message: messageToSend.slice(i, i + MAX_MESSAGE_LENGTH), time: Date.now() });
        }
      } else {
        recentlySentRef.current.push({ message: messageToSend, time: Date.now() });
      }
      setMessages((prev) => [...prev, {
        id: Date.now(), name: '你', message: messageToSend, time: Date.now(), isMe: true
      }].slice(-MAX_MESSAGES));
      setInputMessage('');
    } catch (error) {
      toast.error('发送失败');
    } finally {
      setSending(false);
    }
  };

  return (
    <div className="h-full flex flex-col font-mono">
      {/* 战术标题栏 */}
      <div className="flex items-center justify-between mb-4 border-b border-white/5 pb-2">
        <div className="flex items-center gap-2">
          <FaTerminal className="text-[#cd5241] text-xs" />
          <h2 className="text-xs font-black uppercase tracking-widest text-gray-300">Team_Comm_Terminal</h2>
        </div>
        <button
          onClick={loadChatHistory}
          disabled={loadingHistory}
          className="text-[10px] text-gray-400 hover:text-white flex items-center gap-1 transition-colors uppercase font-bold"
        >
          <FaHistory className={loadingHistory ? 'animate-spin' : ''} />
          {loadingHistory ? 'Syncing...' : 'Sync_History'}
        </button>
      </div>

      {/* 终端消息流 */}
      <div className="flex-1 relative min-h-0 bg-black/20 tactic-border tactic-cut p-1 overflow-hidden">
        <div className="scanline"></div>
        <div
          ref={messagesContainerRef}
          onScroll={handleScroll}
          className="absolute inset-0 overflow-y-auto custom-scrollbar p-4 space-y-2"
        >
          {messages.length === 0 ? (
            <div className="h-full flex flex-col items-center justify-center opacity-20 grayscale">
              <FaComments className="text-4xl mb-4" />
              <div className="text-[10px] tracking-[0.5em] uppercase">No_Data_Packets</div>
            </div>
          ) : (
            messages.map((msg) => (
              <div
                key={msg.id}
                className={`flex flex-col ${msg.isMe ? 'items-end' : 'items-start'} ${msg.isHistory ? 'opacity-40' : ''}`}
              >
                <div className={`flex items-center gap-2 mb-1 text-[10px] ${msg.isMe ? 'flex-row-reverse' : ''}`}>
                  <span className={`font-black uppercase tracking-tighter ${msg.isMe ? 'text-[#cd5241]' : 'text-gray-400'}`}>
                    {msg.isMe ? 'local_user' : msg.name}
                  </span>
                  <span className="text-[9px] text-gray-500 font-mono">
                    [{formatTime(msg.time)}]
                  </span>
                </div>
                <div className={`px-3 py-2 tactic-cut max-w-[90%] border ${msg.isMe
                  ? 'bg-[#cd5241]/10 border-[#cd5241]/30 text-white'
                  : 'bg-white/[0.02] border-white/10 text-gray-300'
                  }`}>
                  <p className="text-xs break-words leading-relaxed whitespace-pre-wrap">{msg.message}</p>
                </div>
              </div>
            ))
          )}
          <div ref={messagesEndRef} />
        </div>

        {/* 滚动到底部按钮 */}
        {showScrollButton && (
          <button
            onClick={scrollToBottom}
            className="absolute bottom-4 right-4 z-10 flex items-center gap-2 px-4 py-1.5 bg-[#cd5241] text-white text-[10px] font-black tactic-cut shadow-lg animate-fade-in uppercase"
          >
            <FaArrowDown /> {newMessageCount > 0 ? `${newMessageCount} New_Packets` : 'Jump_to_Live'}
          </button>
        )}
      </div>

      {/* 终端输入条 */}
      <form onSubmit={handleSendMessage} className="mt-4">
        {isReadOnly && (
          <div className="mb-2 px-3 py-1 bg-red-500/10 border border-red-500/30 text-[10px] text-red-400 font-bold uppercase tracking-widest tactic-cut">
            ⚠️ Connection_Expired: Read_Only_Mode
          </div>
        )}

        <div className="relative">
          <div className="absolute left-3 top-1/2 -translate-y-1/2 text-[#cd5241] text-xs font-bold">{">"}</div>
          <input
            type="text"
            className={`w-full pl-8 pr-20 py-3 bg-black/40 border border-white/10 text-xs text-white placeholder-gray-500 outline-none focus:border-[#cd5241]/50 transition-all tactic-cut ${isReadOnly ? 'opacity-50 cursor-not-allowed' : ''}`}
            placeholder={isReadOnly ? "SYSTEM_LOCKED" : "Enter_Tactical_Comm..."}
            value={inputMessage}
            onChange={(e) => setInputMessage(e.target.value)}
            disabled={sending || isReadOnly}
          />
          <div className="absolute right-3 top-1/2 -translate-y-1/2 flex items-center gap-2">
            <span className={`text-[10px] font-mono ${isMessageTooLong ? 'text-red-500' : 'text-gray-400'}`}>
              {inputMessage.length}
            </span>
            <button
              type="submit"
              disabled={!inputMessage.trim() || sending || isReadOnly}
              className={`text-[#cd5241] hover:text-white transition-colors p-1 ${(!inputMessage.trim() || sending || isReadOnly) ? 'opacity-20 grayscale' : ''}`}
            >
              <FaPaperPlane className="text-xs" />
            </button>
          </div>
        </div>
      </form>
    </div>
  );
}

export default ChatPanel;
