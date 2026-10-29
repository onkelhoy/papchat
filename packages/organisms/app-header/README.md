# @papchat/app-header

App header with status, theme and settings

![Logo](https://raw.githubusercontent.com/onkelhoy/papchat/refs/heads/main/asset/logo.svg)

---

![Type](https://img.shields.io/badge/Type-organisms-orange)
[![Tests](https://github.com/onkelhoy/papchat/actions/workflows/pull-request.yml/badge.svg)](https://github.com/onkelhoy/papchat/actions/workflows/pull-request.yml)
[![NPM version](https://img.shields.io/npm/v/@papchat/app-header.svg?logo=npm)](https://www.npmjs.com/package/@papchat/app-header)

---

## installation

```bash
npm install @papchat/app-header
```

### to use in **html**

```html
<script type="module" defer>
  import "@papchat/app-header";
</script>

<pc-app-header></pc-app-header>
```

## API

| Property   | Attribute  | Type              | Default      | Description                                                                     |
| ---------- | ---------- | ----------------- | ------------ | ------------------------------------------------------------------------------- |
| `me`       | -          | `Profile \| null` | -            | signed-in profile; without it the avatar and status menu are hidden             |
| `status`   | `status`   | `LobbyStatus`     | `connecting` | lobby connection state, `idle` is shown as `connecting`                         |
| `live`     | `live`     | `boolean`         | `false`      | you are presenting: the button reads "End broadcast" and fires `end-live` (reflected) |

| Event             | Detail                                                 | Description                                                  |
| ----------------- | ------------------------------------------------------ | ------------------------------------------------------------ |
| `status-change`   | `{ status: "available" \| "busy" \| "away" \| "dnd" }` | a presence status was chosen (not fired for the current one) |
| `open-settings`   | -                                                      | settings button clicked                                      |
| `go-live`         | `{ title: string }`                                    | "Go live" opens a dialog asking for a title; confirming fires this with the trimmed, non-empty title |
| `end-live`        | -                                                      | "End broadcast" clicked (only while `live`)                  |

None of the events bubble. The header composes `pc-avatar`, `pc-presence`, `pc-connection-status` and a hidden `pap-theme-picker storage="local"` (it applies and remembers the theme). The theme button opens a Light / Dark / System menu; its icon is the theme in effect (System on a light system shows the sun) while the menu keeps System ticked. Language lives in the settings dialog. The page must serve `/icons/spritesheet.svg` (`broadcast`, `settings`) and `/icons/sun.svg|moon.svg|computer.svg`. `::part(bar)` styles the row.

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
