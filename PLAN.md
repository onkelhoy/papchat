# papchat: build plan

A Teams-style chat, call and broadcast app that runs entirely peer to peer on `@papit/webrtc`, built from `@papit/*` web components in atomic layers, and published to GitHub Pages with `@papit/static`. It's the showcase for the papit ecosystem, and **webrtc is the star**.

No tests in this project. Code, a README and a live page are what count.

---

## 1. Goals and non-goals

**Goals**
- Open the page, say who you are once, and you're auto-connected to the shared **papchat lobby** (chord). Refreshing reconnects without any prompt.
- The sidebar lists everyone online, with presence.
- Chat or call anyone: a private **room** (mesh) is created for it, and the invite/ring goes over the lobby.
- In a room: chat, mic, camera, screen share, file share (drag and drop), and invite more people. Anyone in the room can invite.
- **Stage** (broadcast): one presenter, many viewers, over the multicast tree. Announced in the lobby, anyone can join.
- Ringtone picker, language picker, dark/light/system theme, device picker. Everything about "me" is remembered in `localStorage`.
- Every UI piece is a web component, reusing papit's design system wherever one fits.

**Non-goals (v1)**
- Message history across sessions (rooms are ephemeral; when the last person leaves, the room is gone).
- TURN relay (STUN only, so some strict NATs won't connect; listed under limits).
- Accounts or auth. Peers trust each other, like the webrtc package does.
- Tests, npm publishing.

---

## 2. Network architecture

One `Client` is one network, so papchat runs **one lobby client plus one client per open room or stage**. Each holds its own socket to the signal server.

```
                   signal server (render.com)
                  ▲     ▲          ▲
        ┌─────────┘     │          └──────────┐
  Lobby client      Room client(s)       Stage client(s)
  "papchat"         "papchat:room:<id>"  "papchat:stage:<id>"
  chord, public     mesh, private+pwd    multicast fanout 3, public
  presence,         chat, files,         presenter's camera/screen/mic
  invites, ringing  mic/cam/screen       relayed down the tree, chat
```

### 2.1 Signal server
Already deployed: `wss://render-webrtc-signal-server.onrender.com` (the `../signal` repo). Reuse it. Free tier sleeps: the client's `wake` + `status: "waking"` covers that, so the UI must show a friendly "waking up the server…" state.

Config (`core/config.ts`):
- default `wss://render-webrtc-signal-server.onrender.com`
- `localhost` / `127.0.0.1` page → `ws://localhost:3000`
- `?signal=<url>` query param overrides (stored in `papchat:debug`)
- `rtc: { iceServers: [{ urls: "stun:stun.l.google.com:19302" }] }`

### 2.2 Lobby: find or create, automatically
Lobby network: `name: "papchat"`, `topology: "chord"`, public, `meta: { app: "papchat", kind: "lobby", v: 1, created: Date.now() }`.

On boot (only once a profile exists):
1. `await client.ready`, then `client.list()`; keep networks where `meta.app === "papchat" && meta.kind === "lobby"`.
2. One or more → **join the canonical one**: smallest `meta.created`, tie broken by smallest `id`.
3. None → `create(...)`. You're the host.
4. **Race guard**: two people arriving at the same moment both create. After creating, wait ~2 s and `list()` once more. If a more canonical lobby exists, `leave()` and join it. Deterministic, so both sides converge on the same one.
5. Join fails (stale lobby, timeout, `network.reject`) → retry once from step 1, then create.

Host leaves → the server promotes the next member (`signal.host`), so the lobby lives as long as anyone is in it. Last one out → it disappears, and the next visitor creates it again. That's the "always open one if none exists" behaviour.

**Reconnect**: a socket reconnect gives a new peer id and loses the server fallback (`error` with type `reconnect`). On that error: `leave()` and rerun the boot flow. Same for rooms: rejoin with the stored room id and password if the room is still open.

Note: the server counts a message *to the server* sooner than 200 ms after the previous one as a strike (3 strikes closes the socket). Never poll `list()` in a loop; space retries ≥ 1 s.

### 2.3 Identity and presence
Peer ids change on every connect, so identity is a stable `uid` (`crypto.randomUUID()`, stored once). The profile (≤ 1 KB JSON) is set via the `profile` option and `setProfile()`:

```ts
type Profile = { uid: string; name: string; color: string; status: "available" | "busy" | "away" | "dnd"; v: 1 };
```

- Members sidebar = `members` event (`{ members, profiles }`), minus yourself.
- `busy` is set automatically while you're in a call; `away` on `visibilitychange` hidden for > 5 min (optional).
- `dnd` auto-declines invites with reason `dnd`.
- Two tabs with the same `uid` both show up. Dedupe in the UI by `uid`, showing the newest peer.

### 2.4 Lobby protocol (app messages over chord)
Unicast with `client.send(peer, type, payload)`: chord routes it in O(log n) hops, and falls back to the server for your own unicasts. Broadcast with `client.broadcast`.

| Type | To | Payload | Meaning |
| --- | --- | --- | --- |
| `invite` | peer | `{ room, password, kind: "chat" \| "call" \| "video", title, from: uid, members: uid[] }` | Join this room. A call/video invite rings. |
| `invite.cancel` | peer | `{ room }` | Caller hung up before an answer: stop ringing. |
| `invite.accept` | peer | `{ room }` | Callee is joining (UI feedback only, the actual join goes to the server). |
| `invite.decline` | peer | `{ room, reason: "declined" \| "busy" \| "dnd" \| "timeout" }` | Show "X declined / is busy". |
| `stage.announce` | broadcast | `{ stage, title, presenter: uid }` | A broadcast has started. |
| `stage.end` | broadcast | `{ stage }` | It ended. |
| `stage.query` | broadcast | `{}` | Sent once after joining the lobby; live presenters reply with `stage.announce` unicast. |

Stages are also public networks with `meta.kind === "stage"`, so `list()` finds them as a fallback.

On `unreachable` for an `invite`, show "couldn't reach X".

> **About "the handshake goes through chord".** The *call* handshake (invite, ring, accept, decline, cancel) goes through the chord lobby. The *WebRTC* handshake (SDP offers/answers and ICE for the room's links) still goes through the signal server, because `Client.join` negotiates there and there's currently no way to give a `Client` a custom signalling transport. Moving SDP over the lobby would be a papit change (see §9). The plan works without it.

### 2.5 Rooms (chat and calls, mesh)
- Created by whoever starts the chat/call: `name: "papchat:room:<uuid>"`, `topology: "mesh"`, `private: true`, `password: <random 16-byte base64url>`, `meta: { app: "papchat", kind: "room", title }`.
- `accept: (n, info) => info.size < 8`: a mesh above ~8 people hurts video. Show "room is full" on `network.reject`.
- The invite carries `room` id and `password`. Accepting → new `Client`, `join(room, password)`.
- Anyone inside invites others: the same `invite` message, sent over **their lobby client** to the chosen member.
- Starting a 1:1 chat with someone you already have a 1:1 room with reuses that room. Map `uid → roomId` in memory.
- Media plan, fixed at create (no mid-session plan changes needed):

```ts
const ROOM_PLAN = {
    channels: {
        file:  { ordered: true },                         // binary file chunks
        state: { ordered: false, maxRetransmits: 0 },     // typing, speaking, mute flags
    },
    streams: {
        mic:    { kind: "audio" },
        camera: { kind: "video" },
        screen: { kind: "video" },                        // getDisplayMedia because of the name
    },
};
```

- **Chat** messages go over `client.broadcast("chat", { id, text, at, uid })`, the system channel with peer-message framing. Channels are only for files and ephemeral state.
- Call `media.channel("file")` and `media.channel("state")` **right after create/join**: messages that arrive before the first `channel(label)` call are dropped.
- Nothing is captured until the user presses mic/cam/screen (lazy slots: no permission prompt on join). A "call" invite auto-starts mic on accept; "video" also starts camera.
- `stream` / `stream-ended` → video tiles. `capture` / `capture-ended` → own tile and control state (screen share stopped from the browser bar ends by itself).
- Leaving: `client.close()`, stop all captures. Last one out, the room is gone.

### 2.6 File transfer (room `file` channel)
1. Sender: `client.broadcast("file.offer", { fid, name, size, type, uid })` (for a 1:1 room, same thing).
2. Chunks over `media.channel("file").broadcast(frame)`: `frame = [16-byte fid][u32 seq][≤ 16 KiB data]`, last chunk flagged by `seq === total - 1`.
3. Receiver assembles into a `Blob`, then shows a file card with progress, download link (`URL.createObjectURL`), and inline preview for images, video and audio.
4. Pacing: `Channel` doesn't expose `bufferedAmount` (see §9), so send in batches of ~64 chunks and `await` a short timeout between batches. Cap files at 100 MB in v1.
5. Late joiners don't get earlier files. Cancel = `file.cancel { fid }`.

### 2.7 Stage (broadcast, multicast)
- Presenter creates `name: "papchat:stage:<uuid>"`, `topology: { name: "multicast", fanout: 3 }`, public, `meta: { app: "papchat", kind: "stage", title, presenter: uid }`, `media: { streams: { mic: audio, camera: video, screen: video } }`.
- Then `stage.announce` over the lobby. The lobby UI gets a "Live" section; anyone clicks "Watch" to join.
- Only the host's captures reach everyone (the tree is rooted at the host), so viewers get a viewer-only UI: no capture controls. Chat works for everyone via `client.broadcast` (it goes up and down the tree).
- Presenter can invite specific people too (same `invite` with `kind: "stage"`).
- Presenter leaves → `stage.end` and `close()`. Host handover in multicast would make someone else the root, so the stage just ends.

### 2.8 Ringing
- Incoming `invite` with kind `call`/`video`/`stage` → incoming-call dialog plus ringtone loop. Auto-decline with `timeout` after 30 s. `busy` if already in a call and "auto-decline when busy" is on, else show it as a second incoming call.
- Outgoing: ringback tone until the first `invite.accept` or a peer link in the room, then stop. Cancel → `invite.cancel` to everyone still ringing.
- **Autoplay**: audio needs a user gesture first. A fresh visit gets one from the onboarding dialog; after a refresh-and-autoconnect it may not. If `audio.play()` rejects, show a small "click to enable sound" banner, and also flash the tab title and fire a `Notification` (permission asked in settings).

---

## 3. Repo layout (atomic)

Mirror papit's own design-system layering. HTML prefix: **`pc`** (`pc-avatar`, …). Set `"papit": { "htmlprefix": "pc" }` in the root `package.json`. All packages are `@papchat/*`, private.

```
packages/
  foundations/
    theme/            @papchat/theme       papit theme + papchat brand tokens (type theme)
    core/             @papchat/core        non-UI: config, storage, identity, lobby, rooms, stage,
                                           invites, file transfer, ringtone player, devices, state (signals)
  atoms/              avatar, badge, presence, time, level-meter, progress, video, kbd(optional)
  molecules/          member-item, message, composer, file-card, call-controls, video-tile,
                      incoming-call, toast, language-picker, ringtone-picker, device-picker,
                      connection-status, stage-card
  organisms/          member-list, conversation, call-stage, room, room-list, settings,
                      onboarding, invite-picker, app-header, toaster
  templates/          app-shell
  pages/
    app/              @papchat/app  the page: views/github/index.html + src/main.ts,
                                    ringtones and translations in asset/
```

Rule: **components are dumb** (properties in, events out). Only `@papchat/core` touches `@papit/webrtc`, and only `pages/app` wires core to components. That keeps the atomic layers clean and makes the network code readable on its own, which is the point of the showcase.

### 3.1 `@papchat/core` modules
| Module | Responsibility |
| --- | --- |
| `config.ts` | signal URL resolution, ICE servers, limits (room size, file cap, ring timeout) |
| `storage.ts` | typed, versioned `localStorage` wrapper (`papchat:profile`, `papchat:prefs`, `papchat:debug`), try/catch everywhere |
| `state.ts` | `@papit/signals`: `me`, `lobbyStatus`, `members`, `rooms`, `activeRoom`, `stages`, `incoming`, `toasts` |
| `lobby.ts` | §2.2 to §2.4: boot, election, reconnect, presence, invite routing, stage announcements |
| `room.ts` | `Room` class wrapping one `Client`: chat, typing, captures, remote streams, files, invite, leave |
| `stage.ts` | `Stage` class: presenter and viewer modes over multicast |
| `transfer.ts` | chunking, framing, reassembly, progress events |
| `ringtone.ts` | preload, play/loop/stop, preview, volume, autoplay fallback |
| `devices.ts` | `enumerateDevices`, chosen mic/cam/speaker (`setSinkId` where supported), passes constraints to `media.start(name, constraints)` |
| `notify.ts` | `Notification` + title flashing while hidden |

### 3.2 localStorage
```ts
"papchat:profile" → { v: 1, uid, name, color, status }
"papchat:prefs"   → { v: 1, ringtone: "classic", volume: 0.8, language: "en", autoDeclineBusy: false,
                      notifications: false, devices: { mic?, camera?, speaker? }, sidebarOpen: true }
"papchat:debug"   → { signal?: string, log?: boolean }
// theme: pap-theme-picker storage="local" stores its own key
```
No profile → onboarding dialog. Profile present → auto-connect immediately.

---

## 4. Component inventory

### 4.1 Reused from papit (dependencies of the packages that use them)
| papit package | Used for |
| --- | --- |
| `@papit/theme` | all tokens, light/dark via `light-dark()`, view-transition theme reveal |
| `@papit/theme-picker` | header theme switch, `storage="local"` |
| `@papit/button` | every button |
| `@papit/icon` | icons from a papchat spritesheet (build it with `@papit/svg-spritesheet`), and **country flags** in the language picker |
| `@papit/input` | name field, composer text, member search, stage title |
| `@papit/field` | base for any custom form field (e.g. ringtone picker if form-associated) |
| `@papit/group` | roving focus for call controls, member list, message list |
| `@papit/tooltip` | control hints ("Mute (M)") |
| `@papit/menu` | member actions (Chat / Call / Video / Invite to room), language menu, device menus |
| `@papit/popover` / `@papit/placement` | emoji/quick reactions (optional), status picker |
| `@papit/dialog` | onboarding, settings, incoming call, invite picker |
| `@papit/drawer` | member list on mobile, room info panel |
| `@papit/sidebar` | members sidebar on desktop |
| `@papit/tabs` | room panel (Chat / Files / People), settings sections |
| `@papit/splitter` | call stage ↔ chat split in a room |
| `@papit/switch` | settings toggles (notifications, auto-decline, mirror camera) |
| `@papit/radio` | ringtone list, status picker |
| `@papit/checkbox` | invite picker multi-select |
| `@papit/file-input` | attach button and drop zone in the composer, with its progress |
| `@papit/accordion` | settings sections on mobile, "Live now" section |
| `@papit/translator` | i18n, `@translate` decorator in components |
| `@papit/signals` | app state |
| `@papit/web-component` | base class for every papchat component |
| `@papit/webrtc` | core only |

Not needed: carousel, codeblock, treeview, table-of-content, router (one page, view state from signals; `pap-router` fetches sibling pages, which `@papit/static` doesn't support well).

### 4.2 New in papchat
**Atoms**
- `pc-avatar`: initials on a colour derived from `uid` (or profile `color`), sizes s/m/l, slot for `pc-presence`.
- `pc-presence`: status dot (available/busy/away/dnd/offline), with an accessible label.
- `pc-badge`: unread count or a short label ("Live", "Host", "You").
- `pc-time`: relative time ("2 min ago"), `Intl.RelativeTimeFormat` in the translator's locale, self-updating.
- `pc-level-meter`: audio level bars from a `MediaStream` (WebAudio `AnalyserNode`), also drives "speaking" highlight.
- `pc-progress`: determinate progress bar (file transfer), `role="progressbar"`.
- `pc-video`: `<video>` wrapper: `stream` property, `muted`, `mirror`, `fit`, autoplay with the play-rejection fallback.

**Molecules**
- `pc-member-item`: avatar + name + status + hover actions (menu). Draggable drop target: drop a file on a person to DM it.
- `pc-message`: bubble with author, time, text (links auto-linked, text only, never `innerHTML`), grouped consecutive messages, system variant ("Anna joined").
- `pc-file-card`: icon by type, name, size, `pc-progress`, download / cancel, image/video preview.
- `pc-composer`: `pap-input` + send + `pap-file-input` attach. Enter sends, Shift+Enter newline, emits `typing`.
- `pc-call-controls`: `pap-group` toolbar: mic, camera, screen, invite, devices, hang up. Keyboard shortcuts M / V / S.
- `pc-video-tile`: `pc-video` + name + muted icon + `pc-level-meter`, speaking ring, pin/fullscreen.
- `pc-incoming-call`: avatar, "Anna is calling…", accept audio / accept video / decline.
- `pc-toast`: one notification, auto-dismiss, `role="status"`.
- `pc-language-picker`: `pap-menu` with a `pap-icon` flag per language.
- `pc-ringtone-picker`: `pap-radio` list with a ▶ preview per tone, plus a volume control.
- `pc-device-picker`: mic/camera/speaker via `pap-menu` (papit has no select, see §9).
- `pc-connection-status`: the lobby status as a pill: connecting / waking server / connected / reconnecting / offline.
- `pc-stage-card`: live broadcast entry: title, presenter, viewers, "Watch".

**Organisms**
- `pc-app-header`: logo, your avatar + status menu, connection status, language picker, theme picker, settings button.
- `pc-member-list`: search (`pap-input`), "Live now" stages, online members (`pap-group`), count.
- `pc-room-list`: your open rooms and stages with unread badges, switch between them.
- `pc-conversation`: message list (auto-scroll unless you scrolled up), typing indicator, composer, **full-area drop zone** overlay on dragenter.
- `pc-call-stage`: responsive video grid, screen share gets the big tile, self view in a corner.
- `pc-room`: `pap-splitter` of `pc-call-stage` and `pap-tabs` (Chat / Files / People), plus `pc-call-controls`. Has a viewer mode for stages.
- `pc-invite-picker`: dialog with members not in the room (`pap-checkbox` list), sends invites.
- `pc-settings`: dialog with `pap-tabs`: Profile (name, colour, status), Sound (ringtone, volume), Devices, Appearance (theme, language), Notifications.
- `pc-onboarding`: first-run "Who are you?" dialog: name (required), colour, language. Its click unlocks audio.
- `pc-toaster`: toast stack.

**Template**
- `pc-app-shell`: header slot, sidebar slot (`pap-sidebar` on desktop, `pap-drawer` under ~800 px), main slot, incoming-call layer, toaster layer.

**Page** (`packages/pages/app`)
- `views/github/index.html`: the shell markup and theme link. `src/main.ts`: read storage, set language, boot the lobby, bind state to components.

---

## 5. i18n, theme, sound, icons

- **Languages**: `en` and `sv` to start (de/es easy to add). Every component ships `asset/translations/en.json` and `sv.json` scoped by its tag name (papit convention). `@papit/static` merges them into `public/translations/<lang>.json`. Default: stored choice, else `navigator.language`, else `en`.
- **Theme**: `@papchat/theme` imports `@papit/theme` and overrides only brand tokens (`--primary` etc. get a papchat accent). The rest comes from papit's tokens.
- **Ringtones**: your premade files go in `packages/pages/app/asset/audio/ringtones/*.mp3` plus `ringtones.json` (`[{ id, file, label }]`) so the picker is data-driven; add `ringback.mp3` and a short `message.mp3` ping. **Important**: `@papit/static` only rewrites `fetch` to `public/`, not `new Audio(src)`. So `ringtone.ts` loads with `fetch("/audio/ringtones/x.mp3")` → `blob` → `URL.createObjectURL` and caches the result. This also makes previews instant.
- **Icons**: put SVGs in `packages/foundations/theme/asset/icons/` (mic, mic-off, camera, camera-off, screen, phone, phone-off, user-plus, paperclip, send, settings, broadcast, download, x). Use `@papit/theme-picker`'s own sun/moon/computer icons as shipped.

---

## 6. Flows (what the user sees)

1. **First visit**: page loads, onboarding dialog ("Who are you?"). Save the profile, then the header shows "connecting… / waking up the server…", then connected. The sidebar fills with people.
2. **Refresh**: no dialog. Auto-connect and land in the lobby. Rooms you were in try to rejoin (`papchat:session` in `sessionStorage`: room ids and passwords, tab-scoped).
3. **Chat with Anna**: member menu → Chat. A room is created, `invite{kind:"chat"}` goes to Anna, and she gets a toast plus an unread badge (no ring). It opens in the room list for both.
4. **Call Anna**: member menu → Call/Video. Room is created, mic (and camera) starts, ringback plays. Anna rings → accept → joins, and tiles appear. Decline, busy or timeout → toast, and the empty room closes.
5. **Invite Bob mid-call**: invite button → picker → `invite` via the lobby → Bob rings → joins the mesh.
6. **Share a file**: drop it on the conversation (or on Anna in the sidebar, which opens/uses the DM room). The file card shows progress on both ends.
7. **Screen share**: controls → Screen. It becomes the large tile for everyone. Stopping it from the browser bar stops it in the app too.
8. **Go live**: header → "Go live", title, then the stage opens in presenter mode. Everyone sees "Live now: Henry – Demo" in the sidebar, with "Watch" to join as a viewer.
9. **Settings**: change ringtone (preview), language (UI swaps live), theme, devices. All saved immediately.

---

## 7. Build and deploy

**Setup changes in the repo**
- root `package.json`: `"papit": { "htmlprefix": "pc" }`; add `@papit/static` to devDependencies; replace the placeholder `publish` script; add `"pages": "npm run build && cd packages/pages/app && npx @papit/static -- --base /papchat/"`.
- Runtime deps go in each package that uses them: `@papit/web-component`, the design-system packages, `@papit/translator`, `@papit/signals`, `@papit/webrtc` (core only), `@papit/theme`.
- Scaffold every package with `npm run create` (web-component template for components, browser for core, theme for the theme), then **delete the generated `tests/` and test scripts** since this project has no tests. Keep `views/` demo pages only where they're useful while building a component.
- `.github/workflows`: drop `publish.yml`, reduce `pull-request.yml` to install + build, add `pages.yml`: `npm ci` → `npm run build` → `@papit/static` in `packages/pages/app` with `--base /<repo>/` → `actions/upload-pages-artifact` (`packages/pages/app/dist`) → `actions/deploy-pages`. Trigger on push to `main` and manual dispatch.
- Repo has no remote yet. Assumed `github.com/onkelhoy/papchat`, so `--base /papchat/`.

**Local dev**
```bash
npx papit-signal-server --port 3000   # terminal 1
npm start                             # terminal 2, @papit/server; the app picks ws://localhost:3000 on localhost
```
Test with 2–3 browser profiles/tabs. Use a phone on the deployed page for the real cross-network test.

**Static limits to keep in mind**
- Only `fetch` goes through the asset shim: no root-absolute `<img src>` / CSS `url()` to assets. Use `pap-icon` (fetch) and blob URLs.
- Page script is bundled by `@papit/bundle-js`: `pages/app` needs `tsconfig.json` and `src/`.

---

## 8. Phases (each one ends deployed and demoable)

| # | Phase | Delivers |
| --- | --- | --- |
| 0 | Setup | prefix, deps, theme package, icon spritesheet, core skeleton, page shell, Pages workflow live with an empty shell |
| 1 | Lobby | storage, onboarding, auto find/create + election + reconnect, connection status, member sidebar with avatars and presence, header with theme and language picker |
| 2 | Rooms: chat | invite protocol, room client, room list, conversation, composer, messages, typing, toasts, unread badges |
| 3 | Calls | media start/stop, video tiles, grid, controls, ringing + ringback + ringtones, incoming-call dialog, invite more people, busy/dnd/timeout |
| 4 | Files | drop zones (conversation and member), transfer, file cards with progress and previews |
| 5 | Stage | multicast presenter/viewer, announce/query/end, "Live now" list |
| 6 | Polish | settings dialog complete, device picker, notifications, mobile drawer layout, keyboard shortcuts, `sv` translations, README with screenshots and a "how the webrtc works here" section |

Order within a phase: core logic first (check it in the console), then atoms → molecules → organisms → wire up in the page.

---

## 9. papit gaps found while planning

None of these block v1. They're candidates for papit issues (not filed).

1. **SDP over the lobby**: `Client` can't take a custom signalling transport, so room/stage handshakes go via the signal server, not chord. A `signal` option (any `Link`) on `Client` would make "handshake through chord" literal and server-free after the lobby.
2. **Channel back-pressure**: `Channel` has no `bufferedAmount` / `bufferedamountlow`, so file transfer has to guess its pacing.
3. **One socket per network**: each room opens its own signal socket. Fine for a demo; multi-network on one socket would be a bigger webrtc change.
4. **Design system**: no select/combobox, avatar, toast or progress in papit. papchat builds `pc-*` versions; good ones could be upstreamed later.
5. **Multicast host handover**: if the presenter drops, the tree re-roots under a new host with no capture. papchat just ends the stage.

## 10. Known limits (state them in the README)
- STUN only: some corporate/mobile NATs won't connect without TURN.
- Mesh rooms are capped at 8. Stages scale but add a re-encode per tree hop.
- Free Render host: first connect after idle takes ~30–60 s ("waking").
- No history, no auth, peers are trusted. Names are self-chosen.

---

## 11. Notes for the implementing session

papit conventions live in the papit repo, so read these first:
- `/Users/henry/Developer/projects/papit/.claude/skills/papit-design-system/SKILL.md`: component structure, `:state()`, constructed stylesheets, ElementInternals, APG patterns.
- `/Users/henry/Developer/projects/papit/.claude/skills/papit-web-component/SKILL.md`: `CustomElement`, `@property`, `html` templates.
- `/Users/henry/Developer/projects/papit/.claude/skills/papit-network/SKILL.md` and `packages/network/webrtc/README.md`: the full Client/Media API used above.
- `/Users/henry/Developer/projects/papit/packages/runtime/cli/static/README.md`: deploy details.
- The existing plain-DOM demo in `../demo` shows working Client/Media wiring to borrow from.

House style: 4-space indent, Allman braces for control flow, K&R for functions, `handle<Event>` handlers bound with `@bind`. Accessibility follows WAI-ARIA APG. Escape user text, never `innerHTML` with message content.
