// core
import { translator } from '@papit/translator';
import "@papit/codeblock";

// component
import '@papchat/message';

const now = Date.now();
const anna = { v: 1, uid: "u-anna", name: "Anna Berg", color: "oklch(50% 0.13 200)", status: "available" };
const me = { v: 1, uid: "u-me", name: "Henry", color: "oklch(50% 0.13 20)", status: "available" };
const msg = (uid, text, ago = 0, variant = "text") => ({ id: `${uid}-${ago}-${text.length}`, uid, at: now - ago, variant, text });

function fill(el, message, author, props = {}) {
    el.message = message;
    el.author = author;
    Object.assign(el, props);
}

for (const el of document.querySelectorAll("pc-message[data-demo]"))
{
    const d = el.dataset.demo;
    const author = d.startsWith("me") ? me : anna;
    const texts = {
        short: "Hello there",
        link: "Docs at https://papit.dev/docs?a=1&b=2, and (https://example.com/x). Nice!",
        multi: "line one\nline two\n\n  indented line three",
        long: "Averyveryveryveryveryveryveryveryveryveryveryveryveryveryveryveryveryveryveryverylongwordwithoutanyspaces and then more text to wrap around the bubble a few times over.",
        html: "<img src=x onerror=alert(1)> <b>not bold</b> &amp; <script>alert(2)</script>",
        system: "Anna joined",
        format: "**Bold**, *italic*, __underline__, ~~strike~~ and `code`.\n> a quote\n- one\n- two\n1. first\n2. second\n```\nconst x = \"<b>\";\n```\n[docs](https://papit.dev) and [bad](javascript:alert(1))",
    };
    const key = d.split("-")[1];
    fill(el, msg(author.uid, texts[key], 30_000 * (key === "short" ? 10 : 1), key === "system" ? "system" : "text"), author, {
        mine: d.startsWith("me"),
        grouped: d.endsWith("-grouped"),
    });
}

// where your own message got to: Sending, Sent, Not sent yet
for (const state of ["sending", "sent", "failed"])
{
    const el = document.createElement("pc-message");
    fill(el, { ...msg(me.uid, `A message that is ${state}`, 1000), state }, me, { mine: true });
    document.getElementById("states").append(el);
}

window.onload = () => {
    translator.add({ id: "en", url: "/en.json" });
    translator.change("en");
}
