// system
import { CustomElement, html, property } from "@papit/web-component";
import { translate, useTranslator } from "@papit/translator";
import "@papit/button";
import "@papchat/avatar";

// local
import sheet from "./style.css" with { type: "css" };
import type { AccountPickEvent, AccountRemoveEvent, AccountRow } from "./types";

/**
 * The accounts saved in this browser. Picking one reports it, the page opens it. Removing one asks
 * first, in the row itself, because it can't be undone.
 *
 * @element pc-account-list
 *
 * @property {AccountRow[]} accounts the rows, in order
 * @property {string} current uid of the open account: its row is marked and can't be picked; "" for none
 *
 * @fires account-pick `CustomEvent<{ slot }>` an account was picked (bubbles, composed)
 * @fires account-remove `CustomEvent<{ slot }>` removing an account was confirmed (bubbles, composed)
 */
export class AccountList extends CustomElement {
    static sheet = sheet;

    @translate t = useTranslator("pc-account-list");

    @property({ type: Array, rerender: true }) accounts: AccountRow[] = [];
    @property({ type: String, rerender: true }) current: string = "";

    // uid of the row asking "are you sure"
    @property({ type: String, attribute: false, rerender: true }) private asking: string = "";

    private emit<T>(name: string, detail: T) {
        this.dispatchEvent(new CustomEvent<T>(name, { detail, bubbles: true, composed: true }));
    }

    private handlePick(account: AccountRow) {
        if (account.uid === this.current) return;
        this.emit<AccountPickEvent>("account-pick", { slot: account.slot });
    }

    private handleRemove(account: AccountRow) {
        this.asking = "";
        this.emit<AccountRemoveEvent>("account-remove", { slot: account.slot });
    }

    render() {
        return html`
            <ul>
                ${this.accounts.map(account => html`
                    <li key="${account.slot}">
                        <button
                            class="pick"
                            type="button"
                            aria-current="${String(account.uid === this.current)}"
                            @click="${() => this.handlePick(account)}"
                        >
                            <pc-avatar name="${account.name}" color="${account.color}" uid="${account.uid}"></pc-avatar>
                            <span class="name">${account.name}</span>
                            <span class="mark">${account.uid === this.current ? this.t("current") : ""}</span>
                        </button>
                        <pap-button
                            size="small"
                            variant="clear"
                            aria-label="${this.t("remove-account", { name: account.name })}"
                            @click="${() => { this.asking = account.uid; }}"
                        >${this.t("remove")}</pap-button>
                        ${this.asking === account.uid ? html`
                            <div class="confirm" role="alert">
                                <p>${this.t(account.linked ? "warning-linked" : "warning", { name: account.name })}</p>
                                <div class="choices">
                                    <pap-button size="small" variant="clear" @click="${() => { this.asking = ""; }}">${this.t("cancel")}</pap-button>
                                    <pap-button size="small" @click="${() => this.handleRemove(account)}">${this.t("confirm")}</pap-button>
                                </div>
                            </div>
                        ` : ""}
                    </li>
                `)}
            </ul>
        `;
    }
}

declare global {
    interface HTMLElementTagNameMap {
        "pc-account-list": AccountList;
    }
}
