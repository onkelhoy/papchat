# @papchat/room-list

Open rooms and stages with unread badges

![Logo](https://github.com/onkelhoy/papchat/blob/main/asset/logo.svg)

---

![Type](https://img.shields.io/badge/Type-organisms-orange)
[![Tests](https://github.com/onkelhoy/papchat/actions/workflows/pull-request.yml/badge.svg)](https://github.com/onkelhoy/papchat/actions/workflows/pull-request.yml)
[![NPM version](https://img.shields.io/npm/v/@papchat/room-list.svg?logo=npm)](https://www.npmjs.com/package/@papchat/room-list)

---

## installation

```bash
npm install @papchat/room-list
```

### to use in **html**

```html
<script type="module" defer>
  import "@papchat/room-list";
</script>

<pc-room-list></pc-room-list>
```

## API

| Property | Attribute | Type | Default | Description |
| --- | --- | --- | --- | --- |
| `rooms` | - | `RoomSummary[]` | `[]` | `{ id, kind, title, participants, unread, incall, live }` (type from `@papchat/core`); rendered in the given order |
| `active` | `active` | `string` | - | id of the open room; its row gets `aria-current="true"` |

| Event | Detail | Description |
| --- | --- | --- |
| `select` | `{ id: string }` | a row was chosen (bubbles, composed) |
| `leave` | `{ id: string }` | "Leave" chosen in a row menu (bubbles, composed) |

Rows show up to 3 stacked avatars, the title (fallback: participant names), a phone icon when `incall`, a `Live` badge when `live` and an unread badge when `unread > 0`. The component does not change `active` or `rooms` itself. Needs `/icons/spritesheet.svg` (phone icon) to be served. Strings: `pc-room-list.*` in `asset/translations/en.json`. CSS parts: `list`, `row`, `empty`.

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
