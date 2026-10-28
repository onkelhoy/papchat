# @papchat/avatar

Initials avatar with a presence slot

![Logo](https://github.com/onkelhoy/papchat/blob/main/asset/logo.svg)

---

![Type](https://img.shields.io/badge/Type-atoms-orange)
[![Tests](https://github.com/onkelhoy/papchat/actions/workflows/pull-request.yml/badge.svg)](https://github.com/onkelhoy/papchat/actions/workflows/pull-request.yml)
[![NPM version](https://img.shields.io/npm/v/@papchat/avatar.svg?logo=npm)](https://www.npmjs.com/package/@papchat/avatar)

---

## installation

```bash
npm install @papchat/avatar
```

### to use in **html**

```html
<script type="module" defer>
  import "@papchat/avatar";
</script>

<pc-avatar></pc-avatar>
```

## API

| Property | Attribute | Type | Default | Description |
| --- | --- | --- | --- | --- |
| `name` | `name` | `string` | - | display name; initials and accessible label |
| `color` | `color` | `string` | hue from `uid` | any CSS colour, dark enough for white text |
| `uid` | `uid` | `string` | - | stable id, seeds the fallback colour |
| `size` | `size` | `"s" \| "m" \| "l"` | `m` | reflected |

| Slot | Description |
| --- | --- |
| `badge` | bottom-right overlay, e.g. `pc-presence` |

No events. CSS: `--avatar-size`, `--avatar-size-s`, `--avatar-size-l`, `--avatar-text`, `::part(circle)`. Also exports `initials(name)` and `colorFor(seed)`.

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
