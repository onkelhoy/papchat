// system
import { bind, CustomElement, html, property } from "@papit/web-component";

// local
import sheet from "./style.css" with { type: "css" };
import type { SpeakingEvent } from "./types";

const FFT_SIZE = 512;
const MAX_BARS = 16;
const SPEAKING_RMS = 0.02;     // about -34 dBFS: above this counts as speech
const SPEAKING_OFF_MS = 300;   // stay "speaking" this long after the level drops (hysteresis)
const FLOOR_DB = -60;          // level 0 at this loudness, 1 at 0 dBFS

// one AudioContext shared by every connected pc-level-meter, created by the first and closed with the last
const instances = new Set<LevelMeter>();
let context: AudioContext | undefined;

function register(el: LevelMeter) {
    instances.add(el);
}

function unregister(el: LevelMeter) {
    instances.delete(el);
    if (instances.size === 0 && context)
    {
        context.close().catch(() => { });
        context = undefined;
    }
}

function sharedContext(): AudioContext | undefined {
    if (context && context.state !== "closed") return context;
    try
    {
        context = new AudioContext();
    }
    catch
    {
        context = undefined;
    }
    return context;
}

// autoplay policy: a context made before any user gesture starts suspended, so resume on the first one
function resumeOnGesture() {
    const resume = () => {
        context?.resume().catch(() => { });
        for (const type of ["pointerdown", "keydown"]) document.removeEventListener(type, resume, true);
    };
    for (const type of ["pointerdown", "keydown"]) document.addEventListener(type, resume, true);
}

/**
 * Small bar meter showing how loud a `MediaStream`'s audio is.
 *
 * Uses one shared `AudioContext` per page and one `AnalyserNode` per meter. The
 * animation loop runs only while the meter is connected, visible and the tab is
 * shown. It emits `speaking` when the level crosses a speech threshold, staying
 * on for about 300 ms after the sound stops so it does not flicker. Decorative
 * (`aria-hidden`).
 *
 * @element pc-level-meter
 *
 * @property {MediaStream} stream stream to measure (property only); streams without audio show an empty meter
 * @property {number} bars number of bars (default 5, max 16)
 *
 * @fires speaking `CustomEvent<{ speaking: boolean }>` when the speaking state changes (bubbles, composed)
 *
 * @csspart bar one bar
 */
export class LevelMeter extends CustomElement {
    static sheet = sheet;

    @property({ type: Object, attribute: false, rerender: false, after: function (this: LevelMeter) { this.connectStream(); } }) stream?: MediaStream | null;
    @property({ type: Number }) bars: number = 5;

    private source?: MediaStreamAudioSourceNode;
    private analyser?: AnalyserNode;
    private data?: Uint8Array<ArrayBuffer>;
    private frame = 0;
    private visible = true;
    private observer?: IntersectionObserver;
    private speaking = false;
    private lastLoud = 0;

    connectedCallback(): void {
        super.connectedCallback();

        this.setAttribute("aria-hidden", "true");
        register(this);

        document.addEventListener("visibilitychange", this.handleVisibility);
        if (typeof IntersectionObserver !== "undefined")
        {
            this.observer = new IntersectionObserver(this.handleIntersect);
            this.observer.observe(this);
        }

        this.connectStream();
    }

    disconnectedCallback(): void {
        document.removeEventListener("visibilitychange", this.handleVisibility);
        this.observer?.disconnect();
        this.observer = undefined;

        this.disconnectStream();
        unregister(this);
        super.disconnectedCallback();
    }

    @bind
    private handleVisibility() {
        this.schedule();
    }

    @bind
    private handleIntersect(entries: IntersectionObserverEntry[]) {
        this.visible = entries[entries.length - 1]?.isIntersecting ?? true;
        this.schedule();
    }

    // tracks added or removed later (e.g. mic enabled on a live stream) rebuild the graph
    @bind
    private handleTracks() {
        this.connectStream();
    }

    // build source → analyser for the current stream, dropping any previous graph first
    private connectStream() {
        if (!this.isConnected) return;

        this.disconnectStream();
        const stream = this.stream;
        if (!stream) return;

        stream.addEventListener("addtrack", this.handleTracks);
        stream.addEventListener("removetrack", this.handleTracks);

        if (stream.getAudioTracks().length === 0) return;
        const ctx = sharedContext();
        if (!ctx) return;

        if (ctx.state === "suspended")
        {
            ctx.resume().catch(() => { });
            resumeOnGesture();
        }

        this.analyser = ctx.createAnalyser();
        this.analyser.fftSize = FFT_SIZE;
        this.data = new Uint8Array(this.analyser.fftSize);
        this.source = ctx.createMediaStreamSource(stream);
        this.source.connect(this.analyser);   // not connected to the destination: no sound output

        this.schedule();
    }

    private disconnectStream() {
        cancelAnimationFrame(this.frame);
        this.frame = 0;

        this.stream?.removeEventListener("addtrack", this.handleTracks);
        this.stream?.removeEventListener("removetrack", this.handleTracks);

        this.source?.disconnect();
        this.analyser?.disconnect();
        this.source = undefined;
        this.analyser = undefined;
        this.data = undefined;

        this.paint(0);
        this.setSpeaking(false);
    }

    // run the loop only when there is something to measure and someone to see it
    private schedule() {
        const shouldRun = this.isConnected && !!this.analyser && this.visible && !document.hidden;
        if (shouldRun && !this.frame)
        {
            this.frame = requestAnimationFrame(this.tick);
        }
        else if (!shouldRun && this.frame)
        {
            cancelAnimationFrame(this.frame);
            this.frame = 0;
            this.paint(0);
        }
    }

    @bind
    private tick(now: number) {
        this.frame = 0;
        if (!this.analyser || !this.data) return;

        this.analyser.getByteTimeDomainData(this.data);
        let sum = 0;
        for (let i = 0; i < this.data.length; i++)
        {
            const v = (this.data[i] - 128) / 128;
            sum += v * v;
        }
        const rms = Math.sqrt(sum / this.data.length);
        const level = rms > 0 ? Math.min(1, Math.max(0, (20 * Math.log10(rms) - FLOOR_DB) / -FLOOR_DB)) : 0;
        this.paint(level);

        if (rms > SPEAKING_RMS)
        {
            this.lastLoud = now;
            this.setSpeaking(true);
        }
        else if (this.speaking && now - this.lastLoud > SPEAKING_OFF_MS)
        {
            this.setSpeaking(false);
        }

        this.schedule();
    }

    // light the bars up to level (0..1) by toggling an attribute: no re-render per frame
    private paint(level: number) {
        const bars = this.shadowRoot?.querySelectorAll<HTMLElement>(".bar");
        if (!bars) return;

        bars.forEach((bar, i) => {
            bar.toggleAttribute("data-on", level > 0 && level >= (i + 0.5) / bars.length);
        });
    }

    private setSpeaking(speaking: boolean) {
        if (this.speaking === speaking) return;

        this.speaking = speaking;
        this.dispatchEvent(new CustomEvent<SpeakingEvent>("speaking", { detail: { speaking }, bubbles: true, composed: true }));
    }

    render() {
        const count = Math.min(MAX_BARS, Math.max(1, Math.round(Number(this.bars)) || 5));
        const items = Array.from({ length: count }, (_, i) => i + 1);

        return html`${items.map(i => html`<span class="bar" part="bar" style="${`--_i: ${i}; --_n: ${count}`}"></span>`)}`;
    }
}

declare global {
    interface HTMLElementTagNameMap {
        "pc-level-meter": LevelMeter;
    }
}
