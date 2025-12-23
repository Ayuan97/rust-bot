import { useState, useEffect } from 'react';
import { FaLightbulb, FaPlus, FaTrash, FaSync, FaPowerOff, FaBolt, FaEdit, FaTerminal, FaRobot } from 'react-icons/fa';
import socketService from '../services/socket';
import { getDevices, addDevice as apiAddDevice, deleteDevice as apiDeleteDevice } from '../services/api';
import { useToast } from './Toast';
import { useConfirm } from './ConfirmModal';
import EmptyState from './EmptyState';
import { DeviceListSkeleton } from './Skeleton';
import DeviceEditModal from './DeviceEditModal';

// 自动化模式名称映射
const AUTO_MODE_NAMES = {
  0: null,
  1: '白天开',
  2: '夜晚开',
  3: '始终开',
  4: '始终关',
  7: '在线开',
  8: '在线关'
};

function DeviceControl({ serverId }) {
  const [devices, setDevices] = useState([]);
  const [loading, setLoading] = useState(false);
  const [showAddForm, setShowAddForm] = useState(false);
  const [editingDevice, setEditingDevice] = useState(null);
  const [newDevice, setNewDevice] = useState({
    entityId: '',
    name: '',
    type: 'switch'
  });

  const toast = useToast();
  const confirm = useConfirm();

  useEffect(() => {
    fetchDevices();

    // 监听设备状态变化
    const handleEntityChanged = (data) => {
      if (data.serverId === serverId) {
        setDevices((prev) =>
          prev.map((device) =>
            device.entity_id === data.entityId
              ? { ...device, currentValue: data.value }
              : device
          )
        );
      }
    };

    socketService.on('entity:changed', handleEntityChanged);

    return () => {
      socketService.off('entity:changed', handleEntityChanged);
    };
  }, [serverId]);

  const fetchDevices = async () => {
    setLoading(true);
    try {
      const response = await getDevices(serverId);
      setDevices(response.data.devices);
    } catch (error) {
      console.error('获取设备列表失败:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleAddDevice = async (e) => {
    e.preventDefault();

    if (!newDevice.entityId || !newDevice.name) {
      toast.warning('请填写所有必填字段');
      return;
    }

    try {
      await apiAddDevice(serverId, {
        entityId: parseInt(newDevice.entityId),
        name: newDevice.name,
        type: newDevice.type
      });

      setNewDevice({ entityId: '', name: '', type: 'switch' });
      setShowAddForm(false);
      fetchDevices();
      toast.success('设备添加成功');
    } catch (error) {
      console.error('添加设备失败:', error);
      toast.error('添加失败: ' + error.message);
    }
  };

  const handleDeleteDevice = async (entityId) => {
    const confirmed = await confirm({
      type: 'danger',
      title: '删除设备',
      message: '确定要删除这个设备吗？',
      confirmText: '删除',
      cancelText: '取消'
    });
    if (!confirmed) return;

    try {
      await apiDeleteDevice(serverId, entityId);
      fetchDevices();
      toast.success('设备已删除');
    } catch (error) {
      console.error('删除设备失败:', error);
      toast.error('删除失败: ' + error.message);
    }
  };

  const handleToggleDevice = async (device) => {
    const originalValue = device.currentValue;
    const newValue = !originalValue;

    // 乐观更新：先更新 UI
    setDevices((prev) =>
      prev.map((d) =>
        d.entity_id === device.entity_id
          ? { ...d, currentValue: newValue }
          : d
      )
    );

    try {
      await socketService.controlDevice(serverId, device.entity_id, newValue);
    } catch (error) {
      console.error('控制设备失败:', error);

      // 失败时回滚到原始状态
      setDevices((prev) =>
        prev.map((d) =>
          d.entity_id === device.entity_id
            ? { ...d, currentValue: originalValue }
            : d
        )
      );

      toast.error('控制失败: ' + error.message);
    }
  };

  const handleRefreshDevice = async (device) => {
    try {
      const info = await socketService.getDeviceInfo(serverId, device.entity_id);
      setDevices((prev) =>
        prev.map((d) =>
          d.entity_id === device.entity_id
            ? { ...d, currentValue: info.value }
            : d
        )
      );
    } catch (error) {
      console.error('刷新设备状态失败:', error);
    }
  };

  return (
    <div className="card h-full flex flex-col">
      <div className="flex items-center justify-between mb-2 pb-3 border-b border-rust-gray">
        <div>
          <div className="flex items-center gap-2">
            <FaBolt className="text-rust-orange text-xl" />
            <h2 className="text-xl font-bold">智能设备</h2>
          </div>
          <p className="text-xs text-gray-500 mt-1">远程控制游戏内的开关、灯光、门等设备</p>
        </div>
        <button
          className="btn btn-primary flex items-center gap-2 text-sm"
          onClick={() => setShowAddForm(!showAddForm)}
        >
          <FaPlus />
          添加设备
        </button>
      </div>

      {/* 添加设备表单 */}
      {showAddForm && (
        <form onSubmit={handleAddDevice} className="mb-4 p-4 bg-rust-gray rounded-lg">
          <div className="grid grid-cols-1 gap-3">
            <input
              type="number"
              className="input"
              placeholder="设备 ID (Entity ID)"
              value={newDevice.entityId}
              onChange={(e) =>
                setNewDevice({ ...newDevice, entityId: e.target.value })
              }
              required
            />
            <input
              type="text"
              className="input"
              placeholder="设备名称"
              value={newDevice.name}
              onChange={(e) =>
                setNewDevice({ ...newDevice, name: e.target.value })
              }
              required
            />
            <select
              className="input"
              value={newDevice.type}
              onChange={(e) =>
                setNewDevice({ ...newDevice, type: e.target.value })
              }
            >
              <option value="switch">开关</option>
              <option value="light">灯光</option>
              <option value="door">门</option>
              <option value="alarm">警报</option>
            </select>
            <div className="flex gap-2">
              <button type="submit" className="btn btn-primary flex-1">
                确认添加
              </button>
              <button
                type="button"
                className="btn btn-secondary flex-1"
                onClick={() => setShowAddForm(false)}
              >
                取消
              </button>
            </div>
          </div>
        </form>
      )}

      {/* 设备列表 */}
      <div className="flex-1 overflow-y-auto space-y-2">
        {loading ? (
          <DeviceListSkeleton />
        ) : devices.length === 0 ? (
          <EmptyState type="devices" />
        ) : (
          devices.map((device) => (
            <div
              key={device.id}
              className="p-4 bg-rust-gray rounded-lg flex items-center justify-between"
            >
              <div className="flex items-center gap-3">
                <FaLightbulb
                  className={`text-2xl ${
                    device.currentValue ? 'text-yellow-400' : 'text-gray-500'
                  }`}
                />
                <div>
                  <h3 className="font-semibold">{device.name}</h3>
                  <p className="text-sm text-gray-400">
                    ID: {device.entity_id} · {device.type}
                    {device.command && (
                      <span className="ml-2 text-rust-orange">
                        <FaTerminal className="inline mr-1" />!{device.command}
                      </span>
                    )}
                    {AUTO_MODE_NAMES[device.auto_mode] && (
                      <span className="ml-2 text-green-400">
                        <FaRobot className="inline mr-1" />{AUTO_MODE_NAMES[device.auto_mode]}
                      </span>
                    )}
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-2">
                <button
                  className="btn btn-secondary px-3 py-2"
                  onClick={() => setEditingDevice(device)}
                  title="编辑设备"
                  aria-label={`编辑 ${device.name}`}
                >
                  <FaEdit aria-hidden="true" />
                </button>
                <button
                  className="btn btn-secondary px-3 py-2"
                  onClick={() => handleRefreshDevice(device)}
                  title="刷新状态"
                  aria-label={`刷新 ${device.name} 状态`}
                >
                  <FaSync aria-hidden="true" />
                </button>
                <button
                  className={`btn px-4 py-2 min-w-[100px] ${
                    device.currentValue ? 'btn-primary' : 'btn-secondary'
                  }`}
                  onClick={() => handleToggleDevice(device)}
                  title={device.currentValue ? '点击关闭设备' : '点击开启设备'}
                  aria-label={`${device.name} ${device.currentValue ? '已开启，点击关闭' : '已关闭，点击开启'}`}
                  aria-pressed={device.currentValue}
                >
                  <FaPowerOff className="mr-2" aria-hidden="true" />
                  {device.currentValue ? '已开启' : '已关闭'}
                </button>
                <button
                  className="btn btn-danger px-3 py-2"
                  onClick={() => handleDeleteDevice(device.entity_id)}
                  title="删除设备"
                  aria-label={`删除 ${device.name}`}
                >
                  <FaTrash aria-hidden="true" />
                </button>
              </div>
            </div>
          ))
        )}
      </div>

      {/* 编辑设备模态框 */}
      {editingDevice && (
        <DeviceEditModal
          device={editingDevice}
          serverId={serverId}
          onClose={() => setEditingDevice(null)}
          onSaved={fetchDevices}
        />
      )}
    </div>
  );
}

export default DeviceControl;
