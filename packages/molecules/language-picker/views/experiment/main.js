import '@papchat/language-picker';
import { translator } from '@papit/translator';

translator.add({ id: "en", url: "/translations/en.json" });
translator.change("en");

const log = document.getElementById("log");
document.addEventListener("change", (e) =>
{
    if (e.target.localName !== "pc-language-picker") return;
    log.textContent = `change → ${e.detail.value}`;
});

const created = document.createElement("pc-language-picker");
created.value = "sv";
document.getElementById("created").append(created);

const custom = document.getElementById("custom");
custom.languages = [
    { code: "en", label: "English", flag: "/icons/flags/en.svg" },
    { code: "sv", label: "Svenska", flag: "/icons/flags/sv.svg" },
    { code: "xx", label: "No flag file", flag: "" },
];
