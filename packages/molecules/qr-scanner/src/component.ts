// system
import { CustomElement, html, property, query } from "@papit/web-component";

// local
import sheet from "./style.css" with { type: "css" };
import type { CameraErrorEvent, ScanEvent } from "./types";

const SCAN_GAP_MS = 200;
// plenty for a code that fills part of the view, and much quicker to read
const MAX_SIDE = 640;

type Decode = typeof import("./vendor/jsqr").default;

/**
 * Reads QR codes with the camera (the rear one on a phone). The camera runs only while `active` is
 * set, and is released as soon as it's cleared or the element leaves the page. Frames stay in the
 * browser. The first code it reads fires `scan`, then it stops looking until `active` is set again.
 * The element only reads: whoever uses it decides what a code means.
 *
 * @element pc-qr-scanner
 *
 * @property {boolean} active the camera is on (reflected)
 *
 * @fires scan `CustomEvent<{ text }>` a code was read (bubbles, composed)
 * @fires camera-error `CustomEvent<{ reason: "denied" | "missing" | "failed" }>` the camera can't be used (bubbles, composed)
 *
 * @csspart video the camera view
 */
export class QrScanner extends CustomElement {
    static sheet = sheet;

    @property({
        type: Boolean,
        reflect: true,
        after(this: QrScanner) {
            if (this.active) void this.start();
            else this.stop();
        },
    }) active: boolean = false;

    @query("video") private video?: HTMLVideoElement;

    private stream: MediaStream | null = null;
    private timer: ReturnType<typeof setTimeout> | undefined;
    private canvas: HTMLCanvasElement | null = null;
    // a stop while the camera is still starting
    private run = 0;

    disconnectedCallback() {
        super.disconnectedCallback();
        this.stop();
    }

    private emitError(reason: CameraErrorEvent["reason"]) {
        this.dispatchEvent(new CustomEvent<CameraErrorEvent>("camera-error", { detail: { reason }, bubbles: true, composed: true }));
    }

    private async start() {
        const run = ++this.run;
        if (!navigator.mediaDevices?.getUserMedia)
        {
            this.emitError("missing");
            return;
        }

        try
        {
            // the camera first, on its own: whatever fails after this must be able to stop it
            const stream = await navigator.mediaDevices.getUserMedia({ audio: false, video: { facingMode: { ideal: "environment" } } });
            if (run !== this.run)
            {
                stream.getTracks().forEach(track => track.stop());
                return;
            }
            this.stream = stream;

            const jsqr = await import("./vendor/jsqr");
            if (run !== this.run) return;
            const video = this.video;
            if (!video) throw new Error("no video element");

            // the attribute alone doesn't mute a video made from a template
            video.muted = true;
            video.srcObject = stream;
            await video.play();
            this.look(run, jsqr.default);
        }
        catch (error)
        {
            if (run !== this.run) return;
            console.warn("[papchat] qr-scanner: couldn't start", error);
            this.stop();
            const name = error instanceof DOMException ? error.name : "";
            this.emitError(name === "NotAllowedError" || name === "SecurityError" ? "denied" : name === "NotFoundError" ? "missing" : "failed");
        }
    }

    private stop() {
        this.run++;
        clearTimeout(this.timer);
        this.stream?.getTracks().forEach(track => track.stop());
        this.stream = null;
        if (this.video) this.video.srcObject = null;
    }

    private look(run: number, decode: Decode) {
        if (run !== this.run) return;
        const text = this.read(decode);
        if (text)
        {
            this.dispatchEvent(new CustomEvent<ScanEvent>("scan", { detail: { text }, bubbles: true, composed: true }));
            return;
        }
        this.timer = setTimeout(() => this.look(run, decode), SCAN_GAP_MS);
    }

    private read(decode: Decode): string | null {
        const video = this.video;
        if (!video?.videoWidth) return null;

        const scale = Math.min(1, MAX_SIDE / Math.max(video.videoWidth, video.videoHeight));
        const width = Math.round(video.videoWidth * scale);
        const height = Math.round(video.videoHeight * scale);
        this.canvas ??= document.createElement("canvas");
        this.canvas.width = width;
        this.canvas.height = height;
        const context = this.canvas.getContext("2d", { willReadFrequently: true });
        if (!context) return null;

        context.drawImage(video, 0, 0, width, height);
        const { data } = context.getImageData(0, 0, width, height);
        return decode(data, width, height, { inversionAttempts: "dontInvert" })?.data || null;
    }

    render() {
        return html`<video part="video" playsinline muted aria-hidden="true"></video>`;
    }
}

declare global {
    interface HTMLElementTagNameMap {
        "pc-qr-scanner": QrScanner;
    }
}
