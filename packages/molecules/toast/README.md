# @papchat/toast

Single toast notification

![Logo](https://raw.githubusercontent.com/onkelhoy/papchat/refs/heads/main/asset/logo.svg)

---

![Type](https://img.shields.io/badge/Type-molecules-orange)
[![Tests](https://github.com/onkelhoy/papchat/actions/workflows/pull-request.yml/badge.svg)](https://github.com/onkelhoy/papchat/actions/workflows/pull-request.yml)
[![NPM version](https://img.shields.io/npm/v/@papchat/toast.svg?logo=npm)](https://www.npmjs.com/package/@papchat/toast)

---

## installation

```bash
npm install @papchat/toast
```

### to use in **html**

```html
<script type="module" defer>
  import "@papchat/toast";
</script>

<pc-toast></pc-toast>
```

## API

| Property   | Attribute  | Type                                          | Default | Description                                                             |
| ---------- | ---------- | --------------------------------------------- | ------- | ----------------------------------------------------------------------- |
| `kind`     | `kind`     | `"info" \| "success" \| "warning" \| "error"` | `info`  | reflected; sets accent colour and glyph                                 |
| `text`     | `text`     | `string`                                      | -       | the message                                                             |
| `action`   | `action`   | `string`                                      | -       | label of an optional action button                                      |
| `duration` | `duration` | `number`                                      | `5000`  | ms until `dismiss` fires; `0` = sticky. Pauses while hovered or focused |

| Event     | Detail | Description                                                                                  |
| --------- | ------ | -------------------------------------------------------------------------------------------- |
| `dismiss` | -      | close button pressed or the timer ran out. Does not bubble; the toast does not remove itself |
| `action`  | -      | action button pressed. Does not bubble                                                       |

CSS: `--toast-background`, `--toast-max-width`, `--toast-glyph`, `::part(message|action|close)`.

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
