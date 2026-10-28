# @papchat/call-controls

Call toolbar: mic, camera, screen, invite, hang up

![Logo](https://github.com/onkelhoy/papchat/blob/main/asset/logo.svg)

---

![Type](https://img.shields.io/badge/Type-molecules-orange)
[![Tests](https://github.com/onkelhoy/papchat/actions/workflows/pull-request.yml/badge.svg)](https://github.com/onkelhoy/papchat/actions/workflows/pull-request.yml)
[![NPM version](https://img.shields.io/npm/v/@papchat/call-controls.svg?logo=npm)](https://www.npmjs.com/package/@papchat/call-controls)

---

## installation

```bash
npm install @papchat/call-controls
```

### to use in **html**

```html
<script type="module" defer>
  import "@papchat/call-controls";
</script>

<pc-call-controls></pc-call-controls>
```

## API

| Property | Attribute | Type | Default | Description |
| --- | --- | --- | --- | --- |
| `mic` | `mic` | `boolean` | `false` | microphone is on (`aria-pressed`), reflected |
| `camera` | `camera` | `boolean` | `false` | camera is on, reflected |
| `screen` | `screen` | `boolean` | `false` | you are sharing your screen, reflected |
| `chat` | `chat` | `boolean` | `false` | chat panel is shown (viewer mode only), reflected |
| `viewer` | `viewer` | `boolean` | `false` | only the chat toggle and "Leave" |
| `canscreen` | `canscreen` | `boolean` | `true` | `false` (or `canscreen="false"`) hides the screen button, for browsers without `getDisplayMedia` |

| Event | Detail | Description |
| --- | --- | --- |
| `toggle` | `{ control: "mic" \| "camera" \| "screen" \| "chat" }` | a toggle button was pressed; the component does not flip its own state, set the property back |
| `invite` | - | invite button |
| `devices` | - | devices button |
| `hangup` | - | hang up / leave button (also in viewer mode) |

All events bubble and are composed. CSS: `::part(toolbar|mic|camera|screen|chat|invite|devices|hangup)`. Needs `/icons/spritesheet.svg` served. Tooltips carry the shortcut hints (M, V, S); the global shortcuts are wired by the page.

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
