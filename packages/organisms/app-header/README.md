# @papchat/app-header

App header with status, language, theme and settings

![Logo](https://github.com/onkelhoy/papchat/blob/main/asset/logo.svg)

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

| Property | Attribute | Type | Default | Description |
| --- | --- | --- | --- | --- |
| `me` | - | `Profile \| null` | - | signed-in profile; without it the avatar and status menu are hidden |
| `status` | `status` | `LobbyStatus` | `connecting` | lobby connection state, `idle` is shown as `connecting` |
| `language` | `language` | `string` | `en` | language code shown in the language picker |
| `live` | `live` | `boolean` | `false` | you are presenting: the button reads "You are live" and is disabled (reflected) |

| Event | Detail | Description |
| --- | --- | --- |
| `status-change` | `{ status: "available" \| "busy" \| "away" \| "dnd" }` | a presence status was chosen (not fired for the current one) |
| `language-change` | `{ value: string }` | a language was chosen |
| `open-settings` | - | settings button clicked |
| `go-live` | - | "Go live" button clicked |

None of the events bubble. The header composes `pc-avatar`, `pc-presence`, `pc-connection-status`, `pc-language-picker` and `pap-theme-picker storage="local"`. The page must serve `/icons/spritesheet.svg` (`broadcast`, `settings`), the flag svgs under `/icons/flags/` and the theme-picker's `/icons/sun.svg|moon.svg|computer.svg`. `::part(bar)` styles the row.

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
