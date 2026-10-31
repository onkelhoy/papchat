import "@papit/codeblock";
import { translator } from '@papit/translator';

import '@papchat/toast';

translator.add({ id: "en", url: "/translations/en.json" });
translator.change("en");

const log = document.getElementById("log");
document.addEventListener("dismiss", (e) => { log.textContent = `dismiss (${e.target.text})`; }, true);
document.addEventListener("action", (e) => { log.textContent = `action (${e.target.text})`; }, true);
