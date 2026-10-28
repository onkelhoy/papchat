# @papchat/call-stage

Responsive video grid

![Logo](https://raw.githubusercontent.com/onkelhoy/papchat/refs/heads/main/asset/logo.svg)

---

![Type](https://img.shields.io/badge/Type-organisms-orange)
[![Tests](https://github.com/onkelhoy/papchat/actions/workflows/pull-request.yml/badge.svg)](https://github.com/onkelhoy/papchat/actions/workflows/pull-request.yml)
[![NPM version](https://img.shields.io/npm/v/@papchat/call-stage.svg?logo=npm)](https://www.npmjs.com/package/@papchat/call-stage)

---

## installation

```bash
npm install @papchat/call-stage
```

### to use in **html**

```html
<script type="module" defer>
  import "@papchat/call-stage";
</script>

<pc-call-stage></pc-call-stage>
```

## API

| Property  | Attribute | Type         | Default | Description                                                                          |
| --------- | --------- | ------------ | ------- | ------------------------------------------------------------------------------------ |
| `tiles`   | -         | `CallTile[]` | `[]`    | participants `{ id, profile, video?, audio?, muted?, screen?, self?, pinned? }`; property only, assign a new array to update |
| `sinkid`  | `sinkid`  | `string`     | `""`    | output device id for remote audio (`setSinkId` where supported)                      |

| Event | Detail                           | Description                                                         |
| ----- | -------------------------------- | ------------------------------------------------------------------- |
| `pin` | `{ id: string, pinned: boolean }` | a tile was pinned or unpinned (bubbles, composed)                   |

Layout: 1 tile fills the stage, 2 side by side, 3 to 4 a 2x2 grid, 5 to 8 three columns. A pinned tile (or else the first screen share) is the big one with the rest in a strip. In a 1:1 call your `self` tile is a corner overlay. The stage plays remote audio itself (one hidden `<audio>` per non-self tile with `audio`). The host needs a size from its parent. CSS: `--call-stage-gap`, `--call-stage-strip-width`, `--call-stage-self-width`, `::part(tiles|tile)`.

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
