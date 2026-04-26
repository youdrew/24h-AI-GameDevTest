# Supabase 数据库结构

## 表结构

```sql
-- 玩家
CREATE TABLE players (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  device_id VARCHAR(36) UNIQUE NOT NULL,  -- 客户端生成的 UUID
  display_name VARCHAR(12) NOT NULL DEFAULT 'Player',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  last_active_at TIMESTAMPTZ DEFAULT NOW()
);

-- 关卡记录
CREATE TABLE level_records (
  id BIGSERIAL PRIMARY KEY,
  player_id UUID REFERENCES players(id),
  level INT NOT NULL,
  stars INT CHECK (stars BETWEEN 1 AND 3),
  steps INT,
  completed_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(player_id, level)  -- 每个玩家每关最好记录
);
```

## 写入方案：RPC 函数（推荐）

由于未使用 Supabase Auth，采用 `anon` key + PostgreSQL SECURITY DEFINER 函数进行写入验证。读取使用普通 SELECT + anon key。

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

## 读取方案

```sql
-- 关卡排行榜（前 20）
SELECT p.display_name, lr.stars, lr.steps
FROM level_records lr
JOIN players p ON lr.player_id = p.id
WHERE lr.level = $level
ORDER BY lr.stars DESC, lr.steps ASC
LIMIT 20;

-- 全球排行榜（总星数排名，前 50）
SELECT p.display_name, SUM(lr.stars) AS total_stars, SUM(lr.steps) AS total_steps
FROM players p
JOIN level_records lr ON lr.player_id = p.id
GROUP BY p.id, p.display_name
ORDER BY total_stars DESC, total_steps ASC
LIMIT 50;
```

## 行级安全（RLS）

```sql
ALTER TABLE players ENABLE ROW LEVEL SECURITY;
ALTER TABLE level_records ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Public read" ON players FOR SELECT USING (true);
CREATE POLICY "Public read" ON level_records FOR SELECT USING (true);
-- 写入通过 SECURITY DEFINER 函数，无需额外 INSERT 策略

## 并发安全

`upsert_record` RPC 函数内部使用 `ON CONFLICT DO UPDATE`，PostgreSQL 对同一 `device_id` 的并发写入会在行级加锁，保证 upsert 逻辑（保留最佳星数 + 同星数取最少步数）的原子性。

极端情况下（两次提交间隔 < 1ms 的同一关卡），后提交若步数更优会覆盖前一次，符合"保留最佳"的设计预期。
```
