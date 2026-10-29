# @papchat/network-picker

List of networks plus a join-or-create form

![Logo](https://raw.githubusercontent.com/onkelhoy/papchat/refs/heads/main/asset/logo.svg)

---

![Type](https://img.shields.io/badge/Type-molecules-orange)
[![Tests](https://github.com/onkelhoy/papchat/actions/workflows/pull-request.yml/badge.svg)](https://github.com/onkelhoy/papchat/actions/workflows/pull-request.yml)
[![NPM version](https://img.shields.io/npm/v/@papchat/network-picker.svg?logo=npm)](https://www.npmjs.com/package/@papchat/network-picker)

---

## installation

```bash
npm install @papchat/network-picker
```

### to use in **html**

```html
<script type="module" defer>
  import "@papchat/network-picker";
</script>

<pc-network-picker network=""></pc-network-picker>
```

The component never connects. It fires `network-change` and the page decides: Settings switches straight away, onboarding remembers the pick until it is submitted.

### properties

| Property | Type | Default | Description |
| --- | --- | --- | --- |
| `network` | `string` | `""` | Name of the network in use (or picked); `""` = the public papchat one. Marked "Current" in the list. |
| `networks` | `NetworkEntry[]` | `[]` | Property only. `{ name, members, locked }`, the public one has `name: ""`. |

### events

| Event | Detail | When |
| --- | --- | --- |
| `network-change` | `{ network: { name, password } \| null }` | Join on an open listed network, or the join-or-create form. `null` = public. A locked listed network fills the form's name and focuses the password instead. |
| `networks-refresh` | none | Refresh pressed; set a fresh `networks`. |

Both bubble and are composed. Parts: `list`, `form`.

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
