// system
import { CustomElement, bind, html, property } from "@papit/web-component";
import { translate, useTranslator } from "@papit/translator";
import "@papchat/video-tile";
import type { VideoTile } from "@papchat/video-tile";

// local
import sheet from "./style.css" with { type: "css" };
import type { CallTile, PinEvent } from "./types";

type Mode = "empty" | "grid" | "focus" | "overlay";

const MAX_COLS = 3;

/**
 * Responsive grid of `pc-video-tile`s that also plays the remote audio.
 *
 * Layout: 1 tile fills the stage, 2 sit side by side, 3 to 4 form a 2x2 grid, 5 to 8 use 3 columns.
 * A pinned tile (pinned wins) or else the first screen-share tile becomes the big one and the rest go in
 * a strip beside it (below it on narrow stages). In a 1:1 call with a `self` tile, your own tile is a small
 * overlay in the corner. Tiles are never re-parented, so streams keep playing when the layout changes.
 *
 * `pc-video-tile` only meters audio, so the stage keeps one hidden `<audio autoplay>` per non-self tile with an
 * `audio` stream (`srcObject` set imperatively, `sinkid` applied with `setSinkId` where supported), removed with the tile.
 * The host needs a size from its parent.
 *
 * @element pc-call-stage
 *
 * @property {CallTile[]} tiles the participants (property only; assign a new array to update)
 * @property {string} sinkid output device id for remote audio (empty = default)
 *
 * @fires pin `CustomEvent<{ id: string, pinned: boolean }>` a tile was pinned or unpinned (bubbles, composed)
 *
 * @csspart tiles the layout container
 * @csspart tile every `pc-video-tile`
 */
export class CallStage extends CustomElement {
    static sheet = sheet;

    @translate t = useTranslator("pc-call-stage");

    @property({ type: Array, attribute: false, rerender: true }) tiles: CallTile[] = [];
    @property({ type: String, rerender: true }) sinkid: string = "";

    // undefined: follow `tiles[].pinned`; "": nothing pinned; otherwise the pinned tile id
    @property({ type: String, attribute: false, rerender: true }) private pinnedId?: string;

    private sinks = new WeakMap<HTMLAudioElement, string>();

    // objects and streams can't go through html``: set them on the keyed children after each patch
    update() {
        super.update();
        this.syncTiles();
        this.syncAudio();
        return undefined;
    }

    disconnectedCallback(): void {
        this.shadowRoot?.querySelectorAll<HTMLAudioElement>("audio").forEach(audio => { audio.srcObject = null; });
        super.disconnectedCallback();
    }

    private get list(): CallTile[] {
        const seen = new Set<string>();
        return (this.tiles ?? []).filter(tile =>
        {
            if (!tile?.id || seen.has(tile.id)) return false;
            seen.add(tile.id);
            return true;
        });
    }

    private pinnedTile(list: CallTile[]): CallTile | undefined {
        if (this.pinnedId === undefined) return list.find(tile => tile.pinned);
        return list.find(tile => tile.id === this.pinnedId);
    }

    private layout(list: CallTile[]): { mode: Mode, featured?: CallTile } {
        if (list.length === 0) return { mode: "empty" };
        if (list.length === 1) return { mode: "grid" };

        const featured = this.pinnedTile(list) ?? list.find(tile => tile.screen);
        if (featured) return { mode: "focus", featured };

        if (list.length === 2 && list.some(tile => tile.self)) return { mode: "overlay" };
        return { mode: "grid" };
    }

    private syncTiles() {
        const list = this.list;
        const pinned = this.pinnedTile(list);
        const rows = this.shadowRoot?.querySelectorAll<VideoTile>(".tiles > pc-video-tile");
        if (!rows) return;

        rows.forEach((row, i) => {
            const tile = list[i];
            if (!tile) return;

            const video = tile.video ?? undefined;
            const audio = tile.audio ?? undefined;
            if (row.profile !== tile.profile) row.profile = tile.profile;
            if (row.video !== video) row.video = video;
            if (row.audio !== audio) row.audio = audio;
            if (row.muted !== !!tile.muted) row.muted = !!tile.muted;
            if (row.screen !== !!tile.screen) row.screen = !!tile.screen;
            if (row.self !== !!tile.self) row.self = !!tile.self;
            if (row.pinned !== (tile === pinned)) row.pinned = tile === pinned;
        });
    }

    private syncAudio() {
        const players = this.shadowRoot?.querySelectorAll<HTMLAudioElement>(".players > audio");
        if (!players) return;

        const remote = this.list.filter(tile => !tile.self && tile.audio);
        players.forEach((audio, i) => {
            const stream = remote[i]?.audio ?? null;
            if (audio.srcObject !== stream)
            {
                audio.srcObject = stream;
                if (stream) audio.play().catch(() => { /* autoplay blocked until a user gesture */ });
            }

            if (this.sinks.get(audio) !== this.sinkid)
            {
                this.sinks.set(audio, this.sinkid);
                const setSinkId = (audio as HTMLAudioElement & { setSinkId?: (id: string) => Promise<void> }).setSinkId;
                if (setSinkId && this.sinkid) setSinkId.call(audio, this.sinkid).catch(() => { /* device gone */ });
            }
        });
    }

    @bind
    private handlePin(e: CustomEvent<{ pinned: boolean }>) {
        e.stopPropagation();
        const row = (e.target as HTMLElement).closest<HTMLElement>("pc-video-tile[data-id]");
        const id = row?.dataset.id;
        if (!id) return;

        this.pinnedId = e.detail.pinned ? id : "";
        this.dispatchEvent(new CustomEvent<PinEvent>("pin", { detail: { id, pinned: e.detail.pinned }, bubbles: true, composed: true }));
    }

    render() {
        const list = this.list;
        const { mode, featured } = this.layout(list);
        const n = list.length;
        const cols = Math.min(n <= 2 ? n : n <= 4 ? 2 : MAX_COLS, MAX_COLS);
        const narrow = n <= 2 ? 1 : 2;
        const others = Math.max(n - 1, 1);
        const style = `--n: ${n}; --cols: ${cols}; --rows: ${Math.ceil(n / cols) || 1}; --cols-narrow: ${narrow}; --rows-narrow: ${Math.ceil(n / narrow) || 1}; --others: ${others}`;

        return html`
            <div class="tiles" part="tiles" role="group" aria-label="${this.t("label")}" data-mode="${mode}" style="${style}" @pin="${this.handlePin}">
                ${list.length === 0 ? html`<div class="empty">${this.t("empty")}</div>` : ""}
                ${list.map(tile => html`<pc-video-tile
                    key="${tile.id}"
                    part="tile"
                    data-id="${tile.id}"
                    data-role="${featured === tile ? "main" : mode === "overlay" && tile.self ? "self" : "side"}"
                ></pc-video-tile>`)}
            </div>
            <div class="players" hidden>
                ${list.filter(tile => !tile.self && tile.audio).map(tile => html`<audio key="${tile.id}" autoplay></audio>`)}
            </div>
        `;
    }
}

declare global {
    interface HTMLElementTagNameMap {
        "pc-call-stage": CallStage;
    }
}
