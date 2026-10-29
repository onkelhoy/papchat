// system
import { CustomElement, html, property, query } from "@papit/web-component";
import { translate, useTranslator } from "@papit/translator";
import "@papit/menu";
import type { Menu } from "@papit/menu";

// local
import sheet from "./style.css" with { type: "css" };
import type { Device, DeviceChangeEvent, DeviceKind } from "./types";

/**
 * Select-like picker for one kind of media device. A labelled button opens a
 * `pap-menu` listing "Default" followed by the given devices. The component
 * never calls `enumerateDevices`; the page passes the list in.
 *
 * @element pc-device-picker
 *
 * @property {DeviceKind} kind `audioinput | videoinput | audiooutput` (default `audioinput`)
 * @property {Device[]} devices `{ deviceId, label }[]` (set as a property)
 * @property {string} value chosen deviceId, "" = system default
 * @property {boolean} supported set to false when `setSinkId` is missing: hides an `audiooutput` picker (default true)
 *
 * @fires change `CustomEvent<{ value: string }>` when another device is chosen ("" = default)
 * @csspart label the visible label
 * @csspart trigger the button that opens the menu
 */
export class DevicePicker extends CustomElement {
    static sheet = sheet;

    @translate t = useTranslator("pc-device-picker");

    @property({ type: String, reflect: true, rerender: true }) kind: DeviceKind = "audioinput";
    @property({ type: Array, attribute: false, rerender: true }) devices: Device[] = [];
    @property({ type: String, rerender: true }) value: string = "";
    @property({ type: Boolean, attribute: false, rerender: true }) supported: boolean = true;

    @query("pap-menu") private menu!: Menu;

    private get hiddenKind() {
        return this.kind === "audiooutput" && !this.supported;
    }

    // the browser lists a "default" entry itself, ours replaces it
    private get list(): Device[] {
        return this.devices.filter(d => d.deviceId !== "default");
    }

    private nameOf(device: Device, index: number) {
        return device.label || `${this.t(`fallback.${this.kind}`)} ${index + 1}`;
    }

    private get currentLabel() {
        const list = this.list;
        const index = list.findIndex(d => d.deviceId === this.value);
        return index < 0 ? this.t("default") : this.nameOf(list[index], index);
    }

    private handleSelect(value: string) {
        // a menu stays open after a choice: close it and return focus to the trigger
        this.menu?.hidePopover();
        if (value === this.value) return;

        this.value = value;
        this.dispatchEvent(new CustomEvent<DeviceChangeEvent>("change", {
            detail: { value },
            bubbles: true,
            composed: true,
        }));
    }

    render() {
        this.toggleAttribute("hidden", this.hiddenKind);
        const current = this.list.some(d => d.deviceId === this.value) ? this.value : "";

        return html`
            <span part="label" id="label" class="label">${this.t(`kind.${this.kind}`)}</span>
            <button part="trigger" type="button" popovertarget="menu" aria-haspopup="listbox" aria-labelledby="label value">
                <span id="value" class="value">${this.currentLabel}</span>
                <span class="chevron" aria-hidden="true"></span>
            </button>
            <pap-menu id="menu" role="listbox" aria-labelledby="label" placement="bottom-left">
                <pap-menuitem role="option" aria-selected="${String(current === "")}" @click="${() => this.handleSelect("")}">
                    <span>${this.t("default")}</span>
                </pap-menuitem>
                ${this.list.map((device, index) => html`
                    <pap-menuitem role="option" aria-selected="${String(device.deviceId === current)}" @click="${() => this.handleSelect(device.deviceId)}">
                        <span>${this.nameOf(device, index)}</span>
                    </pap-menuitem>
                `)}
            </pap-menu>
        `;
    }
}

declare global {
    interface HTMLElementTagNameMap {
        "pc-device-picker": DevicePicker;
    }
}
