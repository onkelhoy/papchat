# @papchat/onboarding

First-run who-are-you dialog

![Logo](https://raw.githubusercontent.com/onkelhoy/papchat/refs/heads/main/asset/logo.svg)

---

![Type](https://img.shields.io/badge/Type-organisms-orange)
[![Tests](https://github.com/onkelhoy/papchat/actions/workflows/pull-request.yml/badge.svg)](https://github.com/onkelhoy/papchat/actions/workflows/pull-request.yml)
[![NPM version](https://img.shields.io/npm/v/@papchat/onboarding.svg?logo=npm)](https://www.npmjs.com/package/@papchat/onboarding)

---

## installation

```bash
npm install @papchat/onboarding
```

### to use in **html**

```html
<script type="module" defer>
  import "@papchat/onboarding";
</script>

<pc-onboarding open></pc-onboarding>

<script>
  const onboarding = document.querySelector("pc-onboarding");
  onboarding.addEventListener("submit", (e) => {
    console.log(e.detail); // { name, color, language }
    onboarding.open = false; // the dialog can't be dismissed any other way
  });
</script>
```

Modal "Who are you?" dialog (`pap-dialog`, `pap-input`, `pap-radio`, `pap-button`, `pc-avatar`, `pc-language-picker`).
It cannot be dismissed (close button, Escape) while `open` is set; the page closes it. The submit click is a user
gesture, so the page can unlock audio there. `name`, `color` and `language` are the live values of the form.
Components never import core: `colors` is a copy of `PALETTE` from `@papchat/core`; keep them in sync or pass it in.

## API

| Property   | Attribute  | Type       | Default                 | Description                                   |
| ---------- | ---------- | ---------- | ----------------------- | --------------------------------------------- |
| `open`     | `open`     | `boolean`  | `false`                 | shows the dialog (modal)                      |
| `name`     | `name`     | `string`   | `""`                    | name field; 1 to 32 characters after trimming |
| `color`    | `color`    | `string`   | first of `colors`       | chosen swatch, drives the avatar preview      |
| `language` | `language` | `string`   | `"en"`                  | language code shown in the picker             |
| `colors`   | -          | `string[]` | the 8 `PALETTE` colours | swatches (CSS colours)                        |
| `joining`  | -          | `{ name, password } \| null` | `null`  | private network from a share link: shown as "You're joining …" and submitted; null joins the public one |

| Event             | Detail                      | Description                                                       |
| ----------------- | --------------------------- | ----------------------------------------------------------------- |
| `submit`          | `{ name, color, language, network }` | valid form submitted (button or Enter); bubbles, composed         |
| `language-change` | `{ value }`                 | picker changed, so the page can translate live; bubbles, composed |

CSS: `::part(dialog)`. Keys in `asset/translations/en.json` under `pc-onboarding`.

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
