import '@papchat/member-item';
import { translator } from '@papit/translator';

translator.add({ id: "en", url: "/translations/en.json" });
translator.change("en");

const log = document.getElementById("log");
document.addEventListener("member-files", (e) =>
{
    log.textContent = `member-files → ${e.detail.files.map(f => f.name).join(", ")} (${e.detail.uid})`;
});
document.addEventListener("member-action", (e) =>
{
    log.textContent = `member-action → ${e.detail.action} (${e.detail.uid})`;
});

const profile = (uid, name, status, color = "") => ({ v: 1, uid, name, status, color });

// every row is made with createElement + properties: `profile` is property-only
function item(target, p, flags = {})
{
    const el = document.createElement("pc-member-item");
    el.profile = p;
    Object.assign(el, flags);
    document.getElementById(target).append(el);
    return el;
}

item("statuses", profile("u-anna", "Anna Berg", "available"));
item("statuses", profile("u-bob", "Bob Stone", "busy"));
item("statuses", profile("u-asa", "Åsa Öberg", "away"));
item("statuses", profile("u-li", "李 小龙", "dnd"));

item("flags", profile("u-me", "Henry Pap", "available", "oklch(45% 0.2 300)"), { self: true });
item("flags", profile("u-me2", "Henry Pap", "busy"), { self: true, incall: true });
item("flags", profile("u-call", "Carla In-Call", "busy"), { incall: true });
item("flags", profile("u-inv", "Ivan Invitable", "available"), { canInvite: true });
item("flags", profile("u-long", "Maximiliana Wilhelmina von Habsburg-Lothringen-Stuart", "away"), { incall: true, canInvite: true });

// property changes after connect: status flips every 2 s
const live = item("created", profile("u-live", "Live Updates", "available"));
const cycle = ["available", "busy", "away", "dnd"];
let i = 0;
setInterval(() =>
{
    i = (i + 1) % cycle.length;
    live.profile = { ...live.profile, status: cycle[i] };
}, 2000);
item("created", profile("u-new", "Created Element", "available"), { canInvite: true });

item("dark", profile("u-me", "Henry Pap", "available"), { self: true });
item("dark", profile("u-anna", "Anna Berg", "available"), { incall: true });
item("dark", profile("u-bob", "Bob Stone", "busy"), { canInvite: true });
item("dark", profile("u-asa", "Åsa Öberg", "away"));
item("dark", profile("u-li", "李 小龙", "dnd"));
