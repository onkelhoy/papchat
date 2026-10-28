# @papchat/video-tile

Participant video tile with name, mute and speaking state

![Logo](https://github.com/onkelhoy/papchat/blob/main/asset/logo.svg)

---

![Type](https://img.shields.io/badge/Type-molecules-orange)
[![Tests](https://github.com/onkelhoy/papchat/actions/workflows/pull-request.yml/badge.svg)](https://github.com/onkelhoy/papchat/actions/workflows/pull-request.yml)
[![NPM version](https://img.shields.io/npm/v/@papchat/video-tile.svg?logo=npm)](https://www.npmjs.com/package/@papchat/video-tile)

---

## installation

```bash
npm install @papchat/video-tile
```

### to use in **html**

```html
<script type="module" defer>
  import "@papchat/video-tile";
</script>

<pc-video-tile></pc-video-tile>
```

## API

| Property | Attribute | Type | Default | Description |
| --- | --- | --- | --- | --- |
| `profile` | - | `Profile` | - | who this is (`name`, `uid`, `color`); property only |
| `video` | - | `MediaStream` | - | camera or screen stream; without a live video track the avatar shows; property only |
| `audio` | - | `MediaStream` | - | mic stream for the level meter and speaking ring (not played); property only |
| `muted` | `muted` | `boolean` | `false` | remote mic flag: mic-off icon, no meter, reflected |
| `self` | `self` | `boolean` | `false` | mirrors the video and mutes the video element, reflected |
| `screen` | `screen` | `boolean` | `false` | screen share: `fit="contain"`, not mirrored, reflected |
| `pinned` | `pinned` | `boolean` | `false` | pinned state, reflected, toggled by the Pin button |

| Event | Detail | Description |
| --- | --- | --- |
| `pin` | `{ pinned: boolean }` | the Pin button was used; `pinned` is already toggled (bubbles, composed) |
| `speaking` | `{ speaking: boolean }` | from the inner `pc-level-meter`, bubbles out unchanged |

The host needs a size from its parent. CSS: `--video-tile-avatar-size`, `--video-tile-ring-width`, `::part(video|avatar|label|actions)`, `:state(speaking)`.

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
