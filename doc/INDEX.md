# Tile Explorer Web — 项目索引（AI 可读）

> 本文件帮助任何 AI 快速了解项目全貌并定位详细文档。

## 项目简介

**Tile Explorer Web** 是一款基于浏览器的三消 Tile 解谜游戏，灵感来源于移动游戏 *Tile Explorer - Triple Match*（Oakever Games）。核心玩法：点击瓦片将其送入底部 7 格收集槽；3 个相同瓦片自动消除；清空版面即获胜。

**设计支柱**：无广告、免注册、打开即玩、移动端优先、支持离线。

## 设计目标

1. **纯净体验** — 无广告、无内购。道具来自关卡奖励。
2. **移动端优先** — 竖屏布局、单手操作、瓦片 48×48px（超过 44px 最小触摸目标）、底部固定槽位栏。
3. **零构建** — PixiJS 通过 CDN 引入、自有代码用 Native ES Modules、无构建步骤。
4. **轻量快速** — 自有代码 < 100KB、首屏加载 < 3s、动画 ≥ 60fps。
5. **在线排行榜** — Supabase 免费层、免登录、设备自动识别。
6. **离线就绪** — PWA 支持离线游玩（排行榜需联网）。

## 关键设计决策

| 决策 | 原因 |
|----------|-----|
| PixiJS 统一渲染（游戏 + 交互） | GPU 加速、内置粒子系统、层叠 hit-test 自动处理；DOM 仅用于覆盖层面板 |
| 逆向验证关卡生成 | 正向随机生成容易产生无解关卡；逆向 + 求解器保证可解性 |
| UUID 优于 IP 身份识别 | NAT 共享、动态 IP、隐私问题使 IP 不可靠；客户端 UUID 存 localStorage 简单稳定 |
| 混合音频方案 | 音效程序化合成（零延迟、动态参数）；BGM 用音频文件（旋律质感） |
| 推导式难度公式 | tileCount = patternTypes × setsPerType × 3，从根源消除数学不可能性 |
| 确定性种子 | 关卡号即种子，同一关卡在所有设备上生成相同布局 |

## 文档结构

```
doc/
├── INDEX.md                           ← 你在这里
│
├── gameplay/                          ← 规则、关卡、道具、UI
│   ├── core-rules.md                     基本机制、瓦片可用性、胜负条件
│   ├── level-design.md                   难度公式参数表、图案库
│   ├── level-generation.md              程序化生成算法与可解性保证（含求解器伪代码）
│   ├── powerups.md                      5 种道具（洗牌/撤销/提示/炸弹/冰冻）+ 下落机制
│   ├── combo-system.md                  连击蓄力槽、被动效果、语音动画
│   └── ui-layout.md                    屏幕布局（ASCII）、渲染分层、移动端适配
│
├── technical/                         ← 技术栈、结构、性能、存储
│   ├── tech-stack.md                    技术选型、PixiJS 场景图、瓦片渲染、动画系统
│   ├── file-structure.md                项目目录结构
│   ├── performance-targets.md           加载时间、帧率、延迟目标
│   ├── data-storage.md                  localStorage JSON 结构
│   └── comparison-with-original.md      与原版功能逐项对比
│
├── audio/                             ← 音效设计
│   ├── sound-effects-catalog.md         音效场景、优先级、来源方式
│   └── audio-system-architecture.md    Web Audio API、双格式 BGM、双开关控制
│
├── innovations/                       ← 差异化与增强
│   ├── ad-free-experience.md           核心差异化：无广告
│   ├── star-rating-system.md          1–3 星关卡评分（提示不影响 3 星）
│   └── pwa-haptics-animation.md        PWA、振动 API、动画优化
│
├── discussion/                        ← 设计讨论与决定记录
│   └── difficulty-formula.md             难度公式 v2（数学一致性保证）、已确认决定
│
└── leaderboard/                       ← 在线排名系统
    ├── overview-and-goals.md           免注册、零成本设计目标
    ├── user-identification.md          UUID + 指纹方案、为何不用 IP
    ├── database-schema.md              Supabase 表设计（level_records）、RPC 函数
    ├── free-tier-analysis.md           配额 vs 预估用量
    └── ui-and-data-flow.md             排行榜 UI 规范与提交流程
```

