# 难度量化方案

> 讨论日期：2026/04/26
> 状态：已确认（v3 — 关键帧查表 + 金字塔布局）

---

## 目标

用参数化公式替代离散难度等级，使难度曲线平滑、可预测、可验证。

## 核心参数

```
level N 的难度由以下参数决定：
- patternTypes(N) — 图案类型数量
- setsPerType(N)  — 每种图案的匹配组数（每组 3 个）
- tileCount(N)    — 总瓦片数（= patternTypes × setsPerType × 3，推导得出）
- layers(N)       — 堆叠层数
```

## 难度关键帧表

难度由 `js/difficulty.js` 中的 18 条关键帧定义。在两条关键帧之间的关卡使用前一条关键帧的值（`stepped` 插值策略）。

```javascript
export const DIFFICULTY_KEYFRAMES = [
  // level | patternTypes | setsPerType | layers | tile count (= pt × spt × 3)
  { level:   1, patternTypes:  3, setsPerType: 1, layers: 2 }, //   9
  { level:   2, patternTypes:  4, setsPerType: 1, layers: 2 }, //  12
  { level:   3, patternTypes:  5, setsPerType: 1, layers: 2 }, //  15
  { level:   4, patternTypes:  6, setsPerType: 1, layers: 2 }, //  18
  { level:   5, patternTypes:  6, setsPerType: 1, layers: 3 }, //  18  (depth +1)
  { level:   7, patternTypes:  7, setsPerType: 2, layers: 3 }, //  42
  { level:  10, patternTypes:  8, setsPerType: 2, layers: 3 }, //  48
  { level:  15, patternTypes: 10, setsPerType: 2, layers: 4 }, //  60
  { level:  20, patternTypes: 12, setsPerType: 2, layers: 4 }, //  72
  { level:  25, patternTypes: 14, setsPerType: 3, layers: 4 }, // 126
  { level:  30, patternTypes: 15, setsPerType: 3, layers: 5 }, // 135
  { level:  40, patternTypes: 18, setsPerType: 3, layers: 5 }, // 162
  { level:  50, patternTypes: 20, setsPerType: 3, layers: 6 }, // 180
  { level:  70, patternTypes: 23, setsPerType: 3, layers: 6 }, // 207
  { level: 100, patternTypes: 26, setsPerType: 4, layers: 7 }, // 312
  { level: 150, patternTypes: 28, setsPerType: 4, layers: 7 }, // 336
  { level: 200, patternTypes: 28, setsPerType: 5, layers: 8 }, // 420
  { level: 300, patternTypes: 28, setsPerType: 6, layers: 8 }  // 504
];
```

**安全上限**（定义在 `js/level.js` 中）：
- `patternTypes ≤ PT_CAP`（= 28；每个主题 emoji 库有 32 个）
- `setsPerType ≤ SPT_CAP`（= 6）
- `layers ≤ LAYER_CAP`（= 8）

**插值策略**：`stepped`（默认）——关卡 N 使用 level ≤ N 的最大关键帧的值。可配置为 `linear` 进行线性插值。

### 数学一致性保证

**tileCount 由 patternTypes × setsPerType × 3 推导，不是独立公式。** 这从根源上保证：

1. 总瓦片数一定是 3 的倍数（每组匹配 3 个）
2. 每种图案的瓦片数一定是 3 的倍数（= setsPerType × 3）
3. 不存在无法消除的"剩余瓦片"
4. 每个生成的关卡在数学上都有至少一种完美消除路径

### 与 v1/v2 的关系

- **v1**：tileCount 和 patternTypes 是独立公式，会产生无法分配的组合（如 15÷4=3.75）
- **v2**：引入 `smoothParam` 平滑插值函数，修复数学不一致性
- **v3（当前）**：用关键帧查表替代 `smoothParam` 公式，提供更精细的手动调优控制。每个关键帧可直接编辑 `js/difficulty.js` 调整，无需修改游戏逻辑

### 示例

