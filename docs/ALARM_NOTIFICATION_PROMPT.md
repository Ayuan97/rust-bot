# 实现工单(AI 提示词):游戏警报的「外部强提醒」系统

> 用法:把本文件**整篇**作为提示词发给任意 AI 编码助手即可。它是自包含的——包含项目背景、已核实的架构事实、完整需求规格、分阶段开发计划、必须遵守的约束与验收标准。若接手的 AI 直接在本仓库内工作,让它先读本文件再动手。
>
> 配套设计文档:`docs/ALARM_NOTIFICATION.md`(同一功能的设计存档,可交叉参考)。

---

## 0. 你的角色与总目标

你是一名资深全栈工程师,在一个**已存在的生产项目**里**增量实现**一个功能:当玩家在 Rust(游戏《腐蚀》)服务器里的「智能警报(Smart Alarm)」被触发(基地被袭击)时,系统通过 **Bark 推送 + 真实语音电话**把本人和队友「叫回来」,并提供一套**低打扰的停止/静音机制**。

硬性要求:
- **增量开发,精准修改**,不要重写、不要大规模重构、不要改无关代码。
- **严格遵守本项目既有规范**(见 §7)。
- **分阶段交付**(见 §6),每阶段可独立验证。

---

## 1. 项目背景

- **定位**:多租户 SaaS,Rust+ 游戏服务器管理面板。一个「用户(userId)」= 一个付费租户。
- **技术栈**:
  - 后端:Node.js 20 + Express + `mysql2` + Socket.io,**ESM**(`import/export`)。
  - 前端:React 18 + Vite 5 + Tailwind CSS + Axios + socket.io-client。
  - 第三方:`@liamcottle/rustplus.js`、BattleMetrics、支付宝(`alipay-sdk`)。
- **关键目录/文件**:
  - `backend/src/app.js`:主节点入口。
  - `backend/src/services/`:服务层(`global-manager`、`user-service-manager`、`user-fcm-manager`、`user-event-monitor`、`user-commands`、`notification.service` 等)。
  - `backend/src/routes/`:REST 路由(`auth`/`server`/`settings`/`payment`/`admin` 等)。
  - `backend/src/middleware/auth.middleware.js`:`authenticate` / `requireAdmin` / `requireActiveSubscription`。
  - `backend/src/lib/db.js`:mysql2 连接池与事务入口。
  - `backend/sql/init.sql`:**数据库结构唯一事实来源**(本项目不用 ORM 迁移,改表只改这里)。
  - `frontend/src/services/`:前端 API(`api.js`)与 Socket(`socket.js`)封装。
- **服务实例模型**:`GlobalServiceManager`(全局单例)管理 `Map<userId, UserServiceManager>`;每个 `UserServiceManager`(每用户一实例)挂着 FCM、事件监控、命令、自动化、玩家追踪等子服务,并通过 `EventEmitter` 向上转发事件,最终经 WebSocket 推给 `user:${userId}` 房间。

---

## 2. 已核实的关键架构事实(直接采用,可节省大量探查)

> 以下结论来自对本仓库的实际核实;**行号供定位参考,动手前请在代码中自行确认**(代码可能已变动)。

1. **警报链路全部在主节点同一进程内**,不跨节点:
   - 来源有两条:① FCM 推送(`user-fcm-manager.js`);② connector 回传的 `entity:changed`(设备 `type==='ALARM'` 且变为 true,见 `user-service-manager.js:306` 附近)。
   - 两条都汇入 `user-service-manager.js` 的 `_handleAlarmTriggered`(约 `:1447`),在约 `:1541` `this.emit('alarm:triggered', data)`。
   - `global-manager.service.js`(约 `:458`)监听 `alarm:triggered`,调用 `notificationService.notifyAlarm(data)`(约 `:461`)。
2. **「这套分布式很轻」**:只有「与 Rust 服务器的原始连接 + 命令执行 + 事件回传」下放到 connector 节点;FCM、警报判定、队伍在线追踪、聊天命令、通知**都在主节点 `UserServiceManager` 进程里**。
   - **推论(重要)**:本功能新增的「频率计数 / 静音状态 / 队伍在线状态」的**生产者和消费者都在主节点同进程**。因此:
     - **频率计数、队伍在线状态 → 用主节点进程内存即可,不要建跨节点表。**
     - **只有「静音设置」建议持久化**(重启不丢 + 用户可在面板/游戏内配置)→ 存入现有 `notification_settings` 表的 `settings` JSON。
