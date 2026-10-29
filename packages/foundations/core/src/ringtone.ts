import { signal } from "@papit/signals";

import { log } from "./log";
import { audioBlocked, prefs, setAudioBlocked } from "./state";

// Ringtones (PLAN §5). Files load with fetch → blob URL (`@papit/static` only rewrites fetch, not
// `new Audio(src)`) and are cached. A missing file falls back to a WebAudio tone, so calls ring
// before any mp3 is added. A rejected `play()` raises `audioBlocked` until `unlock()` (a click).

export type Tone = { id: string; label: string; file: string };

type Sound = "ring" | "ringback" | "ping";

type Request = { sound: Sound; id?: string; loop: boolean; preview: boolean };

type Playback = { stop: () => void };

type Burst = { at: number; ms: number; freqs: number[] };

const PATTERNS: Record<Sound, { cycle: number; bursts: Burst[] }> = {
    // two-tone 440/480 Hz, repeated
    ring: {
        cycle: 3_000,
        bursts: [
            { at: 0, ms: 300, freqs: [440] },
            { at: 400, ms: 300, freqs: [480] },
            { at: 800, ms: 300, freqs: [440] },
            { at: 1_200, ms: 300, freqs: [480] },
        ],
    },
    // 440 Hz, 2 s on / 4 s off
    ringback: { cycle: 6_000, bursts: [{ at: 0, ms: 2_000, freqs: [440] }] },
    ping: { cycle: 250, bursts: [{ at: 0, ms: 150, freqs: [880] }] },
};

const FILES: Record<Exclude<Sound, "ring">, string> = {
    ringback: "/audio/ringback.mp3",
    ping: "/audio/sound/message.wav",
};

// 44 byte wav with no samples worth hearing: a click that lets later sounds play
const SILENCE = "data:audio/wav;base64,UklGRiQAAABXQVZFZm10IBAAAAABAAEAQB8AAEAfAAABAAgAZGF0YQAAAAA=";

/** The tones the user can pick from (`ringtones.json`), filled by `loadTones`. */
export const [tones, setTones] = signal<Tone[]>([]);
/** Id of the tone being previewed right now, "" when none. */
export const [previewing, setPreviewing] = signal("");

let list: Promise<Tone[]> | null = null;
const blobs = new Map<string, Promise<string | null>>();
let context: AudioContext | null = null;
let current: Playback | null = null;
let wanted: Request | null = null;
let run = 0;

/** Fetches the tone list once. Resolves to `[]` when there is none. */
export function loadTones(): Promise<Tone[]> {
    list ??= fetch("/audio/ringtones/ringtones.json")
        .then(res => res.ok ? res.json() : [])
        .then(readTones)
        .catch((): Tone[] => [])
        .then(found => {
            setTones(found);
            return found;
        });
    return list;
}

/** Plays tone `id` (the user's ringtone). Loops with `loop: true` until `stop()`. */
export function play(id: string, options: { loop?: boolean } = {}) {
    void begin({ sound: "ring", id, loop: !!options.loop, preview: false });
}

/** Plays tone `id` once for the settings picker; `previewing` holds `id` until it ends or `stop()`. */
export function preview(id: string) {
    void begin({ sound: "ring", id, loop: false, preview: true });
}

/** The caller's ringing tone, looped until `stop()`. */
export function ringback() {
    void begin({ sound: "ringback", loop: true, preview: false });
}

/** A short ping that doesn't interrupt a ringing tone and never raises `audioBlocked`. */
export function ping() {
    void open({ sound: "ping", loop: false, preview: false }, () => undefined).catch(() => undefined);
}

/** Stops whatever `play`, `preview` or `ringback` started. */
export function stop() {
    run++;
    wanted = null;
    current?.stop();
    current = null;
    setPreviewing("");
}

/** Call from a click: lets audio play, clears `audioBlocked` and resumes a ring that was blocked. */
export async function unlock() {
    try
    {
        context ??= new AudioContext();
        await context.resume();
        const silence = new Audio(SILENCE);
        await silence.play();
    }
    catch (error)
    {
        log("ringtone: unlock failed", error);
    }

    setAudioBlocked(false);
    const retry = wanted;
    if (retry && retry.loop && !current) void begin(retry);
}

// ---------------------------------------------------------------- playing

