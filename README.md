# Tile Explorer — 24h AI GameDevTest

浏览器三消解谜游戏。点击瓦片送入底部 7 格收集槽，3 个相同自动消除，清空版面获胜。

## 怎么玩

需要一个本地静态 HTTP 服务器（CDN 加载、ES Module、Service Worker 都需要 `http://`，不能 `file://`）。

```bash
# 推荐：使用项目自带的 dev server（多线程，正确 MIME）
python .omc/dev-server.py 8765

# 或任何静态服务器
npx --yes serve -p 8765
python -m http.server 8765 --bind 127.0.0.1     # 单线程，不推荐
```

打开 `http://localhost:8765/`。手机访问把 `localhost` 换成本机 IP 即可。

## 文件总览

```
index.html       PixiJS CDN 引入 + DOM 覆盖层
sw.js            Service Worker（缓存 CDN + 资源）
manifest.json    PWA 清单
css/             main / ui / responsive
js/
  main.js        入口：PIXI.Application + 模块装配
  game.js        状态机 + 主循环（板/槽/道具/连击/胜负）
  board.js       PixiJS 版面、瓦片 CRUD、覆盖关系、缩放
  slot.js        底部 7 格收集槽
  level.js       难度公式（smoothstep）+ 关卡布局生成
  solver.js      Web Worker 回溯求解器（计算 optimalSteps）
  matcher.js     三消检测
  animation.js   PIXI.Ticker 缓动 + 粒子池
  audio.js       Web Audio API 程序化音效 + BGM
  storage.js     localStorage 读写（quota-safe + 迁移）
  leaderboard.js Supabase REST（可选；未配置则静默降级）
  ui.js          DOM 面板（菜单/设置/排行榜/通关/失败）
  config.js      运行时常量（Supabase URL/KEY 在这里填）
sound/           已有 wav：win, failure, SoundofUsingItems
assets/sounds/   待提供：bgm.ogg + bgm.m4a（详见下方资源清单）
```

## 实现完成度

| 模块 | 状态 |
|------|------|
| 游戏核心（点击、消除、胜负、覆盖） | ✅ |
| 关卡生成 + 求解器 + 缓存 | ✅ |
| 5 种道具（洗牌/撤销/提示/炸弹/冰冻） | ✅ |
| 连击系统（蓄力槽 + 闪电 + 屏幕闪烁） | ✅ |
| 程序化音效 + BGM ducking | ✅ |
| 星级评分（提示不影响 3 星） | ✅ |
| 道具奖励选择 | ✅ |
| localStorage（含 quota 降级） | ✅ |
| Supabase 排行榜（offline 队列） | ✅（需配置 URL/KEY） |
| PWA + 离线 + 振动 | ✅ |
| 教程引导（关卡 1–10） | ✅ |
| 移动端竖屏 + 缩放 | ✅ |

## 配置 Supabase 排行榜

1. 在 Supabase 创建项目，按 `doc/leaderboard/database-schema.md` 跑 SQL（创建 `players` 表、`level_records` 表、`upsert_record` RPC、RLS 策略）。
2. 把 `Project URL` 和 `anon key` 填到 `js/config.js` 的 `SUPABASE_URL` 和 `SUPABASE_ANON_KEY`。
3. 重启服务器即可。未配置时排行榜面板会显示 "未配置"，本地进度仍正常保存。

## 已知限制 / 后续可优化

- **求解器**：用回溯 DFS，无 memoization。Level 70+ 大版面可能命中 watchdog 超时，星级用 `tileCount` 兜底（仍可玩）。
- **PixiJS CDN 无 SRI**：可在 `index.html` 加 `integrity=sha384-...`，但需要每次升级 Pixi 时更新。
- **Service Worker 缓存**：CDN 文件无版本键，更新 Pixi 版本时需要 bump `sw.js` 中的 `VERSION` 常量。
- **排行榜防刷**：anon key 公开，理论上可伪造分数。casual 游戏可接受；要严格的话需 Edge Function + per-session token。
- **冰冻道具**：当前实现为"占用同 cell 让新瓦片重新选位"。spec 要求"位移到同层最近邻"，未做位移逻辑（功能上等价但不动画）。
