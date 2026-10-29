import "@papit/codeblock";
import { translator } from '@papit/translator';

import '@papchat/incoming-call';

translator.add({ id: "en", url: "/translations/en.json" });
translator.change("en");

const anna = { uid: "u1", name: "Anna Berg", color: "#6d4aff", status: "available" };
const bob = { uid: "u2", name: "Bob", color: "#0b7a5a", status: "available" };
const at = Date.now();

const calls = {
    call: { id: "c1", from: anna, kind: "call", title: "", at },
    video: { id: "c2", from: bob, kind: "video", title: "", at },
    stage: { id: "c3", from: anna, kind: "stage", title: "Demo", at },
    chat: { id: "c4", from: bob, kind: "chat", title: "Project room", at },
};
for (const [id, call] of Object.entries(calls)) document.getElementById(id).call = call;

const log = document.getElementById("log");
document.addEventListener("accept", (e) => { log.textContent = `accept ${JSON.stringify(e.detail)}`; });
document.addEventListener("decline", (e) => { log.textContent = `decline ${JSON.stringify(e.detail)}`; });

const created = document.createElement("pc-incoming-call");
created.call = { id: "c6", from: { uid: "u3", name: "Created Cleo", color: "#b3261e", status: "available" }, kind: "video", title: "", at };
document.getElementById("created").append(created);
