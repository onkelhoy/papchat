// system
import { bind, CustomElement, html, property } from "@papit/web-component";
import { translate, useTranslator } from "@papit/translator";
import "@papit/dialog";
import "@papit/input";
import "@papit/button";
import "@papchat/qr-code";
import "@papchat/qr-scanner";
import "@papchat/share-link";

// local
import sheet from "./style.css" with { type: "css" };
import type { LinkNotice, LinkState, LinkTextEvent } from "./types";

/**
 * Dialog that links another device: shows this device's QR code and link, or takes the other
 * device's by camera or paste. Both devices then show the same code, and both must press Accept.
 * It holds no logic of its own: the page passes `state` from core's `linking` signal.
 *
 * @element pc-link-device
 *
 * @property {boolean} open whether the dialog is shown (reflected)
 * @property {LinkState | null} state where the link is at (property only)
 * @property {LinkNotice} notice why the last scanned or pasted link wasn't taken
 *
 * @fires retry start over after a failure (bubbles, composed)
 * @fires link-text `CustomEvent<{ text }>` a link was scanned or pasted (bubbles, composed)
 * @fires accept this device agrees the codes match (bubbles, composed)
 * @fires close the dialog was dismissed, or the link declined (bubbles, composed)
 * @csspart dialog the `pap-dialog`
 */
export class LinkDevice extends CustomElement {
    static sheet = sheet;

    @translate t = useTranslator("pc-link-device");

    @property({
        type: Boolean,
        reflect: true,
        rerender: true,
        after(this: LinkDevice) {
            if (!this.open) this.scanning = false;
            this.cameraError = "";
        },
    }) open: boolean = false;
    @property({ type: Object, attribute: false, rerender: true }) state: LinkState | null = null;
    @property({ type: String, attribute: false, rerender: true }) notice: LinkNotice = "";

    @property({ type: Boolean, attribute: false, rerender: true }) private scanning: boolean = false;
    @property({ type: String, attribute: false, rerender: true }) private cameraError: string = "";

    private emit<T>(name: string, detail?: T) {
        this.dispatchEvent(new CustomEvent<T>(name, { detail, bubbles: true, composed: true }));
    }

    @bind
    private handleDialogClose() {
        // also fires when the page closes us; only dismissals by the user count
        if (!this.open) return;
        this.open = false;
        this.emit("close");
    }

    @bind
    private handleDismiss() {
        this.open = false;
        this.emit("close");
    }

    @bind
    private handleScanToggle() {
        this.scanning = !this.scanning;
        this.cameraError = "";
    }

    @bind
    private handleScan(e: CustomEvent<LinkTextEvent>) {
        e.stopPropagation();
        this.scanning = false;
        this.emit<LinkTextEvent>("link-text", { text: e.detail.text });
    }

    @bind
    private handleCameraError(e: CustomEvent<{ reason: string }>) {
        e.stopPropagation();
        this.scanning = false;
        this.cameraError = e.detail.reason;
    }

    @bind
    private handlePaste(e: Event) {
        e.preventDefault();
        e.stopPropagation();
        const field = this.shadowRoot?.querySelector<HTMLInputElement>("#paste");
        const text = String(field?.value ?? "").trim();
        if (text) this.emit<LinkTextEvent>("link-text", { text });
    }

    @bind
    private handleAccept() {
        this.emit("accept");
    }

    @bind
    private handleRetry() {
        this.emit("retry");
    }

    private renderEnter() {
        return html`
            <div class="enter">
                <p class="label">${this.t("enter")}</p>
                <pap-button size="small" variant="outline" type="button" @click="${this.handleScanToggle}">${this.t(this.scanning ? "scan-stop" : "scan")}</pap-button>
                ${this.scanning ? html`<pc-qr-scanner active="true" @scan="${this.handleScan}" @camera-error="${this.handleCameraError}"></pc-qr-scanner>` : ""}
                ${this.cameraError ? html`<p class="error" role="alert">${this.t(`camera-${this.cameraError}`)}</p>` : ""}
                <form class="paste" @submit="${this.handlePaste}">
                    <pap-input id="paste" autocomplete="off" aria-label="${this.t("paste")}" placeholder="${this.t("paste")}"></pap-input>
                    <pap-button size="small" variant="clear" type="submit">${this.t("paste-go")}</pap-button>
                </form>
                ${this.notice ? html`<p class="error" role="alert">${this.t(`notice-${this.notice}`)}</p>` : ""}
            </div>
        `;
    }

    private renderShow(state: LinkState) {
        return html`
            <div class="show">
                <p class="hint">${this.t("show")}</p>
                <pc-qr-code value="${state.url}" label="${this.t("qr")}"></pc-qr-code>
                <pc-share-link link="${state.url}"></pc-share-link>
                <p class="hint">${this.t("expires")}</p>
            </div>
        `;
    }

    private renderConfirm(state: LinkState) {
        return html`
            <div class="confirm">
                <p class="hint">${state.other ? this.t("confirm-named", { name: state.other }) : this.t("confirm")}</p>
                <p class="code" aria-label="${this.t("code")}">${state.code}</p>
                <p class="hint">${this.t("warning")}</p>
                <div class="actions">
                    <pap-button variant="clear" type="button" @click="${this.handleDismiss}">${this.t("decline")}</pap-button>
                    <pap-button type="button" @click="${this.handleAccept}">${this.t("accept")}</pap-button>
                </div>
            </div>
        `;
    }

    private renderSync(state: LinkState) {
        return html`<p class="hint" role="status">${state.total > 0 ? this.t("syncing-count", { done: String(state.done), total: String(state.total) }) : this.t("syncing")}</p>`;
    }

    private renderFailed(state: LinkState) {
        return html`
            <div class="failed">
                <p class="error" role="alert">${this.t(`failed-${state.reason ?? "gone"}`)}</p>
                <pap-button size="small" variant="outline" type="button" @click="${this.handleRetry}">${this.t("retry")}</pap-button>
            </div>
        `;
    }

    render() {
        const state = this.state;
        const phase = state?.phase;
        const entering = !phase || phase === "starting" || phase === "showing" || phase === "failed";

        return html`
            <pap-dialog part="dialog" open="${this.open && "true"}" header="${this.t("title")}" @close="${this.handleDialogClose}">
                <div class="body">
                    ${phase === "starting" || phase === "joining" ? html`<p class="hint" role="status">${this.t("connecting")}</p>` : ""}
                    ${state && phase === "showing" ? this.renderShow(state) : ""}
                    ${state && phase === "failed" ? this.renderFailed(state) : ""}
                    ${entering ? this.renderEnter() : ""}
                    ${state && phase === "confirm" ? this.renderConfirm(state) : ""}
                    ${state && phase === "waiting" ? html`<div class="confirm"><p class="code">${state.code}</p><p class="hint" role="status">${this.t("waiting")}</p></div>` : ""}
                    ${state && phase === "syncing" ? this.renderSync(state) : ""}
                    ${phase === "done" ? html`<p class="done" role="status">${this.t("done")}</p>` : ""}
                </div>
            </pap-dialog>
        `;
    }
}

declare global {
    interface HTMLElementTagNameMap {
        "pc-link-device": LinkDevice;
    }
}
