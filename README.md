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
- **Keep your chats**: text and GIFs stay on your device, so a chat is still there tomorrow with nobody online. Messages show sending, sent or not sent, and what didn't go out is delivered when that person is back.
- **Link your devices**: show a QR code or a link, accept on both devices, and they're one person with the same chats, name and colour. Calls ring all of them.
- **Global chat**: one line everyone in your network shares, broadcast over the chord network. It's never saved and never notifies, and you can mute anyone for yourself.
- **Offline calls**: turn on call notifications and the people you meet can ring your device with the app closed. A notification opens the normal answer card. People can also save you from a link or QR code, and saved contacts stay in the sidebar.
- **Settings**: profile, ringtone and volume, devices, theme (light, dark, system), language (English or Swedish, switched live), notifications and keyboard shortcuts (`M` mic, `V` camera, `S` screen, `Esc` closes dialogs).

Everything about you lives in your own browser: your profile in `localStorage`, your saved chats and device key in IndexedDB. No chat ever reaches a server.

- **Accounts**: a browser can hold several. The avatar menu has Manage accounts and Log out, and login lists the accounts saved here above the name field. Accounts belong to one browser, so Chrome and Safari each have their own list; linking devices is what makes them one person. There's no password, so anyone using the browser can open any account here, and saved chats aren't encrypted on disk. Logging out turns off call notifications until you log back in, and contacts get your new token when they next meet you. Removing an account deletes its key, chats, contacts and settings from this browser for good. A linked account carries on through its other device: nobody is told, the link stays valid, and the people who know you see the same person with the same chats.

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

Peers stay linked when the signal server goes away. The `Client` keeps trying to reconnect and registers the network again, under a new server id. While that's happening the group is "rogue": it works, but nobody new can find it, so someone may open a second network with the same name.

To heal that, the host looks for a more canonical network with the same name when its socket returns and every 60 s after that. Only the host has a socket, so it tells the group over peer links, the members move, and the host moves last. If the other network has a password this group doesn't know, the group stays separate and the header says so. Anyone who enters that password in Settings → Network brings the whole group across. Private networks follow the same rules. Rooms have random names and aren't listed, so they never merge; their host shares the new server id so invites keep working. Refreshing rejoins rooms with the id and password kept in `sessionStorage`.

### Identity

Identity is a key pair on the device, not a name: the private key can't be exported, and the `uid` is a hash of the public key. The profile (`uid`, `key`, name, colour, status) travels in the client's `profile` option, and every member signs a random challenge before they count, in the lobby and in rooms. A copied uid proves nothing.

An account is a set of those keys. A link is two signatures, each device signing it, so neither can claim the other alone, and both identities stay valid. Devices tell the people they meet which keys are theirs in a message of its own, each receiver checks the signatures, and everyone agrees on one person with no coordinator: the smallest uid. The member list shows one entry per person, the newest device. Removing a device is signed too and spreads the same way.

### Saved chats

A conversation belongs to people, not to a room: a 1:1 is keyed by its two people, a group by a uuid its room carries in `meta`. Rooms come and go, and the conversation stays in IndexedDB, in `papchat-history`. Receivers confirm each message by id and drop repeats. What nobody confirmed stays in an outbox and goes out when someone is back, which needs both people online at once. Members who meet trade the ids of the last 7 days and fill each other's gaps, keeping the original author and time, but a group's past is only offered to someone already in it. Linked devices do the same over a direct link, and new messages follow over the lobby. Files are never saved.

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
  foundations/  theme, core (config, storage, keys, identity, account, lobby, rooms, stage, invites,
                history, chats, sync, link, global, transfer, ringtone, devices, notify, state)
  atoms/        avatar, badge, presence, time, level-meter, progress, video
  molecules/    member-item, message, composer, file-card, call-controls, video-tile, incoming-call,
                toast, language-picker, ringtone-picker, device-picker, connection-status, stage-card,
                qr-code, qr-scanner
  organisms/    member-list, conversation, call-stage, room, room-list, settings, onboarding,
                invite-picker, link-device, app-header, toaster
  templates/    app-shell
  pages/app     the page that wires core to the components
