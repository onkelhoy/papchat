// system
import { CustomElement, bind, html, property, query } from "@papit/web-component";
import { translate, useTranslator } from "@papit/translator";
import "@papit/button";
import "@papit/icon";
import "@papchat/video";
import "@papchat/level-meter";
import "@papchat/avatar";
import type { Video } from "@papchat/video";
import type { LevelMeter } from "@papchat/level-meter";
import type { Profile } from "@papchat/core";

// local
import sheet from "./style.css" with { type: "css" };
import type { PinEvent } from "./types";

/**
 * One participant in a call: their video (or a large avatar when there is none),
 * name label, mic-off icon, level meter and a ring while they are speaking.
 *
 * Streams are properties only (a `MediaStream` cannot be an attribute) and are handed
 * to the inner `pc-video` / `pc-level-meter` imperatively. A tile has no audio output:
 * `audio` is only measured for the meter, so play remote audio elsewhere.
 * Pin and fullscreen buttons show on hover and focus. Pinning only reflects `pinned`
 * and fires `pin`; the parent decides what a pinned tile does.
 *
 * @element pc-video-tile
 *
 * @property {Profile} profile who this is (`uid`, `name`, `color`); property only
 * @property {MediaStream} video camera or screen stream; no live video track shows the avatar instead
 * @property {MediaStream} audio microphone stream, for the level meter and speaking ring
 * @property {boolean} muted remote mic flag: shows the mic-off icon and hides the meter (reflected)
 * @property {boolean} self your own tile: video mirrored and muted so you do not hear yourself (reflected)
 * @property {boolean} screen a screen share: video uses `fit="contain"` (reflected)
 * @property {boolean} pinned pinned state (reflected, toggled by the Pin button)
 *
 * @fires pin `CustomEvent<{ pinned: boolean }>` after the Pin button toggled `pinned` (bubbles, composed)
 * @fires speaking `CustomEvent<{ speaking: boolean }>` from the inner level meter (bubbles, composed)
 *
 * @csspart video the `pc-video`
 * @csspart avatar the `pc-avatar` shown without video
 * @csspart label the name label
 * @csspart actions the pin and fullscreen buttons
 * @cssstate speaking while the participant is speaking
 */
export class VideoTile extends CustomElement {
    static sheet = sheet;

    @translate t = useTranslator("pc-video-tile");

    @property({ type: Object, attribute: false, rerender: true }) profile?: Profile;
    @property({ type: Object, attribute: false, after: function (this: VideoTile) { this.watch("video"); }, rerender: true }) video?: MediaStream | null;
    @property({ type: Object, attribute: false, after: function (this: VideoTile) { this.syncAudio(); }, rerender: true }) audio?: MediaStream | null;
    @property({ type: Boolean, reflect: true, after: function (this: VideoTile) { if (this.muted) this.setSpeaking(false); }, rerender: true }) muted: boolean = false;
    @property({ type: Boolean, reflect: true, rerender: true }) self: boolean = false;
    @property({ type: Boolean, reflect: true, rerender: true }) screen: boolean = false;
    @property({ type: Boolean, reflect: true, rerender: true }) pinned: boolean = false;

    // bumped when the video stream gains or loses tracks, so render() re-checks them
    @property({ type: Number, attribute: false, rerender: true }) private tracks: number = 0;
    @property({ type: Boolean, attribute: false, rerender: true }) private fullscreen: boolean = false;

    @query({ selector: "pc-video", load: function (this: VideoTile) { this.syncVideo(); } }) private videoEl?: Video | null;
    @query({ selector: "pc-level-meter", load: function (this: VideoTile) { this.syncAudio(); } }) private meterEl?: LevelMeter | null;

    private internals = this.attachInternals();
    private watched?: MediaStream | null;

    connectedCallback(): void {
        super.connectedCallback();

        document.addEventListener("fullscreenchange", this.handleFullscreenChange);
        this.watch("video");
    }

