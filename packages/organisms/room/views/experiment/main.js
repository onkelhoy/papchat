import "@papit/codeblock";
import '@papchat/room';
import { translator } from '@papit/translator';

translator.add({ id: "en", url: "/translations/en.json" });
translator.change("en");

const profile = (uid, name, color) => ({ v: 1, uid, name, color, status: "available" });
const me = profile("me", "Me", "#4f46e5");
const anna = profile("anna", "Anna Berg", "#db2777");
const bob = profile("bob", "Bob Lind", "#059669");
const profiles = { me, anna, bob };
const now = Date.now();
const messages = [
    { id: "1", uid: "anna", text: "Hi! Join the call?", at: now - 60000 },
    { id: "2", uid: "me", text: "On my way", at: now - 30000 },
];

const files = [
    { fid: "f1", uid: "anna", name: "notes.pdf", size: 482000, type: "application/pdf", at: now - 45000, state: "done", progress: 1 },
    { fid: "f2", uid: "me", name: "holiday.zip", size: 52000000, type: "application/zip", at: now - 20000, state: "sending", progress: 0.4 },
];
messages.push(...files.map(f => ({ id: `file:${f.fid}`, uid: f.uid, at: f.at, variant: "file", text: "", fid: f.fid })));
messages.sort((a, b) => a.at - b.at);

function fill(room)
{
    room.heading = "Anna Berg";
    room.me = "me";
    room.messages = messages;
    room.files = files;
    room.profiles = profiles;
    room.participants = [me, anna, bob];
    room.tiles = [
        { id: "me", profile: me, self: true },
        { id: "anna", profile: anna },
        { id: "bob", profile: bob, muted: true },
    ];
    room.mic = true;
    room.addEventListener("call", (e) => console.log("call", e.detail));
    room.addEventListener("toggle", (e) =>
    {
        const control = e.detail.control;
        if (control in room) room[control] = !room[control];
    });
}

document.querySelectorAll("pc-room").forEach(fill);

const created = document.createElement("pc-room");
created.className = "demo";
created.setAttribute("incall", "");
fill(created);
document.getElementById("created").append(created);
