import { signal } from "@papit/signals";

import { log } from "./log";
import { prefs } from "./state";

// Camera, microphone and speaker lists (PLAN §2.5 media). Labels stay empty until the user has
// granted a media permission once; `refreshDevices` runs again after every capture for that reason.

export type DeviceInfo = { deviceId: string; label: string };

export type DeviceLists = {
    audioinput: DeviceInfo[];
    videoinput: DeviceInfo[];
    audiooutput: DeviceInfo[];
};

export type CaptureName = "mic" | "camera" | "screen";

export type CaptureConstraints = MediaStreamConstraints & { display?: boolean };

const EMPTY: DeviceLists = { audioinput: [], videoinput: [], audiooutput: [] };

export const [devices, setDevices] = signal<DeviceLists>(EMPTY);

/** True when the browser can route audio to a chosen output (`setSinkId`). */
export const sinkSupported = typeof HTMLMediaElement !== "undefined" && "setSinkId" in HTMLMediaElement.prototype;

let listening = false;

/** Reads the device lists into `devices`, and keeps them fresh on `devicechange`. */
export async function listDevices(): Promise<DeviceLists> {
    const media = typeof navigator !== "undefined" ? navigator.mediaDevices : undefined;
    if (!media?.enumerateDevices) return EMPTY;

    if (!listening)
    {
        listening = true;
        media.addEventListener("devicechange", () => void listDevices());
    }

    try
    {
        const all = await media.enumerateDevices();
        const next: DeviceLists = { audioinput: [], videoinput: [], audiooutput: [] };
        for (const device of all)
        {
            if (device.kind in next) next[device.kind as keyof DeviceLists].push({ deviceId: device.deviceId, label: device.label });
        }
        setDevices(next);
        return next;
    }
    catch (error)
    {
        log("devices: enumerate failed", error);
        return devices();
    }
}

/** Constraints for `getUserMedia` / `getDisplayMedia` using the devices chosen in the prefs. */
export function constraints(name: CaptureName): CaptureConstraints {
    const chosen = prefs().devices;

    // screens change little: fewer frames leave bandwidth for sharp text (see `screenHint`)
    if (name === "screen") return { display: true, video: { frameRate: { ideal: 15, max: 30 } }, audio: false };

    if (name === "mic")
    {
        return {
            audio: {
                ...(chosen.mic ? { deviceId: { ideal: chosen.mic } } : {}),
                echoCancellation: true,
                noiseSuppression: true,
                autoGainControl: true,
                // speech: one channel at Opus's native rate, no resampling
                channelCount: { ideal: 1 },
                sampleRate: { ideal: 48_000 },
                // Chrome's voice isolation where the platform has it; others ignore an unknown constraint
                ...({ voiceIsolation: true } as MediaTrackConstraints),
            },
        };
    }

    return {
        video: {
            ...(chosen.camera ? { deviceId: { ideal: chosen.camera } } : {}),
            width: { ideal: 1280 },
            height: { ideal: 720 },
        },
    };
}

/** Tells the encoder a screen capture is text and detail, not motion: it keeps resolution over frame rate. */
export function screenHint(stream: MediaStream) {
    for (const track of stream.getVideoTracks()) track.contentHint = "detail";
}

/** Plays `element` through the chosen speaker. No-op without `setSinkId`; never throws. */
export async function setSink(element: HTMLMediaElement): Promise<void> {
    const id = prefs().devices.speaker ?? "";
    const target = element as HTMLMediaElement & { setSinkId?: (id: string) => Promise<void> };
    if (!target.setSinkId) return;

    try
    {
        await target.setSinkId(id);
    }
    catch (error)
    {
        log("devices: setSinkId failed", error);
    }
}
