import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  FaMapMarkedAlt, FaPlus, FaMinus, FaExpand, FaSync,
  FaLayerGroup, FaExclamationTriangle, FaInfoCircle,
  FaUser, FaSkull, FaShoppingCart, FaHelicopter,
  FaShip, FaParachuteBox, FaPlane, FaLandmark, FaEye, FaEyeSlash
} from 'react-icons/fa';
import { getMapInfo } from '../services/api';
import socketService from '../services/socket';
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
  PatrolHelicopter: 8
};

const MARKER_CONFIG = {
  [AppMarkerType.Player]: { icon: FaUser, color: '#a3e635', label: '玩家', layer: 'players' },
  [AppMarkerType.Explosion]: { icon: FaSkull, color: '#ef4444', label: '爆炸', layer: 'events' },
  [AppMarkerType.VendingMachine]: { icon: FaShoppingCart, color: '#22d3ee', label: '售货机', layer: 'vending' },
  [AppMarkerType.CH47]: { icon: FaHelicopter, color: '#f59e0b', label: '支奴干', layer: 'vehicles' },
  [AppMarkerType.CargoShip]: { icon: FaShip, color: '#3b82f6', label: '货船', layer: 'vehicles' },
  [AppMarkerType.Crate]: { icon: FaParachuteBox, color: '#a855f7', label: '空投', layer: 'events' },
  [AppMarkerType.GenericRadius]: { icon: FaLandmark, color: '#6b7280', label: '区域', layer: 'misc' },
  [AppMarkerType.PatrolHelicopter]: { icon: FaPlane, color: '#dc2626', label: '巡逻机', layer: 'vehicles' }
};

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

// ============================================================
// 主组件
// ============================================================

