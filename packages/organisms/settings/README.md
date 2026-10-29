# @papchat/settings

Settings dialog: profile, network, audio (mic, speaker, ringtone, dial tone), video (camera), appearance, notifications

![Logo](https://raw.githubusercontent.com/onkelhoy/papchat/refs/heads/main/asset/logo.svg)

---

![Type](https://img.shields.io/badge/Type-organisms-orange)
[![Tests](https://github.com/onkelhoy/papchat/actions/workflows/pull-request.yml/badge.svg)](https://github.com/onkelhoy/papchat/actions/workflows/pull-request.yml)
[![NPM version](https://img.shields.io/npm/v/@papchat/settings.svg?logo=npm)](https://www.npmjs.com/package/@papchat/settings)

---

## installation

```bash
npm install @papchat/settings
```

### to use in **html**

```html
<script type="module" defer>
  import "@papchat/settings";
</script>

<pc-settings></pc-settings>
```

## API

### Properties

| Property        | Type                  | Default | Description                                                          |
| --------------- | --------------------- | ------- | -------------------------------------------------------------------- |
| `open`          | `boolean`             | `false` | dialog is shown                                                      |
| `profile`       | `Profile`             | -       | own profile (property only)                                          |
| `prefs`         | `Prefs`               | -       | preferences (property only)                                          |
| `tones`         | `{ id, label }[]`     | `[]`    | ringtone choices (property only)                                     |
| `dialtones`     | `{ id, label }[]`     | `[]`    | dial tone choices: what a caller hears while it rings (property only) |
| `devices`       | `{ audioinput, videoinput, audiooutput }` | empty lists | `{ deviceId, label }[]` per kind (property only)  |
| `language`      | `string`              | `"en"`  | current language code                                                |
| `playing`       | `string`              | `""`    | ringtone id being previewed, set by the page                         |
| `camerastream`  | `MediaStream \| null` | `null`  | camera test stream (property only)                                   |
| `micstream`     | `MediaStream \| null` | `null`  | microphone test stream (property only)                               |
| `sinkSupported` | `boolean`             | `true`  | browser can pick an output device (property only)                    |
| `shortcuts`     | `Shortcut[]`          | `[]`    | `{ keys, label }` rows for the Shortcuts tab, hidden when empty (property only) |

### Events

| Event                   | Detail                        | Description                                                           |
| ----------------------- | ----------------------------- | --------------------------------------------------------------------- |
| `profile-change`        | `{ partial }`                 | `name`, `color` or `status` changed                                   |
| `prefs-change`          | `{ partial }`                 | ringtone, volume, `devices` (whole object) or `autoDeclineBusy`       |
| `language-change`       | `{ value }`                   | another language chosen                                               |
| `request-notifications` | none                          | switch turned on; the page asks permission and sets `prefs.notifications`. Turning it off emits `prefs-change` |
| `preview-device`        | `{ kind: "camera" \| "mic" }` | a test button was pressed; the page sets `camerastream` / `micstream` |
| `preview-dial`          | `{ id }`                      | play was pressed on a dial tone; the page plays it and sets `playing` |
| `preview`, `preview-stop` | `{ id }` / none             | pass through from the ringtone picker                                 |
| `close`                 | none                          | dismissed by the user; the page sets `open = false`                   |

All events bubble and are composed. Changes apply immediately; the page stores them and passes the new `profile` / `prefs` back. The theme picker applies and stores the theme itself.

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
