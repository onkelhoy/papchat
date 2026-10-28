import "@papchat/theme";
import "@papchat/level-meter";

const toggle = document.getElementById("toggle");
const speaking = document.getElementById("speaking");

const created = document.createElement("pc-level-meter");
created.bars = 6;
created.classList.add("demo");
document.getElementById("created").append(created);

const meters = () => document.querySelectorAll("pc-level-meter.demo");

document.addEventListener("speaking", (e) => {
    speaking.textContent = `speaking: ${e.detail.speaking}`;
});

let running;

// oscillator -> gain (slow on/off pulses) -> MediaStream, no microphone permission needed
function createTestStream() {
    const ctx = new AudioContext();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    const dest = ctx.createMediaStreamDestination();
    osc.frequency.value = 220;
    osc.connect(gain).connect(dest);
    osc.start();

    // volume sweeps 0 -> 1 -> 0 every 4 s, with a silent gap
    const timer = setInterval(() => {
        const t = (ctx.currentTime % 6);
        gain.gain.value = t < 4 ? Math.abs(Math.sin((t / 4) * Math.PI)) : 0;
    }, 50);

    return {
        stream: dest.stream,
        stop() {
            clearInterval(timer);
            osc.stop();
            ctx.close();
        },
    };
}

toggle.addEventListener("click", () => {
    if (running)
    {
        running.stop();
        running = undefined;
        meters().forEach(m => { m.stream = null; });
        toggle.textContent = "Start test signal";
        return;
    }

    running = createTestStream();
    meters().forEach(m => { m.stream = running.stream; });
    toggle.textContent = "Stop test signal";
});
