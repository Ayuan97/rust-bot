import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  FaMapMarkedAlt, FaPlus, FaMinus, FaExpand, FaSync,
  FaLayerGroup, FaUser, FaSkull, FaShoppingCart, FaHelicopter,
  FaShip, FaParachuteBox, FaPlane, FaLandmark, FaEye, FaEyeSlash, FaFire, FaTruck,
  FaUsers, FaTimes, FaTrashAlt, FaTh
} from 'react-icons/fa';
import api, { getMapInfo } from '../services/api';
import socketService from '../services/socket';
import { useConfirm } from './ConfirmModal';
import { getCorrectedMapSize, coordsToGrid } from '../utils/mapUtils';

// ============================================================
// 常量定义
// ============================================================

const AppMarkerType = {
  Undefined: 0,
  Player: 1,
  Explosion: 2,
  VendingMachine: 3,
  CH47: 4,
  CargoShip: 5,
  Crate: 6,
  GenericRadius: 7,
  PatrolHelicopter: 8,
  TravellingVendor: 9
};

// 标记图标 + 所属图层（颜色统一收敛：事件=hazard，中性=fg，靠图标区分类型）
const MARKER_CONFIG = {
  [AppMarkerType.Player]: { icon: FaUser, tone: 'terminal', label: '玩家', layer: 'players' },
  [AppMarkerType.Explosion]: { icon: FaSkull, tone: 'hazard', label: '爆炸', layer: 'events' },
  [AppMarkerType.VendingMachine]: { icon: FaShoppingCart, tone: 'mute', label: '售货机', layer: 'vending' },
  [AppMarkerType.CH47]: { icon: FaHelicopter, tone: 'hazard', label: '支奴干', layer: 'vehicles' },
  [AppMarkerType.CargoShip]: { icon: FaShip, tone: 'fg', label: '货船', layer: 'vehicles' },
  [AppMarkerType.Crate]: { icon: FaParachuteBox, tone: 'hazard', label: '空投', layer: 'events' },
  [AppMarkerType.GenericRadius]: { icon: FaLandmark, tone: 'mute', label: '区域', layer: 'misc' },
  [AppMarkerType.PatrolHelicopter]: { icon: FaPlane, tone: 'hazard', label: '巡逻机', layer: 'vehicles' },
  [AppMarkerType.TravellingVendor]: { icon: FaTruck, tone: 'fg', label: '流浪商人', layer: 'vehicles' }
};

const TONE_HEX = { hazard: '#E0452E', terminal: '#4AF626', fg: '#EAEAEA', mute: '#6A6A6A' };

const ZOOM_MIN = 0.3;
const ZOOM_MAX = 5;
const clampScale = (s) => Math.min(Math.max(ZOOM_MIN, s), ZOOM_MAX);

// 演示数据
const DEMO_MARKERS = [
  { id: 'd1', type: AppMarkerType.CH47, x: 1500, y: 2000, name: '支奴干' },
  { id: 'd2', type: AppMarkerType.CargoShip, x: 3500, y: 1000, name: '货船' },
  { id: 'd3', type: AppMarkerType.Crate, x: 2200, y: 2800, name: '空投' },
  { id: 'd4', type: AppMarkerType.PatrolHelicopter, x: 800, y: 3200, name: '巡逻直升机' }
];

const DEMO_TEAM = [
  { steamId: 'demo1', name: '演示指挥官', x: 2000, y: 2500, isOnline: true, isAlive: true },
  { steamId: 'demo2', name: '演示队员A', x: 1800, y: 2300, isOnline: true, isAlive: false },
  { steamId: 'demo3', name: '演示队员B', x: 2200, y: 2700, isOnline: false, isAlive: true }
];

const DEMO_MONUMENTS = [
  { name: 'Launch Site', x: 2500, y: 3000 },
  { name: 'Oil Rig', x: 4000, y: 500 },
  { name: 'Dome', x: 1200, y: 1800 },
  { name: 'Airfield', x: 3000, y: 2000 }
];

// 演示热力数据：活动热力（队友足迹密度，集中在基地）+ 死亡热力（交战热点，集中在 Launch/Airfield）
const DEMO_ACTIVITY = [
  { x: 2000, y: 2500, w: 3 }, { x: 1900, y: 2450, w: 2 }, { x: 2100, y: 2560, w: 2 },
  { x: 1820, y: 2320, w: 2 }, { x: 2180, y: 2680, w: 1 }, { x: 2040, y: 2410, w: 3 },
  { x: 1960, y: 2600, w: 1 }, { x: 2150, y: 2360, w: 1 }, { x: 2300, y: 2880, w: 1 },
  { x: 1720, y: 2220, w: 1 }, { x: 2420, y: 2980, w: 1 }, { x: 2000, y: 2520, w: 2 },
  { x: 2260, y: 2740, w: 1 }, { x: 1880, y: 2520, w: 2 }
];
const DEMO_DEATHS = [
  { x: 2500, y: 3000, w: 3, name: '演示队员A', diedAt: '2026-06-07T14:20:00' },
  { x: 2560, y: 2950, w: 2, name: '演示队员A', diedAt: '2026-06-07T15:02:00' },
  { x: 2470, y: 3060, w: 2, name: '演示指挥官', diedAt: '2026-06-07T18:41:00' },
  { x: 3000, y: 2000, w: 2, name: '演示队员B', diedAt: '2026-06-08T09:13:00' },
  { x: 1200, y: 1820, w: 1, name: '演示队员A', diedAt: '2026-06-08T10:55:00' }
];

