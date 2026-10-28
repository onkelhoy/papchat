import { translator } from '@papit/translator';

import '@papchat/toaster';

translator.add({ id: "en", url: "/translations/en.json" });
translator.change("en");

let n = 0;
const kinds = ["info", "success", "warning", "error"];
const make = (extra = {}) => ({ id: `t${++n}`, kind: kinds[n % 4], text: `Toast number ${n}`, ...extra });

const log = document.getElementById("log");
const toasters = [...document.querySelectorAll("pc-toaster")];

for (const toaster of toasters)
{
    toaster.addEventListener("dismiss", (e) =>
    {
        log.textContent = `dismiss ${e.detail.id}`;
        toaster.toasts = toaster.toasts.filter(t => t.id !== e.detail.id);
    });
    toaster.addEventListener("action", (e) =>
    {
        log.textContent = `action ${e.detail.id}`;
        toaster.toasts.find(t => t.id === e.detail.id)?.onAction?.();
    });
}

const [basic, overflow, dark] = toasters;
basic.toasts = [
    make({ kind: "info", text: "Connecting to the lobby", duration: 0 }),
    make({ kind: "warning", text: "Bob is unreachable", action: "Retry", duration: 0, onAction: () => { log.textContent = "onAction called (page runs it)"; } }),
    make({ kind: "success", text: "Auto dismisses after 5 s" }),
];
overflow.toasts = Array.from({ length: 6 }, (_, i) => make({ text: `Sticky ${i + 1} (only the newest 4 show)`, duration: 0 }));
dark.toasts = [
    make({ kind: "error", text: "Connection lost", action: "Reconnect", duration: 0 }),
    make({ kind: "success", text: "Invite sent", duration: 0 }),
];

document.getElementById("add").addEventListener("click", () =>
{
    basic.toasts = [...basic.toasts, make({ duration: 4000 })];
});

// createElement
const created = document.createElement("pc-toaster");
created.toasts = [make({ text: "Created with createElement", duration: 0 })];
document.getElementById("created").append(created);
