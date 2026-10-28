// system
import "@papit/button";
import "@papit/icon";
import { CustomElement, html, property, query, bind } from "@papit/web-component";
import { translate, useTranslator } from "@papit/translator";

// local
import sheet from "./style.css" with { type: "css" };
import type { VideoFit } from "./types";

/**
 * Plays a `MediaStream` in a `<video>` that fills the host.
 *
 * Sets `srcObject` and calls `play()`. Browsers refuse to autoplay some streams
 * (unmuted, no user gesture yet), in which case a "click to play" overlay button is
 * shown until the user starts it. The stream is released when the element is
 * removed from the page.
 *
 * @element pc-video
 *
 * @property {MediaStream | null} stream what to play (property only, no attribute)
 * @property {boolean} muted mute the audio (reflected); set it for your own camera
 * @property {boolean} mirror flip horizontally, for your own camera (reflected)
 * @property {VideoFit} fit cover | contain (reflected, default cover)
 * @property {string} sinkid audio output device id, applied with `setSinkId` when supported
 *
 * @csspart video the `<video>` element
 * @csspart overlay the "click to play" overlay
 * @csspart play the play button
 */
export class Video extends CustomElement {
    static sheet = sheet;

    @translate t = useTranslator("pc-video");

    @property({ type: Object, attribute: false, rerender: false, after: function (this: Video) { this.attach(); } }) stream?: MediaStream | null;
    @property({ type: Boolean, reflect: true, rerender: false, after: function (this: Video) { this.sync(); } }) muted: boolean = false;
    @property({ type: Boolean, reflect: true, rerender: false }) mirror: boolean = false;
    @property({ type: String, reflect: true, rerender: false }) fit?: VideoFit;
    @property({ type: String, rerender: false, after: function (this: Video) { this.applySink(); } }) sinkid?: string;

    // true while the browser has refused to autoplay: shows the overlay
    @property({ type: Boolean, attribute: false, rerender: true }) private blocked: boolean = false;

    @query({ selector: "video", load: function (this: Video) { this.attach(); } }) private video?: HTMLVideoElement | null;

    connectedCallback(): void {
        super.connectedCallback();

        // coming back after a disconnect (e.g. moved in the DOM): the stream was released, start it again
        this.attach();
    }

    disconnectedCallback(): void {
        this.release();
        super.disconnectedCallback();
    }

    // the query resolves after the first render; until then there is nothing to attach to
    private get element(): HTMLVideoElement | null {
        return this.video ?? this.root.querySelector("video");
    }

    private attach() {
        const video = this.element;
        if (!video || !this.isConnected) return;

        this.sync();
        this.applySink();

        const stream = this.stream ?? null;
        if (video.srcObject !== stream) video.srcObject = stream;

        if (!stream)
        {
            this.blocked = false;
            return;
        }

        this.start();
    }

    private sync() {
        const video = this.element;
        if (video) video.muted = this.muted;
    }

    private applySink() {
        const video = this.element as (HTMLVideoElement & { setSinkId?: (id: string) => Promise<void> }) | null;
        if (!video || !this.sinkid || typeof video.setSinkId !== "function") return;

        // unknown device or no permission: keep the default output
        video.setSinkId(this.sinkid).catch(() => { });
    }

    private async start() {
        const video = this.element;
        if (!video) return;

        try
        {
            await video.play();
            this.blocked = false;
        }
        catch (error)
        {
            // AbortError = the source changed while starting, the next attach() handles it
            if ((error as DOMException)?.name === "AbortError") return;
            this.blocked = true;
        }
    }

    private release() {
        const video = this.element;
        if (!video) return;

        video.pause();
        video.srcObject = null;
        this.blocked = false;
    }

    @bind
    private handlePlay() {
        this.start();
    }

    render() {
        return html`
            <video part="video" playsinline autoplay></video>
            ${this.blocked ? html`
                <div part="overlay" class="overlay">
                    <pap-button part="play" color="primary" size="large" type="button" @click="${this.handlePlay}">
                        <pap-icon name="/icons/spritesheet.svg#play" aria-hidden="true"></pap-icon>
                        ${this.t("play")}
                    </pap-button>
                </div>
            ` : ""}
        `;
    }
}

declare global {
    interface HTMLElementTagNameMap {
        "pc-video": Video;
    }
}
