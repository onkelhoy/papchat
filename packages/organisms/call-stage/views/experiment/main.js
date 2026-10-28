import '@papchat/call-stage';
import '@papchat/theme';
import { translator } from '@papit/translator';

translator.add({ id: "en", url: "/translations/en.json" });
translator.change("en");

const NAMES = ["Anna Berg", "Bob Lind", "Cleo Dahl", "Dan Ek", "Eva Fors", "Finn Gil", "Gus Holm", "Ida Jo"];

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
        ctx.fillRect((Math.sin(t / 700) * 0.5 + 0.5) * (canvas.width - 80), 140, 80, 80);
        requestAnimationFrame(draw);
    };
    requestAnimationFrame(draw);

    return canvas.captureStream(30);
}

// one quiet tone shared by all remote tiles (AudioContext needs a gesture)
let audioContext;
let oscillator;
const destinations = [];

function makeAudio()
{
    audioContext ??= new AudioContext();
    const destination = audioContext.createMediaStreamDestination();
    destinations.push(destination);
    if (oscillator) oscillator.connect(destination);
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
    gain.gain.value = 0.05;
    oscillator.connect(gain);
    for (const destination of destinations) gain.connect(destination);
    oscillator.start();
});

function makeTiles(count, { self, screen, pinned })
{
    const tiles = [];
    for (let i = 0; i < count; i++)
    {
        const isSelf = !!self && i === count - 1;
        const name = isSelf ? "Me Myself" : NAMES[i];
        tiles.push({
            id: `t${i}`,
            profile: { v: 1, uid: `u${i}`, name, color: "", status: "available" },
            video: i % 3 === 2 ? null : makeVideo(200 + i * 50),
            audio: makeAudio(),
            muted: i === 1,
            screen: !!screen && i === 0,
            self: isSelf,
            pinned: !!pinned && i === 1,
        });
    }
    return tiles;
}

for (const stage of document.querySelectorAll("pc-call-stage.demo"))
{
    stage.tiles = makeTiles(Number(stage.dataset.count), {
        self: stage.hasAttribute("data-self"),
        screen: stage.hasAttribute("data-screen"),
        pinned: stage.hasAttribute("data-pinned"),
    });
}

const created = document.createElement("pc-call-stage");
created.className = "demo";
created.tiles = makeTiles(3, {});
document.getElementById("created").append(created);

const log = document.getElementById("log");
document.addEventListener("pin", (e) => { log.textContent = `events: pin ${JSON.stringify(e.detail)}`; });
