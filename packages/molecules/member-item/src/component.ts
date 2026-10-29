// system
import { CustomElement, bind, html, property, query } from "@papit/web-component";
import { translate, useTranslator } from "@papit/translator";
import "@papit/menu";
import type { Menu } from "@papit/menu";
import "@papit/icon";
import "@papchat/avatar";
import "@papchat/presence";
import "@papchat/badge";
import type { Profile } from "@papchat/core";

// local
import sheet from "./style.css" with { type: "css" };
import type { MemberAction, MemberActionEvent, MemberFilesEvent } from "./types";

/**
 * One row of the member list: avatar with presence dot, name, status text and
 * a ⋯ menu with Chat / Call / Video call / Invite to current room.
 *
 * The row itself is the focus target (a `listitem`, so put it in a `role="list"`,
 * e.g. a `pap-group`, which roves `tabindex` between rows). Its accessible name is
 * "name, status[, You][, In a call]"; the visible text is hidden from AT so it
 * isn't read twice. The ⋯ button is only in the tab order while the row has focus.
 *
 * Keyboard and mouse: Enter or double-click on the row = `chat`; the context menu
 * (right-click, Shift+F10, Menu key) opens the ⋯ menu. A `self` row has no actions.
 *
 * @element pc-member-item
 *
 * @property {Profile} profile the member (`uid`, `name`, `color`, `status`); property only
 * @property {boolean} self     this is you: shows a "You" badge, no menu, no events (reflected)
 * @property {boolean} incall   shows a small phone icon (reflected)
 * @property {boolean} canInvite shows "Invite to current room" in the menu (attribute `caninvite`)
 *
 * Files dragged onto a row (not your own) highlight it (`:state(drop)`); dropping them fires `member-files`.
 *
 * @fires member-action `CustomEvent<{ uid, action: "chat" | "call" | "video" | "invite" }>` (bubbles, composed)
 * @fires member-files `CustomEvent<{ uid, files: File[] }>` files dropped on the row (bubbles, composed)
 *
 * @csspart avatar  the `pc-avatar`
 * @csspart name    the name text
 * @csspart status  the status text
 * @csspart trigger the ⋯ button
 * @cssstate menu-open while the ⋯ menu is open
 * @cssstate drop files are being dragged over the row
 */
export class MemberItem extends CustomElement {
    static sheet = sheet;

    @translate({ update: function (this: Element) { (this as MemberItem).updateLabel(); } })
    t = useTranslator("pc-member-item");

    @property({ type: Object, attribute: false, after: function (this: MemberItem) { this.updateLabel(); }, rerender: true }) profile?: Profile;
    @property({ type: Boolean, reflect: true, after: function (this: MemberItem) { this.updateLabel(); }, rerender: true }) self: boolean = false;
    @property({ type: Boolean, reflect: true, after: function (this: MemberItem) { this.updateLabel(); }, rerender: true }) incall: boolean = false;
    @property({ type: Boolean, attribute: "caninvite", rerender: true }) canInvite: boolean = false;

    // true while focus is on the row or inside it: puts the ⋯ button in the tab order
    @property({ type: Boolean, attribute: false, rerender: true }) private focused: boolean = false;

    @query("pap-menu") private menu?: Menu;
    @query("[part='trigger']") private trigger?: HTMLButtonElement;

    // :state(menu-open); attachInternals is fine in the constructor, setAttribute is not
    private internals = this.attachInternals();

    connectedCallback(): void {
        super.connectedCallback();

        // ARIA and tabindex go on the host here, never in the constructor.
        // A parent pap-group may own tabindex (roving), so only set a default.
        this.setAttribute("role", "listitem");
        if (!this.hasAttribute("tabindex")) this.setAttribute("tabindex", "0");
        this.updateLabel();

        this.addEventListener("keydown", this.handleKeydown);
        this.addEventListener("dblclick", this.handleDblclick);
        this.addEventListener("contextmenu", this.handleContextmenu);
        this.addEventListener("focusin", this.handleFocusin);
        this.addEventListener("focusout", this.handleFocusout);
        this.addEventListener("dragenter", this.handleDragenter);
        this.addEventListener("dragover", this.handleDragover);
        this.addEventListener("dragleave", this.handleDragleave);
        this.addEventListener("drop", this.handleDrop);
    }

