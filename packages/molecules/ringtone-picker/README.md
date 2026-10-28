# @papchat/ringtone-picker

Ringtone list with preview and volume

![Logo](https://raw.githubusercontent.com/onkelhoy/papchat/refs/heads/main/asset/logo.svg)

---

![Type](https://img.shields.io/badge/Type-molecules-orange)
[![Tests](https://github.com/onkelhoy/papchat/actions/workflows/pull-request.yml/badge.svg)](https://github.com/onkelhoy/papchat/actions/workflows/pull-request.yml)
[![NPM version](https://img.shields.io/npm/v/@papchat/ringtone-picker.svg?logo=npm)](https://www.npmjs.com/package/@papchat/ringtone-picker)

---

## installation

```bash
npm install @papchat/ringtone-picker
```

### to use in **html**

```html
<script type="module" defer>
  import "@papchat/ringtone-picker";
</script>

<pc-ringtone-picker></pc-ringtone-picker>
```

## API

Never plays audio itself: the page plays the sound on `preview` and sets `playing` so the button turns into a stop button. `tones` is an array, so set it as a property (`picker.tones = [...]`); a JSON attribute also works.

| Property  | Attribute | Type                              | Default | Description                                      |
| --------- | --------- | --------------------------------- | ------- | ------------------------------------------------ |
| `tones`   | `tones`   | `{ id: string, label: string }[]` | `[]`    | the choices                                      |
| `value`   | `value`   | `string`                          | `""`    | id of the selected tone                          |
| `volume`  | `volume`  | `number`                          | `1`     | 0 to 1                                           |
| `playing` | `playing` | `string`                          | `""`    | id of the tone being previewed (set by the page) |

| Event          | Detail               | Description                                      |
| -------------- | -------------------- | ------------------------------------------------ |
| `change`       | `{ value: string }`  | another tone was selected                        |
| `volume`       | `{ volume: number }` | slider moved (fires continuously while dragging) |
| `preview`      | `{ id: string }`     | play pressed on a tone                           |
| `preview-stop` | -                    | stop pressed on the playing tone                 |

All events bubble and are composed. Parts: `list`, `volume`. Needs `/icons/spritesheet.svg` (icons `play`, `stop`).

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
