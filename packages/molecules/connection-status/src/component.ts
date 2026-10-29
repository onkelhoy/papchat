// system
import { CustomElement, html, property } from "@papit/web-component";
import { translate, useTranslator } from "@papit/translator";
import "@papchat/presence";

// local
import sheet from "./style.css" with { type: "css" };
import type { ConnectionStatusValue } from "./types";

/**
 * Pill showing the lobby connection state: a dot (`pc-presence`) and a
 * translated text. The state is never colour-only: the text always says it,
 * and `connecting`/`waking`/`reconnecting` pulse (unless reduced motion).
 *
 * @element pc-connection-status
 *
 * @property {ConnectionStatusValue} status connecting | waking | connected | reconnecting | closed (reflected, default connecting)
 *
 * @csspart dot the presence dot
 * @csspart text the status text
 * @cssprop --connection-status-background pill background
 * @cssprop --connection-status-color text colour
 */
export class ConnectionStatus extends CustomElement {
    static sheet = sheet;

    @translate t = useTranslator("pc-connection-status");

    @property({ type: String, reflect: true, rerender: true }) status: ConnectionStatusValue = "connecting";

    connectedCallback(): void {
        super.connectedCallback();

        // ARIA goes on the host (never in the constructor, see papit-web-component)
        this.setAttribute("role", "status");
        this.setAttribute("aria-live", "polite");
    }

    render() {
        const status: ConnectionStatusValue = this.status in DOTS ? this.status : "connecting";

        return html`
            <pc-presence part="dot" status="${DOTS[status]}"></pc-presence>
            <span part="text">${this.t(status)}</span>
        `;
    }
}

// which pc-presence status draws each connection state
const DOTS: Record<ConnectionStatusValue, "available" | "away" | "offline"> = {
    connecting: "away",
    waking: "away",
    connected: "available",
    reconnecting: "away",
    closed: "offline",
};

declare global {
    interface HTMLElementTagNameMap {
        "pc-connection-status": ConnectionStatus;
    }
}
