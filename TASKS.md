# papchat: tasks

The work list for building papchat. `PLAN.md` is the spec, this file is the order. Each task is self-contained: a fresh session reads this header, takes the next free task, does it, ticks it off.

---

## ▶ Resume here (refreshed 2026-10-29)

- **Done:** 64/75 tasks. Waves 0-6 are in except T6.9. Wave 7 (feedback from the first real use, 2026-10-29) is new and not started.
- **Next, in order:** Wave 7 phase A (bugs: T7.1-T7.8), then B (UI: T7.9-T7.12), then C (features: T7.13-T7.18). T6.9 final live pass comes after wave 7. T0.6 (go live) is the user's.
- **Not run in a browser:** the 50 MB transfer check (T4.1/T4.5) and the 3-tab flows; the user reviews live with `npm start`.
- **Agents:** Sonnet only, one or two at a time.
- **Open question for the user:** demo pages' `@import "@papit/theme"` 500s because `@papit/server` doesn't rewrite bare CSS imports (static does). Fix in papit server, or switch demos to `/node_modules/...` paths.

---

## How to work a task

1. **Pick** the first task marked `[ ]` whose `needs` are all `[x]`, and that matches your model (see Model below). Tasks in the same wave with no shared `needs` can run in parallel sessions.
2. **Claim** it: change `[ ]` to `[~]` before you start, so parallel sessions skip it.
3. **Read** what the task lists under `read`, plus the `PLAN.md` sections it cites. Don't read the whole repo.
4. **Do** it. Touch only the files the task names (plus `TASKS.md`). If you need a change outside them, write it under *Notes* at the bottom of this file and stop. Don't fix it yourself.
5. **Check** the *done when* list. `npm run build` from the root must pass for every task.
6. **Tick** `[~]` → `[x]`, add one line under the task if anything is worth knowing (e.g. "event renamed to X"), and commit only your files plus `TASKS.md`: `add: [pc-avatar] avatar atom` (`feat:`/`fix:` as fitting).

