import { useState, useEffect } from 'react';
import { FaLightbulb, FaPlus, FaTrash, FaSync, FaPowerOff, FaBolt } from 'react-icons/fa';
import socketService from '../services/socket';
import { getDevices, addDevice as apiAddDevice, deleteDevice as apiDeleteDevice } from '../services/api';

function DeviceControl({ serverId }) {
  const [devices, setDevices] = useState([]);
  const [loading, setLoading] = useState(false);
  const [showAddForm, setShowAddForm] = useState(false);
  const [newDevice, setNewDevice] = useState({
    entityId: '',
    name: '',
    type: 'switch'
  });

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
      alert('请填写所有必填字段');
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
    } catch (error) {
      console.error('添加设备失败:', error);
      alert('添加失败: ' + error.message);
    }
  };

  const handleDeleteDevice = async (entityId) => {
    if (!confirm('确定要删除这个设备吗?')) return;

    try {
      await apiDeleteDevice(serverId, entityId);
      fetchDevices();
    } catch (error) {
      console.error('删除设备失败:', error);
      alert('删除失败: ' + error.message);
    }
  };

  const handleToggleDevice = async (device) => {
    try {
      const newValue = !device.currentValue;
      await socketService.controlDevice(serverId, device.entity_id, newValue);

      // 立即更新 UI
      setDevices((prev) =>
        prev.map((d) =>
          d.entity_id === device.entity_id
            ? { ...d, currentValue: newValue }
            : d
        )
      );
    } catch (error) {
      console.error('控制设备失败:', error);
      alert('控制失败: ' + error.message);
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
      <div className="flex items-center justify-between mb-4 pb-3 border-b border-rust-gray">
        <div className="flex items-center gap-2">
          <FaBolt className="text-rust-orange text-xl" />
          <h2 className="text-xl font-bold">智能设备</h2>
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
          <div className="text-center text-gray-400 py-8">加载中...</div>
        ) : devices.length === 0 ? (
          <div className="text-center text-gray-400 py-8">
            暂无设备，点击上方按钮添加
          </div>
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
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-2">
                <button
                  className="btn btn-secondary px-3 py-2"
                  onClick={() => handleRefreshDevice(device)}
                  title="刷新状态"
                >
                  <FaSync />
                </button>
                <button
                  className={`btn px-4 py-2 ${
                    device.currentValue ? 'btn-primary' : 'btn-secondary'
                  }`}
                  onClick={() => handleToggleDevice(device)}
                >
                  <FaPowerOff className="mr-2" />
                  {device.currentValue ? '开启' : '关闭'}
                </button>
                <button
                  className="btn btn-danger px-3 py-2"
                  onClick={() => handleDeleteDevice(device.entity_id)}
                >
                  <FaTrash />
                </button>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}

export default DeviceControl;
