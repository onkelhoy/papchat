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
document.addEventListener("files", (e) => write(`files → ${e.detail.files.map(f => f.name).join(", ")}`));

const created = document.createElement("pc-composer");
created.placeholder = "Created with createElement";
document.getElementById("created").append(created);
