# 文件结构

```
/
├── index.html              # 入口页面（含 PixiJS CDN 引入 + DOM UI 覆盖层）
├── sw.js                   # Service Worker（缓存 PixiJS CDN + 所有资源）
├── manifest.json           # PWA 清单
├── css/
│   ├── main.css            # 页面重置、全屏 canvas 布局
│   ├── ui.css              # DOM UI 覆盖层样式（菜单、排行榜、设置）
│   └── responsive.css      # 响应式适配
├── js/
│   ├── main.js             # PIXI.Application 创建、模块初始化
│   ├── game.js             # 游戏状态机（menu/playing/paused/gameover）
│   ├── board.js            # PixiJS 版面容器、瓦片 CRUD、覆盖关系
│   ├── level.js            # 关卡参数公式、逆向生成
│   ├── solver.js           # 回溯求解器（Web Worker）、最优步数计算
│   ├── slot.js             # PixiJS 槽位容器、飞入动画
│   ├── matcher.js          # 三消检测逻辑
│   ├── animation.js        # Ticker 动画队列、粒子池、特效
│   ├── audio.js            # Web Audio 音效合成 + BGM 控制
│   ├── storage.js          # localStorage 读写
│   ├── leaderboard.js      # Supabase REST API（fetch）
│   └── ui.js               # DOM UI 管理（面板显示/隐藏）
├── assets/
│   ├── textures/           # 瓦片图标纹理（可选，仅当不用 emoji 时）
│   ├── backgrounds/        # 背景图
│   └── sounds/             # 背景音乐（bgm.ogg + bgm.m4a 双格式兼容 Safari）
└── doc/                    # 设计文档
```
