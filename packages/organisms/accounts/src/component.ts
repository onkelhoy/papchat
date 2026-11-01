// system
import { bind, CustomElement, html, property } from "@papit/web-component";
import { translate, useTranslator } from "@papit/translator";
import "@papit/dialog";
import "@papit/button";
import "@papchat/account-list";

// local
import sheet from "./style.css" with { type: "css" };
import type { AccountRow } from "./types";

/**
 * "Manage accounts" dialog: every account in this browser, and a way to add one. It holds no logic of
 * its own. `account-pick` and `account-remove` from the list pass straight through.
 *
 * @element pc-accounts
 *
 * @property {boolean} open whether the dialog is shown (reflected)
 * @property {AccountRow[]} accounts the rows, in order (property only)
 * @property {string} current uid of the open account
 *
 * @fires add-account "Add account" was pressed (bubbles, composed)
 * @csspart dialog the `pap-dialog`
 */
export class Accounts extends CustomElement {
    static sheet = sheet;

    @translate t = useTranslator("pc-accounts");

    @property({ type: Boolean, reflect: true, rerender: true }) open: boolean = false;
    @property({ type: Array, attribute: false, rerender: true }) accounts: AccountRow[] = [];
    @property({ type: String, rerender: true }) current: string = "";

    @bind
    private handleClose() {
        this.open = false;
    }

    @bind
    private handleAdd() {
        this.dispatchEvent(new CustomEvent("add-account", { bubbles: true, composed: true }));
    }

    render() {
        return html`
            <pap-dialog part="dialog" open="${this.open && "true"}" header="${this.t("title")}" close-outside-click="true" @close="${this.handleClose}">
                <div class="body">
                    <pc-account-list accounts="${JSON.stringify(this.accounts)}" current="${this.current}"></pc-account-list>
                    <pap-button type="button" @click="${this.handleAdd}">${this.t("add")}</pap-button>
                </div>
            </pap-dialog>
        `;
    }
}

declare global {
    interface HTMLElementTagNameMap {
        "pc-accounts": Accounts;
    }
}
