# @papchat/toaster

Toast stack

![Logo](https://raw.githubusercontent.com/onkelhoy/papchat/refs/heads/main/asset/logo.svg)

---

![Type](https://img.shields.io/badge/Type-organisms-orange)
[![Tests](https://github.com/onkelhoy/papchat/actions/workflows/pull-request.yml/badge.svg)](https://github.com/onkelhoy/papchat/actions/workflows/pull-request.yml)
[![NPM version](https://img.shields.io/npm/v/@papchat/toaster.svg?logo=npm)](https://www.npmjs.com/package/@papchat/toaster)

---

## installation

```bash
npm install @papchat/toaster
```

### to use in **html**

```html
<script type="module" defer>
  import "@papchat/toaster";
</script>

<pc-toaster></pc-toaster>
```

## API

| Property | Attribute | Type      | Default | Description                                                                                                                |
| -------- | --------- | --------- | ------- | -------------------------------------------------------------------------------------------------------------------------- |
| `toasts` | -         | `Toast[]` | `[]`    | `Toast` from `@papchat/core` (`id`, `kind`, `text`, `action?`, `duration?`). At most the newest 4 are shown, oldest on top |

| Event     | Detail           | Description                                                                                       |
| --------- | ---------------- | ------------------------------------------------------------------------------------------------- |
| `dismiss` | `{ id: string }` | a toast timed out or was closed; the page removes it from `toasts`                                |
| `action`  | `{ id: string }` | a toast's action button was pressed; the page runs that toast's `onAction` (the toaster does not) |

Fixed bottom-right (bottom-centre under 800 px) in a `role="status"` region labelled "Notifications". CSS: `--toaster-gap`, `--toaster-offset`, `--toaster-z`.

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
