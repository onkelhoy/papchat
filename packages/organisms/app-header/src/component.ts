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
import type { ThemePicker } from "@papit/theme-picker";
import "@papit/theme-picker";
import "@papchat/avatar";
import "@papchat/presence";
import "@papchat/connection-status";

// local
import sheet from "./style.css" with { type: "css" };
import type { GoLiveEvent, StatusChangeEvent } from "./types";

export const STATUSES: Status[] = ["available", "busy", "away", "dnd"];

type Theme = "light" | "dark" | "system";
const NEXT: Record<Theme, Theme> = { light: "dark", dark: "system", system: "light" };
const DARK = "(prefers-color-scheme: dark)";

/**
 * Top bar of the app: connection state, "Go live", theme, settings and the user's own avatar with
 * a status menu. It only reports what the user did, the page applies it. The theme button cycles
 * light → dark → system and shows the theme in effect (system shows the resolved one with an "auto"
 * mark); a hidden `pap-theme-picker storage="local"` applies and remembers it.
 *
 * @element pc-app-header
 *
 * @property {Profile} me the signed-in profile (avatar and status menu are hidden without it)
 * @property {LobbyStatus} status lobby connection state; `idle` is shown as `connecting`
 * @property {string} network name of the private network in use, shown next to the connection state; "" = public
 * @property {boolean} live you are presenting: the button reads "End broadcast" and fires `end-live` (reflected)
 *
 * @fires status-change `CustomEvent<{ status }>` a presence status was chosen
 * @fires open-settings the settings button was clicked
 * @fires go-live `CustomEvent<{ title }>` a title was confirmed in the "Go live" dialog (the title is trimmed, never empty)
 * @fires end-live the "End broadcast" button was clicked (only while `live`)
 *
 * @csspart bar the header row
 */
export class AppHeader extends CustomElement {
    static sheet = sheet;

    @translate t = useTranslator("pc-app-header");

    @property({ type: Object, attribute: false, rerender: true }) me?: Profile | null;
    @property({ type: String, rerender: true }) status: LobbyStatus = "connecting";
    @property({ type: String, rerender: true }) network: string = "";
    @property({ type: Boolean, reflect: true, rerender: true }) live: boolean = false;

    // the "Go live" title dialog
    @property({ type: Boolean, attribute: false, rerender: true }) private asking: boolean = false;
    @property({ type: String, attribute: false, rerender: true }) private liveTitle: string = "";

    @query("pap-menu.status") private statusMenu!: Menu;
    @query({ selector: "pap-theme-picker", load: function (this: AppHeader, el: Element) { this.theme = (el as ThemePicker).value ?? "system"; } }) private picker?: ThemePicker;

    // the picker's choice, and what the system prefers (for "system")
    @property({ type: String, attribute: false, rerender: true }) private theme: Theme = "system";
    @property({ type: Boolean, attribute: false, rerender: true }) private systemDark: boolean = false;
    private media?: MediaQueryList;

    connectedCallback(): void {
        this.media = window.matchMedia(DARK);
        this.systemDark = this.media.matches;
        this.media.addEventListener("change", this.handleSystemTheme);
        super.connectedCallback();
    }

    disconnectedCallback(): void {
        this.media?.removeEventListener("change", this.handleSystemTheme);
        super.disconnectedCallback();
    }
    private get connection() {
        return this.status === "idle" || this.status === "waking" ? "connecting" : this.status;
    }

    private handleStatus(status: Status) {
        // a menu stays open after a choice, close it and let focus return to the trigger
        this.statusMenu?.hidePopover();
        if (status === this.me?.status) return;

        this.dispatchEvent(new CustomEvent<StatusChangeEvent>("status-change", { detail: { status } }));
    }

    private handleSystemTheme = (e: MediaQueryListEvent) => {
        this.systemDark = e.matches;
    }

    @bind
    private handleThemeButton() {
        const picker = this.picker ?? this.root.querySelector<ThemePicker>("pap-theme-picker");
        if (picker) picker.value = NEXT[this.theme];
    }

    // also fires when the settings dialog's picker changed the page theme (it observes the same target)
    @bind
    private handleThemeChange(e: Event) {
        e.stopPropagation();
        this.theme = (e.currentTarget as ThemePicker).value ?? "system";
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

    private renderTheme() {
        const shown = this.theme === "system" ? (this.systemDark ? "dark" : "light") : this.theme;
        const label = this.theme === "system"
            ? this.t("theme-system", { mode: this.t(`theme-${shown}`) })
            : this.t(`theme-${shown}`);

        return html`
            <pap-button class="theme" size="icon" variant="clear" aria-label="${label}" title="${label}" @click="${this.handleThemeButton}">
                <pap-icon name="${`/icons/${shown === "dark" ? "moon" : "sun"}.svg`}" aria-hidden="true"></pap-icon>
                ${this.theme === "system" ? html`<span class="auto" aria-hidden="true">A</span>` : ""}
            </pap-button>
        `;
    }

    render() {
        const me = this.me;

        return html`
            <div part="bar" class="bar">
                <pc-connection-status status="${this.connection}"></pc-connection-status>
                ${this.network ? html`<span class="network" title="${this.t("network", { name: this.network })}">${this.network}</span>` : ""}
                <span class="spacer"></span>

                <pap-button class="live" size="small" variant="${this.live ? "filled" : "clear"}" color="${this.live ? "error" : "primary"}" @click="${this.handleLiveButton}">
                    <pap-icon name="/icons/spritesheet.svg#broadcast" aria-hidden="true"></pap-icon>
                    <span class="label">${this.live ? this.t("end") : this.t("golive")}</span>
                </pap-button>

                ${this.renderTheme()}
                <pap-theme-picker storage="local" aria-hidden="true" @change="${this.handleThemeChange}"></pap-theme-picker>
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
                close-outside-click="true"
                @close="${this.handleDialogClose}"
            >
                <h2 slot="header" class="dialog-title">${this.t("dialog-title")}</h2>
                <form class="ask" @submit="${this.handleStart}">
                    <label for="live-title">${this.t("title-label")}</label>
                    <pap-input
                        id="live-title"
                        name="title"
                        autocomplete="off"
                        maxlength="80"
                        aria-label="${this.t("title-label")}"
                        placeholder="${this.t("title-example")}"
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
