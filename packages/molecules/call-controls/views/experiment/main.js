import '@papchat/call-controls';
import { translator } from '@papit/translator';

translator.add({ id: "en", url: "/translations/en.json" });
translator.change("en");

const log = document.getElementById("log");
const lines = [];
function write(text)
{
    lines.unshift(text);
    log.textContent = lines.slice(0, 5).join("\n");
}

// the demo plays the page: flip the state of the interactive instance on toggle
const main = document.getElementById("main");
document.addEventListener("toggle", (e) => {
    if (!e.detail || !e.detail.control) return;
    write(`toggle → ${e.detail.control}`);
    if (e.target === main) main[e.detail.control] = !main[e.detail.control];
});
document.addEventListener("invite", () => write("invite"));
document.addEventListener("devices", () => write("devices"));
document.addEventListener("hangup", () => write("hangup"));

const created = document.createElement("pc-call-controls");
created.mic = true;
created.screen = true;
document.getElementById("created").append(created);
