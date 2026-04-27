# 音频系统架构

## 资源来源说明

音效和 BGM 采用混合方案：

- **音效**：全部通过 Web Audio API 程序化合成，无需任何音频文件（关卡完成和失败除外）
- **文件音效**：`assets/sounds/` 目录中的 WAV 文件（win.wav、failure.wav、bomb.wav、SoundofUsingItems.wav），路径在 `js/sfx-config.js` 集中配置
- **BGM**：按主题组织的 MP3 文件，每个主题一首 BGM，位于 `assets/music/Themes/{ThemeName}/`，随关卡主题切换自动更换
- **参数表**：所有程序化音效的参数（频率、波形、包络、音量）都在 `js/sfx-config.js` 集中配置；audio.js 读取时会按字段类型校验，错误回退到内置默认值

## Web Audio API

使用 `AudioContext` 管理所有音效。支持：
- 多轨同时播放（点击 + 消除可重叠）
- 音量控制（用户开关）
- 淡入 / 淡出
- 连击音调递进（10 级自然音阶和弦）

## 程序化 vs 文件音频

采用**混合方案**：

- **音效**（点击、消除、连击等）：程序化合成
  - 零网络请求，加载更快
  - 动态参数调整（音调、时长、音色）
  - 连击音调递进等交互式音效只能程序化实现

- **关卡完成 / 失败 / 炸弹 / 道具使用**：音频文件（WAV）
  - `assets/sounds/win.wav` — 关卡完成
  - `assets/sounds/failure.wav` — 关卡失败
  - `assets/sounds/bomb.wav` — 炸弹音效
  - `assets/sounds/SoundofUsingItems.wav` — 道具使用

- **背景音乐**：主题 MP3 文件
  - 6 个主题各有独立 BGM，位于 `assets/music/Themes/{ThemeName}/`
  - 随关卡主题轮换自动切换（每 3 关一个主题）
  - 主题间切换使用淡入淡出过渡
  - 格式：MP3（全平台兼容）

## 主题 BGM 映射

| 主题 | BGM 路径 |
|------|----------|
| 缤纷果园（Orchard） | `assets/music/Themes/Orchard/秋日果园漫步_no-watermark.mp3` |
| 奇趣动物园（Zoo） | `assets/music/Themes/Zoo/小动物们的捉迷藏_no-watermark.mp3` |
| 春日庭院（Spring Garden） | `assets/music/Themes/Spring Garden/春庭樱梦_no-watermark.mp3` |
| 星际探险（Starbound） | `assets/music/Themes/Starbound/星云漫游_no-watermark.mp3` |
| 环球美食（Bistro） | `assets/music/Themes/Bistro/巴黎街角的雨天_no-watermark.mp3` |
| 像素冒险（Retro Quest） | `assets/music/Themes/Retro Quest/像素宝藏_no-watermark.mp3` |

## 连击和弦系统

连击消除使用 10 级自然音阶和弦递进（C 大调音阶上行）：

| combo 级别 | 和弦 | 波形 |
|------------|------|------|
| 1 | C（C5-E5-G5） | triangle |
| 2 | Dm（D5-F5-A5） | triangle |
| 3 | Em（E5-G5-B5） | triangle |
| 4 | F（F5-A5-C6） | triangle |
| 5 | G（G5-B5-D6） | triangle |
| 6 | Am（A5-C6-E6） | sawtooth |
| 7 | Bdim（B5-D6-F6） | sawtooth |
| 8 | C8va（C6-E6-G6） | sawtooth |
| 9 | Dm8va（D6-F6-A6） | sawtooth |
| 10（闪电） | 独立雷鸣音效 | 白噪声 + 锯齿波扫频 |

## 合成示例

```
点击：    短正弦波（800Hz → 1200Hz，50ms，快速衰减）
消除：    C-E-G 和弦（C5 E5 G5，300ms，柔和衰减）
飞入：    正弦波上升滑音（400Hz → 800Hz，200ms）
连击：    自然音阶和弦递进（见上表），每次连击升一级
闪电：    白噪声衰减（雷鸣）+ 锯齿波扫频（电击），约 500ms
```

## 音量控制

两个独立开关（均存在 localStorage）：

| 开关 | 键名 | 默认 | 控制范围 |
|------|------|------|----------|
| 音效 | `settings.soundEnabled` | true | 所有程序化合成的音效 + 文件音效 |
| 音乐 | `settings.musicEnabled` | true | BGM 背景音乐 |

- 游戏内设置按钮，随时可调
- 音量变化平滑过渡，无突然静音/恢复
- 两个开关独立控制：可以只关音乐保留音效，或反之

## 音效与 BGM 同时播放策略

当音效和 BGM 同时播放时，音效触发后 BGM 自动短暂降低音量（-6dB），约 200ms 后恢复，无须人工干预。
