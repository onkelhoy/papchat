import "@papit/codeblock";
import { translator } from '@papit/translator';
import '@papchat/room-list';

translator.add({ id: "en", url: "/translations/en.json" });
translator.change("en");

const anna = { v: 1, uid: "u1", name: "Anna Berg", color: "#4f46e5", status: "available" };
const bob = { v: 1, uid: "u2", name: "Bob Lind", color: "#0f766e", status: "busy" };
const cleo = { v: 1, uid: "u3", name: "Cleo Ek", color: "#b45309", status: "away" };
const dan = { v: 1, uid: "u4", name: "Dan Ro", color: "#be123c", status: "dnd" };

const rooms = [
    { id: "r1", kind: "chat", title: "", participants: [anna], unread: 3, incall: false, live: false },
    { id: "r2", kind: "video", title: "Standup", participants: [anna, bob, cleo, dan], unread: 0, incall: true, live: false },
    { id: "r3", kind: "stage", title: "Demo day with a very long title that has to be truncated", participants: [bob], unread: 120, incall: false, live: true },
    { id: "r4", kind: "chat", title: "", participants: [cleo, dan], unread: 0, incall: false, live: false },
];

const log = document.getElementById("log");
document.addEventListener("select", (e) =>
{
    if (e.target.localName !== "pc-room-list") return;
    log.textContent = `select → ${e.detail.id}`;
    e.target.active = e.detail.id;
});
document.addEventListener("leave", (e) =>
{
    if (e.target.localName !== "pc-room-list") return;
    log.textContent = `leave → ${e.detail.id}`;
    e.target.rooms = e.target.rooms.filter(r => r.id !== e.detail.id);
});

for (const list of document.querySelectorAll("pc-room-list[data-demo]"))
{
    list.rooms = rooms;
}

const created = document.createElement("pc-room-list");
created.rooms = rooms.slice(0, 2);
created.active = "r2";
document.getElementById("created").append(created);
