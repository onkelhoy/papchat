# @papchat/file-card

Shared file with progress, download and preview

![Logo](https://github.com/onkelhoy/papchat/blob/main/asset/logo.svg)

---

![Type](https://img.shields.io/badge/Type-molecules-orange)
[![Tests](https://github.com/onkelhoy/papchat/actions/workflows/pull-request.yml/badge.svg)](https://github.com/onkelhoy/papchat/actions/workflows/pull-request.yml)
[![NPM version](https://img.shields.io/npm/v/@papchat/file-card.svg?logo=npm)](https://www.npmjs.com/package/@papchat/file-card)

---

## installation

```bash
npm install @papchat/file-card
```

### to use in **html**

```html
<script type="module" defer>
  import "@papchat/file-card";
</script>

<pc-file-card id="card"></pc-file-card>
<script type="module">
  card.file = { fid: "f1", name: "report.pdf", size: 4200000, type: "application/pdf", uid: "u1", at: Date.now(), state: "receiving", progress: 0.4 };
  card.addEventListener("cancel", (e) => console.log(e.detail.fid));
</script>
```

## API

| Property | Attribute | Type | Default | Description |
| --- | --- | --- | --- | --- |
| `file` | `file` | `FileEntry` (`FileInfo & TransferState`) | - | name, size, type, `state` (`sending\|receiving\|done\|cancelled\|failed`), `progress` (0-1), `url?`. Set as a property |
| `mine` | `mine` | `boolean` | `false` | reflected; right aligned on the primary colour |

| Event | Detail | Description |
| --- | --- | --- |
| `cancel` | `{ fid: string }` | Cancel clicked while `sending` or `receiving` (bubbles, composed) |

In flight: `pc-progress` (indeterminate when `progress` is not a number) and a Cancel button. When `done` with a `blob:` `url`: a Download link (`<a download>`) and a preview (`<img>`, `<video controls>` or `<audio controls>` by `type`). Other urls are ignored. The name is rendered as text with the full name in `title`. Sizes use `Intl.NumberFormat` units (decimal: 1 kB = 1000 B).

CSS: `--file-card-background`, `--file-card-color`, `--file-card-max-width`, `--file-card-preview-height`, `::part(card)`, `::part(preview)`. Also exports `formatSize(bytes, locale?)`. Needs `/icons/spritesheet.svg` (camera, play, volume, paperclip, download).

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
