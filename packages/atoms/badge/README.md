# @papchat/badge

Unread count or short label badge

![Logo](https://raw.githubusercontent.com/onkelhoy/papchat/refs/heads/main/asset/logo.svg)

---

![Type](https://img.shields.io/badge/Type-atoms-orange)
[![Tests](https://github.com/onkelhoy/papchat/actions/workflows/pull-request.yml/badge.svg)](https://github.com/onkelhoy/papchat/actions/workflows/pull-request.yml)
[![NPM version](https://img.shields.io/npm/v/@papchat/badge.svg?logo=npm)](https://www.npmjs.com/package/@papchat/badge)

---

## installation

```bash
npm install @papchat/badge
```

### to use in **html**

```html
<script type="module" defer>
  import "@papchat/badge";
</script>

<pc-badge variant="primary" count="3"></pc-badge>
<pc-badge variant="live">Live</pc-badge>
```

## properties

| Property  | Type                                          | Default     | Description                                                                               |
| --------- | --------------------------------------------- | ----------- | ----------------------------------------------------------------------------------------- |
| `count`   | `number`                                      |             | Unread count. `0` hides the badge, above `99` shows `99+`. When set, the slot is ignored. |
| `variant` | `"neutral" \| "primary" \| "live" \| "error"` | `"neutral"` | Colour variant (reflected). `live` adds a pulsing dot.                                    |

Slot: default, a short text label ("Live", "Host", "You") shown when `count` is not set.
CSS part: `dot` (the `live` dot). CSS variables: `--badge-background`, `--badge-color`.

## events

None. The badge is display only.

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
