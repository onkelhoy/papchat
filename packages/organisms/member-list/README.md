# @papchat/member-list

Searchable list of online members

![Logo](https://raw.githubusercontent.com/onkelhoy/papchat/refs/heads/main/asset/logo.svg)

---

![Type](https://img.shields.io/badge/Type-organisms-orange)
[![Tests](https://github.com/onkelhoy/papchat/actions/workflows/pull-request.yml/badge.svg)](https://github.com/onkelhoy/papchat/actions/workflows/pull-request.yml)
[![NPM version](https://img.shields.io/npm/v/@papchat/member-list.svg?logo=npm)](https://www.npmjs.com/package/@papchat/member-list)

---

## installation

```bash
npm install @papchat/member-list
```

### to use in **html**

```html
<script type="module" defer>
  import "@papchat/member-list";
</script>

<pc-member-list caninvite></pc-member-list>

<script type="module">
  const list = document.querySelector("pc-member-list");
  list.me = { v: 1, uid: "u0", name: "Henry", color: "", status: "available" };
  list.members = [{ v: 1, uid: "u1", name: "Anna Berg", color: "", status: "busy" }];
  list.incall = ["u1"];
  list.addEventListener("member-action", (e) => console.log(e.detail)); // { uid: "u1", action: "chat" }
</script>
```

A search box filters by name (client side). `me` is listed first as a `self` row, the others are sorted available → busy → away → dnd, then by name. Rows are in a `pap-group`: Tab enters the list once, the arrow keys move between rows. Icons come from `/icons/spritesheet.svg` (served by the app page).

## API

| Property    | Attribute   | Type                        | Default | Description                                         |
| ----------- | ----------- | --------------------------- | ------- | --------------------------------------------------- |
| `members`   | -           | `Profile[]` (`@papchat/core`) | `[]`  | everyone else online (an entry with `me`'s uid is ignored) |
| `me`        | -           | `Profile`                   | -       | you; shown first with a "You" badge, counted in the heading |
| `incall`    | -           | `string[]`                  | `[]`    | uids shown with the in-call phone icon              |
| `canInvite` | `caninvite` | `boolean`                   | `false` | adds "Invite to current room" to each row menu      |

| Event           | Detail                                                             | Description                                                              |
| --------------- | ------------------------------------------------------------------ | ------------------------------------------------------------------------ |
| `member-action` | `{ uid: string, action: "chat" \| "call" \| "video" \| "invite" }` | from a row (bubbles, composed; `pc-member-item` dispatches it, nothing re-dispatches) |

| Slot   | Description                                                   |
| ------ | ------------------------------------------------------------- |
| `live` | above the heading; for the "Live now" stage cards (T5.3)      |

CSS: `::part(search|list|empty)`. Translations: `pc-member-list.*` in `asset/translations/en.json`.

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
