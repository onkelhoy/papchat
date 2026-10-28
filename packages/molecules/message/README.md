# @papchat/message

Chat message bubble

![Logo](https://raw.githubusercontent.com/onkelhoy/papchat/refs/heads/main/asset/logo.svg)

---

![Type](https://img.shields.io/badge/Type-molecules-orange)
[![Tests](https://github.com/onkelhoy/papchat/actions/workflows/pull-request.yml/badge.svg)](https://github.com/onkelhoy/papchat/actions/workflows/pull-request.yml)
[![NPM version](https://img.shields.io/npm/v/@papchat/message.svg?logo=npm)](https://www.npmjs.com/package/@papchat/message)

---

## installation

```bash
npm install @papchat/message
```

### to use in **html**

```html
<script type="module" defer>
  import "@papchat/message";
</script>

<pc-message id="m"></pc-message>
```

```js
m.message = {
  id: "1",
  uid: "u1",
  at: Date.now(),
  variant: "text",
  text: "see https://papit.dev",
};
m.author = {
  v: 1,
  uid: "u1",
  name: "Anna Berg",
  color: "#4f46e5",
  status: "available",
};
```

Text is plain text: `http(s)` URLs become `<a target="_blank" rel="noopener noreferrer">`, newlines are preserved, nothing is parsed as HTML.

## API

| Property  | Attribute | Type                 | Default           | Description                                                               |
| --------- | --------- | -------------------- | ----------------- | ------------------------------------------------------------------------- |
| `message` | -         | `ChatMessage`        | -                 | the message (`text`, `at`, `uid`, `variant`); nothing renders without it  |
| `author`  | -         | `Profile`            | -                 | sender; avatar and name (avatar falls back to `message.uid`)              |
| `mine`    | `mine`    | `boolean`            | `false`           | own message: right aligned, primary colour, no avatar or name (reflected) |
| `grouped` | `grouped` | `boolean`            | `false`           | same author within 2 min: hides avatar, name and time (reflected)         |
| `variant` | `variant` | `"text" \| "system"` | `message.variant` | `system` is a centred muted line; `file` is shown as text (reflected)     |

No events. CSS: `--message-background`, `--message-color`, `--message-max-width`, `::part(bubble)`. Also exports `linkify(text)`. Computing `grouped` is the parent's job.

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
