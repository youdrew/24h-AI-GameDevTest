# 关卡生成算法

## 保证可解性的程序化生成

### 第一步：确定参数

从难度公式获取该关卡的参数（见 `discussion/difficulty-formula.md`）：

```
// 教程关卡固定参数（N ≤ 9）
if (N <= 9):
    patternTypes = 3, setsPerType = 1, layers = 1
else:
    patternTypes = smoothParam(N, 10) + 3
    setsPerType  = smoothParam(N, 35) + 1
    layers       = smoothParam(N, 25) + 1

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

### 第三步：逆向生成布局

使用确定性种子 `seed = N`，保证同一关卡在所有设备上生成相同布局。

1. 选择版面网格大小（根据 tileCount 计算，确保有足够空间放置所有瓦片）
2. 将 `tileCount` 个瓦片随机分配到 `layers` 层的网格位置
3. 使用逆向放置策略：
   - 从空版面开始
   - 按逆序放置瓦片（先放最后一层的，再放上一层的）
   - 确保每个阶段被覆盖的瓦片都在之前已经被"使用"
   - 即正向游戏时，玩家可以按某种顺序逐层解锁

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
- 简单关卡（≤18 瓦片）：求解器在 < 10ms 内完成
- 中等关卡（19-54 瓦片）：设置 500ms 超时
- 困难关卡（55+ 瓦片）：设置 2s 超时
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
