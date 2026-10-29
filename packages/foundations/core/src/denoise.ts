import { log } from "./log";
import type { NoiseReduction } from "./types";

// Noise reduction for the mic (T7.15): the mic runs through an AudioWorklet with a speech model in
// WebAssembly, and the cleaned track is what gets sent. The worklets and wasm come from
// @sapphi-red/web-noise-suppressor (MIT), copied to the app's /audio/denoise/ by `npm run denoise`
// in core; nothing loads until a level other than "off" is used. "standard" is RNNoise, "strong" is
// GTCRN (clearer speech, a bit more CPU). Any failure falls back to the plain mic.

export const NOISE_LEVELS: NoiseReduction[] = ["off", "standard", "strong"];

type Model = { processor: string; worklet: string; wasm: string; simd?: string };

const BASE = "/audio/denoise/";
const MODELS: Record<Exclude<NoiseReduction, "off">, Model> = {
    standard: { processor: "@sapphi-red/web-noise-suppressor/rnnoise", worklet: "rnnoise-worklet.js", wasm: "rnnoise.wasm", simd: "rnnoise_simd.wasm" },
    strong: { processor: "@sapphi-red/web-noise-suppressor/gtcrn", worklet: "gtcrn-worklet.js", wasm: "gtcrn.wasm" },
};

// both models run at 48 kHz; one context for every capture
let context: AudioContext | null = null;
const ready = new Map<string, Promise<ArrayBuffer>>();
const cleanups = new WeakMap<MediaStream, () => void>();

/**
 * Returns `source` cleaned at `level`, or `source` itself for "off", without AudioWorklet support, or
 * when loading fails. Release a cleaned stream with `releaseDenoise` (it also stops `source`).
 */
export async function denoise(source: MediaStream, level: NoiseReduction): Promise<MediaStream> {
    if (level === "off" || !(level in MODELS) || typeof AudioWorkletNode === "undefined") return source;
    const model = MODELS[level as keyof typeof MODELS];

    try
    {
        context ??= new AudioContext({ sampleRate: 48_000 });
        const wasmBinary = await load(model, context);
        // a running capture lets the context start without a fresh gesture
        if (context.state !== "running") await context.resume().catch(() => undefined);

        const input = context.createMediaStreamSource(source);
        // one channel in and out: speech, and the model only cleans the channels it's given
        const node = new AudioWorkletNode(context, model.processor, {
            channelCount: 1,
            channelCountMode: "explicit",
            outputChannelCount: [1],
            processorOptions: { maxChannels: 1, wasmBinary },
        });
        const output = context.createMediaStreamDestination();
        input.connect(node).connect(output);
        const cleaned = output.stream;

        // the raw mic ending (unplugged, permission revoked) ends the cleaned one too
        const raw = source.getAudioTracks()[0];
        const onEnded = () => cleaned.getTracks().forEach(track => {
            track.stop();
            track.dispatchEvent(new Event("ended"));
        });
        raw?.addEventListener("ended", onEnded);

        cleanups.set(cleaned, () => {
            raw?.removeEventListener("ended", onEnded);
            node.port.postMessage("destroy");
            input.disconnect();
            node.disconnect();
            cleaned.getTracks().forEach(track => track.stop());
            source.getTracks().forEach(track => track.stop());
        });
        log("denoise: on", level);
        return cleaned;
    }
    catch (error)
    {
        log("denoise: falling back to the plain mic", level, error);
        return source;
    }
}

/** Stops a stream from `denoise` and the mic behind it. No-op for any other stream. */
export function releaseDenoise(stream: MediaStream) {
    cleanups.get(stream)?.();
    cleanups.delete(stream);
}

// the worklet module (once per context) and the wasm binary, fetched once per model. The module goes in
// through a blob URL: addModule() isn't a fetch, so the static build's path rewriting wouldn't reach it
function load(model: Model, ctx: AudioContext): Promise<ArrayBuffer> {
    const found = ready.get(model.processor);
    if (found) return found;

    const loading = fetchModel(model, ctx);
    // a failed load may work next time (network)
    loading.catch(() => ready.delete(model.processor));
    ready.set(model.processor, loading);
    return loading;
}

async function fetchModel(model: Model, ctx: AudioContext): Promise<ArrayBuffer> {
    const code = await (await fetchOk(BASE + model.worklet)).text();
    const url = URL.createObjectURL(new Blob([code], { type: "text/javascript" }));
    try
    {
        await ctx.audioWorklet.addModule(url);
    }
    finally
    {
        URL.revokeObjectURL(url);
    }
    const file = model.simd && simd() ? model.simd : model.wasm;
    return (await fetchOk(BASE + file)).arrayBuffer();
}

async function fetchOk(url: string): Promise<Response> {
    const res = await fetch(url);
    if (!res.ok) throw new Error(`${url}: ${res.status}`);
    return res;
}

// WebAssembly SIMD support (the same probe the library uses)
function simd(): boolean {
    try
    {
        return WebAssembly.validate(new Uint8Array([0, 97, 115, 109, 1, 0, 0, 0, 1, 5, 1, 96, 0, 1, 123, 3, 2, 1, 0, 10, 10, 1, 8, 0, 65, 0, 253, 15, 253, 98, 11]));
    }
    catch
    {
        return false;
    }
}
