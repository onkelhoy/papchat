// system
import { bind, CustomElement, html, property, query } from "@papit/web-component";
import { translate, useTranslator } from "@papit/translator";
import "@papit/button";
import "@papit/file-input";
import type { FileInput } from "@papit/file-input";
import "@papit/icon";
import { renderText } from "@papchat/message";

// local
import sheet from "./style.css" with { type: "css" };
import type { FilesEvent, SendEvent } from "./types";

const TYPING_INTERVAL = 1000;

// a paired mark around the selection (or the word at the cursor's empty selection)
type Wrap = { kind: "wrap"; mark: string };
// a prefix on every selected line
type Prefix = { kind: "prefix"; prefix: (index: number) => string; pattern: RegExp };
type Tool = { id: string; icon: string; action: Wrap | Prefix | { kind: "link" } | { kind: "code" } };

const TOOLS: Tool[][] = [
    [
        { id: "bold", icon: "bold", action: { kind: "wrap", mark: "**" } },
        { id: "italic", icon: "italic", action: { kind: "wrap", mark: "*" } },
        { id: "underline", icon: "underline", action: { kind: "wrap", mark: "__" } },
        { id: "strike", icon: "strike", action: { kind: "wrap", mark: "~~" } },
    ],
    [
        { id: "bullets", icon: "list", action: { kind: "prefix", prefix: () => "- ", pattern: /^\s*[-*]\s+/ } },
        { id: "numbers", icon: "list-ordered", action: { kind: "prefix", prefix: i => `${i + 1}. `, pattern: /^\s*\d{1,3}[.)]\s+/ } },
    ],
    [
        { id: "quote", icon: "quote", action: { kind: "prefix", prefix: () => "> ", pattern: /^\s*>\s?/ } },
        { id: "link", icon: "link", action: { kind: "link" } },
        { id: "code", icon: "code", action: { kind: "code" } },
    ],
];

const SHORTCUTS: Record<string, string> = { b: "bold", i: "italic", u: "underline" };
const LIST_LINE = /^(\s*)([-*]|\d{1,3}[.)]|>)\s+\S/;

/**
 * Message composer: a growing field with formatting, attach and send.
 *
 * Collapsed it's one line with the buttons on the right. The format button ("T") opens a toolbar
 * (bold, italic, underline, strikethrough | bullets, numbers | quote, link, code, and a trash button
 * that clears the draft) and a live preview. Formatting is the markdown subset `pc-message`
 * renders: the toolbar wraps or prefixes the selection, so what's sent is plain text with marks.
 *
 * Enter sends, Shift+Enter inserts a newline (and continues a list or quote). Ctrl/Cmd+B/I/U
 * format. Enter during IME composition is left alone. Attaching goes through a visually hidden
 * `pap-file-input` (multiple), opened by the attach button.
 *
 * @element pc-composer
 *
 * @property {boolean} disabled disables the field and the buttons (reflected)
 * @property {string} placeholder placeholder text (default: translated "Type a message")
 * @property {boolean} formatting the toolbar and preview are open (reflected)
 *
 * @fires send `CustomEvent<{ text: string }>` trimmed text, the field is cleared afterwards
 * @fires typing `CustomEvent<void>` at most once per second while the user types
 * @fires files `CustomEvent<{ files: File[] }>` files chosen with the attach button
 *
 * @csspart box the frame around field, toolbar and buttons
 * @csspart toolbar the formatting toolbar
 * @csspart preview the live preview
 * @csspart field the textarea
 * @csspart send the send button
 * @csspart attach the attach button
 */
export class Composer extends CustomElement {
    static sheet = sheet;

    @translate t = useTranslator("pc-composer");

    @property({ type: Boolean, reflect: true, rerender: true }) disabled: boolean = false;
    @property({ type: String, rerender: true }) placeholder?: string;
    @property({ type: Boolean, reflect: true, rerender: true, after: function (this: Composer) { this.syncPreview(); } }) formatting: boolean = false;

    // only tracks "is there something to send", rerenders the send button state
    @property({ type: Boolean, attribute: false, rerender: true }) private filled: boolean = false;

    @query("textarea") private field!: HTMLTextAreaElement;
    @query("pap-file-input") private picker!: FileInput;

    private lastTyping = 0;

    focus(options?: FocusOptions) {
        this.field?.focus(options);
    }

    // the preview comes and goes with `formatting`: fill it after each render
    update() {
        super.update();
        this.syncPreview();
        return undefined;
    }

    // ---------------------------------------------------------------- typing and sending

    @bind
    private handleInput() {
        this.filled = this.field.value.trim().length > 0;
        this.syncPreview();
        if (!this.filled) return;

        const now = performance.now();
        if (this.lastTyping && now - this.lastTyping < TYPING_INTERVAL) return;

        this.lastTyping = now;
        this.dispatchEvent(new CustomEvent("typing", { bubbles: true, composed: true }));
    }

