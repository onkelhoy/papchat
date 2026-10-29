import "@papit/codeblock";
import '@papchat/video-tile';
import { translator } from '@papit/translator';

translator.add({ id: "en", url: "/translations/en.json" });
translator.change("en");

// animated canvas → MediaStream, so no camera permission is needed
function makeVideo(hue)
{
    const canvas = document.createElement("canvas");
    canvas.width = 640;
    canvas.height = 360;
    const ctx = canvas.getContext("2d");

    const draw = (t) =>
    {
        ctx.fillStyle = `hsl(${hue}, 40%, 25%)`;
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        ctx.fillStyle = `hsl(${hue + 40}, 80%, 60%)`;
        const x = (Math.sin(t / 700) * 0.5 + 0.5) * (canvas.width - 80);
        ctx.fillRect(x, 140, 80, 80);
        requestAnimationFrame(draw);
    };
    requestAnimationFrame(draw);

    return canvas.captureStream(30);
}

// one oscillator, started by a button (AudioContext needs a gesture); every tile gets its own audio stream from it
let audioContext;
let oscillator;
const audioTiles = [];

function makeAudio()
{
    audioContext ??= new AudioContext();
    const destination = audioContext.createMediaStreamDestination();
    if (oscillator) oscillator.connect(destination);
    audioTiles.push(destination);
    return destination.stream;
}

document.getElementById("tone").addEventListener("click", () =>
{
    audioContext ??= new AudioContext();
    audioContext.resume();
    if (oscillator) return;

    oscillator = audioContext.createOscillator();
    oscillator.frequency.value = 220;
    const gain = audioContext.createGain();
    oscillator.connect(gain);
    for (const destination of audioTiles) gain.connect(destination);

    // pulse the volume so the meter moves and speaking switches on and off
    const pulse = () =>
    {
        const now = audioContext.currentTime;
        gain.gain.setValueAtTime(0.4, now);
        gain.gain.setValueAtTime(0, now + 1.5);
    };
    pulse();
    setInterval(pulse, 3000);
    oscillator.start();
});

let hue = 200;
for (const tile of document.querySelectorAll("pc-video-tile.demo"))
{
    const name = tile.dataset.name;
    tile.profile = { v: 1, uid: name.toLowerCase().replace(/\W+/g, "-"), name, color: "", status: "available" };
    if (tile.hasAttribute("data-video"))
    {
        tile.video = makeVideo(hue);
        hue += 50;
    }
    if (tile.hasAttribute("data-audio")) tile.audio = makeAudio();
}

const created = document.createElement("pc-video-tile");
created.className = "demo";
created.profile = { v: 1, uid: "created", name: "Created Tile", color: "", status: "available" };
created.video = makeVideo(300);
created.audio = makeAudio();
document.getElementById("created").append(created);

const log = document.getElementById("log");
document.addEventListener("pin", (e) => { log.textContent = `events: pin ${JSON.stringify(e.detail)}`; });
