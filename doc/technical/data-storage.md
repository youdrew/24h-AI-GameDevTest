# 数据存储（localStorage）

## 容量边界处理

| 场景 | 处理策略 |
|------|----------|
| localStorage 写满 | 捕获 `QuotaExceededError`，不阻塞游戏；排行榜功能静默降级（本地缓存排行榜数据，网络失败时继续尝试重试） |
| localStorage 被清除 | `playerId` 丢失，用户以新 UUID 重新注册；排行榜历史记录不可恢复 |
| 隐私模式（Safari） | localStorage 不可用，生成临时 UUID（会话级）并提示用户排行榜功能需在正常模式下使用 |

## 数据结构

```json
{
  "schemaVersion": 1,
  "currentLevel": 12,
  "stars": { "1": 3, "2": 3, "3": 2 },
  "powerups": { "shuffle": 0, "undo": 0, "hint": 0, "bomb": 0, "freeze": 0 },
  "settings": {
    "soundEnabled": true,
    "musicEnabled": true
  },
  "playerId": "uuid-v4-generated-on-first-visit",
  "playerName": "Player#A3F2",
  "levelCache": {},
  "tutorialSeen": { "basicTap": true, "cover": false, "shuffle": false, "undo": false, "hint": false }
}
```

## 字段说明

| 字段 | 类型 | 说明 |
|------|------|------|
| `schemaVersion` | int | 数据结构版本号，用于未来迁移（当前为 1） |
| `currentLevel` | int | 当前关卡编号 |
| `stars` | object | 每关获得的最高星级（key=关卡号, value=1-3） |
| `powerups` | object | 各道具当前持有数量 |
| `settings.soundEnabled` | bool | 音效开关（独立于音乐） |
| `settings.musicEnabled` | bool | 背景音乐开关（独立于音效） |
| `playerId` | string | 客户端生成的 UUID v4，用于排行榜识别 |
| `playerName` | string | 显示名称，默认 `Player#XXXX`，可自定义 |
| `levelCache` | object | 关卡求解缓存（key=关卡号, value={layout, optimalSteps}），避免重复求解 |
| `tutorialSeen` | object | 教程引导完成标记（key=功能名, value=bool），控制每种引导只触发一次 |

## 数据迁移

`storage.js` 在加载数据时检查 `schemaVersion`：

```
function migrate(data):
    if !data.schemaVersion:
        data = defaultData()  // 无版本号的旧数据重置
    if data.schemaVersion == 1:
        // 未来 v2 迁移逻辑写在这里
    data.schemaVersion = CURRENT_VERSION
    return data
```

每次 schema 变更时递增 `CURRENT_VERSION`，添加对应的迁移函数。
