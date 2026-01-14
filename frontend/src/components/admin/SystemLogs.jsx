import React, { useState, useEffect, useRef } from 'react';
import {
  FaTerminal, FaSync, FaTrashAlt, FaDownload, FaCircle,
  FaSearch, FaFilter, FaTimes
} from 'react-icons/fa';
import api from '../../services/api';
import { useToast } from '../Toast';

const SystemLogs = ({ preselectedUserId, onUserSelected }) => {
  const toast = useToast();
  const [users, setUsers] = useState([]);
  const [selectedUserId, setSelectedUserId] = useState('');
  const [logs, setLogs] = useState([]);
  const [filteredLogs, setFilteredLogs] = useState([]);
  const [loading, setLoading] = useState(false);
  const [isAutoScroll, setIsAutoScroll] = useState(true);
  const logEndRef = useRef(null);

  // 筛选状态
  const [searchTerm, setSearchTerm] = useState('');
  const [levelFilter, setLevelFilter] = useState('');
  const [moduleFilter, setModuleFilter] = useState('');

  useEffect(() => {
    fetchActiveUsers();
  }, []);

  // 处理预选用户
  useEffect(() => {
    if (preselectedUserId && users.length > 0) {
      const userExists = users.find(u => u.id === preselectedUserId);
      if (userExists) {
        setSelectedUserId(preselectedUserId);
        if (onUserSelected) onUserSelected();
      }
    }
  }, [preselectedUserId, users]);

  useEffect(() => {
    let interval;
    if (selectedUserId) {
      fetchLogs();
      interval = setInterval(fetchLogs, 3000);
    } else {
      setLogs([]);
      setFilteredLogs([]);
    }
    return () => clearInterval(interval);
  }, [selectedUserId]);

  // 日志筛选
  useEffect(() => {
    let result = logs;

    if (searchTerm) {
      result = result.filter(log =>
        log.message.toLowerCase().includes(searchTerm.toLowerCase())
      );
    }

    if (levelFilter) {
      result = result.filter(log => log.level === levelFilter);
    }

    if (moduleFilter) {
      result = result.filter(log => log.module === moduleFilter);
    }

    setFilteredLogs(result);
  }, [logs, searchTerm, levelFilter, moduleFilter]);

  useEffect(() => {
    if (isAutoScroll && logEndRef.current) {
      logEndRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [filteredLogs]);

  const fetchActiveUsers = async () => {
    try {
      const res = await api.get('/admin/users');
      if (res.data.success) {
        setUsers(res.data.data.users.filter(u => u.serviceStatus?.isServiceRunning));
      }
    } catch (err) {
      toast.error('获取活跃幸存者失败');
    }
  };

  const fetchLogs = async () => {
    if (!selectedUserId) return;
    try {
      const res = await api.get(`/admin/users/${selectedUserId}/logs`);
      if (res.data.success) {
        setLogs(res.data.data);
      }
    } catch (err) {
      console.error('获取日志失败', err);
    }
  };

  // 导出日志
  const handleExportLogs = () => {
    if (filteredLogs.length === 0) {
      toast.info('没有可导出的日志');
      return;
    }

    const selectedUser = users.find(u => u.id === selectedUserId);
    const content = filteredLogs.map(log =>
      `[${new Date(log.timestamp).toLocaleString()}] [${log.module}] [${log.level}] ${log.message}`
    ).join('\n');

    const blob = new Blob([content], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `logs_${selectedUser?.username || selectedUserId}_${new Date().toISOString().split('T')[0]}.txt`;
    link.click();
    URL.revokeObjectURL(url);

    toast.success('日志已导出');
  };

  // 清除筛选
  const handleClearFilters = () => {
    setSearchTerm('');
    setLevelFilter('');
    setModuleFilter('');
  };

  const getLevelColor = (level) => {
    switch (level) {
      case 'ERROR': return 'text-red-500';
      case 'WARN': return 'text-yellow-500';
      case 'SUCCESS': return 'text-green-500';
      default: return 'text-blue-400';
    }
  };

  const getModuleBg = (module) => {
    switch (module) {
      case 'RUST+': return 'bg-orange-600/20 text-orange-500';
      case 'FCM': return 'bg-blue-600/20 text-blue-500';
      case 'CHAT': return 'bg-purple-600/20 text-purple-500';
      case 'SYSTEM': return 'bg-gray-600/20 text-gray-500';
      case 'EVENT': return 'bg-green-600/20 text-green-500';
      case 'AUTO': return 'bg-cyan-600/20 text-cyan-500';
      default: return 'bg-white/10 text-gray-400';
    }
  };

  // 获取可用的模块列表
  const availableModules = [...new Set(logs.map(log => log.module))].filter(Boolean);

  return (
    <div className="flex flex-col h-[calc(100vh-160px)] space-y-4">
      <div className="flex justify-between items-center shrink-0">
        <h2 className="text-xl font-bold flex items-center gap-2">
          <FaTerminal className="text-orange-500" />
          系统诊断控制台
        </h2>

        <div className="flex gap-3">
          {/* 用户选择 */}
          <div className="flex items-center gap-2 bg-[#121417] border border-gray-800 rounded px-3 py-1">
            <span className="text-[10px] font-bold text-gray-500 uppercase">监听对象:</span>
            <select
              value={selectedUserId}
              onChange={(e) => setSelectedUserId(e.target.value)}
              className="bg-transparent text-gray-200 text-sm focus:outline-none py-1 min-w-[150px] font-mono cursor-pointer"
            >
              <option value="">-- 选择活跃幸存者 --</option>
              {users.map(u => (
                <option key={u.id} value={u.id}>{u.username} ({u.id.substring(0, 8)}...)</option>
              ))}
            </select>
          </div>

          {/* 导出按钮 */}
          <button
            onClick={handleExportLogs}
            disabled={filteredLogs.length === 0}
            className="p-2 bg-gray-800 hover:bg-gray-700 rounded transition-colors text-gray-400 disabled:opacity-50"
            title="导出日志"
          >
            <FaDownload />
          </button>

          {/* 刷新按钮 */}
          <button
            onClick={() => { setLogs([]); fetchActiveUsers(); }}
            className="p-2 bg-gray-800 hover:bg-gray-700 rounded transition-colors text-gray-400"
            title="刷新"
          >
            <FaSync />
          </button>
        </div>
      </div>

      {/* 筛选栏 */}
      {selectedUserId && (
        <div className="flex gap-3 items-center bg-[#121417] border border-gray-800 rounded-lg p-3 shrink-0">
          {/* 搜索 */}
          <div className="relative flex-1">
            <FaSearch className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-600 text-xs" />
            <input
              type="text"
              placeholder="搜索日志内容..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full bg-[#0D0E10] border border-gray-800 rounded px-8 py-1.5 text-xs focus:border-orange-500 outline-none"
            />
          </div>

          {/* 级别筛选 */}
          <select
            value={levelFilter}
            onChange={(e) => setLevelFilter(e.target.value)}
            className="bg-[#0D0E10] border border-gray-800 rounded px-3 py-1.5 text-xs focus:border-orange-500 outline-none cursor-pointer"
          >
            <option value="">全部级别</option>
            <option value="INFO">INFO</option>
            <option value="SUCCESS">SUCCESS</option>
            <option value="WARN">WARN</option>
            <option value="ERROR">ERROR</option>
          </select>

          {/* 模块筛选 */}
          <select
            value={moduleFilter}
            onChange={(e) => setModuleFilter(e.target.value)}
            className="bg-[#0D0E10] border border-gray-800 rounded px-3 py-1.5 text-xs focus:border-orange-500 outline-none cursor-pointer"
          >
            <option value="">全部模块</option>
            {availableModules.map(mod => (
              <option key={mod} value={mod}>{mod}</option>
            ))}
          </select>

          {/* 清除筛选 */}
          {(searchTerm || levelFilter || moduleFilter) && (
            <button
              onClick={handleClearFilters}
              className="p-1.5 bg-gray-800 hover:bg-red-500/20 hover:text-red-400 rounded transition-all"
              title="清除筛选"
            >
              <FaTimes className="text-xs" />
            </button>
          )}

          {/* 显示筛选结果数量 */}
          <span className="text-[10px] text-gray-600 font-mono">
            {filteredLogs.length}/{logs.length}
          </span>
        </div>
      )}

      <div className="flex-1 bg-[#050505] border border-gray-800 rounded-lg overflow-hidden flex flex-col relative shadow-inner">
        {/* 终端头部状态 */}
        <div className="px-4 py-2 bg-[#1A1C1F] border-b border-gray-800 flex justify-between items-center text-[10px] font-mono tracking-widest uppercase">
          <div className="flex items-center gap-4">
            <div className="flex items-center gap-2">
              <FaCircle className={selectedUserId ? 'text-green-500 animate-pulse' : 'text-gray-700'} />
              <span className={selectedUserId ? 'text-green-500' : 'text-gray-600'}>
                {selectedUserId ? 'Log_Stream_Active' : 'Awaiting_Target...'}
              </span>
            </div>
            {selectedUserId && <span className="text-gray-500">Buffer: {logs.length}/{200}</span>}
          </div>
          <div className="flex items-center gap-4">
            <button
              onClick={() => setIsAutoScroll(!isAutoScroll)}
              className={`hover:text-white transition-colors ${isAutoScroll ? 'text-orange-500' : 'text-gray-600'}`}
            >
              [ Auto_Scroll: {isAutoScroll ? 'ON' : 'OFF'} ]
            </button>
            <span className="text-gray-700">ConVars_v1.0.4</span>
          </div>
        </div>

        {/* 日志内容区 */}
        <div className="flex-1 overflow-auto p-4 font-mono text-xs space-y-1 scrollbar-thin scrollbar-thumb-gray-800">
          {!selectedUserId ? (
            <div className="h-full flex flex-col items-center justify-center text-gray-700 space-y-4">
              <FaTerminal size={48} className="opacity-10" />
              <div className="text-center">
                <p>未选择监听对象</p>
                <p className="text-[10px] mt-1 text-gray-800">Please_Select_A_Survivor_To_Start_Diagnostics</p>
              </div>
            </div>
          ) : filteredLogs.length === 0 ? (
            <div className="text-gray-600 italic">
              {logs.length === 0
                ? '正在扫描缓冲区，等待初始数据信号...'
                : '没有匹配的日志记录'}
            </div>
          ) : (
            filteredLogs.map((log, i) => (
              <div key={i} className="flex gap-4 hover:bg-white/5 py-0.5 px-2 rounded transition-colors group">
                <span className="text-gray-700 shrink-0">[{new Date(log.timestamp).toLocaleTimeString()}]</span>
                <span className={`px-1.5 rounded-sm text-[9px] font-bold shrink-0 h-4 flex items-center ${getModuleBg(log.module)}`}>
                  {log.module}
                </span>
                <span className={`px-1 rounded-sm text-[9px] font-bold shrink-0 ${getLevelColor(log.level)}`}>
                  {log.level}
                </span>
                <span className={`${getLevelColor(log.level)} break-all`}>
                  {log.message}
                </span>
              </div>
            ))
          )}
          <div ref={logEndRef} />
        </div>

        {/* 终端底部命令行提示符 */}
        <div className="px-4 py-2 border-t border-gray-900 bg-black/50 text-[10px] font-mono text-gray-600 flex items-center gap-2">
          <span className="text-orange-500 font-bold tracking-tighter">ADMIN@TC_HUB:~$</span>
          <span className="animate-pulse">_</span>
        </div>
      </div>
    </div>
  );
};

export default SystemLogs;
