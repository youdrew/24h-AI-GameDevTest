# Tile Explorer · 主题与背景图生成提示词

> 目的：每一关都属于某个主题，主题轮换。每个主题有 ① 一套独立的瓦片图案
> （≥ 28 种 emoji，覆盖 PT_CAP）和 ② 一张专属背景图。
>
> 本文档由 Claude 起草，**用户审定后**再去生成图片。下方 FAQ 列出待你拍板的几个问题。

---

## 一、待你拍板（开工前必答）

1. **主题数量**：下面我先准备了 6 套，够吗？少了再加，多了删掉哪几个？
2. **主题轮换节奏**：
   - A. **每关切换**：第 N 关 = 主题 `themes[(N-1) % themes.length]`。变化最频繁，新鲜感强，但视觉跳脱。
   - B. **按区段切换**：每 5 关或 10 关一个主题，作为"章节"边界。视觉更稳，节奏感强。
   - 我倾向 **B、每 5 关一段**（既能让玩家"沉浸"又能定期换新）。
3. **背景图规格**：
   - 推荐 **1920×1080（16:9）**，PNG，单张 ≤ 800 KB（PWA 离线缓存友好）。
   - 是否需要同时出竖屏 1080×1920 用于手机？还是统一用横屏 + CSS `cover` 裁切？
4. **风格基调**：我下面写的提示词都偏 **柔和插画 / 低对比度 / 暖色调**，避免抢瓦片的视觉。OK 吗？或者你想要：写实摄影、像素艺术、手绘水彩、3D 渲染……?

回答完后我再去：(a) 把 PATTERN_LIBRARY 改造成"按主题分组"的结构、(b) 在 `level.js` 里加 `themeForLevel(N)`、(c) 在 board 后面加一层 `PIXI.Sprite` 渲染背景图、(d) 把 `index.html` / 缓存策略改一改。

---

## 二、主题清单（6 套）

下面每套主题给出 **32 个 emoji**（覆盖现 PATTERN_LIBRARY 的 32 容量）。
每套的前 28 个对应 `PT_CAP=28` 的实际游戏使用，后 4 个是预留扩展。

### 主题 1 · 🍎 缤纷果园 Orchard

```
🍎 🍐 🍊 🍋 🍌 🍉 🍇 🍓
🫐 🍒 🍑 🥭 🍍 🥥 🥝 🍈
🍏 🥑 🍅 🌽 🥕 🍆 🌶 🫒
🍞 🥐 🧀 🍯  ·  🍪 🍰 🥧 🍩
```

### 主题 2 · 🦊 奇趣动物园 Zoo

```
🐱 🐶 🐰 🐻 🦊 🐼 🐯 🦁
🐨 🐮 🐷 🐸 🦄 🦒 🐘 🦓
🦏 🦛 🐊 🐢 🐍 🦔 🐹 🐭
🐺 🦝 🐗 🦌  ·  🐧 🦉 🦅 🦩
```

### 主题 3 · 🌸 春日庭院 Spring Garden

```
🌸 🌷 🌹 🌺 🌻 🌼 💐 🌱
🍀 🍃 🌿 🌳 🌲 🌴 🌵 🍂
🌷 🦋 🐝 🐞 🐛 🐌 🕊️ ☀️
🌤️ 🌈 🌙 ⭐  ·  ❄️ ☔ ⛅ 💧
```

### 主题 4 · 🚀 星际探险 Starbound

```
🚀 🛸 🛰️ 🌍 🌎 🌏 🌑 🌒
🌓 🌔 🌕 🌖 🌗 🌘 ⭐ 🌟
✨ 💫 🌠 ☄️ 🪐 🌌 👽 🤖
🛞 🪂 🧭 🔭  ·  🛟 🌡️ 🪞 🔋
```

### 主题 5 · 🍱 环球美食 Bistro

```
🍣 🍱 🍙 🍚 🍜 🍝 🍤 🥟
🍕 🍔 🌭 🌮 🌯 🥙 🥪 🍟
🥗 🍳 🥘 🍲 🥣 🍦 🍰 🧁
🍪 🍩 🍫 🍮  ·  ☕ 🍵 🥤 🍷
```

### 主题 6 · 🎮 像素冒险 Retro Quest

```
🎮 🕹️ 🎯 🎲 🃏 🧩 🎰 🎳
👾 💎 🪙 💰 🗝️ 🛡️ ⚔️ 🏹
🪄 📜 🗡️ 💣 🔮 🪬 ⚜️ 🧿
🏰 🏯 ⛩️ 🗿  ·  🎁 🎵 🪅 🎊
```

