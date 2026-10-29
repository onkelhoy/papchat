# @papchat/room

Room view: call stage, controls and chat/files/people tabs

![Logo](https://raw.githubusercontent.com/onkelhoy/papchat/refs/heads/main/asset/logo.svg)

---

![Type](https://img.shields.io/badge/Type-organisms-orange)
[![Tests](https://github.com/onkelhoy/papchat/actions/workflows/pull-request.yml/badge.svg)](https://github.com/onkelhoy/papchat/actions/workflows/pull-request.yml)
[![NPM version](https://img.shields.io/npm/v/@papchat/room.svg?logo=npm)](https://www.npmjs.com/package/@papchat/room)

---

## installation

```bash
npm install @papchat/room
```

### to use in **html**

```html
<script type="module" defer>
  import "@papchat/room";
</script>

<pc-room></pc-room>
```

## API

### Properties

| Property       | Type                      | Default | Description                                                                    |
| -------------- | ------------------------- | ------- | ------------------------------------------------------------------------------ |
| `incall`       | `boolean`                 | `false` | in a call: stage, controls and Chat / Files / People tabs (reflected)          |
| `viewer`       | `boolean`                 | `false` | watching a stage: Leave and chat toggle only, chat hidden until toggled        |
| `heading`      | `string`                  | `""`    | room name in the header                                                        |
| `me`           | `string`                  | `""`    | own uid                                                                        |
| `messages`     | `ChatMessage[]`           | `[]`    | chat messages, oldest first (property only)                                    |
| `profiles`     | `Record<string, Profile>` | `{}`    | uid to profile (property only)                                                 |
| `files`        | `FileEntry[]`             | `[]`    | the room's files: Files tab and inline file messages (property only)           |
| `typing`       | `string[]`                | `[]`    | uids currently typing (property only)                                          |
| `participants` | `Profile[]`               | `[]`    | People tab (property only)                                                     |
| `tiles`        | `CallTile[]`              | `[]`    | call stage tiles (property only)                                               |
| `mic`          | `boolean`                 | `false` | microphone is on                                                               |
| `camera`       | `boolean`                 | `false` | camera is on                                                                   |
| `screen`       | `boolean`                 | `false` | you are sharing your screen                                                    |
| `canscreen`    | `boolean`                 | `true`  | browser can share a screen                                                     |
| `canbuzz`      | `boolean`                 | `false` | shows the Buzz button in the header (1:1 chats)                                |
| `sinkid`       | `string`                  | `""`    | output device id for remote audio                                              |

The Files tab lists a `pc-file-card` for every entry in `files` ("No files shared yet" when empty); the conversation shows the same files inline and is the drop zone.

### Events

| Event           | Detail                          | Description                                                     |
| --------------- | ------------------------------- | --------------------------------------------------------------- |
| `call`          | `{ kind: "call" \| "video" }`   | header buttons, only when not in a call                         |
| `buzz`          | -                               | header Buzz button (bubbles, composed)                          |
| `send`          | `{ text }`                      | from the conversation (bubbles, composed)                       |
| `typing`        | none                            | from the conversation                                           |
| `files`         | `{ files: File[] }`             | from the conversation                                           |
| `pin`           | `{ id, pinned }`                | from the call stage                                             |
| `toggle`        | `{ control }`                   | from the controls (`mic`, `camera`, `screen`, `chat`); the page sets `mic`/`camera`/`screen` back, the room flips `chat` itself for viewers |
| `invite`, `devices`, `hangup` | none              | from the controls                                               |
| `member-action` | `{ uid, action }`               | from the People tab                                             |

Child events are not re-dispatched: they already bubble and are composed.

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
