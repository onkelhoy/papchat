# @papchat/qr-code

SVG QR code generated in the browser

![Logo](https://raw.githubusercontent.com/onkelhoy/papchat/refs/heads/main/asset/logo.svg)

---

![Type](https://img.shields.io/badge/Type-molecules-orange)
[![Tests](https://github.com/onkelhoy/papchat/actions/workflows/pull-request.yml/badge.svg)](https://github.com/onkelhoy/papchat/actions/workflows/pull-request.yml)
[![NPM version](https://img.shields.io/npm/v/@papchat/qr-code.svg?logo=npm)](https://www.npmjs.com/package/@papchat/qr-code)

---

## installation

```bash
npm install @papchat/qr-code
```

### to use in **html**

```html
<script type="module" defer>
  import "@papchat/qr-code";
</script>

<pc-qr-code></pc-qr-code>
```

## API

### Properties

| Property | Type     | Default | Description                     |
| -------- | -------- | ------- | ------------------------------- |
| `value`  | `string` | `""`    | the text to encode              |
| `label`  | `string` | `""`    | what the code is, for screen readers |

Byte mode, error correction level M, versions 1-40, so up to 2331 bytes. More than that shows a message instead of a code.

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
