import { effect, signal } from "@papit/signals";

import { conversations, directId, moveConversation } from "./history";
import { deviceKey, signedBy, uidOfKey } from "./keys";
import { lobbyClient, on, peerOf, quietSend, refreshMembers } from "./lobby";
import { log } from "./log";
import { people, personOf, setPeople } from "./people";
import { allRooms, getRoom, rekeyDirects, Room } from "./room";
import { me, members, rooms, setSavedAccounts } from "./state";
import { activeLinks, storage } from "./storage";
import type { AccountData, DeviceLink, DeviceRemoval, LinkedDevice } from "./types";

// An account is a set of device keys. A link is two signatures, each device signing it, so neither can
// claim the other alone. Linking keeps both identities, so what others hold for either stays valid.
// People learn the set from a message of its own (a key and a signature for each device don't fit the
// 1 KB profile), check every signature, and then see one person: the smallest uid. Removing a device is
// signed too, and spreads the same way. Someone who was offline only hears of it when they next meet
// one of the linked devices, and a removed device keeps what it already has.

const TYPE = "account";
// links need a moment after someone appears
const TELL_DELAY_MS = 3_000;
const ENTRIES_MAX = 32;
const KEY_MAX = 128;
const SIGNATURE_MAX = 128;

/** What a link's two signatures cover. `a` sorts before `b`. */
export const linkText = (a: string, b: string, at: number) => `papchat link\n${a}\n${b}\n${at}`;
/** What a removal's signature covers. */
export const removalText = (key: string, at: number) => `papchat unlink\n${key}\n${at}`;

/** Every link and removal this device knows of, of anyone. */
export const [account, setAccount] = signal<AccountData>(storage.account.get());
/** Your devices, this one first. Just this one until you link another. */
export const [linkedDevices, setLinkedDevices] = signal<LinkedDevice[]>([]);

/** The keys connected by the given links: every group of two or more. */
export function keyGroups(links: DeviceLink[]): string[][] {
    const parent = new Map<string, string>();
    const find = (key: string): string => {
        if (!parent.has(key)) parent.set(key, key);
        const up = parent.get(key)!;
        if (up === key) return key;
        const root = find(up);
        parent.set(key, root);
        return root;
    };
    for (const link of links) parent.set(find(link.a), find(link.b));

    const groups = new Map<string, string[]>();
    for (const key of parent.keys())
    {
        const root = find(key);
        groups.set(root, [...(groups.get(root) ?? []), key]);
    }
    return [...groups.values()];
}

/** True when both devices really signed this link. */
export async function validLink(link: DeviceLink): Promise<boolean> {
    if (link.a >= link.b) return false;
    const text = linkText(link.a, link.b, link.at);
    return await signedBy(link.a, link.sa, text) && await signedBy(link.b, link.sb, text);
}

/** True when a device of the same account signed this removal. */
export async function validRemoval(removal: DeviceRemoval, links: DeviceLink[]): Promise<boolean> {
    const related = keyGroups(links).some(group => group.includes(removal.key) && group.includes(removal.by));
    return (removal.by === removal.key || related) && signedBy(removal.by, removal.sig, removalText(removal.key, removal.at));
}

const sameLink = (x: DeviceLink, y: DeviceLink) => x.a === y.a && x.b === y.b && x.at === y.at;
const sameRemoval = (x: DeviceRemoval, y: DeviceRemoval) => x.key === y.key && x.at === y.at;

function isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === "object" && value !== null;
}

const shortText = (value: unknown, max: number): value is string => typeof value === "string" && value.length > 0 && value.length <= max;

function readLink(raw: unknown): DeviceLink | null {
    if (!isRecord(raw)) return null;
    const { a, b, at, sa, sb } = raw;
    if (!shortText(a, KEY_MAX) || !shortText(b, KEY_MAX) || !shortText(sa, SIGNATURE_MAX) || !shortText(sb, SIGNATURE_MAX)) return null;
    return typeof at === "number" && Number.isFinite(at) ? { a, b, at, sa, sb } : null;
}

function readRemoval(raw: unknown): DeviceRemoval | null {
    if (!isRecord(raw)) return null;
    const { key, by, at, sig } = raw;
    if (!shortText(key, KEY_MAX) || !shortText(by, KEY_MAX) || !shortText(sig, SIGNATURE_MAX)) return null;
    return typeof at === "number" && Number.isFinite(at) ? { key, by, at, sig } : null;
}

// the devices of whoever owns `key`, and the links and removals that say so
function groupOf(data: AccountData, key: string): string[] {
    return keyGroups(activeLinks(data)).find(group => group.includes(key)) ?? [key];
}

/** What your account looks like to others: every link around you, and what was removed from it. */
export function ownAccount(): AccountData {
    const own = deviceKey()?.key;
    const data = account();
    if (!own) return { links: [], removed: [] };
    const reach = keyGroups(data.links).find(group => group.includes(own)) ?? [own];
    return {
        links: data.links.filter(link => reach.includes(link.a)),
        removed: data.removed.filter(removal => reach.includes(removal.key)),
    };
}

function commit(next: AccountData) {
    storage.account.set(next);
    setAccount(next);
    setSavedAccounts(storage.accounts.get());
}

