// system
import { bind, CustomElement, html, property, query } from "@papit/web-component";
import { translate, useTranslator } from "@papit/translator";
import type { Profile, Status, LobbyStatus } from "@papchat/core";
import "@papit/button";
import "@papit/dialog";
import "@papit/input";
import "@papit/icon";
import "@papit/menu";
import type { Menu } from "@papit/menu";
import "@papit/theme-picker";
import "@papchat/avatar";
import "@papchat/presence";
import "@papchat/connection-status";
import "@papchat/language-picker";

// local
import sheet from "./style.css" with { type: "css" };
import type { GoLiveEvent, StatusChangeEvent, LanguageChangeEvent } from "./types";

export const STATUSES: Status[] = ["available", "busy", "away", "dnd"];

/**
 * Top bar of the app: name, connection state, "Go live", language, theme,
 * settings and the user's own avatar with a status menu. It only reports what
 * the user did, the page applies it.
 *
 * @element pc-app-header
 *
 * @property {Profile} me the signed-in profile (avatar and status menu are hidden without it)
 * @property {LobbyStatus} status lobby connection state; `idle` is shown as `connecting`
 * @property {string} language language code for the language picker (default "en")
 * @property {boolean} live you are presenting: the button reads "End broadcast" and fires `end-live` (reflected)
 *
 * @fires status-change `CustomEvent<{ status }>` a presence status was chosen
 * @fires language-change `CustomEvent<{ value }>` a language was chosen
 * @fires open-settings the settings button was clicked
 * @fires go-live `CustomEvent<{ title }>` a title was confirmed in the "Go live" dialog (the title is trimmed, never empty)
 * @fires end-live the "End broadcast" button was clicked (only while `live`)
 *
 * @csspart bar the header row
 */
export class AppHeader extends CustomElement {
    static sheet = sheet;

    @translate t = useTranslator("pc-app-header");

    @property({ type: Object, attribute: false }) me?: Profile | null;
    @property({ type: String }) status: LobbyStatus = "connecting";
    @property({ type: String }) language: string = "en";
    @property({ type: Boolean, reflect: true }) live: boolean = false;

    // the "Go live" title dialog
    @property({ type: Boolean, attribute: false }) private asking: boolean = false;
    @property({ type: String, attribute: false }) private liveTitle: string = "";

    @query("pap-menu.status") private statusMenu!: Menu;

    private get connection() {
        return this.status === "idle" ? "connecting" : this.status;
    }

    private handleStatus(status: Status) {
        // a menu stays open after a choice, close it and let focus return to the trigger
        this.statusMenu?.hidePopover();
        if (status === this.me?.status) return;

        this.dispatchEvent(new CustomEvent<StatusChangeEvent>("status-change", { detail: { status } }));
    }

    private handleLanguage = (e: Event) => {
        // the picker's own `change` is internal, re-announce it under this component's name
        e.stopPropagation();
        const value = (e as CustomEvent<{ value: string }>).detail.value;
        this.dispatchEvent(new CustomEvent<LanguageChangeEvent>("language-change", { detail: { value } }));
    }

    private handleSettings = () => {
        this.dispatchEvent(new CustomEvent("open-settings"));
    }

    private handleLiveButton = () => {
        if (this.live)
        {
            this.dispatchEvent(new CustomEvent("end-live"));
            return;
        }

        this.liveTitle = "";
        this.asking = true;
    }

    @bind
    private handleTitle(e: Event) {
        this.liveTitle = String((e.currentTarget as HTMLInputElement).value ?? "");
    }

    @bind
    private handleDialogClose() {
        // also fires when we close it ourselves
        this.asking = false;
    }

    @bind
    private handleStart(e?: Event) {
        e?.preventDefault();
        const title = this.liveTitle.trim();
        if (!title) return;

        this.asking = false;
        this.dispatchEvent(new CustomEvent<GoLiveEvent>("go-live", { detail: { title } }));
    }

    render() {
        const me = this.me;

        return html`
            <div part="bar" class="bar">
                <span class="logo">papchat</span>
                <pc-connection-status status="${this.connection}"></pc-connection-status>
                <span class="spacer"></span>

                <pap-button class="live" size="small" color="${this.live ? "error" : "primary"}" @click="${this.handleLiveButton}">
                    <pap-icon name="/icons/spritesheet.svg#broadcast" aria-hidden="true"></pap-icon>
                    ${this.live ? this.t("end") : this.t("golive")}
                </pap-button>

                <pc-language-picker value="${this.language}" @change="${this.handleLanguage}"></pc-language-picker>
                <pap-theme-picker storage="local"></pap-theme-picker>
                <pap-button class="settings" size="icon" variant="clear" aria-label="${this.t("settings")}" @click="${this.handleSettings}">
                    <pap-icon name="/icons/spritesheet.svg#settings" aria-hidden="true"></pap-icon>
                </pap-button>

                ${me ? html`
                    <button class="me" type="button" popovertarget="status-menu" aria-haspopup="menu" aria-label="${this.t("account", { name: me.name, status: this.t(me.status) })}">
                        <pc-avatar name="${me.name}" color="${me.color}" uid="${me.uid}">
                            <pc-presence slot="badge" status="${me.status}"></pc-presence>
                        </pc-avatar>
                    </button>
                    <pap-menu id="status-menu" class="status" placement="bottom-right">
                        ${STATUSES.map(status => html`
                            <pap-menuitem role="menuitemradio" aria-checked="${String(status === me.status)}" @click="${() => this.handleStatus(status)}">
                                <pc-presence status="${status}"></pc-presence>
                                <span>${this.t(status)}</span>
                            </pap-menuitem>
                        `)}
                    </pap-menu>
                ` : ""}
            </div>
            <pap-dialog
                part="dialog"
                open="${this.asking && "true"}"
                header="${this.t("dialog-title")}"
                close-outside-click="true"
                @close="${this.handleDialogClose}"
            >
                <form class="ask" @submit="${this.handleStart}">
                    <pap-input
                        name="title"
                        autocomplete="off"
                        maxlength="80"
                        aria-label="${this.t("title-label")}"
                        placeholder="${this.t("title-label")}"
                        value="${this.liveTitle}"
                        @input="${this.handleTitle}"
                        @change="${this.handleTitle}"
                    ></pap-input>
                </form>
                <div slot="footer" class="footer">
                    <pap-button variant="clear" @click="${this.handleDialogClose}">${this.t("cancel")}</pap-button>
                    <pap-button disabled="${!this.liveTitle.trim() && "true"}" @click="${this.handleStart}">${this.t("start")}</pap-button>
                </div>
            </pap-dialog>
        `;
    }
}

declare global {
    interface HTMLElementTagNameMap {
        "pc-app-header": AppHeader;
    }
}
