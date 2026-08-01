# 前端设计系统 — Tactical Telemetry（战术遥测）

Rust+ Dashboard 前端的统一设计语言。**所有页面/组件必须遵循本系统**；改前端前先读本文档，复用既有 token 与组件基类，不要手写一套。

## 1. 设计语言

**Tactical Telemetry（暗色战术遥测）** —— 源自军事 CRT 终端 / 航天 HUD 美学。冷峻、机械、高数据密度，契合 Rust 游戏的军事生存调性。

一句话气质：暗底 + 单一锈红强调 + 等宽英文遥测标签 + 发丝线网格 + 克制的 CRT 质感。

## 2. 颜色（token 定义在 `frontend/tailwind.config.js`）

| token | 值 | 用途 |
|-------|-----|------|
| `ink-900` | `#0A0A0A` | 主背景（停用 CRT，避免纯黑） |
| `ink-850 / 800 / 700` | `#0F0F0F / #141414 / #1A1A1A` | 面板 / 抬升 / 输入凹陷 |
| `ink-line / ink-line2` | `#2A2A2A / #3A3A3A` | 发丝线边框 |
| `fg / fg-dim / fg-mute` | `#EAEAEA / #9A9A9A / #6A6A6A` | 主 / 次 / 弱 文字 |
| `hazard` | `#E0452E`（Rust 锈红） | **唯一强调色** |
| `terminal` | `#4AF626` | 终端绿，**仅用于单点状态**（online/done） |

> **铁律：唯一强调色 hazard 红，禁蓝 / 紫 / 绿。** terminal 绿只点缀单个状态指示，绝不当通用文字色。低对比灰（`text-gray-600/700`）禁止用于文字，最低 `fg-dim`。

## 3. 字体（中英分治）

- **中文**：系统黑体栈（PingFang SC / 微软雅黑 / 思源黑体），靠**字重 + 字号**拉层级。
- **英文 / 数字 / ID / 坐标**：JetBrains Mono（`index.html` 引入），`uppercase` + 字距。
- **中文绝不 `italic` / `uppercase` / `tracking-widest`**（机械斜体糊、大写对中文无效、字距把中文拉散）。只有**纯英文标签**（FCM / LINK / ONLINE / COORD）才 mono + 大写 + 字距。

## 4. 组件基类（定义在 `frontend/src/styles/index.css` 的 `@layer components`）

| 类 | 用途 |
|----|------|
| `.tac-panel` | 面板：直角 + 发丝线边框 |
| `.tac-label` | 遥测标签：英文 mono + 大写 + 字距 |
| `.tac-readout` | 数据读数：mono + 等宽数字（tabular-nums） |
| `.tac-btn` / `.tac-btn-primary` / `.tac-btn-ghost` | 按钮（主 / 次） |
| `.tac-input` | 输入框 |
| `.tac-corners` | 四角 hazard 角标 |
| `.tac-fx` | 全局 CRT 扫描线 + 噪点质感层（页面根挂一次） |
| `.tac-barcode` | 竖向 barcode 装饰 |

**改前端必须复用这些基类 + token，不要重新手写颜色/边框/按钮。**

## 5. 布局铁律

- **零圆角**：直角 + 发丝线网格（`grid gap-px` + 父子对比底色生成发丝线）+ 四角角标。（唯一例外：地图热力辐射点用 `rounded-full`，那是雷达语义不是 UI chrome。）
- **全屏铺满**：dashboard / 控制台类**不居中限宽**（`max-w-7xl mx-auto` 会显小气），内容区铺满。
- 发丝线分隔优于卡片阴影；阴影几乎不用。

## 6. 内容铁律

- **结合 Rust 游戏实际**：泛泛占位数据（"核心区总电闸"）会显业余。设备按 Rust+ 真实模型——**智能开关 / 智能警报 / 储物监视器**（自动炮塔、火焰陷阱、车库门、地堡串灯、**工具柜 TC 上料倒计时**、领地柜警报）；事件按真实类型（货船 / 直升机 / CH47 / 补给信号 / 上锁箱子）；自动化按真实模式（白天 / 夜晚 / 在线开启）。

## 7. 参考标杆（照着写）

- **入口页**：`frontend/src/pages/LoginPage.jsx`、`RegisterPage.jsx`（左视觉 + 右表单、中英混排）
- **全屏数据台**：`frontend/src/App.jsx`（全屏布局 + 真实设备模型）
- **数据密集 / 表格**：`frontend/src/components/DeviceControl.jsx`、`components/admin/SurvivorRoster.jsx`、`NodeMonitor.jsx`
- **地图 + 热力图**：`frontend/src/components/MapView.jsx`（活动热力 = terminal 绿 / 死亡热力 = hazard 红，图层可切换）

## 8. 改前端自检清单

- [ ] 用了 token（ink / fg / hazard / terminal）和 `.tac-*` 基类，没手写旧色（`#cd5241`/`tactic-cut`/`glow-text`）？
- [ ] 没有蓝 / 紫 / 绿杂色？中文没有 `italic` / `uppercase`？
- [ ] 直角（无 `rounded`）？发丝线分隔？布局全屏铺满不居中？
- [ ] 内容贴近 Rust 实际，不是泛泛占位？
- [ ] 只改样式、没动业务逻辑？`npm --prefix frontend run build` 通过？

---

> 历史：本设计系统于 2026-06 全站落地，方法论参考 `industrial-brutalist-ui` 的 Tactical Telemetry（暗色）模式。