## 资源提供（项目所有者职责）

以下资源需要由项目所有者（用户）后续提供，AI 实现时不依赖这些文件是否存在：

| 资源 | 路径 | 说明 |
|------|------|------|
| BGM 音乐 | `assets/sounds/bgm.ogg` + `bgm.m4a` | 15-30s 无缝循环，~50-100KB，无版权问题。**待提供，当前为占位目录** |

## 瓦片图案方案

**方案：Emoji（程序化，无需外部资源）**

- 使用 PixiJS 的 `Text` 对象加载 Unicode Emoji，无需 sprite sheet 或图片文件
- 优点：零额外请求、向量渲染（高清屏无失真）、跨平台一致性好
- 风格：卡通风格，可选方向包括动物系（🐶🐱🐰🦊🐻等）、水果系（🍎🍊🍋🍇等）或混合系
- 备选：未来可替换为 SVG sprite sheet 以实现更精细的视觉控制

## AI 自动决策记录

以下设计点在实现时已由 AI 自动确认，无须项目所有者决策：

| 决策 | 确认内容 |
|------|----------|
| 炸弹效果范围 | 消除该图案的 board 可见瓦片 **和** tray 中同图案瓦片，保证消除数始终为 3 的倍数 |
| 冰冻冲突处理 | 被冰冻瓦片在下落目标位有冲突时，平移到同层最近空位；无空位则尝试最上层 |
| 冰冻最后瓦片 | 冰冻瓦片为版面最后一块时，胜利自动解除冰冻，不阻挡胜利 |
| 下落队列耗尽 | 队列为空后版面维持现状，不再下落，直至胜利或失败 |
| 闪电消除逻辑 | 系统自动选剩余最少（≥3块）的图案类型，消除1组（3块） |
| 语音系统 | 移除 SpeechSynthesis，依赖音效 + 视觉文本动画 |
| localStorage 写满 | 捕获 QuotaExceededError，排行榜静默降级，不阻塞游戏 |
| BGM/Ducking | 音效播放时 BGM 自动降低 -6dB，约 200ms 后恢复 |
| UUID 丢失 | 视为新用户，排行榜历史不可恢复 |
| Supabase 并发 | RPC 函数内部行锁保证 upsert 原子性 |
| 下落瓦片与连击 | 下落触发的消除不推进/重置连击窗口，只有玩家点击触发的才算 |
| 关卡生成重试 | 求解器超时后 seed 偏移重试（seed = N×1000 + attemptCount），最多20次；仍失败则直接使用生成结果并提示"可能无解" |
| PixiJS 层结构 | tilesLayer 动态创建，数量由 layers(N) 决定，不硬编码3层 |

## 主题快速导航

| 想了解… | 查看 |
|----------------------|-------|
| 三消机制如何运作 | `gameplay/core-rules.md` |
| 关卡难度曲线与公式 | `gameplay/level-design.md` + `discussion/difficulty-formula.md` |
| 关卡如何生成（保证可解） | `gameplay/level-generation.md` |
| 道具系统和下落机制 | `gameplay/powerups.md` |
| 使用什么技术及原因 | `technical/tech-stack.md` |
| 项目文件/文件夹布局 | `technical/file-structure.md` |
| 需要哪些音效 | `audio/sound-effects-catalog.md` |
| 如何程序化合成音效 | `audio/audio-system-architecture.md` |
| 连击蓄力槽和被动效果 | `gameplay/combo-system.md` |
| 星级评分系统 | `innovations/star-rating-system.md` |
| 排行榜如何识别用户（免登录） | `leaderboard/user-identification.md` |
| Supabase 表设计和 SQL | `leaderboard/database-schema.md` |
