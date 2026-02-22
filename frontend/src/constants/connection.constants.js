export const CONNECTION_STATES = {
  DISCONNECTED: 'DISCONNECTED',
  QUEUED: 'QUEUED',
  ASSIGNED: 'ASSIGNED',
  CONNECTING: 'CONNECTING',
  CONNECTED: 'CONNECTED'
};

export const PENDING_CONNECTION_STATES = new Set([
  CONNECTION_STATES.QUEUED,
  CONNECTION_STATES.ASSIGNED,
  CONNECTION_STATES.CONNECTING
]);

export const CONNECTION_STATE_META = {
  [CONNECTION_STATES.DISCONNECTED]: {
    label: '未连接',
    summary: '未建立',
    dotClass: 'bg-gray-800',
    actionLabel: '建立远程连接',
    loadingLabel: '正在建立连接...',
    isPending: false
  },
  [CONNECTION_STATES.QUEUED]: {
    label: '排队中',
    summary: '连接中',
    dotClass: 'bg-yellow-500 animate-pulse shadow-[0_0_8px_#eab308]',
    actionLabel: '取消连接请求',
    loadingLabel: '正在取消连接...',
    isPending: true
  },
  [CONNECTION_STATES.ASSIGNED]: {
    label: '已分配节点',
    summary: '连接中',
    dotClass: 'bg-yellow-500 animate-pulse shadow-[0_0_8px_#eab308]',
    actionLabel: '取消连接请求',
    loadingLabel: '正在取消连接...',
    isPending: true
  },
  [CONNECTION_STATES.CONNECTING]: {
    label: '握手中',
    summary: '连接中',
    dotClass: 'bg-yellow-500 animate-pulse shadow-[0_0_8px_#eab308]',
    actionLabel: '取消连接请求',
    loadingLabel: '正在取消连接...',
    isPending: true
  },
  [CONNECTION_STATES.CONNECTED]: {
    label: '已连接',
    summary: '已连接',
    dotClass: 'bg-[#3b82f6] shadow-[0_0_8px_#3b82f6]',
    actionLabel: '断开连接',
    loadingLabel: '正在断开连接...',
    isPending: false
  }
};

export function getConnectionStateMeta(state) {
  return CONNECTION_STATE_META[state] || CONNECTION_STATE_META[CONNECTION_STATES.DISCONNECTED];
}
