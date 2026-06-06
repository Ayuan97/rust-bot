import { FaComments, FaLightbulb, FaClock, FaServer, FaInbox, FaQuestionCircle } from 'react-icons/fa';

/**
 * 通用空状态组件
 * @param {string} type - 类型：chat, devices, events, server, history, default
 * @param {string} title - 自定义标题
 * @param {string} message - 自定义描述
 * @param {ReactNode} action - 自定义操作按钮
 * @param {boolean} showTips - 是否显示提示信息
 */
function EmptyState({ type = 'default', title, message, action, showTips = true }) {
  const configs = {
    chat: {
      icon: FaComments,
      en: 'NO COMMS',
      iconColor: 'text-fg-dim',
      defaultTitle: '暂无消息',
      defaultMessage: '队伍聊天消息将在这里显示',
      tips: [
        '在下方输入框发送消息',
        '消息会同步到游戏内队伍聊天',
        '队友在游戏内发送的消息也会显示在这里'
      ]
    },
    devices: {
      icon: FaLightbulb,
      en: 'NO DEVICES',
      iconColor: 'text-hazard',
      defaultTitle: '暂无设备',
      defaultMessage: '在游戏中配对设备后自动添加到这里',
      tips: [
        '进入游戏，找到你的智能设备',
        '按 E 打开设备，点击 Pair with Rust+',
        '设备会自动添加到此列表'
      ]
    },
    events: {
      icon: FaClock,
      en: 'NO EVENTS',
      iconColor: 'text-fg-dim',
      defaultTitle: '当前没有活跃事件',
      defaultMessage: '游戏内事件发生时会在这里显示',
      tips: [
        '货船、直升机刷新时会自动显示',
        '上锁箱子出现时会通知',
        '事件结束后会自动从列表移除'
      ]
    },
    history: {
      icon: FaClock,
      en: 'NO LOGS',
      iconColor: 'text-fg-dim',
      defaultTitle: '暂无历史记录',
      defaultMessage: '游戏事件的历史记录将保存在这里',
      tips: [
        '所有游戏事件都会被记录',
        '最多保留最近 50 条记录',
        '包含事件时间和位置信息'
      ]
    },
    server: {
      icon: FaServer,
      en: 'NO LINK',
      iconColor: 'text-hazard',
      defaultTitle: '请选择服务器',
      defaultMessage: '在左侧列表中选择一个服务器开始',
      tips: [
        '点击左侧服务器列表中的服务器',
        '如果没有服务器，请先配对或手动添加',
        '连接后即可查看详细信息'
      ]
    },
    default: {
      icon: FaInbox,
      en: 'NO DATA',
      iconColor: 'text-fg-mute',
      defaultTitle: '暂无数据',
      defaultMessage: '这里还没有任何内容',
      tips: []
    }
  };

  const config = configs[type] || configs.default;
  const Icon = config.icon;

  return (
    <div className="flex-1 flex flex-col items-center justify-center py-12 px-4">
      {/* 图标 */}
      <div className="w-20 h-20 bg-ink-800 border border-ink-line flex items-center justify-center mb-6">
        <Icon className={`text-4xl ${config.iconColor} opacity-70`} />
      </div>

      {/* 英文遥测标签 */}
      <div className="tac-label mb-2">{config.en}</div>

      {/* 标题 */}
      <h3 className="text-lg font-bold text-fg mb-2 text-center">
        {title || config.defaultTitle}
      </h3>

      {/* 描述 */}
      <p className="text-sm text-fg-dim text-center max-w-xs mb-6 leading-relaxed">
        {message || config.defaultMessage}
      </p>

      {/* 操作按钮 */}
      {action && (
        <div className="mb-6">
          {action}
        </div>
      )}

      {/* 提示信息 */}
      {showTips && config.tips && config.tips.length > 0 && (
        <div className="mt-4 p-4 bg-ink-850 border border-ink-line max-w-sm">
          <div className="flex items-center gap-2 text-fg-dim text-xs font-bold mb-3">
            <FaQuestionCircle className="text-hazard" />
            <span>使用提示</span>
          </div>
          <ul className="space-y-2">
            {config.tips.map((tip, index) => (
              <li key={index} className="flex items-start gap-2 text-xs text-fg-dim">
                <span className="w-4 h-4 bg-ink-800 border border-ink-line flex items-center justify-center flex-shrink-0 mt-0.5 text-[10px] font-mono text-fg-dim tabular-nums">
                  {index + 1}
                </span>
                <span>{tip}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

export default EmptyState;
