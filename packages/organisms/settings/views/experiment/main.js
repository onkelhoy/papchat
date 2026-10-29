import "@papit/codeblock";
import '@papchat/settings';
import { translator } from '@papit/translator';

translator.add({ id: "en", url: "/translations/en.json" });
translator.change("en");

const log = document.getElementById("log");

const makeCanvasStream = () =>
{
    const canvas = document.createElement("canvas");
    canvas.width = 320;
    canvas.height = 180;
    const ctx = canvas.getContext("2d");
    const draw = (t) =>
    {
        ctx.fillStyle = "hsl(220, 40%, 25%)";
        ctx.fillRect(0, 0, 320, 180);
        ctx.fillStyle = "hsl(260, 80%, 60%)";
        ctx.fillRect((Math.sin(t / 600) * 0.5 + 0.5) * 240, 50, 80, 80);
        requestAnimationFrame(draw);
    };
    requestAnimationFrame(draw);
    return canvas.captureStream(30);
};

function setup(el)
{
    el.profile = { v: 1, uid: "me", name: "Henry", color: "#4f46e5", status: "available" };
    el.prefs = { v: 1, ringtone: "classic", volume: 0.6, language: "en", autoDeclineBusy: false, notifications: false, devices: {}, sidebarOpen: true };
    el.tones = [{ id: "classic", label: "Classic" }, { id: "soft", label: "Soft" }];
    el.devices = {
        audioinput: [{ deviceId: "m1", label: "Built-in microphone" }],
        videoinput: [{ deviceId: "c1", label: "FaceTime camera" }],
        audiooutput: [{ deviceId: "s1", label: "Speakers" }],
    };

    for (const name of ["profile-change", "prefs-change", "language-change", "request-notifications", "preview-device", "preview", "preview-stop"])
    {
        el.addEventListener(name, (e) =>
        {
            log.textContent = `${name} ${JSON.stringify(e.detail ?? "")}`;
            if (name === "profile-change") el.profile = { ...el.profile, ...e.detail.partial };
            if (name === "prefs-change") el.prefs = { ...el.prefs, ...e.detail.partial };
            if (name === "request-notifications") el.prefs = { ...el.prefs, notifications: true };
            if (name === "preview-device" && e.detail.kind === "camera") el.camerastream = makeCanvasStream();
            if (name === "preview") el.playing = e.detail.id;
            if (name === "preview-stop") el.playing = "";
        });
    }
    el.addEventListener("close", () => { el.open = false; });
}

const light = document.getElementById("light");
setup(light);

const created = document.createElement("pc-settings");
setup(created);
document.body.append(created);

document.getElementById("open-light").onclick = () => { light.open = true; };
document.getElementById("open-created").onclick = () => { created.open = true; };
