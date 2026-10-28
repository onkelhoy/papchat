// system
import { CustomElement, html, property, query } from "@papit/web-component";
import { translate, useTranslator } from "@papit/translator";
import "@papit/menu";
import type { Menu } from "@papit/menu";
import "@papit/icon";

// local
import sheet from "./style.css" with { type: "css" };
import type { Language, LanguageChangeEvent } from "./types";

export const DEFAULT_LANGUAGES: Language[] = [
    { code: "en", label: "English", flag: "/icons/flags/en.svg" },
    { code: "sv", label: "Svenska", flag: "/icons/flags/sv.svg" },
];

/**
 * Language menu: a button showing the current flag that opens a `pap-menu`
 * of languages. It only reports the choice, it never calls the translator.
 *
 * @element pc-language-picker
 *
 * @property {string} value language code of the current language (default "en")
 * @property {Language[]} languages `{ code, label, flag }[]`, flag is a `pap-icon` name (default en, sv)
 *
 * @fires change `CustomEvent<{ value: string }>` when another language is chosen
 * @csspart trigger the button that opens the menu
 */
export class LanguagePicker extends CustomElement {
    static sheet = sheet;

    @translate t = useTranslator("pc-language-picker");

    @property({ type: String }) value: string = "en";
    @property({ type: Array, attribute: false }) languages: Language[] = DEFAULT_LANGUAGES;

    @query("pap-menu") private menu!: Menu;

    private get current(): Language | undefined {
        return this.languages.find(l => l.code === this.value) ?? this.languages[0];
    }

    private handleSelect(language: Language) {
        // a menu stays open after a choice, close it and let focus return to the trigger
        this.menu?.hidePopover();
        if (language.code === this.value) return;

        this.value = language.code;
        this.dispatchEvent(new CustomEvent<LanguageChangeEvent>("change", {
            detail: { value: language.code },
            bubbles: true,
            composed: true,
        }));
    }

    render() {
        const current = this.current;

        return html`
            <button part="trigger" type="button" popovertarget="menu" aria-label="${this.t("label")}" aria-haspopup="menu">
                <pap-icon name="${current?.flag ?? ""}" aria-hidden="true"></pap-icon>
                <span class="code">${current?.code ?? ""}</span>
            </button>
            <pap-menu id="menu" placement="bottom-right">
                ${this.languages.map(language => html`
                    <pap-menuitem role="menuitemradio" aria-checked="${String(language.code === this.value)}" @click="${() => this.handleSelect(language)}">
                        <pap-icon name="${language.flag}" aria-hidden="true"></pap-icon>
                        <span>${language.label}</span>
                    </pap-menuitem>
                `)}
            </pap-menu>
        `;
    }
}

declare global {
    interface HTMLElementTagNameMap {
        "pc-language-picker": LanguagePicker;
    }
}
