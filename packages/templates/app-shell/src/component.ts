// system
import { CustomElement, bind, html, property } from "@papit/web-component";
import { translate, useTranslator } from "@papit/translator";

// foundations
import "@papit/icon";
import "@papit/button";

// molecules
import "@papit/sidebar";
import "@papit/drawer";

// local
import sheet from "./style.css" with { type: "css" };
import type { SidebarToggleDetail } from "./types";

// below this width the sidebar slot lives in a drawer instead of a sidebar
const MOBILE = "(max-width: 799.98px)";

/**
 * Page layout: header on top, sidebar on the left, main filling the rest.
 *
 * On wide screens the `sidebar` slot is rendered inside a collapsible `pap-sidebar`.
 * Under 800 px it moves into a modal `pap-drawer`, opened by a menu button that
 * sits next to the `header` slot. `sidebaropen` drives both and follows their
 * own toggles (hamburger, Escape, backdrop click), so the page can just listen
 * to `sidebar-toggle`.
 *
 * @element pc-app-shell
 *
 * @property {boolean} sidebaropen whether the sidebar (desktop) or drawer (mobile) is open (reflected)
 *
 * @fires sidebar-toggle {SidebarToggleDetail} sidebaropen changed, `detail.open` is the new value
 *
 * @slot brand   logo/name, in the sidebar's header (top of the drawer on mobile)
 * @slot header  top bar content
 * @slot sidebar sidebar / drawer content, e.g. room list and member list
 * @slot main    fills the remaining area
 * @slot overlay layer above everything, e.g. incoming calls (pointer events pass through the empty area)
 * @slot toasts  layer above the overlay, e.g. `pc-toaster`
 * @csspart menu the menu button shown on mobile
 */
export class AppShell extends CustomElement {
    static sheet = sheet;

    @property({
        type: Boolean,
        reflect: true,
        rerender: true,
        after: function (this: AppShell, value: boolean, _old: boolean, isinitial: boolean) {
            if (isinitial) return;
            this.dispatchEvent(new CustomEvent<SidebarToggleDetail>("sidebar-toggle", { detail: { open: value } }));
        }
    }) sidebaropen: boolean = false;

    // render state only, never an attribute
    @property({ type: Boolean, attribute: false, rerender: true }) private mobile = false;

    @translate t = useTranslator("pc-app-shell");

    private media?: MediaQueryList;
    private observer?: MutationObserver;

    connectedCallback(): void {
        // set before the first render so the right container is built straight away
        this.media = window.matchMedia(MOBILE);
        this.mobile = this.media.matches;
        // wide screens start with the sidebar open, phones with the drawer closed
        this.sidebaropen = !this.mobile;
        this.media.addEventListener("change", this.handlemedia);

        super.connectedCallback();
    }

    disconnectedCallback(): void {
        super.disconnectedCallback();

        this.media?.removeEventListener("change", this.handlemedia);
        this.observer?.disconnect();
        this.observer = undefined;
    }

    // event handlers
    private handlemedia = (e: MediaQueryListEvent) => {
        this.mobile = e.matches;
        // a drawer left open would cover the page after shrinking, a closed sidebar hides navigation after growing
        this.sidebaropen = !e.matches;
    }

    @bind
    private handlemenu() {
        this.sidebaropen = true;
    }

    // the drawer closes itself (Escape, backdrop click) and fires open/close
    @bind
    private handledraweropen(e: Event) {
        if (e.target === e.currentTarget) this.sidebaropen = true;
    }

    @bind
    private handledrawerclose(e: Event) {
        if (e.target === e.currentTarget) this.sidebaropen = false;
    }

    // pap-sidebar has no event: it toggles its own `open` attribute, so watch that
    private watchsidebar() {
        this.observer?.disconnect();

        const sidebar = this.root.querySelector("pap-sidebar");
        if (!sidebar) return;

        this.observer ??= new MutationObserver(() => {
            const el = this.root.querySelector("pap-sidebar");
            if (el) this.sidebaropen = el.hasAttribute("open");
        });
        this.observer.observe(sidebar, { attributes: true, attributeFilter: ["open"] });
    }

    render() {
        // the first render after a layout switch builds the new container, then we (re)attach the observer
        queueMicrotask(() => this.watchsidebar());

        // attribute bindings must be the whole value; an empty string removes the attribute
        const open = this.sidebaropen ? "open" : "";

        return html`
            <header part="header">
                ${this.mobile ? html`
                    <pap-button part="menu" size="icon" variant="clear" aria-label="${this.t("menu")}" @click="${this.handlemenu}">
                        <pap-icon name="/icons/spritesheet.svg#menu" aria-hidden="true"></pap-icon>
                    </pap-button>
                ` : null}
                <slot name="header"></slot>
            </header>
            ${this.mobile ? html`
                <pap-drawer static placement="left" label="${this.t("sidebar")}" open="${open}" @open="${this.handledraweropen}" @close="${this.handledrawerclose}">
                    <slot name="brand"></slot>
                    <slot name="sidebar"></slot>
                </pap-drawer>
            ` : html`
                <pap-sidebar open="${open}">
                    <slot name="brand" slot="header"></slot>
                    <slot name="sidebar"></slot>
                </pap-sidebar>
            `}
            <main part="main">
                <slot name="main"></slot>
            </main>
            <div part="overlay">
                <slot name="overlay"></slot>
            </div>
            <div part="toasts">
                <slot name="toasts"></slot>
            </div>
        `;
    }
}

declare global {
    interface HTMLElementTagNameMap {
        "pc-app-shell": AppShell;
    }
}
