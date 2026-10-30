// system
import { CustomElement, bind, html, property } from "@papit/web-component";
import { translate, useTranslator } from "@papit/translator";

// foundations
import "@papit/button";
import "@papit/icon";
import "@papchat/avatar";

// local
import sheet from "./style.css" with { type: "css" };
import type { IncomingCall as CallInfo } from "@papchat/core";
import type { AcceptDetail, DeclineDetail } from "./types";

/**
 * Card shown when someone calls or invites you.
 *
 * Shows a large pulsing avatar (still when the user prefers reduced motion), who is
 * calling and what for, and the Accept / Decline buttons. It is an `alertdialog`:
 * focus moves to Accept when it appears. "Accept with video" only exists for video calls.
 * The card never removes itself; the owner reacts to `accept` / `decline`.
 *
 * @element pc-incoming-call
 *
 * @property {IncomingCall} call id, from (Profile), kind, title (property or JSON attribute)
 *
 * @fires accept `{ id, video }` Accept pressed (`video` true for "Accept with video")
 * @fires decline `{ id }` Decline pressed
 *
 * @csspart card the card
 * @csspart accept the accept button
 * @csspart accept-video the accept-with-video button
 * @csspart decline the decline button
 */
export class IncomingCall extends CustomElement {
    static sheet = sheet;

    @property({ type: Object, rerender: true }) call?: CallInfo;

    @translate t = useTranslator("pc-incoming-call");

    connectedCallback(): void {
        super.connectedCallback();

        // ARIA goes on the host (never in the constructor)
        this.setAttribute("role", "alertdialog");
        this.setAttribute("aria-labelledby", "message");

        // focus Accept once the first render is in place
        requestAnimationFrame(() => {
            if (!this.isConnected) return;
            this.shadowRoot?.querySelector<HTMLElement>("#accept")?.focus();
        });
    }

    private message(): string {
        const call = this.call;
        const name = call?.from?.name?.trim() || "?";
        const title = call?.title ?? "";
        const kind = call?.kind && ["chat", "call", "video", "stage"].includes(call.kind) ? call.kind : "call";
        return this.t(kind, { name, title });
    }

    @bind private handleAccept() {
        if (!this.call) return;
        this.dispatchEvent(new CustomEvent<AcceptDetail>("accept", { detail: { id: this.call.id, video: false } }));
    }

    @bind private handleAcceptVideo() {
        if (!this.call) return;
        this.dispatchEvent(new CustomEvent<AcceptDetail>("accept", { detail: { id: this.call.id, video: true } }));
    }

    @bind private handleDecline() {
        if (!this.call) return;
        this.dispatchEvent(new CustomEvent<DeclineDetail>("decline", { detail: { id: this.call.id } }));
    }

    render() {
        const call = this.call;
        const from = call?.from;

        return html`
            <div part="card">
                <div class="avatar">
                    <pc-avatar size="l" name="${from?.name ?? ""}" color="${from?.color ?? ""}" uid="${from?.uid ?? ""}"></pc-avatar>
                </div>
                <p id="message">${this.message()}</p>
                <div class="actions">
                    <pap-button id="accept" part="accept" color="success" @click="${this.handleAccept}">
                        <pap-icon name="/icons/phone.svg" width="20" height="20" aria-hidden="true"></pap-icon>
                        ${this.t("accept")}
                    </pap-button>
                    ${call?.kind === "video" ? html`
                        <pap-button part="accept-video" color="success" variant="outline" @click="${this.handleAcceptVideo}">
                            <pap-icon name="/icons/camera.svg" width="20" height="20" aria-hidden="true"></pap-icon>
                            ${this.t("acceptVideo")}
                        </pap-button>
                    ` : ""}
                    <pap-button part="decline" color="error" @click="${this.handleDecline}">
                        <pap-icon name="/icons/phone-off.svg" width="20" height="20" aria-hidden="true"></pap-icon>
                        ${this.t("decline")}
                    </pap-button>
                </div>
            </div>
        `;
    }
}

declare global {
    interface HTMLElementTagNameMap {
        "pc-incoming-call": IncomingCall;
    }
}
