// system
import { bind, CustomElement, html, property } from "@papit/web-component";
import { translate, useTranslator } from "@papit/translator";
import "@papit/button";
import "@papit/input";

// local
import sheet from "./style.css" with { type: "css" };
import type { NetworkChangeEvent, NetworkEntry } from "./types";

/**
 * Picks the network to be in: a list of the networks on the server (papchat public first) with a
 * Join button each, plus a "Join or create" form. A name nobody uses yet makes a new network, an
 * empty password leaves it open. The component never connects: it fires `network-change` and the
 * page decides (switch now, or remember it until onboarding is submitted).
 *
 * Joining an open listed network fires straight away; a locked one fills the form's name and moves
 * focus to the password.
 *
 * @element pc-network-picker
 *
 * @property {string} network name of the network in use (or picked), "" for the public one
 * @property {NetworkEntry[]} networks the networks on the server (property only)
 *
 * @fires network-change `CustomEvent<{ network }>` a network was picked, `null` = public (bubbles, composed)
 * @fires networks-refresh Refresh pressed: the page sets a fresh `networks` (bubbles, composed)
 *
 * @csspart list the network list
 * @csspart form the join-or-create form
 */
export class NetworkPicker extends CustomElement {
    static sheet = sheet;

    @translate t = useTranslator("pc-network-picker");

    @property({ type: String, rerender: true }) network: string = "";
    @property({ type: Array, attribute: false, rerender: true }) networks: NetworkEntry[] = [];

    private emit<T>(name: string, detail?: T) {
        this.dispatchEvent(new CustomEvent<T>(name, { detail, bubbles: true, composed: true }));
    }

    // read when pressed: a field may not have fired `change` yet
    private field(id: string): string {
        return String(this.shadowRoot?.querySelector<HTMLInputElement>(`#${id}`)?.value ?? "");
    }

    @bind
    private handleSubmit(e: Event) {
        e.preventDefault();
        e.stopPropagation();
        const name = this.field("name").trim();
        if (!name) return;
        this.emit<NetworkChangeEvent>("network-change", { network: { name, password: this.field("password") } });
    }

    private handleJoin(entry: NetworkEntry) {
        if (!entry.name)
        {
            this.emit<NetworkChangeEvent>("network-change", { network: null });
            return;
        }
        if (!entry.locked)
        {
            this.emit<NetworkChangeEvent>("network-change", { network: { name: entry.name, password: "" } });
            return;
        }
        const name = this.shadowRoot?.querySelector<HTMLInputElement>("#name");
        if (name) name.value = entry.name;
        this.shadowRoot?.querySelector<HTMLElement>("#password")?.focus();
    }

    @bind
    private handleRefresh() {
        this.emit("networks-refresh");
    }

    render() {
        return html`
            <p class="hint">${this.network ? this.t("private", { name: this.network }) : this.t("public-current")}</p>
            <div class="section">
                <div class="row">
                    <span class="label">${this.t("networks")}</span>
                    <pap-button size="small" variant="clear" type="button" @click="${this.handleRefresh}">${this.t("refresh")}</pap-button>
                </div>
                <div part="list" class="list" role="list">
                    ${this.networks.map(entry => html`
                        <div class="item" role="listitem" key="${entry.name || "-public"}">
                            <span class="name">${entry.name || this.t("public")}</span>
                            <span class="hint">${this.t("members", { count: String(entry.members) })}${entry.locked ? ` · ${this.t("locked")}` : ""}</span>
                            <span class="spacer"></span>
                            ${entry.name === this.network ? html`<span class="hint">${this.t("current")}</span>` : ""}
                            ${entry.name === this.network ? "" : html`<pap-button size="small" variant="clear" type="button" @click="${() => this.handleJoin(entry)}">${this.t("join")}</pap-button>`}
                        </div>
                    `)}
                </div>
            </div>
            <form part="form" class="section" @submit="${this.handleSubmit}">
                <span class="label">${this.t("join-or-create")}</span>
                <label for="name">${this.t("name")}</label>
                <pap-input id="name" maxlength="40" autocomplete="off"></pap-input>
                <label for="password">${this.t("password")}</label>
                <pap-input id="password" type="password" autocomplete="off"></pap-input>
                <div class="row">
                    <pap-button type="submit" variant="outline">${this.t("join-or-create")}</pap-button>
                </div>
                <p class="hint">${this.t("hint")}</p>
            </form>
        `;
    }
}

declare global {
    interface HTMLElementTagNameMap {
        "pc-network-picker": NetworkPicker;
    }
}