---

## 三、背景图生成提示词（中英对照）

> 以下提示词适用于 **Midjourney v6、SDXL、DALL·E 3、Flux** 等模型。
> 共用尾缀：`16:9 aspect ratio, 1920x1080, soft lighting, no text or letters, no human characters, mobile game background, distant blurred composition, top-down or wide angle, very low contrast, plenty of negative space in the center for UI overlay, cohesive style across set --ar 16:9 --style raw --v 6`

### 主题 1 · Orchard（果园）

> A tranquil sun-dappled fruit orchard at golden hour, soft watercolor illustration style, rolling hills with apple and peach trees, ripe fruits glowing warmly on branches, baskets of berries in foreground corners, warm peach and butter-yellow palette, painterly brushstrokes, soft bokeh foreground, vignette toward edges, **center area kept airy and uncluttered for UI**, ultra cohesive children's storybook aesthetic.

中文版：黄昏果园，柔和水彩插画，远处缓坡苹果树与桃树，果实在枝头温暖发光，画面四角点缀果篮与浆果，桃色与奶油黄主调，画面中央留白便于 UI 叠加，绘本风格。

### 主题 2 · Zoo（动物园）

> A whimsical savanna and rainforest cross-fade scene, soft cel-shaded illustration, distant silhouettes of elephants and giraffes against a misty sunrise, jungle leaves framing the corners, warm green-and-amber palette, dreamy atmospheric haze, **the central one-third kept clean and simple for game tiles**, gentle painterly textures, no individual animal faces in focus, cohesive Studio-Ghibli-meets-Pixar feel.

中文版：草原与雨林交融，柔和赛璐璐风，远处大象长颈鹿剪影，朝雾笼罩，丛林叶片镶边，绿琥珀主色，中部三分之一留空，吉卜力 + 皮克斯氛围。

### 主题 3 · Spring Garden（春日庭院）

> A peaceful Japanese-style spring garden in soft afternoon light, watercolor with subtle pink cherry blossoms drifting across the air, a stone path winding through moss and azalea bushes, distant pavilion silhouette, blossom petals floating, pastel pink and sage green palette, atmospheric perspective, **center area remains uncluttered with light haze for tile readability**, ultra-soft painterly brushwork.

中文版：日式春日庭院，午后斜光，水彩风，淡粉樱花飘飞，石径穿过苔藓与杜鹃，远处亭台剪影，粉绿主色，中央留淡雾便于瓦片识别。

### 主题 4 · Starbound（星际）

> A serene cosmic seascape, deep navy and indigo nebula clouds, distant ringed planet on the horizon, scattered stars and gentle galaxy swirls, soft glowing aurora at the bottom, painterly cosmic horizon, dreamy and contemplative atmosphere, **central region intentionally darker and quieter to let UI overlay shine**, cohesive sci-fi children's-book aesthetic, color palette of deep blue, purple, and warm gold accents.

中文版：宁静宇宙海，深蓝靛紫星云，远处带环行星，散落星点与银河旋涡，底部柔和极光，太空儿童绘本风，中央深而静以衬托 UI，深蓝紫为主，金色点缀。

### 主题 5 · Bistro（美食）

> A cozy bistro window scene at dusk, warm interior lighting spilling onto a wooden counter with stylized illustrated condiment jars and breadbaskets in the corners, a faintly visible chef silhouette far in the background blur, color palette of cream, terracotta, and soft mustard, gentle film-grain texture, painterly illustration, **center stays soft and uncluttered for the playfield**, charming European storybook feel.

中文版：黄昏小餐馆窗景，木质柜台暖色光，四角点缀调味罐与面包篮，远处朦胧厨师剪影，奶油色 / 赤陶 / 芥末色为主，柔和颗粒感，中央留白，欧洲绘本气质。

### 主题 6 · Retro Quest（像素冒险）

> An epic pixel-art-inspired fantasy landscape rendered in soft modern illustration (NOT pixelated): rolling lands with a distant castle on a misty hill, scattered glowing crystals and treasure chests in the corners, a winding path leading toward the horizon, warm late-afternoon light, palette of mossy green, faded amber, and dusk purple, soft atmospheric haze, **central two-thirds kept calm with low detail for UI**, cohesive 16-bit-RPG-meets-watercolor mood.

