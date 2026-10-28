# @papchat/progress

Determinate progress bar

![Logo](https://github.com/onkelhoy/papchat/blob/main/asset/logo.svg)

---

![Type](https://img.shields.io/badge/Type-atoms-orange)
[![Tests](https://github.com/onkelhoy/papchat/actions/workflows/pull-request.yml/badge.svg)](https://github.com/onkelhoy/papchat/actions/workflows/pull-request.yml)
[![NPM version](https://img.shields.io/npm/v/@papchat/progress.svg?logo=npm)](https://www.npmjs.com/package/@papchat/progress)

---

## installation

```bash
npm install @papchat/progress
```

### to use in **html**

```html
<script type="module" defer>
  import "@papchat/progress";
</script>

<pc-progress value="0.4" label="report.pdf"></pc-progress>
<pc-progress></pc-progress> <!-- indeterminate -->
```

## properties

| Property | Type     | Default | Description                                                                                   |
| -------- | -------- | ------- | --------------------------------------------------------------------------------------------- |
| `value`  | `number` |         | Progress from `0` to `1` (clamped). Unset or `NaN` makes the bar indeterminate.                |
| `label`  | `string` |         | Accessible name (`aria-label`). Falls back to a translated "Progress" (`pc-progress.label`).   |

The host has `role="progressbar"`, `aria-valuemin="0"`, `aria-valuemax="100"` and `aria-valuenow` (0 to 100, omitted while indeterminate). It also gets the `indeterminate` attribute.
CSS parts: `track`, `bar`. CSS variables: `--progress-height`, `--progress-background`, `--progress-color`.

## events

None. The progress bar is display only.

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
