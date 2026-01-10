import React, { useState, useEffect } from 'react';
import { 
  FaSearch, FaSync, FaWallet, FaHourglassHalf, FaCircle, 
  FaTerminal, FaEdit, FaCheck, FaTimes, FaPlus, FaMinus, FaUsers
} from 'react-icons/fa';
import api from '../../services/api';
import { useToast } from '../Toast';

const SurvivorRoster = () => {
  const toast = useToast();
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedUser, setSelectedUser] = useState(null);
  const [isAdjustModalOpen, setIsAdjustModalOpen] = useState(false);

  // 调整表单状态
  const [balanceDelta, setBalanceDelta] = useState(0);
  const [daysDelta, setDaysDelta] = useState(0);
  const [adjustReason, setAdjustReason] = useState('');

  useEffect(() => {
    fetchUsers();
  }, []);

  const fetchUsers = async () => {
    setLoading(true);
    try {
      const res = await api.get('/admin/users');
      if (res.data.success) {
        setUsers(res.data.data.users);
      }
    } catch (err) {
      toast.error('加载幸存者列表失败');
    } finally {
      setLoading(false);
    }
  };

  const handleAdjustAssets = async () => {
    if (!selectedUser) return;
    
    try {
      const res = await api.put(`/admin/users/${selectedUser.id}/adjust`, {
        balanceDelta: parseFloat(balanceDelta),
        daysDelta: parseInt(daysDelta),
        reason: adjustReason
      });

      if (res.data.success) {
        toast.success('资产调整成功');
        setIsAdjustModalOpen(false);
        fetchUsers();
        // 重置表单
        setBalanceDelta(0);
        setDaysDelta(0);
        setAdjustReason('');
      }
    } catch (err) {
      toast.error('资产调整失败');
    }
  };

  const getStatusColor = (user) => {
    if (!user.isActive) return 'text-red-500';
    if (user.serviceStatus?.isServiceRunning) return 'text-green-500';
    return 'text-gray-500';
  };

  const filteredUsers = users.filter(u => 
    u.username.toLowerCase().includes(searchTerm.toLowerCase()) || 
    u.id.includes(searchTerm)
  );

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <h2 className="text-xl font-bold flex items-center gap-2">
          <FaUsers className="text-orange-500" />
          幸存者名录
        </h2>
        
        <div className="flex gap-4">
          <div className="relative">
            <FaSearch className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500" />
            <input 
              type="text"
              placeholder="搜索 UID / 用户名..."
              className="bg-[#1A1C1F] border border-gray-800 rounded px-10 py-2 text-sm focus:border-orange-500 outline-none w-64 transition-all"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
            />
          </div>
          <button 
            onClick={fetchUsers}
            className="p-2 bg-gray-800 hover:bg-gray-700 rounded transition-colors"
          >
            <FaSync className={loading ? 'animate-spin' : ''} />
          </button>
        </div>
      </div>

      <div className="bg-[#121417] border border-gray-800 rounded-lg overflow-hidden tactic-cut">
        <table className="w-full text-left text-sm">
          <thead className="bg-[#1A1C1F] text-gray-500 font-bold uppercase tracking-wider text-[11px] border-b border-gray-800">
            <tr>
              <th className="px-6 py-4">幸存者 (Survivor)</th>
              <th className="px-6 py-4">物资余额 (Bal)</th>
              <th className="px-6 py-4">蓝图期限 (Expiry)</th>
              <th className="px-6 py-4">链路状态 (FCM/R+)</th>
              <th className="px-6 py-4">预估负载 (RAM)</th>
              <th className="px-6 py-4 text-right">操作 (Action)</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-800/50">
            {filteredUsers.map(user => (
              <tr key={user.id} className="hover:bg-white/5 transition-colors group">
                <td className="px-6 py-4">
                  <div className="flex flex-col">
                    <span className="font-bold text-gray-200">{user.username}</span>
                    <span className="text-[10px] text-gray-600 font-mono">{user.id}</span>
                  </div>
                </td>
                <td className="px-6 py-4">
                  <div className="flex items-center gap-2 text-orange-400">
                    <FaWallet className="text-[10px]" />
                    <span className="font-mono">¥ {parseFloat(user.balance).toFixed(2)}</span>
                  </div>
                </td>
                <td className="px-6 py-4">
                  <div className="flex items-center gap-2">
                    <FaHourglassHalf className="text-gray-500 text-[10px]" />
                    <span className={`font-mono ${
                      new Date(user.subscriptions?.endDate) < new Date() ? 'text-red-500/70' : 'text-gray-400'
                    }`}>
                      {user.subscriptions?.endDate ? new Date(user.subscriptions.endDate).toLocaleDateString() : 'N/A'}
                    </span>
                  </div>
                </td>
                <td className="px-6 py-4">
                  <div className="flex items-center gap-3">
                    <div className="flex items-center gap-1">
                      <FaCircle className={`text-[8px] ${user.serviceStatus?.fcmListening ? 'text-green-500 shadow-[0_0_5px_#22c55e]' : 'text-gray-700'}`} />
                      <span className="text-[10px] text-gray-600 uppercase">FCM</span>
                    </div>
                    <div className="flex items-center gap-1">
                      <FaCircle className={`text-[8px] ${user.serviceStatus?.connectedServers?.length > 0 ? 'text-green-500 shadow-[0_0_5px_#22c55e]' : 'text-gray-700'}`} />
                      <span className="text-[10px] text-gray-600 uppercase">R+ ({user.serviceStatus?.connectedServers?.length}/{user.serverCount})</span>
                    </div>
                  </div>
                </td>
                <td className="px-6 py-4">
                  <span className="font-mono text-gray-500">{user.serviceStatus?.ramUsage || 0} MB</span>
                </td>
                <td className="px-6 py-4 text-right">
                  <div className="flex justify-end gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                    <button 
                      onClick={() => {
                        setSelectedUser(user);
                        setIsAdjustModalOpen(true);
                      }}
                      className="p-2 bg-gray-800 hover:bg-orange-500/20 hover:text-orange-500 rounded transition-all"
                      title="资产调整"
                    >
                      <FaEdit />
                    </button>
                    <button 
                      className="p-2 bg-gray-800 hover:bg-blue-500/20 hover:text-blue-500 rounded transition-all"
                      title="实时诊断"
                    >
                      <FaTerminal />
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        
        {filteredUsers.length === 0 && (
          <div className="py-20 text-center">
            <p className="text-gray-600">未发现幸存者信号...</p>
          </div>
        )}
      </div>

      {/* 资产调整弹窗 */}
      {isAdjustModalOpen && selectedUser && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm">
          <div className="bg-[#121417] border border-gray-800 rounded-lg w-full max-w-md overflow-hidden tactic-cut tactic-border animate-in fade-in zoom-in duration-200">
            <div className="px-6 py-4 border-b border-gray-800 flex justify-between items-center bg-[#1A1C1F]">
              <h3 className="font-bold text-gray-100 flex items-center gap-2">
                <FaEdit className="text-orange-500" />
                资产调整: {selectedUser.username}
              </h3>
              <button onClick={() => setIsAdjustModalOpen(false)} className="text-gray-500 hover:text-white">
                <FaTimes />
              </button>
            </div>
            
            <div className="p-6 space-y-6">
              {/* 余额调整 */}
              <div className="space-y-2">
                <label className="text-[10px] font-bold text-gray-500 uppercase tracking-widest">物资余额调整 (¥)</label>
                <div className="flex items-center gap-4">
                  <div className="flex-1 flex items-center bg-[#0D0E10] border border-gray-800 rounded overflow-hidden">
                    <button 
                      onClick={() => setBalanceDelta(d => d - 10)}
                      className="px-4 py-2 hover:bg-gray-800 text-gray-400"
                    >
                      <FaMinus className="text-xs" />
                    </button>
                    <input 
                      type="number" 
                      value={balanceDelta}
                      onChange={(e) => setBalanceDelta(e.target.value)}
                      className="flex-1 bg-transparent text-center font-mono text-orange-400 focus:outline-none"
                    />
                    <button 
                      onClick={() => setBalanceDelta(d => d + 10)}
                      className="px-4 py-2 hover:bg-gray-800 text-gray-400"
                    >
                      <FaPlus className="text-xs" />
                    </button>
                  </div>
                  <span className="text-[10px] text-gray-600 font-mono">当前: ¥{parseFloat(selectedUser.balance).toFixed(2)}</span>
                </div>
              </div>

              {/* 授权天数调整 */}
              <div className="space-y-2">
                <label className="text-[10px] font-bold text-gray-500 uppercase tracking-widest">蓝图授权调整 (天)</label>
                <div className="flex items-center gap-4">
                  <div className="flex-1 flex items-center bg-[#0D0E10] border border-gray-800 rounded overflow-hidden">
                    <button 
                      onClick={() => setDaysDelta(d => d - 7)}
                      className="px-4 py-2 hover:bg-gray-800 text-gray-400"
                    >
                      <FaMinus className="text-xs" />
                    </button>
                    <input 
                      type="number" 
                      value={daysDelta}
                      onChange={(e) => setDaysDelta(e.target.value)}
                      className="flex-1 bg-transparent text-center font-mono text-blue-400 focus:outline-none"
                    />
                    <button 
                      onClick={() => setDaysDelta(d => d + 7)}
                      className="px-4 py-2 hover:bg-gray-800 text-gray-400"
                    >
                      <FaPlus className="text-xs" />
                    </button>
                  </div>
                  <span className="text-[10px] text-gray-600 font-mono">基准: 今日/当前到期日</span>
                </div>
              </div>

              {/* 备注 */}
              <div className="space-y-2">
                <label className="text-[10px] font-bold text-gray-500 uppercase tracking-widest">调整备注 (记录于 Admin_Log)</label>
                <textarea 
                  value={adjustReason}
                  onChange={(e) => setAdjustReason(e.target.value)}
                  placeholder="请输入调整原因，如：补发、测试、补偿等..."
                  className="w-full bg-[#0D0E10] border border-gray-800 rounded p-3 text-sm focus:border-orange-500 outline-none h-20 resize-none"
                />
              </div>

              <div className="flex gap-4 pt-2">
                <button 
                  onClick={() => setIsAdjustModalOpen(false)}
                  className="flex-1 py-3 border border-gray-800 hover:bg-gray-800 rounded font-bold text-xs uppercase tracking-widest transition-all"
                >
                  取消 Abort
                </button>
                <button 
                  onClick={handleAdjustAssets}
                  className="flex-1 py-3 bg-orange-600 hover:bg-orange-500 text-white rounded font-bold text-xs uppercase tracking-widest transition-all shadow-[0_0_15px_rgba(234,88,12,0.3)]"
                >
                  确认 Apply
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default SurvivorRoster;

