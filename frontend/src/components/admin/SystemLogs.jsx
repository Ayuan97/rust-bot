import React, { useState, useEffect, useMemo, useRef } from 'react';
import {
  FaTerminal, FaSync, FaDownload,
  FaSearch, FaTimes
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
  const [fetchError, setFetchError] = useState('');
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
      setLoading(true);
      const res = await api.get(`/admin/users/${selectedUserId}/logs`);
      if (res.data.success) {
        setLogs(res.data.data);
        setFetchError('');
      }
    } catch (err) {
      const message = err.response?.data?.error || '获取日志失败';
      setFetchError(message);
      console.error('获取日志失败', err);
    } finally {
      setLoading(false);
    }
  };

  // 导出日志
  const handleExportLogs = () => {
    if (filteredLogs.length === 0) {
      toast.info('没有可导出的日志');
      return;
    }

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

  // 级别色收敛：error/warn=hazard 红，success/online=terminal 单点，info/普通=fg-dim
  const getLevelColor = (level) => {
    switch (level) {
      case 'ERROR': return 'text-hazard-bright';
      case 'WARN': return 'text-hazard';
      case 'SUCCESS': return 'text-terminal';
      default: return 'text-fg-dim';
    }
  };

  // 模块标签统一中性发丝线底，不引入多色
  const getModuleBg = (module) => 'bg-ink-700 text-fg-dim border border-ink-line';

  // 获取可用的模块列表
  const availableModules = [...new Set(logs.map(log => log.module))].filter(Boolean);
  const selectedUser = useMemo(
    () => users.find((user) => user.id === selectedUserId),
    [users, selectedUserId]
  );
  const levelSummary = useMemo(() => {
    const bucket = { INFO: 0, SUCCESS: 0, WARN: 0, ERROR: 0 };
    logs.forEach((log) => {
      const level = log.level || 'INFO';
      if (bucket[level] !== undefined) {
        bucket[level] += 1;
      }
    });
    return bucket;
  }, [logs]);

  return (
    <div className="flex flex-col h-full min-h-[620px] space-y-4">
      <div className="flex flex-col gap-3 md:flex-row md:justify-between md:items-center shrink-0">
        <div className="min-w-0">
          <div className="tac-label flex items-center gap-2">
            <FaTerminal className="text-hazard" /> 系统诊断 // DIAGNOSTICS
          </div>
          <h2 className="text-xl font-extrabold text-fg mt-1">系统诊断控制台</h2>
          <p className="text-xs text-fg-dim mt-1">
            {selectedUser ? `当前监听：${selectedUser.username}` : '请先选择活跃用户开始诊断'}
          </p>
        </div>

        <div className="flex flex-wrap gap-2 md:justify-end">
          {/* 用户选择 */}
          <div className="flex items-center gap-2 bg-ink-700 border border-ink-line px-3 py-1">
            <span className="tac-label !text-[10px]">TARGET</span>
            <select
              value={selectedUserId}
              onChange={(e) => setSelectedUserId(e.target.value)}
              className="bg-transparent text-fg text-sm focus:outline-none py-1 min-w-[150px] font-mono tabular-nums cursor-pointer"
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
            className="tac-btn tac-btn-ghost !px-3"
            title="导出日志"
            aria-label="导出日志"
          >
            <FaDownload />
          </button>

          {/* 刷新按钮 */}
          <button
            onClick={() => { fetchActiveUsers(); fetchLogs(); }}
            className="tac-btn tac-btn-ghost !px-3"
            title="刷新"
            aria-label="刷新"
          >
            <FaSync className={loading ? 'animate-spin' : ''} />
          </button>
        </div>
      </div>

      {/* 筛选栏 */}
      {selectedUserId && (
        <div className="tac-panel p-3 shrink-0 space-y-3">
          <div className="flex flex-wrap gap-3 items-center">
          {/* 搜索 */}
          <div className="relative flex-1 min-w-[220px]">
            <FaSearch className="absolute left-3 top-1/2 -translate-y-1/2 text-fg-mute text-xs z-10" />
            <input
              type="text"
              placeholder="搜索日志内容..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="tac-input w-full !pl-8 !py-1.5 text-xs"
            />
          </div>

          {/* 级别筛选 */}
          <select
            value={levelFilter}
            onChange={(e) => setLevelFilter(e.target.value)}
            className="tac-input !py-1.5 text-xs cursor-pointer min-w-[110px]"
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
            className="tac-input !py-1.5 text-xs cursor-pointer min-w-[120px]"
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
              className="tac-btn tac-btn-ghost !p-1.5"
              title="清除筛选"
              aria-label="清除筛选"
            >
              <FaTimes className="text-xs" />
            </button>
          )}

          {/* 显示筛选结果数量 */}
          <span className="text-[10px] text-fg-mute font-mono tabular-nums">
            {filteredLogs.length}/{logs.length}
          </span>
        </div>
          <div className="flex flex-wrap gap-2">
            {[
              { key: 'ERROR', label: '错误' },
              { key: 'WARN', label: '告警' },
              { key: 'SUCCESS', label: '成功' },
              { key: 'INFO', label: '信息' }
            ].map((item) => (
              <button
                key={item.key}
                type="button"
                onClick={() => setLevelFilter((prev) => (prev === item.key ? '' : item.key))}
                className={`px-2.5 py-1 border text-[11px] transition-colors ${
                  levelFilter === item.key
                    ? 'text-fg border-hazard/40 bg-hazard-dim'
                    : 'text-fg-dim border-ink-line bg-ink-800 hover:bg-ink-700'
                }`}
              >
                {item.label} <span className="font-mono tabular-nums">{levelSummary[item.key]}</span>
              </button>
            ))}
          </div>
        </div>
      )}

      {fetchError && (
        <div className="px-3 py-2 bg-hazard-dim border border-hazard/40 text-fg text-xs flex items-start gap-2 shrink-0">
          <span className="font-mono text-hazard-bright text-xs shrink-0">[ERR]</span>
          <span>{fetchError}</span>
        </div>
      )}

      <div className="flex-1 bg-ink-900 border border-ink-line overflow-hidden flex flex-col relative">
        {/* 终端头部状态 */}
        <div className="px-4 py-2 bg-ink-800 border-b border-ink-line flex justify-between items-center text-[10px] font-mono uppercase tracking-[0.18em]">
          <div className="flex items-center gap-4">
            <div className="flex items-center gap-2">
              <span className={`w-1.5 h-1.5 ${selectedUserId ? 'bg-terminal animate-tac-blink' : 'bg-fg-mute'}`} />
              <span className={selectedUserId ? 'text-terminal' : 'text-fg-mute'}>
                {selectedUserId ? 'LOG_STREAM_ACTIVE' : 'AWAITING_TARGET...'}
              </span>
            </div>
            {selectedUserId && (
              <span className="text-fg-dim tabular-nums">
                BUFFER {logs.length}/{200} · {loading ? '同步中' : '实时'}
              </span>
            )}
          </div>
          <div className="flex items-center gap-4">
            <button
              onClick={() => setIsAutoScroll(!isAutoScroll)}
              className={`hover:text-fg transition-colors ${isAutoScroll ? 'text-hazard' : 'text-fg-mute'}`}
            >
              [ AUTO_SCROLL: {isAutoScroll ? 'ON' : 'OFF'} ]
            </button>
            <span className="text-fg-mute hidden sm:inline">CONVARS_V1.0.4</span>
          </div>
        </div>

        {/* 日志内容区 */}
        <div className="flex-1 overflow-auto p-4 font-mono text-xs space-y-1 scrollbar-thin scrollbar-thumb-ink-700">
          {!selectedUserId ? (
            <div className="h-full flex flex-col items-center justify-center text-fg-mute space-y-4">
              <FaTerminal size={48} className="opacity-10" />
              <div className="text-center">
                <p>未选择监听对象</p>
                <p className="tac-label !text-[10px] mt-2">SELECT A SURVIVOR TO START</p>
              </div>
            </div>
          ) : filteredLogs.length === 0 ? (
            <div className="text-fg-dim">
              {logs.length === 0
                ? '正在扫描缓冲区，等待初始数据信号...'
                : '没有匹配的日志记录'}
            </div>
          ) : (
            filteredLogs.map((log, i) => (
              <div key={i} className="flex gap-4 hover:bg-ink-800 py-0.5 px-2 transition-colors group">
                <span className="text-fg-mute shrink-0 tabular-nums">[{new Date(log.timestamp).toLocaleTimeString()}]</span>
                <span className={`px-1.5 text-[9px] font-bold shrink-0 h-4 flex items-center ${getModuleBg(log.module)}`}>
                  {log.module}
                </span>
                <span className={`px-1 text-[9px] font-bold shrink-0 ${getLevelColor(log.level)}`}>
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
        <div className="px-4 py-2 border-t border-ink-line bg-ink-850 text-[10px] font-mono text-fg-mute flex items-center gap-2">
          <span className="text-hazard font-bold">ADMIN@TC_HUB:~$</span>
          <span className="animate-tac-blink">_</span>
        </div>
      </div>
    </div>
  );
};

export default SystemLogs;
