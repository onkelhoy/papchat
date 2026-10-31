import { signal } from "@papit/signals";

import { storage } from "./storage";

// Who is who: one person can have several devices, each with its own uid (keys.ts). A person is known
// by the smallest uid of their devices, so everyone agrees with no coordinator. This file only keeps
// the map; `account.ts` fills it from links it has verified.

/** uid → the uid that stands for that person. Someone with one device isn't listed. */
export const [people, setPeople] = signal<Record<string, string>>(storage.people.get());

/** The uid that stands for whoever owns `uid`. */
export function personOf(uid: string): string {
    return people()[uid] ?? uid;
}

/** True when both uids belong to the same person. */
export function samePerson(a: string, b: string): boolean {
    return personOf(a) === personOf(b);
}

/** Every uid of whoever owns `uid`, `uid` itself included. */
export function devicesOf(uid: string): string[] {
    const person = personOf(uid);
    const list = Object.entries(people()).filter(([, owner]) => owner === person).map(([device]) => device);
    return list.includes(uid) ? list : [uid, ...list];
}

/** Records that `uids` are one person. Returns every uid whose person changed, with the old one. */
export function setPerson(uids: string[]): [string, string][] {
    const owner = [...uids].sort()[0];
    const next = { ...people() };
    const moved: [string, string][] = [];
    for (const uid of uids)
    {
        const before = next[uid] ?? uid;
        if (before !== owner) moved.push([uid, before]);
        if (uid === owner && uids.length === 1) delete next[uid];
        else next[uid] = owner;
    }
    storage.people.set(next);
    setPeople(next);
    return moved;
}
