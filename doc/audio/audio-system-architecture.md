# 音频系统架构

## 资源来源说明

音效（程序化合成，无需文件）和 BGM 文件来源：

- **音效**：全部通过 Web Audio API 程序化合成，无需任何音频文件
- **BGM**：由项目所有者（用户）后续提供，约 50-100KB，无版权问题，支持 `.ogg`（Chrome/Fireger/Edge）和 `.m4a`（Safari/iOS）双格式
- **声音源文件**（`sound/` 目录）：项目所有者提供的原始 WAV 音频，构建时转换为发布格式
- **发布音频**（`assets/sounds/` 目录）：游戏实际加载的音频文件（`.ogg` + `.m4a` 双格式），从源文件转换而来或由项目所有者直接提供

## Web Audio API

使用 `AudioContext` 管理所有音效。支持：
- 多轨同时播放（点击 + 消除可重叠）
- 音量控制（用户开关）
- 淡入 / 淡出
- 连击音调递进（每次连击音调升高半音）

## 程序化 vs 文件音频

采用**混合方案**：

- **音效**（点击、消除、连击等）：程序化合成（关卡完成音效除外）
  - 零网络请求，加载更快
  - 动态参数调整（音调、时长、音色）
  - 连击音调递进等交互式音效只能程序化实现

- **关卡完成**：音频文件
  - 2–3 秒胜利小曲，旋律质感需求与 BGM 类似
  - 双格式兼容：`assets/sounds/win.ogg` + `assets/sounds/win.m4a`

- **背景音乐**：音频文件
  - 15-30 秒无缝循环，轻快解谜风格
  - 双格式兼容：`assets/sounds/bgm.ogg`（Chrome/Firefox/Edge）+ `assets/sounds/bgm.m4a`（Safari/iOS）
  - 压缩后约 50-100KB
  - BGM 需要旋律质感，程序化振荡器无法达到

## 合成示例

```
点击：    短正弦波（800Hz → 1200Hz，50ms，快速衰减）
消除：    C-E-G 和弦（C5 E5 G5，300ms，柔和衰减）
飞入：    正弦波上升滑音（400Hz → 800Hz，200ms）
连击：    基础消除音效 + 每次连击高 2 个半音
```

## 音量控制

两个独立开关（均存在 localStorage）：

| 开关 | 键名 | 默认 | 控制范围 |
|------|------|------|----------|
| 音效 | `settings.soundEnabled` | true | 所有程序化合成的音效 |
| 音乐 | `settings.musicEnabled` | true | BGM 背景音乐 |

- 游戏内设置按钮，随时可调
- 音量变化平滑过渡，无突然静音/恢复
- 两个开关独立控制：可以只关音乐保留音效，或反之

## 音效与 BGM 同时播放策略

当音效和 BGM 同时播放时，音效触发后 BGM 自动短暂降低音量（-6dB），约 200ms 后恢复，无须人工干预。

## Safari 兼容

Safari 不支持 OGG 格式。BGM 文件提供两种格式，代码按浏览器支持选择：

```javascript
const canPlayOgg = audio.canPlayType('audio/ogg');
const bgmFile = canPlayOgg ? 'bgm.ogg' : 'bgm.m4a';
```
