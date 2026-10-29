import "@papit/codeblock";
import '@papchat/emoji-picker';
import { translator } from '@papit/translator';

translator.add({ id: "en", url: "/translations/en.json" });
translator.change("en");

const log = document.getElementById("log");
document.addEventListener("emoji-pick", (e) =>
{
    log.textContent = `emoji-pick → ${e.detail.emoji} (${e.detail.name})`;
});

const created = document.createElement("pc-emoji-picker");
created.className = "box";
created.recent = ["🚀"];
created.query = "cat";
document.getElementById("created").append(created);
