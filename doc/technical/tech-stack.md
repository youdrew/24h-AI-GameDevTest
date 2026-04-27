# 技术栈

## 技术选型

| 层级     | 选择                                  | 理由                                                          |
|----------|---------------------------------------|----------------------------------------------------------------|
| 游戏渲染 | PixiJS v7（Canvas / WebGL）           | GPU 加速渲染、内置粒子系统、层叠排序天然支持、hit-test 自动处理 |
| UI 覆盖层 | DOM（HTML/CSS）                       | 排行榜、设置面板、菜单等用 DOM 实现；文字清晰、表单交互简单     |
| 音效     | Web Audio API（程序化合成）           | 多轨播放、音量控制、连击音调递进；关卡完成音效为音频文件       |
| 背景音乐 | HTML5 Audio + 短音频文件              | 程序化无法达到旋律质感；15-30 秒循环，约 50-100KB；双格式(.ogg+.m4a)兼容 Safari |
| 存储     | localStorage                          | 保存游戏进度、设置、道具数量                                   |
| 排行榜   | Supabase（免费层）                    | PostgreSQL + REST API，免费配额足够                            |
| 部署     | GitHub Pages（静态托管）              | 零成本、全球 CDN、打开即玩                                     |

## PixiJS 加载方式

通过 CDN 引入，锁定小版本并附带 SRI 完整性校验，保持零构建理念：

```html
<script src="https://cdn.jsdelivr.net/npm/pixi.js@7.3.2/dist/pixi.min.js"
        integrity="sha384-<hash>"
        crossorigin="anonymous"></script>
<script>
  // CDN 备用：jsdelivr 不可用时回退到 cdnjs（零成本）
  if (typeof PIXI === 'undefined') {
    document.write('<script src="https://cdnjs.cloudflare.com/ajax/libs/pixi.js/7.3.2/pixi.min.js"><\/script>');
  }
</script>
```

Service Worker 缓存该 CDN 资源，首次加载后可离线使用。

> **注意**：PixiJS v7 与 v8 API 不兼容。锁定到 `7.3.2`，勿升级到 v8。

## 渲染架构：PixiJS（游戏 + 交互） + DOM（UI 面板）

所有游戏画面和交互元素统一由 PixiJS 渲染。DOM 仅用于覆盖层面板。

```
┌─────────────────────────────────────┐
│  DOM 层 (position: absolute)        │
│  ┌─────────────────────────────────┐│
│  │ 排行榜面板 / 设置面板 / 菜单    ││  ← 仅面板类 UI 用 DOM
│  └─────────────────────────────────┘│
├─────────────────────────────────────┤
│  <canvas> — PixiJS 全屏渲染         │
│  ┌─────────────────────────────────┐│
│  │ Stage                           ││
│  │ ├── 状态栏容器                  ││  ← 关卡号、星级显示
│  │ ├── 版面容器 (Board Container)  ││  ← 瓦片堆叠、覆盖关系
│  │ ├── 槽位容器 (Slot Container)   ││  ← 底部 7 格收集槽
│  │ ├── 道具容器 (Powerup Container)││  ← 洗牌/撤销/提示按钮
│  │ └── 粒子容器 (Particle Layer)   ││  ← 消除粒子、连击特效
│  └─────────────────────────────────┘│
└─────────────────────────────────────┘
```

**PixiJS 负责**：版面、瓦片、槽位栏、道具按钮、状态栏、粒子特效、所有游戏交互
**DOM 负责**：排行榜面板、设置面板、菜单弹窗（需要表单输入、文字选择等场景）

## PixiJS 场景图详细结构

```
PIXI.Application
└── Stage
    ├── statusBarContainer (顶部状态栏)
    │   ├── levelText
    │   └── starsDisplay
    ├── boardContainer (版面)
    │   ├── tilesLayer[0..maxLayer]  (动态创建，层数由 layers(N) 决定)
    │   │   └── 每层一个 PIXI.Container，child 顺序即 z-order
    ├── slotContainer (槽位栏，固定底部)
    │   ├── slotSlots[0..6]     (7 个槽位)
    │   └── slotBackground      (背景条)
    ├── powerupContainer (道具按钮)
    │   ├── shuffleBtn
    │   ├── undoBtn
    │   └── hintBtn
    └── effectLayer (特效层，最顶层)
        ├── particles[]         (消除粒子)
        ├── comboFlash          (连击屏幕闪烁)
        └── hintHighlight       (提示高亮)
```

## 瓦片渲染

每个瓦片 = `PIXI.Container`：

