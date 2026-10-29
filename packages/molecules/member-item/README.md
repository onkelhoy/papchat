# @papchat/member-item

Member row with avatar, presence and actions

![Logo](https://raw.githubusercontent.com/onkelhoy/papchat/refs/heads/main/asset/logo.svg)

---

![Type](https://img.shields.io/badge/Type-molecules-orange)
[![Tests](https://github.com/onkelhoy/papchat/actions/workflows/pull-request.yml/badge.svg)](https://github.com/onkelhoy/papchat/actions/workflows/pull-request.yml)
[![NPM version](https://img.shields.io/npm/v/@papchat/member-item.svg?logo=npm)](https://www.npmjs.com/package/@papchat/member-item)

---

## installation

```bash
npm install @papchat/member-item
```

### to use in **html**

```html
<script type="module" defer>
  import "@papchat/member-item";
</script>

<div role="list">
  <pc-member-item caninvite></pc-member-item>
</div>

<script type="module">
  const item = document.querySelector("pc-member-item");
  item.profile = {
    v: 1,
    uid: "u1",
    name: "Anna Berg",
    color: "",
    status: "available",
  };
  item.addEventListener("member-action", (e) => console.log(e.detail)); // { uid: "u1", action: "chat" }
</script>
```

The row is a focusable `listitem` (put it in a `role="list"`, e.g. a `pap-group` for arrow keys). Enter or click = `chat`; right-click, Shift+F10 or the Menu key opens the ⋯ menu. The ⋯ button is only in the tab order while its row has focus. Icons come from `/icons/spritesheet.svg` (served by the app page).

## API

| Property    | Attribute   | Type                        | Default | Description                                              |
| ----------- | ----------- | --------------------------- | ------- | -------------------------------------------------------- |
| `profile`   | -           | `Profile` (`@papchat/core`) | -       | the member: `uid`, `name`, `color`, `status`             |
| `self`      | `self`      | `boolean`                   | `false` | this is you: "You" badge, no menu, no events (reflected) |
| `incall`    | `incall`    | `boolean`                   | `false` | small phone icon (reflected)                             |
| `canInvite` | `caninvite` | `boolean`                   | `false` | adds "Invite to current room" to the menu                |
| `compact`   | `compact`   | `boolean`                   | `false` | avatar only (collapsed sidebar); name and status in a tooltip, menu on right-click (reflected) |

| Event           | Detail                                                             | Description                                                                            |
| --------------- | ------------------------------------------------------------------ | -------------------------------------------------------------------------------------- |
| `member-action` | `{ uid: string, action: "chat" \| "call" \| "video" \| "invite" }` | a menu choice, or `chat` on Enter / click (bubbles, composed; never for `self`) |

| `member-files`  | `{ uid: string, files: File[] }`                                   | files dropped on the row (bubbles, composed; never for `self`)                         |

Files dragged over a row highlight it. CSS: `::part(avatar|name|status|trigger)`, `:state(menu-open)`, `:state(drop)`, `--member-item-ring` (ring around the presence dot, default `--background`). Translations: `pc-member-item.*` in `asset/translations/en.json`.

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
