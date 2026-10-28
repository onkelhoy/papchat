import '@papchat/invite-picker';
import { translator } from '@papit/translator';

translator.add({ id: "en", url: "/translations/en.json" });
translator.change("en");

const log = document.getElementById("log");

const members = [
    { uid: "u1", name: "Anna Berg", color: "#2563eb", status: "available" },
    { uid: "u2", name: "Bo Lindqvist", color: "#7c3aed", status: "busy" },
    { uid: "u3", name: "Cecilia Strand", color: "#db2777", status: "away" },
    { uid: "u4", name: "David", color: "#16a34a", status: "dnd" },
    { uid: "u5", name: "Elin Ås-Nilsson with a rather long name", color: "#ea580c", status: "available" },
    { uid: "u6", name: "<b>Eve</b>", color: "#0d9488", status: "available" },
];

function wire(picker) {
    picker.addEventListener("invite", (e) => {
        log.textContent = `invite → ${JSON.stringify(e.detail)}`;
        picker.open = false;
    });
    picker.addEventListener("close", () => {
        log.textContent = "close";
    });
}

document.querySelectorAll("pc-invite-picker").forEach(wire);
for (const id of ["many", "dark"]) document.getElementById(id).members = members;
document.getElementById("empty").members = [];

document.querySelectorAll("[data-open]").forEach((button) => {
    button.addEventListener("click", () => {
        document.getElementById(button.dataset.open).open = true;
    });
});

const created = document.createElement("pc-invite-picker");
created.members = members.slice(0, 3);
wire(created);
document.getElementById("created").append(created);
document.getElementById("open-created").addEventListener("click", () => {
    created.open = true;
});