export default function MapView({ server, teamData, focusTarget, onLocatePlayer }) {
  const containerRef = useRef(null);
  const [mapInfo, setMapInfo] = useState({
    markers: [],
    mapSize: 4500,
    monuments: [],
    oceanMargin: 500,
    loading: true
  });

  // 地图变换状态
  const [transform, setTransform] = useState({ scale: 1, x: 0, y: 0 });
  const [isDragging, setIsDragging] = useState(false);
  const [dragStart, setDragStart] = useState({ x: 0, y: 0 });

  // 图层可见性
  const [layerVisibility, setLayerVisibility] = useState({
    players: true,
    events: true,
    vehicles: true,
    vending: false,
    monuments: true
  });

  const [showLayerPanel, setShowLayerPanel] = useState(false);

  const isDemo = !server || !server.connected;

  // ============================================================
  // 数据获取
  // ============================================================

  const fetchMapData = useCallback(async () => {
    if (isDemo) {
      setMapInfo({
        markers: DEMO_MARKERS,
        mapSize: 4500,
        monuments: DEMO_MONUMENTS,
        oceanMargin: 500,
        loading: false
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
          oceanMargin: data.oceanMargin || 500,
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
      if (data.serverId === server?.id) {
        // 队伍数据由父组件管理，这里只做刷新标记
        fetchMapData();
      }
    };

    socketService.on('team:changed', handleTeamChanged);

    // 30秒定时刷新标记
    const refreshInterval = setInterval(fetchMapData, 30000);

    return () => {
      socketService.off('team:changed', handleTeamChanged);
      clearInterval(refreshInterval);
    };
  }, [server?.id, isDemo, fetchMapData]);

  // ============================================================
  // 地图交互
  // ============================================================

  // 滚轮缩放
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const handleWheel = (e) => {
      e.preventDefault();
      e.stopPropagation();
      const scaleSensitivity = 0.001;
      setTransform(t => {
        const newScale = Math.min(Math.max(0.3, t.scale - e.deltaY * scaleSensitivity), 5);
        return { ...t, scale: newScale };
      });
    };

    container.addEventListener('wheel', handleWheel, { passive: false });
    return () => container.removeEventListener('wheel', handleWheel);
  }, []);

  const handleMouseDown = (e) => {
    if (e.button === 0) {
      setIsDragging(true);
      setDragStart({ x: e.clientX - transform.x, y: e.clientY - transform.y });
    }
  };

  const handleMouseMove = (e) => {
    if (isDragging) {
      setTransform(p => ({
        ...p,
        x: e.clientX - dragStart.x,
        y: e.clientY - dragStart.y
      }));
    }
  };

  const handleMouseUp = () => setIsDragging(false);

  // 聚焦到目标
  useEffect(() => {
    if (focusTarget && containerRef.current) {
      const rect = containerRef.current.getBoundingClientRect();
      const size = mapInfo.mapSize;
      const margin = mapInfo.oceanMargin;
      const totalSize = size + 2 * margin;

      // 计算目标在地图上的百分比位置 (0-1)
      const posPercent = {
        x: (focusTarget.x + margin) / totalSize,
        y: (size + margin - focusTarget.y) / totalSize
      };

      // 目标缩放比例
      const targetScale = 2;

      // 因为 transform-origin 是 center，缩放以中心为原点
      // 目标相对于中心的偏移 = (posPercent - 0.5) * containerSize * scale
      // 要让目标居中，translate = -偏移
      const newX = -(posPercent.x - 0.5) * rect.width * targetScale;
      const newY = -(posPercent.y - 0.5) * rect.height * targetScale;

      setTransform({ scale: targetScale, x: newX, y: newY });
    }
  }, [focusTarget, mapInfo.mapSize, mapInfo.oceanMargin]);

  // ============================================================
  // 坐标转换
  // ============================================================

  const getPos = (x, y) => {
    const size = mapInfo.mapSize;
    const margin = mapInfo.oceanMargin;
    const totalSize = size + 2 * margin;

    const left = ((x + margin) / totalSize) * 100;
    const top = ((size + margin - y) / totalSize) * 100;

    return { left: `${left}%`, top: `${top}%` };
  };

  // ============================================================
  // 过滤标记
  // ============================================================

  const filteredMarkers = mapInfo.markers.filter(marker => {
    const config = MARKER_CONFIG[marker.type];
    if (!config) return false;
    return layerVisibility[config.layer];
  });

  const teamMembers = isDemo ? DEMO_TEAM : (teamData?.members || []);

  // 地图图片 URL
  const mapImageUrl = server?.id
    ? `${import.meta.env.VITE_API_URL || '/api'}/servers/${server.id}/map-image?token=${localStorage.getItem('token')}`
    : null;

  // ============================================================
  // 渲染
  // ============================================================

  return (
    <div className="flex flex-col h-full space-y-4 animate-fade-in">
      {/* 顶部标题栏 */}
      <div className="flex justify-between items-end border-b border-white/10 pb-4">
        <div>
          <h3 className="text-3xl font-black italic glow-text uppercase flex items-center gap-3">
            <FaMapMarkedAlt className="text-[#cd5241]" />
            实时战术地图
          </h3>
          <p className="text-[10px] text-gray-500 font-bold uppercase tracking-[0.3em] mt-2 flex items-center gap-2">
            <FaInfoCircle className="text-[#cd5241]" />
            远程地理情报同步中 // [{server?.name || '演示模式'}] {mapInfo.mapSize}M
          </p>
        </div>

        {/* 控制按钮 */}
        <div className="flex items-center gap-3">
          {/* 缩放控制 */}
          <div className="flex bg-black/50 border border-white/10 overflow-hidden tactic-cut">
            <button
              className="px-3 py-2 hover:bg-[#cd5241] text-white transition-colors"
              onClick={() => setTransform(p => ({ ...p, scale: Math.min(p.scale + 0.3, 5) }))}
            >
              <FaPlus size={10} />
            </button>
            <button
              className="px-3 py-2 hover:bg-[#cd5241] text-white transition-colors"
              onClick={() => setTransform(p => ({ ...p, scale: Math.max(p.scale - 0.3, 0.3) }))}
            >
              <FaMinus size={10} />
            </button>
            <button
              className="px-3 py-2 hover:bg-[#cd5241] text-white transition-colors"
              onClick={() => setTransform({ scale: 1, x: 0, y: 0 })}
            >
              <FaExpand size={10} />
            </button>
          </div>

          {/* 刷新 */}
          <button
            className="px-3 py-2 bg-black/50 border border-white/10 tactic-cut hover:bg-[#cd5241] text-white transition-colors"
            onClick={fetchMapData}
          >
            <FaSync size={10} className={mapInfo.loading ? 'animate-spin' : ''} />
          </button>

          {/* 图层切换 */}
          <div className="relative">
            <button
              className={`px-3 py-2 bg-black/50 border border-white/10 tactic-cut text-white transition-colors ${showLayerPanel ? 'bg-[#cd5241]' : 'hover:bg-white/10'}`}
              onClick={() => setShowLayerPanel(!showLayerPanel)}
            >
              <FaLayerGroup size={10} />
            </button>

            {showLayerPanel && (
              <div className="absolute right-0 top-full mt-2 bg-black/95 border border-white/10 tactic-cut p-3 z-50 min-w-[160px]">
                <div className="text-[9px] text-gray-500 font-black uppercase tracking-widest mb-3">图层控制</div>
                {Object.entries(layerVisibility).map(([layer, visible]) => (
                  <button
                    key={layer}
                    className="flex items-center gap-3 w-full px-2 py-1.5 hover:bg-white/5 transition-colors"
                    onClick={() => setLayerVisibility(prev => ({ ...prev, [layer]: !prev[layer] }))}
                  >
                    {visible ? <FaEye className="text-[#a3e635]" size={10} /> : <FaEyeSlash className="text-gray-600" size={10} />}
                    <span className={`text-[10px] font-bold uppercase ${visible ? 'text-white' : 'text-gray-600'}`}>
                      {layer === 'players' && '玩家'}
                      {layer === 'events' && '事件'}
                      {layer === 'vehicles' && '载具'}
                      {layer === 'vending' && '售货机'}
                      {layer === 'monuments' && '纪念碑'}
                    </span>
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* 演示模式提示 */}
      {isDemo && (
        <div className="bg-[#cd5241]/10 border-l-4 border-[#cd5241] p-4 flex items-center gap-4">
          <FaExclamationTriangle className="text-[#cd5241] text-xl flex-shrink-0" />
          <div className="text-xs text-gray-300">
            <span className="font-black text-white uppercase mr-2">[ 演示模式 ]</span>
            当前未连接服务器。连接成功后将自动同步实时地图数据与队友坐标。
          </div>
        </div>
      )}

      {/* 地图容器 */}
      <div
        ref={containerRef}
        className="flex-1 relative bg-[#090a0c] tactic-border tactic-cut overflow-hidden cursor-crosshair shadow-inner"
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        onMouseLeave={handleMouseUp}
      >
        {/* 变换容器 */}
        <div
          className="absolute inset-0 transition-transform duration-75 ease-out origin-center flex items-center justify-center"
          style={{
            transform: `translate(${transform.x}px, ${transform.y}px) scale(${transform.scale})`
          }}
        >
          {/* 地图内容容器 - 保持 1:1 宽高比，居中显示 */}
          <div
            className="relative"
            style={{
              aspectRatio: '1 / 1',
              height: '100%',
              maxWidth: '100%'
            }}
          >
          {/* 地图背景 */}
          {mapImageUrl && (
            <img
              src={mapImageUrl}
              alt="Rust Map"
              className="absolute inset-0 w-full h-full object-fill z-0 opacity-80"
              style={{
                filter: 'grayscale(0.2) contrast(1.1)',
                imageRendering: 'auto'
              }}
              draggable={false}
            />
          )}

          {/* 演示模式背景 */}
          {isDemo && (
            <div className="absolute inset-0 z-0 bg-gradient-to-br from-zinc-900 to-black opacity-80" />
          )}

          {/* 纪念碑 */}
          {layerVisibility.monuments && mapInfo.monuments?.map((mon, i) => (
            <div
              key={`mon-${i}`}
              className="absolute -translate-x-1/2 -translate-y-1/2 z-10 group cursor-pointer"
              style={getPos(mon.x, mon.y)}
            >
              <div className="w-3 h-3 bg-gray-600/30 border border-gray-500/50 rotate-45 group-hover:bg-gray-500/50 transition-colors" />
              <div className="absolute top-4 left-1/2 -translate-x-1/2 text-[8px] text-gray-600 whitespace-nowrap font-black uppercase tracking-tighter opacity-0 group-hover:opacity-100 transition-opacity bg-black/80 px-2 py-1 tactic-cut">
                {mon.name || mon.token}
              </div>
            </div>
          ))}

          {/* 事件/载具标记 */}
          {filteredMarkers.map((marker, i) => {
            const config = MARKER_CONFIG[marker.type];
            if (!config) return null;
            const Icon = config.icon;

            return (
              <div
                key={`marker-${marker.id || i}`}
                className="absolute -translate-x-1/2 -translate-y-1/2 z-20 cursor-pointer group"
                style={getPos(marker.x, marker.y)}
              >
                <div className="relative">
                  {/* 外环发光 */}
                  <div
                    className="absolute -inset-2 rounded-full animate-pulse opacity-30"
                    style={{ backgroundColor: config.color }}
                  />

                  {/* 图标容器 */}
                  <div
                    className="w-6 h-6 rounded-full flex items-center justify-center border-2 transition-transform group-hover:scale-125"
                    style={{
                      backgroundColor: `${config.color}20`,
                      borderColor: config.color
                    }}
                  >
                    <Icon className="text-xs" style={{ color: config.color }} />
                  </div>

                  {/* Tooltip */}
                  <div className="absolute top-8 left-1/2 -translate-x-1/2 bg-black/90 border border-white/10 px-2 py-1 tactic-cut whitespace-nowrap opacity-0 group-hover:opacity-100 transition-opacity z-50">
                    <span className="text-[9px] font-bold uppercase" style={{ color: config.color }}>
                      {config.label}
                    </span>
                    {marker.name && (
                      <div className="text-[8px] text-gray-500">{marker.name}</div>
                    )}
                  </div>
                </div>
              </div>
            );
          })}

          {/* 队友标记 */}
          {layerVisibility.players && teamMembers.map((member, index) => {
            const grid = coordsToGrid(member.x, member.y, mapInfo.mapSize);
            const isLocked = focusTarget?.steamId === member.steamId ||
              (focusTarget?.x === member.x && focusTarget?.y === member.y);

            return (
              <div
                key={member.steamId}
                className="absolute -translate-x-1/2 -translate-y-1/2 transition-all duration-1000 cursor-pointer group"
                style={{
                  ...getPos(member.x, member.y),
                  zIndex: 30 + index  // 确保每个玩家有不同的 z-index
                }}
                onClick={() => onLocatePlayer?.(member)}
              >
                <div className="relative">
                  {/* 脉冲动画 */}
                  <div className={`w-5 h-5 tactic-cut animate-ping absolute opacity-40 ${member.isAlive ? 'bg-[#a3e635]' : 'bg-[#ef4444]'
                    }`} />

                  {/* 主图标 */}
                  <div className={`w-5 h-5 tactic-cut relative z-10 border border-white/20 shadow-2xl flex items-center justify-center ${!member.isAlive
                      ? 'bg-[#ef4444] shadow-[#ef4444]/60'
                      : member.isOnline
                        ? 'bg-[#a3e635] shadow-[#a3e635]/60 animate-pulse'
                        : 'bg-gray-600'
                    }`}>
                    <FaUser className="text-[8px] text-white" />
                  </div>

                  {/* 名称标签 */}
                  <div className="absolute top-7 left-1/2 -translate-x-1/2 bg-black/90 border border-white/10 px-2.5 py-1.5 tactic-cut whitespace-nowrap z-40 shadow-2xl opacity-0 group-hover:opacity-100 transition-opacity">
                    <span className="text-[10px] font-black text-white uppercase tracking-tighter flex items-center gap-2">
                      {member.name}
                      {!member.isAlive && <span className="text-[#ef4444]">[已阵亡]</span>}
                      {!member.isOnline && <span className="text-gray-500">[离线]</span>}
                    </span>
                    <div className="text-[8px] text-gray-500 font-mono mt-0.5">{grid}</div>
                  </div>

                  {/* 锁定特效 */}
                  {isLocked && (
                    <>
                      <div className="absolute -inset-10 border border-[#cd5241] rounded-full animate-ping opacity-30" />
                      <div className="absolute -inset-6 border-2 border-dashed border-[#cd5241] rounded-full animate-spin-slow opacity-50" />
                    </>
                  )}
                </div>
              </div>
            );
          })}

          {/* 锁定目标十字线 */}
          {focusTarget && (
            <div
              className="absolute -translate-x-1/2 -translate-y-1/2 z-50 pointer-events-none transition-all duration-500"
              style={getPos(focusTarget.x, focusTarget.y)}
            >
              <div className="relative">
                <div className="absolute w-20 h-px bg-[#cd5241]/50 -translate-x-1/2 left-1/2" />
                <div className="absolute h-20 w-px bg-[#cd5241]/50 -translate-y-1/2 top-1/2" />
                <div className="absolute top-12 left-1/2 -translate-x-1/2 bg-[#cd5241] text-white text-[10px] font-black px-3 py-1 tactic-cut whitespace-nowrap shadow-xl">
                  已锁定: {focusTarget.name}
                </div>
              </div>
            </div>
          )}
          </div>{/* 关闭地图内容容器 */}
        </div>

        {/* 右下角信息 */}
        <div className="absolute bottom-4 right-4 flex items-center gap-4 text-[10px] text-gray-600 font-bold uppercase bg-black/60 px-3 py-2 tactic-cut">
          <span>缩放: <span className="text-white">{(transform.scale * 100).toFixed(0)}%</span></span>
          <span>在线: <span className="text-[#a3e635]">{teamMembers.filter(m => m.isOnline).length}</span>/{teamMembers.length}</span>
          <span>标记: <span className="text-[#cd5241]">{filteredMarkers.length}</span></span>
        </div>

        {/* 图例 */}
        <div className="absolute bottom-4 left-4 bg-black/60 border border-white/10 tactic-cut p-3">
          <div className="text-[8px] text-gray-500 font-black uppercase tracking-widest mb-2">图例</div>
          <div className="flex flex-wrap gap-3">
            <div className="flex items-center gap-1.5">
              <div className="w-3 h-3 bg-[#a3e635] tactic-cut" />
              <span className="text-[9px] text-gray-400">在线</span>
            </div>
            <div className="flex items-center gap-1.5">
              <div className="w-3 h-3 bg-[#ef4444] tactic-cut" />
              <span className="text-[9px] text-gray-400">阵亡</span>
            </div>
            <div className="flex items-center gap-1.5">
              <div className="w-3 h-3 bg-gray-800 tactic-cut" />
              <span className="text-[9px] text-gray-400">离线</span>
            </div>
            <div className="flex items-center gap-1.5">
              <div className="w-3 h-3 bg-gray-600/30 border border-gray-500/50 rotate-45" />
              <span className="text-[9px] text-gray-400">纪念碑</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
