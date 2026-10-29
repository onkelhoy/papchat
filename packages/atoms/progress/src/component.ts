// system
import { CustomElement, html, property } from "@papit/web-component";
import { translate, useTranslator } from "@papit/translator";

// local
import sheet from "./style.css" with { type: "css" };

/**
 * Progress bar. With `value` (0 to 1) it is determinate; without it the bar is
 * indeterminate (a moving segment, static under `prefers-reduced-motion`).
 *
 * The host is the `progressbar`: `aria-valuenow` is 0 to 100 (omitted while
 * indeterminate) and `aria-label` comes from `label`, falling back to a translated "Progress".
 *
 * @element pc-progress
 *
 * @property {number} value progress from 0 to 1 (clamped); unset or NaN means indeterminate
 * @property {string} label accessible name, e.g. the file name
 *
 * @csspart track the full-width track
 * @csspart bar the filled part
 * @cssprop --progress-height bar thickness (default 0.375rem)
 * @cssprop --progress-background track colour
 * @cssprop --progress-color bar colour
 */
export class Progress extends CustomElement {
    static sheet = sheet;

    @translate t = useTranslator("pc-progress");

    @property({ type: Number, after: function (this: Progress) { this.updateAria(); }, rerender: true }) value?: number;
    @property({ type: String, after: function (this: Progress) { this.updateAria(); } }) label?: string;

    connectedCallback(): void {
        super.connectedCallback();

        // ARIA goes on the host (never in the constructor, see papit-web-component)
        this.setAttribute("role", "progressbar");
        this.setAttribute("aria-valuemin", "0");
        this.setAttribute("aria-valuemax", "100");
        this.updateAria();
    }

    private get indeterminate() {
        return typeof this.value !== "number" || Number.isNaN(this.value);
    }

    // value clamped to 0..1, as a whole percentage for ARIA
    private get percent() {
        return Math.round(Math.min(1, Math.max(0, this.value as number)) * 100);
    }

    private updateAria() {
        if (!this.isConnected) return;

        if (this.indeterminate) this.removeAttribute("aria-valuenow");
        else this.setAttribute("aria-valuenow", String(this.percent));

        this.toggleAttribute("indeterminate", this.indeterminate);
        this.setAttribute("aria-label", this.label || this.t("label"));
    }

    render() {
        const style = this.indeterminate ? "" : `--_value: ${this.percent}%`;
        return html`
            <div part="track" aria-hidden="true">
                <div part="bar" style="${style}"></div>
            </div>
        `;
    }
}

declare global {
    interface HTMLElementTagNameMap {
        "pc-progress": Progress;
    }
}