    @bind
    private handleKeydown(e: KeyboardEvent) {
        if (e.isComposing) return;

        const shortcut = (e.ctrlKey || e.metaKey) && !e.altKey && !e.shiftKey ? SHORTCUTS[e.key.toLowerCase()] : undefined;
        if (shortcut)
        {
            e.preventDefault();
            this.apply(shortcut);
            return;
        }

        if (e.key !== "Enter") return;
        if (e.shiftKey)
        {
            // a new line in a list or quote starts the next item
            if (this.continueList()) e.preventDefault();
            return;
        }

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
        this.syncPreview();
        this.dispatchEvent(new CustomEvent<SendEvent>("send", { detail: { text }, bubbles: true, composed: true }));
    }

    @bind
    private handleClear() {
        this.field.value = "";
        this.filled = false;
        this.syncPreview();
        this.field.focus();
    }

    @bind
    private handleFormatting() {
        this.formatting = !this.formatting;
        this.field?.focus();
    }

    // ---------------------------------------------------------------- formatting

    @bind
    private handleTool(e: Event) {
        const id = (e.currentTarget as HTMLElement).dataset.tool;
        if (id) this.apply(id);
    }

    private apply(id: string) {
        const tool = TOOLS.flat().find(t => t.id === id);
        const field = this.field;
        if (!tool || !field || this.disabled) return;

        switch (tool.action.kind)
        {
            case "wrap": this.wrap(tool.action.mark); break;
            case "prefix": this.prefixLines(tool.action); break;
            case "link": this.link(); break;
            case "code": this.code(); break;
        }
        field.focus();
        this.handleInput();
    }

    // **selection**, or remove the marks when they're already there
    private wrap(mark: string) {
        const field = this.field;
        let { selectionStart: start, selectionEnd: end, value } = field;

        // nothing selected: take the word at the cursor
        if (start === end)
        {
            while (start > 0 && /\S/.test(value[start - 1])) start--;
            while (end < value.length && /\S/.test(value[end])) end++;
        }

        const inner = value.slice(start, end);
        const before = value.slice(start - mark.length, start);
        const after = value.slice(end, end + mark.length);
        // a single * next to another * belongs to a ** pair, not to this mark
        const doubled = mark.length === 1 && (value[start - 2] === mark || value[end + 1] === mark);

        if (before === mark && after === mark && !doubled)
        {
            this.replace(start - mark.length, end + mark.length, inner, 0, inner.length);
        }
        else if (inner.startsWith(mark) && inner.endsWith(mark) && inner.length >= mark.length * 2)
        {
            const bare = inner.slice(mark.length, inner.length - mark.length);
            this.replace(start, end, bare, 0, bare.length);
        }
        else
        {
            this.replace(start, end, mark + inner + mark, mark.length, mark.length + inner.length);
        }
    }

    // a prefix on every selected line; all lines already have it → take it off
    private prefixLines(action: Prefix) {
        const field = this.field;
        const { value } = field;
        const start = value.lastIndexOf("\n", field.selectionStart - 1) + 1;
        let end = value.indexOf("\n", field.selectionEnd);
        if (end < 0) end = value.length;

        const lines = value.slice(start, end).split("\n");
        const all = lines.every(line => action.pattern.test(line));
        const next = lines
            .map((line, i) => all ? line.replace(action.pattern, "") : action.prefix(i) + line.replace(action.pattern, ""))
            .join("\n");
        this.replace(start, end, next, next.length, next.length);
    }

    // [selection](https://) with the URL part selected, or [link](url) when the selection is a URL
    private link() {
        const field = this.field;
        const { selectionStart: start, selectionEnd: end, value } = field;
        const inner = value.slice(start, end);

        if (/^https?:\/\/\S+$/i.test(inner))
        {
            const label = this.t("link-text");
            this.replace(start, end, `[${label}](${inner})`, 1, 1 + label.length);
            return;
        }
        const label = inner || this.t("link-text");
        const url = "https://";
        const text = `[${label}](${url})`;
        this.replace(start, end, text, label.length + 3, label.length + 3 + url.length);
    }

    // `inline`, or a fenced block when the selection spans lines (or is empty on an empty line)
    private code() {
        const field = this.field;
        const { selectionStart: start, selectionEnd: end, value } = field;
        const inner = value.slice(start, end);
        const lineStart = value.lastIndexOf("\n", start - 1) + 1;
        const emptyLine = !inner && value.slice(lineStart, value.indexOf("\n", start) < 0 ? value.length : value.indexOf("\n", start)).trim() === "";

        if (inner.includes("\n") || emptyLine)
        {
            const text = "```\n" + inner + "\n```";
            this.replace(start, end, text, 4, 4 + inner.length);
            return;
        }
        this.wrap("`");
    }

    // Shift+Enter on "- item" adds "\n- "; on an empty item it ends the list instead
    private continueList(): boolean {
        const field = this.field;
        const { selectionStart: at, value } = field;
        if (at !== field.selectionEnd) return false;

        const lineStart = value.lastIndexOf("\n", at - 1) + 1;
        const line = value.slice(lineStart, at);
        const empty = line.match(/^(\s*)([-*]|\d{1,3}[.)]|>)\s*$/);
        if (empty)
        {
            this.replace(lineStart, at, "", 0, 0);
            return true;
        }

