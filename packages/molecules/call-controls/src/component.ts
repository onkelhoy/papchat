// system
import { bind, CustomElement, html, property } from "@papit/web-component";
import { translate, useTranslator } from "@papit/translator";
import "@papit/button";
import "@papit/group";
import "@papit/icon";
import "@papit/tooltip";

// local
import sheet from "./style.css" with { type: "css" };
import type { ToggleControl, ToggleEvent } from "./types";

/**
 * Call toolbar: mic, camera, screen share, invite, devices and hang up.
 *
 * A `pap-group` gives it `role="toolbar"` and arrow-key roving. Toggle buttons keep a fixed
 * accessible name and reflect their state with `aria-pressed` (pressed = on); the tooltip
 * (shown on hover and focus) describes the action with its shortcut. The shortcuts themselves
 * are global and wired by the page.
 *
 * @element pc-call-controls
 *
 * @property {boolean} mic microphone is on (reflected)
 * @property {boolean} camera camera is on (reflected)
 * @property {boolean} screen you are sharing your screen (reflected)
 * @property {boolean} chat chat panel is shown (reflected)
 * @property {boolean} viewer only show "Leave" and the chat toggle (reflected)
 * @property {boolean} canscreen the browser supports screen sharing; false hides the button (default true)
 *
 * @fires toggle `CustomEvent<{ control: "mic" | "camera" | "screen" | "chat" }>`
 * @fires invite `CustomEvent<void>`
 * @fires devices `CustomEvent<void>`
 * @fires hangup `CustomEvent<void>`
 *
 * @csspart toolbar the `pap-group`
 */
export class CallControls extends CustomElement {
    static sheet = sheet;

    @translate t = useTranslator("pc-call-controls");

    @property({ type: Boolean, reflect: true, rerender: true }) mic: boolean = false;
    @property({ type: Boolean, reflect: true, rerender: true }) camera: boolean = false;
    @property({ type: Boolean, reflect: true, rerender: true }) screen: boolean = false;
    @property({ type: Boolean, reflect: true, rerender: true }) chat: boolean = false;
    @property({ type: Boolean, reflect: true, rerender: true }) viewer: boolean = false;
    // default true: a boolean attribute can't be "on" by default, so `canscreen="false"` turns it off
    @property({ type: Boolean, reflect: true, rerender: true }) canscreen: boolean = true;

    @bind
    private handleToggle(e: Event) {
        const control = (e.currentTarget as HTMLElement).dataset.control as ToggleControl;
        this.dispatchEvent(new CustomEvent<ToggleEvent>("toggle", { detail: { control }, bubbles: true, composed: true }));
    }

    @bind
    private handleInvite() {
        this.dispatchEvent(new CustomEvent("invite", { bubbles: true, composed: true }));
    }

    @bind
    private handleDevices() {
        this.dispatchEvent(new CustomEvent("devices", { bubbles: true, composed: true }));
    }

    @bind
    private handleHangup() {
        this.dispatchEvent(new CustomEvent("hangup", { bubbles: true, composed: true }));
    }

    // mic/camera: off is the alarming state (filled error). screen/chat: on is the highlighted state (filled primary).
    private renderToggle(control: ToggleControl, on: boolean, icon: string, offIcon: string, label: string, tip: string) {
        const highlightOn = control === "screen" || control === "chat";
        const filled = highlightOn ? on : !on;
        const color = highlightOn ? "primary" : "error";

        return html`
            <pap-button data-control="${control}" part="${control}" size="icon" type="button" color="${filled ? color : "secondary"}" variant="${filled ? "filled" : "outline"}" aria-label="${label}" aria-pressed="${on ? "true" : "false"}" popovertarget="${`tip-${control}`}" @click="${this.handleToggle}">
                <pap-icon name="${`/icons/${on ? icon : offIcon}.svg`}" aria-hidden="true"></pap-icon>
            </pap-button>
            <pap-tooltip id="${`tip-${control}`}" placement="top" instant>${tip}</pap-tooltip>
        `;
    }

    render() {
        const t = this.t;

        if (this.viewer)
        {
            return html`
                <pap-group part="toolbar" aria-label="${t("label")}">
                    ${this.renderToggle("chat", this.chat, "chat", "chat", t("chat"), this.chat ? t("chatOn") : t("chatOff"))}
                    <pap-button part="hangup" size="icon" type="button" color="error" aria-label="${t("hangup")}" popovertarget="tip-hangup" @click="${this.handleHangup}">
                        <pap-icon name="/icons/phone-off.svg" aria-hidden="true"></pap-icon>
                    </pap-button>
                </pap-group>
                <pap-tooltip id="tip-hangup" placement="top" instant>${t("hangupTip")}</pap-tooltip>
            `;
        }

        return html`
            <pap-group part="toolbar" aria-label="${t("label")}">
                ${this.renderToggle("mic", this.mic, "mic", "mic-off", t("mic"), this.mic ? t("micOn") : t("micOff"))}
                ${this.renderToggle("camera", this.camera, "camera", "camera-off", t("camera"), this.camera ? t("cameraOn") : t("cameraOff"))}
                ${this.canscreen ? this.renderToggle("screen", this.screen, "screen", "screen-off", t("screen"), this.screen ? t("screenOn") : t("screenOff")) : ""}
                ${this.renderToggle("chat", this.chat, "chat", "chat", t("chat"), this.chat ? t("chatOn") : t("chatOff"))}
                <pap-button part="invite" size="icon" type="button" color="secondary" variant="outline" aria-label="${t("invite")}" popovertarget="tip-invite" @click="${this.handleInvite}">
                    <pap-icon name="/icons/user-plus.svg" aria-hidden="true"></pap-icon>
                </pap-button>
                <pap-button part="devices" size="icon" type="button" color="secondary" variant="outline" aria-label="${t("devices")}" popovertarget="tip-devices" @click="${this.handleDevices}">
                    <pap-icon name="/icons/settings.svg" aria-hidden="true"></pap-icon>
                </pap-button>
                <pap-button part="hangup" size="icon" type="button" color="error" aria-label="${t("hangup")}" popovertarget="tip-hangup" @click="${this.handleHangup}">
                    <pap-icon name="/icons/phone-off.svg" aria-hidden="true"></pap-icon>
                </pap-button>
            </pap-group>
            <pap-tooltip id="tip-invite" placement="top" instant>${t("inviteTip")}</pap-tooltip>
            <pap-tooltip id="tip-devices" placement="top" instant>${t("devicesTip")}</pap-tooltip>
            <pap-tooltip id="tip-hangup" placement="top" instant>${t("hangupTip")}</pap-tooltip>
        `;
    }
}

declare global {
    interface HTMLElementTagNameMap {
        "pc-call-controls": CallControls;
    }
}
