# 关卡生成算法

## 保证可解性的程序化生成

### 第一步：确定参数

从难度关键帧表获取该关卡的参数（见 `discussion/difficulty-formula.md`）：

```
// 从 js/difficulty.js 关键帧表中查找 level ≤ N 的最大关键帧
keyframe = DIFFICULTY_KEYFRAMES.findLast(kf => kf.level <= N)
patternTypes = keyframe.patternTypes
setsPerType  = keyframe.setsPerType
layers       = keyframe.layers

tileCount = patternTypes × setsPerType × 3
```

### 第二步：创建图案组

为每种图案类型创建 `setsPerType × 3` 个瓦片：

```
patterns = []
for i in range(patternTypes):
    for j in range(setsPerType * 3):
        patterns.push({ patternId: i })
// patterns.length === tileCount ✓
```

### 第三步：金字塔布局生成

使用确定性种子 `seed = N`（mulberry32 PRNG），保证同一关卡在所有设备上生成相同布局。

1. 选择版面网格大小（根据 tileCount 计算，确保有足够空间放置所有瓦片）
2. 将 `tileCount` 个瓦片按**金字塔策略**分配到 `layers` 层：
   - 底层（layer 0）瓦片最多，高层瓦片较少
   - 每一层严格是下一层的子集（上层瓦片只出现在下层已有瓦片的正上方附近）
   - 确保正向游戏时，玩家可以从底层开始逐层解锁
3. 计算覆盖关系：基于瓦片像素重叠（48px 瓦片 + 4px 间距），精确判断哪些瓦片被上层覆盖

### 第四步：求解器验证

> 求解器独立为 `js/solver.js` 模块，通过 Web Worker 异步运行，避免阻塞主线程。

对生成的布局运行正向求解器（回溯搜索）：

**缓存优先**：由于种子是确定性的，先检查 `localStorage.levelCache[N]` 是否已有该关卡的求解结果（layout + optimalSteps）。有缓存则跳过求解，直接使用。首次访问某关卡时求解并写入缓存。

```
function solve(board, slot):
    // 找到所有可用瓦片（未被覆盖）
    availableTiles = board.getUncoveredTiles()

    for tile in availableTiles:
        // 模拟点击
        slot.add(tile)

        // 检查三消
        if slot.hasMatch():
            slot.removeMatch()
            if board.isEmpty(): return true  // 通关！
            if solve(board, slot): return true
            slot.restoreMatch()
        else:
            if slot.isFull():  // 7格满了，失败
                slot.remove(tile)
                board.restore(tile)
                continue
            if solve(board, slot): return true
            slot.remove(tile)
            board.restore(tile)

    return false  // 所有路径都失败
```

**验证策略**：
- 小型关卡（tileCount ≤ 30）：200ms 超时
- 中型关卡（tileCount ≤ 120）：800ms 超时
- 大型关卡（tileCount > 120）：2500ms 超时
- 所有求解在 **Web Worker** 中执行，不阻塞主线程动画和交互
- 超时或失败 → seed 偏移重试（seed = N × 1000 + attemptCount），最多重试 20 次
- 20 次仍失败 → 使用回退策略：以逆向生成布局直接作为关卡（不经过求解器验证），向玩家展示警告"此关卡为算法生成，可能无解"
- 求解成功后，将 layout 和 optimalSteps 写入 `localStorage.levelCache`，后续访问直接读取

### 第五步：计算最优步数

求解器在验证过程中记录最短路径的点击次数，作为该关卡的"最优步数"（optimalSteps）。

optimalSteps 用于星级评分：
- 2 星：steps ≤ optimalSteps × 1.5
- 3 星：steps ≤ optimalSteps × 1.2 + 未使用道具（提示除外）

## 可解性保证

**双重保障**：

1. **公式层面**：tileCount = patternTypes × setsPerType × 3，数学上保证每种图案都能被完美消除
2. **布局层面**：逆向生成 + 求解器验证，保证至少存在一条不使用道具的通关路径

**高难度关卡**：更多图案类型和更深的堆叠层限制了可用路径数量，解法越来越少但仍 ≥ 1。
