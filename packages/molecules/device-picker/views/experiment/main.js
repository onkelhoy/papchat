import "@papit/codeblock";
import '@papchat/device-picker';
import { translator } from '@papit/translator';

translator.add({ id: "en", url: "/translations/en.json" });
translator.change("en");

// fake lists: the component never calls enumerateDevices itself
const mics = [
    { deviceId: "default", label: "Default - MacBook Pro Microphone" },
    { deviceId: "mic-1", label: "MacBook Pro Microphone" },
    { deviceId: "mic-2", label: "Logitech USB Headset" },
];
const cams = [
    { deviceId: "cam-1", label: "FaceTime HD Camera" },
    { deviceId: "cam-2", label: "OBS Virtual Camera" },
];
const speakers = [
    { deviceId: "spk-1", label: "MacBook Pro Speakers" },
    { deviceId: "spk-2", label: "Logitech USB Headset" },
];

const $ = (id) => document.getElementById(id);
$("mic").devices = mics;
$("cam").devices = cams;
$("spk").devices = speakers;

$("selected").devices = mics;
$("selected").value = "mic-2";
$("unlabelled").devices = [{ deviceId: "a", label: "" }, { deviceId: "b", label: "" }];
$("empty").devices = [];
$("unsupported").devices = speakers;
$("unsupported").supported = false;

for (const picker of document.querySelectorAll(".fake"))
{
    picker.devices = picker.kind === "audioinput" ? mics : cams;
}

const created = document.createElement("pc-device-picker");
created.kind = "audiooutput";
created.devices = speakers;
created.value = "spk-2";
$("created").append(created);

document.addEventListener("change", (e) =>
{
    if (e.target.localName !== "pc-device-picker") return;
    $("log").textContent = `change (${e.target.kind}) → "${e.detail.value}"`;
});
