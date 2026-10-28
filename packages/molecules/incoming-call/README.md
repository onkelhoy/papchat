# @papchat/incoming-call

Incoming call card with accept and decline

![Logo](https://github.com/onkelhoy/papchat/blob/main/asset/logo.svg)

---

![Type](https://img.shields.io/badge/Type-molecules-orange)
[![Tests](https://github.com/onkelhoy/papchat/actions/workflows/pull-request.yml/badge.svg)](https://github.com/onkelhoy/papchat/actions/workflows/pull-request.yml)
[![NPM version](https://img.shields.io/npm/v/@papchat/incoming-call.svg?logo=npm)](https://www.npmjs.com/package/@papchat/incoming-call)

---

## installation

```bash
npm install @papchat/incoming-call
```

### to use in **html**

```html
<script type="module" defer>
  import "@papchat/incoming-call";
</script>

<pc-incoming-call></pc-incoming-call>
```

## API

| Property | Attribute | Type | Default | Description |
| --- | --- | --- | --- | --- |
| `call` | `call` | `IncomingCall` (`{ id, from: Profile, kind, title, at }`) | - | the call to show; set as a property, or as a JSON attribute |

`kind` picks the text: `call` "Anna is calling…", `video` "Anna is video calling…", `stage` "Anna invites you to watch Demo", `chat` "Anna invites you to Demo". "Accept with video" is only shown for `video`.

| Event | Detail | Description |
| --- | --- | --- |
| `accept` | `{ id: string, video: boolean }` | Accept (`video: false`) or Accept with video (`video: true`). Does not bubble |
| `decline` | `{ id: string }` | Decline pressed. Does not bubble |

The card never removes itself. It is an `alertdialog` and moves focus to Accept when it appears; the avatar ring pulses unless `prefers-reduced-motion`.

CSS: `--incoming-call-background`, `--incoming-call-max-width`, `::part(card|accept|accept-video|decline)`.

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