```

`PLAN.md` is the spec and `TASKS.md` the build log.

## Calling someone whose app is closed

The signal server can send web push without storing anything: it seals a browser's push subscription into a token and hands it back. That token is what gets shared.

- **Contacts.** With call notifications on, the app sends its token to each person it meets, through the lobby or a room, in its own message because a token doesn't reliably fit the 1 KB profile. Tokens are saved on the device with the uid and name (the 100 most recent). A share link or QR code does the same for someone you haven't met; a link can add a person but never changes a saved token, because it proves nothing.
- **Calling.** Someone in the lobby gets the normal invite. Otherwise the caller opens the room and pushes its id and password, signed with the device key. It rings for 60 s instead of 30. Hanging up or running out sends a cancel, which turns the notification into a missed call.
- **Answering.** `sw.js` shows the notification, or a missed call if the push came late. A tap opens the app on a `#call=…&from=…` hash, the app checks the signature, and the usual incoming card rings for what's left of the 60 s.

The worker only handles push, and nothing is cached. iOS 16.4+ only pushes to an app added to the Home Screen, so Settings shows a hint there. The installed app has its own storage and so its own key: on iOS it's a separate person from Safari until you link the two.

## Known limits

- **STUN only.** Some corporate and mobile NATs will not connect without a TURN relay.
- **Mesh rooms are capped at 8 people.** Stages scale further, but each hop in the tree re-encodes.
- **A push token can ring your device.** Whoever holds it can show you a notification, and everyone you meet gets it, in the public lobby too. It can't pretend to be someone else, because calls are signed. Turning call notifications off cancels the token.
- **Declining from a closed app** can't reach a caller outside your lobby, so they ring out the 60 s. Someone still listed in the lobby with a locked phone gets a normal invite rather than a push until they go stale.
- **Free hosting for the signal server.** The first connect after it has been idle takes about 30 to 60 s; the header shows "waking up the server…".
- **No server, so no safety net.** Chats live only on your devices, and Safari can evict data from a site that isn't installed. Names are self-chosen.
- **"Don't save" is a request.** A network can ask its members not to save chats, but any device can keep what it receives.
- **Saved history isn't signed.** A filled-in message is checked against the conversation's members, so a member could fake a line from another member. Chord relays can also fake the sender of a lobby message (global chat, `sync.live`) after the proof; rooms have direct links.
- **Offline messages need both of you online at once.** Nothing wakes the other device, and linked devices only meet in the same network.
- **Removing a device isn't a wipe.** It keeps what it has, and people who were offline only hear about it the next time they meet one of your devices.
- **Global chat has no moderator.** Every client rate-limits senders and keeps its own mutes. Late joiners see nothing earlier.
- **Files:** 100 MB cap, late joiners do not get earlier files, and files cannot be shared on a stage.
- **Rogue merges take time.** Two groups can stay split for up to about a minute after the server returns, and everyone in the lobby reconnects during a merge. Calls and chats carry on.
- **Split rooms stay split.** If a room loses its peer links and both sides re-register, they can't find each other. A stage re-registered by its presenter keeps handing out its old id in invites.

## papit gaps found along the way

None of these block papchat; they are candidates for upstream issues.

1. **SDP over the lobby.** `Client` cannot take a custom signalling transport. A `signal` option (any link) would make "handshake through chord" literal and server-free after the lobby.
2. **Channel back-pressure.** `Channel` has no `bufferedAmount` or `bufferedamountlow`, so file transfer has to guess its pacing.
3. **No public server id.** After a re-register, `client.network.id` keeps the old id and the new one is private, with no event when it changes. papchat reads `serverNetwork` and polls for it.
4. **One socket per network.** Every room and stage opens its own signal socket.
5. **Multicast host handover.** If the presenter drops, the tree re-roots under a host with no capture, so the stage just ends.
6. **Design system.** No select or combobox, avatar, toast or progress in papit, so papchat has `pc-*` versions that could be upstreamed.
7. **`@papit/web-component` property compare** throws on `null` inside objects and treats any two `MediaStream`s as equal, so streams are passed as `undefined` or set imperatively.
8. **`@papit/static`** skips assets of `theme` packages (the icon spritesheet is served from the app package instead) and does not rewrite bare CSS imports in demo pages.

## License

[@Papit License 1.0](LICENSE): free to use, modify and build on, with credit, but the software itself may not be sold or resold.
