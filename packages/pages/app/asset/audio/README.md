# Audio files

Drop your premade sounds here. They are served at `/audio/...` (`public/audio/...` in the static build) and loaded with `fetch` (not `new Audio(src)`), so `@papit/static` can rewrite the path.

| File | Purpose |
| --- | --- |
| `ringtones/<name>.mp3` | one per ringtone the user can pick; list each in `ringtones/ringtones.json` |
| `ringtones/ringtones.json` | `[{ "id": "classic", "file": "classic.mp3", "label": "Classic" }]`, empty (`[]`) until you add tones |
| `ringback.mp3` | played to the caller while the other side rings |
| `message.mp3` | short ping for a new message |
