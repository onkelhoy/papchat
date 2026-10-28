// system
import { CustomElement, html, property } from "@papit/web-component";

// local
import sheet from "./style.css" with { type: "css" };
import type { BadgeVariant } from "./types";

/**
 * Small pill for an unread count or a short text label.
 *
 * With `count` it shows the number (`99+` above 99) and hides itself at 0.
 * Without `count` the default slot is the label ("Live", "Host", "You").
 * The `live` variant adds a pulsing dot (static under `prefers-reduced-motion`).
 *
 * @element pc-badge
 *
 * @property {number} count unread count; 0 hides the badge, above 99 shows `99+`
 * @property {BadgeVariant} variant neutral | primary | live | error (reflected, default neutral)
 *
 * @slot default text label, used when `count` is not set
 * @csspart dot the pulsing dot of the `live` variant
 */
export class Badge extends CustomElement {
    static sheet = sheet;

    @property({ type: Number, after: function (this: Badge) { this.updateHidden(); } }) count?: number;
    @property({ type: String, reflect: true, rerender: false }) variant?: BadgeVariant;

    connectedCallback(): void {
        super.connectedCallback();

        // reflect on the host (never in the constructor, see papit-web-component)
        this.updateHidden();
    }

    private hasCount() {
        return typeof this.count === "number" && !Number.isNaN(this.count);
    }

    // a count of 0 (or less) hides the badge; a label badge is always shown
    private updateHidden() {
        if (!this.isConnected) return;
        this.toggleAttribute("hidden", this.hasCount() && (this.count as number) <= 0);
    }

    render() {
        const text = this.hasCount() ? ((this.count as number) > 99 ? "99+" : String(Math.floor(this.count as number))) : "";
        return html`
            ${this.variant === "live" ? html`<span part="dot" aria-hidden="true"></span>` : ""}
            ${this.hasCount() ? html`<span>${text}</span>` : html`<slot></slot>`}
        `;
    }
}

declare global {
    interface HTMLElementTagNameMap {
        "pc-badge": Badge;
    }
}