    disconnectedCallback(): void {
        document.removeEventListener("fullscreenchange", this.handleFullscreenChange);
        this.unwatch();
        this.setSpeaking(false);
        super.disconnectedCallback();
    }

    // follow track changes of the current video stream (camera switched off/on on a live stream)
    private watch(_: "video") {
        this.unwatch();
        this.syncVideo();
        if (!this.isConnected || !this.video) return;

        this.watched = this.video;
        this.watched.addEventListener("addtrack", this.handleTracks);
        this.watched.addEventListener("removetrack", this.handleTracks);
    }

    private unwatch() {
        this.watched?.removeEventListener("addtrack", this.handleTracks);
        this.watched?.removeEventListener("removetrack", this.handleTracks);
        this.watched = undefined;
    }

    private get hasVideo(): boolean {
        return !!this.video?.getVideoTracks().some(track => track.readyState === "live");
    }

    // streams can't go through html``: set them on the children once they exist
    private syncVideo() {
        const el = this.videoEl ?? this.root.querySelector<Video>("pc-video");
        if (el) el.stream = this.video ?? undefined;
    }

    private syncAudio() {
        const el = this.meterEl ?? this.root.querySelector<LevelMeter>("pc-level-meter");
        if (el) el.stream = this.audio ?? undefined;
    }

    private setSpeaking(speaking: boolean) {
        if (speaking) this.internals.states.add("speaking");
        else this.internals.states.delete("speaking");
    }

    @bind
    private handleTracks() {
        this.tracks++;
    }

    @bind
    private handleSpeaking(e: CustomEvent<{ speaking: boolean }>) {
        this.setSpeaking(e.detail.speaking);
    }

    @bind
    private handlePin() {
        this.pinned = !this.pinned;
        this.dispatchEvent(new CustomEvent<PinEvent>("pin", { detail: { pinned: this.pinned }, bubbles: true, composed: true }));
    }

    @bind
    private handleFullscreen() {
        if (document.fullscreenElement === this)
        {
            document.exitFullscreen().catch(() => { });
        }
        else
        {
            this.requestFullscreen?.()?.catch(() => { });
        }
    }

    @bind
    private handleFullscreenChange() {
        this.fullscreen = document.fullscreenElement === this;
    }

    render() {
        const profile = this.profile;
        const name = profile?.name?.trim() || "";
        const hasVideo = this.hasVideo;

        return html`
            ${hasVideo ? html`
                <pc-video part="video" fit="${this.screen ? "contain" : "cover"}" ?muted="${this.self}" ?mirror="${this.self && !this.screen}"></pc-video>
            ` : html`
                <div class="placeholder">
                    <pc-avatar part="avatar" size="l" name="${name}" uid="${profile?.uid ?? ""}" color="${profile?.color ?? ""}"></pc-avatar>
                </div>
            `}
            <div class="footer">
                <span class="label" part="label">
                    ${this.muted ? html`<pap-icon class="mic-off" name="/icons/spritesheet.svg#mic-off" role="img" aria-label="${this.t("muted")}"></pap-icon>` : ""}
                    <span class="name">${name}${this.self ? html` <span class="you">(${this.t("you")})</span>` : ""}</span>
                </span>
                ${this.muted ? "" : html`<pc-level-meter @speaking="${this.handleSpeaking}"></pc-level-meter>`}
            </div>
            <div class="actions" part="actions">
                <pap-button type="button" size="small" variant="filled" color="secondary" @click="${this.handlePin}">
                    ${this.pinned ? this.t("unpin") : this.t("pin")}
                </pap-button>
                <pap-button type="button" size="small" variant="filled" color="secondary" @click="${this.handleFullscreen}">
                    ${this.fullscreen ? this.t("exit-fullscreen") : this.t("fullscreen")}
                </pap-button>
            </div>
        `;
    }
}

declare global {
    interface HTMLElementTagNameMap {
        "pc-video-tile": VideoTile;
    }
}
