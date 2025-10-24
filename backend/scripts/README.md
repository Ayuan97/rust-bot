# Rust 物品数据库管理脚本

## 更新物品数据库

### fetch-complete-items.js（推荐使用）

从 [SzyMig/Rust-item-list-JSON](https://github.com/SzyMig/Rust-item-list-JSON) 获取最完整的物品列表。

**特点**：
- 包含 **1109+ 物品**（从游戏文件直接提取）
- 覆盖所有基础游戏物品
- 自动更新（随游戏更新）

**使用方法**：
```bash
cd /Users/self/rust-bot/backend
node scripts/fetch-complete-items.js
```

**数据源**: 该仓库从 Steam 游戏目录 `\Steam\steamapps\common\rust\bundles\items` 提取所有物品数据

---

### fetch-all-items.js（旧版本）

从 [Marcuzz Gist](https://gist.githubusercontent.com/Marcuzz/9e01a39a8f5f83dc673bfc6f6fa4aacc) 获取物品列表。

**特点**：
- 包含 **517 物品**
- 社区维护

**使用方法**：
```bash
cd /Users/self/rust-bot/backend
node scripts/fetch-all-items.js
```

---

## 管理物品数据库

### manage-items.js

查看、搜索和添加物品的命令行工具。

**使用方法**：

```bash
# 查看数据库统计信息
node scripts/manage-items.js stats

# 搜索物品
node scripts/manage-items.js search AK
node scripts/manage-items.js search 布

# 添加单个物品
node scripts/manage-items.js add <ID> <名称> <shortName> [类别]

# 显示帮助
node scripts/manage-items.js help
```

**示例**：
```bash
# 搜索"火箭"相关物品
node scripts/manage-items.js search 火箭

# 添加自定义物品
node scripts/manage-items.js add 123456 "测试物品" "test.item" "misc"
```

---

## 物品分类

支持的物品类别：

- `weapon` - 武器
- `ammo` - 弹药
- `attire` - 服装
- `building` - 建筑
- `resource` - 资源
- `food` - 食物
- `tool` - 工具
- `medical` - 医疗
- `electrical` - 电气
- `trap` - 陷阱
- `explosive` - 爆炸物
- `component` - 组件
- `misc` - 其他

---

## 输出格式

所有脚本生成的 JSON 格式：

```json
{
  "comment": "数据库描述",
  "source": "数据来源URL",
  "lastUpdated": "2025-10-23T...",
  "items": {
    "itemId": {
      "name": "物品名称",
      "shortName": "game.shortname",
      "category": "类别",
      "description": "描述（可选）"
    }
  }
}
```

---

## 更新周期建议

**推荐**：每次 Rust 游戏大版本更新后运行 `fetch-complete-items.js`

Rust 游戏通常每月更新一次，建议：
- 关注 [Rust 官方更新日志](https://rust.facepunch.com/blog/)
- 每次大更新后检查是否有新物品
- 运行脚本更新数据库

---

## 故障排除

### 问题：仍有"未知物品ID"警告

**原因**：
1. 物品数据库未更新
2. 服务器使用了 mod 物品（不在官方数据中）

**解决方案**：
1. 运行 `fetch-complete-items.js` 更新到最新数据库
2. 检查 `src/utils/unknown-items.json` 查看未知物品列表
3. 对于 mod 物品，手动使用 `manage-items.js add` 添加

### 问题：搜索不到某个物品

**检查步骤**：
```bash
# 1. 检查数据库大小
node scripts/manage-items.js stats

# 2. 搜索物品（支持中文和英文）
node scripts/manage-items.js search 物品名称

# 3. 如果找不到，更新数据库
node scripts/fetch-complete-items.js

# 4. 重新搜索
node scripts/manage-items.js search 物品名称
```

---

## 数据来源

### 主要来源（推荐）
- **SzyMig/Rust-item-list-JSON**: https://github.com/SzyMig/Rust-item-list-JSON
  - 1109+ 物品
  - 从游戏文件直接提取
  - 自动跟随游戏更新

### 备用来源
- **Marcuzz Gist**: https://gist.github.com/Marcuzz/9e01a39a8f5f83dc673bfc6f6fa4aacc
  - 517 物品
  - 社区维护

### 其他参考
- **Corrosion Hour**: https://www.corrosionhour.com/rust-item-list/
- **Rust Labs**: https://rustlabs.com/group=itemlist
