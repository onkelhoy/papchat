import "@papit/codeblock";
import { translator } from '@papit/translator';
import '@papchat/network-picker';

translator.add({ id: "en", url: "/en.json" });
translator.change("en");

const networks = [
    { name: "", members: 12, locked: false },
    { name: "book club", members: 3, locked: false },
    { name: "team", members: 5, locked: true },
];
const log = document.getElementById("log");
for (const id of ["picker", "private"])
{
    const picker = document.getElementById(id);
    picker.networks = networks;
    picker.addEventListener("network-change", (e) => { log.textContent = `network-change ${JSON.stringify(e.detail)}`; });
    picker.addEventListener("networks-refresh", () => { log.textContent = "networks-refresh"; });
}
