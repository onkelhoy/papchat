import { translator } from '@papit/translator';
import '@papchat/connection-status';

translator.add({ id: "en", url: "/en.json" });
translator.change("en");

const statuses = ["connecting", "waking", "connected", "reconnecting", "closed"];
const created = document.createElement("pc-connection-status");
created.status = "connecting";
document.getElementById("created").append(created);

let index = 0;
setInterval(() => {
    index = (index + 1) % statuses.length;
    created.status = statuses[index];
}, 2000);
