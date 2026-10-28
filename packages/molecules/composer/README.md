# @papchat/composer

Message composer with send and attach

![Logo](https://raw.githubusercontent.com/onkelhoy/papchat/refs/heads/main/asset/logo.svg)

---

![Type](https://img.shields.io/badge/Type-molecules-orange)
[![Tests](https://github.com/onkelhoy/papchat/actions/workflows/pull-request.yml/badge.svg)](https://github.com/onkelhoy/papchat/actions/workflows/pull-request.yml)
[![NPM version](https://img.shields.io/npm/v/@papchat/composer.svg?logo=npm)](https://www.npmjs.com/package/@papchat/composer)

---

## installation

```bash
npm install @papchat/composer
```

### to use in **html**

```html
<script type="module" defer>
  import "@papchat/composer";
</script>

<pc-composer></pc-composer>
```

## API

| Property      | Attribute     | Type      | Default                      | Description                                    |
| ------------- | ------------- | --------- | ---------------------------- | ---------------------------------------------- |
| `disabled`    | `disabled`    | `boolean` | `false`                      | disables the field and both buttons, reflected |
| `placeholder` | `placeholder` | `string`  | translated "Write a message" | placeholder and accessible label of the field  |

| Event    | Detail              | Description                                                                                              |
| -------- | ------------------- | -------------------------------------------------------------------------------------------------------- |
| `send`   | `{ text: string }`  | Enter or the send button; text is trimmed, the field is cleared. Nothing fires for empty/whitespace text |
| `typing` | -                   | at most once per second while the field has text                                                         |
| `files`  | `{ files: File[] }` | files chosen with the attach button (`pap-file-input`, multiple)                                         |

Enter sends, Shift+Enter inserts a newline. The field is a native `<textarea>` (`pap-input` is single-line) that grows up to 8rem. Methods: `focus()`. Parts: `field`, `send`, `attach`. Events bubble and are composed. Needs `/icons/spritesheet.svg` (paperclip, send) served by the page.

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
