// system
import { CustomElement, bind, html, property } from "@papit/web-component";
import { translate, useTranslator } from "@papit/translator";

// foundations
import "@papit/button";
import "@papit/icon";

// local
import sheet from "./style.css" with { type: "css" };
import type { ToastKind } from "./types";

// glyph per kind, so the kind is not told by colour alone
const GLYPH: Record<ToastKind, string> = { info: "i", success: "✓", warning: "!", error: "×" };

/**
 * A single notification: kind-coloured, with an optional action and a dismiss button.
 *
 * The toast never removes itself. When `duration` runs out (or the close button is
 * pressed) it fires `dismiss` and the owner takes it away. The timer pauses while the
 * pointer is over the toast or focus is inside it, then continues with the time left.
 *
 * @element pc-toast
 *
 * @property {ToastKind} kind info | success | warning | error (reflected, default info)
 * @property {string} text message
 * @property {string} action label of the optional action button
 * @property {number} duration ms until `dismiss` fires, 0 = sticky (default 5000)
 *
 * @fires dismiss close button pressed or the timer ran out (no detail, does not bubble)
 * @fires action action button pressed (no detail, does not bubble)
 *
 * @csspart message the text
 */
export class Toast extends CustomElement {
    static sheet = sheet;

    @property({ type: String, reflect: true }) kind: ToastKind = "info";
    @property({ type: String, rerender: true }) text?: string;
    @property({ type: String, rerender: true }) action?: string;
    @property({
        type: Number,
        after: function (this: Toast, _value: number, _old: number, isinitial: boolean) {
            if (!isinitial) this.restart();
        }
    }) duration: number = 5000;

    @translate t = useTranslator("pc-toast");

    private timer?: ReturnType<typeof setTimeout>;
    private remaining = 0;
    private startedAt = 0;
    private hovered = false;
    private focused = false;

    connectedCallback(): void {
        super.connectedCallback();

        this.addEventListener("pointerenter", this.handleEnter);
        this.addEventListener("pointerleave", this.handleLeave);
        this.addEventListener("focusin", this.handleFocusIn);
        this.addEventListener("focusout", this.handleFocusOut);

        this.restart();
    }

    disconnectedCallback(): void {
        super.disconnectedCallback();

        this.removeEventListener("pointerenter", this.handleEnter);
        this.removeEventListener("pointerleave", this.handleLeave);
        this.removeEventListener("focusin", this.handleFocusIn);
        this.removeEventListener("focusout", this.handleFocusOut);

        this.stop();
    }

    // timer: start over with the full duration (unless paused or sticky)
    private restart() {
        this.stop();
        if (!this.isConnected || !(this.duration > 0)) return;

        this.remaining = this.duration;
        if (!this.hovered && !this.focused) this.run();
    }

    private run() {
        this.startedAt = Date.now();
        this.timer = setTimeout(() => {
            this.timer = undefined;
            this.dispatchEvent(new CustomEvent("dismiss"));
        }, this.remaining);
    }

    private stop() {
        if (this.timer === undefined) return;
        clearTimeout(this.timer);
        this.timer = undefined;
    }

    private pause() {
        if (this.timer === undefined) return;
        this.stop();
        this.remaining = Math.max(0, this.remaining - (Date.now() - this.startedAt));
    }

    private resume() {
        if (this.hovered || this.focused) return;
        if (this.timer !== undefined || !(this.duration > 0) || !this.isConnected) return;
        this.run();
    }

    @bind private handleEnter() {
        this.hovered = true;
        this.pause();
    }

    @bind private handleLeave() {
        this.hovered = false;
        this.resume();
    }

    @bind private handleFocusIn() {
        this.focused = true;
        this.pause();
    }

    @bind private handleFocusOut(e: FocusEvent) {
        // focus moving between the toast's own buttons is still "inside"
        if (e.relatedTarget instanceof Node && this.contains(e.relatedTarget)) return;
        this.focused = false;
        this.resume();
    }

    @bind private handleDismiss() {
        this.dispatchEvent(new CustomEvent("dismiss"));
    }

    @bind private handleAction() {
        this.dispatchEvent(new CustomEvent("action"));
    }

    render() {
        const kind = this.kind in GLYPH ? this.kind : "info";

        return html`
            <span class="glyph" aria-hidden="true">${GLYPH[kind]}</span>
            <p part="message">
                <span class="sr">${this.t(kind)}: </span>${this.text ?? ""}
            </p>
            ${this.action ? html`
                <pap-button part="action" size="small" variant="clear" @click="${this.handleAction}">${this.action}</pap-button>
            ` : ""}
            <pap-button part="close" size="icon" variant="clear" aria-label="${this.t("dismiss")}" @click="${this.handleDismiss}">
                <pap-icon name="/icons/spritesheet.svg#x" width="16" height="16" aria-hidden="true"></pap-icon>
            </pap-button>
        `;
    }
}

declare global {
    interface HTMLElementTagNameMap {
        "pc-toast": Toast;
    }
}
