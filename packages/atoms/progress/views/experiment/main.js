import "@papit/codeblock";
import { translator } from '@papit/translator';
import '@papchat/progress';

translator.add({ id: "en", url: "/en.json" });
translator.change("en");

const created = document.getElementById("created");
const bar = document.createElement("pc-progress");
bar.label = "Created in code";
created.append(bar);

// indeterminate for a moment, then fills up
let value = 0;
setTimeout(() =>
{
    const timer = setInterval(() =>
    {
        value = Math.min(1, value + 0.05);
        bar.value = value;
        if (value >= 1) clearInterval(timer);
    }, 200);
}, 1500);
