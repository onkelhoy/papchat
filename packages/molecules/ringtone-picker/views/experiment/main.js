import "@papit/codeblock";
import '@papchat/ringtone-picker';
import { translator } from '@papit/translator';

translator.add({ id: "en", url: "/translations/en.json" });
translator.change("en");

const tones = [
    { id: "classic", label: "Classic" },
    { id: "chime", label: "Chime" },
    { id: "marimba", label: "Marimba" },
];

const log = document.getElementById("log");

function wire(picker) {
    let timer;
    picker.addEventListener("change", (e) => { log.textContent = `change → ${JSON.stringify(e.detail)}`; });
    picker.addEventListener("volume", (e) => { log.textContent = `volume → ${JSON.stringify(e.detail)}`; });
    picker.addEventListener("preview", (e) => {
        log.textContent = `preview → ${JSON.stringify(e.detail)}`;
        picker.playing = e.detail.id;
        clearTimeout(timer);
        timer = setTimeout(() => { picker.playing = ""; }, 2000);
    });
    picker.addEventListener("preview-stop", () => {
        log.textContent = "preview-stop";
        clearTimeout(timer);
        picker.playing = "";
    });
}

// arrays are properties (no attribute binding for objects)
const main = document.getElementById("main");
main.tones = tones;
main.value = "chime";
main.volume = 0.6;

const single = document.getElementById("single");
single.tones = tones.slice(0, 1);
single.volume = 1;

const created = document.createElement("pc-ringtone-picker");
created.tones = tones;
created.value = "classic";
created.volume = 0.4;
document.getElementById("created").append(created);

document.querySelectorAll("pc-ringtone-picker").forEach(wire);
