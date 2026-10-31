import { effect } from "@papit/signals";

import { LIMITS } from "./config";
import { cleanGif } from "./gif";
import { canSave, conversations, loadMessages, outbox, saveMessages, setViewing, unsent, viewing } from "./history";
import { openChat } from "./invites";
import { peerOf } from "./lobby";
import { log } from "./log";
import { samePerson } from "./people";
import { allRooms, directRoom, Room, selectRoom } from "./room";
import { me, members } from "./state";
import type { ChatMessage, Conversation, ConversationMember, Gif, Profile } from "./types";

// Saved conversations nobody is online for: what's on screen when a chat has no room, and getting
// what you wrote there delivered once someone is back. Delivery needs both people online at once.

// a room that didn't get them their messages isn't tried again right away
const RETRY_MS = 30_000;
const tried = new Map<string, number>();

/** A saved conversation's member, as the components show people. */
export function memberProfile(member: ConversationMember): Profile {
    return { v: 2, uid: member.uid, key: "", name: member.name, color: member.color, status: "available" };
}

function openRoom(id: string): Room | null {
    return allRooms().find(room => room.status() !== "closed" && room.conversationId === id) ?? null;
}

const onlineMembers = (conversation: Conversation) => conversation.members.filter(member => peerOf(member.uid));

async function show(conversation: Conversation) {
    const [recent, waiting] = await Promise.all([loadMessages(conversation.id), unsent(conversation.id)]);
    const seen = new Set(recent.map(message => message.id));
    setViewing({ conversation, messages: [...recent, ...waiting.filter(message => !seen.has(message.id))] });
}

/** Opens a saved conversation: in its room, in a new 1:1 when the person is online, else just its history. */
export async function openConversation(id: string) {
    const conversation = conversations().find(entry => entry.id === id);
    if (!conversation) return;

    const room = openRoom(id);
    if (room)
    {
        selectRoom(room.id);
        return;
    }
    if (conversation.direct && peerOf(conversation.direct))
    {
        await openChat(conversation.direct);
        return;
    }
    selectRoom(null);
    await show(conversation);
}

/** The conversation on screen again, after something changed it. */
export async function refreshViewing() {
    const current = viewing();
    if (!current) return;
    const conversation = conversations().find(entry => entry.id === current.conversation.id) ?? current.conversation;
    await show(conversation);
}

/** Pages older messages into the conversation on screen. */
export async function loadOlderViewing() {
    const current = viewing();
    const first = current?.messages[0];
    if (!current || !first) return;
    const older = await loadMessages(current.conversation.id, LIMITS.historyPage, first.at);
    const known = new Set(current.messages.map(message => message.id));
    const fresh = older.filter(message => !known.has(message.id));
    if (fresh.length > 0 && viewing() === current) setViewing({ ...current, messages: [...fresh, ...current.messages] });
}

/**
 * Writes to the conversation on screen, which has no room: the message waits in the outbox until
 * someone is around. False when it can't be kept (saving is off) or there's nothing to send.
 */
export function sendSaved(text: string, gif?: Gif): boolean {
    const current = viewing();
    const profile = me();
    const sent = gif ? cleanGif(gif) : null;
    const clean = sent ? sent.url : String(text ?? "").trim().slice(0, LIMITS.messageChars);
    if (!current || !profile || !clean || !canSave()) return false;

    const message: ChatMessage = { id: crypto.randomUUID(), uid: profile.uid, at: Date.now(), variant: sent ? "gif" : "text", text: clean, state: "failed", ...(sent ? { gif: sent } : {}) };
    setViewing({ ...current, messages: [...current.messages, message] });
    void saveMessages(current.conversation, [message], { replace: true });
    return true;
}

async function reopenGroup(conversation: Conversation) {
    const room = await Room.create("chat", conversation.title, { conversation: conversation.id });
    for (const member of onlineMembers(conversation)) room.invite(member.uid, "chat");
}

// someone with a message waiting is online and has no room with us: make one, and the room sends it
async function deliver() {
    const now = Date.now();
    for (const id of Object.keys(outbox()))
    {
        if (now - (tried.get(id) ?? 0) < RETRY_MS) continue;
        const conversation = conversations().find(entry => entry.id === id);
        if (!conversation) continue;

        const person = conversation.direct;
        if (person)
        {
            if (!peerOf(person) || directRoom(person)?.participants().some(p => samePerson(p.uid, person))) continue;
            tried.set(id, now);
            await openChat(person, { quiet: true });
        }
        else if (!openRoom(id) && onlineMembers(conversation).length > 0)
        {
            tried.set(id, now);
            await reopenGroup(conversation).catch(error => log("chats: reopening failed", id, error));
        }
    }
}

effect(() => {
    members();
    outbox();
    conversations();
    setTimeout(() => void deliver(), 0);
});
