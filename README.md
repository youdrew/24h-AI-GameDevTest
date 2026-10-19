# Tile Explorer — 24h AI GameDevTest

浏览器三消解谜游戏。点击瓦片送入底部 7 格收集槽，3 个相同自动消除，清空版面获胜。

## 怎么玩

在线入口：[Tile Explorer](https://youdrew.github.io/24h-AI-GameDevTest/)。GitHub Pages 会按账号的自定义域名设置跳转。

本地需要 Node.js 和 Python 3。ES Module 和 Service Worker 需要 HTTP，不能双击 `index.html`：

```bash
npm run build
npm run preview
```

打开 `http://localhost:8765/24h-AI-GameDevTest/`。预览使用与 GitHub 项目 Pages 相同的子路径，只监听本机。

## GitHub Pages 部署

仓库 Settings → Pages → Source 选择 **GitHub Actions**。推送到 `main` 或手动运行 `.github/workflows/pages.yml`，会先运行回归检查，再把 `dist/` 发布到 Pages。

`npm run build` 只复制游戏需要的 HTML、JS、CSS、媒体和清单；不发布开发工具、仓库设置和笔记。PixiJS 7.3.2 随站点一起发布，游戏启动不依赖第三方 CDN，也不需要 Vercel 或 Supabase。Supabase 仅用于可选的在线排行榜；服务不可用时显示提示，本地进度仍正常保存。

如果账号主页配置了自定义域名，GitHub 会将项目 URL 跳转到同一域名下的 `/24h-AI-GameDevTest/`。域名前方的代理也需要能访问这个路径，否则 Pages 构建成功仍可能出现 404。参见 [GitHub 自定义域名说明](https://docs.github.com/en/pages/configuring-a-custom-domain-for-your-github-pages-site/about-custom-domains-and-github-pages#using-a-custom-domain-across-multiple-repositories)。

## 文件总览

```
index.html       本地 PixiJS 引入 + DOM 覆盖层
sw.js            Service Worker（按应用路径隔离的离线缓存）
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
  audio.js       Web Audio API 程序化音效 + BGM（从 sfx-config.js 读参数）
  sfx-config.js  音效参数表（可编辑微调；改坏字段会自动回退到默认值）
  storage.js     localStorage 读写（quota-safe + 迁移）
  leaderboard.js Supabase REST（可选；未配置则静默降级）
  ui.js          DOM 面板（菜单/设置/排行榜/通关/失败）
  config.js      运行时常量（Supabase URL/KEY 在这里填）
  difficulty.js  难度 keyframe 表（可编辑微调）
assets/sounds/   文件音效：win.wav / failure.wav / bomb.wav / SoundofUsingItems.wav
assets/music/    BGM 主题目录（每个主题一个子文件夹）
assets/vendor/   PixiJS 7.3.2 和 MIT 许可证
scripts/         Pages 打包脚本与本地预览服务器
tests/           缓存隔离、子路径与排行榜故障回归检查
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

仓库里 `js/config.js` 保留了原来的演示项目 URL 和公开 anon key。2026-10-19 检查时，该项目域名无法解析；需在 Supabase 恢复项目或连接新的项目才能恢复在线榜单。anon key 可公开，但数据库仍必须配置正确的 RLS 策略。如果你 fork 后想接自己的项目：

1. 在 Supabase 创建项目，按 `doc/leaderboard/supabase-setup.sql.md` 依次跑 §1–§4 的 SQL（建表、`upsert_record` RPC、RLS 策略、`player_totals` 聚合 view）。
2. 把自己项目的 `Project URL` 和 `anon key` 替换到 `js/config.js`。
3. 重新构建并部署。未配置（两个值留空）或在线服务不可用时，页面会说明本地进度不受影响。发布代码修改时同时更新 `sw.js` 的版本号。

> 注意：**§4 的 `player_totals` view 是新加的**，老项目升级时单独把那段补跑一次就行。`getGlobalTop` 在 view 不存在时会自动降级到老的客户端聚合路径（仅取 1000 条）。

## 已知限制 / 后续可优化

- **求解器**：用回溯 DFS，无 memoization。Level 70+ 大版面可能命中 watchdog 超时，星级用 `tileCount` 兜底（仍可玩）。
- **Service Worker 缓存**：发布 HTML、JS、CSS 或 PixiJS 更新时，需要 bump `sw.js` 中的 `VERSION` 常量。
- **排行榜防刷**：anon key 公开，理论上可伪造分数。casual 游戏可接受；要严格的话需 Edge Function + per-session token。
- **冰冻道具**：当前实现为"占用同 cell 让新瓦片重新选位"。spec 要求"位移到同层最近邻"，未做位移逻辑（功能上等价但不动画）。
