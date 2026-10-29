# @papchat/emoji-picker

Native emoji picker: categories, search, recently used

![Logo](https://raw.githubusercontent.com/onkelhoy/papchat/refs/heads/main/asset/logo.svg)

---

![Type](https://img.shields.io/badge/Type-molecules-orange)
[![Tests](https://github.com/onkelhoy/papchat/actions/workflows/pull-request.yml/badge.svg)](https://github.com/onkelhoy/papchat/actions/workflows/pull-request.yml)
[![NPM version](https://img.shields.io/npm/v/@papchat/emoji-picker.svg?logo=npm)](https://www.npmjs.com/package/@papchat/emoji-picker)

---

## installation

```bash
npm install @papchat/emoji-picker
```

### to use in **html**

```html
<script type="module" defer>
  import "@papchat/emoji-picker";
</script>

<pc-emoji-picker></pc-emoji-picker>

<script>
  document
    .querySelector("pc-emoji-picker")
    .addEventListener("emoji-pick", (e) => {
      console.log(e.detail.emoji, e.detail.name); // "😀", "grinning face"
    });
</script>
```

Native Unicode emoji only (no images), grouped by category, searchable by name and keywords. The data
(`asset/emoji/emoji.json`, ~150 kB / ~47 kB gzipped: names from [unicode-emoji-json](https://github.com/muan/unicode-emoji-json),
keywords from [emojilib](https://github.com/muan/emojilib), both MIT)
is fetched the first time a picker connects and must be served at `/emoji/emoji.json` (or set `src`).
Emoji newer than Emoji 15.1 are left out, since older phones show them as boxes. Rebuild the data with
`npm run emoji` after bumping `unicode-emoji-json`.

The picker only reports the pick: inserting it and keeping the recent list is the host's job
(`pc-composer` does both). `loadEmoji(src?)` and `searchEmoji(data, query, limit?)` are exported
for autocomplete.

Keyboard: the grid is one tab stop; arrow keys move, Home/End jump to the ends, Enter/Space picks.

## API

### Properties

| Property | Attribute | Type       | Default              | Description                                                                 |
| -------- | --------- | ---------- | -------------------- | --------------------------------------------------------------------------- |
| `query`  | `query`   | `string`   | `""`                 | Filter by name ("smi", "thumbs up"); empty shows the categories             |
| `recent` | -         | `string[]` | `[]`                 | Recently used emoji, newest first, shown as their own group (property only) |
| `limit`  | `limit`   | `number`   | `0`                  | 0 = everything with the category bar; > 0 = one flat row (recent first)    |
| `src`    | `src`     | `string`   | `/emoji/emoji.json`  | Where the data is fetched from                                              |
| `nosearch` | `nosearch` | `boolean` | `false`            | Hide the built-in search field (the host has its own and sets `query`)     |

### Events

| Event        | Detail                            | Description                                 |
| ------------ | --------------------------------- | ------------------------------------------- |
| `emoji-pick` | `{ emoji: string; name: string }` | An emoji was chosen (bubbles, composed)     |

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
