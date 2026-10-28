import { translator } from '@papit/translator';
import "@papchat/theme";
import '@papchat/conversation';

translator.add({ id: "en", url: "/translations/en.json" });
translator.change("en");

const now = Date.now();
const MIN = 60_000;
const anna = { v: 1, uid: "u-anna", name: "Anna Berg", color: "oklch(50% 0.13 200)", status: "available" };
const bob = { v: 1, uid: "u-bob", name: "Bob Lind", color: "oklch(50% 0.13 140)", status: "busy" };
const me = { v: 1, uid: "u-me", name: "Henry", color: "oklch(50% 0.13 20)", status: "available" };
const profiles = { [anna.uid]: anna, [bob.uid]: bob, [me.uid]: me };

let n = 0;
const msg = (uid, text, ago, variant = "text") => ({ id: `m${n++}`, uid, at: now - ago, variant, text });

function seed() {
    return [
        msg(anna.uid, "Anna joined", 30 * MIN, "system"),
        msg(anna.uid, "Hi! Did you see https://papit.dev?", 20 * MIN),
        msg(anna.uid, "It has the new webrtc package", 19.5 * MIN),
        msg(me.uid, "Not yet, looking now", 19 * MIN),
        msg(me.uid, "Line one\nline two", 18.8 * MIN),
        msg(anna.uid, "Great. Two minutes later, so this one is not grouped", 15 * MIN),
        msg(bob.uid, "<b>not bold</b> hello from Bob", 10 * MIN),
        ...Array.from({ length: 8 }, (_, i) => msg(i % 2 ? me.uid : anna.uid, `Filler message ${i + 1}`, (9 - i) * MIN)),
    ];
}

function setup(el, { typing = [], heading } = {}) {
    el.profiles = profiles;
    el.me = me.uid;
    el.messages = seed();
    el.typing = typing;
    if (heading) el.heading = heading;
}

const live = document.getElementById("live");
setup(live, { heading: "Anna Berg" });

const dark = document.getElementById("dark");
setup(dark, { typing: [anna.uid, bob.uid, "u-x"] });

const log = document.getElementById("log");
for (const type of ["send", "typing", "files"])
{
    live.addEventListener(type, (e) => {
        log.textContent = `${type} ${JSON.stringify(e.detail ?? null, (k, v) => v instanceof File ? v.name : v)}`;
        if (type === "send") live.messages = [...live.messages, msg(me.uid, e.detail.text, 0)];
    });
}

document.getElementById("incoming").onclick = () => {
    live.messages = [...live.messages, msg(anna.uid, `Incoming ${n}`, 0)];
};
document.getElementById("typing").onclick = () => {
    live.typing = live.typing.length ? [] : [anna.uid, bob.uid];
};

const created = document.createElement("pc-conversation");
setup(created, { typing: [anna.uid] });
document.getElementById("created").append(created);