3. **可直接复用的现成件**:
   - `user-service-manager.js` 约 `:49` 有 `recentAlarmTriggers`(Map)+ `ALARM_NOTIFICATION_DEDUP_WINDOW_MS`(近期警报**去重窗口**)→ 本功能的「半小时 N 次」**频率控制就是它的加强版**,优先扩展它,而非新建机制。
   - `user-event-monitor.js` 约 `:254` 的 `eventData.teamMembers`(Map,**主节点内存**)= 队伍在线状态,「全队是否在线 / 是否有人上线」直接读它(`!afk`/`!online` 命令已经这么用)。
   - `notification.service.js` 已实现 Bark,文件头注释已预留「按 `data.userId` 读用户配置表 + 多渠道」的演进路径——**顺这条路扩展,别另起炉灶**。
   - 游戏内命令:`user-service-manager.js` 约 `:290` 判断 `message.startsWith('!')` → `commandsService.handleMessage(...)`;命令开关读 `notification_settings.settings` 里的 `cmd_*` 键。新命令 `!关闭通知` 在这里接入。
   - 配置读写参考 `backend/src/routes/settings.routes.js`(per-user `notification_settings`,GET/POST `/settings/notifications`)。
4. **(可选)若将来要对本功能单独收费**:`orders` 表的 `type ENUM('TOPUP','AUTH_BUY','SERVICE_FEE','ADMIN_ADJUST')` 已为多业务订单预留,可新增一个 type 值**复用整套支付宝下单/回调/幂等链路**,无需新建支付通道;套餐表 `subscription_plans`、`requireActiveSubscription` 中间件、`global-manager` 定时扫 `endDate` 拉起/下线实例的模式均可仿用。

---

## 3. 需求规格(要实现的功能)

### 3.1 关键概念:两套「通知」不要混淆

| 维度 | 游戏内队伍播报(**已存在,勿动其语义**) | 外部强提醒(**本工单要做**) |
|------|------|------|
| 出口 | 游戏内队伍聊天 | Bark 推送 / 语音电话 |
| 对象 | 所有在线队友 | 本人 + 订阅的队友 |
| 前提 | 人在游戏里 | 人在游戏外也能触达 |
| 内容 | 货船/直升机/油井等事件 | Smart Alarm 袭击警报 |
| 配置 | `NotificationSettings.jsx` + `notification_settings` 表 | 本工单新增 |

外部强提醒的目的是「把游戏外的人叫回来」——这决定了它的触发规则(全队离线才外呼)和静音逻辑(有人上线即停)。

### 3.2 渠道:Bark + 阿里云语音电话(双通道,可同时开)

- **Bark**:已实现,保留。iOS 强提醒。
- **阿里云语音电话**:新增。用 `dyvmsapi` 的 `SingleCallByTts`(TTS 模板)。
  - **平台凭证全局一份**,走 `.env`:`ALIYUN_VOICE_ENABLED / ALIYUN_AK_ID / ALIYUN_AK_SECRET / ALIYUN_VOICE_TTS_CODE / ALIYUN_VOICE_SIGN / ALIYUN_VOICE_SHOW_NUMBER`。
  - 语音内容**只能用已报备的 TTS 模板 + 变量槽**(如 `设备${name}触发警报`),不能发任意文字。
  - 建议依赖:`@alicloud/pop-core`(ESM 下 `import pkg from '@alicloud/pop-core'; const { RPCClient } = pkg;`,**需实测确认导入方式**)。
- 两个渠道可同时开;用户/订阅者各自选择接收方式。

### 3.3 通知对象:轻量订阅 + 代填(两者并存)

- **三类人群不重合**:付费账号(租户,一般一人)/ 游戏队伍(Steam 层 N 人,非平台用户)/ 真正要触达的人(本人 + 部分队友)。
- **轻量订阅(自助)**:本人生成邀请链接分享给队友;队友打开后**自助填写手机号 / Bark**,订阅「该用户 + 该服务器」的警报;**队友不必注册平台账号**,且可**自助退订**。
- **代填**:本人也可直接替队友填号码 / Bark。
- 订阅数据严格按「`userId` + `serverId`」归属隔离。

### 3.4 触发规则:全队离线才启动外部强提醒

- **仅当「全队无人在线」时**才发 Bark + 电话(有人在线时只走游戏内播报,不外呼,避免骚扰 + 省话费)。
- 在线判定基于 `user-event-monitor` 的 `teamMembers`(内存、轮询数据,**有滞后,需容错**,例如「判定全队离线后再确认一次仍全员离线才外呼」)。
- **本期不区分 AFK**(在线但挂机视为在线,缺口已知)。

### 3.5 频率控制:半小时内最多 N 次

- 可配置 N,**默认 2 次 / 半小时**(≈每 15 分钟一轮)。
- N 是**频率上限(控制密度)**,不是总量:无人上线、无人手动关时,**跨窗口持续发送,直到有人上线或被手动静音**。
- **不做自动硬上限**;靠「保守默认低频 + 手动关 + 有人上线」兜底。

