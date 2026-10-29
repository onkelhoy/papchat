// system
import { bind, CustomElement, html, property } from "@papit/web-component";
import { translate, useTranslator } from "@papit/translator";

// local
import sheet from "./style.css" with { type: "css" };
import type { Gif } from "@papchat/core";
import type { GifPickEvent } from "./types";

/**
 * A grid of GIFs to pick from. It never fetches: the host searches GIPHY and sets `gifs`.
 * Previews load lazily, each GIF's title is its accessible name.
 *
 * @element pc-gif-picker
 *
 * @property {Gif[]} gifs the results to show (property only)
 * @property {boolean} loading a search is running (shows a status line while there are no results)
 * @property {number} limit 0 = all in a scrolling grid; > 0 = one row of that many
 *
 * @fires gif-pick `CustomEvent<{ gif: Gif }>` a GIF was chosen (bubbles, composed)
 *
 * @csspart grid the grid
 */
export class GifPicker extends CustomElement {
    static sheet = sheet;

    @translate t = useTranslator("pc-gif-picker");

    @property({ type: Array, attribute: false, rerender: true }) gifs: Gif[] = [];
    @property({ type: Boolean, reflect: true, rerender: true }) loading: boolean = false;
    @property({ type: Number, rerender: true }) limit: number = 0;

    @bind
    private handleClick(e: Event) {
        const index = Number((e.currentTarget as HTMLElement).dataset.index);
        const gif = this.gifs?.[index];
        if (!gif) return;
        this.dispatchEvent(new CustomEvent<GifPickEvent>("gif-pick", { detail: { gif }, bubbles: true, composed: true }));
    }

    render() {
        const gifs = this.limit > 0 ? (this.gifs ?? []).slice(0, this.limit) : (this.gifs ?? []);
        const status = gifs.length ? "" : this.loading ? this.t("loading") : this.t("none");

        return html`
            <p class="status" role="status" hidden="${status ? "" : "hidden"}">${status}</p>
            <div part="grid" class="${this.limit > 0 ? "grid row" : "grid"}" role="group" aria-label="${this.t("label")}">
                ${gifs.map((gif, i) => html`
                    <button type="button" class="gif" data-index="${String(i)}" aria-label="${gif.title || this.t("gif")}" title="${gif.title || this.t("gif")}" @click="${this.handleClick}">
                        <img src="${gif.url}" alt="" width="${String(gif.width)}" height="${String(gif.height)}" loading="lazy" decoding="async" />
                    </button>
                `)}
            </div>
        `;
    }
}

declare global {
    interface HTMLElementTagNameMap {
        "pc-gif-picker": GifPicker;
    }
}
