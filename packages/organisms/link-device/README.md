# @papchat/link-device

Dialog that links another device to your profile

![Logo](https://raw.githubusercontent.com/onkelhoy/papchat/refs/heads/main/asset/logo.svg)

---

![Type](https://img.shields.io/badge/Type-organisms-orange)
[![Tests](https://github.com/onkelhoy/papchat/actions/workflows/pull-request.yml/badge.svg)](https://github.com/onkelhoy/papchat/actions/workflows/pull-request.yml)
[![NPM version](https://img.shields.io/npm/v/@papchat/link-device.svg?logo=npm)](https://www.npmjs.com/package/@papchat/link-device)

---

## installation

```bash
npm install @papchat/link-device
```

### to use in **html**

```html
<script type="module" defer>
  import "@papchat/link-device";
</script>

<pc-link-device></pc-link-device>
```

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

## API

### Properties

| Name | Type | Default | Description |
| --- | --- | --- | --- |
| `open` | `boolean` | `false` | Whether the dialog is shown. Reflected. |
| `state` | `LinkState \| null` | `null` | Core's `linking` signal. Property only. |
| `notice` | `"" \| "invalid" \| "expired"` | `""` | Why the last link wasn't taken. Property only. |

### Events

| Name | Detail | Description |
| --- | --- | --- |
| `retry` | | Start over after a failure. |
| `link-text` | `{ text }` | A link was scanned or pasted. |
| `accept` | | This device agrees the codes match. |
| `close` | | Dismissed or declined. |
