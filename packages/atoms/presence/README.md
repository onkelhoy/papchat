# @papchat/presence

Presence status dot

![Logo](https://github.com/onkelhoy/papchat/blob/main/asset/logo.svg)

---

![Type](https://img.shields.io/badge/Type-atoms-orange)
[![Tests](https://github.com/onkelhoy/papchat/actions/workflows/pull-request.yml/badge.svg)](https://github.com/onkelhoy/papchat/actions/workflows/pull-request.yml)
[![NPM version](https://img.shields.io/npm/v/@papchat/presence.svg?logo=npm)](https://www.npmjs.com/package/@papchat/presence)

---

## installation

```bash
npm install @papchat/presence
```

### to use in **html**

```html
<script type="module" defer>
  import "@papchat/presence";
</script>

<pc-presence></pc-presence>
```

### properties

| Property | Type | Default | Description |
| --- | --- | --- | --- |
| `status` | `"available" \| "busy" \| "away" \| "dnd" \| "offline"` | `"offline"` | Reflected. Dot colour from `--pc-<status>`; `dnd` has a bar, `away` and `offline` are hollow rings. `aria-label` is the translated status. |

### events

None. Use it in the `badge` slot of `pc-avatar`: `<pc-presence slot="badge" status="available"></pc-presence>`.

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
