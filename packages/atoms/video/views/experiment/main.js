import "@papit/codeblock";
import '@papchat/video';
import { translator } from '@papit/translator';

translator.add({ id: "en", url: "/translations/en.json" });
translator.change("en");

// animated canvas → MediaStream, so no camera permission is needed
function makeStream(hue, withAudio)
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
        ctx.fillStyle = "white";
        ctx.font = "32px sans-serif";
        ctx.fillText("papchat → " + Math.round(t / 1000) + "s", 20, 50);
        ctx.fillText("mirror test: R", canvas.width - 220, canvas.height - 20);
        requestAnimationFrame(draw);
    };
    requestAnimationFrame(draw);

    const stream = canvas.captureStream(30);
    if (withAudio)
    {
        const ctxAudio = new AudioContext();
        stream.addTrack(ctxAudio.createMediaStreamDestination().stream.getAudioTracks()[0]);
    }
    return stream;
}

let hue = 200;
for (const el of document.querySelectorAll("pc-video[data-canvas]"))
{
    el.stream = makeStream(hue, el.hasAttribute("data-audio"));
    hue += 50;
}

const created = document.createElement("pc-video");
created.className = "demo";
created.stream = makeStream(300, false);
created.fit = "contain";
document.getElementById("created").append(created);

document.getElementById("swap").addEventListener("click", () =>
{
    hue += 50;
    created.stream = makeStream(hue, false);
});

document.getElementById("remove").addEventListener("click", () =>
{
    const parent = created.parentElement;
    created.remove();
    setTimeout(() => parent.append(created), 500);
});