    disconnectedCallback(): void {
        super.disconnectedCallback();

        this.removeEventListener("keydown", this.handleKeydown);
        this.removeEventListener("dblclick", this.handleDblclick);
        this.removeEventListener("contextmenu", this.handleContextmenu);
        this.removeEventListener("focusin", this.handleFocusin);
        this.removeEventListener("focusout", this.handleFocusout);
        this.removeEventListener("dragenter", this.handleDragenter);
        this.removeEventListener("dragover", this.handleDragover);
        this.removeEventListener("dragleave", this.handleDragleave);
        this.removeEventListener("drop", this.handleDrop);
        this.endDrop();
    }

    private get status() {
        return this.profile?.status ?? "available";
    }

    private updateLabel() {
        if (!this.isConnected) return;

        const parts = [this.profile?.name?.trim() || "?", this.t(`status.${this.status}`)];
        if (this.self) parts.push(this.t("you"));
        if (this.incall) parts.push(this.t("incall"));
        this.setAttribute("aria-label", parts.join(", "));
    }

    private dispatchAction(action: MemberAction) {
        const uid = this.profile?.uid;
        if (this.self || !uid) return;

        this.dispatchEvent(new CustomEvent<MemberActionEvent>("member-action", {
            detail: { uid, action },
            bubbles: true,
            composed: true,
        }));
    }

    // true when the event started on the ⋯ button or inside the menu, which handle themselves
    private fromControls(e: Event) {
        return e.composedPath().some(node => node === this.trigger || node === this.menu);
    }

    private depth = 0;

    private acceptsDrop(e: DragEvent) {
        return !this.self && !!this.profile?.uid && !!e.dataTransfer && Array.from(e.dataTransfer.types).includes("Files");
    }

    private endDrop() {
        this.depth = 0;
        this.internals.states.delete("drop");
    }

    // event handlers

    @bind
    private handleDragenter(e: DragEvent) {
        if (!this.acceptsDrop(e)) return;

        e.preventDefault();
        this.depth++;
        this.internals.states.add("drop");
    }

    @bind
    private handleDragover(e: DragEvent) {
        if (!this.acceptsDrop(e)) return;

        e.preventDefault();
        if (e.dataTransfer) e.dataTransfer.dropEffect = "copy";
    }

    // enter/leave fire for every child crossed: only the last leave ends the highlight
    @bind
    private handleDragleave(e: DragEvent) {
        if (!this.acceptsDrop(e)) return;

        this.depth = Math.max(0, this.depth - 1);
        if (this.depth === 0) this.internals.states.delete("drop");
    }

    @bind
    private handleDrop(e: DragEvent) {
        if (!this.acceptsDrop(e)) return;

        e.preventDefault();
        // the room's own drop zone must not also get these
        e.stopPropagation();
        this.endDrop();

        const files = Array.from(e.dataTransfer?.files ?? []);
        const uid = this.profile?.uid;
        if (files.length === 0 || !uid) return;

        this.dispatchEvent(new CustomEvent<MemberFilesEvent>("member-files", { detail: { uid, files }, bubbles: true, composed: true }));
    }

    @bind
    private handleKeydown(e: KeyboardEvent) {
        // only the row itself: Enter on the ⋯ button or a menu item is theirs
        if (e.key !== "Enter" || e.composedPath()[0] !== this) return;

        e.preventDefault();
        this.dispatchAction("chat");
    }