| 关卡 | 图案类型 | 每种组数 | 总瓦片数 | 层数 | 说明 |
|------|----------|----------|----------|------|------|
| 1    | 3        | 1        | 9        | 2    | 入门，3 种图案 |
| 2    | 4        | 1        | 12       | 2    | 增加图案 |
| 3    | 5        | 1        | 15       | 2    | 引入覆盖概念 |
| 4    | 6        | 1        | 18       | 2    | 6 种图案 |
| 5    | 6        | 1        | 18       | 3    | 层数增加（深度 +1） |
| 7    | 7        | 2        | 42       | 3    | setsPerType 跳到 2 |
| 10   | 8        | 2        | 48       | 3    | 炸弹解锁 |
| 15   | 10       | 2        | 60       | 4    | |
| 20   | 12       | 2        | 72       | 4    | |
| 25   | 14       | 3        | 126      | 4    | setsPerType 跳到 3 |
| 30   | 15       | 3        | 135      | 5    | |
| 50   | 20       | 3        | 180      | 6    | |
| 70   | 23       | 3        | 207      | 6    | |
| 100  | 26       | 4        | 312      | 7    | |
| 150  | 28       | 4        | 336      | 7    | patternTypes 到达上限 28 |
| 200  | 28       | 5        | 420      | 8    | |
| 300  | 28       | 6        | 504      | 8    | setsPerType 到达上限 6 |

## 可解性保证

### 双重保障机制

**第一层：公式保证数学可行性** — tileCount = patternTypes × setsPerType × 3 确保每种图案都能被完美消除。

**第二层：金字塔生成 + 求解器验证** — 关卡布局使用金字塔策略（上层严格是下层的子集），再用求解器正向验证。详见 `gameplay/level-generation.md`。

## 关键属性

1. **确定性**：同一个 N 总是生成相同的关卡参数，可复现、可验证
2. **渐进递增**：通过精心设计的关键帧表，难度平缓上升不突跳
3. **可调优**：直接编辑 `js/difficulty.js` 中的关键帧即可调整难度曲线，无需修改游戏逻辑
4. **数学安全**：推导关系消除了 v1 的数学不一致问题
5. **无上限**：公式无 cap，最高支持关卡 10000

## 已确认决定

### 1. 教程关卡难度递增

教程关卡（1-9）不再使用固定参数，而是逐步增加瓦片数（9→12→15→18），让玩家在教程期间就开始感受难度变化。

### 2. 不设难度上限，通过缩放适配移动端

难度公式无 cap，允许无限增长。移动端版面放不下时，提供缩放按钮让用户放大/缩小版面区域。

**理由**：不应该因为屏幕尺寸限制难度上限，桌面和移动端应有一致的难度体验。

### 3. 采用混合音频方案

- **音效**（点击/消除/连击等）：程序化合成（Web Audio API），零文件、零延迟、支持动态参数
- **背景音乐**：按主题组织的 MP3 文件，每个主题一首 BGM，随关卡主题切换自动更换

**理由**：BGM 需要旋律质感，纯程序化振荡器无法达到；音效类则程序化更灵活。

### 4. 不使用分数系统，以星级+步数量化表现

- 排行榜排名依据：**总星数** → 同星数按**最少总步数**排序
- 移除了 combo 分数奖励，连击只保留视觉和音效反馈
- 数据库、localStorage、UI 中均不再有 score 字段

**理由**：分数是人为数字，缺乏直观参考；星级+步数更简单、更易理解。

### 5. 移除每日挑战功能

不实现每日挑战及其排行榜。

**理由**：24 小时开发周期内聚焦核心玩法，减少功能复杂度。

### 6. 技术栈采用 PixiJS

使用 PixiJS v7 作为游戏渲染引擎，DOM 仅用于 UI 覆盖面板（菜单、排行榜、设置）。通过 CDN 引入，保持零构建。

### 7. 使用确定性种子

关卡生成使用确定性种子（seed = level number），同一关卡在所有设备上生成完全相同的布局。

**理由**：可复现性便于调试、排行榜公平性、求解器结果可验证。

## 最优步数与星级系统

"最优步数"由求解器在关卡生成时计算得出（求解器找到的最短消除路径的点击次数）。该值缓存在客户端，用于星级判定：

| 星级 | 条件 |
|------|------|
| 1 星 | 完成关卡 |
| 2 星 | 完成且步数 ≤ optimalSteps × 1.5 |
| 3 星 | 完成且步数 ≤ optimalSteps × 1.2 + 未使用道具（提示除外） |

无最优步数估计时的回退：未使用硬道具 → 3 星；使用了硬道具 → 2 星。

---

## 关联议题

- 关卡生成算法（金字塔布局 + 求解器）— 见 `gameplay/level-generation.md`
- 星级评分系统中的"最优步数"如何对应此公式 — 见 `innovations/star-rating-system.md`