中文版：复古 RPG 感的幻想地景，但用现代插画绘制（非像素），远处迷雾山上的城堡，四角散落水晶与宝箱，蜿蜒小路通向天际，午后斜阳，苔绿 / 旧琥珀 / 暮紫主色，柔雾，中部三分之二保持平静低细节。

---

## 四、共通设计准则（提示词里已强调）

1. **中央留白**：瓦片网格在画面中央。背景中央的对比度、细节、亮度都要压低，否则瓦片识别困难。
2. **无文字、无人脸**：避免出现 emoji-like 的图形元素，否则会跟瓦片图案打架。
3. **同主题色调统一**：每个主题的边角点缀颜色应与对应瓦片背景色（`TILE_BG_COLORS`）有反差，确保瓦片在背景上清晰。
4. **PNG 优先**：导出 PNG 后用 `pngquant --quality=70-85` 之类压缩，目标 ≤ 800 KB。
5. **加载失败兜底**：代码里我会保留当前的纯色/渐变作为 fallback；背景图未就绪不影响游戏。

---

## 五、命名约定

放在 `assets/backgrounds/` 下，按主题 id 命名：

```
assets/backgrounds/
  orchard.png
  zoo.png
  spring.png
  starbound.png
  bistro.png
  retro.png
```

主题 id 与上面一致，方便代码里用 `themes[id].background = 'assets/backgrounds/<id>.png'` 直接拼接。

---

## 七、主题专属 BGM 生成提示词

> 每套主题一首专属 BGM，风格与主题的视觉氛围高度匹配。共享技术规范：无鼓组、无重低音、纯器乐、无缝循环、15-30秒、.ogg+.m4a双格式、约50-100KB。

### 主题 1 · Orchard（果园）

轻松宁静的果园主题休闲游戏背景音乐，15到30秒无缝循环。风格为日系治愈系，温暖的电子钢琴奏出如阳光穿过树叶般斑驳的主旋律，尤克里里拨出轻快的分解和弦像果园里的小溪流水，钟琴偶尔点缀几颗清脆的音符像树上的果子被风吹响。速度约85到95 BPM，中速偏慢，4/4拍。整体氛围是"秋日午后在果园里悠闲散步，周围是成熟的果香和远处的鸟鸣"。旋律明亮温暖但不刺眼，段落结尾自然回落方便无缝循环。不要鼓组，不要任何紧张或沉重的元素。配器3到4个声部，整体感觉阳光金色、丰收满足。纯器乐，无人声。

### 主题 2 · Zoo（动物园）

可爱俏皮的动物园主题休闲游戏背景音乐，15到30秒无缝循环。风格为日系治愈系，明快的电子琴奏出略带跳跃感的主旋律，像小动物们欢快地跳来跳去，木琴和马林巴交替跑动增加活力，尤克里里轻轻扫弦制造轻快节奏感。速度约100到110 BPM，中速，4/4拍。整体氛围像"阳光草原上小动物们在捉迷藏，远处大象在喷水，长颈鹿在吃树叶"——充满童趣、生机勃勃但不吵闹。旋律可爱洗脑，段落结尾自然上扬回落方便无缝循环。不要鼓组，不要任何野生动物的紧张感或掠食者元素。配器4到5个声部，保持童真感。纯器乐，无人声。

### 主题 3 · Spring Garden（春日庭院）

柔美梦幻的春日庭院主题休闲游戏背景音乐，15到30秒无缝循环。风格为日系治愈系，柔和的电子钢琴奏出如樱花飘落般轻盈的旋律，合成器弦乐在远处铺出一层薄薄的花香感，尤克里里偶尔拨出一两个温柔的音，钟琴零星点缀像落在花瓣上的露珠。速度约80到90 BPM，中速偏慢，4/4拍。整体氛围是"春天走在日本庭院的石板路上，两旁樱花盛开，微风吹过花瓣落在肩上"——浪漫、宁静、有一点点诗意的忧伤但主要是美好。旋律如梦似幻，段落结尾自然消散方便无缝循环。不要鼓组，不要任何有力量感或节奏强烈的元素。配器3到4个声部，大量留白，像花瓣落在水面上的感觉。纯器乐，无人声。

### 主题 4 · Starbound（星际探险）