    @bind
    private handleDblclick(e: MouseEvent) {
        if (this.fromControls(e)) return;
        this.dispatchAction("chat");
    }

    // right-click, Shift+F10 and the Menu key all fire contextmenu: open our menu instead
    @bind
    private handleContextmenu(e: MouseEvent) {
        if (this.self || !this.trigger || this.fromControls(e)) return;

        e.preventDefault();
        // clicking the popovertarget button (not showPopover) keeps it the invoker, so focus returns to it
        this.trigger.click();
    }

    @bind
    private handleFocusin() {
        this.focused = true;
    }

    @bind
    private handleFocusout(e: FocusEvent) {
        // relatedTarget is retargeted: focus moving into our shadow root reads as `this`
        const next = e.relatedTarget as Node | null;
        this.focused = !!next && (next === this || this.contains(next));
    }

    @bind
    private handleMenuToggle(e: Event) {
        const open = (e as ToggleEvent).newState === "open";
        if (open) this.internals.states.add("menu-open");
        else this.internals.states.delete("menu-open");
    }

    @bind
    private handleSelect(e: Event) {
        const action = (e.currentTarget as HTMLElement).dataset.action as MemberAction;

        // pap-menu stays open after a choice: close it, focus returns to the ⋯ button
        this.menu?.hidePopover();
        this.dispatchAction(action);
    }

    render() {
        const name = this.profile?.name ?? "";

        // the visible text is aria-hidden: the host's aria-label already says all of it
        return html`
            <pc-avatar part="avatar" aria-hidden="true" name="${name}" uid="${this.profile?.uid ?? ""}" color="${this.profile?.color ?? ""}">
                <pc-presence slot="badge" status="${this.status}"></pc-presence>
            </pc-avatar>
            <span class="text" aria-hidden="true">
                <span class="line">
                    <span part="name" class="name">${name}</span>
                    ${this.self ? html`<pc-badge>${this.t("you")}</pc-badge>` : ""}
                    ${this.incall ? html`<pap-icon class="incall" name="/icons/spritesheet.svg#phone" title="${this.t("incall")}"></pap-icon>` : ""}
                </span>
                <span part="status" class="status">${this.t(`status.${this.status}`)}</span>
            </span>
            ${this.self ? "" : this.renderMenu(name)}
        `;
    }

    private renderMenu(name: string) {
        return html`
            <button part="trigger" type="button" popovertarget="menu" tabindex="${this.focused ? "0" : "-1"}" aria-haspopup="menu" aria-label="${this.t("actions", { name })}">
                <span aria-hidden="true">⋯</span>
            </button>
            <pap-menu id="menu" placement="bottom-right" @toggle="${this.handleMenuToggle}">
                <pap-menuitem data-action="chat" @click="${this.handleSelect}">
                    <pap-icon name="/icons/spritesheet.svg#chat" aria-hidden="true"></pap-icon>
                    <span>${this.t("chat")}</span>
                </pap-menuitem>
                <pap-menuitem data-action="call" @click="${this.handleSelect}">
                    <pap-icon name="/icons/spritesheet.svg#phone" aria-hidden="true"></pap-icon>
                    <span>${this.t("call")}</span>
                </pap-menuitem>
                <pap-menuitem data-action="video" @click="${this.handleSelect}">
                    <pap-icon name="/icons/spritesheet.svg#camera" aria-hidden="true"></pap-icon>
                    <span>${this.t("video")}</span>
                </pap-menuitem>
                ${this.canInvite ? html`
                    <pap-menuitem data-action="invite" @click="${this.handleSelect}">
                        <pap-icon name="/icons/spritesheet.svg#user-plus" aria-hidden="true"></pap-icon>
                        <span>${this.t("invite")}</span>
                    </pap-menuitem>
                ` : ""}
            </pap-menu>
        `;
    }
}

declare global {
    interface HTMLElementTagNameMap {
        "pc-member-item": MemberItem;
    }
}
