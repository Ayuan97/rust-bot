import React, { useState, useEffect } from 'react';
import { FaPlus, FaEdit, FaTrash, FaSave, FaTimes, FaStar, FaCheck, FaBoxOpen } from 'react-icons/fa';
import api from '../../services/api';
import { useToast } from '../Toast';
import { useConfirm } from '../ConfirmModal';

const PlanManager = () => {
  const toast = useToast();
  const confirm = useConfirm();
  const [plans, setPlans] = useState([]);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
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
      toast.error('获取套餐列表失败');
    } finally {
      setLoading(false);
    }
  };

  const validateForm = () => {
    if (!formData.code.trim()) return '请输入套餐代码';
    if (!formData.name.trim()) return '请输入套餐名称';
    const price = Number.parseFloat(formData.price);
    if (Number.isNaN(price) || price < 0) return '请输入有效的价格';
    const duration = Number.parseInt(formData.duration, 10);
    if (Number.isNaN(duration) || duration <= 0) return '套餐时长必须大于 0';
    if (formData.features.every((feature) => !feature.trim())) return '请至少填写一条功能特性';
    return '';
  };

  const buildPayload = () => ({
    ...formData,
    code: formData.code.trim().toUpperCase(),
    name: formData.name.trim(),
    description: formData.description.trim(),
    price: Number.parseFloat(formData.price),
    duration: Number.parseInt(formData.duration, 10),
    sortOrder: Number.parseInt(formData.sortOrder, 10) || 0,
    features: formData.features.map((feature) => feature.trim()).filter(Boolean)
  });

  const closeFormModal = () => {
    setEditingPlan(null);
    setShowCreateModal(false);
    resetForm();
  };

  const handleCreate = async () => {
    const error = validateForm();
    if (error) {
      toast.error(error);
      return;
    }

    try {
      setSubmitting(true);
      const data = buildPayload();
      const res = await api.post('/admin/plans', data);
      if (res.data.success) {
        setPlans([...plans, res.data.data]);
        closeFormModal();
        toast.success('套餐创建成功');
      }
    } catch (err) {
      toast.error(err.response?.data?.error || '创建失败');
    } finally {
      setSubmitting(false);
    }
  };

  const handleUpdate = async () => {
    const error = validateForm();
    if (error) {
      toast.error(error);
      return;
    }

    try {
      setSubmitting(true);
      const data = buildPayload();
      const res = await api.put(`/admin/plans/${editingPlan.id}`, data);
      if (res.data.success) {
        setPlans(plans.map(p => p.id === editingPlan.id ? res.data.data : p));
        closeFormModal();
        toast.success('套餐更新成功');
      }
    } catch (err) {
      toast.error(err.response?.data?.error || '更新失败');
    } finally {
      setSubmitting(false);
    }
  };

  const handleDelete = async (plan) => {
    const confirmed = await confirm({
      type: 'danger',
      title: '删除套餐',
      message: `确定要删除套餐「${plan.name}」吗？如果已有历史订单，建议改为禁用。`,
      confirmText: '确认删除'
    });
    if (!confirmed) return;

    try {
      const res = await api.delete(`/admin/plans/${plan.id}`);
      if (res.data.success) {
        setPlans(plans.filter(p => p.id !== plan.id));
        toast.success('套餐已删除');
      }
    } catch (err) {
      toast.error(err.response?.data?.error || '删除失败');
    }
  };

  const handleToggleActive = async (plan) => {
    const nextActive = !plan.isActive;
    if (!nextActive) {
      const confirmed = await confirm({
        type: 'warning',
        title: '禁用套餐',
        message: `禁用后该套餐将不再对新订单展示，确定继续吗？`,
        confirmText: '确认禁用'
      });
      if (!confirmed) return;
    }

    try {
      const res = await api.put(`/admin/plans/${plan.id}`, { isActive: nextActive });
      if (res.data.success) {
        setPlans(plans.map(p => p.id === plan.id ? res.data.data : p));
        toast.success(nextActive ? '套餐已启用' : '套餐已禁用');
      }
    } catch (err) {
      toast.error(err.response?.data?.error || '操作失败');
    }
  };

  const handleInitDefault = async () => {
    const confirmed = await confirm({
      type: 'warning',
      title: '初始化默认套餐',
      message: '将创建周卡、半月卡、月卡三个套餐。若同编码套餐已存在将返回失败。',
      confirmText: '确认初始化'
    });
    if (!confirmed) return;

    try {
      const res = await api.post('/admin/plans/init');
      if (res.data.success) {
        fetchPlans();
        toast.success('默认套餐初始化成功');
      }
    } catch (err) {
      toast.error(err.response?.data?.error || '初始化失败');
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

  // 注意：必须是「返回 JSX 的函数」并内联调用，绝不能写成 <PlanForm/> 组件——
  // 否则每次重渲染都会重建组件、导致输入框失焦（改金额时反复掉焦点）。
  const renderPlanForm = (onSubmit, submitText) => (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className="block tac-label mb-1.5">套餐代码 // CODE *</label>
          <input
            type="text"
            value={formData.code}
            onChange={(e) => setFormData({ ...formData, code: e.target.value.toUpperCase() })}
            placeholder="如: WEEKLY"
            className="tac-input w-full font-mono tabular-nums"
          />
        </div>
        <div>
          <label className="block tac-label mb-1.5">显示名称 // NAME *</label>
          <input
            type="text"
            value={formData.name}
            onChange={(e) => setFormData({ ...formData, name: e.target.value })}
            placeholder="如: 周卡"
            className="tac-input w-full"
          />
        </div>
      </div>

      <div className="grid grid-cols-3 gap-4">
        <div>
          <label className="block tac-label mb-1.5">价格 // PRICE *</label>
          <input
            type="number"
            step="0.01"
            value={formData.price}
            onChange={(e) => setFormData({ ...formData, price: e.target.value })}
            placeholder="9.9"
            className="tac-input w-full font-mono tabular-nums"
          />
        </div>
        <div>
          <label className="block tac-label mb-1.5">时长 // DAYS *</label>
          <input
            type="number"
            value={formData.duration}
            onChange={(e) => setFormData({ ...formData, duration: e.target.value })}
            placeholder="7"
            className="tac-input w-full font-mono tabular-nums"
          />
        </div>
        <div>
          <label className="block tac-label mb-1.5">排序 // ORDER</label>
          <input
            type="number"
            value={formData.sortOrder}
            onChange={(e) => setFormData({ ...formData, sortOrder: parseInt(e.target.value) || 0 })}
            className="tac-input w-full font-mono tabular-nums"
          />
        </div>
      </div>

      <div>
        <label className="block tac-label mb-1.5">描述 // DESC</label>
        <input
          type="text"
          value={formData.description}
          onChange={(e) => setFormData({ ...formData, description: e.target.value })}
          placeholder="7天体验套餐"
          className="tac-input w-full"
        />
      </div>

      <div>
        <label className="block tac-label mb-1.5">功能特性 // FEATURES</label>
        {formData.features.map((feature, index) => (
          <div key={index} className="flex gap-2 mb-2">
            <input
              type="text"
              value={feature}
              onChange={(e) => updateFeature(index, e.target.value)}
              placeholder="功能描述..."
              className="tac-input flex-1"
            />
            <button
              onClick={() => removeFeature(index)}
              className="px-3 bg-hazard-dim border border-hazard/40 text-hazard-bright hover:bg-hazard/20 transition-colors"
            >
              <FaTimes />
            </button>
          </div>
        ))}
        <button
          onClick={addFeature}
          className="text-xs text-hazard hover:text-hazard-bright transition-colors"
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
            className="w-4 h-4 accent-hazard"
          />
          <span className="text-sm text-fg">启用套餐</span>
        </label>
        <label className="flex items-center gap-2 cursor-pointer">
          <input
            type="checkbox"
            checked={formData.highlighted}
            onChange={(e) => setFormData({ ...formData, highlighted: e.target.checked })}
            className="w-4 h-4 accent-hazard"
          />
          <span className="text-sm text-fg">推荐标签</span>
        </label>
      </div>

      <div className="flex justify-end gap-2 pt-4 border-t border-ink-line">
        <button
          onClick={closeFormModal}
          disabled={submitting}
          className="tac-btn tac-btn-ghost"
        >
          取消
        </button>
        <button
          onClick={onSubmit}
          disabled={submitting}
          className="tac-btn tac-btn-primary"
        >
          <FaSave className={submitting ? 'animate-spin' : ''} /> {submitText}
        </button>
      </div>
    </div>
  );

  if (loading) {
    return (
      <div className="tac-label py-8 flex items-center gap-2">
        <span className="w-1.5 h-1.5 bg-hazard animate-tac-blink" /> LOADING PLANS // 正在加载套餐配置…
      </div>
    );
  }

  return (
    <div className="space-y-5">
      {/* 头部 */}
      <div className="flex flex-col sm:flex-row sm:justify-between sm:items-center gap-3">
        <div className="min-w-0">
          <div className="tac-label flex items-center gap-2">
            <FaBoxOpen className="text-hazard" /> 套餐策略 // PLANS
          </div>
          <h2 className="text-lg font-bold text-fg mt-1">套餐配置</h2>
          <p className="text-[11px] text-fg-dim mt-1">管理订阅套餐的价格、时长和功能特性</p>
        </div>
        <div className="flex gap-2 shrink-0">
          {plans.length === 0 && (
            <button
              onClick={handleInitDefault}
              className="tac-btn tac-btn-ghost"
            >
              初始化默认套餐
            </button>
          )}
          <button
            onClick={() => {
              resetForm();
              setShowCreateModal(true);
            }}
            className="tac-btn tac-btn-primary"
          >
            <FaPlus /> 新建套餐
          </button>
        </div>
      </div>

      {/* 套餐列表 */}
      <div className="grid gap-3">
        {plans.map((plan) => (
          <div
            key={plan.id}
            className={`tac-panel p-4 ${
              plan.isActive
                ? plan.highlighted
                  ? '!border-hazard/50 bg-hazard-dim'
                  : ''
                : 'opacity-60'
            }`}
          >
            {editingPlan?.id === plan.id ? (
              {renderPlanForm(handleUpdate, '保存修改')}
            ) : (
              <div className="flex justify-between items-start gap-4">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center flex-wrap gap-2 mb-2">
                    {plan.isActive && (
                      <span className="w-1.5 h-1.5 bg-terminal animate-tac-blink shrink-0" />
                    )}
                    <span className="text-lg font-bold text-fg">{plan.name}</span>
                    <span className="text-[11px] px-2 py-0.5 border border-ink-line text-fg-dim font-mono tabular-nums">{plan.code}</span>
                    {plan.highlighted && (
                      <span className="text-[11px] px-2 py-0.5 border border-hazard/30 bg-hazard-dim text-hazard-bright inline-flex items-center gap-1">
                        <FaStar className="text-[10px]" /> 推荐
                      </span>
                    )}
                    {!plan.isActive && (
                      <span className="inline-flex items-center gap-1.5 text-[11px] px-2 py-0.5 border border-ink-line text-fg-dim">
                        <span className="w-1.5 h-1.5 bg-fg-mute" /> 已禁用
                      </span>
                    )}
                  </div>

                  <div className="flex items-baseline gap-3 mb-3">
                    <span className="text-2xl font-bold text-hazard font-mono tabular-nums">¥{plan.price}</span>
                    <span className="text-fg-dim font-mono tabular-nums">/ {plan.duration} 天</span>
                    {plan.description && (
                      <span className="text-sm text-fg-dim">{plan.description}</span>
                    )}
                  </div>

                  {plan.features?.length > 0 && (
                    <div className="flex flex-wrap gap-2">
                      {plan.features.map((feature, i) => (
                        <span key={i} className="text-xs px-2 py-1 bg-ink-800 border border-ink-line text-fg-dim inline-flex items-center gap-1.5">
                          <FaCheck className="text-terminal text-[10px]" />
                          {feature}
                        </span>
                      ))}
                    </div>
                  )}
                </div>

                <div className="flex items-center gap-2 shrink-0">
                  <button
                    onClick={() => handleToggleActive(plan)}
                    className={`px-3 py-1.5 text-xs border transition-colors ${
                      plan.isActive
                        ? 'bg-hazard-dim border-hazard/40 text-hazard-bright hover:bg-hazard/20'
                        : 'bg-ink-800 border-ink-line text-fg-dim hover:text-fg hover:border-ink-line2'
                    }`}
                  >
                    {plan.isActive ? '禁用' : '启用'}
                  </button>
                  <button
                    onClick={() => startEdit(plan)}
                    className="px-3 py-1.5 text-xs bg-ink-800 border border-ink-line text-fg-dim hover:text-fg hover:border-ink-line2 transition-colors"
                  >
                    <FaEdit />
                  </button>
                  <button
                    onClick={() => handleDelete(plan)}
                    className="px-3 py-1.5 text-xs bg-hazard-dim border border-hazard/40 text-hazard-bright hover:bg-hazard/20 transition-colors"
                  >
                    <FaTrash />
                  </button>
                </div>
              </div>
            )}
          </div>
        ))}

        {plans.length === 0 && (
          <div className="tac-panel text-center py-12">
            <p className="text-fg-dim">暂无套餐配置</p>
            <p className="text-sm mt-2 text-fg-mute">点击「初始化默认套餐」创建周卡、半月卡、月卡</p>
          </div>
        )}
      </div>

      {/* 创建弹窗 */}
      {showCreateModal && (
        <div className="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="tac-panel tac-corners p-6 w-full max-w-lg">
            <div className="tac-label flex items-center gap-2 mb-4">
              <FaPlus className="text-hazard" /> 新建套餐 // CREATE PLAN
            </div>
            {renderPlanForm(handleCreate, '创建套餐')}
          </div>
        </div>
      )}
    </div>
  );
};

export default React.memo(PlanManager);
