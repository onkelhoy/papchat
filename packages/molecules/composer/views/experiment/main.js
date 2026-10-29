import "@papit/codeblock";
import '@papchat/composer';
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

document.addEventListener("send", (e) => write(`send → ${JSON.stringify(e.detail.text)}`));
document.addEventListener("typing", () => write("typing"));
document.addEventListener("emoji", (e) => write(`emoji → ${e.detail.emoji}`));
document.addEventListener("files", (e) => write(`files → ${e.detail.files.map(f => f.name).join(", ")}`));

const created = document.createElement("pc-composer");
created.placeholder = "Created with createElement";
document.getElementById("created").append(created);

// the host keeps the recent list (the app stores it in prefs)
const recent = ["🎉", "👍"];
document.querySelectorAll("pc-composer").forEach(composer => { composer.recent = recent; });
document.addEventListener("emoji", (e) =>
{
    const next = [e.detail.emoji, ...recent.filter(other => other !== e.detail.emoji)].slice(0, 24);
    recent.splice(0, recent.length, ...next);
    document.querySelectorAll("pc-composer").forEach(composer => { composer.recent = [...recent]; });
});
