# papchat

![Logo](https://raw.githubusercontent.com/onkelhoy/papchat/refs/heads/main/asset/logo.svg)

A Teams-style chat, call and broadcast app that runs **entirely peer to peer** in the browser. It is the showcase for [`@papit/webrtc`](https://github.com/onkelhoy/papit/tree/main/packages/network/webrtc), built from `@papit/*` web components and published as a static site with `@papit/static`. There is no backend of its own: a small signal server helps peers find each other, and everything after that flows between browsers.

**Live:** <https://onkelhoy.github.io/papchat/> (once the Pages workflow has run on `main`)

## What you can do

- **Say who you are once**, then you are auto-connected to the shared lobby. A refresh reconnects without asking.
- **See who is online** with presence (available, busy, away, do not disturb).
- **Chat** with anyone, or with a group. Typing indicators, unread badges, rooms in the sidebar.
- **Call** with mic, camera and screen share. Ringing, ringback, ringtone picker, incoming-call cards, and inviting more people mid-call.
- **Share files** by dropping them on a conversation or on a person (up to 100 MB), with progress on both ends and previews for images, video and audio.
- **Go live**: broadcast to anyone who clicks "Watch", with chat for the audience.
- **Settings**: profile, ringtone and volume, devices, theme (light, dark, system), language (English or Swedish, switched live), notifications and keyboard shortcuts (`M` mic, `V` camera, `S` screen, `Esc` closes dialogs).

Everything about you lives in `localStorage` in your own browser.

<!-- Screenshots (light and dark, a call, a stage) go here once they have been captured against the live page. -->

## How the WebRTC works here

`Client` from `@papit/webrtc` is one network. papchat therefore runs **one lobby client plus one client per open room or stage**, each with its own socket to the signal server. Only `@papchat/core` talks to `@papit/webrtc`; the components are dumb (properties in, events out) and only `pages/app` wires the two together.

```
                   signal server
                  ▲     ▲          ▲
        ┌─────────┘     │          └──────────┐
  Lobby client      Room client(s)       Stage client(s)
  "papchat"         "papchat:room:<id>"  "papchat:stage:<id>"
  chord, public     mesh, private+pwd    multicast fanout 3, public
  presence,         chat, files,         presenter's camera/screen/mic
  invites, ringing  mic/cam/screen       relayed down the tree, chat
```

### Lobby: find or create, automatically

The lobby is a public `chord` network named `papchat`. On boot (once there is a profile) the client lists networks, keeps those with `meta.app === "papchat" && meta.kind === "lobby"`, and joins the **canonical** one: the smallest `meta.created`, ties broken by `id`. If there is none it creates it. Two people arriving at the same moment both create one, so after creating the client looks again about 2 s later and leaves for a more canonical lobby if one exists. Both sides converge on the same network without coordination. When the host leaves, the signal server promotes the next member, so the lobby lives as long as anyone is in it.

A socket reconnect gives a new peer id, so the lobby closes the client and starts a fresh one. Rooms rejoin with the room id and password kept in `sessionStorage`.

### Identity

Peer ids change on every connect, so identity is a stable `uid` stored once. The profile (`uid`, name, colour, status) travels in the client's `profile` option. The member list is deduplicated by `uid`, showing the newest peer.

### The invite protocol

Everything about starting, ringing and answering goes over the lobby, as app messages: `send(peer, type, payload)` is routed through chord in O(log n) hops, and `broadcast` reaches everyone.

| Type | To | Payload | Meaning |
| --- | --- | --- | --- |
| `invite` | peer | `{ room, password, kind, title, from, members }` | Join this room (`kind`: `chat`, `call`, `video` or `stage`). Calls and stages ring. |
| `invite.cancel` | peer | `{ room }` | The caller hung up before an answer. |
| `invite.accept` | peer | `{ room }` | The callee is joining (UI feedback). |
| `invite.decline` | peer | `{ room, reason }` | `declined`, `busy`, `dnd` or `timeout`. |
| `stage.announce` | broadcast or peer | `{ stage, title, presenter, viewers }` | A broadcast is live (re-sent when the viewer count changes). |
| `stage.end` | broadcast | `{ stage }` | It ended. |
| `stage.query` | broadcast | `{}` | Sent once after joining the lobby; live presenters answer with a unicast `stage.announce`. |

Stages are also public networks with `meta.kind === "stage"`, so `list()` is a fallback for announcements that were missed.

### Why the SDP still goes through the signal server

The call handshake (invite, ring, accept, decline) goes through chord, but the **WebRTC** handshake (SDP offers, answers and ICE for a room's links) still goes through the signal server, because `Client.join` negotiates there and a `Client` cannot be given a custom signalling transport. Once linked, chat, files and media flow directly between browsers.

### Rooms: chat and calls (mesh)

A room is a private `mesh` network with a random password, capped at 8 people (a bigger mesh hurts video). The media plan is fixed at creation:

- channels `file` (ordered, binary chunks) and `state` (unordered, no retransmits, for ephemeral flags);
- streams `mic`, `camera` and `screen`, captured lazily so joining never prompts for permissions.

Chat goes over `client.broadcast`. Files go over the `file` channel as frames of `[16-byte file id][u32 sequence][≤ 16 KiB data]`, in batches of 64 chunks with a short pause (the channel exposes no back-pressure signal), and are reassembled into a `Blob` on the receiving side.

### Stage: broadcast (multicast)

The presenter creates a public `multicast` network with a fanout of 3, so the tree is rooted at them: only their captures reach everyone, and each viewer relays to a few others. Viewers get a viewer-only UI, and chat goes up and down the tree. If the presenter leaves, the stage ends (a handover would put a host with no capture at the root). To watch the tree relay, run `papchat.setStageFanout(1)` in the console before going live.

### Poking at it

Core is available in the console as `papchat` (state, storage, lobby, rooms, stage). Turn on logging with `papchat.setLogging(true)`.

## Run it locally

Node 20 or newer.

```bash
npm install
npm start        # dev server; the app uses the deployed signal server on Render
```

Open it in two or three tabs or browser profiles to see presence, chat and calls. For a real cross-network test, use a phone on the deployed page.

| Command | What it does |
| --- | --- |
| `npm run build` | build every package |
| `npm start` | dev server for the app and the component demo pages |
| `npm run signal` | local signal server on port 3001 (use it with `?signal=ws://localhost:3001`) |
| `npm run pages` | build, then produce the static site in `packages/pages/app/dist` with `--base /papchat/` |

The signal server can be overridden with `?signal=<url>` on the page URL (remembered in `papchat:debug`).

### Layout

Atomic layers, HTML prefix `pc` (`pc-avatar`, `pc-room`, …), every package is `@papchat/*`:

```
packages/
  foundations/  theme, core (config, storage, identity, lobby, rooms, stage, invites, transfer,
                ringtone, devices, notify, state)
  atoms/        avatar, badge, presence, time, level-meter, progress, video
  molecules/    member-item, message, composer, file-card, call-controls, video-tile, incoming-call,
                toast, language-picker, ringtone-picker, device-picker, connection-status, stage-card
  organisms/    member-list, conversation, call-stage, room, room-list, settings, onboarding,
                invite-picker, app-header, toaster
  templates/    app-shell
  pages/app     the page that wires core to the components
```

`PLAN.md` is the spec and `TASKS.md` the build log.

## Known limits

- **STUN only.** Some corporate and mobile NATs will not connect without a TURN relay.
- **Mesh rooms are capped at 8 people.** Stages scale further, but each hop in the tree re-encodes.
- **Free hosting for the signal server.** The first connect after it has been idle takes about 30 to 60 s; the header shows "waking up the server…".
- **No history, no accounts.** Rooms are ephemeral and peers trust each other. Names are self-chosen.
- **Files:** 100 MB cap, late joiners do not get earlier files, and files cannot be shared on a stage.

## papit gaps found along the way

None of these block papchat; they are candidates for upstream issues.

1. **SDP over the lobby.** `Client` cannot take a custom signalling transport. A `signal` option (any link) would make "handshake through chord" literal and server-free after the lobby.
2. **Channel back-pressure.** `Channel` has no `bufferedAmount` or `bufferedamountlow`, so file transfer has to guess its pacing.
3. **Reconnect keeps the old id.** After a socket reconnect `Client` keeps its previous `id`, so later messages are rejected as `spoof`; the lobby works around it by closing the client and building a new one.
4. **One socket per network.** Every room and stage opens its own signal socket.
5. **Multicast host handover.** If the presenter drops, the tree re-roots under a host with no capture, so the stage just ends.
6. **Design system.** No select or combobox, avatar, toast or progress in papit, so papchat has `pc-*` versions that could be upstreamed.
7. **`@papit/web-component` property compare** throws on `null` inside objects and treats any two `MediaStream`s as equal, so streams are passed as `undefined` or set imperatively.
8. **`@papit/static`** skips assets of `theme` packages (the icon spritesheet is served from the app package instead) and does not rewrite bare CSS imports in demo pages.

## License

MIT
