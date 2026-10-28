// system
import { CustomElement, html, property } from "@papit/web-component";
import { translate, useTranslator } from "@papit/translator";

// molecules
import "@papchat/toast";

// local
import sheet from "./style.css" with { type: "css" };
import type { ToastEventDetail } from "./types";
import type { Toast } from "@papchat/core";

// how many toasts are on screen at once (the newest ones)
const MAX_VISIBLE = 4;

/**
 * Fixed stack of `pc-toast`s: bottom-right, bottom-centre on narrow screens.
 *
 * It only shows what `toasts` says. A toast timing out or being closed becomes a
 * `dismiss` event; the owner removes it from `toasts`. Only the newest 4 render, the
 * older ones appear again as the newer ones are dismissed (their timers start then).
 *
 * @element pc-toaster
 *
 * @property {Toast[]} toasts toasts to show (`Toast` type from `@papchat/core`)
 *
 * @fires dismiss {ToastEventDetail} a toast timed out or was closed
 * @fires action {ToastEventDetail} a toast's action button was pressed
 *
 * @csspart list the stacking container
 */
export class Toaster extends CustomElement {
    static sheet = sheet;

    @property({ type: Array, attribute: false, rerender: true }) toasts: Toast[] = [];

    @translate t = useTranslator("pc-toaster");

    private handleDismiss(toast: Toast) {
        this.dispatchEvent(new CustomEvent<ToastEventDetail>("dismiss", { detail: { id: toast.id } }));
    }

    private handleAction(toast: Toast) {
        this.dispatchEvent(new CustomEvent<ToastEventDetail>("action", { detail: { id: toast.id } }));
    }

    render() {
        const visible = (this.toasts ?? []).slice(-MAX_VISIBLE);

        // attribute bindings must be the whole value; the key keeps each toast's timer alive across rerenders
        return html`
            <div part="list" role="status" aria-live="polite" aria-label="${this.t("label")}">
                ${visible.map(toast => html`
                    <pc-toast
                        key="${toast.id}"
                        kind="${toast.kind}"
                        text="${toast.text}"
                        action="${toast.action ?? ""}"
                        duration="${String(toast.duration ?? 5000)}"
                        @dismiss="${() => this.handleDismiss(toast)}"
                        @action="${() => this.handleAction(toast)}"
                    ></pc-toast>
                `)}
            </div>
        `;
    }
}

declare global {
    interface HTMLElementTagNameMap {
        "pc-toaster": Toaster;
    }
}