**Model** (suggested; the user's instruction wins: subagents run on Sonnet unless the user says otherwise):
- `opus` networking, core logic, the first component of a layer (the pattern others copy), page wiring.
- `sonnet` components that follow an existing pattern, docs, polish.
- `haiku` mechanical work (translations, renames).

### Running in parallel (several sessions/agents in one working tree)
- **Don't run `npm install`.** Every package's dependencies are already in its `package.json` and installed. If one is missing, add it to your package's `package.json`, write it under *Notes*, and tell the orchestrator.
- **Build only your package:** `npm run build` inside its folder (it builds what it depends on). Not the root build.
- **Don't commit** when told you're running as a subagent; the orchestrator reviews and commits. Otherwise commit as in step 6.

### Rules that apply to every task
- **No tests.** Leave the scaffolded `tests/` folders and test scripts alone: ignore them, don't write or run tests, don't delete them.
- **Components are dumb.** Properties in, events out. They never import `@papit/webrtc` or `@papchat/core` at runtime. `import type { … } from "@papchat/core"` is allowed (erased at build).
- **Only `@papchat/core` imports `@papit/webrtc`.** Only `pages/app` imports core and wires it to components.
- **House style:** 4-space indent, Allman braces for control flow (`if (x)\n{`), K&R for functions/methods, `handle<Event>` handlers bound with `@bind`, `// section` comments sparingly.
- **Never put user text into `innerHTML`/`unsafeHTML`.** Use `html` template parts (they escape).
- **Theme tokens only** (`--primary`, `--space-3`, `--radius-medium`, …), never raw colours or px for spacing. Check light and dark by eye.
- **A11y:** follow the WAI-ARIA APG pattern for anything interactive; reflect state to ARIA and to `:state()`.
- **Strings** go through `@papit/translator` (`@translate t = useTranslator("pc-<name>")`), with keys in `asset/translations/en.json` scoped by tag name. `sv.json` comes in T6.7, don't write it earlier.
- **Never `setAttribute` in a constructor** (breaks `createElement`). Reflect in `connectedCallback`.
- **Clean up** in `disconnectedCallback` everything `connectedCallback` added (listeners, observers, timers, AudioContexts, object URLs).

### Component task anatomy
Every `pc-*` component lives in its own package `@papchat/<name>`, tag `pc-<name>`, already scaffolded (T0.2) under `packages/<layer>/<name>`. Files: `src/component.ts`, `src/style.css`, `src/types.ts`, `src/index.ts`, `asset/translations/en.json`, `views/experiment/index.html` (+ `main.js`) as its demo page. Add papit dependencies to that package's `package.json` `dependencies`.

**Done when** (for every component, on top of the task's own list):
- `npm run build` in the package passes (also `npx tsc --noEmit -p .` for type errors the build may hide);
- the demo page `views/experiment/index.html` shows every state/variant side by side, including a `data-theme="dark"` section and one element made with `document.createElement`. **Don't run a browser to check it**: the user reviews pages live with `npm start` from the root;
- every property/event in the spec is in the package `README.md` (short: one table for properties, one for events).

**Gotchas found so far**
- Icons: `import "@papit/icon"`, then `<pap-icon name="/icons/spritesheet.svg#mic" aria-hidden="true"></pap-icon>` (ids in T0.3's note). The spritesheet lives in `packages/pages/app/asset/icons/` (theme-type assets aren't served); regenerate with `npm run icons` in the theme package. Don't copy it into a demo's `public/`: the dev server answers `/icons/spritesheet.svg` from the app package's assets. Size via `width`/`height`, colour via `color`. Meaningful icon → `role="img" aria-label="…"`.
- Status tokens exist in `@papit/theme`: `--success`, `--warning`, `--error`, `--info`; text colours `--text`, `--text-secondary` (there is no `--text-muted`).
- READMEs: copy the API tables format from `packages/atoms/avatar/README.md` (## API).
- Use `--primary-contrast` for text on a `--primary` surface. Presence colours: `--pc-available|busy|away|dnd|offline`.
- Edit `TASKS.md` with small exact edits only (other agents edit it at the same time), never rewrite the whole file.
- **Passing objects/arrays/streams to a child element:** `html` has no property bindings, and an attribute binding calls `setAttribute` (an object becomes `"[object Object]"`). For JSON-safe data (profiles, lists) declare the child property `{ type: Object }` / `{ type: Array }` and bind `attr="${JSON.stringify(value)}"`. For non-serialisable values (`MediaStream`, `File`, functions) set the property imperatively on a `@query` ref after render.
- Don't copy icons, flags or spritesheets into a demo's `public/`; the dev server serves every package's `asset/` paths.
- `@property()` needs an options object: `@property({ type: String })`.
- `html` attribute bindings must be the **whole** value: `style="${`--x: ${v}`}"`, never `style="--x: ${v}"` (that renders the value as text).

### Papit reference (read when the task says so)
| Ref | Path |
| --- | --- |
| `WC` | `/Users/henry/Developer/projects/papit/.claude/skills/papit-web-component/SKILL.md` and `packages/web/engines/web-component/docs/` |
| `DS` | `/Users/henry/Developer/projects/papit/.claude/skills/papit-design-system/SKILL.md` |
| `SWITCH` | `/Users/henry/Developer/projects/papit/packages/web/design-system/atoms/switch/` (a component done right) |
| `NET` | `/Users/henry/Developer/projects/papit/packages/network/webrtc/README.md` (Client, Media, Channel, status, events) |
| `DEMO` | `/Users/henry/Developer/projects/webrtc/demo/src/main.js` (working plain-DOM Client/Media wiring) |
| `STATIC` | `/Users/henry/Developer/projects/papit/packages/runtime/cli/static/README.md` |
| `SIG` | `/Users/henry/Developer/projects/papit/packages/web/tools/signals/README.md` |
| `TR` | `/Users/henry/Developer/projects/papit/packages/web/tools/translator/README.md` |
| `<pkg>` | any `@papit/<pkg>` README: `/Users/henry/Developer/projects/papit/packages/web/design-system/*/<pkg>/README.md` |

---

## Wave 0: setup

### [x] T0.1 Root config · `opus` · needs T0.2
- **files:** `package.json`, `.github/workflows/*`, `.gitignore`
- **do:**
  - root `package.json` (`htmlprefix` and `repository` are already set): add `@papit/static` and `@papit/svg-spritesheet` to devDependencies; remove the `publish` script; add `"pages": "npm run build && cd packages/pages/app && npx @papit/static -- --base /papchat/"`.
  - delete `bin/publish.mjs`, `bin/runners/example-runner/`, and workflows `publish.yml`, `update-playwright-cache.yml`, `update-snapshots.yml`.
  - `pull-request.yml` → checkout, setup-node from `.nvmrc`, `npm ci`, `npm run build`. Nothing else.
  - add `pages.yml` (PLAN §7): on push to `main` + `workflow_dispatch`; permissions `pages: write`, `id-token: write`; `npm ci` → `npm run build` → `cd packages/pages/app && npx @papit/static -- --base /papchat/` → `actions/upload-pages-artifact` with `packages/pages/app/dist` → `actions/deploy-pages`.
  - `.gitignore`: add `packages/**/dist/`.
- **done when:** `npm run build` passes on the empty workspace; workflows are valid YAML.

### [x] T0.2 Scaffold every package · `user`
Done by hand with `npm create @papit -- --package=<type> --html-prefix=pc --no --name=<name> --description=…` (folder picked from the menu). 34 packages: foundations `theme` (theme), `core` (browser); atoms `avatar presence badge time level-meter progress video`; molecules `member-item connection-status message composer file-card call-controls video-tile incoming-call toast language-picker ringtone-picker device-picker stage-card`; organisms `member-list room-list conversation call-stage room invite-picker settings onboarding app-header toaster`; templates `app-shell`; pages `app` (browser). Then one root `npm install`. Scaffolded `tests/` stay and are ignored.
- **done when:** all 34 exist, `npm install` and `npm run build` pass.

### [x] T0.3 Theme and icons · `sonnet` · needs T0.2
- **read:** DS (theme tokens), `@papit/theme` and `@papit/icon` READMEs, `@papit/svg-spritesheet` README (`/Users/henry/Developer/projects/papit/packages/runtime/svg-spritesheet/`).
- **files:** `packages/foundations/theme/**`
- **do:** `src/theme.css` imports `@papit/theme` and overrides only brand tokens (`--primary` family with a papchat accent, chosen to pass WCAG AA in light and dark). Add presence colours as tokens: `--pc-available`, `--pc-busy`, `--pc-away`, `--pc-dnd`, `--pc-offline`. Add 24×24 stroke SVG icons (`currentColor`) to `asset/icons/`: mic, mic-off, camera, camera-off, screen, screen-off, phone, phone-off, user-plus, paperclip, send, settings, broadcast, download, x, users, chat, search, menu, play, stop, volume. Build them into a spritesheet that `pap-icon` can use.
- **done when:** demo page shows every token swatch and every icon via `pap-icon`, light and dark.
- **note:** tokens added/overridden in `@papchat/theme` (`@layer theme`): `--primary`, `--secondary`, `--focus-color` (indigo), new `--primary-contrast` (text on primary), `--pc-available|busy|away|dnd|offline`. Icon markup: `<pap-icon name="/icons/spritesheet.svg#mic" aria-hidden="true"></pap-icon>` (import `@papit/icon`; size/colour via `width`/`height`/`color` on `pap-icon`; 24px, `currentColor`). Use `role="img" aria-label` when meaningful. Ids: mic mic-off camera camera-off screen screen-off phone phone-off user-plus paperclip send settings broadcast download x users chat search menu play stop volume. Sources are `asset/icons/svg/*.svg`; after changing them run `npm run icons` in the theme package (spritesheet is committed). Add `@papchat/theme` and `@papit/icon` to the component demo/page as needed.

### [x] T0.4 Core skeleton · `opus` · needs T0.2
- **read:** PLAN §2.1, §2.3, §3.1, §3.2; SIG; NET (Client options).
- **files:** `packages/foundations/core/src/{index,types,config,storage,state,log}.ts`, its `package.json` (deps `@papit/webrtc`, `@papit/signals`).
- **do:**
  - `types.ts`: `Profile`, `Status`, `Prefs`, `Debug`, `RoomSummary`, `StageSummary`, `ChatMessage`, `Invite`, `InviteKind`, `DeclineReason`, `Toast`, `IncomingCall`, `FileInfo`, `TransferState`. These are the shared types components `import type`.
  - `config.ts`: signal URL resolution (default / localhost / `?signal=` stored in `papchat:debug`), `RTC`, `LIMITS = { roomSize: 8, fileBytes: 100 MB, ringMs: 30_000, chunk: 16 KiB, batch: 64 }`.
  - `storage.ts`: typed, versioned get/set for `papchat:profile`, `papchat:prefs` (with defaults), `papchat:debug`, plus `session` (sessionStorage `papchat:session`: `{ rooms: {id, password, kind}[] }`). Every access in try/catch; corrupt or old-version data falls back to defaults.
  - `state.ts`: signals for `me`, `prefs`, `lobbyStatus`, `members` (deduped by uid, newest peer wins), `rooms`, `activeRoom`, `stages`, `incoming`, `toasts`, plus `toast(kind, text)` helper.
  - `log.ts`: `log(...)` only when `papchat:debug.log`.
  - `index.ts` exports all of it and assigns `window.papchat = { state, … }` for console checks.
- **done when:** builds; from the demo page console, `papchat.state.prefs()` returns defaults and survives a corrupted localStorage value.
- Done. State setters are exported next to readers (`setMe`, `setMembers`, …, `setPrefs(partial)` persists). `Prefs.language` defaults to `""` = not chosen yet. `ChatMessage.variant` includes `"file"`; `FileEntry = FileInfo & TransferState`.

### [x] T0.5 Page shell · `sonnet` · needs T0.3, T0.4
- **read:** STATIC, PLAN §4.2 Page, §5.
- **files:** `packages/pages/app/**`
- **do:** `views/github/index.html` (theme stylesheet, `<pc-app-shell>` placeholder markup, `<script type="module" src="main.ts">` as static expects), `src/main.ts` (imports core, logs "papchat ready"), `tsconfig.json`. Create `asset/audio/ringtones/ringtones.json` as `[]` and `asset/audio/README.md` naming the files the user should drop in (PLAN §5). Remove the scaffolded component files that don't apply to a page.
- **done when:** `npm run pages` writes `packages/pages/app/dist/` and serving that folder at `/papchat/` shows the page with the theme applied and no 404s in the network tab.
- Done. `main.ts` + `style.css` (`@import "@papchat/theme"`) live in `views/github/` (static bundles page-folder scripts), not `src/`; `src/index.ts` is `export {}`. Static build works, BUT `@papit/static` skips assets of `papit.type: "theme"` packages, so `public/icons/spritesheet.svg` is NOT published (see Notes).

### [ ] T0.6 Go live · `user` · needs T0.1, T0.5
Create `github.com/onkelhoy/papchat`, push `main`, Settings → Pages → Source: GitHub Actions. Check the empty shell is live.

---

## Wave 1: lobby (PLAN §2.2, §2.3, §6.1–2)

### [x] T1.1 Core: lobby · `opus` · needs T0.4
- **read:** NET (all of Client, Status, Lifecycle), DEMO, PLAN §2.2–2.4.
- **files:** `core/src/lobby.ts`, `core/src/identity.ts`, exports.
- **do:** `identity.ts`: create/read profile (`uid` via `crypto.randomUUID`, random colour from a fixed palette), `setName/setColor/setStatus` that write storage, update `me` and call `lobby.setProfile`. `lobby.ts`: `startLobby()` per §2.2 steps 1–5 (canonical = smallest `meta.created`, then id; race guard re-`list()` after 2 s; one retry; space server calls ≥ 1 s apart); status → `lobbyStatus`; `members` event → `members` signal (exclude self, dedupe by uid); on `error` type `reconnect` → `leave()` + rerun boot; `send(uid, type, payload)` resolving uid → newest peer id; `broadcast`; an `on(type, handler)` dispatcher for app messages; `unreachable` → toast. No invites yet (T2.1).
- **done when:** with `npx papit-signal-server --port 3000` and 3 tabs: all land in one lobby, each sees the other two in `papchat.state.members()`; two tabs opened within 100 ms converge on one lobby; closing the host tab keeps the others connected; killing and restarting the server reconnects everyone into one lobby.
- Done (build only; 3-tab live check left to the user). API: `startLobby(): Promise<boolean>` (needs a profile, never rejects, keeps retrying), `stopLobby()`, `send(uid, type, payload?): boolean` (uid → newest peer id), `broadcast(type, payload?): boolean`, `on(type, (payload, from: { peer, uid, profile }) => void): () => void` (unsubscribe; handlers survive reconnects), `peerOf(uid)`, `uidOf(peer)`, `profileOf(uid)`, `lobbyClient()`, `setLobbyProfile(profile)`. identity: `PALETTE` (8 hex colours), `NAME_MAX`, `getProfile()`, `hasProfile()`, `createProfile(name, color?)` (keeps an existing uid), `updateProfile({name,color,status})`, `setName/setColor/setStatus`. `lobbyStatus` is "connected" only once inside the lobby. Wire profile = Profile + `at` (client start time) to pick the newest peer per uid. Members exclude only your own peer id, so another tab with your uid shows up as one entry. Race guard runs after create and after join, and again when promoted to host. Reconnect: closes the client and starts a fresh `Client` (see Notes: papit gap).

### [x] T1.2 pc-avatar · `opus` (reference atom) · needs T0.3
- **read:** WC, DS, SWITCH.
- **props:** `name` (string), `color` (string, CSS colour; fallback: hue from hashing `uid`), `uid`, `size` (`"s" | "m" | "l"`, reflect). **slot:** `badge` (bottom-right, for `pc-presence`).
- **render:** initials (first letters of first and last word, max 2, uppercase), text colour chosen for contrast. `role="img"`, `aria-label` = name.
- This is the pattern every later component copies: keep it clean and commented where it matters.
- Done: `packages/atoms/avatar`. Exports `initials(name)` and `colorFor(seed)` too. Size via `--avatar-size` (`-s`, `-l`). ARIA set in `connectedCallback`, not the constructor.

### [x] T1.3 pc-presence · `sonnet` · needs T1.2
- **props:** `status` (`available|busy|away|dnd|offline`, reflect). Dot using `--pc-<status>` tokens, `dnd` gets a bar, `away` a hollow ring (not colour-only). `role="img"`, translated `aria-label`.
- Done: `packages/atoms/presence`. Size via `--presence-size` (default 0.75rem), unknown status falls back to offline; put it in `pc-avatar`'s `badge` slot (give it a ring with `--background` if needed). Translations keys `pc-presence.<status>` in `en.json` (add to `sv.json` in T6.7).

### [x] T1.4 pc-badge · `sonnet` · needs T1.2
- **props:** `count` (number; shows `99+` above 99, hidden at 0), `variant` (`neutral|primary|live|error`). Default slot for a text label ("Live", "Host", "You"). `live` variant has a pulsing dot (respect `prefers-reduced-motion`).
- Done: `count` (Number) hides the host via `[hidden]` at <= 0; with `count` unset the default slot is the label. `variant` reflected. Colours overridable via `--badge-background`/`--badge-color`; no events. Demo imports `@papchat/theme` (added as devDependency).

### [x] T1.5 pc-time · `sonnet` · needs T1.2
- **props:** `at` (number, epoch ms). Renders `<time datetime>` with `Intl.RelativeTimeFormat` in the translator's current language ("just now" under 45 s). Re-renders every 30 s while connected (one shared interval for all instances). `title` = full local date-time.
- Done: `packages/atoms/time`. Exports `relative(diff, locale, now)`. Locale comes from `translator.locale()` (`meta.language`); string key `pc-time.now`. Renders nothing for missing/invalid `at`. Inherits colour via `--time-color` (default `--text-muted`).

### [x] T1.6 pc-connection-status · `sonnet` · needs T1.3
- **props:** `status` (`connecting|waking|connected|reconnecting|closed`). Pill with dot + translated text; `waking` says "Waking up the server… (can take up to a minute)". `role="status"`, `aria-live="polite"`.
- Done: `packages/molecules/connection-status`. `status` reflected (default `connecting`, unknown renders as connecting), exports type `ConnectionStatusValue`; no events. Dot is a `pc-presence` (away=pulsing for connecting/waking/reconnecting, available, offline); `--connection-status-background|color`; keys `pc-connection-status.<status>` in `en.json` (add sv in T6.7). Core's `lobbyStatus` values must match these five strings, else map them in the page.

### [x] T1.7 pc-member-item · `opus` (reference molecule) · needs T1.2, T1.3, T1.4
- **read:** `@papit/menu`, `@papit/button` READMEs.
- **props:** `profile` (`Profile`), `self` (boolean, shows "You" badge, no actions), `incall` (boolean, small phone icon).
- **render:** `pc-avatar` with `pc-presence` in its badge slot, name, translated status text; a `pap-menu` trigger (⋯) with Chat / Call / Video call / Invite to current room (hidden unless `canInvite`).
- **props (cont.):** `canInvite` (boolean).
- **events:** `member-action` `{ uid, action: "chat" | "call" | "video" | "invite" }`. Double-click / Enter on the row = `chat`.
- Drop target comes in T4.4, leave a `// T4.4 drop target` marker.
- Done: `profile` is property-only; `canInvite` attribute is `caninvite`; `self`/`incall` reflected. `member-action` already bubbles+composed (T1.10 needn't re-dispatch). Host is a focusable `role="listitem"` with `tabindex="0"` only if none set (so `pap-group` roves rows; parent needs `role="list"`), aria-label "name, status[, You][, In a call]"; ⋯ is a native `<button popovertarget>` in the tab order only while the row has focus; contextmenu (right-click/Shift+F10) opens it. `:state(menu-open)`, parts `avatar|name|status|trigger`, `--member-item-ring`. Its `.d.ts` imports `@papchat/core` types: consumers add it as devDependency.

### [x] T1.8 pc-language-picker · `sonnet` · needs T0.3
- **read:** `@papit/menu`, `@papit/icon`, TR.
- **props:** `value` (language code), `languages` (`{ code, label, flag }[]`, default en 🇬🇧 / sv 🇸🇪). Flags as `pap-icon` SVGs in this package's `asset/icons/flags/`.
- **events:** `change` with `detail.value`. Does not call the translator itself.
- Done: `languages[].flag` is a `pap-icon` name (default `/icons/flags/en.svg`, `sv.svg`, files in the package `asset/icons/flags/`, must be served at `/icons/flags/`: copy/serve them in the page). Trigger is a native `<button popovertarget>` (works with `pap-menu`); `change` bubbles+composed. Page must register `sv` translation for the `label` key only in T6.7.

### [x] T1.9 pc-app-shell · `sonnet` · needs T1.2
- **read:** `@papit/sidebar`, `@papit/drawer` READMEs.
- **slots:** `header`, `sidebar`, `main`, `overlay` (incoming calls), `toasts`. CSS grid: header on top, sidebar left (`pap-sidebar`), main fills. Under 800 px the sidebar slot moves into a `pap-drawer` opened by a menu button in the header area. **props:** `sidebaropen` (boolean, reflect). **events:** `sidebar-toggle` `{ open }`.
- Done: `sidebaropen` default false (set it on wide screens or the sidebar is a 4rem rail), `sidebar-toggle` does not bubble, host is `100dvh`. Own menu button on mobile (T1.11's `menu-toggle` can just set `sidebaropen`). `overlay`/`toasts` are fixed full-viewport layers, only slotted content takes pointer events.

### [x] T1.10 pc-member-list · `opus` (reference organism) · needs T1.7
- **read:** `@papit/group`, `@papit/input` READMEs.
- **props:** `members` (`Profile[]`), `me` (`Profile`), `incall` (uid[]), `canInvite` (boolean). Renders a search `pap-input` (filters by name, client side), count heading ("Online · 3"), `me` first with `self`, then others sorted available → busy → away → dnd, then name. List in a `pap-group` for arrow-key roving. Empty state: "No one else here yet — share the link".
- Leave a `slot="live"` above the list for stage cards (T5.3).
- **events:** re-dispatches `member-action` (bubbles, composed).
- Done: `packages/organisms/member-list`. Props `members`, `me`, `incall` (all property-only), `canInvite` (attr `caninvite`); `member-action` comes straight from `pc-member-item` (nothing re-dispatched). `slot="live"` sits above the heading. Rows are keyed `pc-member-item`s whose props are set in `update()`. Removed `@papit/accordion` and `@papchat/stage-card` from its dependencies (T5.3 re-adds them; stage-card is unfinished). Heading counts `me` too.

### [x] T1.11 pc-app-header · `sonnet` · needs T1.6, T1.8
- **read:** `@papit/theme-picker`, `@papit/menu`.
- **props:** `me` (`Profile`), `status` (lobby status), `language`, `live` (boolean: you are presenting).
- **render:** logo/name "papchat", `pc-connection-status`, a "Go live" button, `pc-language-picker`, `pap-theme-picker storage="local"`, settings button, own `pc-avatar` with a status menu (`pap-menu`: available/busy/away/dnd).
- **events:** `status-change` `{ status }`, `language-change` `{ value }`, `open-settings`, `go-live`. (No mobile menu button: `pc-app-shell` owns it.)
- Done: `packages/organisms/app-header`. Props `me` (Profile|null, property only), `status` (LobbyStatus, `idle` shown as connecting), `language`, `live` (reflected; disables the button, text "You are live"). Events (none bubble): `status-change` `{status}`, `language-change` `{value}`, `open-settings`, `go-live` (no detail; T5.3 can intercept the button). Page must serve `/icons/spritesheet.svg` (needs `broadcast`, `settings`), `/icons/flags/*` and the theme-picker `/icons/sun|moon|computer.svg`; strings under `pc-app-header` (golive, live, settings, account, 4 statuses).

### [x] T1.12 pc-onboarding · `sonnet` · needs T1.2, T1.8
- **read:** `@papit/dialog`, `@papit/input`.
- **props:** `open` (boolean), `name`, `color`, `language`. Modal `pap-dialog` "Who are you?": name (required, 1–32 chars, trimmed), colour swatches (radio group, 8 colours, live `pc-avatar` preview), language picker. Can't be dismissed without a name.
- **events:** `submit` `{ name, color, language }`. (The submit click is the user gesture that unlocks audio; the page uses it.)
- Done: `packages/organisms/onboarding`. Props `open, name, color, language, colors` (`colors` = copy of core `PALETTE`, default same 8; core is not imported). Events `submit` `{name,color,language}` and extra `language-change` `{value}` (page should `translator.change` live and call `open = false` on submit: the dialog reopens itself if closed by Escape/X while `open`). Page must serve `/icons/flags/` for the picker.

### [x] T1.13 Wire wave 1 · `opus` · needs T1.1, T1.9–T1.12
- **files:** `packages/pages/app/**`
- **do:** `main.ts`: load prefs, set translator language (stored → `navigator.language` → en) and register `/translations/<lang>.json`; no profile → `pc-onboarding`, then create profile; profile → `startLobby()`. Effects bind `me`, `lobbyStatus` (map core's `"idle"` → `"connecting"` for `pc-connection-status`), `members` to `pc-app-header` / `pc-member-list`. Header events update status/language (saved). `member-action` logs for now.
- **done when:** PLAN §6 flows 1 and 2 work in 3 tabs locally and on the deployed page.
- Done: `views/github/{index.html,main.ts}`. Build and typecheck pass; the 3-tab live check is NOT done (needs T0.6 deploy / a local serve).

---

## Wave 2: chat rooms (PLAN §2.4, §2.5, §6.3)

### [x] T2.1 Core: invites and rooms · `opus` · needs T1.1
- **read:** NET (Media, Channel), PLAN §2.4, §2.5.
- **files:** `core/src/room.ts`, `core/src/invites.ts`, exports.
- **do:**
  - `Room` class wrapping its own `Client` (`ROOM_PLAN` from §2.5, `accept` size < 8): `static create(kind, title)` / `static join(id, password, kind)`; call `media.channel("file")` and `("state")` right after create/join; `messages` signal (`ChatMessage[]`, system messages for joined/left from `members` diffs by uid); `send(text)` via `client.broadcast("chat", …)`; typing over the `state` channel (throttled 1/s, expires after 4 s) → `typing` signal (uids); `participants` signal (profiles); `unread` count (reset by `markRead()` when it is `activeRoom`); `invite(uid, kind)` over the lobby; `leave()` (close client, remove from `rooms`, session storage). Reconnect error → rejoin with the stored id/password.
  - `invites.ts`: handle `invite`, `invite.accept`, `invite.decline`, `invite.cancel` from the lobby. `chat` invite → auto-join the room, toast "Anna started a chat", unread +1 (no ring). 1:1 reuse: `openChat(uid)` reuses the existing 1:1 room for that uid. Rejected join (`network.reject`) → toast "room is full".
  - On boot, rejoin rooms from `papchat:session` that still exist.
- Done: `room.ts`, `invites.ts` finished from the wip commit; typecheck passes. Multi-tab console check NOT done.
- **done when:** from the console, tab A `papchat.openChat(<B's uid>)` → B gets the room; messages and typing flow both ways; a third tab invited joins and sees the system "joined" message; refresh of B rejoins.

### [x] T2.2 pc-message · `sonnet` · needs T1.2, T1.5
- **props:** `message` (`ChatMessage`), `author` (`Profile`), `mine` (boolean), `grouped` (boolean: same author within 2 min, hide avatar and name), `variant` (`"text" | "system"`).
- Text: plain text with URLs auto-linked by splitting the string into text and `<a target="_blank" rel="noopener noreferrer">` parts, never HTML. Preserve newlines. `mine` aligns right with the primary colour.
- Done: `packages/molecules/message`. No events. `variant` defaults to `message.variant` (`file` renders as text, the conversation shows `pc-file-card` itself); `grouped` is computed by the parent (conversation: same uid within 2 min). Wrap in a flex column; host is `display:flex`. Also exports `linkify(text)`. Added `@papchat/core` as devDependency (type import).

### [x] T2.3 pc-composer · `sonnet` · needs T0.3
- **read:** `@papit/input`, `@papit/file-input`, `@papit/button`.
- **props:** `disabled`, `placeholder`. Multiline input; Enter sends, Shift+Enter newline; send button (disabled when empty/whitespace); attach button via `pap-file-input` (multiple).
- **events:** `send` `{ text }` (trimmed, then clears), `typing` (at most once per second while typing), `files` `{ files: File[] }`.
- Done: `packages/molecules/composer`. Field is a native `<textarea>` (`pap-input` is single-line); attach opens a hidden `pap-file-input` (multiple) from a `pap-button`. Needs `/icons/spritesheet.svg` (paperclip, send). Events bubble+composed; `focus()` method; `disabled` reflected; strings `pc-composer.{placeholder,send,attach}`. T2.6: Enter during IME is ignored, `files` also needs the T4.4 drop zone to be done in the conversation.

### [x] T2.4 pc-toast and pc-toaster · `sonnet` · needs T0.3
- Done. `pc-toast` events `dismiss`/`action` have no detail and do not bubble; the toast never removes itself. `pc-toaster` `toasts: Toast[]` (newest 4 shown, keyed by id so timers survive rerenders) re-dispatches `dismiss`/`action` `{ id }`; it does NOT call `onAction`, the page must (find the toast, run `onAction`, then drop it). Toaster is `position: fixed`, so it needs no slot styling.
- `pc-toast` props: `kind` (`info|success|warning|error`), `text`, `action` (optional label), `duration` (ms, default 5000, 0 = sticky). Pauses timer on hover/focus. Events: `dismiss`, `action`.
- `pc-toaster` props: `toasts` (`Toast[]` with `id`). Stack bottom-right (bottom-center on mobile), max 4 visible, `role="status"` region. Re-dispatches `dismiss` / `action` with `{ id }`.

### [x] T2.5 pc-room-list · `sonnet` · needs T1.2, T1.4
- **props:** `rooms` (`RoomSummary[]`: id, kind, title, participants `Profile[]`, unread, incall, live), `active` (id). Each row: stacked avatars (max 3), title (fallback: participant names), unread `pc-badge`, phone icon if in a call, `Live` badge for stages. `pap-group` roving, `aria-current` on the active one.
- **events:** `select` `{ id }`, `leave` `{ id }` (via a row menu).
- Done: `packages/organisms/room-list`. `rooms` (`RoomSummary[]`, property only) and `active` (id); events `select`/`leave` `{ id }` (bubble, composed). The list never changes `active` itself: the page sets it on `select`. Needs `/icons/spritesheet.svg` served (phone icon). Empty `title` falls back to participant names; empty list shows a translated empty text. Added `@papchat/core` (types only) and `@papchat/theme` as devDependencies.

### [x] T2.6 pc-conversation · `sonnet` · needs T2.2, T2.3
- **props:** `messages` (`ChatMessage[]`), `profiles` (`Record<uid, Profile>`), `me` (uid), `typing` (uid[]), `heading`.
- Message list with grouping computed here; auto-scroll to bottom on new messages unless the user scrolled up (then show a "New messages ↓" button). Typing line ("Anna is typing…", "Anna and Bob are typing…", "Several people…"). `pc-composer` at the bottom. Leave a `// T4.4 drop zone` marker.
- **events:** re-dispatches `send`, `typing`, `files`.
- Done: `packages/organisms/conversation`. `messages`, `profiles`, `typing` are property-only; `me`, `title` also attributes. Events `send`/`typing`/`files` are stopped and re-dispatched (bubble, composed). Marker `<!-- T4.4 drop zone -->` sits just above `pc-composer` in `render()`; `file` messages render as plain text until T4.4 (which must add `@papchat/file-card` to dependencies, I removed it as unused). Child `pc-message` props are set imperatively in `update()` (attribute bindings only carry strings). Host is `display:flex; height:100%`, so the page must give it a height. Needs `/icons/spritesheet.svg`.

### [x] T2.7 Wire wave 2 · `opus` · needs T2.1, T2.4–T2.6
- Sidebar: `pc-room-list` above `pc-member-list`. Main: `pc-conversation` for `activeRoom` (empty state "Pick someone to chat with" otherwise). `member-action: chat` → `openChat`. `toasts` → `pc-toaster`; on its `action` `{ id }` run that toast's `onAction` then dismiss it, on `dismiss` call `dismissToast(id)`. Unread badge counts update, `markRead` on select. Document title shows total unread `(3) papchat`.
- **done when:** PLAN §6 flow 3 works between 3 tabs and on the deployed page.

---

## Wave 3: calls (PLAN §2.5 media, §2.8, §6.4–5, §6.7)

### [x] T3.1 Core: media, ringing, devices · `opus` · needs T2.1
- **files:** `core/src/{room.ts,invites.ts,ringtone.ts,devices.ts}`, exports.
- **do:**
  - `Room`: `start(name)` / `stop(name)` for mic/camera/screen using chosen devices; `captures` signal (`Record<name, MediaStream>`); `streams` signal (`{ uid, name, stream }[]` from `stream` / `stream-ended`, peer → uid via profiles); mute/camera flags broadcast on `state` channel; `capture-ended` updates flags (browser-bar screen stop). `call(uid, "call" | "video")` creates the room, starts mic (+ camera), invites, plays ringback until first remote peer or `invite.accept`; all decline/timeout → toast + close the empty room. `cancel` sends `invite.cancel` to everyone still ringing. `me.status = busy` while in a call, restored after.
  - `invites.ts`: `call`/`video`/`stage` invite → `incoming` signal entry + ringtone loop; auto-decline `timeout` after 30 s; `dnd` → decline `dnd`; busy + `prefs.autoDeclineBusy` → decline `busy`; `accept(id, withVideo)` / `decline(id)`.
  - `ringtone.ts` (PLAN §5): list from `fetch("/audio/ringtones/ringtones.json")`, load via fetch → blob URL, cached; `play(id, { loop })`, `stop()`, `preview(id)`, volume from prefs, `ringback()`, `ping()`. **If a file is missing, synthesize the tone with WebAudio** (ring: two-tone 440/480 Hz pattern; ringback: 440 Hz 2 s on / 4 s off; ping: short 880 Hz) so it works before the user adds mp3s. `play()` rejection → `audioBlocked` signal true.
  - `devices.ts`: `list()` via `enumerateDevices` (refresh on `devicechange`), chosen ids in prefs, `constraints(name)` for `media.start`, `setSink(el)` with `setSinkId` when supported.
- **done when:** console: A calls B, B rings, accepts, both get each other's mic+camera streams in the signals; screen share from A shows up on B; stopping it from the browser bar clears it; decline and timeout both toast on A.
- Done: `devices.ts`, `ringtone.ts`, media in `room.ts`, ringing in `invites.ts`. API: `room.start/stop("mic"|"camera"|"screen")`, signals `room.captures/streams/flags`, `room.incall`, `placeCall(uid, "call"|"video")` (hang up with `room.leave()`, which cancels ringing), `acceptInvite(id, withVideo)`, `declineInvite(id)`, `incoming` signal, `ringtone.{loadTones,tones,play,preview,previewing,stop,unlock}`, `devices()`/`listDevices()`/`setSink(el)`/`sinkSupported`. Browser test not run (needs two tabs). `ringtones.json` is still `[]`, so tones are synthesized until the mp3s are listed (see Notes).

### [x] T3.2 pc-video · `sonnet` · needs T0.3
- **props:** `stream` (`MediaStream`, property only), `muted`, `mirror`, `fit` (`cover|contain`), `sinkid`. Sets `srcObject`; calls `play()` and on rejection shows a "click to play" overlay button. Clears `srcObject` on disconnect.
- Done: `packages/atoms/video`. Props `stream` (property only), `muted`, `mirror`, `fit`, `sinkid`; no events. Host is `display: block` and needs a size from the parent (video fills it, `object-fit` from `fit`). Autoplay-blocked overlay uses `pap-button` + `pap-icon` (`pc-video.play` translation); for the tile, pass `muted` + `mirror` for `self`, `fit="contain"` for screens.

### [x] T3.3 pc-level-meter · `sonnet` · needs T0.3
- **props:** `stream` (`MediaStream`), `bars` (default 5). One shared `AudioContext` per page, an `AnalyserNode` per instance, `requestAnimationFrame` loop paused while hidden; closes its nodes on disconnect or stream change. `aria-hidden`.
- **events:** `speaking` `{ speaking: boolean }` with ~300 ms hysteresis.
- Done: `stream` (property only, `null` clears), `bars` (1 to 16), `speaking` event bubbles+composed (on at once, off 300 ms after quiet). Sizing via `--level-meter-height`, `--level-meter-color`; it renders no strings. Listen for `speaking` on the host (tile can re-dispatch or toggle its ring).

### [x] T3.4 pc-video-tile · `sonnet` · needs T3.2, T3.3, T1.2
- **props:** `profile`, `video` (`MediaStream?`), `audio` (`MediaStream?`), `muted` (remote mic flag), `self` (mirror + `muted` video element), `screen` (boolean, `fit=contain`), `pinned`.
- No video → large `pc-avatar` on a tinted background. Name label, mic-off icon when muted, level meter, speaking ring (from `speaking`). Pin and fullscreen buttons on hover/focus. **events:** `pin` `{ pinned }`.
- Done: `packages/molecules/video-tile`. Properties only for `profile`/`video`/`audio`; `muted`, `self`, `screen`, `pinned` reflect; event `pin` `{ pinned }` (tile toggles its own `pinned`; `speaking` bubbles from the meter, `:state(speaking)` too). The tile does NOT play `audio` (meter only): a remote mic stream needs a player elsewhere (T3.7/page). No pin/fullscreen icons exist, buttons are text. Host needs a size from the parent.

### [x] T3.5 pc-call-controls · `sonnet` · needs T0.3
- **read:** `@papit/group`, `@papit/tooltip`.
- **props:** `mic`, `camera`, `screen` (booleans: on/off), `viewer` (only "Leave" and chat toggle), `canScreen` (hide on browsers without `getDisplayMedia`). Toolbar (`role="toolbar"` via `pap-group`): mic, camera, screen, invite, devices, hang up (error colour). Toggle buttons use `aria-pressed`. Tooltips with shortcut hints ("Mute (M)").
- **events:** `toggle` `{ control: "mic" | "camera" | "screen" }`, `invite`, `devices`, `hangup`. (Global M/V/S shortcuts come in T6.6.)
- Done: `packages/molecules/call-controls`. Props `mic`, `camera`, `screen`, `chat` (all reflected, pressed = on), `viewer`, `canscreen` (default true; set `canscreen="false"` or `.canscreen = false` to hide screen). Events (bubble, composed): `toggle` `{control: "mic"|"camera"|"screen"|"chat"}` (does not flip its own state; page sets the prop back), `invite`, `devices`, `hangup`. Viewer mode shows chat toggle (`chat` prop, `toggle` control `"chat"`) + hangup. Needs `/icons/spritesheet.svg` (mic, mic-off, camera, camera-off, screen, screen-off, user-plus, settings, phone-off, chat).

### [x] T3.6 pc-incoming-call · `sonnet` · needs T1.2
- **props:** `call` (`IncomingCall`: id, from `Profile`, kind, title). Card with large pulsing avatar (reduced-motion aware), "Anna is calling…" / "…video calling" / "…invites you to watch Demo". Buttons: Accept (audio), Accept with video (only for video), Decline. `role="alertdialog"`, focus moves to Accept.
- **events:** `accept` `{ id, video }`, `decline` `{ id }`.
- Done: `call` is `{ type: Object }` (set the property, or a JSON attribute); `accept`/`decline` don't bubble (listen on the element). Card is `max-inline-size: 22rem` (`--incoming-call-max-width`), so stack several in the overlay slot with a flex column. Focus moves to Accept on connect.

### [x] T3.7 pc-call-stage · `sonnet` · needs T3.4
- **props:** `tiles` (`{ id, profile, video?, audio?, muted, screen, self }[]`). Responsive grid (1 → full, 2 → side by side, 3–4 → 2×2, up to 8 → 3 cols). A screen tile or a pinned tile becomes the big one with the rest in a strip. Self tile as a small corner overlay in 1:1 calls. **Plays remote audio:** `pc-video-tile` only meters audio, so the stage keeps one hidden `<audio autoplay>` per non-self tile with an `audio` stream (srcObject set imperatively, `sinkid` prop applied via `setSinkId` where supported), removed when the tile goes away.
- Done: `packages/organisms/call-stage`. `tiles` (`CallTile[]`, property only; `id` stable), `sinkid`; event `pin` `{ id, pinned }` (bubbles, composed; a user pin wins over `tile.pinned`). Plays remote audio itself. Host needs a size from its parent. Build + typecheck pass; demo not viewed.

### [x] T3.8 pc-invite-picker · `sonnet` · needs T1.2
- **read:** `@papit/dialog`, `@papit/checkbox`.
- **props:** `open`, `members` (`Profile[]`, already filtered to people not in the room). Checkbox list with avatars and search. **events:** `invite` `{ uids }`, `close`.
- Done: `packages/organisms/invite-picker`. Props `open`, `members` (`Profile[]`, property only). Events `invite` `{uids}` (page must set `open = false` after handling) and `close` (user dismissal; component already set `open = false`); both bubble/composed. Selection and search reset on each `open` change. Strings under `pc-invite-picker`.

### [x] T3.9 pc-room · `sonnet` · needs T3.5, T3.7, T2.6
- **read:** `@papit/splitter`, `@papit/tabs`.
- **props:** everything `pc-conversation` and `pc-call-stage` need, plus `incall` (boolean), `viewer` (boolean), control flags, `participants` (`Profile[]`), `files` (T4: leave the tab empty for now).
- Not in call → just the conversation, full width, with "Call" / "Video" buttons in the room header. In call → `pap-splitter` with `pc-call-stage` + `pc-call-controls` on one side, `pap-tabs` (Chat / Files / People) on the other. Mobile: stage on top, tabs below.
- Re-dispatches all child events.
- Done: `packages/organisms/room`. Child events already bubble/compose so only `call` `{kind}` is new (header buttons). Object props are set imperatively; tiles/mic/camera/screen/canscreen/sinkid/participants/me/messages/profiles/typing/heading/incall/viewer. Files tab is `<slot name="files">` for T4.4. Viewer: stage alone until the chat toggle. Build + typecheck pass; demo not viewed.

### [x] T3.10 Wire wave 3 · `opus` · needs T3.1, T3.6, T3.8, T3.9
- `pc-room` replaces `pc-conversation` in main. `incoming` → stacked `pc-incoming-call` in the shell's `overlay` slot. `member-action: call/video/invite`. Invite button → `pc-invite-picker`. `audioBlocked` → sticky toast "Click to enable sound" whose action plays a silent sound and clears it.
- **done when:** PLAN §6 flows 4, 5 and 7 work between 3 tabs, and 1:1 video works between a phone and a laptop on the deployed page.
- Done: `views/github/main.ts` wires `pc-room` (tiles: one per person + one pinned per screen share), incoming cards in `.incoming` (overlay slot), `pc-invite-picker`, `member-action` on `document` (sidebar + People tab), sticky `audioBlocked` toast. Header Call/Video in a 1:1 chat → `placeCall` (new call room); in a group → starts media in place. Hang up leaves call rooms, only stops captures in chat rooms. Flows 4, 5, 7 + decline, mute and hang-up pass headless with 3 Playwright tabs and fake media (scratch script, not committed). Not tested: phone ↔ laptop on the deployed page, the audioBlocked toast, real ringtone audio. Fixed `null` stream hand-offs in video-tile, call-stage, settings (see Notes).

---

## Wave 4: files (PLAN §2.6, §6.6)

### [x] T4.1 Core: transfer · `opus` · needs T2.1
- **files:** `core/src/transfer.ts`, `Room` integration.
- **do:** exactly PLAN §2.6: `file.offer` via `client.broadcast`, frames `[16-byte fid][u32 seq][data ≤ 16 KiB]` on the `file` channel, batches of 64 with a short await, reassembly into a `Blob` per sender, progress for both ends, `file.cancel`, 100 MB cap (toast), files signal on the room (`FileInfo & TransferState`). Object URLs revoked on room leave. Validate every frame (length, known fid, seq range).
- **done when:** a 50 MB file sent from A arrives byte-identical in B and C (compare SHA-256 in the console), with progress on both ends; cancel mid-way stops both.
- Done: `core/src/transfer.ts` (`Transfers`, one per Room). Room API: `room.files()` (signal of `FileEntry[]`), `room.sendFiles(files)`, `room.cancelFile(fid)`. fid is 32 hex chars (the 16 frame bytes). Each offer also pushes a chat message `{ variant: "file", fid, id: "file:<fid>" }` so T4.4 can place the card by time (until T4.4 the conversation shows it as an empty message). Sender waits 500 ms after the offer, then sends batches of 64 chunks with a 100 ms pause (~10 MB/s ceiling). A sender's cancel stops everyone; a receiver's stops only them, and the sender stops once every participant cancelled. Receive fails after 30 s with no frames. Object URLs revoked on leave. Typecheck + build pass; not run in a browser (SHA-256 check not done).

### [x] T4.2 pc-progress · `sonnet` · needs T0.3
- **props:** `value` (0–1), `label`. `role="progressbar"` with `aria-valuenow` 0–100. Indeterminate when `value` is unset.
- Done: `packages/atoms/progress`. `value` (0-1, clamped; unset/NaN = indeterminate, host gets `indeterminate` attr), `label` (aria-label, falls back to translated `pc-progress.label`). Host is the progressbar; width 100%, height via `--progress-height`, colour via `--progress-color`. No events.

### [x] T4.3 pc-file-card · `sonnet` · needs T4.2
- **props:** `file` (`FileInfo & TransferState`: name, size, type, progress, state `sending|receiving|done|cancelled|failed`, url?), `mine`. Icon by type, name (ellipsis, full name in `title`), human size (`Intl.NumberFormat` units), `pc-progress` while in flight, Cancel while in flight, Download (`<a download>`) when done. Preview when done: `<img>` for images, `<video controls>`, `<audio controls>`.
- **events:** `cancel` `{ fid }`.
- Done: `packages/molecules/file-card`. Props `file` (`FileEntry`, set as property) and `mine` (reflected); `cancel` `{ fid }` bubbles+composed. Only `blob:` urls are used for download/preview; Download/preview need `state: "done"` + `url`. `pc-conversation`/`pc-room` must import `@papchat/file-card` and pass `file` as a property (imperatively, or `{type:Object}` + JSON attr). Needs spritesheet icons camera, play, volume, paperclip, download.

### [x] T4.4 Drop zones · `sonnet` · needs T4.3, T3.9
- **files:** `organisms/conversation`, `molecules/member-item`, `organisms/room` (Files tab). Re-add `@papchat/file-card` to conversation's `dependencies` (T2.6 removed it).
- `pc-conversation`: full-area overlay on `dragenter` with files ("Drop to share"), dispatch `files`. Show file cards inline in the message list (a `file` message variant ordered by time). `pc-member-item`: drop target highlight, event `member-files` `{ uid, files }`. `pc-room` Files tab: list of `pc-file-card`s.
- Done: `pc-conversation` gets a `files: FileEntry[]` property (set as property), draws `file` messages as `pc-file-card` (a file message without an entry is hidden), shows a "Drop to share" overlay (part `drop`) and fires `files` on drop; the card's `cancel` bubbles out as is. `pc-member-item` highlights on file drag (`:state(drop)`), fires `member-files` `{ uid, files }`, never for `self`. `pc-room` gets a `files` property, passes it to the conversation and lists cards in the Files tab (`slot="files"` removed). T4.5 must set `files` on `pc-room`/`pc-conversation` and handle `files`, `member-files`, `cancel`. Typecheck + build pass; not run in a browser.

### [x] T4.5 Wire wave 4 · `sonnet` · needs T4.1, T4.4
- `files` from the composer or a drop → `room.sendFiles`. `member-files` → `openChat(uid)` then send. Cancel wired.
- **done when:** PLAN §6 flow 6 works between 3 tabs.
- Done: in `views/github/main.ts`: `view.files = room.files()`; `files` and `cancel` from the room view go to `sendFiles` / `cancelFile` on the current room; `member-files` (document-level, sidebar and People tab) does `openChat(uid)` then `sendFiles`. Typecheck passes; not run in a browser (3-tab flow 6 unchecked). Caveat: files sent right after `openChat` creates a new room may reach the other person only after they accept the invite, and late joiners don't get earlier files (T4.1), so drop on a member whose chat is already open for a reliable result.

---

## Wave 5: stage (PLAN §2.7, §6.8)

### [x] T5.1 Core: stage · `opus` · needs T3.1
- **files:** `core/src/stage.ts`, `lobby.ts`/`invites.ts` additions.
- **do:** `Stage` per §2.7 (multicast fanout 3, media plan mic/camera/screen). Presenter: `goLive(title)`, captures, `end()` → `stage.end` + close. Viewer: `watch(id)`, `streams` signal of the host's streams only, viewer count from members. Chat via `client.broadcast`. Lobby: `stage.announce` / `stage.end` / `stage.query` (sent once after lobby join; presenters answer by unicast) → `stages` signal; `list()` fallback for stages missed. Host leaving → treat as ended.
- **done when:** console: A goes live with camera, B and C watch and see it, a 5-tab test shows the tree relaying (C's stream comes via B when fanout is lowered to 1 for the test), A ends and all viewers get `stage.end`.
- Done: `core/src/stage.ts`. `goLive(title)` / `watch(id)` (null + toast on failure), `leaveStage()`, `currentStage` signal (one stage at a time). `Stage`: `messages()`, `captures()`, `streams()` (the presenter's streams by name), `viewers()`, `start/stop(name)` + `invite(uid)` (presenter), `send(text)`, `end()` (presenter: `stage.end` + close; viewer: leave). Lobby: `stage.announce` (with `viewers`, re-sent at most every 5 s), `stage.end`, `stage.query` once per lobby connection, `list()` fallback 2 s later → `stages` signal; a presenter gone from the lobby drops their stage. Viewer ends on host gone from members or on reconnect. Stage invites: `acceptInvite` watches instead of joining a room. Fanout for the relay test: `papchat.setStageFanout(1)` before going live. Presenting/watching doesn't set `busy`. Typecheck + build pass; not run in a browser.

### [x] T5.2 pc-stage-card · `sonnet` · needs T1.2, T1.4
- **props:** `stage` (`StageSummary`: id, title, presenter `Profile`, viewers, mine). Live badge, title, presenter avatar + name, viewer count, "Watch" button (or "You're live" when `mine`). **events:** `watch` `{ id }`.
- Done: `packages/molecules/stage-card`. `stage` is a property or JSON attribute; `watch` bubbles/composed and never fires for `stage.mine` (shows "You're live"). Build + typecheck pass; demo not viewed.

### [x] T5.3 Stage UI · `sonnet` · needs T5.2, T3.9
- **files:** `organisms/member-list` (fill the `live` slot area: "Live now" `pap-accordion` section of `pc-stage-card`s, hidden when empty), `organisms/room` (`viewer` mode: big presenter tile, no capture controls, chat tab only), `organisms/app-header` ("Go live" opens a small `pap-dialog` asking for a title; event `go-live` `{ title }`; shows "End broadcast" when `live`).
- Done: `pc-member-list` gets `stages: StageSummary[]` (property): a "Live now · n" `pap-accordion` of `pc-stage-card`s, hidden when empty; `watch { id }` bubbles out of the cards. `pc-app-header`: "Go live" opens a `pap-dialog` asking for a title and fires `go-live { title }`; while `live` the button reads "End broadcast" and fires new event `end-live` (the old "You are live" disabled state is gone). `pc-room` needed no change: `viewer` mode (stage only, controls limited to Leave + chat toggle, chat-only side panel) already existed from T3.9; T5.4 must pass the presenter as a single tile in `tiles` and set `viewer`. Added `@papit/accordion` to member-list (installed). Typecheck + build pass; not run in a browser.

### [x] T5.4 Wire wave 5 · `opus` · needs T5.1, T5.3
- **done when:** PLAN §6 flow 8 works with 4 tabs and a phone; the stage also shows in the room list with a Live badge.
- Done: in `views/github/main.ts`, `pc-room` shows either the open room or the current stage (page signal `stageView`). A new stage opens itself, picking a room hides it (it keeps running), and its Live row at the top of the room list brings it back (that row's Leave ends/leaves it). Header `go-live` → `goLive(title)` + mic + camera; `end-live` → `leaveStage()`; `live` = presenting. `pc-member-list` `stages` + `watch`. Presenter: own tiles, mic/camera/screen/devices/invite (→ `stage.invite`). Viewer: `viewer` mode, presenter camera+mic tile plus a pinned screen tile. Hang up ends (presenter) or leaves (viewer). Files dropped on a stage get a toast (`app.filesOnStage`). People/Files tabs are empty on a stage (core doesn't list viewers). Typecheck (`main.ts` via a scratch tsconfig, the package one only covers `src/`) + root build pass; not run in a browser (4-tab + phone flow 8 unchecked).

---

## Wave 6: polish (PLAN §6.9, §5, §10)

### [x] T6.1 pc-ringtone-picker · `sonnet` · needs T0.3
- **read:** `@papit/radio`.
- **props:** `tones` (`{ id, label }[]`), `value`, `volume` (0–1). Radio list, each with a ▶/■ preview button; volume slider (native `input[type=range]` styled with tokens). **events:** `change` `{ value }`, `volume` `{ volume }`, `preview` `{ id }`, `preview-stop`.
- Done. Component never plays audio: page handles `preview {id}`, plays it and sets `playing = id` (button becomes stop); `preview-stop` (no detail) means stop and clear `playing`. Extra prop `playing`. `tones` must be set as a property (array). Page also sets `value`/`volume` from events.

### [x] T6.2 pc-device-picker · `sonnet` · needs T0.3
- **read:** `@papit/menu`.
- **props:** `kind` (`audioinput|videoinput|audiooutput`), `devices` (`{ deviceId, label }[]`), `value`. Labelled `pap-menu` button acting as a select (`aria-haspopup="listbox"`), "Default" first. Hidden for `audiooutput` when `setSinkId` isn't supported (`supported` prop). **events:** `change` `{ value }`.
- Done: `value` is the deviceId, `""` = Default (change emits `""` for it); `supported` is property-only (default true, hides audiooutput when false); `devices` must be set as a property; a `deviceId: "default"` entry is dropped (our Default replaces it). Page passes lists already filtered by kind and handles `change`.

### [x] T6.3 pc-settings · `sonnet` · needs T6.1, T6.2, T1.8
- **read:** `@papit/dialog`, `@papit/tabs`, `@papit/switch`.
- **props:** `open`, `profile`, `prefs`, `tones`, `devices`, `language`. Dialog with tabs: Profile (name, colour, status), Sound (ringtone picker, volume, "auto-decline when busy" switch), Devices (3 device pickers + camera preview `pc-video` + mic `pc-level-meter`), Appearance (theme picker, language picker), Notifications (switch; asks permission via an event). Everything applies immediately (no Save button).
- **events:** `profile-change` `{ partial }`, `prefs-change` `{ partial }`, `language-change`, `request-notifications`, `preview-device` `{ kind }`, `close`.
- Done: `packages/organisms/settings`. `devices` is `{ audioinput, videoinput, audiooutput }`; extra props `playing`, `camerastream`, `micstream`, `sinkSupported`. `preview-device` `{ kind: "camera"|"mic" }` comes from explicit Test buttons, so the page starts the stream and sets the prop. `prefs-change` for devices carries the whole `devices` object. Ringtone `preview`/`preview-stop` pass through. Theme picker self-applies. Build + typecheck pass; demo not viewed.

### [x] T6.4 Wire settings and notifications · `opus` · needs T6.3, T3.1
- **files:** `core/src/notify.ts`, page.
- **do:** settings dialog wired to identity/prefs/devices/ringtone. `notify.ts`: `Notification` for incoming calls and messages while hidden (if permitted), title flashing while ringing and hidden. Auto `away` after 5 min hidden, restored on return (never overrides `dnd`/`busy`).
- Done: `core/src/notify.ts`: `startNotify()` (called at boot), `requestNotifications()`, `canNotify()`. Notifications for new calls and text messages only while hidden and permitted; title flashes `📞 Name` while ringing and hidden; auto `away` only from `available`, restored on return if still `away`. Page: settings opens from the header and the call controls' Devices button; device change restarts a running mic/camera capture; camera/mic tests stop on close. Typecheck + build pass; not run in a browser.

### [x] T6.5 Mobile layout pass · `sonnet` · needs T5.4
- Walk every view at 360 px and 768 px: drawer sidebar, room stage/tabs stacking, incoming call full-width, toasts. Fix within the affected components' `style.css` only.
- Done (by reading the CSS; no browser): `pc-app-header` at ≤32rem uses tighter gaps and "Go live" collapses to its icon (label wrapped in `span.label`, visually hidden); `pc-settings` camera preview shrinks to the dialog (`max-inline-size: 100%`) and the preview row wraps. Checked and left alone: drawer shell, `pc-room` splitter flips to stacked at 40rem, call-stage container queries, toaster centred under 800 px, invite-picker/onboarding/settings use `min(…, 80vw)`. One fix is outside my files, see Notes (incoming call width). Build + typecheck pass.

### [x] T6.6 Keyboard shortcuts · `sonnet` · needs T3.10
- **files:** page only. M / V / S toggle mic / camera / screen in the active call, `Escape` closes dialogs (check pap-dialog does it), ignored while typing in an input. Listed in the settings dialog (add a "Shortcuts" section via a prop).
- Done: `views/github/main.ts` has a document `keydown`: M / V / S toggle mic / camera / screen on the stage you present or the room you're in a call in (no modifiers, ignored while typing in input/textarea/select/contenteditable, while settings/picker/onboarding are open, and for S without screen-share support). Escape needed nothing: `pap-dialog` is a native modal, so it closes (and fires `close`) on its own; `pc-invite-picker` and the header dialog reset their own `open`. `pc-settings` got a `shortcuts: Shortcut[]` property (tab hidden when empty) which the page fills in `changeLanguage`; strings `app.shortcut*` and `pc-settings.shortcuts`. Typecheck + build pass; not run in a browser.

### [x] T6.7 Swedish · `haiku` · needs T6.3
- Add `asset/translations/sv.json` next to every `en.json` with the same keys. Natural Swedish, informal "du". Check the language switch changes every visible string live.
- Done: `asset/translations/sv.json` next to all 34 package `en.json` (informal "du"; same keys, checked by script; scaffold placeholder files copied as is), `meta` `{ region: "SE", language: "sv" }`. Page `LANGUAGES` is now `["en", "sv"]`; the flag svg already existed. Build + typecheck pass; the live switch isn't checked in a browser. Not translated: toast texts written in `@papchat/core` (e.g. "Couldn't start the stage", "That stage has ended", invite/ring toasts) are English strings in code, since core has no translator; moving them to the page would be a follow-up.

### [x] T6.8 README · `sonnet` · needs T5.4
- Root `README.md` per PLAN §6/§10: what papchat is, live link, screenshots (light and dark, call, stage), "How the WebRTC works here" (lobby/room/stage diagram from PLAN §2, the invite protocol table, why SDP still goes via the signal server), local dev, known limits, papit gaps (PLAN §9).
- Done: root `README.md` rewritten (features, how the WebRTC works with the lobby/room/stage diagram and invite table, why SDP still goes via the signal server, local dev + commands, layout, limits, papit gaps). Two things for the user: **no screenshots** (can't capture without a browser; there is an HTML comment placeholder under the feature list), and the live link `https://onkelhoy.github.io/papchat/` is assumed from the repo name and `--base /papchat/`, so check it after T0.6. Language list says no languages yet; add Swedish there once T6.7 lands.

### [ ] T6.9 Final live pass · `opus` · needs everything
- Every PLAN §6 flow on the deployed page with: 2 desktop browsers (Chrome + Firefox or Safari), 1 phone on mobile data. Fix what breaks, list what can't be fixed under known limits in the README.

---

## Wave 7: feedback from the first real use (2026-10-29)

Found while testing with real people (one on a phone, one non-technical). Phase A comes first: these are trust breakers. Phase B is cheap UI. Phase C is new features, roughly smallest first. `cause?` lines are guesses from reading the code; confirm before fixing.

### Phase A: bugs

### [x] T7.1 One conversation per person · `opus` · needs —
- **symptom:** chatting with someone opened 3 sidebar rows with the same name: my chat, their chat (we both clicked at once), and a third one for the call.
- **cause?:** `invites.ts` `openChat` only checks `directRoom(uid)`, so two people clicking at once create two rooms. `placeCall` always does `Room.create(kind)` and never reuses the direct room. `handleInvite` joins a chat invite even when a direct room with that sender already exists.
- **do:** (1) A call to someone you already have a 1:1 chat with happens **in that room**: start mic/camera there and ring over the lobby with the existing room id. A new room only when there's no direct room. (2) Simultaneous open: when a direct invite arrives from `uid` and we already have a direct room with them, keep the room with the smaller id (deterministic on both sides). The losing side moves to the winner, and its messages go into the winner's history (resend them as a one-time `merge` batch, or just show them locally above the winner's history). Then leave the loser. (3) Calls to someone with no chat yet create the direct room (kind `call`/`video`), so a later "chat" reuses it.
- **files:** `core/src/invites.ts`, `core/src/room.ts` (directs, adopt/merge), page if the sidebar needs a tweak.
- **done when:** in 2 tabs, click chat on both sides at once, then call, then mute both: one row per person the whole time.
- Done: invites carry `direct: true` for 1:1s. `placeCall` calls inside `directRoom(uid)`, or creates a **`chat`-kind** direct room (no more `call`/`video` rooms for 1:1s), and ringback ends on newcomers/`invite.accept` only, or when you hang up (captures gone). Callee rings for a call in a room it's already in. Two 1:1s with the same person: the smaller network id wins on both ends, the loser's text/system messages are `absorb`ed into the winner and it is left (file cards stay behind). `openChat` re-invites when the other left. Hang-up from the other side is handled by T7.2. Typecheck + build pass; not run in a browser.

### [x] T7.2 Muting everything ends the call (UI) · `opus` · needs —
- **symptom:** both peers muted, and the call disappeared from the room. Calling again brought it back unmuted. The sidebar then counted an extra conversation.
- **cause?:** `room.incall` is "has a capture or a remote stream" (`room.ts` `inAnyCall`). Muting stops the mic track, so with no camera both sides look like "not in a call".
- **do:** an explicit `inCall` signal on `Room`, set when you start or accept a call and cleared only by hanging up or by the room closing. Mute is `track.enabled = false` (or a muted flag sent to peers), not stopping the capture. Stage, call controls and the sidebar phone icon read `inCall`.
- **files:** `core/src/room.ts`, page wiring, `pc-room` / `pc-call-stage` if they test streams.
- **done when:** both sides mute mic and camera, and the stage stays with both tiles showing the muted icon.
- Done: `Room.oncall` signal (`incall` reads it): set by `joinCall()` (any successful `start()`, and accepting a call even if the mic is refused), cleared only by `hangUp()` (stops all captures) or the room closing. Mute still stops the capture (frees the device); it no longer ends the call. `MediaFlags` gained `call` (older peers: anything sent = in call). `othersInCall()` = flags.call of present people + stream senders; tiles and the member-list phone icon use it, so people in the chat but not the call get no tile. In a 1:1 the call ends for you when the other drops out (`call` flag true→false, or they leave). Page hangup in a chat room calls `room.hangUp()`. Typecheck + build pass; not run in a browser.

### [x] T7.3 Remote video sometimes black for one side · `opus` · needs —
- **symptom:** sometimes I can't see a peer's video while the other side can see theirs. Toggling the chat often (not always) brings it back, so the stream arrives but the local `<video>` doesn't show it.
- **cause?:** findings note T3.10 gap (2): `@papit/web-component` deep-compares `MediaStream`s as equal, so a new or renegotiated stream is not set on `pc-video`. Toggling chat re-renders the stage and sets it again. Also check `video.play()` rejections (autoplay) and `track.onunmute` (a track can arrive muted and unmute later without the element repainting).
- **do:** `pc-video` sets `srcObject` imperatively whenever stream **id or track set** changes (compare ids, not objects), listens to `addtrack`/`removetrack` on the stream and `unmute` on its tracks, and calls `play()` again (catch it, retry on the next user gesture). Add a `papit` finding for the MediaStream compare if it isn't written up yet.
- **files:** `atoms/video`, `molecules/video-tile`, maybe page stream hand-off.
- **done when:** 10 calls across 2 browsers with camera on/off/on and screen share on/off all show video on both sides without touching the chat toggle.
- Done: the guessed cause was wrong. The MediaStream compare is already fixed in `@papit/web-component` 0.0.13 (non-plain objects compare by identity). Real cause: `pc-video-tile` renders `<pc-video>` only while there is live video, and papit emits `stream-ended` on every remote track `mute` (camera off, or a short network hiccup). When video came back, the tile's `@query videoEl` still pointed at the removed `<pc-video>` (papit only re-queries empty queries), so the new one never got the stream. The chat toggle re-mounted the whole stage, which is why it "fixed" it. The tile now uses the cached child only while `isConnected` (video and level meter). Also: tile `<pc-video>` is always `muted` (remote audio plays in the stage's `<audio>`), so autoplay can't block a camera. Papit finding #12 written. Typecheck + build pass; not run in a browser.

### [x] T7.4 Stale presence and "can't reach" after a reload · `opus` · needs —
- **symptom:** people who closed the app stay "online" for a long time. After a reload, calling someone gave "Couldn't reach …" for a while, then fixed itself.
- **cause?:** presence only drops when the webrtc layer notices the peer is gone (slow on phones that are killed or put to sleep, since `pagehide` doesn't always fire). After a reload the person comes back with a new peer id while `peerOf(uid)` still points at the dead one until it times out.
- **do:** (1) A light heartbeat: every member already re-sends its profile on changes. Add `lastSeen` to members and have each peer broadcast a tiny `ping` every 30 s, only while the tab is visible or in a call (hidden tabs every 60 s). Mark `away`-like "stale" after 75 s and drop after 150 s. Not one message per pair, one lobby broadcast each. Don't let the host kick: everyone ages entries locally, which costs nothing extra. (2) On `join` of a uid that's already listed, the new peer id replaces the old one right away (`uidOf`/`peerOf` maps). (3) Send a best-effort `bye` on `pagehide` and on `visibilitychange` → hidden on phones when not in a call.
- **files:** `core/src/lobby.ts`, `core/src/config.ts` (timings).
- **done when:** closing a phone tab removes the person within ~2.5 min. Reload, then call right away: it rings.
- Done (papchat only, no papit change): `lobby.ts` broadcasts `here` every 30 s (60 s while hidden). Any message marks its sender heard; newcomers count as heard on arrival. Peers silent for 150 s drop out of `members`/`peerByUid` (they stay in `memberByPeer`, so a later message brings them back at once). After our own tab comes back to the front, nobody is dropped for 70 s (we may have been asleep too). The newest-peer-per-uid rule was already there. "Can't reach" after a reload: unicasts are remembered for 10 s per receiving peer, and an `unreachable` resends them up to 2× after 1.5 s to the uid's newest peer by then; the toast shows only when that fails. No `bye` message: `pagehide` already closes the client. Timings in `LIMITS`. Peers on an older build (no `here`) drop after 150 s until they send something. Typecheck + build pass; not run in a browser.

### [x] T7.5 Ringtone on phones · `opus` · needs —
- **symptom:** on mobile the ringtone often doesn't play. The "allow sound" prompt shows, and tapping it does nothing.
- **cause?:** `ringtone.ts` `unlock()` does `await context.resume()` **before** `silence.play()`. iOS Safari loses the user activation across the `await`, so the play is still blocked and the unlock silently fails, and then `setAudioBlocked(false)` hides the prompt anyway.
- **do:** in `unlock()`, start everything synchronously inside the gesture: `context.resume()` and `silence.play()` called without awaiting in between (await both afterwards). Only clear `audioBlocked` when the play actually resolved. Also unlock on the **first tap anywhere** (one-shot `pointerdown` listener at boot), so the prompt rarely shows. Prefer one shared `AudioContext` for ringtones (decode files with `decodeAudioData`) over `new Audio()`, since an unlocked context keeps working on iOS while each new `<audio>` needs its own gesture. Silent-mode switch on iPhone mutes Web Audio: note that under limits.
- **files:** `core/src/ringtone.ts`, page boot.
- **done when:** on an iPhone and an Android phone, after one tap anywhere, an incoming call rings (with the app in front).
- Done: `unlock()` now does everything inside the gesture before any `await` (context `resume()`, a 1-sample silent buffer started on the context, a silent `<audio>` play), and only clears `audioBlocked` when the context really runs. Files are decoded once (`decodeAudioData`) and play as buffer sources on the one shared context (no more `new Audio()` per ring, which iOS blocks without a fresh tap). `ringtone.ts` listens (capture, passive) for `pointerup`/`touchend`/`keydown` and unlocks on any tap while the context isn't running, so the first tap anywhere unlocks, and so does one after iOS suspends the context (phone call, background). Known limit for the README: the iPhone silent switch mutes Web Audio (Safari's `navigator.audioSession` could override it, but switching it while the mic is live risks the call). Typecheck + build pass; not run on a phone.

### [ ] T7.6 Stage can't share the screen · `opus` · needs —
- **symptom:** going live, sharing the screen didn't work.
- **cause?:** `stage.ts` `start("screen")` exists, so check the chain: is the button wired for stages (page `main.ts` ~505 handles keys, check the click path), does `getDisplayMedia` run inside the gesture (an `await` before it loses it in Safari/Firefox), and do viewers get a second video stream over the multicast relay (only the first video stream may be rendered).
- **do:** find which link breaks and fix it. Presenter can switch camera ↔ screen, or show both (screen big, camera small) when the tree allows two video streams.
- **files:** `core/src/stage.ts`, stage UI in the page/`pc-room`.
- **done when:** a presenter shares their screen and 2 viewers see it.
- **Open, needs a repro (2026-10-29):** traced by reading and no break found: the presenter's screen button is wired (synchronous `toggle` → `toggleCapture` → `stage.start("screen")`), `getDisplayMedia` runs inside the gesture, `STAGE_PLAN` has `screen`, papit's multicast relays every name alike, and viewers get a pinned screen tile. On phones the button is hidden (no `getDisplayMedia`), which is expected. Done meanwhile: screen capture asks ~15 fps, and `screenHint()` sets `contentHint = "detail"` (rooms and stages). Next step: the user reproduces with `papchat.setLogging(true)` in the console (presenter and a viewer), noting browser, whether the picker opened, and whether the presenter's own screen tile showed. Then fix the link that breaks.

### [x] T7.7 Sharp white edge on the stage when chat is open · `sonnet` · needs —
- **symptom:** a light, hard 1-px edge around the call stage/room panel while the chat panel is open (screenshot 2026-10-29 21.04.06, right and bottom edges).
- **do:** find the border (likely the splitter or `pc-room`'s panel container using a light token or `outline`), use the theme's subtle border token and the same radius as the rest. Check light and dark.
- **files:** `organisms/room` or `organisms/call-stage` `style.css`.
- Done: the edge was `pap-splitter`'s own host border (`--background-inverse` at 70%, near-white in dark mode). The splitter is only used when the chat panel is open in a call. `pc-room` sets `border: none` on it and draws a 1 px subtle divider on `::part(separator)` (same colour as the header border). Papit note added to the findings. Build passes; not checked by eye.

### [ ] T7.8 Phase A live check · `opus` · needs T7.1-T7.7
- Re-run the scenarios above on 2 desktops + 1 phone. Write anything still broken under Notes.

### Phase B: UI cleanup

### [x] T7.9 Collapsed sidebar · `sonnet` · needs —
- **symptom:** collapsed, the sidebar shows clipped text ("ONLII", "Searc", half avatars, "…" menus). Screenshot 2026-10-29 20.49.43.
- **do:** the collapsed rail shows only: toggle, your avatar, then one centred avatar per conversation (unread badge on the avatar, phone icon as a corner dot), then online people as avatars. Hide headings, search, names and "…" menus (the menu goes to right-click/long-press or the tooltip). Every avatar has a tooltip with the name. Rail width fits the avatar plus `--space-2` on each side.
- **files:** `templates/app-shell`, `organisms/room-list`, `organisms/member-list`, `molecules/member-item` (each gets a `compact` attribute).
- Done: `compact` (reflected) on `pc-room-list`, `pc-member-list` (passes it to its items) and `pc-member-item`. Room rows show one centred avatar (a name-initial avatar when nobody else is in the room, in both modes), the title as a native tooltip, the unread badge top-right and the phone icon bottom-right; ⋯ and the Live badge are hidden. The member list hides the heading, search, Live section and empty text. Member rows show the avatar with presence and a tooltip (name, status); the ⋯ menu still opens on right-click. App-shell narrows the collapsed rail's gutter to `--space-2` (`::part(nav|header)`). The page sets `compact = !shell.sidebaropen` on load and on `sidebar-toggle`. READMEs updated. Typecheck + build pass; not checked by eye, and the demo pages have no compact example yet.

### [x] T7.10 Header cleanup · `sonnet` · needs —
- **do:** remove the language flag from the header and put a language select in the settings dialog (General tab). Header keeps: connection status, network name, Go live, theme toggle, avatar. Make the theme toggle a single icon button that cycles light → dark → system, showing the sun/moon of what's **currently applied** (system shows the resolved one, with a small "auto" marker). Tooltip says the mode.
- **files:** `organisms/app-header`, `organisms/settings`, page.
- **papit:** write the "system mode should show the applied light/dark icon" request in `PAPCHAT-FINDINGS.md` (T7.12).
- Done: the header's language picker, `language` property and `language-change` event are gone (settings already had a language select; the page no longer wires the header for it). The theme is one icon button: it cycles light → dark → system, shows the sun or moon of the theme in effect (system resolves via `prefers-color-scheme`, live) with a small "A" mark, and has a tooltip and aria-label ("Automatic theme (Dark theme)"). A hidden `pap-theme-picker storage="local"` still applies and stores the choice, so the settings picker stays in sync through the `data-theme` it observes. en + sv strings. `@papchat/language-picker` stays in the header's `package.json` (removing it would desync the lockfile without `npm install`). Build + typecheck pass; not checked by eye.

### [x] T7.11 Onboarding without the network picker · `sonnet` · needs —
- **why:** onboarding's dialog has "Continue" and the network picker has its own "Join" buttons. Two primary actions confused a first-time user.
- **do:** onboarding asks only name (+ avatar colour) and joins the public lobby. Networks stay in settings. A share link (T7.17) that carries a network skips the choice entirely: onboarding then says "You're joining **<network>**".
- **files:** `organisms/onboarding`, page.
- Done: onboarding is name, colour and language only, with one "Continue". The `network`/`networks` properties, the picker and `networks-refresh` are gone; the page no longer loads networks for it. New `joining: { name, password } | null` property (for T7.17): when set, it shows "You're joining **name**" and `submit.network` carries it; otherwise `network` is null (public lobby). `@papchat/network-picker` stays in the package.json (lockfile). en + sv. Build + typecheck pass; not checked by eye.

### [x] T7.12 Papit findings · `opus` · needs —
- Add to `/Users/henry/Developer/projects/papit/PAPCHAT-FINDINGS.md` (same format: file, repro, cause, fix, papchat workaround):
  - **`@papit/icon`: icons sometimes don't render.** Investigate first: is the spritesheet fetched once per icon and racing? Is a `<use href>` in shadow DOM set before the sprite loads? Does it fail after a re-render that changes `name`? Is it the `/icons/` base under `--base /papchat/`? Get a repro, then write it up.
  - **`@papit/theme` toggle: "system" should show the applied mode** (sun or moon) while still being selectable, instead of a third generic icon.
  - ~~The `MediaStream` compare~~: already fixed in web-component 0.0.13. T7.3 wrote finding #12 (`@query` keeps a removed element) instead.
- Done: finding #13 (`@papit/icon`): `after` awaits the fetch but the decorator's `requestUpdate()` (50 ms debounce) doesn't wait for it, so a slow fetch leaves `render()` without `assignedName` for good. Also no shared in-flight fetch (every icon fetches the spritesheet), and a disconnect aborts the fetch with no retry on reconnect. Finding #14: theme-picker "system" should show the theme in effect. Workaround in the page (`preloadIcons()` in `main.ts`): fetch the spritesheet + sun/moon/computer once, fill `Icon.icons` (reached via `customElements.get("pap-icon")`, no new dependency) with the same markup pap-icon stores, then re-set `name` on every `pap-icon` (through shadow roots) that has no `<svg>`. Build + typecheck pass; not checked in a browser.

### Phase C: features

### [x] T7.13 Buzz · `sonnet` · needs —
- A "Buzz" button in the 1:1 conversation header (and `/buzz`). The receiver's window shakes (CSS animation on the app shell, `prefers-reduced-motion` gets a flash instead), a buzz sound plays, and a "Henry buzzed you" line shows in the chat. Rate-limit: one every 10 s per sender, enforced on both sides. Plays even when the tab is hidden (notification + title flash via `notify.ts`).
- **files:** `core/src/room.ts` (message type), `core/src/notify.ts`, `organisms/conversation`, `templates/app-shell` style, page.
- Done: `Room.buzz()` broadcasts `buzz`, adds "You buzzed X" (or "You buzzed everyone" in a group), and returns false within `LIMITS.buzzGapMs` (10 s; `room.buzzWait` gives the ms left). The receiver ignores a sender's buzzes within 10 s, adds "X buzzed you", bumps unread when it's not the open room, and sets the `buzzed` signal (state.ts). `notify.ts` shows a Notification while hidden (no title flash: a buzz is one moment). `ringtone.buzz()` plays the optional `/audio/sound/buzz.mp3`, or a low two-tone rattle synth like `ping`, without interrupting a ring. UI: `pc-room` got `canbuzz` + a Buzz header button (`volume` icon) firing `buzz`; the page sets it for 1:1s only, `/buzz` in the composer buzzes too, a too-soon buzz toasts the wait. An incoming buzz shakes `pc-app-shell` with the Web Animations API (a brightness flash with `prefers-reduced-motion`), so no app-shell CSS change. Buzz only works outside calls (the room header is hidden in a call). en + sv. Typecheck + build pass; not run in a browser.

### [x] T7.14 More ringtones and a dial tone · `sonnet` · needs — (user adds the audio files)
- **do:** the user drops files in `asset/audio/ringtones/` and `asset/audio/dialtones/`. Both get a `*.json` manifest (`{ id, name, file }`). Settings gets a "Dial tone" picker next to the ringtone one (`pc-ringtone-picker` reused). `ringback()` plays the chosen file and falls back to the current synth when there's none or it fails to load.
- **files:** `core/src/ringtone.ts`, `organisms/settings`, page, `asset/audio/README.md`.
- **Files added by the user (2026-10-29):** `ringtones/Adventure Pulse.mp3` and `dialtones/Ringback Tone.mp3`. Rename them without spaces first (papit finding #11: the static fetch shim misses paths with spaces), e.g. `adventure-pulse.mp3`, `ringback.mp3`, and add them to the manifests. Playback is Web Audio now (T7.5): decode with `bufferOf()`.
- Done: renamed to `ringtones/adventure-pulse.mp3` (added to `ringtones.json` as "Adventure Pulse") and `dialtones/ringback-tone.mp3` (new `dialtones/dialtones.json`, "Ringback Tone"). Core: `Prefs.dialtone` ("" = first file), `loadDialtones()` / `dialtones` signal, `SYNTH_DIAL = "classic"` for the built-in beep, `ringback()` plays the chosen file, else the first one, else the synth; `previewDial(id)`. The old `/audio/ringback.mp3` path is gone. `pc-ringtone-picker` got `novolume` and `label`. `pc-settings` Sound tab: "Ringtone" picker (with volume) and a "Dial tone" picker (no volume), `dialtones` property, its preview renamed to `preview-dial`. The page lists the dial files plus "Classic beep" (that label doesn't re-translate on a live language switch until reload). en + sv. READMEs updated. Typecheck + build pass; not played in a browser.

### [ ] T7.15 Better audio · `opus` · needs —
- **step 1 (cheap, do first):** `devices.ts` already asks for `echoCancellation`/`noiseSuppression`. Add `autoGainControl: true`, `channelCount: 1`, `sampleRate: 48000`. Then compare with Teams again. Check the Opus settings in the SDP (`useinbandfec=1`, `maxaveragebitrate` ~ 40000, `usedtx` off). If `@papit/webrtc` has no SDP hook, write a papit finding asking for one. Check that `source.clone()` doesn't drop constraints.
- **step 2:** RNNoise noise suppression as a setting ("Noise reduction: off / standard / strong"). Run the mic through an `AudioWorklet` with RNNoise compiled to WASM, and send the processed track. Recommended: use `@sapphi-red/web-noise-suppressor` (MIT, RNNoise + Speex as WASM worklets, ~150 kB, lazy-loaded only when turned on). Alternative if you want the Rust showcase: `nnnoiseless` (Rust RNNoise port) → `wasm-pack` → our own worklet. Same result, more work.
- **files:** `core/src/devices.ts`, `core/src/room.ts` (+ stage) capture path, `organisms/settings`.
- **done when:** the same mic and room sounds clearly better in an A/B recording (fan or keyboard in the background).

### Rich composer (T7.16a-d)
Modelled on Teams (user screenshots 2026-10-29 20.41.26 / .45 / .52):
- **Collapsed** (default): one-line box, placeholder "Type a message". Icons on the right: **format** ("A + pen"), **emoji/GIF** (smiley), **attach** (our existing one), a thin divider, **send** (ours). Leave out Teams' Loop and "+" buttons.
- **Expanded** (format button pressed, it turns `--primary`): a toolbar row on top of a taller editor. The groups are split by thin dividers: **B I U S** | bulleted list, numbered list | quote, link, code | "…" overflow. The trash icon at the far right clears the draft. The bottom-right icon row stays. The focused box gets a `--primary` bottom border. Leave out Teams' highlight, font colour and font size.
- **Emoji/GIF popover** (smiley): tabs **All / Emoji / GIFs**, no Stickers. A search field "Find something fun" on top. "All" shows an Emoji row (recently used first) and a GIF row (trending), each with "See all ›" that switches tab. Footer "GIFs powered by GIPHY" + "View Terms" link (GIPHY requires the attribution).
- Keyboard: Ctrl/Cmd+B/I/U, Enter sends, Shift+Enter new line, Escape closes the popover. Built so it can later move into a `@papit/rich-input` component.

### [ ] T7.16a Message format + safe rendering · `opus` · needs —
- Messages carry `text` with a small markdown subset (`**b**`, `*i*`, `__u__`, `~~s~~`, `` `code` ``, fenced code, `> quote`, `-`/`1.` lists, `[label](url)`), so old clients still read plain text. `pc-message` renders it by **building DOM nodes from a parser** (never `innerHTML` of user text). Links: only `http(s):`, `rel="noopener noreferrer" target="_blank"`. Old plain messages render unchanged.
- **files:** `molecules/message` (+ a small `format.ts` parser, shared later by the editor).

### [ ] T7.16b Editor + toolbar · `sonnet` · needs T7.16a
- `pc-composer` collapsed/expanded as above. Editor: start with a `textarea` where the toolbar wraps the selection in the markdown marks, plus a live preview above it in expanded mode. Move to `contenteditable` only if that feels wrong in use. Paste is plain text. Icons: add `format`, `bold`, `italic`, `underline`, `strike`, `list-bullet`, `list-number`, `quote`, `link`, `code`, `smiley`, `trash` to the spritesheet (`npm run icons` in the theme package).
- **files:** `molecules/composer`, theme icons, translations (en + sv).

### [ ] T7.16c Emoji picker · `sonnet` · needs T7.16b
- New `molecules/emoji-picker` (`pc-emoji-picker`): native Unicode emoji only, grouped by category, search by name. Data from `unicode-emoji-json` (or similar), lazy-loaded the first time the popover opens. Recently used list kept in prefs. Inserts at the cursor. Bonus: `:smi` autocomplete in the editor. The popover shell (tabs All/Emoji/GIFs + search) lives in the composer so T7.16d only adds the GIF tab.
- **files:** `molecules/emoji-picker` (new package, follow the component anatomy above), `molecules/composer`.

### [ ] T7.16d GIFs (GIPHY) · `sonnet` · needs T7.16c
- New `molecules/gif-picker` (`pc-gif-picker`): trending on open, search debounced 300 ms, grid of `fixed_width` WebP/MP4 previews (lazy, `loading="lazy"`). Tap sends a `gif` message `{ id, url, width, height, title }`, shown inline in `pc-message` straight from GIPHY's CDN (no re-upload), with `title` as alt text. Use `rating=pg-13` (or `g`).
- **API key:** read from `GIPHY_KEY` injected at build (see Notes "GIPHY key"). No key → the GIFs tab is hidden, nothing breaks. The key is never in git.
- Core stays dumb about GIPHY: the page does the fetch and gives the picker results. Components never fetch.
- **files:** `molecules/gif-picker` (new), `molecules/message` (gif kind), `core/src/room.ts` (message kind), page, `.github/workflows/pages.yml` (env).

### [ ] T7.17 Share links · `opus` · needs T7.11
- **do:** "Copy invite link" in the network settings and in a call's "…" menu. The link is `…/papchat/#join=<network>&key=<password>` for a network, or `#call=<room>&key=…` for a call. Put it in the **hash**, so it never reaches a server or logs. Opening it: onboarding if new, else join right away (network switch asks for confirmation if you're in a call). A call link rings nobody. You join the room and the people in it get a "Henry joined" toast. Optional expiry (`&exp=<unix>`) checked on the client. Make clear in the UI that anyone with the link can join.
- **files:** `core` (parse + join), page boot, `organisms/settings`, `molecules/call-controls` menu.

### [ ] T7.18 Wave 7 live check + README · `opus` · needs T7.9-T7.17
- Phone + 2 desktops. Update README features/limits (iPhone silent switch, GIF provider, share-link trust model).

---

## Notes
<!-- Cross-task issues, changes needed outside a task's files, decisions. Newest first. -->
- **GIPHY key value (user OK'd committing it, 2026-10-29):** `c3UrFheIWGdoGysWX6NHR8DceD5pEc8W`. T7.16d can put it straight in `core/src/config.ts` instead of the build-secret setup below.
- **GIPHY key (2026-10-29):** the user has a GIPHY key. GitHub Pages is static, so **any key the browser uses is visible in the shipped JS**. A GitHub secret only keeps it out of the repo. That's the normal model for GIPHY's browser keys, so it's acceptable. Setup: repo Settings → Secrets and variables → Actions → `GIPHY_KEY`. `pages.yml` passes `env: GIPHY_KEY: ${{ secrets.GIPHY_KEY }}` to the build, and the build writes it into a generated `config` module (git-ignored), which T7.16d defines. Locally: `GIPHY_KEY=… npm start` or a git-ignored `.env`. If abuse ever matters, put a tiny proxy on the signal server (render.com) that adds the key server-side, and the browser never sees it. GIPHY beta keys are rate-limited, so apply for a production key before sharing the app widely.
- Don't run `npm run pages` / `npx @papit/static` locally until understood: a run ended with ~31 `node_modules/@papit/*` packages as symlinks into `packages/pages/app/dist/lib/@papit/` (deleting `dist` then broke them; fix was `npm install`). Cause not pinned down (static's source only copies with `cpSync`; the build step or an earlier run may be what linked them). CI is fine.
- All `en.json` use `"language": "en"` (static names the merged file after it; `en-UK` produced `en-UK.json`).
- T1.1 papit gap: after a socket reconnect, `Client` keeps its old `id`/router `me`, so every later message to the server carries the stale sender and the signal server rejects it as `spoof`. `leave()` + rejoin on the same Client can't work, so the lobby closes the client and builds a new one. Fix upstream: adopt the new id on reconnect (or expose a `rejoin()`).
- T0.5: `@papit/static` (via `meta()` in `@papit/server`) skips assets of `papit.type: "theme"` packages, so `packages/foundations/theme/asset/icons/spritesheet.svg` never reaches `dist/public/icons/`. Fix needed outside T0.5 (e.g. change `@papchat/theme` papit type to `browser`/`web-component`-style, or copy the spritesheet into `pages/app/asset/icons/`). Needed before any icon works on the deployed page. **Resolved:** spritesheet moved to `packages/pages/app/asset/icons/`, theme's `npm run icons` writes there.
- Root has `npm run signal` (local signal server on :3000) and `npm run pages` (build + static site).
- Scaffolded `tests/` folders stay and are ignored (T0.2).
- T3.1: `ringtones.json` lists `beep-boom` (default pref) and `quack`. Optional `ringback.mp3` / `message.mp3` also missing (synth fallback used).
- T3.10 papit gaps: (1) `@papit/web-component`'s property deep-compare throws on `null` inside objects (`Object.keys(null)`), so never pass `null` for streams or in tile objects, use `undefined`. (2) It also calls any two `MediaStream`s equal (no own keys), so swapping one stream for another of the same shape is not seen; `hasChanged` can't force it (it only vetoes, the deep compare still runs). (3) The dev server (`npx @papit/server`) import map leaves out transitive deps (`@papit/treeview`, `@papit/popover`, …), so `localhost:3001/views/github/` fails to load; fine in the static build.
- **T6.5, incoming calls on phones:** `views/github/style.css` `.incoming` says "full width on phones" but has no rule for it, so the card is only as wide as its content. Add `@media (max-width: 799.98px) { .incoming { left: var(--space-4); } }` (it already has `right`) so `pc-incoming-call` fills the width up to its 22rem max.
