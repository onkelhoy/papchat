# @papchat/level-meter

Audio level meter for a MediaStream

![Logo](https://raw.githubusercontent.com/onkelhoy/papchat/refs/heads/main/asset/logo.svg)

---

![Type](https://img.shields.io/badge/Type-atoms-orange)
[![Tests](https://github.com/onkelhoy/papchat/actions/workflows/pull-request.yml/badge.svg)](https://github.com/onkelhoy/papchat/actions/workflows/pull-request.yml)
[![NPM version](https://img.shields.io/npm/v/@papchat/level-meter.svg?logo=npm)](https://www.npmjs.com/package/@papchat/level-meter)

---

## installation

```bash
npm install @papchat/level-meter
```

### to use in **html**

```html
<script type="module" defer>
  import "@papchat/level-meter";
</script>

<pc-level-meter></pc-level-meter>
```

## API

| Property | Attribute | Type                  | Default | Description                                                                   |
| -------- | --------- | --------------------- | ------- | ----------------------------------------------------------------------------- |
| `stream` | -         | `MediaStream \| null` | -       | stream to measure, property only; a stream without audio shows an empty meter |
| `bars`   | `bars`    | `number`              | `5`     | number of bars (1 to 16)                                                      |

| Event      | Detail                  | Description                                                                                  |
| ---------- | ----------------------- | -------------------------------------------------------------------------------------------- |
| `speaking` | `{ speaking: boolean }` | the speaking state changed; turns off about 300 ms after the sound stops (bubbles, composed) |

One shared `AudioContext` per page and one `AnalyserNode` per meter. The loop pauses while the meter or tab is hidden, and the nodes are closed on disconnect or stream change. Decorative (`aria-hidden`). CSS: `--level-meter-height`, `--level-meter-bar-width`, `--level-meter-gap`, `--level-meter-color`, `--level-meter-off`, `::part(bar)`.

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
