// system
import { CustomElement, html, property } from "@papit/web-component";

// local
import sheet from "./style.css" with { type: "css" };
import type { AvatarSize } from "./types";

/**
 * Round avatar showing a person's initials on their colour.
 *
 * The colour is the `color` property when given, otherwise a hue derived from
 * `uid` (or `name`), so the same person gets the same colour on every peer.
 * A presence dot (or anything else) goes in the `badge` slot.
 *
 * @element pc-avatar
 *
 * @property {string} name  display name, also the accessible label
 * @property {string} color any CSS colour; dark enough for white text
 * @property {string} uid   stable id used for the fallback colour
 * @property {AvatarSize} size s | m | l (reflected, default m)
 *
 * @slot badge bottom-right overlay, e.g. `<pc-presence slot="badge">`
 * @csspart circle the coloured circle
 */
export class Avatar extends CustomElement {
    static sheet = sheet;

    @property({ type: String, after: function (this: Avatar) { this.updateLabel(); }, rerender: true }) name?: string;
    @property({ type: String, rerender: true }) color?: string;
    @property({ type: String, rerender: true }) uid?: string;
    @property({ type: String, reflect: true, rerender: false }) size?: AvatarSize;

    connectedCallback(): void {
        super.connectedCallback();

        // ARIA goes on the host (never in the constructor, see papit-web-component)
        this.setAttribute("role", "img");
        this.updateLabel();
    }

    private updateLabel() {
        if (!this.isConnected) return;
        this.setAttribute("aria-label", this.name?.trim() || "?");
    }

    render() {
        // attribute bindings must be the whole value: html`` doesn't support partial interpolation
        return html`
            <span part="circle" aria-hidden="true" style="${`--_bg: ${this.color || colorFor(this.uid || this.name || "")}`}">${initials(this.name)}</span>
            <slot name="badge"></slot>
        `;
    }
}

// first letter of the first and last word: "Anna Maria Berg" → "AB", "anna" → "A"
export function initials(name?: string): string {
    const words = (name ?? "").trim().split(/\s+/).filter(Boolean);
    if (words.length === 0) return "?";

    const first = Array.from(words[0])[0];
    const last = words.length > 1 ? Array.from(words[words.length - 1])[0] : "";
    return (first + last).toUpperCase();
}

// FNV-1a over the seed → a hue; lightness/chroma fixed so white text always passes contrast
export function colorFor(seed: string): string {
    let hash = 0x811c9dc5;
    for (let i = 0; i < seed.length; i++)
    {
        hash ^= seed.charCodeAt(i);
        hash = Math.imul(hash, 0x01000193);
    }
    const hue = (hash >>> 0) % 360;
    return `oklch(50% 0.13 ${hue})`;
}

declare global {
    interface HTMLElementTagNameMap {
        "pc-avatar": Avatar;
    }
}
