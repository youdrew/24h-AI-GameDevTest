# Supabase 数据库初始化 SQL

在 Supabase 控制台的 **SQL Editor** 中依次执行以下三段 SQL。

---

## 1. 建表

```sql
CREATE TABLE players (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  device_id VARCHAR(36) UNIQUE NOT NULL,
  display_name VARCHAR(12) NOT NULL DEFAULT 'Player',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  last_active_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE level_records (
  id BIGSERIAL PRIMARY KEY,
  player_id UUID REFERENCES players(id),
  level INT NOT NULL,
  stars INT CHECK (stars BETWEEN 1 AND 3),
  steps INT,
  completed_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(player_id, level)
);
```

---

## 2. RPC 写入函数

```sql
CREATE OR REPLACE FUNCTION upsert_record(
  p_device_id VARCHAR(36),
  p_display_name VARCHAR(12),
  p_level INT,
  p_stars INT,
  p_steps INT
) RETURNS VOID AS $$
DECLARE
  v_player_id UUID;
BEGIN
  -- 输入校验
  IF p_display_name !~ '^[a-zA-Z0-9_\-一-鿿 ]{1,12}$' THEN
    RAISE EXCEPTION 'Invalid display_name';
  END IF;
  IF p_level < 1 OR p_level > 10000 THEN
    RAISE EXCEPTION 'Invalid level';
  END IF;
  IF p_stars < 1 OR p_stars > 3 THEN
    RAISE EXCEPTION 'Invalid stars';
  END IF;
  IF p_steps < 1 OR p_steps > 10000 THEN
    RAISE EXCEPTION 'Invalid steps';
  END IF;

  -- Upsert 玩家
  INSERT INTO players (device_id, display_name, last_active_at)
  VALUES (p_device_id, p_display_name, NOW())
  ON CONFLICT (device_id) DO UPDATE
    SET display_name = p_display_name, last_active_at = NOW()
  RETURNING id INTO v_player_id;

  -- Upsert 记录（保留最佳星级，同星级保留最少步数；仅改善时更新 completed_at）
  INSERT INTO level_records (player_id, level, stars, steps, completed_at)
  VALUES (v_player_id, p_level, p_stars, p_steps, NOW())
  ON CONFLICT (player_id, level) DO UPDATE
    SET stars = GREATEST(level_records.stars, p_stars),
        steps = CASE
          WHEN p_stars > level_records.stars THEN p_steps
          WHEN p_stars = level_records.stars AND p_steps < level_records.steps THEN p_steps
          ELSE level_records.steps
        END,
        completed_at = CASE
          WHEN p_stars > level_records.stars THEN NOW()
          WHEN p_stars = level_records.stars AND p_steps < level_records.steps THEN NOW()
          ELSE level_records.completed_at
        END;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
```

---

## 3. 行级安全（RLS）

```sql
ALTER TABLE players ENABLE ROW LEVEL SECURITY;
ALTER TABLE level_records ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Public read" ON players FOR SELECT USING (true);
CREATE POLICY "Public read" ON level_records FOR SELECT USING (true);
-- 写入通过 SECURITY DEFINER 函数，无需额外 INSERT 策略
```

---

## 4. 全球榜聚合 view

**给已经按 1–3 步部署过的项目**：把这段补跑一次即可。

```sql
-- 全球榜（按玩家累计星数 / 步数）。
-- 用 view 取代原来"客户端拉全表后聚合"的做法。
CREATE OR REPLACE VIEW player_totals AS
SELECT
  p.id            AS player_id,
  p.display_name  AS display_name,
  COALESCE(SUM(lr.stars), 0)::INT  AS total_stars,
  COALESCE(SUM(lr.steps), 0)::INT  AS total_steps,
  COUNT(lr.id)::INT                AS levels_cleared
FROM players p
LEFT JOIN level_records lr ON lr.player_id = p.id
GROUP BY p.id, p.display_name;

-- view 的 RLS 是底表的并集；players + level_records 已开 Public read，
-- view 自然可以匿名查询，不需要额外策略。
```

`leaderboard.js` 的 `getGlobalTop()` 现在只查这张 view + ORDER + LIMIT，不再下载全表。

---

## 5. 配置前端

执行完 SQL 后，在 Supabase 的 **Settings → API** 页面获取：

- **Project URL** — 如 `https://xxxx.supabase.co`
- **anon public** key — 以 `eyJhbG` 开头

填入 `js/config.js`：

```js
SUPABASE_URL: 'https://你的项目ID.supabase.co',
SUPABASE_ANON_KEY: '你的anon密钥',
```