const LAYER_LABELS = {
  players: '玩家',
  events: '事件',
  vehicles: '载具',
  vending: '售货机',
  monuments: '纪念碑'
};

// 死亡时间格式化：MM-DD HH:MM
function formatDiedAt(diedAt) {
  if (!diedAt) return '';
  const d = new Date(diedAt);
  if (Number.isNaN(d.getTime())) return '';
  const p = (n) => String(n).padStart(2, '0');
  return `${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`;
}

// ============================================================
// 主组件
// ============================================================

export default function MapView({ server, teamData, focusTarget, onLocatePlayer }) {
  const containerRef = useRef(null);
  const [mapInfo, setMapInfo] = useState({
    markers: [], mapSize: 4500, monuments: [],
    imageWidth: 2048, imageHeight: 2048, oceanMargin: 0, loading: true
  });

  const [transform, setTransform] = useState({ scale: 1, x: 0, y: 0 });
  const [isDragging, setIsDragging] = useState(false);

  // 视图模式：tactical=实时战术地图；heatmap=热力分析（与实时标记彻底分开）
  const [viewMode, setViewMode] = useState('tactical');
  const [heatTab, setHeatTab] = useState('activity'); // 热力页一次看一张：'activity' | 'deaths'

  // 图层可见性（仅战术地图模式生效；热力已独立成视图，不再是图层）
  const [layerVisibility, setLayerVisibility] = useState({
    players: true,
    events: true,
    vehicles: true,
    vending: false,
    monuments: true
  });
  const [showLayerPanel, setShowLayerPanel] = useState(false);

  // 热力图数据（真实数据，仅热力视图打开时按 tab 拉取）
  const [heatData, setHeatData] = useState({ activityPoints: [], deathPoints: [] });
  const [heatFilter, setHeatFilter] = useState(''); // '' = 全队，否则为某队友 steamId
  const [deathMode, setDeathMode] = useState('heat'); // 'heat' | 'points'
  const [teammates, setTeammates] = useState([]); // extended-teammates 完整名单
  const [heatLoading, setHeatLoading] = useState(false);

  const confirm = useConfirm();
  const isDemo = !server || !server.connected;

  // transform 镜像 ref：供原生事件监听器（wheel/touch）读取最新值，避免闭包陈旧
  const transformRef = useRef(transform);
  useEffect(() => { transformRef.current = transform; }, [transform]);

  // ============================================================
  // 数据获取
  // ============================================================
  const fetchMapData = useCallback(async () => {
    if (isDemo) {
      setMapInfo({
        markers: DEMO_MARKERS, mapSize: 4500, monuments: DEMO_MONUMENTS,
        imageWidth: 2048, imageHeight: 2048, oceanMargin: 0, loading: false
      });
      return;
    }
    try {
      const res = await getMapInfo(server.id);
      if (res?.data?.success) {
        const data = res.data;
        const correctedSize = getCorrectedMapSize(data.mapSize);
        setMapInfo({
          markers: data.markers?.markers || data.markers || [],
          mapSize: correctedSize,
          monuments: data.monuments || [],
          imageWidth: data.imageWidth || 2048,
          imageHeight: data.imageHeight || 2048,
          oceanMargin: data.oceanMargin || 0,
          loading: false
        });
      } else {
        setMapInfo(prev => ({ ...prev, loading: false }));
      }
    } catch (e) {
      console.error('地图数据获取失败:', e);
      setMapInfo(prev => ({ ...prev, loading: false }));
    }
  }, [server?.id, isDemo]);

  useEffect(() => {
    fetchMapData();
  }, [fetchMapData]);

  // 监听队伍变化
  useEffect(() => {
    if (isDemo) return;
    const handleTeamChanged = (data) => {
      if (data.serverId === server?.id) fetchMapData();
    };
    socketService.on('team:changed', handleTeamChanged);
    const refreshInterval = setInterval(fetchMapData, 30000);
    return () => {
      socketService.off('team:changed', handleTeamChanged);
      clearInterval(refreshInterval);
    };
  }, [server?.id, isDemo, fetchMapData]);

  // ============================================================
  // 热力图数据获取（真实数据，仅热力视图打开时按 tab 请求）
  // ============================================================
  const fetchHeatmap = useCallback(async (types) => {
    if (isDemo || !server?.id) return;
    const sid = heatFilter ? `?steamId=${encodeURIComponent(heatFilter)}` : '';
    setHeatLoading(true);
    try {
      const tasks = [];
      if (types.includes('activity')) {
        tasks.push(
          api.get(`/servers/${server.id}/heatmap/activity${sid}`)
            .then(res => { if (res?.data?.success) setHeatData(prev => ({ ...prev, activityPoints: res.data.points || [] })); })
            .catch(() => {})
        );
      }
      if (types.includes('deaths')) {
        tasks.push(
          api.get(`/servers/${server.id}/heatmap/deaths${sid}`)
            .then(res => { if (res?.data?.success) setHeatData(prev => ({ ...prev, deathPoints: res.data.points || [] })); })
            .catch(() => {})
        );
      }
      await Promise.all(tasks);
    } finally {
      setHeatLoading(false);
    }
  }, [server?.id, isDemo, heatFilter]);

  // 拉取扩展队友名单（用于筛选下拉），首次进入热力视图时按需加载
  const loadTeammates = useCallback(async () => {
    if (isDemo || !server?.id) return;
    try {
      const res = await api.get(`/servers/${server.id}/extended-teammates`);
      if (res?.data?.success) setTeammates(res.data.teammates || []);
    } catch { /* ignore */ }
  }, [server?.id, isDemo]);

  // 进入热力视图 / 切 tab / 切筛选时，只拉当前 tab 的数据；首次按需加载队友名单
  useEffect(() => {
    if (isDemo || viewMode !== 'heatmap') return;
    if (teammates.length === 0) loadTeammates();
    fetchHeatmap([heatTab]);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isDemo, server?.id, viewMode, heatTab, heatFilter]);

  // 重置热力：二次确认 → 清空 → 重新拉取当前 tab
  const handleResetHeatmap = useCallback(async () => {
    if (isDemo || !server?.id) return;
    const ok = await confirm({
      type: 'danger',
      title: '重置热力数据',
      message: '这将清空本服务器全部活动与死亡热力采样数据，且无法撤销。确定要继续吗？',
      confirmText: '重置',
      cancelText: '取消'
    });
    if (!ok) return;
    try {
      await api.post(`/servers/${server.id}/heatmap/reset`);
      setHeatData({ activityPoints: [], deathPoints: [] });
      fetchHeatmap([heatTab]);
    } catch { /* ignore */ }
  }, [server?.id, isDemo, confirm, heatTab, fetchHeatmap]);

  // ============================================================
  // 地图交互：光标锚点缩放 + 跟手拖拽 + 触屏手势
  // ============================================================

  // 把 scale 变到 resolveScale(oldScale)，并保持 (clientX,clientY) 处的内容点不动（光标锚点）
  const applyZoom = useCallback((resolveScale, clientX, clientY) => {
    const container = containerRef.current;
    if (!container) return;
    const rect = container.getBoundingClientRect();
    const px = clientX - rect.left - rect.width / 2;  // 相对视口中心（origin-center）
    const py = clientY - rect.top - rect.height / 2;
    setTransform(t => {
      const newScale = clampScale(resolveScale(t.scale));
      const k = newScale / t.scale;
      return { scale: newScale, x: px - (px - t.x) * k, y: py - (py - t.y) * k };
    });
  }, []);

  // 滚轮缩放：以光标为锚点、按比例缩放（比线性更顺手）。滚动期间关过渡 → 即时跟手，停滚 140ms 后恢复
  const zoomEndTimer = useRef(null);
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    const handleWheel = (e) => {
      e.preventDefault();
      e.stopPropagation();
      setIsDragging(true);
      clearTimeout(zoomEndTimer.current);
      zoomEndTimer.current = setTimeout(() => setIsDragging(false), 140);
      const factor = Math.exp(-e.deltaY * 0.0015);
      applyZoom(s => s * factor, e.clientX, e.clientY);
    };
    container.addEventListener('wheel', handleWheel, { passive: false });
    return () => {
      container.removeEventListener('wheel', handleWheel);
      clearTimeout(zoomEndTimer.current);
    };
  }, [applyZoom]);

  // 按钮缩放：以视口中心为锚点
  const zoomByButton = useCallback((delta) => {
    const container = containerRef.current;
    if (!container) return;
    const rect = container.getBoundingClientRect();
    applyZoom(s => s + delta, rect.left + rect.width / 2, rect.top + rect.height / 2);
  }, [applyZoom]);

  // 鼠标拖拽（跟手：拖拽期间变换容器关闭过渡）
  const dragRef = useRef({ active: false, startX: 0, startY: 0 });
  const handleMouseDown = (e) => {
    if (e.button !== 0) return;
    dragRef.current = { active: true, startX: e.clientX - transform.x, startY: e.clientY - transform.y };
    setIsDragging(true);
  };
  const handleMouseMove = (e) => {
    if (!dragRef.current.active) return;
    setTransform(p => ({ ...p, x: e.clientX - dragRef.current.startX, y: e.clientY - dragRef.current.startY }));
  };
  const handleMouseUp = () => {
    dragRef.current.active = false;
    setIsDragging(false);
  };

  // 触屏：单指平移 + 双指捏合缩放（以双指中点为锚点）。用原生监听 passive:false 才能 preventDefault
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    const ts = { mode: null, startDist: 0, startScale: 1, dragX: 0, dragY: 0 };

    const dist = (t0, t1) => Math.hypot(t0.clientX - t1.clientX, t0.clientY - t1.clientY) || 1;

    const onStart = (e) => {
      if (e.touches.length === 1) {
        ts.mode = 'pan';
        ts.dragX = e.touches[0].clientX - transformRef.current.x;
        ts.dragY = e.touches[0].clientY - transformRef.current.y;
        setIsDragging(true);
      } else if (e.touches.length === 2) {
        ts.mode = 'pinch';
        ts.startDist = dist(e.touches[0], e.touches[1]);
        ts.startScale = transformRef.current.scale;
        setIsDragging(true);
      }
    };
    const onMove = (e) => {
      if (ts.mode === 'pan' && e.touches.length === 1) {
        e.preventDefault();
        const t = e.touches[0];
        setTransform(p => ({ ...p, x: t.clientX - ts.dragX, y: t.clientY - ts.dragY }));
      } else if (ts.mode === 'pinch' && e.touches.length === 2) {
        e.preventDefault();
        const d = dist(e.touches[0], e.touches[1]);
        const midX = (e.touches[0].clientX + e.touches[1].clientX) / 2;
        const midY = (e.touches[0].clientY + e.touches[1].clientY) / 2;
        const target = ts.startScale * (d / ts.startDist);
        applyZoom(() => target, midX, midY);
      }
    };
    const onEnd = (e) => {
      if (e.touches.length === 0) {
        ts.mode = null;
        setIsDragging(false);
      } else if (e.touches.length === 1) {
        // 捏合松开一指 → 转平移，重置基准
        ts.mode = 'pan';
        ts.dragX = e.touches[0].clientX - transformRef.current.x;
        ts.dragY = e.touches[0].clientY - transformRef.current.y;
      }
    };

    container.addEventListener('touchstart', onStart, { passive: false });
    container.addEventListener('touchmove', onMove, { passive: false });
    container.addEventListener('touchend', onEnd);
    container.addEventListener('touchcancel', onEnd);
    return () => {
      container.removeEventListener('touchstart', onStart);
      container.removeEventListener('touchmove', onMove);
      container.removeEventListener('touchend', onEnd);
      container.removeEventListener('touchcancel', onEnd);
    };
  }, [applyZoom]);

  // 聚焦到目标（定位队友：切回战术地图并居中放大）
  useEffect(() => {
    if (focusTarget && containerRef.current) {
      setViewMode('tactical');
      const rect = containerRef.current.getBoundingClientRect();
      const { mapSize, imageWidth, imageHeight, oceanMargin } = mapInfo;
      const scale = (imageWidth - 2 * oceanMargin) / mapSize;
      const x_image = focusTarget.x * scale + oceanMargin;
      const y_image = imageHeight - (focusTarget.y * scale + oceanMargin);
      const posPercent = { x: x_image / imageWidth, y: y_image / imageHeight };
      const targetScale = 2;
      // 地图为正方形(height:100% + maxWidth:100%)，边长=容器宽高较小者；X/Y 须用同一边长，否则非正方形容器下定位会偏
      const square = Math.min(rect.width, rect.height);
      const newX = -(posPercent.x - 0.5) * square * targetScale;
      const newY = -(posPercent.y - 0.5) * square * targetScale;
      setTransform({ scale: targetScale, x: newX, y: newY });
    }
  }, [focusTarget, mapInfo.mapSize, mapInfo.imageWidth, mapInfo.imageHeight, mapInfo.oceanMargin]);

  // ============================================================
  // 坐标转换
  // ============================================================
  const getPos = (x, y) => {
    const { mapSize, imageWidth, imageHeight, oceanMargin } = mapInfo;
    const scale = (imageWidth - 2 * oceanMargin) / mapSize;
    const x_image = x * scale + oceanMargin;
    const y_image = imageHeight - (y * scale + oceanMargin);
    const left = (x_image / imageWidth) * 100;
    const top = (y_image / imageHeight) * 100;
    return { left: `${left}%`, top: `${top}%` };
  };

  // ============================================================
  // 过滤标记 / 数据
  // ============================================================
  const filteredMarkers = mapInfo.markers.filter(marker => {
    const config = MARKER_CONFIG[marker.type];
    if (!config) return false;
    return layerVisibility[config.layer];
  });

  const teamMembers = isDemo ? DEMO_TEAM : (teamData?.members || []);
  const activityPoints = isDemo ? DEMO_ACTIVITY : heatData.activityPoints;
  const deathPoints = isDemo ? DEMO_DEATHS : heatData.deathPoints;
  const isHeatmap = viewMode === 'heatmap';

  const mapImageUrl = server?.id
    ? `${import.meta.env.VITE_API_URL || '/api'}/servers/${server.id}/map-image?token=${localStorage.getItem('token')}`
    : null;

  // ============================================================
  // 渲染
  // ============================================================
  return (
    <div className="flex flex-col h-full space-y-4 animate-fade-in font-sans">
      {/* 顶部标题栏 */}
      <div className="flex flex-col md:flex-row md:justify-between md:items-end gap-4 border-b border-ink-line pb-4">
        <div>
          <div className="tac-label mb-1">TACTICAL MAP</div>
          <h3 className="text-xl font-extrabold text-fg tracking-tight flex items-center gap-2">
            <FaMapMarkedAlt className="text-hazard" /> 实时战术地图
          </h3>
          <p className="font-mono text-[11px] text-fg-mute mt-1.5 uppercase tracking-wider">
            [{server?.name || '演示模式'}] · {mapInfo.mapSize}M
          </p>
        </div>

        {/* 控制区 */}
        <div className="flex items-center gap-2 flex-wrap">
          {/* 视图切换：战术地图 / 热力分析 */}
          <div className="flex border border-ink-line divide-x divide-ink-line">
            <ViewBtn active={!isHeatmap} onClick={() => setViewMode('tactical')} icon={FaMapMarkedAlt} label="战术地图" />
            <ViewBtn active={isHeatmap} onClick={() => setViewMode('heatmap')} icon={FaFire} label="热力分析" />
          </div>
          {/* 缩放控制 */}
          <div className="flex border border-ink-line divide-x divide-ink-line">
            <CtrlBtn onClick={() => zoomByButton(0.3)}><FaPlus size={10} /></CtrlBtn>
            <CtrlBtn onClick={() => zoomByButton(-0.3)}><FaMinus size={10} /></CtrlBtn>
            <CtrlBtn onClick={() => setTransform({ scale: 1, x: 0, y: 0 })}><FaExpand size={10} /></CtrlBtn>
          </div>
          <CtrlBtn onClick={fetchMapData} bordered><FaSync size={10} className={mapInfo.loading ? 'animate-spin' : ''} /></CtrlBtn>
          {/* 图层按钮：仅战术地图模式 */}
          {!isHeatmap && (
            <div className="relative">
              <CtrlBtn onClick={() => setShowLayerPanel(!showLayerPanel)} active={showLayerPanel} bordered><FaLayerGroup size={10} /></CtrlBtn>
              {showLayerPanel && (
                <div className="absolute right-0 top-full mt-2 tac-panel p-3 z-50 min-w-[180px]">
                  <div className="tac-label mb-2">图层控制 // LAYERS</div>
                  {['players', 'events', 'vehicles', 'vending', 'monuments'].map((layer) => (
                    <LayerToggle key={layer} layer={layer} visible={layerVisibility[layer]}
                      onToggle={() => setLayerVisibility(prev => ({ ...prev, [layer]: !prev[layer] }))} />
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {/* 热力分析工具条：仅热力视图。活动/死亡一次看一张，与实时标记彻底分开 */}
      {isHeatmap && (
        <div className="tac-panel px-3 py-2.5 flex flex-wrap items-center gap-3">
          <div className="flex border border-ink-line divide-x divide-ink-line">
            <HeatTabBtn active={heatTab === 'activity'} onClick={() => setHeatTab('activity')} tone="terminal" label="活动热力" />
            <HeatTabBtn active={heatTab === 'deaths'} onClick={() => setHeatTab('deaths')} tone="hazard" label="死亡热力" />
          </div>

          {!isDemo && (
            <div className="flex items-center gap-2">
              <span className="tac-label !text-[9px] flex items-center gap-1.5"><FaUsers className="text-fg-mute" size={10} /> 范围</span>
              <select
                value={heatFilter}
                onChange={(e) => setHeatFilter(e.target.value)}
                className="bg-ink-900 border border-ink-line text-xs text-fg px-2 py-1.5 focus:border-hazard/50 focus:outline-none min-w-[120px]"
              >
                <option value="">全队</option>
                {teammates.map((t) => (
                  <option key={t.steamId} value={t.steamId}>{t.name || t.steamId}</option>
                ))}
              </select>
            </div>
          )}

          {/* 死亡视图：热力 / 点位（仅死亡 tab） */}
          {heatTab === 'deaths' && (
            <div className="flex items-center gap-2">
              <span className="tac-label !text-[9px] flex items-center gap-1.5"><FaSkull className="text-hazard" size={10} /> 视图</span>
              <div className="flex border border-ink-line divide-x divide-ink-line">
                {[{ mode: 'heat', label: '热力', icon: FaFire }, { mode: 'points', label: '点位', icon: FaTh }].map(({ mode, label, icon: Icon }) => (
                  <button key={mode} onClick={() => setDeathMode(mode)}
                    className={`flex items-center justify-center gap-1.5 px-3 py-1.5 text-[11px] font-bold transition-colors ${deathMode === mode ? 'bg-hazard-dim text-hazard' : 'text-fg-mute hover:text-fg hover:bg-ink-800'}`}>
                    <Icon size={9} /> {label}
                  </button>
                ))}
              </div>
            </div>
          )}

          {heatLoading && <span className="font-mono text-[10px] text-fg-mute animate-pulse">加载中…</span>}

          {!isDemo && (
            <button onClick={handleResetHeatmap}
              className="ml-auto flex items-center justify-center gap-1.5 px-3 py-1.5 text-[11px] font-bold border border-hazard/40 text-hazard hover:bg-hazard-dim transition-colors">
              <FaTrashAlt size={9} /> 重置热力
            </button>
          )}
        </div>
      )}

      {/* 演示模式提示 */}
      {isDemo && (
        <div className="tac-panel p-4 flex items-center gap-3">
          <span className="font-mono text-hazard text-xs shrink-0">[DEMO]</span>
          <div className="text-sm text-fg-dim">
            <span className="text-fg font-bold">演示模式</span> — 连接服务器后同步实时地图、队友坐标。热力分析基于队友历史足迹与死亡事件生成（需后端采样）。
          </div>
        </div>
      )}

      {/* 地图容器 */}
      <div
        ref={containerRef}
        className="flex-1 relative bg-ink-900 border border-ink-line overflow-hidden select-none"
        style={{ cursor: isDragging ? 'grabbing' : 'grab', touchAction: 'none' }}
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        onMouseLeave={handleMouseUp}
      >
        {/* 变换容器：拖拽/捏合时关闭过渡 → 跟手；缩放按钮/聚焦时保留过渡 → 平滑 */}
        <div
          className="absolute inset-0 origin-center flex items-center justify-center"
          style={{
            transform: `translate(${transform.x}px, ${transform.y}px) scale(${transform.scale})`,
            transition: isDragging ? 'none' : 'transform 0.12s ease-out',
            willChange: 'transform'
          }}
        >
          <div className="relative" style={{ aspectRatio: '1 / 1', height: '100%', maxWidth: '100%' }}>
            {/* 地图背景 */}
            {mapImageUrl && (
              <img src={mapImageUrl} alt="Rust Map"
                className="absolute inset-0 w-full h-full object-fill z-0 opacity-80"
                style={{ filter: 'grayscale(0.3) contrast(1.1)' }} draggable={false} />
            )}

            {/* 演示模式背景：发丝网格 */}
            {isDemo && (
              <div className="absolute inset-0 z-0 bg-ink-850" style={{
                backgroundImage: 'linear-gradient(#2A2A2A 1px, transparent 1px), linear-gradient(90deg, #2A2A2A 1px, transparent 1px)',
                backgroundSize: '8% 8%'
              }} />
            )}

            {/* ===== 热力分析视图：只有底图 + 热力，无实时标记 ===== */}
            {isHeatmap && (
              <>
                <HeatLayer points={activityPoints} getPos={getPos} hex={TONE_HEX.terminal} visible={heatTab === 'activity'} />
                <HeatLayer points={deathPoints} getPos={getPos} hex={TONE_HEX.hazard} visible={heatTab === 'deaths' && deathMode === 'heat'} />
                {heatTab === 'deaths' && deathMode === 'points' && deathPoints.map((p, i) => (
                  <div key={`death-${p.x}-${p.y}-${i}`} className="absolute -translate-x-1/2 -translate-y-1/2 z-[18] pointer-events-auto group" style={getPos(p.x, p.y)}>
                    <FaTimes className="text-hazard text-[10px] drop-shadow-[0_0_2px_rgba(0,0,0,0.9)] group-hover:scale-150 transition-transform" />
                    <div className="absolute top-3.5 left-1/2 -translate-x-1/2 bg-ink-900/95 border border-ink-line px-2 py-1 whitespace-nowrap opacity-0 group-hover:opacity-100 transition-opacity z-50">
                      <span className="text-[10px] font-bold text-fg">{p.name || '未知'}</span>
                      <span className="font-mono text-[9px] text-hazard ml-1.5">{formatDiedAt(p.diedAt)}</span>
                    </div>
                  </div>
                ))}
                {/* 空数据提示 */}
                {!isDemo && !heatLoading && (heatTab === 'activity' ? activityPoints.length === 0 : deathPoints.length === 0) && (
                  <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                    <div className="bg-ink-900/85 border border-ink-line px-4 py-3 text-center">
                      <div className="font-mono text-[11px] text-fg-mute uppercase tracking-wider">NO DATA</div>
                      <div className="text-xs text-fg-dim mt-1">
                        {heatTab === 'activity' ? '队友在线活动后逐步生成' : '队友死亡后逐步生成'}
                      </div>
                    </div>
                  </div>
                )}
              </>
            )}

            {/* ===== 战术地图视图：实时标记 ===== */}
            {!isHeatmap && (
              <>
                {/* 纪念碑 */}
                {layerVisibility.monuments && mapInfo.monuments?.map((mon, i) => (
                  <div key={`mon-${i}`} className="absolute -translate-x-1/2 -translate-y-1/2 z-10 group cursor-pointer" style={getPos(mon.x, mon.y)}>
                    <div className="w-2.5 h-2.5 border border-fg-mute rotate-45 group-hover:border-fg-dim transition-colors" />
                    <div className="absolute top-4 left-1/2 -translate-x-1/2 font-mono text-[8px] text-fg-dim whitespace-nowrap uppercase tracking-wider opacity-0 group-hover:opacity-100 transition-opacity bg-ink-900/90 border border-ink-line px-2 py-1">
                      {mon.name || mon.token}
                    </div>
                  </div>
                ))}

                {/* 事件/载具标记 */}
                {filteredMarkers.map((marker, i) => {
                  const config = MARKER_CONFIG[marker.type];
                  if (!config) return null;
                  const Icon = config.icon;
                  const hex = TONE_HEX[config.tone];
                  return (
                    <div key={`marker-${marker.id || i}`} className="absolute -translate-x-1/2 -translate-y-1/2 z-20 cursor-pointer group" style={getPos(marker.x, marker.y)}>
                      <div className="relative">
                        <div className="w-6 h-6 flex items-center justify-center border-2 transition-transform group-hover:scale-125"
                          style={{ backgroundColor: `${hex}1A`, borderColor: hex }}>
                          <Icon className="text-[11px]" style={{ color: hex }} />
                        </div>
                        <div className="absolute top-7 left-1/2 -translate-x-1/2 bg-ink-900/95 border border-ink-line px-2 py-1 whitespace-nowrap opacity-0 group-hover:opacity-100 transition-opacity z-50">
                          <span className="font-mono text-[9px] font-bold uppercase tracking-wider" style={{ color: hex }}>{config.label}</span>
                          {marker.name && <div className="text-[8px] text-fg-mute">{marker.name}</div>}
                        </div>
                      </div>
                    </div>
                  );
                })}

                {/* 队友标记 */}
                {layerVisibility.players && teamMembers.map((member, index) => {
                  const grid = coordsToGrid(member.x, member.y, mapInfo.mapSize);
                  const isLocked = focusTarget?.steamId === member.steamId || (focusTarget?.x === member.x && focusTarget?.y === member.y);
                  return (
                    <div key={member.steamId} className="absolute -translate-x-1/2 -translate-y-1/2 transition-all duration-1000 cursor-pointer group"
                      style={{ ...getPos(member.x, member.y), zIndex: 30 + index }} onClick={() => onLocatePlayer?.(member)}>
                      <div className="relative">
                        <div className={`w-5 h-5 relative z-10 border border-ink-900 flex items-center justify-center ${!member.isAlive ? 'bg-hazard' : member.isOnline ? 'bg-terminal' : 'bg-ink-line2'}`}>
                          <FaUser className={`text-[8px] ${member.isAlive && member.isOnline ? 'text-ink-900' : 'text-white'}`} />
                        </div>
                        <div className="absolute top-7 left-1/2 -translate-x-1/2 bg-ink-900/95 border border-ink-line px-2.5 py-1.5 whitespace-nowrap z-40 opacity-0 group-hover:opacity-100 transition-opacity">
                          <span className="text-[11px] font-bold text-fg flex items-center gap-1.5">
                            {member.name}
                            {!member.isAlive && <span className="font-mono text-hazard text-[9px] uppercase">DEAD</span>}
                            {!member.isOnline && <span className="font-mono text-fg-mute text-[9px] uppercase">OFF</span>}
                          </span>
                          <div className="font-mono text-[8px] text-fg-mute mt-0.5">{grid}</div>
                        </div>
                        {isLocked && (
                          <>
                            <div className="absolute -inset-8 border border-hazard animate-ping opacity-30" />
                            <div className="absolute -inset-5 border border-dashed border-hazard animate-spin-slow opacity-50" />
                          </>
                        )}
                      </div>
                    </div>
                  );
                })}

                {/* 锁定目标十字线 */}
                {focusTarget && (
                  <div className="absolute -translate-x-1/2 -translate-y-1/2 z-50 pointer-events-none transition-all duration-500" style={getPos(focusTarget.x, focusTarget.y)}>
                    <div className="relative">
                      <div className="absolute w-20 h-px bg-hazard/60 -translate-x-1/2 left-1/2" />
                      <div className="absolute h-20 w-px bg-hazard/60 -translate-y-1/2 top-1/2" />
                      <div className="absolute top-12 left-1/2 -translate-x-1/2 bg-hazard text-white font-mono text-[10px] font-bold px-3 py-1 whitespace-nowrap">
                        已锁定: {focusTarget.name}
                      </div>
                    </div>
                  </div>
                )}
              </>
            )}
          </div>
        </div>

        {/* 右下角信息 */}
        <div className="absolute bottom-4 right-4 flex items-center gap-4 font-mono text-[10px] uppercase tracking-wider text-fg-mute bg-ink-900/85 border border-ink-line px-3 py-2">
          <span>缩放 <span className="text-fg">{(transform.scale * 100).toFixed(0)}%</span></span>
          {isHeatmap ? (
            <span>热力点 <span className="text-hazard">{heatTab === 'activity' ? activityPoints.length : deathPoints.length}</span></span>
          ) : (
            <>
              <span>在线 <span className="text-terminal">{teamMembers.filter(m => m.isOnline).length}</span>/{teamMembers.length}</span>
              <span>标记 <span className="text-hazard">{filteredMarkers.length}</span></span>
            </>
          )}
        </div>

        {/* 图例 */}
        <div className="absolute bottom-4 left-4 bg-ink-900/85 border border-ink-line p-3">
          <div className="tac-label !text-[9px] mb-2">图例 // LEGEND</div>
          <div className="flex flex-wrap gap-x-3 gap-y-1.5 max-w-[260px]">
            {isHeatmap ? (
              heatTab === 'activity'
                ? <LegendItem className="bg-terminal/50" label="活动热力" />
                : (deathMode === 'heat'
                    ? <LegendItem className="bg-hazard/50" label="死亡热力" />
                    : <LegendItem className="bg-hazard" label="死亡点位" />)
            ) : (
              <>
                <LegendItem className="bg-terminal" label="在线" />
                <LegendItem className="bg-hazard" label="阵亡" />
                <LegendItem className="bg-ink-line2" label="离线" />
                <LegendItem className="border border-fg-mute rotate-45" label="纪念碑" solid={false} />
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

// ============================================================
// 子组件
// ============================================================
function ViewBtn({ active, onClick, icon: Icon, label }) {
  return (
    <button
      onClick={onClick}
      className={`flex items-center gap-1.5 px-3 h-9 text-xs font-bold transition-colors ${active ? 'bg-hazard-dim text-hazard' : 'text-fg-dim hover:text-fg hover:bg-ink-800'}`}
    >
      <Icon size={11} /> {label}
    </button>
  );
}

function HeatTabBtn({ active, onClick, tone, label }) {
  const activeCls = tone === 'hazard' ? 'bg-hazard-dim text-hazard' : 'bg-terminal/15 text-terminal';
  return (
    <button
      onClick={onClick}
      className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold transition-colors ${active ? activeCls : 'text-fg-dim hover:text-fg hover:bg-ink-800'}`}
    >
      <FaFire size={10} /> {label}
    </button>
  );
}

function CtrlBtn({ children, onClick, active, bordered }) {
  return (
    <button
      onClick={onClick}
      className={`w-9 h-9 flex items-center justify-center text-fg-dim transition-colors ${bordered ? 'border border-ink-line' : ''} ${active ? 'bg-hazard-dim text-hazard border-hazard/40' : 'hover:text-fg hover:bg-ink-800'}`}
    >
      {children}
    </button>
  );
}

function LayerToggle({ layer, visible, onToggle }) {
  return (
    <button className="flex items-center gap-2.5 w-full px-2 py-1.5 hover:bg-ink-800 transition-colors" onClick={onToggle}>
      {visible ? <FaEye className="text-terminal" size={10} /> : <FaEyeSlash className="text-fg-mute" size={10} />}
      <span className={`text-xs font-bold ${visible ? 'text-fg' : 'text-fg-mute'}`}>{LAYER_LABELS[layer]}</span>
    </button>
  );
}

function LegendItem({ className, label, solid = true }) {
  return (
    <div className="flex items-center gap-1.5">
      <div className={`w-3 h-3 ${className}`} />
      <span className="font-mono text-[9px] text-fg-dim uppercase tracking-wider">{label}</span>
    </div>
  );
}

// 热力层：把点渲染成叠加的径向渐变（mix-blend-mode: screen 让重叠处更亮）
function HeatLayer({ points, getPos, hex, visible }) {
  if (!visible || !points?.length) return null;
  return (
    <div className="absolute inset-0 z-[15] pointer-events-none" style={{ mixBlendMode: 'screen' }}>
      {points.map((p, i) => {
        const pos = getPos(p.x, p.y);
        const size = 70 + (p.w || 1) * 34;
        return (
          <div key={`${p.x}-${p.y}-${i}`} className="absolute -translate-x-1/2 -translate-y-1/2 rounded-full"
            style={{
              left: pos.left, top: pos.top, width: size, height: size,
              background: `radial-gradient(circle, ${hex}AA 0%, ${hex}55 35%, transparent 72%)`,
              filter: 'blur(6px)'
            }} />
        );
      })}
    </div>
  );
}
