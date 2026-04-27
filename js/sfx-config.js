// Tile Explorer — SFX 配置表
//
// 这是音效参数的「单一真相来源」。可以直接编辑下面任何一个数值来微调音效；
// audio.js 读取时会按字段类型校验：
//   - 数字字段被改成 NaN / 字符串 → 该字段回退到内置默认值（即此文件提交时的原始值）
//   - 字符串字段被改成数字 / 空 → 同上回退
//   - 整张表条目被删掉 → 整套用内置默认值
//   - 整个文件 import 失败（极端情况，例如语法错） → 浏览器报错时游戏仍尝试静音，但不会崩溃
//
// 所以可以放心改这里的数值；改坏一个字段最多导致那个字段听起来仍是默认音，不会静音。
//
// ─────────────────────────────────────────────────────────────────────────────
// 字段约定
//
//   wave         波形：'sine' | 'square' | 'triangle' | 'sawtooth'
//   freq*        Hz 频率
//   freqStart/   单振荡音效的起始/结束频率（中间会做指数滑音）
//     freqEnd
//   slideTime    起始 → 结束频率的滑音时长（秒）
//   attack       包络起音时间，0 → peak 用多久（秒）
//   decay        包络衰减时间，peak → 静音用多久（秒）
//   peak         音量峰值 [0..1]，0 = 静音
//   stagger      多音音效中相邻音之间的间隔（秒）
//   freqs        多音音效的频率序列（按顺序播放）
//   gap          双音音效中两音之间的间隔（秒）
//   file         文件型音效的资源路径（相对于站点根目录）
//
// ─────────────────────────────────────────────────────────────────────────────

export const SFX = {
  // 单振荡型 — 用 _osc() 一次合成。可调 freqStart/End 改音高，slideTime 改滑音节奏。
  tap:    { wave: 'sine',     freqStart: 800,  freqEnd: 1200, slideTime: 0.04, attack: 0.003, decay: 0.06, peak: 0.25 },
  fly:    { wave: 'sine',     freqStart: 400,  freqEnd: 800,  slideTime: 0.18, attack: 0.005, decay: 0.18, peak: 0.18 },
  undo:   { wave: 'sine',     freqStart: 600,  freqEnd: 300,  slideTime: 0.18, attack: 0.005, decay: 0.18, peak: 0.18 },
  drop:   { wave: 'sine',     freqStart: 200,  freqEnd: 80,   slideTime: 0.10, attack: 0.005, decay: 0.12, peak: 0.30 },
  reveal: { wave: 'triangle', freqStart: 1320, freqEnd: 1760, slideTime: 0.06, attack: 0.005, decay: 0.10, peak: 0.08 },

  // 单音型 — 不滑音的固定单音。用于 comboLevel === 0 的"普通三连"反馈。
  plainMatch: { wave: 'triangle', freq: 523.25, attack: 0.005, decay: 0.18, peak: 0.16 },

  // 双音型 — 两个方波接连响起。
  warning: { wave: 'square', freq1: 880, freq2: 660, gap: 0.090, attack: 0.005, decay: 0.08, peak: 0.12 },

  // 快速咔嗒 — 一连串随机频率方波（洗牌动效）。
  shuffle: { wave: 'square', count: 6, freqMin: 400, freqMax: 1000, stagger: 0.030, attack: 0.002, decay: 0.04, peak: 0.12 },

  // 多音渐进型 — freqs 顺序排列的几个音，按 stagger 错开起始时间。
  hint:   { wave: 'sine',     freqs: [880, 1320, 1760],            stagger: 0.06, attack: 0.01, decay: 0.40, peak: 0.12 },
  freeze: { wave: 'triangle', freqs: [1760, 1480, 1320, 880],      stagger: 0.04, attack: 0.01, decay: 0.35, peak: 0.15 },
  reward: { wave: 'triangle', freqs: [659.25, 783.99, 1046.5, 1318.5], stagger: 0.06, attack: 0.01, decay: 0.30, peak: 0.18 },

  // 闪电 — 噪声爆 + 锯齿扫频，参数较多。
  lightning: {
    noiseDuration: 0.50,    // 噪声爆持续时长（秒）
    noiseLowpass:  600,     // 噪声经过的低通频率
    noisePeak:     0.25,    // 噪声音量
    sawFreqStart:  2000,    // 锯齿扫频起始频率
    sawFreqEnd:    200,     // 锯齿扫频结束频率
    sawDuration:   0.40,    // 扫频持续时长
    sawAttack:     0.02,    // 锯齿包络起音
    sawDecay:      0.43,    // 锯齿包络衰减（attack + decay 应小于 sawTotal）
    sawTotal:      0.50,    // 锯齿振荡器总时长
    sawPeak:       0.18     // 锯齿音量峰值
  },

  // 文件型音效 — 从 file 加载并播放。
  bomb:    { file: 'assets/sounds/bomb.wav' },
  win:     { file: 'assets/sounds/win.wav' },
  fail:    { file: 'assets/sounds/failure.wav' },
  itemUse: { file: 'assets/sounds/SoundofUsingItems.wav' }
};

// ─────────────────────────────────────────────────────────────────────────────
// 连击和弦表
//
// 每完成一次三连且 chainCount ≥ 3 时 combo +1，audio.match(combo) 取这张表的
// 第 combo-1 项播放。第 10 项是连击上限。可以替换 freqs 改和弦音；wave 切换波形；
// peak 调音量。如果某项被改坏，audio.js 会回退到该项的内置默认值。
// ─────────────────────────────────────────────────────────────────────────────

export const COMBO_CHORDS = [
  { freqs: [523.25, 659.25, 783.99],             wave: 'triangle', peak: 0.18 }, //  1: C  major
  { freqs: [587.33, 698.46, 880.00],             wave: 'triangle', peak: 0.18 }, //  2: D  minor
  { freqs: [659.25, 783.99, 987.77],             wave: 'triangle', peak: 0.19 }, //  3: E  minor
  { freqs: [698.46, 880.00, 1046.50],            wave: 'triangle', peak: 0.19 }, //  4: F  major
  { freqs: [783.99, 987.77, 1174.66],            wave: 'triangle', peak: 0.20 }, //  5: G  major
  { freqs: [880.00, 1046.50, 1318.51],           wave: 'sawtooth', peak: 0.16 }, //  6: A  minor
  { freqs: [987.77, 1174.66, 1479.98],           wave: 'sawtooth', peak: 0.16 }, //  7: B  dim
  { freqs: [1046.50, 1318.51, 1567.98],          wave: 'sawtooth', peak: 0.17 }, //  8: C  maj (8va)
  { freqs: [1174.66, 1396.91, 1760.00],          wave: 'sawtooth', peak: 0.17 }, //  9: D  min (8va)
  { freqs: [1318.51, 1567.98, 1975.53, 2637.02], wave: 'sawtooth', peak: 0.18 }  // 10: E  min (8va) + sparkle
];
