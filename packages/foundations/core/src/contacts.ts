import { effect, signal } from "@papit/signals";

import { LIMITS } from "./config";
import { conversations } from "./history";
import { lobbyClient, on, peerOf } from "./lobby";
import { log } from "./log";
import { samePerson } from "./people";
import { pushToken } from "./push";
import { allRooms, getRoom, Room } from "./room";
import { me, members, rooms } from "./state";
import { storage } from "./storage";
import type { Contact, Profile } from "./types";

// People you can ring with nobody online: everyone you've connected with who has notifications on. A push
// token is too long for the 1 KB profile (it holds the whole subscription), so it travels in its own
// message, to each person once. What a member sends is proven to be from them, a link isn't, so a
// link only ever adds someone new.

const TYPE = "contact";
const TOKEN_MAX = 4_096;
// links need a moment after someone appears
const TELL_DELAY_MS = 3_000;

export const [contacts, setContacts] = signal<Contact[]>(storage.contacts.get());

function commit(list: Contact[]) {
    storage.contacts.set(list);
    setContacts(list);
}

export function contactOf(uid: string): Contact | null {
    return contacts().find(c => c.uid === uid) ?? null;
}

/** Newest first; the oldest drops out past `LIMITS.contacts`. Yourself is never a contact. */
/** Every saved device of a person, so a call wakes all of them. */
export function contactsOf(uid: string): Contact[] {
    return contacts().filter(contact => contact.token && samePerson(contact.uid, uid));
}

export function saveContact(next: Omit<Contact, "at">) {
    if (next.uid === me()?.uid) return;
    const others = storage.contacts.get().filter(c => c.uid !== next.uid);
    commit([{ ...next, at: Date.now() }, ...others].slice(0, LIMITS.contacts));
}

export function forgetContact(uid: string) {
    commit(storage.contacts.get().filter(c => c.uid !== uid));
}

/** A contact as the components show people. */
export function contactProfile(contact: Contact): Profile {
    return { v: 2, uid: contact.uid, key: "", name: contact.name, color: contact.color, status: "available" };
}

/** Saves someone from a contact link. False when they're you or already saved. */
export function addLinkedContact(contact: Omit<Contact, "at">): boolean {
    if (contact.uid === me()?.uid || contactOf(contact.uid)) return false;
    saveContact(contact);
    return true;
}

function receive(payload: unknown, profile: Profile | null) {
    if (!profile || typeof payload !== "object" || payload === null) return;
    const token = (payload as Record<string, unknown>).token;
    if (typeof token !== "string" || !token || token.length > TOKEN_MAX) return;
    log("contacts: saved", profile.uid);
    saveContact({ uid: profile.uid, name: profile.name, color: profile.color, token });
}

on<unknown>(TYPE, (payload, from) => receive(payload, from.profile));

// uids told the current token, whichever way it reached them
const told = new Set<string>();
const waiting = new Set<string>();
const heard = new WeakSet<Room>();
let toldToken = "";

function tell(uid: string) {
    waiting.delete(uid);
    const token = pushToken();
    if (!token || told.has(uid)) return;
    if (reachLobby(uid, token) || allRooms().some(room => room.sendTo(uid, TYPE, { token }))) told.add(uid);
}

// not lobby `send`: nobody asked for this message, so an unreachable peer is no reason for a toast
function reachLobby(uid: string, token: string): boolean {
    const peer = peerOf(uid);
    if (!peer) return false;
    try
    {
        return lobbyClient()?.send(peer, TYPE, { token }) ?? false;
    }
    catch (error)
    {
        log("contacts: send failed", error);
        return false;
    }
}

function schedule(uid: string) {
    if (told.has(uid) || waiting.has(uid)) return;
    waiting.add(uid);
    setTimeout(() => tell(uid), TELL_DELAY_MS);
}

// a name or colour changes while someone is around: keep what's saved in step, later than the effect
function refresh(profile: Profile) {
    const contact = contactOf(profile.uid);
    if (contact && (contact.name !== profile.name || contact.color !== profile.color))
    {
        setTimeout(() => saveContact({ ...contact, name: profile.name, color: profile.color }), 0);
    }
}

effect(() => {
    const token = pushToken();
    if (token !== toldToken)
    {
        toldToken = token;
        told.clear();
    }

    const people = members();
    for (const summary of rooms())
    {
        const room = getRoom(summary.id);
        if (room && !heard.has(room))
        {
            heard.add(room);
            room.onMessage<unknown>(TYPE, (payload, from) => receive(payload, from.profile));
        }
        for (const person of summary.participants)
        {
            refresh(person);
            if (token) schedule(person.uid);
        }
    }
    // the lobby is strangers: only someone you've connected with gets the code that rings this device
    const known = conversations().map(conversation => conversation.direct).filter(uid => uid !== null);
    for (const person of people)
    {
        refresh(person);
        if (token && (contactOf(person.uid) || known.some(uid => samePerson(uid, person.uid)))) schedule(person.uid);
    }
});
