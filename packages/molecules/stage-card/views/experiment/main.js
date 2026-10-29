import "@papit/codeblock";
import '@papchat/stage-card';
import { translator } from '@papit/translator';

translator.add({ id: "en", url: "/translations/en.json" });
translator.change("en");

const log = document.getElementById("log");
document.addEventListener("watch", (e) =>
{
    log.textContent = `watch → ${e.detail.id}`;
});

const stage = (id, title, name, viewers, mine = false) => ({
    id, title, viewers, mine,
    presenter: { v: 1, uid: `u-${id}`, name, color: "", status: "available" },
});

// every card is made with createElement + the `stage` property
function card(target, s)
{
    const el = document.createElement("pc-stage-card");
    el.stage = s;
    document.getElementById(target).append(el);
    return el;
}

card("states", stage("s1", "Friday demo", "Anna Berg", 12));
card("states", stage("s2", "My own broadcast", "Henry Pap", 3, true));
card("states", stage("s3", "A very long broadcast title that keeps going and going until it has to be cut off", "Maximiliana Wilhelmina von Habsburg", 1204));
card("states", stage("s4", "Just started", "Åsa Öberg", 0));

const live = card("created", stage("s5", "Live updates", "Bob Stone", 1));
let n = 1;
setInterval(() =>
{
    n++;
    live.stage = { ...live.stage, viewers: n };
}, 2000);

