# papit upgrade and the dad bug: what happened

Written 2026-11-01. It covers the move to webrtc 0.0.7, signal-server 0.0.6 and peer-message 0.0.4, the bug where you and your dad can't see each other, and the smaller bugs from the task list.

## Where things stand

- **Tasks:** 101/110 done. T12.1 is finished. The other 9 need you: T0.6, T6.9, T7.6, T7.8, T7.18, T8.6, T9.8, T10.12 and T11.4 are live checks or need a repro.
- **Nothing is live.** All of this is committed locally. papchat is 13 commits ahead of GitHub and `../signal` is 1 ahead.
- **Nothing has run.** Typecheck, the build and the `main.ts` check pass. No browser, no real network, and no real merge. The server was only started once to check it answers `/health`.

## How to ship it

The order matters, because a new client on the old server is slow and can't merge.

1. Push `../signal` (`git push` on `master`). Render redeploys it.
2. Wait until it's up. `https://render-webrtc-signal-server.onrender.com/health` answers `{"ok":true}`.
3. Push papchat (`git push` on `main`). That's one new version.
4. You and your dad both reload. A tab left open keeps the old code.

**Are today's live clients safe on the new server?** Yes, from reading the code. Every change to the message checks is an addition or an optional field, and the only new server behaviour that touches existing traffic is the "draining" state, which old clients never set. So step 1 can happen whenever you like.

**The deploy itself restarts the server.** That's the likely trigger of the bug below, so expect a tab left open to misbehave until both of you have reloaded.

## The dad bug

### What's going wrong

**Likely cause, found by reading the code. I haven't reproduced it.** You suspected the host handover, and that's close: it's about what happens to a host that gets a new socket.

1. Every client has a peer id, and the server knows each socket by a socket id. Normally they're the same.
2. A host's socket drops: the server restarts, the laptop sleeps, or the Wi-Fi blips. A member promoted to host opens a new socket too.
3. The host reconnects and gets a new socket id, but keeps its old peer id, because its peers know it by that.
4. Your dad opens the app, finds the network and asks to join. The server passes that to the host's new socket, and the host's welcome gets back to him.
5. He now tries to link to the host using its peer id. The server has never heard of that id, says it can't deliver, and the offer is lost. In 0.0.6 nothing tries again.

### Why it looks the way it does

- **Connected, but an empty list.** He's in the network, so the app says connected. Since device keys arrived on 10-31, a person only shows once they've proved who they are, and that needs a link. So neither of you shows up for the other.
- **Global chat fails.** A post only travels over open links, and he has none.
- **Not TURN.** The connection is never attempted, so STUN isn't involved.
- **It comes and goes.** It only happens with a host whose socket changed. If that tab reloads, the host is fresh and everything works.

### Why it started around 10-31

This part is my best inference, not a proven fact.

- `../signal` moved from 0.0.3 to 0.0.5 on 10-31 around 18:30. If Render redeployed then, every open tab got a new socket, and any host left open became a host like this.
- The bug itself is older: 0.0.6 was already in the lockfile on 10-30. An earlier version rebuilt the client after a drop, which hid it. `0.0.6` stopped sending the `reconnect` error that recovery relied on.
- Device keys landed the same evening. Before them your names still showed even with no link, so it would have looked different.

### Why the upgrade alone wasn't enough

0.0.7 fixes half of it. A client now remembers a peer's socket when a relayed message arrives from it, but only if that peer is already in its member list. A newcomer's list is still empty when the welcome arrives, so the welcome doesn't count.

Exactly one side of a pair opens a link: the lower id.

- **Host's id is lower:** the host offers, your dad learns the socket from that, and it works.
- **Your dad's id is lower:** he offers first and fails, like before. Ids are random, so that's about half of all joins.

**The workaround in papchat:** a host on a new socket sends each newcomer a small `here` message right after the welcome (`greet` in `lobby.ts`, used by rooms too). By then the newcomer has its member list, so it learns the socket. Its first offer is still lost, and the 15 s timeout has to run out before the retry 2 s later works. So in this case the join takes about 17 s.

### How to tell if it worked

After shipping, reproduce the bad case on purpose:

1. Keep one tab open as host, with nobody else in it.
2. Restart the server from the Render dashboard, or put that laptop to sleep for a while.
3. Open the app on another network and watch for up to 30 s.

If you don't see each other, both of you press Logs, Turn on logs, reload, open Logs, Copy. Look for:

- `lobby: join failed` followed by `lobby: creating`: a join failed and made a second lobby.
- `retrying the link`, then `gave up on the link`: linking failed.
- `lobby: merge failed`: two lobbies couldn't merge.
- `ice-state` lines: if these appear and fail, the offers did arrive and it's a real connection problem, which would mean this diagnosis is wrong.

## The upgrade

### What changed in papchat