```
Tile Container
├── PIXI.Graphics (圆角矩形背景，48×48px)
├── PIXI.Text / PIXI.Sprite (图案：emoji 或纹理)
└── 属性：
    ├── tileData.patternId   — 图案类型 ID
    ├── tileData.layer       — 所在层
    ├── tileData.gridX/Y     — 版面网格位置
    └── interactive = true   — 启用点击检测
```

瓦片大小 48×48px，超过 44px 最小触摸目标，保证移动端操作舒适。

覆盖关系处理：
- 每个 `tilesLayer_*` 是一个 `PIXI.Container`，child 顺序 = z-order
- PixiJS 的 `hitTest` 自动从最上层开始检测，天然支持层叠点击
- 被覆盖的瓦片设置 `alpha = 0.4`、`interactive = false`（逐瓦片控制，不使用独立遮罩层）

## 动画系统

基于 `PIXI.Ticker`（requestAnimationFrame 封装）：

| 动画       | 实现方式                                                |
|------------|---------------------------------------------------------|
| 瓦片飞入槽位 | 每帧 lerp position，贝塞尔曲线轨迹，200ms              |
| 三消消除   | 粒子爆发（自定义粒子池）+ 缩放淡出                     |
| 连击特效   | 全屏 flash（Graphics overlay alpha 动画）              |
| 层显       | 被覆盖瓦片移除后，下层瓦片 alpha 从 0.4→1.0，300ms     |
| 槽位警告   | slotBackground tint 颜色闪烁（PixiJS 动画）            |

粒子系统：
- 自定义粒子池（预分配 100 个粒子对象，复用避免 GC）
- 每个粒子：position、velocity、alpha、lifetime
- Ticker 每帧更新所有活跃粒子

## 模块职责

| 文件                | 职责                                                   |
|---------------------|--------------------------------------------------------|
| `js/main.js`        | 创建 PIXI.Application、初始化各模块、游戏主循环入口     |
| `js/game.js`        | 游戏状态机（menu/playing/paused/complete/gameover）、连击系统、星级评分、道具逻辑 |
| `js/board.js`       | 版面容器管理、瓦片创建/销毁、覆盖关系计算、道具效果（洗牌/提示/扔垃圾/冰冻） |
| `js/level.js`       | 关卡参数读取（从关键帧表）、金字塔布局生成、覆盖关系计算、下落队列 |
| `js/difficulty.js`  | 难度关键帧表（18 条）、插值策略配置                     |
| `js/config.js`      | 运行时配置（Supabase、游戏参数、道具定义、主题定义、图案库） |
| `js/solver.js`      | 回溯求解器（Web Worker 运行）、最优步数计算、超时重试   |
| `js/slot.js`        | 槽位栏容器、智能插入（同图案聚集）、飞入动画            |
| `js/matcher.js`     | 三消匹配检测逻辑                                       |
| `js/animation.js`   | Ticker 动画队列、粒子池、特效播放                       |
| `js/audio.js`       | Web Audio API 音效合成 + 主题 BGM 切换 + Ducking       |
| `js/storage.js`     | localStorage 读写、数据迁移、离线提交队列               |
| `js/leaderboard.js` | Supabase REST API 通信（fetch）、提交/查询              |
| `js/ui.js`          | DOM UI 管理（排行榜面板、设置、奖励选择、教程气泡）     |

## 资源加载

```
 PixiJS Assets 系统
 ├── 瓦片图标纹理（SVG → PIXI.Texture，可选）
 └── 无其他资源需要加载
```

Emoji 方案（推荐）：瓦片图案直接用 `PIXI.Text` 渲染 emoji，无需加载任何纹理资源，保持零文件理念。

SVG 纹理方案（备选）：如果 emoji 在不同平台显示不一致，可加载 SVG 作为纹理。

## 性能目标

| 指标           | 目标                        |
|----------------|-----------------------------|
| 首次加载       | < 3 秒（移动 4G）           |
| 动画帧率       | ≥ 60fps（WebGL 加速）       |
| 交互延迟       | < 100ms（点击到视觉反馈）   |
| 内存占用       | < 50MB                      |
| PixiJS 库大小  | ~250KB（未压缩）/ ~80KB（gzipped） |

## 设计目标

- **零构建**：PixiJS 通过 CDN 引入，原生 ES Module 加载自有模块
- **轻量**：自有代码 < 100KB，PixiJS CDN 缓存后不计入加载时间
- **支持离线**：Service Worker 缓存 PixiJS CDN + 所有资源
