# @papchat/language-picker

Language menu with flags

![Logo](https://github.com/onkelhoy/papchat/blob/main/asset/logo.svg)

---

![Type](https://img.shields.io/badge/Type-molecules-orange)
[![Tests](https://github.com/onkelhoy/papchat/actions/workflows/pull-request.yml/badge.svg)](https://github.com/onkelhoy/papchat/actions/workflows/pull-request.yml)
[![NPM version](https://img.shields.io/npm/v/@papchat/language-picker.svg?logo=npm)](https://www.npmjs.com/package/@papchat/language-picker)

---

## installation

```bash
npm install @papchat/language-picker
```

### to use in **html**

```html
<script type="module" defer>
  import "@papchat/language-picker";
</script>

<pc-language-picker value="en"></pc-language-picker>

<script>
  document.querySelector("pc-language-picker").addEventListener("change", (e) => {
    console.log(e.detail.value); // e.g. "sv"
  });
</script>
```

The picker only reports the choice; call `translator.change(value)` yourself.
Flag icons live in `asset/icons/flags/<code>.svg` and must be served at `/icons/flags/`.

## Properties

| Property    | Attribute | Type         | Default      | Description |
| ----------- | --------- | ------------ | ------------ | ----------- |
| `value`     | `value`   | `string`     | `"en"`       | Code of the current language |
| `languages` | -         | `Language[]` | en, sv       | `{ code, label, flag }[]`; `flag` is a `pap-icon` name, e.g. `/icons/flags/sv.svg` |

## Events

| Event    | Detail              | Description |
| -------- | ------------------- | ----------- |
| `change` | `{ value: string }` | Another language was chosen (bubbles, composed) |

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
