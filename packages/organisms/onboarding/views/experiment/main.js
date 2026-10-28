import '@papchat/onboarding';
import { translator } from '@papit/translator';

translator.add({ id: "en", url: "/translations/en.json" });
translator.change("en");

const log = document.getElementById("log");

function wire(onboarding) {
    onboarding.addEventListener("submit", (e) => {
        log.textContent = `submit → ${JSON.stringify(e.detail)}`;
        onboarding.open = false;
    });
    onboarding.addEventListener("language-change", (e) => {
        log.textContent = `language-change → ${e.detail.value}`;
    });
}

document.querySelectorAll("pc-onboarding").forEach(wire);

document.querySelectorAll("[data-open]").forEach((button) => {
    button.addEventListener("click", () => {
        document.getElementById(button.dataset.open).open = true;
    });
});

document.getElementById("custom").colors = ["#111827", "#6b7280", "#0ea5e9", "#f43f5e"];

const created = document.createElement("pc-onboarding");
created.name = "Created";
wire(created);
document.getElementById("created").append(created);
document.getElementById("open-created").addEventListener("click", () => {
    created.open = true;
});
