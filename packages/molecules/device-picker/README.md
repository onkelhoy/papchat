# @papchat/device-picker

Mic, camera or speaker picker

![Logo](https://github.com/onkelhoy/papchat/blob/main/asset/logo.svg)

---

![Type](https://img.shields.io/badge/Type-molecules-orange)
[![Tests](https://github.com/onkelhoy/papchat/actions/workflows/pull-request.yml/badge.svg)](https://github.com/onkelhoy/papchat/actions/workflows/pull-request.yml)
[![NPM version](https://img.shields.io/npm/v/@papchat/device-picker.svg?logo=npm)](https://www.npmjs.com/package/@papchat/device-picker)

---

## installation

```bash
npm install @papchat/device-picker
```

### to use in **html**

```html
<script type="module" defer>
  import "@papchat/device-picker";
</script>

<pc-device-picker kind="audioinput"></pc-device-picker>

<script>
  const picker = document.querySelector("pc-device-picker");
  picker.devices = [{ deviceId: "abc", label: "USB Headset" }]; // from enumerateDevices()
  picker.addEventListener("change", (e) => {
    console.log(e.detail.value); // deviceId, "" = default
  });
</script>
```

The component never calls `enumerateDevices` itself: the page passes the (filtered by `kind`) list in.
"Default" is always the first entry and means `value = ""`; a device with `deviceId: "default"` is dropped from the list. Devices with an empty label (before media permission) show as "Microphone 1", "Camera 2", ...

## API

### Properties

| Property    | Attribute | Type                                          | Default        | Description |
| ----------- | --------- | --------------------------------------------- | -------------- | ----------- |
| `kind`      | `kind`    | `"audioinput" \| "videoinput" \| "audiooutput"` | `"audioinput"` | Which kind of device this picks (sets the label) |
| `devices`   | -         | `{ deviceId: string; label: string }[]`       | `[]`           | Available devices, set as a property |
| `value`     | `value`   | `string`                                      | `""`           | Chosen `deviceId`, `""` = system default |
| `supported` | -         | `boolean`                                     | `true`         | Set to `false` when `setSinkId` is unsupported: an `audiooutput` picker is then hidden |

### Events

| Event    | Detail              | Description |
| -------- | ------------------- | ----------- |
| `change` | `{ value: string }` | Another device was chosen, `""` for Default (bubbles, composed) |

### CSS parts

`label`, `trigger`.

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
