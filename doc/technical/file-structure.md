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
│   ├── game.js             # 游戏状态机（menu/playing/paused/complete/gameover）、连击系统、星级评分
│   ├── board.js            # PixiJS 版面容器、瓦片 CRUD、覆盖关系、道具效果
│   ├── level.js            # 关卡参数读取、金字塔布局生成、下落队列
│   ├── difficulty.js       # 难度关键帧表（18 条）、插值策略配置
│   ├── config.js           # 运行时配置（Supabase、游戏参数、道具定义、主题定义）
│   ├── solver.js           # 回溯求解器（Web Worker）、最优步数计算
│   ├── slot.js             # PixiJS 槽位容器、智能插入、飞入动画
│   ├── matcher.js          # 三消检测逻辑
│   ├── animation.js        # Ticker 动画队列、粒子池、特效
│   ├── audio.js            # Web Audio 音效合成 + BGM 主题切换控制
│   ├── storage.js          # localStorage 读写、离线提交队列
│   ├── leaderboard.js      # Supabase REST API（fetch）
│   └── ui.js               # DOM UI 管理（面板显示/隐藏、奖励选择、教程气泡）
├── sound/                  # 项目所有者提供的原始音效文件（WAV）
│   ├── win.wav             # 关卡完成音效
│   ├── failure.wav         # 关卡失败音效
│   ├── bomb.wav            # 炸弹音效
│   └── SoundofUsingItems.wav  # 道具使用音效
├── assets/
│   ├── pic/                # 主题背景图（每个主题一张）
│   │   ├── Orchard.png
│   │   ├── Zoo.png
│   │   ├── Spring Garden.png
│   │   ├── Starbound.png
│   │   ├── Bistro.jpeg
│   │   └── Retro Quest.jpeg
│   ├── music/
│   │   ├── DefaultBgm/     # 默认 BGM 备用目录
│   │   └── Themes/         # 按主题组织的 BGM（MP3）
│   │       ├── Orchard/
│   │       ├── Zoo/
│   │       ├── Spring Garden/
│   │       ├── Starbound/
│   │       ├── Bistro/
│   │       └── Retro Quest/
│   └── sounds/             # 发布音频占位目录（实际音效在 sound/ 和 Themes/ 中）
└── doc/                    # 设计文档
```