空灵深邃的星际探险主题休闲游戏背景音乐，15到30秒无缝循环。风格为日系治愈系但带有科幻感，电子钢琴奏出如星光闪烁般空灵的主旋律，合成器铺出宇宙空间感，尤克里里拨出轻微的音像太空舱里的微弱震动，钟琴偶尔点缀像远处星尘闪烁。速度约70到80 BPM，慢速，4/4拍。整体氛围是"驾驶小小的飞船穿越星云，窗外是无尽的星空，但一点都不害怕，反而觉得宁静而神秘"。旋律悠远但有温度，不冷冰，像宇宙中最后一丝温暖。段落结尾自然消散方便无缝循环。不要鼓组，不要任何紧张或危险的科幻元素。配器3到4个声部，营造宇宙的广阔与孤独感。纯器乐，无人声。

### 主题 5 · Bistro（环球美食）

温馨舒适的美食主题休闲游戏背景音乐，15到30秒无缝循环。风格为日系治愈系，温暖的电子琴奏出像炖菜锅冒出的热气一样温润的主旋律，木琴点缀几颗像叉子碰到瓷盘的清脆音，尤克里里轻轻扫弦制造咖啡馆背景音的节奏感。速度约90到100 BPM，中速，4/4拍。整体氛围是"清晨在巴黎街角的小咖啡馆里，窗外下着小雨，手里捧着一杯热可可，点了一块蓝莓蛋糕，不用赶时间，只是单纯地享受当下"。旋律温暖慵懒，有一点点法式浪漫但不刻意。段落结尾自然回落方便无缝循环。不要鼓组，不要任何快节奏或需要"赶紧吃完"的催促感。配器3到4个声部，像咖啡馆背景爵士乐但更轻柔。纯器乐，无人声。

### 主题 6 · Retro Quest（像素冒险）

充满回忆感的复古像素冒险主题休闲游戏背景音乐，15到30秒无缝循环。风格为日系治愈系但带有16位游戏感，电子琴奏出像早期RPG里城堡主题一样温暖而略带史诗感的主旋律，马林巴快速跑动增加冒险感，尤克里里均匀分解和弦提供稳定的节奏感，偶尔三角铁点缀像获得小金币时的声音。速度约100到115 BPM，中速偏快，4/4拍。整体氛围是"在像素风的世界里走过了漫长的旅途，终于找到了隐藏的宝藏，但不激动，只是满足和怀念，像翻开了一本小时候的日记"。旋律有一点点怀旧的史诗感但保持休闲游戏的轻松。段落结尾自然上扬回落方便无缝循环。不要鼓组（可以有轻微的8-bit风味的叮咚声），不要任何紧张战斗或危险的感觉。配器4到5个声部，复古但不冰冷。纯器乐，无人声。

---

## 八、主题 BGM 汇总

| 主题 | 场景 | BPM | 主乐器 | 氛围关键词 |
|------|------|-----|--------|-----------|
| Orchard 果园 | 主题1 | 85-95 | 电子钢琴+尤克里里+钟琴 | 阳光金色、丰收满足 |
| Zoo 动物园 | 主题2 | 100-110 | 电子琴+木琴+马林巴+尤克里里 | 童趣俏皮、生机勃勃 |
| Spring Garden 春日庭院 | 主题3 | 80-90 | 电子钢琴+合成弦乐+钟琴 | 樱花飘落、诗意梦幻 |
| Starbound 星际探险 | 主题4 | 70-80 | 电子钢琴+合成器+尤克里里+钟琴 | 宇宙宁静、深邃温暖 |
| Bistro 环球美食 | 主题5 | 90-100 | 电子琴+木琴+尤克里里 | 法式浪漫、慵懒温馨 |
| Retro Quest 像素冒险 | 主题6 | 100-115 | 电子琴+马林巴+尤克里里+三角铁 | 怀旧史诗、满足怀念 |

> 每首 BGM 时长15-30秒无缝循环，.ogg+.m4a双格式，约50-100KB。可独立用于对应主题关卡，也可与通用 BGM 混合使用（通用 BGM 做场景铺垫，主题 BGM 强化沉浸感）。

## 六、下一步（你回复后我执行）

- [ ] 你确认 6 套主题（如有增删告诉我）
- [ ] 你确认轮换策略（A / B-5 / B-10 / 其它）
- [ ] 你确认背景规格（横屏 / 横屏+竖屏）
- [ ] 你拿提示词去生成 6 张背景图，丢进 `assets/backgrounds/`
- [ ] 我这边在代码里把主题系统接进 board / level / 渲染层，并在缓存策略里加上背景图
