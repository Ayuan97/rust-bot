import React, { useState, useEffect } from 'react';
import { FaPlus, FaEdit, FaTrash, FaSave, FaTimes, FaStar, FaCheck } from 'react-icons/fa';
import api from '../../services/api';

const PlanManager = () => {
  const [plans, setPlans] = useState([]);
  const [loading, setLoading] = useState(true);
  const [editingPlan, setEditingPlan] = useState(null);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [formData, setFormData] = useState({
    code: '',
    name: '',
    price: '',
    duration: '',
    description: '',
    features: [''],
    sortOrder: 0,
    isActive: true,
    highlighted: false
  });

  useEffect(() => {
    fetchPlans();
  }, []);

  const fetchPlans = async () => {
    try {
      const res = await api.get('/admin/plans');
      if (res.data.success) {
        setPlans(res.data.data);
      }
    } catch (err) {
      console.error('获取套餐列表失败:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleCreate = async () => {
    try {
      const data = {
        ...formData,
        price: parseFloat(formData.price),
        duration: parseInt(formData.duration),
        features: formData.features.filter(f => f.trim() !== '')
      };

      const res = await api.post('/admin/plans', data);
      if (res.data.success) {
        setPlans([...plans, res.data.data]);
        setShowCreateModal(false);
        resetForm();
      }
    } catch (err) {
      alert(err.response?.data?.error || '创建失败');
    }
  };

  const handleUpdate = async () => {
    try {
      const data = {
        ...formData,
        price: parseFloat(formData.price),
        duration: parseInt(formData.duration),
        features: formData.features.filter(f => f.trim() !== '')
      };

      const res = await api.put(`/admin/plans/${editingPlan.id}`, data);
      if (res.data.success) {
        setPlans(plans.map(p => p.id === editingPlan.id ? res.data.data : p));
        setEditingPlan(null);
        resetForm();
      }
    } catch (err) {
      alert(err.response?.data?.error || '更新失败');
    }
  };

  const handleDelete = async (plan) => {
    if (!confirm(`确定要删除套餐「${plan.name}」吗？\n\n如果有关联订单，请改为禁用套餐。`)) return;

    try {
      const res = await api.delete(`/admin/plans/${plan.id}`);
      if (res.data.success) {
        setPlans(plans.filter(p => p.id !== plan.id));
      }
    } catch (err) {
      alert(err.response?.data?.error || '删除失败');
    }
  };

  const handleToggleActive = async (plan) => {
    try {
      const res = await api.put(`/admin/plans/${plan.id}`, { isActive: !plan.isActive });
      if (res.data.success) {
        setPlans(plans.map(p => p.id === plan.id ? res.data.data : p));
      }
    } catch (err) {
      alert(err.response?.data?.error || '操作失败');
    }
  };

  const handleInitDefault = async () => {
    if (!confirm('确定要初始化默认套餐吗？\n\n这将创建周卡、半月卡、月卡三个默认套餐。')) return;

    try {
      const res = await api.post('/admin/plans/init');
      if (res.data.success) {
        fetchPlans();
        alert('初始化成功');
      }
    } catch (err) {
      alert(err.response?.data?.error || '初始化失败');
    }
  };

  const startEdit = (plan) => {
    setEditingPlan(plan);
    setFormData({
      code: plan.code,
      name: plan.name,
      price: plan.price.toString(),
      duration: plan.duration.toString(),
      description: plan.description || '',
      features: plan.features?.length > 0 ? plan.features : [''],
      sortOrder: plan.sortOrder,
      isActive: plan.isActive,
      highlighted: plan.highlighted
    });
  };

  const resetForm = () => {
    setFormData({
      code: '',
      name: '',
      price: '',
      duration: '',
      description: '',
      features: [''],
      sortOrder: plans.length,
      isActive: true,
      highlighted: false
    });
  };

  const addFeature = () => {
    setFormData({ ...formData, features: [...formData.features, ''] });
  };

  const updateFeature = (index, value) => {
    const newFeatures = [...formData.features];
    newFeatures[index] = value;
    setFormData({ ...formData, features: newFeatures });
  };

  const removeFeature = (index) => {
    setFormData({
      ...formData,
      features: formData.features.filter((_, i) => i !== index)
    });
  };

  const PlanForm = ({ onSubmit, submitText }) => (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className="block text-xs text-gray-500 mb-1">套餐代码 *</label>
          <input
            type="text"
            value={formData.code}
            onChange={(e) => setFormData({ ...formData, code: e.target.value.toUpperCase() })}
            placeholder="如: WEEKLY"
            className="w-full px-3 py-2 bg-gray-900 border border-gray-700 rounded text-sm focus:border-orange-500 outline-none"
          />
        </div>
        <div>
          <label className="block text-xs text-gray-500 mb-1">显示名称 *</label>
          <input
            type="text"
            value={formData.name}
            onChange={(e) => setFormData({ ...formData, name: e.target.value })}
            placeholder="如: 周卡"
            className="w-full px-3 py-2 bg-gray-900 border border-gray-700 rounded text-sm focus:border-orange-500 outline-none"
          />
        </div>
      </div>

      <div className="grid grid-cols-3 gap-4">
        <div>
          <label className="block text-xs text-gray-500 mb-1">价格 (元) *</label>
          <input
            type="number"
            step="0.01"
            value={formData.price}
            onChange={(e) => setFormData({ ...formData, price: e.target.value })}
            placeholder="9.9"
            className="w-full px-3 py-2 bg-gray-900 border border-gray-700 rounded text-sm focus:border-orange-500 outline-none"
          />
        </div>
        <div>
          <label className="block text-xs text-gray-500 mb-1">时长 (天) *</label>
          <input
            type="number"
            value={formData.duration}
            onChange={(e) => setFormData({ ...formData, duration: e.target.value })}
            placeholder="7"
            className="w-full px-3 py-2 bg-gray-900 border border-gray-700 rounded text-sm focus:border-orange-500 outline-none"
          />
        </div>
        <div>
          <label className="block text-xs text-gray-500 mb-1">排序</label>
          <input
            type="number"
            value={formData.sortOrder}
            onChange={(e) => setFormData({ ...formData, sortOrder: parseInt(e.target.value) || 0 })}
            className="w-full px-3 py-2 bg-gray-900 border border-gray-700 rounded text-sm focus:border-orange-500 outline-none"
          />
        </div>
      </div>

      <div>
        <label className="block text-xs text-gray-500 mb-1">描述</label>
        <input
          type="text"
          value={formData.description}
          onChange={(e) => setFormData({ ...formData, description: e.target.value })}
          placeholder="7天体验套餐"
          className="w-full px-3 py-2 bg-gray-900 border border-gray-700 rounded text-sm focus:border-orange-500 outline-none"
        />
      </div>

      <div>
        <label className="block text-xs text-gray-500 mb-1">功能特性</label>
        {formData.features.map((feature, index) => (
          <div key={index} className="flex gap-2 mb-2">
            <input
              type="text"
              value={feature}
              onChange={(e) => updateFeature(index, e.target.value)}
              placeholder="功能描述..."
              className="flex-1 px-3 py-2 bg-gray-900 border border-gray-700 rounded text-sm focus:border-orange-500 outline-none"
            />
            <button
              onClick={() => removeFeature(index)}
              className="px-3 py-2 bg-red-900/30 text-red-400 rounded hover:bg-red-900/50"
            >
              <FaTimes />
            </button>
          </div>
        ))}
        <button
          onClick={addFeature}
          className="text-xs text-orange-400 hover:text-orange-300"
        >
          + 添加功能
        </button>
      </div>

      <div className="flex gap-6">
        <label className="flex items-center gap-2 cursor-pointer">
          <input
            type="checkbox"
            checked={formData.isActive}
            onChange={(e) => setFormData({ ...formData, isActive: e.target.checked })}
            className="w-4 h-4 accent-orange-500"
          />
          <span className="text-sm">启用套餐</span>
        </label>
        <label className="flex items-center gap-2 cursor-pointer">
          <input
            type="checkbox"
            checked={formData.highlighted}
            onChange={(e) => setFormData({ ...formData, highlighted: e.target.checked })}
            className="w-4 h-4 accent-orange-500"
          />
          <span className="text-sm">推荐标签</span>
        </label>
      </div>

      <div className="flex justify-end gap-2 pt-4 border-t border-gray-700">
        <button
          onClick={() => {
            setEditingPlan(null);
            setShowCreateModal(false);
            resetForm();
          }}
          className="px-4 py-2 bg-gray-700 rounded text-sm hover:bg-gray-600"
        >
          取消
        </button>
        <button
          onClick={onSubmit}
          className="px-4 py-2 bg-orange-600 rounded text-sm hover:bg-orange-700 flex items-center gap-2"
        >
          <FaSave /> {submitText}
        </button>
      </div>
    </div>
  );

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-gray-500">加载中...</div>
      </div>
    );
  }

  return (
    <div className="p-6">
      {/* 头部 */}
      <div className="flex justify-between items-center mb-6">
        <div>
          <h2 className="text-lg font-bold text-gray-100">套餐配置</h2>
          <p className="text-xs text-gray-500 mt-1">管理订阅套餐的价格、时长和功能特性</p>
        </div>
        <div className="flex gap-2">
          {plans.length === 0 && (
            <button
              onClick={handleInitDefault}
              className="px-4 py-2 bg-gray-700 rounded text-sm hover:bg-gray-600"
            >
              初始化默认套餐
            </button>
          )}
          <button
            onClick={() => {
              resetForm();
              setShowCreateModal(true);
            }}
            className="px-4 py-2 bg-orange-600 rounded text-sm hover:bg-orange-700 flex items-center gap-2"
          >
            <FaPlus /> 新建套餐
          </button>
        </div>
      </div>

      {/* 套餐列表 */}
      <div className="grid gap-4">
        {plans.map((plan) => (
          <div
            key={plan.id}
            className={`p-4 rounded border ${
              plan.isActive
                ? plan.highlighted
                  ? 'bg-orange-900/20 border-orange-600/50'
                  : 'bg-gray-800/50 border-gray-700'
                : 'bg-gray-900/50 border-gray-800 opacity-60'
            }`}
          >
            {editingPlan?.id === plan.id ? (
              <PlanForm onSubmit={handleUpdate} submitText="保存修改" />
            ) : (
              <div className="flex justify-between items-start">
                <div className="flex-1">
                  <div className="flex items-center gap-3 mb-2">
                    <span className="text-lg font-bold text-gray-100">{plan.name}</span>
                    <span className="text-xs px-2 py-0.5 bg-gray-700 rounded">{plan.code}</span>
                    {plan.highlighted && (
                      <span className="text-xs px-2 py-0.5 bg-orange-600/30 text-orange-400 rounded flex items-center gap-1">
                        <FaStar className="text-[10px]" /> 推荐
                      </span>
                    )}
                    {!plan.isActive && (
                      <span className="text-xs px-2 py-0.5 bg-red-900/30 text-red-400 rounded">已禁用</span>
                    )}
                  </div>

                  <div className="flex items-baseline gap-4 mb-3">
                    <span className="text-2xl font-bold text-orange-400">¥{plan.price}</span>
                    <span className="text-gray-500">/ {plan.duration} 天</span>
                    {plan.description && (
                      <span className="text-sm text-gray-400">{plan.description}</span>
                    )}
                  </div>

                  {plan.features?.length > 0 && (
                    <div className="flex flex-wrap gap-2">
                      {plan.features.map((feature, i) => (
                        <span key={i} className="text-xs px-2 py-1 bg-gray-700/50 rounded text-gray-400">
                          <FaCheck className="inline mr-1 text-green-500 text-[10px]" />
                          {feature}
                        </span>
                      ))}
                    </div>
                  )}
                </div>

                <div className="flex items-center gap-2">
                  <button
                    onClick={() => handleToggleActive(plan)}
                    className={`px-3 py-1.5 rounded text-xs ${
                      plan.isActive
                        ? 'bg-red-900/30 text-red-400 hover:bg-red-900/50'
                        : 'bg-green-900/30 text-green-400 hover:bg-green-900/50'
                    }`}
                  >
                    {plan.isActive ? '禁用' : '启用'}
                  </button>
                  <button
                    onClick={() => startEdit(plan)}
                    className="px-3 py-1.5 bg-gray-700 rounded text-xs hover:bg-gray-600"
                  >
                    <FaEdit />
                  </button>
                  <button
                    onClick={() => handleDelete(plan)}
                    className="px-3 py-1.5 bg-red-900/30 text-red-400 rounded text-xs hover:bg-red-900/50"
                  >
                    <FaTrash />
                  </button>
                </div>
              </div>
            )}
          </div>
        ))}

        {plans.length === 0 && (
          <div className="text-center py-12 text-gray-500">
            <p>暂无套餐配置</p>
            <p className="text-sm mt-2">点击「初始化默认套餐」创建周卡、半月卡、月卡</p>
          </div>
        )}
      </div>

      {/* 创建弹窗 */}
      {showCreateModal && (
        <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50">
          <div className="bg-[#1a1c20] rounded-lg p-6 w-full max-w-lg border border-gray-700">
            <h3 className="text-lg font-bold mb-4">创建新套餐</h3>
            <PlanForm onSubmit={handleCreate} submitText="创建套餐" />
          </div>
        </div>
      )}
    </div>
  );
};

export default PlanManager;
