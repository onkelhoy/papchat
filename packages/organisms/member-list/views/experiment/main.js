import "@papit/codeblock";
import '@papchat/member-list';
import { translator } from '@papit/translator';

translator.add({ id: "en", url: "/translations/en.json" });
translator.change("en");

const log = document.getElementById("log");
document.addEventListener("member-action", (e) =>
{
    log.textContent = `member-action → ${e.detail.action} (${e.detail.uid})`;
});

const profile = (uid, name, status, color = "") => ({ v: 1, uid, name, status, color });

const me = profile("u-me", "Henry Pap", "available", "#4f46e5");
const members = [
    profile("u-dan", "Dan Ro", "dnd"),
    profile("u-bob", "Bob Lind", "busy"),
    profile("u-asa", "Åsa Öberg", "away"),
    profile("u-anna", "Anna Berg", "available"),
    profile("u-cleo", "Cleo Ek", "available"),
    profile("u-long", "Maximiliana Wilhelmina von Habsburg-Lothringen-Stuart", "away"),
];

const stage = (id, title, presenter, viewers, mine = false) => ({ id, title, presenter, viewers, mine });
const stages = [
    stage("s1", "Friday demo", members[3], 12),
    stage("s2", "My own broadcast", me, 3, true),
];

document.addEventListener("watch", (e) =>
{
    log.textContent = `watch → ${e.detail.id}`;
});

const full = document.getElementById("full");
full.stages = stages;
full.me = me;
full.members = members;
full.incall = ["u-bob"];

document.getElementById("empty").me = me;

// createElement + members arriving over time
const created = document.createElement("pc-member-list");
created.me = me;
created.members = [];
document.getElementById("created").append(created);

const later = [
    profile("u-n1", "Nora Vik", "available"),
    profile("u-n2", "Olle Sand", "busy"),
    profile("u-n3", "Pia Lund", "away"),
];
let i = 0;
setInterval(() =>
{
    created.members = i < later.length ? [...created.members, later[i++]] : [];
    if (i > later.length) i = 0;
}, 3000);
