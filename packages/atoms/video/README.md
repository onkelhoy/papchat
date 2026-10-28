# @papchat/video

Video element for a MediaStream with autoplay fallback

![Logo](https://github.com/onkelhoy/papchat/blob/main/asset/logo.svg)

---

![Type](https://img.shields.io/badge/Type-atoms-orange)
[![Tests](https://github.com/onkelhoy/papchat/actions/workflows/pull-request.yml/badge.svg)](https://github.com/onkelhoy/papchat/actions/workflows/pull-request.yml)
[![NPM version](https://img.shields.io/npm/v/@papchat/video.svg?logo=npm)](https://www.npmjs.com/package/@papchat/video)

---

## installation

```bash
npm install @papchat/video
```

### to use in **html**

```html
<script type="module" defer>
  import "@papchat/video";
</script>

<pc-video></pc-video>
```

## API

| Property | Attribute | Type | Default | Description |
| --- | --- | --- | --- | --- |
| `stream` | - | `MediaStream \| null` | - | what to play; property only. Sets `srcObject` and calls `play()` |
| `muted` | `muted` | `boolean` | `false` | mute the audio (reflected); set it for your own camera |
| `mirror` | `mirror` | `boolean` | `false` | flip horizontally (reflected) |
| `fit` | `fit` | `"cover" \| "contain"` | `cover` | how the picture fills the element (reflected) |
| `sinkid` | `sinkid` | `string` | - | audio output device id, applied with `setSinkId` where supported |

If the browser refuses to autoplay, a "click to play" button overlays the video until it is pressed. `srcObject` is cleared when the element is disconnected and set again if it is re-attached.

No events. CSS: `--video-background`, `::part(video)`, `::part(overlay)`, `::part(play)`. The host needs a size (it is `display: block`). Translation key: `pc-video.play`.

## License

Licensed under the @Papit License 1.0 - Copyright (c) 2024 Henry Pap (@onkelhoy)

**Key points:**

- ✅ Free to use in commercial projects
- ✅ Free to modify and distribute
- ✅ Attribution required
- ❌ Cannot resell the component itself as a standalone product

See the [LICENSE](https://github.com/onkelhoy/papit/blob/main/LICENSE) file for full details.

## Related Components

- [@papit/web-component](https://github.com/onkelhoy/papit/tree/main/packages/web/engines/web-component): Core utilities, decorators, and base component class
