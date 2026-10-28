// core
import { translator } from '@papit/translator';
import "@papchat/theme";
import "@papit/codeblock";

// component
import '@papchat/file-card';

// generated files so previews work without real files
function canvasPng() {
    const canvas = document.createElement("canvas");
    canvas.width = 320;
    canvas.height = 180;
    const ctx = canvas.getContext("2d");
    const gradient = ctx.createLinearGradient(0, 0, 320, 180);
    gradient.addColorStop(0, "#6366f1");
    gradient.addColorStop(1, "#ec4899");
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, 320, 180);
    return new Promise((resolve) => canvas.toBlob(resolve, "image/png"));
}

// 0.5 s of a 440 Hz tone as 8-bit mono WAV
function wavBlob() {
    const rate = 8000, samples = rate / 2;
    const buffer = new ArrayBuffer(44 + samples);
    const view = new DataView(buffer);
    const text = (offset, value) => { for (let i = 0; i < value.length; i++) view.setUint8(offset + i, value.charCodeAt(i)); };
    text(0, "RIFF"); view.setUint32(4, 36 + samples, true); text(8, "WAVE"); text(12, "fmt ");
    view.setUint32(16, 16, true); view.setUint16(20, 1, true); view.setUint16(22, 1, true);
    view.setUint32(24, rate, true); view.setUint32(28, rate, true); view.setUint16(32, 1, true); view.setUint16(34, 8, true);
    text(36, "data"); view.setUint32(40, samples, true);
    for (let i = 0; i < samples; i++) view.setUint8(44 + i, 128 + Math.round(Math.sin(i / rate * 440 * 2 * Math.PI) * 60));
    return new Blob([buffer], { type: "audio/wav" });
}

const png = await canvasPng();
const text = new Blob(["Hello from papchat\n"], { type: "text/plain" });
const wav = wavBlob();
const urls = [png, text, wav].map((blob) => URL.createObjectURL(blob));
window.addEventListener("pagehide", () => urls.forEach((url) => URL.revokeObjectURL(url)));
const [pngUrl, textUrl, wavUrl] = urls;

const now = Date.now();
let n = 0;
const file = (name, size, type, state, progress, url) => ({ fid: `f${n++}`, name, size, type, uid: "u-anna", at: now, state, progress, url });

const entries = [
    file("report-final.pdf", 4_200_000, "application/pdf", "receiving", 0.42),
    file("backup.zip", 83_000_000, "application/zip", "sending", 0.8),
    file("waiting-for-first-chunk.bin", 12_000, "application/octet-stream", "receiving", undefined),
    file("notes.txt", 19, "text/plain", "done", 1, textUrl),
    file("gradient.png", png.size, "image/png", "done", 1, pngUrl),
    file("tone.wav", wav.size, "audio/wav", "done", 1, wavUrl),
    file("old.mov", 2_000_000, "video/quicktime", "cancelled", 0.3),
    file("broken.iso", 1_500_000_000, "application/x-iso9660-image", "failed", 0.1),
    file("a-very-long-file-name-that-keeps-going-and-going-and-going-until-it-is-cut-off-with-an-ellipsis-somewhere.tar.gz", 1536, "application/gzip", "done", 1, textUrl),
    file("<img src=x onerror=alert(1)>.txt", 0, "text/plain", "done", 1, textUrl),
];

function fill(container, mine) {
    for (const entry of entries)
    {
        const el = document.createElement("pc-file-card");
        el.file = { ...entry, fid: `${entry.fid}${mine ? "m" : ""}` };
        el.mine = mine;
        container.append(el);
    }
}

const log = document.getElementById("log");
document.addEventListener("cancel", (e) => { log.textContent = `cancel events: ${JSON.stringify(e.detail)}`; });

for (const container of document.querySelectorAll("[data-set]")) fill(container, container.dataset.set === "mine");

const created = document.createElement("pc-file-card");
created.file = file("made-with-createElement.txt", 19, "text/plain", "sending", 0.25);
document.getElementById("created").append(created);

translator.add({ id: "en", url: "/en.json" });
translator.change("en");
