# @papchat/connection-status

Lobby connection status pill

![Logo](https://raw.githubusercontent.com/onkelhoy/papchat/refs/heads/main/asset/logo.svg)

---

![Type](https://img.shields.io/badge/Type-molecules-orange)
[![Tests](https://github.com/onkelhoy/papchat/actions/workflows/pull-request.yml/badge.svg)](https://github.com/onkelhoy/papchat/actions/workflows/pull-request.yml)
[![NPM version](https://img.shields.io/npm/v/@papchat/connection-status.svg?logo=npm)](https://www.npmjs.com/package/@papchat/connection-status)

---

## installation

```bash
npm install @papchat/connection-status
```

### to use in **html**

```html
<script type="module" defer>
  import "@papchat/connection-status";
</script>

<pc-connection-status status="connected"></pc-connection-status>
```

### properties

| Property | Type                                                                    | Default        | Description                                                                                                                                                                                                      |
| -------- | ----------------------------------------------------------------------- | -------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `status` | `"connecting" \| "waking" \| "connected" \| "reconnecting" \| "closed"` | `"connecting"` | Reflected. Dot (`pc-presence`) plus translated text; `waking` reads "Waking up the server… (can take up to a minute)". Host has `role="status"` and `aria-live="polite"`. Unknown values render as `connecting`. |

### events

None. Style with `--connection-status-background` / `--connection-status-color`; parts `dot`, `text`. The `ConnectionStatusValue` type is exported.

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
