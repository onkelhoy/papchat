# @papchat/app-shell

App layout: header, sidebar, main, overlay and toasts

![Logo](https://github.com/onkelhoy/papchat/blob/main/asset/logo.svg)

---

![Type](https://img.shields.io/badge/Type-templates-orange)
[![Tests](https://github.com/onkelhoy/papchat/actions/workflows/pull-request.yml/badge.svg)](https://github.com/onkelhoy/papchat/actions/workflows/pull-request.yml)
[![NPM version](https://img.shields.io/npm/v/@papchat/app-shell.svg?logo=npm)](https://www.npmjs.com/package/@papchat/app-shell)

---

## installation

```bash
npm install @papchat/app-shell
```

### to use in **html**

```html
<script type="module" defer>
  import "@papchat/app-shell";
</script>

<pc-app-shell></pc-app-shell>
```

## Properties

| Property      | Type      | Default | Description                                                              |
| ------------- | --------- | ------- | ------------------------------------------------------------------------ |
| `sidebaropen` | `boolean` | `false` | Sidebar (wide) or drawer (under 800 px) is open. Reflected, kept in sync with the sidebar's own toggle, Escape and backdrop click |

## Events

| Event            | Detail             | Description                                 |
| ---------------- | ------------------ | ------------------------------------------- |
| `sidebar-toggle` | `{ open: boolean }` | `sidebaropen` changed. Does not bubble      |

## Slots

| Slot      | Description                                                              |
| --------- | ------------------------------------------------------------------------ |
| `header`  | Top bar; on mobile a menu button sits in front of it                     |
| `sidebar` | Inside `pap-sidebar` on wide screens, inside a modal `pap-drawer` under 800 px |
| `main`    | Fills the remaining area                                                 |
| `overlay` | Full-viewport layer above the page for incoming calls; only slotted content takes pointer events |
| `toasts`  | Layer above `overlay` for the toaster                                    |

The host is `100dvh` tall; `pap-sidebar` is collapsed (4rem) unless `sidebaropen` is set, so set it on wide screens when the sidebar holds the member list.

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
