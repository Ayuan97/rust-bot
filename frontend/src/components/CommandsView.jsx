import { FaRobot } from 'react-icons/fa';
import { GAME_COMMANDS } from '../constants/commands';

// 游戏内命令速查（登录后 dashboard）。数据源 constants/commands.js，与后端命令保持一致。
export default function CommandsView() {
  return (
    <div className="flex flex-col h-full space-y-4 animate-fade-in font-sans overflow-y-auto">
      {/* 标题 */}
      <div className="border-b border-ink-line pb-4">
        <div className="tac-label mb-1">GAME COMMANDS</div>
        <h3 className="text-xl font-extrabold text-fg tracking-tight flex items-center gap-2">
          <FaRobot className="text-hazard" /> 游戏内命令
        </h3>
        <p className="font-mono text-[11px] text-fg-mute mt-1.5 uppercase tracking-wider">
          队伍聊天直接输入 · 机器人即时回复
        </p>
      </div>

      {/* 使用说明 */}
      <div className="tac-panel p-4 flex items-start gap-3">
        <span className="font-mono text-hazard text-xs shrink-0 mt-0.5">[i]</span>
        <div className="text-sm text-fg-dim leading-relaxed">
          在 <span className="text-fg font-bold">Rust 游戏内「队伍聊天」</span>输入下列指令（带 <code className="font-mono text-hazard">!</code> 前缀），
          机器人会即时把结果发回聊天框、全队可见，无需切出游戏。游戏里发 <code className="font-mono text-hazard">!help</code> 也能随时列出全部命令。
        </div>
      </div>

      {/* 命令分组 */}
      <div className="grid sm:grid-cols-2 gap-4">
        {GAME_COMMANDS.map((g) => (
          <div key={g.group} className="tac-panel">
            <div className="tac-label px-4 h-11 flex items-center gap-2 border-b border-ink-line text-hazard">
              <span className="w-1.5 h-1.5 bg-hazard" /> {g.group}
            </div>
            <div className="p-4 space-y-3.5">
              {g.items.map((it) => (
                <div key={it.cmd} className="flex items-start gap-3">
                  <code className="font-mono text-[13px] text-hazard font-bold whitespace-nowrap shrink-0 min-w-[132px]">{it.cmd}</code>
                  <div className="text-[12.5px] text-fg-dim leading-snug">{it.desc}</div>
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
