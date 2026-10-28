# @papchat/invite-picker

Dialog to invite members to a room

![Logo](https://raw.githubusercontent.com/onkelhoy/papchat/refs/heads/main/asset/logo.svg)

---

![Type](https://img.shields.io/badge/Type-organisms-orange)
[![Tests](https://github.com/onkelhoy/papchat/actions/workflows/pull-request.yml/badge.svg)](https://github.com/onkelhoy/papchat/actions/workflows/pull-request.yml)
[![NPM version](https://img.shields.io/npm/v/@papchat/invite-picker.svg?logo=npm)](https://www.npmjs.com/package/@papchat/invite-picker)

---

## installation

```bash
npm install @papchat/invite-picker
```

### to use in **html**

```html
<script type="module" defer>
  import "@papchat/invite-picker";
</script>

<pc-invite-picker></pc-invite-picker>
```

## API

| Property  | Attribute | Type        | Default | Description                                                                          |
| --------- | --------- | ----------- | ------- | ------------------------------------------------------------------------------------ |
| `open`    | `open`    | `boolean`   | `false` | whether the dialog is shown; reset (selection, search) on every change               |
| `members` | -         | `Profile[]` | `[]`    | people who can be invited (already filtered to those not in the room); property only |

| Event    | Detail               | Description                                                                                       |
| -------- | -------------------- | ------------------------------------------------------------------------------------------------- |
| `invite` | `{ uids: string[] }` | invite button pressed (at least one picked); the page sends the invites and sets `open = false`   |
| `close`  | -                    | dismissed by the user (Cancel, X, Escape, backdrop); the component has already set `open = false` |

Both bubble and are composed. CSS: `::part(dialog)`. Strings under `pc-invite-picker`.

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
