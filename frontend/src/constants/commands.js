// 游戏内 Bot 命令清单（前端展示用）。
// 与 backend/src/services/user-commands.js 的 registerBuiltInCommands 保持同步——后端是命令的事实源。
// 玩家在 Rust 游戏内「队伍聊天」直接输入这些指令，机器人即时回复，无需切出游戏。

export const GAME_COMMANDS = [
  {
    group: '信息查询',
    items: [
      { cmd: '!help', desc: '列出全部可用命令' },
      { cmd: '!time', desc: '游戏时间与日出 / 日落倒计时' },
      { cmd: '!pop', desc: '服务器当前在线人数' },
      { cmd: '!team', desc: '队伍统计信息' },
      { cmd: '!online', desc: '当前在线的队友' },
      { cmd: '!afk', desc: '正在挂机的队友' },
      { cmd: '!leader', desc: '移交队长（!leader <名字>）' },
    ],
  },
  {
    group: '事件监控',
    items: [
      { cmd: '!cargo', desc: '货船状态与位置' },
      { cmd: '!heli', desc: '武装直升机状态' },
      { cmd: '!small', desc: '小型石油钻井平台状态' },
      { cmd: '!large', desc: '大型石油钻井平台状态' },
    ],
  },
  {
    group: '实用工具',
    items: [
      { cmd: '!shop <物品名>', desc: '搜全图售货机有没有卖该物品' },
      { cmd: '!tr <语言> <文本>', desc: '翻译文本（默认从英文翻译）' },
      { cmd: '!trf <源> <目标> <文本>', desc: '指定源语言翻译' },
    ],
  },
  {
    group: '警报控制',
    items: [
      { cmd: '!静音', desc: '临时静音突袭警报 6 小时（!mute 同效）' },
    ],
  },
];