### 3.6 静音机制(停止通知)

**三个静音入口,满足任一即停:**
1. 游戏内命令 **`!关闭通知`** → 静音 **6 小时**,到期自动恢复。
2. 网站点击「关闭通知」→ 时长档位 **30 分钟 / 2 小时 / 6 小时**(默认 6h)+ **「立即恢复」** 按钮。
3. **有队友上线**(离线→在线的状态变化)→ 自动停止当前这轮。

**静音语义(必须严格遵守):**
- **只掐外部强提醒(电话 + Bark);游戏内队伍播报照常**(袭击时的战术情报不能一起关)。
- 静音期间 **Smart Alarm 照常监控、警报照常记录**(网站可见),只是**不外呼**。
- **全队 / 整服生效**(不只发命令的那个人)。
- 权限:第一版**任何队友都能发** `!关闭通知`(未来可收紧到队长)。
- **自动恢复实现方式**:不要起定时任务;每次「要外呼前」实时判断「当前是否在静音窗口内」(比较 `muteUntil` 时间戳)即可。

**反馈闭环(必须有):**
- 发 `!关闭通知` → 游戏内队伍聊天回执:`已关闭外部警报 6 小时,将于 HH:MM 恢复`。
- 网站静音后 → UI 显示:`已静音,剩余 mm:ss [立即恢复]`。

### 3.7 配置项汇总

| 层级 | 配置项 | 存放 |
|------|--------|------|
| 平台级 | 阿里云 `AK_ID/AK_SECRET/TTS_CODE/SIGN/SHOW_NUMBER`;Bark(现状) | `.env` |
| 用户级 | 渠道开关(Bark / 电话)、本人接收号码、频率 N、默认静音时长档、当前静音到期时间 | `notification_settings.settings`(JSON) |
| 订阅者级 | 接收号码 / Bark、来源(自助/代填)、退订状态 | 新建表(per `userId+serverId`) |

---

## 4. 数据模型指引

- **不要为「频率计数」「队伍在线」建表**(主节点内存即可,见 §2)。
- **静音设置**:存入 `notification_settings.settings` JSON(新增键,如 `alarm_mute_until`、`voice_enabled`、`bark_enabled`、`alarm_rate_per_30min`、`alarm_self_phone` 等)。
- **警报订阅者**:新建一张表(概念字段)`userId / serverId / channel(voice|bark) / target(手机号或 bark key) / source(self_fill|invited) / active / createdAt / updatedAt`。
  - **动手前先核实** `users.id` / `servers.id` 的类型(决定外键与字段类型)。
- **邀请链接**:用带签名/随机 token 的方式标识「某 userId + serverId 的订阅入口」;订阅页与退订页是**无登录公开端点**,需独立的 token 校验(不要走 `authenticate`),并防滥用/号码枚举。

---

## 5. 必须遵守的项目约束(违反即不合格)

1. **多租户隔离**:涉及用户数据的 SQL 必须带 `userId` 过滤或先做归属校验(如先查 `servers.id + userId`)。禁止跨用户查询/推送/改状态。订阅者数据按 `userId+serverId` 隔离。
2. **认证与订阅**:受保护路由用 `authenticate`;写操作按需叠加 `requireActiveSubscription`;WebSocket 握手校验 JWT,推送只用 `io.to('user:${userId}')`,禁止 `io.emit` 广播用户数据。
3. **WebSocket 事件命名**:`resource:action` / `:action:success` / `:action:error`。
4. **数据库变更**:只改 `backend/sql/init.sql`,补齐索引/外键/默认值,评估并补齐多租户字段。
5. **SQL**:一律参数化查询(`?` 占位),禁止字符串拼接;跨表写用事务。
6. **后端风格**:ESM,路由层保持轻量(校验 + 鉴权 + 调 service),业务下沉到 service。
7. **前端**:API 走 `frontend/src/services/`;**UI 必须遵循「战术遥测(Tactical Telemetry)」设计系统**(见 `docs/DESIGN_SYSTEM.md`):复用设计 token(`ink/fg/hazard/terminal`)与 `.tac-*` 基类;唯一强调色 hazard 红(`#E0452E`),**禁蓝/紫/绿**;中文**绝不** italic/uppercase/字距加宽(仅纯英文标签如 `FCM/ONLINE` 用 mono 大写);**零圆角**(直角 + 发丝线 + 四角角标);全屏铺满不居中限宽。复用现有组件(`TacticToggle` 等)。
8. **状态归属**:遵循 §2 推论——频率/在线用主节点内存,静音持久化用 `notification_settings`,**不要建跨节点表**。
9. **提交规范**:`type: 描述`(feat/fix/refactor/chore/docs);**禁止任何 AI 署名**(如 `Co-Authored-By`);不做无关重构。
10. **回复语言**:中文。

