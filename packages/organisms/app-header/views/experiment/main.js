import { translator } from '@papit/translator';
import '@papchat/app-header';

translator.add({ id: "en", url: "/translations/en.json" });
translator.change("en");

const me = { v: 1, uid: "u1", name: "Anna Berg", color: "#4f46e5", status: "available" };
const log = document.getElementById("log");

for (const header of document.querySelectorAll("pc-app-header[data-me]"))
{
    header.me = me;
}

for (const type of ["status-change", "language-change", "open-settings", "go-live", "end-live"])
{
    document.addEventListener(type, (e) =>
    {
        log.textContent = `${type} ${e.detail ? JSON.stringify(e.detail) : ""}`;

        if (type === "status-change")
        {
            e.target.me = { ...e.target.me, status: e.detail.status };
        }
        if (type === "language-change")
        {
            e.target.language = e.detail.value;
        }
    });
}

// created in code
const created = document.createElement("pc-app-header");
created.me = { ...me, name: "Bob Lind", uid: "u2", color: "#0f766e", status: "busy" };
created.status = "reconnecting";
document.getElementById("created").append(created);
