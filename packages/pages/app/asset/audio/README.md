# Audio files

Drop your premade sounds here. They are served at `/audio/...` (`public/audio/...` in the static build) and loaded with `fetch` (not `new Audio(src)`), so `@papit/static` can rewrite the path.

| File | Purpose |
| --- | --- |
| `ringtones/<name>.mp3` | one per ringtone the user can pick; list each in `ringtones/ringtones.json` |
| `ringtones/ringtones.json` | `[{ "id": "classic", "file": "classic.mp3", "label": "Classic" }]`, empty (`[]`) until you add tones |
| `dialtones/<name>.mp3` | one per dial tone (what the caller hears while it rings); list each in `dialtones/dialtones.json`, same format. Without any file the built-in beep plays, and it is always offered as "Classic beep" |
| `sound/message.wav` | short ping for an incoming message (another chat, or this one while the tab is hidden) |

File names must not contain spaces: the static build's fetch shim misses them (papit finding #11).

## `denoise/`

Mic noise reduction (Settings → Audio → Noise reduction): AudioWorklets and WebAssembly models from [`@sapphi-red/web-noise-suppressor`](https://github.com/sapphi-red/web-noise-suppressor) (MIT, see `denoise/LICENSE`). "Standard" is RNNoise (`rnnoise*.wasm`), "Strong" is GTCRN (`gtcrn.wasm`). They're only fetched when a level is turned on. Don't edit them by hand: after updating the package, run `npm run denoise` in `packages/foundations/core` to copy them again.

