# Rust 坐标系统说明

## 概述

Rust 游戏使用网格坐标系统，类似于国际象棋的坐标表示法（如 A5, B12）。本系统参考 [rustplusplus](https://github.com/alexemanuelol/rustplusplus) 实现了完整的坐标转换功能。

## 坐标系统原理

### 网格大小

每个网格的标准大小为 **146.25** 单位（游戏内单位）。

### 网格命名规则

- **横轴（X）**: 使用字母表示（A, B, C, ..., Z, AA, AB, ...）
- **纵轴（Y）**: 使用数字表示（0, 1, 2, ..., 29）
- **组合格式**: 字母 + 数字（如 A5, M15, AA20）
- **子网格**: 在大网格内进一步细分为 3×3 共 9 个子格（如 M15-1, M15-9）

### 子网格系统

每个大网格（146.25 单位）被分割为 **3×3 = 9** 个子网格，编号为 1-9：

```
┌───┬───┬───┐
│ 7 │ 8 │ 9 │  ← 上方（北）
├───┼───┼───┤
│ 4 │ 5 │ 6 │  ← 中间
├───┼───┼───┤
│ 1 │ 2 │ 3 │  ← 下方（南）
└───┴───┴───┘
  ↑   ↑   ↑
 左  中  右
(西)(中)(东)
```

**子网格大小**: 146.25 ÷ 3 = **48.75** 单位

**完整示例**: `M15-5` 表示在 M15 网格的中心位置

### 坐标转换流程

1. **修正地图大小** - 将地图大小对齐到网格边界
2. **计算网格索引** - 根据 X/Y 坐标计算所在网格
3. **转换为网格位置** - 将索引转换为字母+数字格式

## 实现详情

### 核心常量

```javascript
const GRID_DIAMETER = 146.25; // 每个网格的大小
```

### 关键函数

#### 1. `getCorrectedMapSize(mapSize)`

修正地图大小，确保网格能够整齐对齐。

**算法逻辑**:
```javascript
remainder = mapSize % GRID_DIAMETER
offset = GRID_DIAMETER - remainder

if (remainder < 120):
    return mapSize - remainder  // 缩小到下一个网格边界
else:
    return mapSize + offset     // 扩大到下一个网格边界
```

**示例**:
- 地图大小 4000 → 修正为 4096
- 地图大小 3000 → 修正为 2926.5

#### 2. `numberToLetters(num)`

将数字转换为字母表示（Excel 列名算法）。

**转换规则**:
- 1 → A
- 26 → Z
- 27 → AA
- 52 → AZ
- 53 → BA

#### 2.5. `getSubGridNumber(x, y, mapSize)`

计算坐标在网格内的子网格编号（1-9）。

**算法逻辑**:
```javascript
1. 找到当前坐标所在的大网格起始位置
2. 计算在网格内的相对位置: relativeX, relativeY
3. 计算子网格大小: GRID_DIAMETER / 3 = 48.75
4. 计算子网格索引: floor(relative / 48.75)
5. 转换为 1-9 编号（从左下角开始，向右向上）
```

**编号规则**:
```
子网格索引 (x, y) → 编号
(0, 0) → 1   (左下)
(1, 0) → 2   (中下)
(2, 0) → 3   (右下)
(0, 1) → 4   (左中)
(1, 1) → 5   (中心)
(2, 1) → 6   (右中)
(0, 2) → 7   (左上)
(1, 2) → 8   (中上)
(2, 2) → 9   (右上)
```

**算法**:
```javascript
function numberToLetters(num) {
  const mod = num % 26;
  let pow = Math.floor(num / 26);
  const out = mod ? String.fromCharCode(64 + mod) : (pow--, 'Z');
  return pow ? numberToLetters(pow) + out : out;
}
```

#### 3. `getGridPosLettersX(x, mapSize)`

根据 X 坐标计算网格字母。

**工作原理**:
- 将地图横向分割为多个 146.25 单位的网格
- 遍历每个网格，找到 X 坐标所在的网格索引
- 将索引转换为字母

**示例**:
```
x = 300, mapSize = 4000
网格索引 = 3 (因为 300 在 292.5-438.75 范围内)
结果 = "C"
```

#### 4. `getGridPosNumberY(y, mapSize)`

根据 Y 坐标计算网格数字。

**特殊之处**: Y 轴是**从下往上**递增的（游戏内坐标系统），因此需要反转：

```javascript
numberOfGrids = Math.floor(mapSize / GRID_DIAMETER);
gridIndex = numberOfGrids - counter;
```

**示例**:
```
y = 1500, mapSize = 4000
网格总数 = 27
当前网格索引 = 11
结果 = 27 - 11 = 16
```

#### 5. `getGridPos(x, y, mapSize)`

主函数：将游戏坐标转换为网格位置。

**流程**:
1. 修正地图大小
2. 检查坐标是否在有效范围内
3. 计算网格字母（X 轴）
4. 计算网格数字（Y 轴）
5. 组合返回（如 "C16"）

#### 6. `formatPosition(x, y, mapSize)`

格式化坐标显示，同时包含网格位置和精确坐标。

**参数**:
- `includeSubGrid` (boolean): 是否包含子网格编号，默认 `true`

**输出格式**:
- 带子网格: `M15-5(1823,2145)`
- 不带子网格: `M15(1823,2145)`
- 超出网格: `(1234,5678)`

## 使用示例

### 在命令中使用

```javascript
import { formatPosition } from '../utils/coordinates.js';

// 获取服务器信息
const serverInfo = await rustPlusService.getServerInfo(serverId);
const mapSize = serverInfo.mapSize || 4000;

// 格式化玩家位置
const teamInfo = await rustPlusService.getTeamInfo(serverId);
teamInfo.members.forEach(member => {
  const pos = formatPosition(member.x, member.y, mapSize);
  console.log(`${member.name}: ${pos}`);
});
```

**输出示例**:
```
# 带子网格（默认）
玩家1: M15-5(1823,2145)
玩家2: A5-8(234,567)
玩家3: Z29-3(3897,4021)

# 不带子网格
玩家1: M15(1823,2145)
玩家2: A5(234,567)
玩家3: Z29(3897,4021)
```

### 在死亡通知中使用

```javascript
import { formatPosition } from '../utils/coordinates.js';
import { notify } from '../utils/messages.js';

// 玩家死亡事件
rustPlusService.on('player:died', async (data) => {
  const serverInfo = await rustPlusService.getServerInfo(data.serverId);
  const position = formatPosition(data.x, data.y, serverInfo.mapSize);

  const message = notify('death', {
    playerName: data.name,
    position: position  // 如: M15(1823,2145)
  });

  await rustPlusService.sendTeamMessage(data.serverId, message);
});
```

**游戏内显示**:
```
[死亡] 玩家1 在 M15-5(1823,2145) 阵亡
```

### 控制子网格显示

```javascript
// 默认包含子网格
formatPosition(1234, 2345, 4000)  // "I10-8(1234,2345)"

// 不包含子网格
formatPosition(1234, 2345, 4000, false)  // "I10(1234,2345)"
```

## 辅助函数

### `getDistance(x1, y1, x2, y2)`

计算两点之间的欧几里得距离。

```javascript
const distance = getDistance(100, 200, 300, 400);
// 返回: 282.84 (约)
```

### `getAngleBetweenPoints(x1, y1, x2, y2)`

计算两点之间的角度（度数，0-360）。

```javascript
const angle = getAngleBetweenPoints(0, 0, 100, 100);
// 返回: 45 (东北方向)
```

## 坐标系统图解

```
Y轴（向上）
↑
│  Z29   AA29  AB29  ...
│  ...   ...   ...   ...
│  Z15   AA15  AB15  ...
│  ...   ...   ...   ...
│  Z5    AA5   AB5   ...
│  Z0    AA0   AB0   ...
└──────────────────────→ X轴（向右）
   0     146   292   ...
```

## 地图尺寸参考

常见 Rust 地图大小及对应网格数量：

| 地图大小 | 修正后大小 | 网格数量 (X×Y) |
|---------|-----------|---------------|
| 3000    | 2926.5    | 20 × 20       |
| 3500    | 3511.5    | 24 × 24       |
| 4000    | 4096.25   | 28 × 28       |
| 4500    | 4388.75   | 30 × 30       |
| 5000    | 5120.0    | 35 × 35       |

## 边界情况处理

### 超出网格系统

如果坐标超出地图边界，`getGridPos()` 返回 `null`，`formatPosition()` 会只显示原始坐标：

```javascript
// 坐标在地图外
const pos = formatPosition(-100, 5000, 4000);
// 返回: "(-100,5000)"
```

### 坐标为 undefined/null

如果坐标不存在，应显示"未知"：

```javascript
const pos = (x !== undefined && y !== undefined)
  ? formatPosition(x, y, mapSize)
  : '(未知)';
```

## 参考资料

- [rustplusplus - map.js](https://github.com/alexemanuelol/rustplusplus/blob/main/src/util/map.js)
- Rust+ API 文档
- Excel 列名转换算法

## 子网格的优势

1. **更精确的位置**: 从 146.25 单位缩小到 48.75 单位范围
2. **快速定位**: 队友能更快找到具体位置
3. **战术沟通**: 如"在 M15-9（东北角）埋伏"
4. **可选显示**: 可以根据需要开关子网格功能

## 实际应用场景

### 场景 1: 队友救援
```
玩家1: "我在 M15-5 被围攻！"
玩家2: "我在 M15-8，马上下来！"  ← 知道在同一大网格，快速支援
```

### 场景 2: 物资标记
```
!pos 命令输出:
位置: 玩家1[活]M15-5(1823,2145) | 玩家2[活]N16-2(1950,2200)

玩家1: "箱子在 M15-9 东北角"  ← 精确到子网格
```

### 场景 3: 死亡通知
```
[死亡] 玩家1 在 M15-5(1823,2145) 阵亡

队友立即知道:
- 大网格: M15
- 具体位置: 5（中心）
- 精确坐标: (1823,2145)
```

## 更新日志

### 2025-10-22
- 实现完整坐标转换系统
- 添加网格位置显示功能
- **新增**: 3×3 子网格系统（1-9 编号）
- 集成到 `!pos` 命令和死亡通知
- 参考 rustplusplus 实现
