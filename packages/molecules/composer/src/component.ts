// system
import { bind, CustomElement, html, property, query } from "@papit/web-component";
import { translate, useTranslator } from "@papit/translator";
import "@papit/button";
import "@papit/file-input";
import type { FileInput } from "@papit/file-input";
import "@papit/icon";

// local
import sheet from "./style.css" with { type: "css" };
import type { FilesEvent, SendEvent } from "./types";

const TYPING_INTERVAL = 1000;

/**
 * Message composer: a growing multiline field, a send button and an attach button.
 *
 * Enter sends, Shift+Enter inserts a newline (Enter during IME composition is left alone).
 * `pap-input` is single-line, so the field is a native `<textarea>` styled with theme tokens.
 * Attaching goes through a visually hidden `pap-file-input` (multiple), opened by the attach button.
 *
 * @element pc-composer
 *
 * @property {boolean} disabled disables the field and both buttons (reflected)
 * @property {string} placeholder placeholder text (default: translated "Write a message")
 *
 * @fires send `CustomEvent<{ text: string }>` trimmed text, the field is cleared afterwards
 * @fires typing `CustomEvent<void>` at most once per second while the user types
 * @fires files `CustomEvent<{ files: File[] }>` files chosen with the attach button
 *
 * @csspart field the textarea
 * @csspart send the send button
 * @csspart attach the attach button
 */
export class Composer extends CustomElement {
    static sheet = sheet;

    @translate t = useTranslator("pc-composer");

    @property({ type: Boolean, reflect: true }) disabled: boolean = false;
    @property({ type: String }) placeholder?: string;

    // only tracks "is there something to send", rerenders the send button state
    @property({ type: Boolean, attribute: false }) private filled: boolean = false;

    @query("textarea") private field!: HTMLTextAreaElement;
    @query("pap-file-input") private picker!: FileInput;

    private lastTyping = 0;

    focus(options?: FocusOptions) {
        this.field?.focus(options);
    }

    @bind
    private handleInput() {
        this.filled = this.field.value.trim().length > 0;
        if (!this.filled) return;

        const now = performance.now();
        if (this.lastTyping && now - this.lastTyping < TYPING_INTERVAL) return;

        this.lastTyping = now;
        this.dispatchEvent(new CustomEvent("typing", { bubbles: true, composed: true }));
    }

    @bind
    private handleKeydown(e: KeyboardEvent) {
        if (e.key !== "Enter" || e.shiftKey || e.isComposing) return;

        e.preventDefault();
        this.submit();
    }

    @bind
    private submit() {
        if (this.disabled) return;

        const text = this.field.value.trim();
        if (!text) return;

        this.field.value = "";
        this.filled = false;
        this.lastTyping = 0;
        this.dispatchEvent(new CustomEvent<SendEvent>("send", { detail: { text }, bubbles: true, composed: true }));
    }

    @bind
    private handleAttach() {
        if (this.disabled) return;
        this.picker?.input?.click();
    }

    @bind
    private handlePicked() {
        const files = [...(this.picker?.files ?? [])];

        // empty the native input so choosing the same file again fires change again
        if (this.picker?.input) this.picker.input.value = "";
        if (files.length === 0) return;

        this.dispatchEvent(new CustomEvent<FilesEvent>("files", { detail: { files }, bubbles: true, composed: true }));
    }

    render() {
        // attribute bindings must be the whole value; an empty value removes the attribute
        const off = this.disabled ? "disabled" : "";
        const sendOff = this.disabled || !this.filled ? "disabled" : "";

        return html`
            <pap-button part="attach" variant="clear" color="secondary" size="icon" type="button" disabled="${off}" aria-label="${this.t("attach")}" @click="${this.handleAttach}">
                <pap-icon name="/icons/spritesheet.svg#paperclip" aria-hidden="true"></pap-icon>
            </pap-button>
            <pap-file-input multiple tabindex="-1" aria-hidden="true" @change="${this.handlePicked}"></pap-file-input>
            <textarea
                part="field"
                rows="1"
                placeholder="${this.placeholder ?? this.t("placeholder")}"
                aria-label="${this.placeholder ?? this.t("placeholder")}"
                disabled="${off}"
                @input="${this.handleInput}"
                @keydown="${this.handleKeydown}"
            ></textarea>
            <pap-button part="send" color="primary" size="icon" type="button" disabled="${sendOff}" aria-label="${this.t("send")}" @click="${this.submit}">
                <pap-icon name="/icons/spritesheet.svg#send" aria-hidden="true"></pap-icon>
            </pap-button>
        `;
    }
}

declare global {
    interface HTMLElementTagNameMap {
        "pc-composer": Composer;
    }
}