async function begin(request: Request) {
    current?.stop();
    current = null;
    setPreviewing("");

    const mine = ++run;
    wanted = request;
    if (request.preview && request.id) setPreviewing(request.id);

    const ended = () => {
        if (mine !== run) return;
        current = null;
        wanted = null;
        setPreviewing("");
    };

    try
    {
        const playback = await open(request, ended, () => mine !== run);
        if (mine !== run)
        {
            playback.stop();
            return;
        }
        current = playback;
        if (audioBlocked()) setAudioBlocked(false);
    }
    catch (error)
    {
        if (mine !== run) return;
        log("ringtone: blocked", error);
        setPreviewing("");
        setAudioBlocked(true);
    }
}

async function open(request: Request, onEnd: () => void, stale: () => boolean = () => false): Promise<Playback> {
    const url = await sourceOf(request);
    const volume = Math.min(1, Math.max(0, prefs().volume));
    if (stale()) return { stop: () => undefined };

    return url ? playFile(url, request.loop, volume, onEnd) : playTone(request.sound, request.loop, volume, onEnd);
}

async function playFile(url: string, loop: boolean, volume: number, onEnd: () => void): Promise<Playback> {
    const audio = new Audio(url);
    audio.loop = loop;
    audio.volume = volume;
    audio.addEventListener("ended", onEnd);
    await audio.play();

    return {
        stop() {
            audio.removeEventListener("ended", onEnd);
            audio.pause();
            audio.removeAttribute("src");
        },
    };
}

async function playTone(sound: Sound, loop: boolean, volume: number, onEnd: () => void): Promise<Playback> {
    const ctx = await running();
    const pattern = PATTERNS[sound];
    const master = ctx.createGain();
    master.gain.value = volume * 0.3;
    master.connect(ctx.destination);

    const cycle = () => {
        const now = ctx.currentTime;
        for (const burst of pattern.bursts)
        {
            const start = now + burst.at / 1000;
            const end = start + burst.ms / 1000;
            const envelope = ctx.createGain();
            envelope.gain.setValueAtTime(0, start);
            envelope.gain.linearRampToValueAtTime(1, start + 0.02);
            envelope.gain.setValueAtTime(1, Math.max(start + 0.02, end - 0.03));
            envelope.gain.linearRampToValueAtTime(0, end);
            envelope.connect(master);

            for (const freq of burst.freqs)
            {
                const osc = ctx.createOscillator();
                osc.frequency.value = freq;
                osc.connect(envelope);
                osc.start(start);
                osc.stop(end + 0.05);
            }
        }
    };

    cycle();
    const timer = loop ? setInterval(cycle, pattern.cycle) : setTimeout(onEnd, pattern.cycle);

    return {
        stop() {
            clearInterval(timer);
            clearTimeout(timer);
            master.disconnect();
        },
    };
}

// a context created without a user gesture stays suspended and its resume() never settles
async function running(): Promise<AudioContext> {
    context ??= new AudioContext();
    if (context.state !== "running")
    {
        await Promise.race([context.resume(), new Promise(resolve => setTimeout(resolve, 300))]);
    }
    if (context.state !== "running") throw new Error("audio is blocked");
    return context;
}

// ---------------------------------------------------------------- files

async function sourceOf(request: Request): Promise<string | null> {
    if (request.sound !== "ring") return blobOf(FILES[request.sound]);

    const tones = await loadTones();
    const tone = tones.find(t => t.id === request.id);
    return tone ? blobOf(`/audio/ringtones/${tone.file}`) : null;
}

function blobOf(path: string): Promise<string | null> {
    let found = blobs.get(path);
    if (!found)
    {
        found = fetch(path)
            .then(async res => {
                const type = res.headers.get("content-type") ?? "";
                // a dev server may answer a missing file with its html page
                if (!res.ok || type.startsWith("text/")) return null;
                return URL.createObjectURL(await res.blob());
            })
            .catch(() => null);
        blobs.set(path, found);
    }
    return found;
}

function readTones(raw: unknown): Tone[] {
    if (!Array.isArray(raw)) return [];
    return raw.flatMap((item): Tone[] => {
        const value = item as Record<string, unknown>;
        if (typeof value?.id !== "string" || typeof value.file !== "string") return [];
        return [{ id: value.id, file: value.file, label: typeof value.label === "string" ? value.label : value.id }];
    });
}
