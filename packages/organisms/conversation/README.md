# @papchat/conversation

Message list, typing indicator and composer

![Logo](https://github.com/onkelhoy/papchat/blob/main/asset/logo.svg)

---

![Type](https://img.shields.io/badge/Type-organisms-orange)
[![Tests](https://github.com/onkelhoy/papchat/actions/workflows/pull-request.yml/badge.svg)](https://github.com/onkelhoy/papchat/actions/workflows/pull-request.yml)
[![NPM version](https://img.shields.io/npm/v/@papchat/conversation.svg?logo=npm)](https://www.npmjs.com/package/@papchat/conversation)

---

## installation

```bash
npm install @papchat/conversation
```

### to use in **html**

```html
<script type="module" defer>
  import "@papchat/conversation";
</script>

<pc-conversation></pc-conversation>
```

## API

### Properties

| Property | Type | Default | Description |
| --- | --- | --- | --- |
| `messages` | `ChatMessage[]` | `[]` | messages, oldest first (property only) |
| `profiles` | `Record<string, Profile>` | `{}` | uid to profile (property only) |
| `me` | `string` | `""` | own uid; own messages align right |
| `typing` | `string[]` | `[]` | uids currently typing (own uid is ignored) |
| `heading` | `string` | `""` | optional header text |

### Events

| Event | Detail | Description |
| --- | --- | --- |
| `send` | `{ text: string }` | re-dispatched from `pc-composer` (bubbles, composed) |
| `typing` | none | re-dispatched from `pc-composer` (bubbles, composed) |
| `files` | `{ files: File[] }` | re-dispatched from `pc-composer` (bubbles, composed) |

Messages are grouped here: same `uid` as the previous message, at most 2 minutes apart, neither a system message. The list sticks to the bottom; if the user scrolled up a "New messages" button appears instead (own messages always scroll). Typing line: "Anna is typing…", "Anna and Bob are typing…", "Several people are typing…". `file` messages render as text for now (`pc-file-card` and the drop zone come in T4.4). Needs `/icons/spritesheet.svg` (composer icons). Strings: `pc-conversation.*`. CSS parts: `header`, `list`, `composer`.

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
