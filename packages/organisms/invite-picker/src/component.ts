// system
import { bind, CustomElement, html, property } from "@papit/web-component";
import { translate, useTranslator } from "@papit/translator";
import "@papit/dialog";
import "@papit/checkbox";
import "@papit/input";
import "@papit/button";
import "@papchat/avatar";
import type { Profile } from "@papchat/core";

// local
import sheet from "./style.css" with { type: "css" };
import type { InviteEvent } from "./types";

/**
 * Modal dialog to pick members to invite to a room. The page passes only the
 * people who are not in the room yet. Closing it (button, Escape, X) fires
 * `close`; the page then sets `open = false`.
 *
 * @element pc-invite-picker
 *
 * @property {boolean} open whether the dialog is shown
 * @property {Profile[]} members who can be invited (property only)
 *
 * @fires invite `CustomEvent<{ uids }>` the invite button was pressed (bubbles, composed)
 * @fires close `CustomEvent<void>` the dialog was dismissed by the user (bubbles, composed)
 * @csspart dialog the `pap-dialog`
 */
export class InvitePicker extends CustomElement {
    static sheet = sheet;

    @translate t = useTranslator("pc-invite-picker");

    @property({
        type: Boolean,
        rerender: true,
        after(this: InvitePicker) {
            // every opening starts from a clean slate
            this.selected = new Set();
            this.query = "";
        }
    }) open: boolean = false;
    @property({ type: Array, attribute: false, rerender: true }) members: Profile[] = [];

    @property({ type: String, attribute: false, rerender: true }) private query: string = "";
    @property({ attribute: false, rerender: true }) private selected: Set<string> = new Set();

    private get filtered(): Profile[] {
        const q = this.query.trim().toLowerCase();
        if (!q) return this.members;
        return this.members.filter(m => m.name.toLowerCase().includes(q));
    }

    // only people who are still invitable count (the list can change while open)
    private get picked(): string[] {
        return this.members.filter(m => this.selected.has(m.uid)).map(m => m.uid);
    }

    @bind
    private handleSearch(e: Event) {
        this.query = String((e.currentTarget as HTMLInputElement).value ?? "");
    }

    @bind
    private handleToggle(uid: string, e: Event) {
        const checked = !!(e.currentTarget as HTMLInputElement).checked;
        if (checked === this.selected.has(uid)) return;

        const next = new Set(this.selected);
        if (checked) next.add(uid);
        else next.delete(uid);
        this.selected = next;
    }

    @bind
    private handleDialogClose() {
        // also fires when the page closes us; only dismissals by the user count
        if (!this.open) return;
        this.open = false;
        this.dispatchClose();
    }

    @bind
    private handleCancel() {
        this.open = false;
        this.dispatchClose();
    }

    private dispatchClose() {
        this.dispatchEvent(new CustomEvent<void>("close", { bubbles: true, composed: true }));
    }

    @bind
    private handleInvite() {
        const uids = this.picked;
        if (uids.length === 0) return;

        this.dispatchEvent(new CustomEvent<InviteEvent>("invite", {
            detail: { uids },
            bubbles: true,
            composed: true,
        }));
    }

    render() {
        const list = this.filtered;
        const count = this.picked.length;

        return html`
            <pap-dialog
                part="dialog"
                open="${this.open && "true"}"
                header="${this.t("title")}"
                close-outside-click="true"
                @close="${this.handleDialogClose}"
            >
                <div class="body">
                    <pap-input
                        type="search"
                        name="search"
                        autocomplete="off"
                        aria-label="${this.t("search")}"
                        placeholder="${this.t("search")}"
                        value="${this.query}"
                        @change="${this.handleSearch}"
                    ></pap-input>

                    <ul class="list" aria-label="${this.t("members")}">
                        ${list.map(member => html`
                            <li key="${member.uid}">
                                <pap-checkbox
                                    checked="${this.selected.has(member.uid) ? "true" : ""}"
                                    @change="${(e: Event) => this.handleToggle(member.uid, e)}"
                                >
                                    <span class="member">
                                        <pc-avatar size="s" name="${member.name}" color="${member.color}" uid="${member.uid}"></pc-avatar>
                                        <span class="name">${member.name}</span>
                                    </span>
                                </pap-checkbox>
                            </li>
                        `)}
                    </ul>

                    <p class="empty" role="status">${list.length === 0 ? this.t(this.members.length === 0 ? "none" : "no-results") : ""}</p>
                </div>

                <div slot="footer" class="footer">
                    <pap-button variant="clear" @click="${this.handleCancel}">${this.t("cancel")}</pap-button>
                    <pap-button disabled="${count === 0 && "true"}" @click="${this.handleInvite}">${count > 0 ? this.t("invite-count", { count: String(count) }) : this.t("invite")}</pap-button>
                </div>
            </pap-dialog>
        `;
    }
}

declare global {
    interface HTMLElementTagNameMap {
        "pc-invite-picker": InvitePicker;
    }
}
