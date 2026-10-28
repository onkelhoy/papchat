# @papchat/stage-card

Live broadcast entry with watch button

![Logo](https://raw.githubusercontent.com/onkelhoy/papchat/refs/heads/main/asset/logo.svg)

---

![Type](https://img.shields.io/badge/Type-molecules-orange)
[![Tests](https://github.com/onkelhoy/papchat/actions/workflows/pull-request.yml/badge.svg)](https://github.com/onkelhoy/papchat/actions/workflows/pull-request.yml)
[![NPM version](https://img.shields.io/npm/v/@papchat/stage-card.svg?logo=npm)](https://www.npmjs.com/package/@papchat/stage-card)

---

## installation

```bash
npm install @papchat/stage-card
```

### to use in **html**

```html
<script type="module" defer>
  import "@papchat/stage-card";
</script>

<pc-stage-card></pc-stage-card>
```

## API

### Properties

| Property | Type           | Default     | Description                                                              |
| -------- | -------------- | ----------- | ------------------------------------------------------------------------ |
| `stage`  | `StageSummary` | `undefined` | `id`, `title`, `presenter` (Profile), `viewers`, `mine`; property or JSON attribute |

### Events

| Event   | Detail         | Description                                                        |
| ------- | -------------- | ------------------------------------------------------------------ |
| `watch` | `{ id: string }` | Watch pressed (bubbles, composed); never fired when `stage.mine` |

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
