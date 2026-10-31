# @papchat/qr-scanner

Reads QR codes with the camera

![Logo](https://raw.githubusercontent.com/onkelhoy/papchat/refs/heads/main/asset/logo.svg)

---

![Type](https://img.shields.io/badge/Type-molecules-orange)
[![Tests](https://github.com/onkelhoy/papchat/actions/workflows/pull-request.yml/badge.svg)](https://github.com/onkelhoy/papchat/actions/workflows/pull-request.yml)
[![NPM version](https://img.shields.io/npm/v/@papchat/qr-scanner.svg?logo=npm)](https://www.npmjs.com/package/@papchat/qr-scanner)

---

## installation

```bash
npm install @papchat/qr-scanner
```

### to use in **html**

```html
<script type="module" defer>
  import "@papchat/qr-scanner";
</script>

<pc-qr-scanner></pc-qr-scanner>
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
| `active` | `boolean` | `false` | The camera is on. Reflected. Cleared or removed from the page, the camera is released. |

### Events

| Name | Detail | Description |
| --- | --- | --- |
| `scan` | `{ text }` | A code was read. It stops looking until `active` is set again. |
| `camera-error` | `{ reason: "denied" \| "missing" \| "failed" }` | The camera can't be used. |
