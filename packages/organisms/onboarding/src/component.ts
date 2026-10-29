// system
import { bind, CustomElement, html, property, query } from "@papit/web-component";
import { translate, useTranslator } from "@papit/translator";
import "@papit/dialog";
import type { Dialog } from "@papit/dialog";
import "@papit/input";
import "@papit/radio";
import "@papit/button";
import "@papit/switch";
import "@papchat/avatar";
import "@papchat/language-picker";

// local
import sheet from "./style.css" with { type: "css" };
import type { OnboardingLanguageEvent, OnboardingSubmitEvent } from "./types";

// same 8 colours as `PALETTE` in @papchat/core (components never import core at runtime)
export const DEFAULT_COLORS: string[] = [
    "#2563eb", // blue
    "#7c3aed", // violet
    "#db2777", // pink
    "#dc2626", // red
    "#ea580c", // orange
    "#ca8a04", // amber
    "#16a34a", // green
    "#0d9488", // teal
];

// same limit as `NAME_MAX` in @papchat/core
export const NAME_MAX = 32;

/**
 * Modal "Who are you?" dialog: name, colour, language and network (the public papchat one, or
 * a private one by name and password). It cannot be
 * dismissed (close button, Escape) while `open` is set: the page closes it by
 * setting `open = false` after handling `submit`.
 *
 * `name`, `color` and `language` are the live values of the form, so the page
 * can pre-fill them and read them back.
 *
 * @element pc-onboarding
 *
 * @property {boolean} open whether the dialog is shown
 * @property {string} name the name field (trimmed on submit)
 * @property {string} color the chosen colour, one of `colors`
 * @property {string} language code of the chosen language (default "en")
 * @property {string[]} colors the swatches (default: the 8 colours of `PALETTE` in core)
 * @property {string} network name of a private network to join, "" for the public one
 *
 * @fires submit `CustomEvent<{ name, color, language, network }>` valid form submitted (bubbles, composed)
 * @fires language-change `CustomEvent<{ value }>` the language was changed, so the page can translate live (bubbles, composed)
 * @csspart dialog the `pap-dialog`
 */
export class Onboarding extends CustomElement {
    static sheet = sheet;

    @translate t = useTranslator("pc-onboarding");

    @property({ type: Boolean, rerender: true }) open: boolean = false;
    @property({ type: String, rerender: true }) name: string = "";
    @property({ type: String, rerender: true }) color: string = "";
    @property({ type: String, rerender: true }) language: string = "en";
    @property({ type: Array, attribute: false, rerender: true }) colors: string[] = DEFAULT_COLORS;
    @property({ type: String, rerender: true }) network: string = "";

    // the private network fields only show while the switch is on
    @property({ type: Boolean, attribute: false, rerender: true }) private priv: boolean = false;

    // errors only show after a first attempt, not while the field is still empty
    @property({ type: Boolean, attribute: false, rerender: true }) private attempted: boolean = false;

    @query("pap-dialog") private dialog!: Dialog;

    private get trimmed(): string {
        return this.name.trim();
    }

    private get valid(): boolean {
        return this.trimmed.length >= 1 && this.trimmed.length <= NAME_MAX && (!this.priv || this.network.trim().length > 0);
    }

    connectedCallback(): void {
        super.connectedCallback();
        this.priv = !!this.network;
    }

    @bind
    private handlePrivate(e: Event) {
        this.priv = !!(e.currentTarget as HTMLInputElement).checked;
    }

    @bind
    private handleNetwork(e: Event) {
        this.network = String((e.currentTarget as HTMLInputElement).value ?? "");
    }

    // read at submit: a password field may not have fired `change` yet
    private field(id: string): string {
        return String(this.shadowRoot?.querySelector<HTMLInputElement>(`#${id}`)?.value ?? "");
    }

    @bind
    private handleName(e: Event) {
        this.name = String((e.currentTarget as HTMLInputElement).value ?? "");
    }

    @bind
    private handleColor(color: string, e: Event) {
        if ((e.currentTarget as HTMLInputElement).checked) this.color = color;
    }

