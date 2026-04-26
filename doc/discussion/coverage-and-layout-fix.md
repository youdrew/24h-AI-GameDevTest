# 遮挡判定修复 + 布局形状系统

> 讨论日期：2026/04/26
> 状态：已确认，待实施
> 优先级：高（影响核心玩法正确性）

---

## 问题 1：遮挡判定不正确

### 现象

任意两个瓦片即使视觉上有明显重叠，底下的瓦片仍然可以被选中点击。在标准瓦片游戏中，只要被覆盖了一点，下面的瓦片就不能选。

### 根因

`computeCoverage()`（`js/level.js:187-201`）只判断**同一 (gridX, gridY) 且更高层**的瓦片才算遮挡：

```js
// 当前逻辑：只有精确同格子才算遮挡
const k = `${t.gridX},${t.gridY}`;
// 同一个 k 里面，只有最上面的不被遮挡
```

但渲染时每层有对角偏移（`layerOffset = tileSize/4 = 12px`），一个瓦片实际上会覆盖下一层 **4 个格子** 的区域。

### 计算推导

层 L 的瓦片在 (gx, gy) 的屏幕位置：
```
px = origin + gx * pitch + L * offset
py = origin + gy * pitch + L * offset
```

其中 `pitch = tileSize + gap = 52px`，`offset = 12px`，`tileSize = 48px`。

层 L-1 瓦片在 (gx', gy') 的屏幕位置：
```
px' = origin + gx' * pitch + (L-1) * offset
py' = origin + gy' * pitch + (L-1) * offset
```

两瓦片重叠条件：`|px - px'| < tileSize` 且 `|py - py'| < tileSize`

代入得：
- gx' = gx:   x方向差 = 12px < 48px → **重叠** (12px)
- gx' = gx-1: x方向差 = 40px < 48px → **重叠** (40px)
- gx' = gx+1: x方向差 = 64px > 48px → 不重叠
- gx' = gx-2: x方向差 = 92px > 48px → 不重叠

y 方向同理。所以一个层 L 的瓦片 (gx, gy) 会遮挡层 L-1 的四个位置：

```
层 L-1 被遮挡的位置:
  (gx,   gy)   — 中心重叠，约 12×12px
  (gx-1, gy)   — 右侧重叠，约 40×12px
  (gx,   gy-1) — 下方重叠，约 12×40px
  (gx-1, gy-1) — 对角重叠，约 40×40px
```

### 修复范围

| 文件 | 修改 |
|------|------|
| `js/level.js` | `computeCoverage()` 改为检查相邻4格 |
| `js/solver.js` | 覆盖模型同步修改（blockers 构建） |

### 正确的遮挡判定逻辑

```
瓦片 A (层 La, 格子 ax, ay) 被瓦片 B (层 Lb, 格子 bx, by) 遮挡的条件：
  Lb > La
  且 |bx - ax| <= 1  (不是，具体看下面的条件)
  且 |by - ay| <= 1

等等，不是所有相邻格都遮挡。精确条件是：
  Lb = La + 1
  且 bx ∈ {ax, ax-1}
  且 by ∈ {ay, ay-1}

（更高层的瓦片只遮挡它左下方的4个格子）
```

实际上应该是：

**瓦片 A (层 La, 格子 ax, ay) 被遮挡，当且仅当存在瓦片 B 满足：**
- B 的层 > A 的层（不一定是恰好高1层，可以隔层遮挡）
- B 的格子 (bx, by) 满足：`bx ∈ {ax, ax+1}` 且 `by ∈ {ay, ay+1}`

等一下，让我重新算。层 L 的瓦片在视觉上偏右下方（offset 正方向），所以它会遮挡层 L-1 中偏左上方的瓦片。

从被遮挡者(A)的视角：A 在层 La、格子 (ax, ay)。B 在层 Lb > La，格子 (bx, by)。

B 的屏幕位置 = origin + bx*pitch + Lb*offset
A 的屏幕位置 = origin + ax*pitch + La*offset

B 覆盖 A 需要：
  |bx*pitch + Lb*offset - ax*pitch - La*offset| < tileSize
  = |(bx-ax)*pitch + (Lb-La)*offset| < tileSize

设 d = Lb - La (>=1), dx = bx - ax:
  |dx*pitch + d*offset| < tileSize
  |dx*52 + d*12| < 48

d=1 时:
  dx=0: |12| = 12 < 48 ✓
  dx=-1: |-40| = 40 < 48 ✓
  dx=1: |64| = 64 > 48 ✗
  dx=-2: |-92| = 92 > 48 ✗

所以 B 在 bx ∈ {ax, ax-1} 时遮挡 A（x方向）。
同理 by ∈ {ay, ay-1}（y方向）。

对于 d=2 (隔一层):
  dx=0: |24| < 48 ✓
  dx=-1: |-28| < 48 ✓
  dx=-2: |-80| > 48 ✗

仍然是 bx ∈ {ax, ax-1}。

**结论：遮挡判定规则是：**

> 瓦片 A (层 La, 格子 ax, ay) 被遮挡 ⟺ 存在瓦片 B (层 Lb > La, 格子 bx, by) 满足：
> - `bx ∈ {ax, ax-1}` 且 `by ∈ {ay, ay-1}`
> 即 B 在 A 的同格或左上方一格

---

## 问题 2：布局缺乏形状

### 现象

所有瓦片随机散布在网格中，没有组织结构。正规瓦片游戏（如 Tile Master、Mahjong）使用形状模板（金字塔、菱形、十字等）。

### 修复方案

引入**形状模板系统**：

1. 定义若干形状（金字塔、菱形、矩形、十字、心形等）
2. 每个形状定义每层哪些格子是"活跃"的
3. 关卡生成时，根据 level 选择形状，在活跃格子内放置瓦片
4. 随关卡推进，形状逐渐变大、层数增多

### 示例形状定义

**金字塔（3层）：**
```
层 2:     · · ·        (3格)
层 1:    · · · · ·     (5格)
层 0:   · · · · · · ·  (7格)
```

**菱形：**
```
层 1:     · · ·        (3格)
层 0:    · · · · ·     (5格) — 也可以单层就是菱形
```

### 形状选择逻辑

- 低关卡：简单的矩形、小金字塔
- 中关卡：菱形、十字、大金字塔
- 高关卡：复杂多层形状

---

## 实施约束

- 遮挡判定和求解器必须使用同一套覆盖模型
- 形状模板必须保证可解性（solver 验证仍然有效）
- 不改变 TILE_SIZE、TILE_GAP、layerOffset 的渲染逻辑
- tileCount 仍然由 levelParams() 决定，形状只决定瓦片放在哪些位置
- PATTERN_LIBRARY 不变

---

## 关联文件

| 文件 | 改动 |
|------|------|
| `js/level.js` | `computeCoverage()` 重写；`generateLayout()` 加入形状模板 |
| `js/solver.js` | 覆盖模型同步修改 |
| `js/board.js` | 无需改动（调用 computeCoverage 即可） |