        const match = line.match(LIST_LINE);
        if (!match) return false;

        const marker = /^\d/.test(match[2])
            ? `${parseInt(match[2], 10) + 1}${match[2].slice(-1)}`
            : match[2];
        const text = `\n${match[1]}${marker} `;
        this.replace(at, at, text, text.length, text.length);
        return true;
    }

    // replace [start, end) with `text` (undoable where the browser allows it) and select text[from, to)
    private replace(start: number, end: number, text: string, from: number, to: number) {
        const field = this.field;
        field.focus();
        field.setSelectionRange(start, end);
        // insertText keeps the browser's undo history; setRangeText is the fallback
        const inserted = typeof document.execCommand === "function" && document.execCommand("insertText", false, text);
        if (!inserted || field.value.slice(start, start + text.length) !== text) field.setRangeText(text, start, end, "end");
        field.setSelectionRange(start + from, start + to);
    }

    // ---------------------------------------------------------------- preview

    // the toolbar's live preview shows the draft as it will look (only once it has some formatting)
    private syncPreview() {
        const preview = this.shadowRoot?.querySelector<HTMLElement>("[part='preview']");
        if (!preview) return;

        const text = this.field?.value.trim() ?? "";
        const marked = /[*_~`>\[]|^\s*(?:[-*]|\d{1,3}[.)])\s/m.test(text);
        preview.hidden = !text || !marked;
        if (preview.hidden || preview.dataset.text === text) return;
        preview.replaceChildren(renderText(text));
        preview.dataset.text = text;
    }

    // ---------------------------------------------------------------- files

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

    // ---------------------------------------------------------------- render

    private renderToolbar() {
        const off = this.disabled ? "disabled" : "";

        return html`
            <div part="toolbar" class="toolbar" role="toolbar" aria-label="${this.t("toolbar")}">
                ${TOOLS.map((group, g) => html`
                    ${g > 0 ? html`<span class="divider" aria-hidden="true"></span>` : ""}
                    ${group.map(tool => html`
                        <pap-button size="icon" variant="clear" color="secondary" type="button" data-tool="${tool.id}" disabled="${off}" aria-label="${this.t(tool.id)}" title="${this.t(tool.id)}" @click="${this.handleTool}">
                            <pap-icon name="${`/icons/spritesheet.svg#${tool.icon}`}" aria-hidden="true"></pap-icon>
                        </pap-button>
                    `)}
                `)}
                <span class="spacer"></span>
                <pap-button size="icon" variant="clear" color="secondary" type="button" disabled="${off}" aria-label="${this.t("clear")}" title="${this.t("clear")}" @click="${this.handleClear}">
                    <pap-icon name="/icons/spritesheet.svg#trash" aria-hidden="true"></pap-icon>
                </pap-button>
            </div>
            <div part="preview" class="preview" aria-label="${this.t("preview")}" hidden></div>
        `;
    }

    render() {
        // attribute bindings must be the whole value; an empty value removes the attribute
        const off = this.disabled ? "disabled" : "";
        const sendOff = this.disabled || !this.filled ? "disabled" : "";
        const placeholder = this.placeholder ?? this.t("placeholder");

        return html`
            <div part="box" class="box">
                ${this.formatting ? this.renderToolbar() : ""}
                <div class="row">
                    <textarea
                        part="field"
                        rows="1"
                        placeholder="${placeholder}"
                        aria-label="${placeholder}"
                        disabled="${off}"
                        @input="${this.handleInput}"
                        @keydown="${this.handleKeydown}"
                    ></textarea>
                    <div class="actions">
                        <pap-button class="format" size="icon" variant="clear" color="${this.formatting ? "primary" : "secondary"}" type="button" disabled="${off}" aria-pressed="${String(this.formatting)}" aria-label="${this.t("format")}" title="${this.t("format")}" @click="${this.handleFormatting}">
                            <pap-icon name="/icons/spritesheet.svg#format" aria-hidden="true"></pap-icon>
                        </pap-button>
                        <pap-button part="attach" size="icon" variant="clear" color="secondary" type="button" disabled="${off}" aria-label="${this.t("attach")}" title="${this.t("attach")}" @click="${this.handleAttach}">
                            <pap-icon name="/icons/spritesheet.svg#paperclip" aria-hidden="true"></pap-icon>
                        </pap-button>
                        <span class="divider" aria-hidden="true"></span>
                        <pap-button part="send" size="icon" variant="clear" color="primary" type="button" disabled="${sendOff}" aria-label="${this.t("send")}" title="${this.t("send")}" @click="${this.submit}">
                            <pap-icon name="/icons/spritesheet.svg#send" aria-hidden="true"></pap-icon>
                        </pap-button>
                    </div>
                </div>
            </div>
            <pap-file-input multiple tabindex="-1" aria-hidden="true" @change="${this.handlePicked}"></pap-file-input>
        `;
    }
}

declare global {
    interface HTMLElementTagNameMap {
        "pc-composer": Composer;
    }
}
