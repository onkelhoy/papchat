# @papchat/theme

papchat brand tokens and icons on top of @papit/theme

![Logo](https://github.com/onkelhoy/papchat/blob/main/asset/logo.svg)

---

![Type](https://img.shields.io/badge/Type-foundations-orange)
[![Tests](https://github.com/onkelhoy/papchat/actions/workflows/pull-request.yml/badge.svg)](https://github.com/onkelhoy/papchat/actions/workflows/pull-request.yml)
[![NPM version](https://img.shields.io/npm/v/@papchat/theme.svg?logo=npm)](https://www.npmjs.com/package/@papchat/theme)

---

## installation

```bash
npm install @papchat/theme
```

## usage

```css
@import "@papchat/theme"; /* pulls in @papit/theme and applies the papchat brand */
```

Added tokens: `--primary-contrast`, `--pc-available`, `--pc-busy`, `--pc-away`, `--pc-dnd`, `--pc-offline`. `--primary`, `--secondary` and `--focus-color` are overridden.

Icons live in `asset/icons/svg/*.svg`. `npm run icons` merges them into `packages/pages/app/asset/icons/spritesheet.svg` (theme-type packages' assets aren't served or published, the page package's are):

```html
<pap-icon name="/icons/spritesheet.svg#mic" aria-hidden="true"></pap-icon>
```

Ids: mic, mic-off, camera, camera-off, screen, screen-off, phone, phone-off, user-plus, paperclip, send, settings, broadcast, download, x, users, chat, search, menu, play, stop, volume.

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
