This directory holds the project's audio SFX (file-based, as opposed to the
procedurally-synthesized ones in `js/audio.js`).

## Files

- `win.wav`                    — level complete fanfare
- `failure.wav`                — level failed sting
- `bomb.wav`                   — bomb powerup explosion
- `SoundofUsingItems.wav`      — generic powerup activation cue

These were originally under `/sound/` and migrated here to keep all media under
`assets/`. Paths are configured in `js/sfx-config.js` (the `bomb` / `win` /
`fail` / `itemUse` entries) — point them somewhere else if you want to swap
out a sample.

## Future BGM (referenced from `doc/prompt/PROMPT_03_bgm.md`)

The PROMPT spec calls for OGG + M4A BGM tracks here. Today the actual BGM
lives under `assets/music/` (one folder per theme). This directory is reserved
for SFX only.
