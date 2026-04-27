# Tile Explorer Web — AI 实现指南

## 项目概述

**Tile Explorer Web** 是一款浏览器三消解谜游戏，核心玩法：点击瓦片送入底部 7 格收集槽，3 个相同即消除，清空版面获胜。

**技术栈**：PixiJS v7（CDN）+ 原生 ES Module + Web Audio API + localStorage + Supabase

---

## 必须完成的功能

### 1. 游戏核心
- [ ] `index.html`：PixiJS CDN 引入、DOM 覆盖层
- [ ] `js/main.js`：PIXI.Application 初始化、模块加载
- [ ] `js/game.js`：状态机（menu → playing → paused/complete/gameover）
- [ ] `js/board.js`：PixiJS 版面容器、瓦片 CRUD、层叠覆盖关系、响应式缩放
- [ ] `js/level.js`：金字塔布局关卡生成（seed = 关卡号）
- [ ] `js/difficulty.js`：难度关键帧表（18 条）
- [ ] `js/config.js`：运行时配置（Supabase、游戏参数、道具定义、主题定义）
- [ ] `js/solver.js`：Web Worker 回溯求解器，超时偏移 seed 重试
- [ ] `js/slot.js`：底部 7 格收集槽、智能插入、瓦片飞入动画
- [ ] `js/matcher.js`：三消检测逻辑
- [ ] `js/animation.js`：Ticker 动画队列、粒子池、特效

### 2. 道具系统
- [ ] 6 种道具：洗牌、撤销、提示、扔垃圾、炸弹、冰冻
- [ ] 道具按钮 UI（PixiJS）
- [ ] 下落机制（队列耗尽维持现状）

### 3. 连击系统
- [ ] 连击蓄力槽（10 格）
- [ ] 被动效果触发（满 10 格自动闪电）
- [ ] 屏幕闪烁特效

### 4. 音效
- [ ] `js/audio.js`：Web Audio API 程序化合成 + 主题 BGM
- [ ] 双开关控制（BGM / 音效）
- [ ] 消除音效、BGM 支持（使用项目中已有的 `sound/` 音频文件）
- [ ] Ducking：音效播放时 BGM 降低 -6dB

### 5. UI 面板（DOM）
- [ ] `css/ui.css`：DOM UI 样式
- [ ] `js/ui.js`：菜单、设置、排行榜面板、奖励选择、教程气泡
- [ ] 星级评分系统（1-3 星，提示不影响 3 星）

### 6. 存储
- [ ] `js/storage.js`：localStorage 读写（游戏进度、道具数量、设置）
- [ ] QuotaExceededError 处理，静默降级
- [ ] 离线提交队列

### 7. 排行榜（Supabase）
- [ ] `js/leaderboard.js`：REST API 提交流程
- [ ] UUID 用户识别
- [ ] 排行榜 UI

### 8. PWA
- [ ] `sw.js`：Service Worker 缓存 CDN + 资源
- [ ] `manifest.json`：PWA 清单
- [ ] 离线支持
- [ ] 振动 API

---

## 文件结构

```
/
├── index.html
├── sw.js
├── manifest.json
├── css/
│   ├── main.css
│   ├── ui.css
│   └── responsive.css
├── js/
│   ├── main.js
│   ├── game.js
│   ├── board.js
│   ├── level.js
│   ├── difficulty.js
│   ├── config.js
│   ├── solver.js      # Web Worker
│   ├── slot.js
│   ├── matcher.js
│   ├── animation.js
│   ├── audio.js
│   ├── storage.js
│   ├── leaderboard.js
│   └── ui.js
├── sound/              # 原始音效文件（WAV）
│   ├── win.wav
│   ├── failure.wav
│   ├── bomb.wav
│   └── SoundofUsingItems.wav
└── assets/
    ├── music/Themes/   # 主题 BGM（MP3）
    ├── pic/            # 主题背景图
    └── sounds/         # 发布音频（占位）
```

---

## 关键约束

1. **PixiJS v7**（锁定 7.3.2，勿升级 v8）
2. **零构建**：CDN 引入，原生 ES Module
3. **Emoji 瓦片方案**：用 `PIXI.Text` 渲染 emoji，无需纹理文件
4. **移动端优先**：竖屏布局，瓦片 48×48px
5. **自有代码 < 100KB**
6. **首屏加载 < 3s**，动画 ≥ 60fps
7. **无广告、免注册、打开即玩**

---

## 音频资源

项目已有 `sound/` 目录，包含基础音效文件（WAV）。BGM 按主题组织在 `assets/music/Themes/` 下。

---

## 参考文档

实现前请详细阅读 `doc/` 目录下所有设计文档，特别是：
- `doc/gameplay/core-rules.md` — 核心机制
- `doc/gameplay/level-design.md` — 难度关键帧 + 主题系统
- `doc/gameplay/level-generation.md` — 生成算法
- `doc/technical/tech-stack.md` — 技术架构
- `doc/audio/audio-system-architecture.md` — 音效设计
- `doc/leaderboard/database-schema.md` — Supabase 表结构