---

## 6. 开发计划(分阶段实现,每阶段附验收标准)

> 建议顺序:**先做不依赖阿里云的 阶段二/三/四/五,阿里云就绪后再做 阶段一的语音实发 + 阶段六联调**。

- **阶段一 · 阿里云语音渠道接入(与 Bark 双通道)+ 本人号码**
  - 实现:`notification.service.js` 增加 `_sendVoiceCall()`;`notifyAlarm()` 改为「Bark 照发 + 按 `data.userId` 读配置决定是否外呼」;加依赖、env、本人号码配置接口与前端。
  - 顺手修复:`notifyAlarm` 兜底字段 `deviceName` 与 FCM 实际 `entityName` 不一致的问题。
  - 验收:配好 env 与本人号码后,模拟一次 `alarm:triggered` 能同时收到 Bark 与电话。
- **阶段二 · 通知对象:订阅链接 + 代填 + 退订**
  - 验收:能生成邀请链接;队友自助填号成功订阅;本人能代填;订阅者能退订;警报按订阅列表群发(Bark/电话各按订阅渠道)。
- **阶段三 · 触发规则(全队离线判断)+ 频率控制**
  - 验收:全队在线时不外呼;全队离线时按「N 次/半小时」发送;频率符合配置;复用 `teamMembers` 与 `recentAlarmTriggers`。
- **阶段四 · 静音机制(`!关闭通知` + 网站开关 + 上线自动停 + 回执)**
  - 验收:三入口都能静音并按时恢复;静音只掐外呼、游戏内播报照常;静音期间仍监控+记录;静音/恢复都有回执。
- **阶段五 · 前端配置 UI + 订阅页**
  - 验收:遵循战术遥测设计系统;本人能配齐渠道/号码/频率/静音档;无登录订阅页可用。
- **阶段六 · 联调与默认值校准**
  - 验收:真实环境端到端走通一次袭击场景(真 Rust 服务器触发真警报、真手机接电话);校准默认 N 与静音档。

---

## 7. 外部依赖与上线前必办项

1. **阿里云语音服务**(由项目方/用户负责,非编码任务,是关键路径上最长的卡点):
   - 开通「语音服务」;**可能需要企业实名认证**(个人账号可能无法使用语音通知,需先验证能否开通)。
   - **报备一个 TTS 模板**(审核制,通常 1–2 工作日),拿到 `TtsCode`;模板变量名要与代码里的 `${name}` 等对齐。
2. **FCM 真实 payload 字段**:`alarm:triggered` 的字段名(`deviceName` vs `entityName` 等)需**触发一次真实警报实测确认**,再定语音模板变量取值。
3. **成本与防骚扰**:语音电话按通计费;默认 N 取保守值;误报 + 长期无人响应时靠低频 + 手动关控制成本。

---

## 8. 本期非目标(明确不做,**不要画蛇添足加回来**)

- 完整团队/席位计费体系。
- AFK 精细判断(在线但挂机视同离线)。
- 接电话回执确认(谁接通就不再呼叫谁)——需接阿里云状态回执,本期不做。
- 微信/短信等其他渠道(项目里微信支付也尚未实现,勿照抄)。
- 警报事件(incident)复杂状态机与自动收敛。

**砍掉它们的原因**:控制本期复杂度;且核实表明「通知在主节点单进程」,无需为不存在的分布式场景做重设计。以上均可作为未来迭代项。

---

## 9. 总验收标准

1. 游戏内 Smart Alarm 触发(全队离线)→ 本人及订阅队友按各自渠道收到 Bark/电话;有人在线时不外呼。
2. 通知频率符合「半小时 N 次」配置;持续到有人上线或手动静音。
3. `!关闭通知`(6h)、网站静音(档位 + 立即恢复)、有人上线 三种方式都能停外呼,且只停外呼、游戏内播报照常;均有回执。
4. 全程满足多租户隔离、鉴权、参数化查询、设计系统等 §5 约束。
5. `backend/sql/init.sql` 同步了所有表/字段变更。
6. 分阶段提交,提交信息规范且无 AI 署名。

---

## 10. 给接手 AI 的工作方式建议

- **动手前先核实** §7.2、§4 里的待确认点(`users.id`/`servers.id` 类型、FCM 真实字段),不要臆测。
- **分阶段交付**,每阶段交付后等确认再继续;每步定义清晰的验证方式。
- **优先复用** §2 列出的现成件,保持精准修改。
- 遇到不确定或多种实现可能,**明确列出并说明权衡,不要默默选一种**。
