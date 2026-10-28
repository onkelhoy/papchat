// system
import { CustomElement, html, property } from "@papit/web-component";
import { translate, useTranslator } from "@papit/translator";

// local
import sheet from "./style.css" with { type: "css" };
import type { PresenceStatus } from "./types";

/**
 * Small status dot. The status is never colour-only: `dnd` gets a bar across
 * the dot, `away` is a hollow ring and `offline` a hollow, thinner ring.
 *
 * @element pc-presence
 *
 * @property {PresenceStatus} status available | busy | away | dnd | offline (reflected, default offline)
 *
 * @csspart dot the dot itself
 * @cssprop --presence-size dot diameter (default 0.75rem)
 */
export class Presence extends CustomElement {
    static sheet = sheet;

    @translate t = useTranslator("pc-presence");

    @property({ type: String, reflect: true, after: function (this: Presence) { this.updateLabel(); } }) status: PresenceStatus = "offline";

    connectedCallback(): void {
        super.connectedCallback();

        // ARIA goes on the host (never in the constructor, see papit-web-component)
        this.setAttribute("role", "img");
        this.updateLabel();
    }

    private updateLabel() {
        if (!this.isConnected) return;
        this.setAttribute("aria-label", this.t(this.status in LABELS ? this.status : "offline"));
    }

    render() {
        return html`<span part="dot" aria-hidden="true"></span>`;
    }
}

const LABELS: Record<PresenceStatus, true> = { available: true, busy: true, away: true, dnd: true, offline: true };

declare global {
    interface HTMLElementTagNameMap {
        "pc-presence": Presence;
    }
}
