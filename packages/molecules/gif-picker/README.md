# @papchat/gif-picker

GIF grid for GIPHY results

![Logo](https://raw.githubusercontent.com/onkelhoy/papchat/refs/heads/main/asset/logo.svg)

---

![Type](https://img.shields.io/badge/Type-molecules-orange)
[![Tests](https://github.com/onkelhoy/papchat/actions/workflows/pull-request.yml/badge.svg)](https://github.com/onkelhoy/papchat/actions/workflows/pull-request.yml)
[![NPM version](https://img.shields.io/npm/v/@papchat/gif-picker.svg?logo=npm)](https://www.npmjs.com/package/@papchat/gif-picker)

---

## installation

```bash
npm install @papchat/gif-picker
```

### to use in **html**

```html
<script type="module" defer>
  import "@papchat/gif-picker";
</script>

<pc-gif-picker></pc-gif-picker>
```

The picker never fetches: the host searches GIPHY (or anything else) and sets `gifs`.
`pc-composer` uses it for its GIFs tab.

## API

### Properties

| Property  | Attribute | Type      | Default | Description                                                      |
| --------- | --------- | --------- | ------- | ---------------------------------------------------------------- |
| `gifs`    | -         | `Gif[]`   | `[]`    | `{ id, url, width, height, title }[]` to show (property only)    |
| `loading` | `loading` | `boolean` | `false` | A search is running; shows "Loading GIFs…" while there are none  |
| `limit`   | `limit`   | `number`  | `0`     | 0 = scrolling two-column grid; > 0 = one row of that many        |

### Events

| Event      | Detail         | Description                              |
| ---------- | -------------- | ---------------------------------------- |
| `gif-pick` | `{ gif: Gif }` | A GIF was chosen (bubbles, composed)     |

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