    @bind
    private handleLanguage(e: Event) {
        // our own event replaces the picker's `change`
        e.stopPropagation();
        this.language = (e as CustomEvent<{ value: string }>).detail.value;
        this.dispatchEvent(new CustomEvent<OnboardingLanguageEvent>("language-change", {
            detail: { value: this.language },
            bubbles: true,
            composed: true,
        }));
    }

    @bind
    private handleClose() {
        // not dismissible: Escape and the close button end up here, so open it again
        if (!this.open) return;
        requestAnimationFrame(() =>
        {
            if (this.open) this.dialog?.showModal();
        });
    }

    @bind
    private handleSubmit(e: Event) {
        e.preventDefault();
        if (this.priv) this.network = this.field("network");
        this.attempted = true;
        if (!this.valid) return;

        this.name = this.trimmed;
        this.dispatchEvent(new CustomEvent<OnboardingSubmitEvent>("submit", {
            detail: {
                name: this.trimmed,
                color: this.color || this.colors[0],
                language: this.language,
                network: this.priv ? { name: this.network.trim(), password: this.field("password") } : null,
            },
            bubbles: true,
            composed: true,
        }));
    }

    render() {
        const color = this.color || this.colors[0];
        const invalid = this.attempted && !(this.trimmed.length >= 1 && this.trimmed.length <= NAME_MAX);
        const networkInvalid = this.attempted && this.priv && !this.network.trim();

        return html`
            <pap-dialog part="dialog" open="${this.open && "true"}" header="${this.t("title")}" @close="${this.handleClose}">
                <form novalidate @submit="${this.handleSubmit}">
                    <div class="preview">
                        <pc-avatar size="l" name="${this.trimmed}" color="${color}"></pc-avatar>
                    </div>

                    <label for="name">${this.t("name")}</label>
                    <pap-input
                        id="name"
                        name="name"
                        required
                        maxlength="${NAME_MAX}"
                        autocomplete="nickname"
                        placeholder="${this.t("placeholder")}"
                        value="${this.name}"
                        aria-invalid="${String(invalid)}"
                        aria-describedby="error"
                        @change="${this.handleName}"
                    ></pap-input>
                    <p id="error" class="error" role="alert">${invalid ? this.t("error") : ""}</p>

                    <div id="colors-label" class="label">${this.t("color")}</div>
                    <div class="swatches" role="radiogroup" aria-labelledby="colors-label">
                        ${this.colors.map((c, i) => html`
                            <pap-radio
                                key="${c}"
                                name="pc-onboarding-color"
                                value="${c}"
                                aria-label="${`${this.t("color")} ${i + 1}`}"
                                checked="${c === color && "true"}"
                                style="${`--_swatch: ${c}`}"
                                @change="${(e: Event) => this.handleColor(c, e)}"
                            ></pap-radio>
                        `)}
                    </div>

                    <div class="language">
                        <span class="label">${this.t("language")}</span>
                        <pc-language-picker value="${this.language}" @change="${this.handleLanguage}"></pc-language-picker>
                    </div>

                    <div class="network">
                        <pap-switch checked="${this.priv && "true"}" @change="${this.handlePrivate}">${this.t("private")}</pap-switch>
                        <p class="hint">${this.t(this.priv ? "private-hint" : "public-hint")}</p>
                        ${this.priv ? html`
                            <label for="network">${this.t("network")}</label>
                            <pap-input
                                id="network"
                                name="network"
                                maxlength="40"
                                autocomplete="off"
                                value="${this.network}"
                                aria-invalid="${String(networkInvalid)}"
                                @change="${this.handleNetwork}"
                            ></pap-input>
                            <label for="password">${this.t("password")}</label>
                            <pap-input id="password" name="password" type="password" autocomplete="off"></pap-input>
                            <p class="error" role="alert">${networkInvalid ? this.t("network-error") : ""}</p>
                        ` : ""}
                    </div>

                    <pap-button type="submit" size="large">${this.t("submit")}</pap-button>
                </form>
            </pap-dialog>
        `;
    }
}

declare global {
    interface HTMLElementTagNameMap {
        "pc-onboarding": Onboarding;
    }
}