- **Merging:** the host calls `client.merge()`. Only the two hosts use the server, once, and everyone else moves over peer links without reconnecting. The old restart of the whole group is gone.
- **No more password probe:** the merge checks the password, so the extra connection that tested it is gone. That's one less use of the signal server.
- **`acceptMerge`:** a host only accepts papchat lobbies with the same network name, and only if the result is 250 people or fewer. papit refuses all merges unless this is set.
- **Private access removed:** `c["reregister"]` and `c["serverNetwork"]` are now the public `reregister()` and `serverId`.
- **Rooms:** they listen to the new `server-id` event, so the polling timers and the `room-id` message went.
- **Only the host looks for other lobbies.** A member's check after joining was a slow no-op, since it usually had no socket left to ask with.
- **Also new from papit:** dropped links are retried, a member stays listed while that happens, spoof errors are fixed, crossed offers no longer stall for 15 s, and no offer is lost to a closing socket. These may well fix the Offline peers on their own, but that needs a retest.

### Behaviour that's different now

- **The larger network stays, not the older one.** The older network is still what triggers a merge, but papit picks the survivor, and a tie keeps the lower host id.
- **The larger network's password wins.** If you unlock a separated network and your group is larger, the other group takes on your password. If your group had none, that locked network ends up with no password. Doing this still takes the right password.
- **The password goes round after a merge.** The staying host sends it at 5 s and again at 30 s, because the group that moved doesn't know it. Someone offline for both will get "wrong password" and has to re-enter it. A group with a password that merges into an open network with fewer people also hands that password to those people.
- **A merge can fail where the old restart worked.** The two hosts have to reach each other directly. If they can't, the groups stay apart and it tries again every 60 s.
- **Links can close without anyone leaving.** Links the network no longer needs close a few seconds after any member change. I checked proofs, `quietSend`, global chat and the stage query, and they're fine: only links nobody wants close, and only once all the wanted ones are up. Rooms and device links use mesh, which never closes any.

## Other bugs

| Bug | Result |
| --- | --- |
| `/icons/spritesheet.svg` 404 on the live site | **Fixed.** `main.ts` still fetched a file that no longer exists. |
| Global chat loses your text when a post is refused | **Fixed.** It was lost: the field cleared before the send. A send can now be cancelled, which puts the text back. Covers global chat and a chat that can't queue. |
| Two rows for one person | **Fixed for the likely cause, no repro.** The room list trusted a room's last summary, which can go stale. It now asks the room. Two real direct rooms for one person would still show two rows. |
| Incoming call card narrow on phones (T6.5 note) | **Fixed.** |
| Peers shown as Offline | **Needs a retest.** No papchat change. See above. |
| `AbortError: Transition was skipped` | **Not fixed, harmless.** `pap-theme-picker` starts a view transition every time `target`, `storage` or `value` is set, so they cut each other off at load. It's in papit, and hiding it here would be a hack. |
| T7.6 stage screen share | **Still needs your repro.** Nothing new found. |

README updated: lobby merging, known limits (including the silent switch, GIFs and invite links from T7.18), and the papit gaps.

## Still your call

- **Should a failed join stop making a second lobby?** I left this as it is, because you hadn't agreed to it. A second lobby at least merges back within a minute now, without anyone reconnecting, so it's less bad than it was.
- **`client.room()`:** 0.0.7 can open a room over existing peers with no socket, which fits "the server is a last resort". Rooms still use the server today. It's a bigger change, so it isn't part of this.

## For the papit session

I didn't edit the papit repo. Here's the finding to pass on. Both parts come from reading the 0.0.7 source, and neither has been reproduced.

> **`@papit/webrtc` 0.0.7: a newcomer can't reach a host on a new socket until it has heard from it as a member**
>
> `Network.handleRelay` only records `peer → socket` when `this.members.has(inner.meta.sender)`. The welcome is the first relayed message a newcomer gets, and its members are only set afterwards, by `enter()`, so it's not recorded. When the newcomer's id is lower it opens the link, its offer goes to the host's peer id, and the server answers unreachable.
>
> Steps: host A with one member-free network; drop A's socket so it reconnects with a new socket id and re-registers; join from B where B's id sorts before A's. B's link times out and every retry fails the same way. With B's id sorting after A's it works, because A's offer teaches B the socket.
>
> Second part: `relayToHost` wraps to `this.host` without looking in `sockets`, and `toServer` doesn't rewrap relays. So a newcomer with no link to such a host can't send signalling through it to a member without a socket. In chord that could leave a newcomer unlinked in a larger group, if the host isn't one of its neighbours.
>
> Suggested fix: pass the host's socket id in the welcome, or record the socket when a welcome comes through a relay, and use `sockets` in `relayToHost`.
>
> papchat's workaround: the host sends each newcomer a message right after the welcome (`greet`). It can go once this is fixed.

The second part has no workaround in papchat. So a group of 3 or more may still have trouble after a host changes socket: test that too.