/** Takes in links and removals from anyone, verifying each new one. True when something changed. */
export async function receiveAccount(raw: unknown): Promise<boolean> {
    if (!isRecord(raw) || !Array.isArray(raw.links) || !Array.isArray(raw.removed)) return false;
    const incoming = raw.links.slice(0, ENTRIES_MAX).map(readLink).filter((link): link is DeviceLink => !!link);
    const removals = raw.removed.slice(0, ENTRIES_MAX).map(readRemoval).filter((removal): removal is DeviceRemoval => !!removal);

    const fresh: DeviceLink[] = [];
    for (const link of incoming)
    {
        if (!account().links.some(other => sameLink(other, link)) && await validLink(link)) fresh.push(link);
    }
    const allLinks = [...account().links, ...fresh];
    const gone: DeviceRemoval[] = [];
    for (const removal of removals)
    {
        if (!account().removed.some(other => sameRemoval(other, removal)) && await validRemoval(removal, allLinks)) gone.push(removal);
    }
    if (fresh.length === 0 && gone.length === 0) return false;

    const current = account();
    commit({ links: [...current.links, ...fresh], removed: [...current.removed, ...gone] });
    await apply();
    return true;
}

/** Keeps a link both devices have signed. */
export async function addLink(link: DeviceLink) {
    await receiveAccount({ links: [link], removed: [] });
}

/** Removes one of your devices. It keeps what it has, but stops being you. False when it isn't yours. */
export async function removeDevice(uid: string): Promise<boolean> {
    const own = deviceKey();
    const entry = linkedDevices().find(device => device.uid === uid);
    if (!own || !entry || entry.self) return false;

    const at = Date.now();
    const removal: DeviceRemoval = { key: entry.key, by: own.key, at, sig: await own.sign(removalText(entry.key, at)) };
    // told before it's taken out of the set, so the device itself hears it
    const hearers = linkedDevices().filter(device => !device.self).map(device => device.uid);
    const current = account();
    commit({ ...current, removed: [...current.removed, removal] });
    await apply();
    for (const device of hearers) quietSend(device, TYPE, ownAccount());
    return true;
}

// ---------------------------------------------------------------- who is who

/** Brings the person map, your device list and everything keyed by person up to date. */
export async function apply() {
    const groups = keyGroups(activeLinks(account()));
    const map: Record<string, string> = {};
    for (const group of groups)
    {
        const uids = (await Promise.all(group.map(key => uidOfKey(key).catch(() => null)))).filter((uid): uid is string => !!uid);
        const owner = [...uids].sort()[0];
        for (const uid of uids) map[uid] = owner;
    }

    const before = people();
    const moved = Object.keys({ ...before, ...map }).some(uid => before[uid] !== map[uid]);
    if (moved)
    {
        storage.people.set(map);
        setPeople(map);
        rekeyDirects();
        refreshMembers();
        await fold();
    }
    await listDevices();
}

// a conversation keyed by the old person goes under the new one, merging by message id
async function fold() {
    const mine = me()?.uid;
    if (!mine) return;
    for (const conversation of conversations())
    {
        if (!conversation.direct) continue;
        const direct = personOf(conversation.direct);
        const id = directId(mine, direct);
        if (id !== conversation.id) await moveConversation(conversation.id, { ...conversation, id, direct });
    }
}

async function listDevices() {
    const own = deviceKey();
    if (!own) return;
    const names = storage.deviceNames.get();
    const keys = groupOf(account(), own.key);
    const list = await Promise.all(keys.map(async (key): Promise<LinkedDevice> => {
        const uid = await uidOfKey(key);
        return { uid, key, label: names[uid] ?? "", self: key === own.key };
    }));
    setLinkedDevices(list.sort((a, b) => Number(b.self) - Number(a.self)));
}

/** Remembers what a device of yours is called. */
export function nameDevice(uid: string, label: string) {
    storage.deviceNames.set({ ...storage.deviceNames.get(), [uid]: label.slice(0, 64) });
    void listDevices();
}

/** A short name for this device, from what the browser says it is. */
export function deviceLabel(): string {
    const agent = navigator.userAgent;
    const device = /iPhone/.test(agent) ? "iPhone"
        : /iPad/.test(agent) ? "iPad"
            : /Android/.test(agent) ? "Android"
                : /Mac/.test(agent) ? "Mac"
                    : /Windows/.test(agent) ? "Windows"
                        : /Linux/.test(agent) ? "Linux" : "";
    const browser = /Edg\//.test(agent) ? "Edge"
        : /Firefox\//.test(agent) ? "Firefox"
            : /Chrome\//.test(agent) ? "Chrome"
                : /Safari\//.test(agent) ? "Safari" : "";
    return [browser, device].filter(Boolean).join(" on ");
}

/** Loads your device list and the person map once the key is there. */
export async function startAccount() {
    await apply();
}

// ---------------------------------------------------------------- telling people

on<unknown>(TYPE, (payload) => void receiveAccount(payload));

const told = new Map<string, number>();
const waiting = new Set<string>();
const heard = new WeakSet<Room>();

const version = (data: AccountData) => data.links.length * 1_000 + data.removed.length;

function tell(uid: string) {
    waiting.delete(uid);
    const data = ownAccount();
    const stamp = version(data);
    if (stamp === 0 || told.get(uid) === stamp) return;
    const sent = peerOf(uid) && lobbyClient() ? quietSend(uid, TYPE, data) : allRooms().some(room => room.sendTo(uid, TYPE, data));
    if (sent) told.set(uid, stamp);
}

function schedule(uid: string) {
    if (waiting.has(uid)) return;
    waiting.add(uid);
    setTimeout(() => tell(uid), TELL_DELAY_MS);
}

effect(() => {
    account();
    for (const person of members()) schedule(person.uid);
    for (const summary of rooms())
    {
        const room = getRoom(summary.id);
        if (room && !heard.has(room))
        {
            heard.add(room);
            room.onMessage<unknown>(TYPE, (payload) => void receiveAccount(payload));
        }
        for (const person of summary.participants) schedule(person.uid);
    }
});
